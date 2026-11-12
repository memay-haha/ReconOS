"""Case table for the G5 scope check: docs/architecture/business-flow.md, section on scope checks.

Every edge case of that section has a row here, for In-Scope and Out-of-Scope.
"""

import pytest

from app.scope.matching import (
    DomainTarget,
    InvalidScopeValueError,
    NetworkTarget,
    Rule,
    RuleType,
    ScopeType,
    UrlTarget,
    Verdict,
    decide,
    parse_rule,
    parse_target,
    rule_matches,
    rule_touches,
)

IN = ScopeType.IN_SCOPE
OUT = ScopeType.OUT_OF_SCOPE
D, W, C, U = RuleType.DOMAIN, RuleType.WILDCARD, RuleType.CIDR, RuleType.URL


def rule(rule_type: RuleType, value: str, scope_type: ScopeType = IN) -> Rule:
    return parse_rule(scope_type, rule_type, value)


# ------------------------------------------------------------ one rule, one target

MATCH_CASES = [
    # Domain: that exact name; a URL whose host is that name.
    (D, "example.com", "example.com", True),
    (D, "example.com", "EXAMPLE.com.", True),
    (D, "example.com", "a.example.com", False),
    (D, "example.com", "example.org", False),
    (D, "example.com", "badexample.com", False),
    (D, "example.com", "https://example.com/any/path", True),
    (D, "example.com", "http://example.com:8080/", True),
    (D, "example.com", "https://a.example.com/", False),
    (D, "example.com", "198.51.100.1", False),
    (D, "example.com", "https://198.51.100.1/", False),
    # Wildcard: every subdomain at any depth, never the apex.
    (W, "*.example.com", "a.example.com", True),
    (W, "*.example.com", "a.b.example.com", True),
    (W, "*.example.com", "example.com", False),
    (W, "*.example.com", "badexample.com", False),
    (W, "*.example.com", "a.example.com.evil.test", False),
    (W, "*.example.com", "https://a.example.com/x", True),
    (W, "*.example.com", "https://example.com/x", False),
    (W, "*.example.com", "198.51.100.1", False),
    # CIDR: an IP inside the range; a CIDR target only when wholly inside.
    (C, "198.51.100.0/24", "198.51.100.7", True),
    (C, "198.51.100.0/24", "198.51.101.7", False),
    (C, "198.51.100.0/24", "198.51.100.0/25", True),
    (C, "198.51.100.0/24", "198.51.100.0/24", True),
    (C, "198.51.100.0/24", "198.51.100.0/23", False),
    (C, "198.51.100.0/24", "https://198.51.100.7/", True),
    (C, "198.51.100.0/24", "https://198.51.101.7/", False),
    (C, "198.51.100.7", "198.51.100.7", True),
    (C, "2001:db8::/32", "2001:db8::1", True),
    (C, "2001:db8::/32", "https://[2001:db8::1]:8443/", True),
    (C, "2001:db8::/32", "198.51.100.7", False),
    (C, "198.51.100.0/24", "2001:db8::1", False),
    (C, "198.51.100.0/24", "::ffff:198.51.100.7", True),
    (C, "198.51.100.0/24", "https://[::ffff:198.51.100.7]/", True),
    # No DNS lookup: a domain target never matches a CIDR rule.
    (C, "198.51.100.0/24", "example.com", False),
    (C, "198.51.100.0/24", "https://example.com/", False),
    # URL: same scheme, host, port, and a path that starts with the rule's path.
    (U, "https://example.com/api/", "https://example.com/api/", True),
    (U, "https://example.com/api/", "https://example.com/api/v1/users?id=1", True),
    (U, "https://example.com/api/", "https://example.com/admin", False),
    (U, "https://example.com/api/", "https://example.com/api", False),
    (U, "https://example.com/api/", "http://example.com/api/", False),
    (U, "https://example.com/api/", "https://example.com:8443/api/", False),
    (U, "https://example.com/api/", "https://example.com:443/api/x", True),
    (U, "https://example.com/api/", "https://a.example.com/api/", False),
    (U, "https://example.com/api/", "HTTPS://Example.COM/api/x", True),
    (U, "https://example.com/api/", "example.com", False),
    (U, "https://example.com/api/", "198.51.100.7", False),
    (U, "https://example.com", "https://example.com/anything", True),
    (U, "http://198.51.100.7:8080/", "http://198.51.100.7:8080/x", True),
    # Path tricks are resolved before the prefix test.
    (U, "https://example.com/api/", "https://example.com/api/../admin", False),
    (U, "https://example.com/api/", "https://example.com/api/./v1/../v2", True),
    (U, "https://example.com/api/", "https://example.com/%61pi/x", True),
    (U, "https://example.com/api/", "https://example.com/api/%2e%2e/admin", False),
    (U, "https://example.com/api/", "https://example.com/api/x/..", True),
    (U, "https://example.com/api/", "https://example.com/api/x/.", True),
    (U, "https://example.com/api/", "https://example.com/../../api/x", True),
    (U, "https://example.com/api/", "https://example.com/api/%c3%a9", True),
]


@pytest.mark.parametrize(("rule_type", "value", "target", "expected"), MATCH_CASES)
def test_in_scope_rule_matches(
    rule_type: RuleType, value: str, target: str, expected: bool
) -> None:
    assert rule_matches(rule(rule_type, value), parse_target(target)) is expected


@pytest.mark.parametrize(("rule_type", "value", "target", "expected"), MATCH_CASES)
def test_decide_with_one_in_scope_rule(
    rule_type: RuleType, value: str, target: str, expected: bool
) -> None:
    assert decide([rule(rule_type, value)], target).allowed is expected


@pytest.mark.parametrize(("rule_type", "value", "target", "expected"), MATCH_CASES)
def test_out_of_scope_rule_wins_over_in_scope(
    rule_type: RuleType, value: str, target: str, expected: bool
) -> None:
    """Out-of-Scope beats an In-Scope rule that admits everything of the target's kind."""
    allow_all = [
        rule(W, "*.example.com"),
        rule(D, "example.com"),
        rule(C, "0.0.0.0/0"),
        rule(C, "::/0"),
        rule(U, "https://example.com/"),
        rule(U, "https://a.example.com/"),
        rule(U, "http://example.com/"),
    ]
    decision = decide([*allow_all, rule(rule_type, value, OUT)], target)
    if expected:
        assert decision.verdict is Verdict.OUT_OF_SCOPE_MATCH
        assert decision.rule_value == rule(rule_type, value).value


# ------------------------------------------------------------ Out-of-Scope reading

TOUCH_CASES = [
    # A CIDR target with part of its range excluded is refused as a whole.
    (C, "198.51.100.128/25", "198.51.100.0/24", True),
    (C, "198.51.100.0/24", "198.51.100.0/23", True),
    (C, "198.51.100.0/24", "198.51.100.7", True),
    (C, "198.51.101.0/24", "198.51.100.0/24", False),
    (C, "2001:db8::/48", "2001:db8::/32", True),
    (C, "2001:db8::/48", "198.51.100.0/24", False),
    # Other forms read the same as In-Scope.
    (D, "example.com", "example.com", True),
    (W, "*.example.com", "example.com", False),
    (U, "https://example.com/admin/", "https://example.com/admin/x", True),
]


@pytest.mark.parametrize(("rule_type", "value", "target", "expected"), TOUCH_CASES)
def test_out_of_scope_rule_touches(
    rule_type: RuleType, value: str, target: str, expected: bool
) -> None:
    assert rule_touches(rule(rule_type, value, OUT), parse_target(target)) is expected


def test_partly_excluded_cidr_target_is_refused() -> None:
    rules = [rule(C, "198.51.100.0/24"), rule(C, "198.51.100.128/25", OUT)]
    assert decide(rules, "198.51.100.0/24").verdict is Verdict.OUT_OF_SCOPE_MATCH
    assert decide(rules, "198.51.100.0/25").allowed
    assert decide(rules, "198.51.100.200").verdict is Verdict.OUT_OF_SCOPE_MATCH


def test_cidr_target_split_over_two_in_scope_rules_is_refused() -> None:
    rules = [rule(C, "198.51.100.0/25"), rule(C, "198.51.100.128/25")]
    assert decide(rules, "198.51.100.0/24").verdict is Verdict.NO_IN_SCOPE_MATCH


def test_wildcard_in_and_apex_out() -> None:
    rules = [rule(W, "*.example.com"), rule(D, "admin.example.com", OUT)]
    assert decide(rules, "a.example.com").allowed
    assert decide(rules, "admin.example.com").verdict is Verdict.OUT_OF_SCOPE_MATCH
    assert decide(rules, "https://admin.example.com/").verdict is Verdict.OUT_OF_SCOPE_MATCH
    assert decide(rules, "example.com").verdict is Verdict.NO_IN_SCOPE_MATCH


def test_url_out_of_scope_does_not_exclude_the_domain_target() -> None:
    """A URL rule names part of a host, so it only ever matches URL targets."""
    rules = [rule(D, "example.com"), rule(U, "https://example.com/admin/", OUT)]
    assert decide(rules, "example.com").allowed
    assert decide(rules, "https://example.com/admin/").verdict is Verdict.OUT_OF_SCOPE_MATCH
    assert decide(rules, "https://example.com/admin/../api").allowed


# ------------------------------------------------------------ decision


def test_no_rules_refuses_everything() -> None:
    decision = decide([], "example.com")
    assert decision.verdict is Verdict.NO_IN_SCOPE_MATCH
    assert decision.target == "example.com"
    assert decision.rule_value is None


def test_only_out_of_scope_rules_refuse_everything() -> None:
    assert decide([rule(D, "example.org", OUT)], "example.com").verdict is (
        Verdict.NO_IN_SCOPE_MATCH
    )


def test_decision_reports_first_in_scope_rule_and_canonical_target() -> None:
    rules = [rule(D, "example.org"), rule(W, "*.example.com"), rule(D, "a.example.com")]
    decision = decide(rules, "A.Example.com.")
    assert decision.allowed
    assert decision.target == "a.example.com"
    assert decision.rule_value == "*.example.com"


def test_out_of_scope_found_after_in_scope_still_wins() -> None:
    rules = [rule(D, "example.com"), rule(D, "example.com", OUT)]
    assert decide(rules, "example.com").verdict is Verdict.OUT_OF_SCOPE_MATCH


INVALID_TARGETS = [
    "",
    "x" * 2049,
    " example.com",
    "example.com\n",
    "exa mple.com",
    "ex\x00ample.com",
    "ex\x7fample.com",
    "bücher.example",
    "*.example.com",
    "*",
    "example..com",
    ".example.com",
    "-a.example.com",
    "a-.example.com",
    "a" * 64 + ".example.com",
    ("a" * 63 + ".") * 4 + "com",
    "example.123",
    "127.1",
    "2130706433",
    "0x7f.0.0.1",
    "010.0.0.1",
    "198.51.100.7/24",
    "198.51.100.0/33",
    "fe80::1%eth0",
    "example.com:8080",
    "ftp://example.com/",
    "javascript://example.com/",
    "https://user:pw@example.com/",
    "https://example.com@evil.test/",
    "https:///path",
    "https://example.com:0/",
    "https://example.com:99999/",
    "https://[2001:db8::1/",
    "https://*.example.com/",
    "https://127.1/",
    "https://example.com/a\\b",
    "https://example.com/a%2Fb",
    "https://example.com/a%5cb",
    "https://example.com/a%zz",
    "https://example.com/a%2",
]


@pytest.mark.parametrize("target", INVALID_TARGETS)
def test_unreadable_target_is_refused(target: str) -> None:
    with pytest.raises(InvalidScopeValueError):
        parse_target(target)
    allow_all = [rule(C, "0.0.0.0/0"), rule(C, "::/0"), rule(W, "*.com")]
    decision = decide(allow_all, target)
    assert decision.verdict is Verdict.INVALID_TARGET
    assert not decision.allowed
    assert decision.target is None


CANONICAL_TARGETS = [
    ("Example.COM.", "example.com"),
    ("xn--bcher-kva.example", "xn--bcher-kva.example"),
    ("_dmarc.example.com", "_dmarc.example.com"),
    ("198.51.100.7", "198.51.100.7"),
    ("198.51.100.0/24", "198.51.100.0/24"),
    ("2001:DB8::1", "2001:db8::1"),
    ("::ffff:198.51.100.7", "198.51.100.7"),
    ("::ffff:198.51.100.0/120", "198.51.100.0/24"),
    ("HTTPS://Example.com:443", "https://example.com/"),
    ("http://example.com:8080/a/./b/../c?q=1#frag", "http://example.com:8080/a/c?q=1"),
    ("https://[2001:db8::1]:8443/x", "https://[2001:db8::1]:8443/x"),
    ("https://[::ffff:198.51.100.7]/", "https://198.51.100.7/"),
    ("https://example.com/%7euser/%3f", "https://example.com/~user/%3F"),
]


@pytest.mark.parametrize(("raw", "canonical"), CANONICAL_TARGETS)
def test_target_canonical_form(raw: str, canonical: str) -> None:
    assert str(parse_target(raw)) == canonical


def test_target_kinds() -> None:
    assert isinstance(parse_target("example.com"), DomainTarget)
    assert isinstance(parse_target("198.51.100.7"), NetworkTarget)
    assert isinstance(parse_target("https://example.com/"), UrlTarget)


# ------------------------------------------------------------ rule values

RULE_VALUES = [
    (D, "Example.com.", "example.com"),
    (W, "*.Example.com", "*.example.com"),
    (C, "198.51.100.0/24", "198.51.100.0/24"),
    (C, "198.51.100.7", "198.51.100.7"),
    (C, "2001:DB8::/32", "2001:db8::/32"),
    (U, "HTTPS://Example.com/api/", "https://example.com/api/"),
    (U, "https://example.com", "https://example.com/"),
    (U, "http://example.com:8080/a/../b/", "http://example.com:8080/b/"),
]


@pytest.mark.parametrize(("rule_type", "raw", "canonical"), RULE_VALUES)
def test_rule_canonical_value(rule_type: RuleType, raw: str, canonical: str) -> None:
    assert rule(rule_type, raw).value == canonical


INVALID_RULES = [
    (D, ""),
    (D, "*.example.com"),
    (D, "https://example.com/"),
    (D, "198.51.100.7"),
    (D, "example.com:443"),
    (D, "exa mple.com"),
    (W, "example.com"),
    (W, "*example.com"),
    (W, "*.*.example.com"),
    (W, "a.*.example.com"),
    (W, "*.198.51.100.0"),
    (W, "*.https://example.com"),
    (W, "*."),
    (C, "example.com"),
    (C, "198.51.100.7/24"),
    (C, "198.51.100.0/33"),
    (U, "example.com/api/"),
    (U, "ftp://example.com/"),
    (U, "https://example.com/api/?x=1"),
    (U, "https://example.com/api/#x"),
    (U, "https://user@example.com/"),
    (U, "https://example.com/a%2fb/"),
]


@pytest.mark.parametrize(("rule_type", "raw"), INVALID_RULES)
def test_invalid_rule_value_is_refused(rule_type: RuleType, raw: str) -> None:
    with pytest.raises(InvalidScopeValueError) as caught:
        parse_rule(IN, rule_type, raw)
    assert caught.value.code
