"""AES-256-GCM for every `_encrypted` column: .claude/rules/security.md.

Stored layout, one `bytea` value:

    version (1 byte) | key id length (1 byte) | key id (ASCII) | nonce (12 bytes) | ciphertext+tag

The key id travels with the ciphertext so a value written under an older key
still decrypts after rotation: docs/ops/configuration.md. The associated data
binds the value to its column (`<table>.<column>`), so a ciphertext copied into
another column fails authentication instead of decrypting there.

Run `python -m app.core.crypto reencrypt` from `backend/` after putting a new
key first in RECONOS_ENCRYPTION_KEYS: it rewrites every value that is not under
the first key.
"""

import asyncio
import base64
import binascii
import os
import re
import sys
from collections.abc import Iterator, Mapping
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Final

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import Column, Table, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings

FORMAT_VERSION: Final = 1
NONCE_BYTES: Final = 12
KEY_BYTES: Final = 32
ENCRYPTED_SUFFIX: Final = "_encrypted"
_KEY_ID = re.compile(r"[A-Za-z0-9_-]{1,64}")

# Fixed messages: none of them may ever carry a key or a plaintext.
_BAD_ENTRY = "entries must look like <id>:<base64 key>"
_BAD_KEY_ID = "key ids must be 1 to 64 characters of A-Z, a-z, 0-9, '_' or '-'"
_DUPLICATE_KEY_ID = "key ids must be unique"
_NOT_BASE64 = "keys must be base64"
_WRONG_LENGTH = "keys must be 256 bits long"
_UNSUPPORTED = "unsupported ciphertext format"
_TRUNCATED = "ciphertext is truncated"
_UNKNOWN_KEY = "ciphertext was written under a key that is not loaded"
_TAMPERED = "ciphertext failed authentication"


class CiphertextError(Exception):
    """A stored value that cannot be decrypted: unknown key, tampered or truncated.

    Not an AppError: it is never the caller's fault, so it reaches the generic
    500 handler. The message never carries key material or plaintext.
    """


@dataclass(frozen=True)
class Keyring:
    primary_id: str
    # repr=False: a keyring printed in a traceback or a log must not leak keys.
    keys: Mapping[str, bytes] = field(repr=False)


def _refuse(reason: str) -> ValueError:
    # The message names the variable and the rule broken, never the value.
    return ValueError(f"RECONOS_ENCRYPTION_KEYS {reason}")


def parse_keyring(raw: str) -> Keyring:
    """Read `<id>:<base64 key>` entries separated by commas. The first one encrypts."""
    keys: dict[str, bytes] = {}
    order: list[str] = []
    for entry in raw.split(","):
        key_id, separator, encoded = entry.strip().partition(":")
        if not separator:
            raise _refuse(_BAD_ENTRY)
        if not _KEY_ID.fullmatch(key_id):
            raise _refuse(_BAD_KEY_ID)
        if key_id in keys:
            raise _refuse(_DUPLICATE_KEY_ID)
        try:
            key = base64.b64decode(encoded, validate=True)
        except (binascii.Error, ValueError) as err:
            raise _refuse(_NOT_BASE64) from err
        if len(key) != KEY_BYTES:
            raise _refuse(_WRONG_LENGTH)
        keys[key_id] = key
        order.append(key_id)
    return Keyring(primary_id=order[0], keys=keys)


@lru_cache(maxsize=1)
def get_keyring() -> Keyring:
    """The process keyring, read once. main.py calls it at startup to fail fast."""
    return parse_keyring(get_settings().encryption_keys.get_secret_value())


def _associated_data(key_id: bytes, context: str) -> bytes:
    return bytes([FORMAT_VERSION]) + key_id + b"\x00" + context.encode("utf-8")


def encrypt(plaintext: str, *, context: str, keyring: Keyring | None = None) -> bytes:
    """Encrypt under the first key with a fresh random 96-bit nonce."""
    ring = keyring or get_keyring()
    key_id = ring.primary_id.encode("ascii")
    nonce = os.urandom(NONCE_BYTES)
    sealed = AESGCM(ring.keys[ring.primary_id]).encrypt(
        nonce, plaintext.encode("utf-8"), _associated_data(key_id, context)
    )
    return bytes([FORMAT_VERSION, len(key_id)]) + key_id + nonce + sealed


def _split(blob: bytes) -> tuple[bytes, bytes, bytes]:
    if len(blob) < 2 or blob[0] != FORMAT_VERSION:
        raise CiphertextError(_UNSUPPORTED)
    end = 2 + blob[1]
    if len(blob) < end + NONCE_BYTES:
        raise CiphertextError(_TRUNCATED)
    return blob[2:end], blob[end : end + NONCE_BYTES], blob[end + NONCE_BYTES :]


def key_id_of(blob: bytes) -> str:
    key_id, _, _ = _split(blob)
    return key_id.decode("ascii", errors="replace")


def decrypt(blob: bytes, *, context: str, keyring: Keyring | None = None) -> str:
    ring = keyring or get_keyring()
    key_id, nonce, sealed = _split(blob)
    key = ring.keys.get(key_id.decode("ascii", errors="replace"))
    if key is None:
        raise CiphertextError(_UNKNOWN_KEY)
    try:
        plain = AESGCM(key).decrypt(nonce, sealed, _associated_data(key_id, context))
    except InvalidTag as err:
        raise CiphertextError(_TAMPERED) from err
    return plain.decode("utf-8")


def encrypted_columns() -> Iterator[tuple[Table, Column[bytes]]]:
    """Every `_encrypted` column of the main database, found by name.

    Found from the model registry rather than listed here, so a module that
    adds an encrypted column later is covered by the rotation without an edit.
    """
    # Imported here: the registry imports every module, which import core.
    from app.core.models import Base

    for table in Base.metadata.sorted_tables:
        for column in table.columns:
            if column.name.endswith(ENCRYPTED_SUFFIX):
                yield table, column


async def reencrypt_all(session: AsyncSession, *, keyring: Keyring | None = None) -> int:
    """Rewrite every value not under the first key. Returns how many changed."""
    ring = keyring or get_keyring()
    changed = 0
    for table, column in encrypted_columns():
        context = f"{table.name}.{column.name}"
        primary_key = next(iter(table.primary_key.columns))
        rows = await session.execute(
            select(primary_key, column).where(column.is_not(None)).with_for_update()
        )
        for row_id, blob in rows.all():
            if key_id_of(blob) == ring.primary_id:
                continue
            fresh = encrypt(
                decrypt(blob, context=context, keyring=ring), context=context, keyring=ring
            )
            await session.execute(
                update(table).where(primary_key == row_id).values({column.name: fresh})
            )
            changed += 1
    return changed


async def _reencrypt_command() -> int:
    from app.core.db import get_engine, session_scope

    # One transaction: a failure halfway leaves every value as it was.
    async with session_scope(get_engine()) as session:
        return await reencrypt_all(session)


if __name__ == "__main__":  # pragma: no cover
    if sys.argv[1:] != ["reencrypt"]:
        sys.exit("usage: python -m app.core.crypto reencrypt")
    count = asyncio.run(_reencrypt_command())
    sys.stdout.write(f"reencrypted {count} values\n")
