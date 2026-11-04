# Task 1 report: colour map

Commit: 44e9192 (branch fe-a-nen-tang-va-sua-sai). Nothing under frontend/src/app or frontend/src/components changed.

## Measurement (reproduced, dark values of globals.css)
52 distinct hex, 973 uses.
- Exact token value: 11 hex, 246 uses (matches your note).
- Within dE 5 of a same-role token: 15 hex, 427 uses (matches).
- Needs new token: 26 hex, 300 uses (matches).
The numbers match your note. The map ends up 10 / 15 / 27 because of one deliberate deviation (below).

## Deviation from rule 1: #d97706
It equals the dark `asset-ip` exactly, but all 4 uses are the border of the amber "12" warning badge (bg #451a03, text #fbbf24, border #d97706/30). `border-asset-ip` on a warning badge would be wrong by role, so it is mapped to the new `warn-strong-bd` with #78350f and #b45309, which are the same badge with other border alphas (/50, /40, /30). Revert is one line in colour-map.json if you prefer strict rule 1.

## New tokens (17), proposed dark value = most-used source hex
| Token | Value | Source hex (uses) | Role / why collapsed |
|---|---|---|---|
| fg-dim | #64748b | 64748b (78) | secondary meta text. dE 5.03 from fg-faint, so rule 3 puts it here. It is practically fg-faint; Task 2 may fold it into fg-faint |
| fg-dimmest | #475569 | 475569 (37) | nav group headings (RECON, OPERATIONS) |
| crit-strong | #f87171 | f87171 (25) | text, per brief |
| crit-strong-bd | #991b1b | 991b1b (28) | border, per brief |
| crit-strong-soft | #450a0a | 450a0a (24) | bg, per brief |
| warn-strong-bd | #78350f | 78350f (5), d97706 (4), b45309 (1) | one amber badge, three alpha variants of the border |
| warn-strong-soft | #451a03 | 451a03 (12) | amber badge bg |
| border-subtle | #1e2738 | 1e2738 (50), 1a2130 (16) | divider step; dE 3.1 apart. 1a2130 is always used at /60 |
| border-raised | #26354d | 26354d (7), 26354a, 2a374e, 243046 (1 each) | icon-tile and hover border; all within dE 3.2 |
| thumb-good | #15231c | 15231c | s06 capture thumbnail backdrop |
| thumb-info | #0c2438 | 0c2438 | same, dE 5.75 from info-soft so not folded |
| thumb-violet | #1a1726 | 1a1726 | same |
| thumb-rose | #221820 | 221820, 22181c | same, dE 2.9 apart |
| thumb-warm | #241a14 | 241a14, 221c17, 221c10 | same, within dE 4.5 of each other |
| status-orange | #fb923c | fb923c, f97316 | s06 status-strip icon. dE 17 apart: collapsed on role only (both orange icons in one strip). Judgement call, visible shade change on 2 uses |
| status-violet | #c4b5fd | c4b5fd | s06 status-strip icon |
| status-pink | #f472b6 | f472b6 | s06 status-strip icon (dE 24.6 from asset-service, not folded) |

The eight thumb-* backdrops and three status-* icons all live in s06-screenshot-gallery. They are per-item decoration, so Task 2 could instead give them one token set or drop the colour.

## Rule 1 and 2 mapping highlights
- #22d3ee (127 uses, mixed bg/text/border) -> `primary-container` (equal value; `ring` also equals it, alpha dropped by the reader).
- #4ade80 -> good, #fb7185 -> crit, #fbbf24 -> warn, #e7ebf0 -> fg, #9aa4b2 -> fg-muted, #14161c -> surface, #1b1e26 -> surface-2, #282d38 -> border, #06222b -> accent-ink.
- dE <= 5: 94a3b8 -> fg-muted, 161d2b/161d2a -> surface-container-low, 1e2430 -> border, e2e8f0 and f1f5f9 -> fg, 121620 -> surface-dim, 0c0e14 -> bg, 1a2333/142630/14232c/16212b/182030/1a2233 -> surface-container, 1a1c23 -> surface-2.

## Implementation notes
- Test first: wrote colour-audit.test.ts, ran it, saw it fail on the missing module, then implemented.
- Extra beyond the brief: `colour-audit.d.mts` (types for the .mjs, same pattern as generate-tokens.d.mts); `darkTokenValues(css)` exported (reads the `:root[data-theme="dark"]` block, strips `color-` and alpha); `main()` runs only when invoked directly; vitest.config.ts `include` extended with `scripts/**/*.test.ts` (it only matched src/**, so the test in scripts/ would never run); `// @vitest-environment node` on the test.
- `darkTokenValues` reads the data-theme="dark" block. After Task 2 flips the theme, that block may change; update `main()` then.

## Verification
- `pnpm --dir frontend test colour-audit`: 8 passed.
- Full `pnpm --dir frontend test`: 217 passed, 1 failed. The failure is src/components/sidebar.test.tsx (expects "Raw Outputs" and "Audit Log" in NAV_ITEMS). It fails identically on the branch without my changes (checked with git stash): pre-existing, not touched.
- `pnpm lint` clean, `tsc --noEmit` clean, prettier applied.

## Fix report (review round)

### Important 1: status-orange split
Changed colour-map.json: `#fb923c` -> `status-queue`, `#f97316` -> `status-targets` (queue icon and targets icon in the s06 status strip, dE 17.0 apart). `status-orange` is gone, so the new-token count stays 17 + 1 = 18 hex-role tokens below. Covered by test "keeps the three amber badge borders as separate tokens" (last assertion).

### Important 2: warn-strong-bd, verified path taken, merge removed
Found in the mockups: `#78350f` /40 x3, /50 x2; `#b45309` /30 x1; `#d97706` /30 x3, /40 x1. All sit on the badge background `#451a03` (10 of 10 sit beside it). Composited over `#451a03`:
- d97706/30 = #713604, d97706/40 = #803f04, 78350f/40 = #592508, 78350f/50 = #5f2809, b45309/30 = #662b05
- dE: d97706/30 vs d97706/40 6.4; d97706/30 vs 78350f/40 13.2; d97706/30 vs 78350f/50 10.7; d97706/30 vs b45309/30 6.7; d97706/40 vs 78350f/40 19.5; b45309/30 vs 78350f/40 7.1; b45309/30 vs 78350f/50 4.5; 78350f/40 vs /50 2.7.
Only the two 78350f alphas are within 5 of each other. The one-badge-three-alphas argument does not hold, so I did not merge. New tokens: `warn-strong-bd` (#78350f), `warn-strong-bd-mid` (#b45309), `warn-strong-bd-bright` (#d97706). Task 2 may collapse them once rendered output is visible; note it must also choose the alpha, since mockups apply /30 to /50. Covered by the same test (size 3).

### Hardening
- Stale key test: "has no stale key that no mockup uses any more" (passes, no stale key today).
- Regex now also matches `divide-[#...]` and `accent-[#...]` (divide counts as border, accent as bg). Test "collects colours written through divide and accent utilities" writes a temp mockup dir and asserts both hex values are found.

### Output
- `pnpm test colour-audit`: Tests 11 passed (11)
- `pnpm test`: Test Files 25 passed (25), Tests 234 passed (234)
- `pnpm lint`: eslint clean. `tsc --noEmit`: no output.

## Fix report (second review round)

### Amber badge border collapsed to one token
Changed colour-map.json: `#78350f`, `#b45309` and `#d97706` all map to `warn-strong-bd` (value `#78350f`, the most used: 5 uses against 4 and 1). This normalises a mockup inconsistency: one amber warning badge border (on bg `#451a03`) drawn with three base hexes at /30 to /50 across s02, s04, s05, s08, s09, s10, s12, s17, s20. It absorbs `#d97706` and `#b45309`. Visible consequence: the border changes on the four `#d97706` uses and the one `#b45309` use (composited it is dE 10.7 to 13.2 from the `#78350f` result for d97706 and 7.1 for b45309). `warn-strong-bd-mid` and `warn-strong-bd-bright` are gone. Covered by test "draws the amber warning badge border with one token". `status-queue` and `status-targets` stay split (test "keeps two different status icons as two tokens").

### Names test strengthened
New test "names new tokens by role, never by appearance": for every token not already in globals.css, no name segment may be mid, bright, dark, light, pale or deep, and no name may end in a digit. Existing tokens (surface-2, surface-bright) are exempt. `-strong` stays allowed.

### ROLE_OF_TOKEN
`status-*` added to text, `thumb-*` to bg, and `crit-strong` / `warn-strong` to text (regex `^(crit|warn)-strong$`, so `border-strong` is not captured; my first attempt with `endsWith('-strong')` broke an existing test and was corrected).

### Output
- `pnpm test colour-audit`: Tests 13 passed (13)
- Full `pnpm test`: 241 passed, 5 failed. All 5 are in files other agents are editing right now and have not committed (pagination.test.tsx, login-form.test.tsx, user-table.test.tsx: Vietnamese-format and Retry-After expectations). None touches scripts/. Lint clean, tsc clean.
