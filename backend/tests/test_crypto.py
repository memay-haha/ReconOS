"""AES-256-GCM for the `_encrypted` columns: .claude/rules/security.md."""

import base64
import os
import uuid
from collections.abc import Awaitable, Callable

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import crypto
from app.core.crypto import CiphertextError, Keyring, decrypt, encrypt, parse_keyring
from app.core.identity import User, UserRole
from app.program.models import Program, Proxy

UserFactory = Callable[..., Awaitable[User]]
CONTEXT = "proxy.url_encrypted"


def _key() -> str:
    return base64.b64encode(os.urandom(32)).decode("ascii")


def _ring(*ids: str) -> Keyring:
    return parse_keyring(",".join(f"{key_id}:{_key()}" for key_id in ids))


def test_round_trip() -> None:
    ring = _ring("k1")
    blob = encrypt("http://user:pass@203.0.113.7:8080", context=CONTEXT, keyring=ring)
    assert decrypt(blob, context=CONTEXT, keyring=ring) == "http://user:pass@203.0.113.7:8080"


def test_ciphertext_carries_the_key_id_and_never_the_plaintext() -> None:
    ring = _ring("primary", "old")
    blob = encrypt("socks5://secretuser:secretpass@proxy.test:1080", context=CONTEXT, keyring=ring)
    assert crypto.key_id_of(blob) == "primary"
    assert b"secret" not in blob


def test_each_encryption_uses_a_fresh_96_bit_nonce() -> None:
    ring = _ring("k1")
    first = encrypt("same", context=CONTEXT, keyring=ring)
    second = encrypt("same", context=CONTEXT, keyring=ring)
    assert first != second
    header = 2 + len(b"k1")
    assert (
        first[header : header + crypto.NONCE_BYTES] != second[header : header + crypto.NONCE_BYTES]
    )
    assert crypto.NONCE_BYTES * 8 == 96


def test_first_key_encrypts_any_key_decrypts() -> None:
    old = _ring("old")
    blob = encrypt("value", context=CONTEXT, keyring=old)
    raw_old = old.keys["old"]
    rotated = Keyring(primary_id="new", keys={"new": os.urandom(32), "old": raw_old})
    assert decrypt(blob, context=CONTEXT, keyring=rotated) == "value"
    assert crypto.key_id_of(encrypt("value", context=CONTEXT, keyring=rotated)) == "new"


def test_unknown_key_id_is_refused() -> None:
    blob = encrypt("value", context=CONTEXT, keyring=_ring("gone"))
    with pytest.raises(CiphertextError):
        decrypt(blob, context=CONTEXT, keyring=_ring("k1"))


def test_ciphertext_is_bound_to_its_column() -> None:
    ring = _ring("k1")
    blob = encrypt("value", context=CONTEXT, keyring=ring)
    with pytest.raises(CiphertextError):
        decrypt(blob, context="engine.api_key_encrypted", keyring=ring)


@pytest.mark.parametrize(
    "mangle",
    [
        lambda blob: blob[:-1] + bytes([blob[-1] ^ 1]),
        lambda blob: b"\x09" + blob[1:],
        lambda blob: blob[:3],
        lambda blob: b"",
        lambda blob: blob[:1] + b"\xff" + blob[2:],
    ],
)
def test_tampered_or_truncated_ciphertext_is_refused(mangle: Callable[[bytes], bytes]) -> None:
    ring = _ring("k1")
    blob = encrypt("value", context=CONTEXT, keyring=ring)
    with pytest.raises(CiphertextError):
        decrypt(mangle(blob), context=CONTEXT, keyring=ring)


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "k1",
        f":{base64.b64encode(os.urandom(32)).decode()}",
        "k1:not-base64!!",
        f"k1:{base64.b64encode(os.urandom(16)).decode()}",
        f"k1:{base64.b64encode(os.urandom(32)).decode()},k1:{base64.b64encode(os.urandom(32)).decode()}",
        f"bad id:{base64.b64encode(os.urandom(32)).decode()}",
        f"{'x' * 65}:{base64.b64encode(os.urandom(32)).decode()}",
    ],
)
def test_malformed_keyring_is_refused_without_echoing_keys(raw: str) -> None:
    with pytest.raises(ValueError, match=r"^RECONOS_ENCRYPTION_KEYS") as caught:
        parse_keyring(raw)
    secret = raw.partition(":")[2]
    if len(secret) > 8:
        assert secret not in str(caught.value)


def test_keyring_tolerates_spaces_around_entries() -> None:
    ring = parse_keyring(f" k2:{_key()} , k1:{_key()} ")
    assert ring.primary_id == "k2"
    assert set(ring.keys) == {"k1", "k2"}


def test_keyring_repr_hides_key_material() -> None:
    ring = _ring("k1")
    assert base64.b64encode(ring.keys["k1"]).decode() not in repr(ring)
    assert str(ring.keys["k1"]) not in repr(ring)


def test_process_keyring_comes_from_settings() -> None:
    crypto.get_keyring.cache_clear()
    ring = crypto.get_keyring()
    assert ring.primary_id in ring.keys
    blob = encrypt("value", context=CONTEXT)
    assert decrypt(blob, context=CONTEXT) == "value"


async def test_reencrypt_moves_every_encrypted_column_to_the_primary_key(
    db_session: AsyncSession, user_factory: UserFactory
) -> None:
    old_raw = os.urandom(32)
    old = Keyring(primary_id="old", keys={"old": old_raw})
    rotated = Keyring(primary_id="new", keys={"new": os.urandom(32), "old": old_raw})
    actor = await user_factory(role=UserRole.ADMIN)
    program = Program(name=f"rotate-{uuid.uuid4()}", bounty_type="bounty", created_by=actor.id)
    db_session.add(program)
    await db_session.flush()
    stale = Proxy(
        program_id=program.id,
        name="stale",
        url_encrypted=encrypt("http://198.51.100.1:3128", context=CONTEXT, keyring=old),
    )
    fresh = Proxy(
        program_id=program.id,
        name="fresh",
        url_encrypted=encrypt("http://198.51.100.2:3128", context=CONTEXT, keyring=rotated),
    )
    db_session.add_all([stale, fresh])
    await db_session.flush()

    changed = await crypto.reencrypt_all(db_session, keyring=rotated)

    assert changed == 1
    result = await db_session.execute(
        select(Proxy.name, Proxy.url_encrypted).where(Proxy.program_id == program.id)
    )
    rows = {row[0]: row[1] for row in result.all()}
    assert crypto.key_id_of(rows["stale"]) == "new"
    assert decrypt(rows["stale"], context=CONTEXT, keyring=rotated) == "http://198.51.100.1:3128"
    assert decrypt(rows["fresh"], context=CONTEXT, keyring=rotated) == "http://198.51.100.2:3128"
    assert await crypto.reencrypt_all(db_session, keyring=rotated) == 0


def test_encrypted_columns_are_discovered_by_name() -> None:
    assert ("proxy", "url_encrypted") in {
        (table.name, column.name) for table, column in crypto.encrypted_columns()
    }
