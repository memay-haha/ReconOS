"""Scope matching, the G5 check: docs/architecture/business-flow.md, section on scope checks.

Pure functions with no database access, so the job module, the dispatcher and
the asset module all decide the same way. Every parser here refuses what it
cannot read with certainty: a value that is neither a clean domain, wildcard,
IP, CIDR nor URL raises InvalidScopeValueError instead of being guessed at, because a
guess is how a target slips past an Out-of-Scope rule.

Normalisation decisions, written down in business-flow.md:
- Hostnames are ASCII only. An internationalised name is entered in its
  punycode form (`xn--...`), so the name checked here is byte for byte the name
  a tool resolves. Converting Unicode here would pick one IDNA flavour while the
  tool may use another and reach a different host.
- Hostnames are lowercased and lose one trailing dot.
- An IPv4-mapped IPv6 address or network is checked as the IPv4 it carries.
- A URL path is compared after RFC 3986 normalisation: unreserved
  percent-escapes decoded, dot segments removed. A path holding `%2F`, `%5C` or
  a backslash is refused: servers disagree on whether those split segments.
"""

import ipaddress
import re
from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum
from urllib.parse import SplitResult, urlsplit

type Network = ipaddress.IPv4Network | ipaddress.IPv6Network

MAX_TARGET_LENGTH = 2048
_HOSTNAME_MAX = 253
_LABEL = re.compile(r"^(?!-)[a-z0-9_-]{1,63}(?<!-)$")
_ALL_DIGITS = re.compile(r"^[0-9]+$")
_PERCENT = re.compile(r"%([0-9A-Fa-f]{2})")
_BAD_PERCENT = re.compile(r"%(?![0-9A-Fa-f]{2})")
_UNRESERVED = frozenset("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
_DEFAULT_PORT = {"http": 80, "https": 443}
_IPV4_MAPPED = ipaddress.IPv6Network("::ffff:0:0/96")


class ScopeType(StrEnum):
    IN_SCOPE = "in_scope"
    OUT_OF_SCOPE = "out_of_scope"


class RuleType(StrEnum):
    DOMAIN = "domain"
    WILDCARD = "wildcard"
    CIDR = "cidr"
    URL = "url"


class InvalidScopeValueError(ValueError):
    """A rule value or a target that cannot be read without guessing.

    The argument is a short snake_case reason code, safe to return to a client.
    """

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


# ---------------------------------------------------------------- values


@dataclass(frozen=True)
class DomainTarget:
    name: str

    def __str__(self) -> str:
        return self.name


@dataclass(frozen=True)
class NetworkTarget:
    """A single IP is a network of one address."""

    network: Network

    def __str__(self) -> str:
        if self.network.num_addresses == 1:
            return str(self.network.network_address)
        return str(self.network)


@dataclass(frozen=True)
class UrlTarget:
    scheme: str
    host: str
    host_ip: ipaddress.IPv4Address | ipaddress.IPv6Address | None
    port: int
    path: str
    # Kept only to rebuild the canonical string; never compared.
    query: str = ""

    def __str__(self) -> str:
        host = f"[{self.host}]" if isinstance(self.host_ip, ipaddress.IPv6Address) else self.host
        netloc = host if self.port == _DEFAULT_PORT[self.scheme] else f"{host}:{self.port}"
        query = f"?{self.query}" if self.query else ""
        return f"{self.scheme}://{netloc}{self.path}{query}"


@dataclass(frozen=True)
class WildcardTarget:
    """`*.<base>`: every subdomain of `base`, not `base` itself.

    Only a tool module with `accepts_wildcard` runs it, on the base domain.
    """

    base: str

    def __str__(self) -> str:
        return f"*.{self.base}"


type Target = DomainTarget | NetworkTarget | UrlTarget | WildcardTarget


@dataclass(frozen=True)
class Rule:
    scope_type: ScopeType
    rule_type: RuleType
    # DomainTarget for domain and wildcard (the base after `*.`), NetworkTarget
    # for cidr, UrlTarget for url. Never a WildcardTarget.
    subject: DomainTarget | NetworkTarget | UrlTarget

    @property
    def value(self) -> str:
        """Canonical text of the rule, the form stored in scope_rule.value."""
        if self.rule_type is RuleType.WILDCARD:
            return f"*.{self.subject}"
        return str(self.subject)


# ---------------------------------------------------------------- parsing


def _check_text(raw: str) -> str:
    if not raw or len(raw) > MAX_TARGET_LENGTH:
        raise InvalidScopeValueError("invalid_length")
    if not raw.isascii():
        raise InvalidScopeValueError("not_ascii")
    if any(ch.isspace() or ord(ch) < 0x20 or ord(ch) == 0x7F for ch in raw):
        raise InvalidScopeValueError("control_character")
    return raw


def _parse_hostname(raw: str) -> str:
    name = raw.lower()
    if name.endswith("."):
        name = name[:-1]
    labels = name.split(".")
    if not name or len(name) > _HOSTNAME_MAX or not all(_LABEL.match(label) for label in labels):
        raise InvalidScopeValueError("invalid_domain")
    # An all-digit last label is an IP shorthand like `127.1` or `2130706433`,
    # which resolvers read as an address: never treat it as a name.
    if _ALL_DIGITS.match(labels[-1]):
        raise InvalidScopeValueError("invalid_domain")
    return name


def _unmap(network: Network) -> Network:
    if isinstance(network, ipaddress.IPv6Network) and network.subnet_of(_IPV4_MAPPED):
        mapped = int(network.network_address) & 0xFFFFFFFF
        return ipaddress.IPv4Network((mapped, network.prefixlen - 96))
    return network


def _parse_network(raw: str) -> Network:
    # A zone index (`fe80::1%eth0`) names an interface of the scanning host,
    # not a target.
    if "%" in raw:
        raise InvalidScopeValueError("invalid_ip")
    try:
        # strict: `198.51.100.7/24` has host bits set, an ambiguous intent.
        return _unmap(ipaddress.ip_network(raw, strict=True))
    except ValueError as err:
        raise InvalidScopeValueError("invalid_ip") from err


def _looks_like_ip(raw: str) -> bool:
    return ":" in raw or bool(re.match(r"^[0-9./]+$", raw))


def _normalise_path(path: str) -> str:
    if "\\" in path or _BAD_PERCENT.search(path):
        raise InvalidScopeValueError("invalid_path")

    def decode(match: re.Match[str]) -> str:
        char = chr(int(match.group(1), 16))
        if char in _UNRESERVED:
            return char
        if char in "/\\":
            raise InvalidScopeValueError("encoded_slash")
        return f"%{match.group(1).upper()}"

    decoded = _PERCENT.sub(decode, path) or "/"
    # RFC 3986 section 5.2.4: resolve `.` and `..` so `/api/../admin` is `/admin`.
    output: list[str] = []
    segments = decoded.split("/")
    for index, segment in enumerate(segments):
        last = index == len(segments) - 1
        if segment == ".":
            if last:
                output.append("")
        elif segment == "..":
            if len(output) > 1:
                output.pop()
            if last:
                output.append("")
        else:
            output.append(segment)
    return "/".join(output) or "/"


def _split_url(raw: str) -> SplitResult:
    try:
        parts = urlsplit(raw)
        port = parts.port
    except ValueError as err:
        raise InvalidScopeValueError("invalid_url") from err
    if parts.scheme.lower() not in _DEFAULT_PORT:
        raise InvalidScopeValueError("unsupported_scheme")
    # Credentials have no place in a target, and `user@host` is a classic way
    # to make a reader see the wrong host.
    if "@" in parts.netloc:
        raise InvalidScopeValueError("credentials_in_url")
    if port == 0:
        raise InvalidScopeValueError("invalid_port")
    return parts


def _parse_url(raw: str) -> UrlTarget:
    parts = _split_url(raw)
    scheme = parts.scheme.lower()
    host_text = parts.hostname or ""
    host_ip: ipaddress.IPv4Address | ipaddress.IPv6Address | None = None
    if parts.netloc.startswith("[") or _looks_like_ip(host_text):
        network = _parse_network(host_text)
        host_ip = network.network_address
        host = str(host_ip)
    else:
        host = _parse_hostname(host_text)
    return UrlTarget(
        scheme=scheme,
        host=host,
        host_ip=host_ip,
        port=parts.port or _DEFAULT_PORT[scheme],
        path=_normalise_path(parts.path),
        query=parts.query,
    )


def _parse_wildcard_base(text: str, code: str) -> str:
    """The base of `*.<base>`, read like a domain. `code` names any other shape."""
    if not text.startswith("*.") or "*" in text[2:]:
        raise InvalidScopeValueError(code)
    base = text[2:]
    if "://" in base or _looks_like_ip(base):
        raise InvalidScopeValueError(code)
    return _parse_hostname(base)


def parse_target(raw: str) -> Target:
    """Read a job target: a domain, a wildcard `*.<domain>`, an IP, a CIDR or an http(s) URL."""
    text = _check_text(raw)
    if "://" in text:
        return _parse_url(text)
    if "*" in text:
        # Same reading as a wildcard rule, so `*.x` as a target and as a rule
        # name the same set of hosts.
        return WildcardTarget(_parse_wildcard_base(text, "wildcard_target"))
    if _looks_like_ip(text):
        return NetworkTarget(_parse_network(text))
    return DomainTarget(_parse_hostname(text))


def parse_rule(scope_type: ScopeType, rule_type: RuleType, raw: str) -> Rule:
    """Read a rule value of the given form, refusing a value of another form."""
    text = _check_text(raw)
    subject: DomainTarget | NetworkTarget | UrlTarget
    match rule_type:
        case RuleType.DOMAIN:
            if "://" in text or "*" in text or _looks_like_ip(text):
                raise InvalidScopeValueError("wrong_rule_form")
            subject = DomainTarget(_parse_hostname(text))
        case RuleType.WILDCARD:
            subject = DomainTarget(_parse_wildcard_base(text, "wrong_rule_form"))
        case RuleType.CIDR:
            if not _looks_like_ip(text):
                raise InvalidScopeValueError("wrong_rule_form")
            subject = NetworkTarget(_parse_network(text))
        case _:  # RuleType.URL, the last of the four forms
            if "://" not in text:
                raise InvalidScopeValueError("wrong_rule_form")
            url = _parse_url(text)
            # A rule names a path prefix: a query or fragment would be ignored
            # silently, so it is refused instead.
            if url.query or urlsplit(text).fragment:
                raise InvalidScopeValueError("query_in_rule")
            subject = url
    return Rule(scope_type=scope_type, rule_type=rule_type, subject=subject)


# ---------------------------------------------------------------- matching


def _is_subdomain(name: str, base: str) -> bool:
    return name.endswith(f".{base}")


def _host_of(target: DomainTarget | NetworkTarget | UrlTarget) -> DomainTarget | NetworkTarget:
    if isinstance(target, UrlTarget):
        if target.host_ip is not None:
            return NetworkTarget(ipaddress.ip_network(target.host_ip))
        return DomainTarget(target.host)
    return target


def _under_or_equal(name: str, base: str) -> bool:
    return name == base or _is_subdomain(name, base)


def _wildcard_relates(rule: Rule, target: WildcardTarget, *, whole: bool) -> bool:
    """A wildcard target `*.b` against one rule.

    In-Scope (`whole`): only a wildcard rule `*.a` with b equal to or under a
    holds every host of `*.b`. A domain or URL rule names single hosts, a CIDR
    rule addresses, so none of them covers an unknown set of subdomains.

    Out-of-Scope: the target is refused when the rule names any host of the
    run, apex included, since the engine starts from the base domain and
    probes it too (G5).
    """
    subject = rule.subject
    if isinstance(subject, NetworkTarget):
        return False
    host = _host_of(subject)
    if not isinstance(host, DomainTarget):
        return False  # a URL rule on an IP host
    if rule.rule_type is RuleType.WILDCARD:
        if whole:
            return _under_or_equal(target.base, host.name)
        return _under_or_equal(target.base, host.name) or _is_subdomain(host.name, target.base)
    return not whole and _under_or_equal(host.name, target.base)


def _network_relation(rule: Network, target: Network, *, whole: bool) -> bool:
    # Pairs of one IP version only: ipaddress refuses to compare across versions.
    if isinstance(rule, ipaddress.IPv4Network) and isinstance(target, ipaddress.IPv4Network):
        return target.subnet_of(rule) if whole else target.overlaps(rule)
    if isinstance(rule, ipaddress.IPv6Network) and isinstance(target, ipaddress.IPv6Network):
        return target.subnet_of(rule) if whole else target.overlaps(rule)
    return False


def _relates(rule: Rule, target: Target, *, whole: bool) -> bool:
    """`whole`: the whole target lies inside the rule. Otherwise any overlap counts."""
    if isinstance(target, WildcardTarget):
        return _wildcard_relates(rule, target, whole=whole)
    subject = rule.subject
    if isinstance(subject, UrlTarget):
        return (
            isinstance(target, UrlTarget)
            and target.scheme == subject.scheme
            and target.host == subject.host
            and target.port == subject.port
            and target.path.startswith(subject.path)
        )
    host = _host_of(target)
    if isinstance(subject, NetworkTarget):
        return isinstance(host, NetworkTarget) and _network_relation(
            subject.network, host.network, whole=whole
        )
    if not isinstance(host, DomainTarget):
        # No DNS lookup: a domain or wildcard rule never covers an IP target.
        return False
    if rule.rule_type is RuleType.WILDCARD:
        return _is_subdomain(host.name, subject.name)
    return host.name == subject.name


def rule_matches(rule: Rule, target: Target) -> bool:
    """In-Scope reading: the whole target lies inside the rule."""
    return _relates(rule, target, whole=True)


def rule_touches(rule: Rule, target: Target) -> bool:
    """Out-of-Scope reading: any part of the target lies inside the rule.

    Differs from rule_matches for a CIDR target, where one excluded address is
    enough to refuse the whole range, and for a wildcard target, where one
    excluded host under it, or its base domain, is enough.
    """
    return _relates(rule, target, whole=False)


class Verdict(StrEnum):
    IN_SCOPE = "in_scope"
    INVALID_TARGET = "invalid_target"
    NO_IN_SCOPE_MATCH = "no_in_scope_match"
    OUT_OF_SCOPE_MATCH = "out_of_scope_match"


@dataclass(frozen=True)
class ScopeDecision:
    verdict: Verdict
    # Canonical form of the target, None when it could not be read.
    target: str | None = None
    # Value of the deciding rule: the first In-Scope match when allowed, the
    # first Out-of-Scope match when excluded.
    rule_value: str | None = None

    @property
    def allowed(self) -> bool:
        return self.verdict is Verdict.IN_SCOPE


def decide(rules: Iterable[Rule], raw_target: str) -> ScopeDecision:
    """Valid when the target matches one In-Scope rule and touches no Out-of-Scope rule."""
    try:
        target = parse_target(raw_target)
    except InvalidScopeValueError:
        return ScopeDecision(Verdict.INVALID_TARGET)
    canonical = str(target)
    in_match: Rule | None = None
    for rule in rules:
        if rule.scope_type is ScopeType.OUT_OF_SCOPE:
            if rule_touches(rule, target):
                return ScopeDecision(Verdict.OUT_OF_SCOPE_MATCH, canonical, rule.value)
        elif in_match is None and rule_matches(rule, target):
            in_match = rule
    if in_match is None:
        return ScopeDecision(Verdict.NO_IN_SCOPE_MATCH, canonical)
    return ScopeDecision(Verdict.IN_SCOPE, canonical, in_match.value)
