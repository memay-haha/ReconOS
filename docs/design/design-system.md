---
name: ReconOS Operator Console
colors:
  surface: '#14161c'
  surface-dim: '#0a141e'
  surface-bright: '#303a46'
  surface-container-lowest: '#050f19'
  surface-container-low: '#131c27'
  surface-container: '#17202b'
  surface-container-high: '#212b36'
  surface-container-highest: '#2c3641'
  on-surface: '#d9e3f2'
  on-surface-variant: '#bbc9cd'
  inverse-surface: '#d9e3f2'
  inverse-on-surface: '#28313d'
  outline: '#859397'
  outline-variant: '#3c494c'
  surface-tint: '#2fd9f4'
  primary: '#8aebff'
  on-primary: '#00363e'
  primary-container: '#22d3ee'
  on-primary-container: '#005763'
  inverse-primary: '#006877'
  secondary: '#c4c6d1'
  on-secondary: '#2d3039'
  secondary-container: '#444750'
  on-secondary-container: '#b3b5bf'
  tertiary: '#78f4bb'
  on-tertiary: '#003824'
  tertiary-container: '#5ad7a0'
  on-tertiary-container: '#005b3d'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#a2eeff'
  primary-fixed-dim: '#2fd9f4'
  on-primary-fixed: '#001f25'
  on-primary-fixed-variant: '#004e5a'
  secondary-fixed: '#e0e2ed'
  secondary-fixed-dim: '#c4c6d1'
  on-secondary-fixed: '#181b23'
  on-secondary-fixed-variant: '#444750'
  tertiary-fixed: '#7ef9c0'
  tertiary-fixed-dim: '#60dda6'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#0a141e'
  on-background: '#d9e3f2'
  surface-variant: '#2c3641'
  bg: '#0a0c10'
  surface-2: '#1b1e26'
  surface-3: '#232733'
  border: '#282d38'
  border-strong: '#3a4150'
  fg: '#e7ebf0'
  fg-muted: '#9aa4b2'
  fg-faint: '#6a7483'
  accent-hover: '#5ee0f2'
  accent-ink: '#06222b'
  accent-soft: '#0c2b33'
  accent-soft-bd: '#1b4e5a'
  ring: '#22d3ee66'
  good: '#4ade80'
  good-soft: '#102a1a'
  good-bd: '#1f4f33'
  warn: '#fbbf24'
  warn-soft: '#2c2109'
  warn-bd: '#5a4414'
  crit: '#fb7185'
  crit-soft: '#2c1118'
  crit-bd: '#5c2330'
  info: '#60a5fa'
  info-soft: '#101c33'
  info-bd: '#1f3a63'
  neutral-soft: '#1c2028'
  neutral-bd: '#333a46'
  asset-domain: '#0ea371'
  asset-url: '#3b82f6'
  asset-ip: '#d97706'
  asset-service: '#ec4899'
typography:
  stat-lg:
    fontFamily: IBM Plex Mono
    fontSize: 27px
    fontWeight: '600'
    lineHeight: 32px
  headline-lg:
    fontFamily: IBM Plex Sans
    fontSize: 21px
    fontWeight: '700'
    lineHeight: 28px
  headline-lg-mobile:
    fontFamily: IBM Plex Sans
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 24px
  panel-title:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  body-default:
    fontFamily: IBM Plex Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-code:
    fontFamily: IBM Plex Mono
    fontSize: 12.5px
    fontWeight: '400'
    lineHeight: 18px
  body-code-bold:
    fontFamily: IBM Plex Mono
    fontSize: 12.5px
    fontWeight: '600'
    lineHeight: 18px
  label-caps:
    fontFamily: IBM Plex Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.05em
  caption:
    fontFamily: IBM Plex Sans
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
rounded:
  xs: 0.125rem
  sm: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-dense: 0.75rem
  margin: 1.5rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.125rem
  space-xl: 1.5rem
---

> Khối `colors` trong frontmatter là bản xuất của Stitch, giữ nguyên để nạp lại được vào công cụ. Nguồn màu duy nhất của mã là bảng Token Table ở mục Color Strategy & Roles: chỉ bảng đó sinh ra `frontend/src/styles/globals.css`. Hai nơi khác nhau thì bảng Token Table đúng.

## Brand & Style

This design system delivers a hyper-focused, mission-critical workspace engineered specifically for security analysts, incident responders, and reconnaissance operators. Built on the principles of **technical utilitarianism** and **high-density ergonomics**, the interface discards decorative marketing tropes—such as neon glows, aggressive glassmorphism, or gratuitous gradients—in favor of structural clarity, high data fidelity, and uninterrupted visual stamina during prolonged operations.

The aesthetic blends high-precision technical interfaces with modern tactical software:
- **Calm, High-Contrast Console:** Deep midnight surfaces minimize ocular fatigue, using precise luminescent semantic tokens solely for actionable states.
- **Data-First Utility:** Screen real estate is maximized through tabular alignment, compact line heights, and explicit typographic separation between system UI and technical telemetry (IPs, CIDRs, hashes).
- **Tactical Predictability:** Interactive states respond instantly with micro-transitions (120ms–200ms) and low-elevation physical shifts, reinforcing a rock-solid, low-latency appliance feel.

## Colors

The palette establishes an authoritarian dark environment (`#0a0c10`) punctuated by a singular teal signal accent (`#22d3ee`) for focus, active telemetry, and primary call-to-actions. 

### Color Strategy & Roles
- **Background & Layering:** Visual depth is strictly produced via flat step increments from canvas `bg` (`#0a0c10`) to primary containers `surface` (`#14161c`), secondary controls `surface-2` (`#1b1e26`), and hover/focus targets `surface-3` (`#232733`).
- **Semantic Triads:** Every telemetry state (good, warn, crit, info, neutral) employs a 3-tier system:
  1. Base Foreground / Dot: Bright signal for text, iconography, and status pings.
  2. Soft Container Fill: High-attenuation dark background tint for non-intrusive badge surfaces.
  3. Structural Border: Medium-tint container edge defining perimeter limits without distracting noise.
- **Asset Taxonomy:** Dedicated, non-colliding accents identify technical primitives across the platform:
  - `asset-domain` (`#0ea371`): Domain nodes and root zone records.
  - `asset-url` (`#3b82f6`): HTTP/HTTPS routes and web endpoints.
  - `asset-ip` (`#d97706`): IPv4/IPv6 targets, CIDRs, and routing hops.
  - `asset-service` (`#ec4899`, raised from the mockup's #db2777 to reach 4.5:1 on surface-2): Listening ports, daemons, and fingerprint definitions.
- **Severity Treatment:** 
  - `Critical`: Solid `crit` fill with `surface` text to create unavoidable cognitive urgency.
  - `High`: `crit-soft` fill with `crit` text.
  - `Medium`: `warn-soft` fill with `warn` text.
  - `Low`: `info-soft` fill with `info` text.
  - `Info`: `neutral-soft` fill with `neutral` text.

### Token Table

Script `frontend/scripts/generate-tokens.mjs` đọc bảng này để sinh `frontend/src/styles/globals.css`. Mỗi dòng một token. Khối `@theme` giữ cột `dark` vì các mockup chỉ có theme tối. Cột `light` thành khối ghi đè: dưới `prefers-color-scheme: light` khi `<html>` không có `data-theme="dark"`, và dưới `data-theme="light"`. Cột `light` để trống nghĩa là token không đổi theo theme.

Cột `dark` của các token mới (`*-strong*`, `border-subtle`, `border-raised`, `status-*`, `thumb-*`) lấy đúng hex của mockup, nên theme tối khớp từng pixel. Ba token chữ `fg-faint`, `fg-dim`, `fg-dimmest` là ngoại lệ có chủ ý: hex của mockup (`#6a7483` 3,82, `#64748b` 3,80, `#475569` 2,39 trên `color-surface`) không đạt WCAG 2.1 AA, mà theme tối là mặc định. Giữ nguyên sắc, chỉ nâng độ sáng. Mỗi token đạt 4,5 trên các nền mockup thật sự đặt nó lên: `fg-faint` (947 lần dùng, có mặt trên `surface-3`) đạt trên `bg`, `surface`, `surface-2`, `surface-3`; `fg-dim` trên `bg`, `surface-dim`, `surface-container-low`, `surface-container`; `fg-dimmest` (37/37 lần trên nền `bg`) chỉ trên `bg`. Nhờ vậy bốn bậc `fg-muted`, `fg-faint`, `fg-dim`, `fg-dimmest` ở theme tối cách nhau ΔE 8,34, 5,12 và 4,80, đều trên ngưỡng 2,3 mà mắt phân biệt được.

Cột `light` suy từ cột `dark`, giữ nguyên sắc màu và chỉ đổi độ sáng, độ bão hòa:

- Nền và chữ đổi chiều cho nhau: `bg`, `surface*`, `*-soft` chuyển sang gần trắng, `fg*`, `on-*` chuyển sang tối.
- Màu accent `#22d3ee`, 4 màu trạng thái `good`, `warn`, `crit`, `info` và 4 màu `asset-*` giữ sắc, hạ độ sáng đủ để đạt WCAG 2.1 AA trên nền sáng. Màu `neutral` không có sắc nên chỉ đổi độ sáng.
- Nhóm `*-fixed*` của Material 3 không đổi theo theme nên hai cột bằng nhau.

Test `frontend/src/styles/tokens.test.ts` kiểm tra mọi cặp chữ trên nền trong `PAIRS` của `frontend/src/styles/contrast-pairs.ts`, ở cả hai theme, đạt tỉ lệ tương phản tối thiểu 4,5.

| token | dark | light |
|---|---|---|
| **Colors** | | |
| color-surface | #14161c | #f0f1f4 |
| color-surface-dim | #0a141e | #d7e0ea |
| color-surface-bright | #303a46 | #fbfcfd |
| color-surface-container-lowest | #050f19 | #ffffff |
| color-surface-container-low | #131c27 | #f5f7fa |
| color-surface-container | #17202b | #f0f3f7 |
| color-surface-container-high | #212b36 | #e9edf1 |
| color-surface-container-highest | #2c3641 | #e4e8ec |
| color-on-surface | #d9e3f2 | #141a24 |
| color-on-surface-variant | #bbc9cd | #3b4f54 |
| color-inverse-surface | #d9e3f2 | #29313d |
| color-inverse-on-surface | #28313d | #f0f2f5 |
| color-outline | #859397 | #607176 |
| color-outline-variant | #3c494c | #bfcccf |
| color-surface-tint | #2fd9f4 | #087f91 |
| color-primary | #8aebff | #006675 |
| color-on-primary | #00363e | #ffffff |
| color-primary-container | #22d3ee | #a3eeff |
| color-on-primary-container | #005763 | #00353d |
| color-inverse-primary | #006877 | #8aebff |
| color-secondary | #c4c6d1 | #434656 |
| color-on-secondary | #2d3039 | #ffffff |
| color-secondary-container | #444750 | #e2e4e9 |
| color-on-secondary-container | #b3b5bf | #303340 |
| color-tertiary | #78f4bb | #007041 |
| color-on-tertiary | #003824 | #ffffff |
| color-tertiary-container | #5ad7a0 | #c1f0dc |
| color-on-tertiary-container | #005b3d | #003d29 |
| color-error | #ffb4ab | #bf181d |
| color-on-error | #690005 | #ffffff |
| color-error-container | #93000a | #ffdad6 |
| color-on-error-container | #ffdad6 | #470004 |
| color-primary-fixed | #a2eeff | #a2eeff |
| color-primary-fixed-dim | #2fd9f4 | #2fd9f4 |
| color-on-primary-fixed | #001f25 | #001f25 |
| color-on-primary-fixed-variant | #004e5a | #004e5a |
| color-secondary-fixed | #e0e2ed | #e0e2ed |
| color-secondary-fixed-dim | #c4c6d1 | #c4c6d1 |
| color-on-secondary-fixed | #181b23 | #181b23 |
| color-on-secondary-fixed-variant | #444750 | #444750 |
| color-tertiary-fixed | #7ef9c0 | #7ef9c0 |
| color-tertiary-fixed-dim | #60dda6 | #60dda6 |
| color-on-tertiary-fixed | #002113 | #002113 |
| color-on-tertiary-fixed-variant | #005236 | #005236 |
| color-background | #0a141e | #f4f7fa |
| color-on-background | #d9e3f2 | #141a24 |
| color-surface-variant | #2c3641 | #dfe5ec |
| color-bg | #0a0c10 | #f9f9fb |
| color-surface-2 | #1b1e26 | #e7e9ee |
| color-surface-3 | #232733 | #dcdfe7 |
| color-border | #282d38 | #d2d6df |
| color-border-strong | #3a4150 | #a0a9ba |
| color-fg | #e7ebf0 | #171e26 |
| color-fg-muted | #9aa4b2 | #3f4a5a |
| color-fg-faint | #868e9a | #4c5869 |
| color-fg-dim | #7d8a9e | #566274 |
| color-fg-dimmest | #75808f | #667286 |
| color-accent-hover | #5ee0f2 | #7fe3f7 |
| color-accent-ink | #06222b | #00353d |
| color-accent-soft | #0c2b33 | #e6f5f9 |
| color-accent-soft-bd | #1b4e5a | #a1d7e3 |
| color-ring | #22d3ee66 | #0ea6be66 |
| color-good | #4ade80 | #0c6b2f |
| color-good-soft | #102a1a | #e7f8ee |
| color-good-bd | #1f4f33 | #aee0c3 |
| color-warn | #fbbf24 | #855f00 |
| color-warn-soft | #2c2109 | #fbf2df |
| color-warn-bd | #5a4414 | #e8ce96 |
| color-crit | #fb7185 | #a51d31 |
| color-crit-soft | #2c1118 | #fae5eb |
| color-crit-bd | #5c2330 | #e6a8b6 |
| color-info | #60a5fa | #0f59b3 |
| color-info-soft | #101c33 | #e4ecfb |
| color-info-bd | #1f3a63 | #a5c0e9 |
| color-neutral-soft | #1c2028 | #eaecf0 |
| color-neutral-bd | #333a46 | #c4cad4 |
| color-asset-domain | #0ea371 | #0a7451 |
| color-asset-url | #3b82f6 | #1056c6 |
| color-asset-ip | #d97706 | #975203 |
| color-asset-service | #ec4899 | #b3195e |
| color-border-subtle | #1e2738 | #dde1e8 |
| color-border-raised | #26354d | #b8c0cd |
| color-crit-strong | #f87171 | #b91c1c |
| color-crit-strong-bd | #991b1b | #e8a9a9 |
| color-crit-strong-soft | #450a0a | #fdecec |
| color-warn-strong-bd | #78350f | #e9bd9f |
| color-warn-strong-soft | #451a03 | #fdf0e1 |
| color-status-pink | #f472b6 | #a8286b |
| color-status-violet | #c4b5fd | #5b45c2 |
| color-status-queue | #fb923c | #8f4d08 |
| color-status-targets | #f97316 | #a3400a |
| color-thumb-good | #15231c | #e3f4ea |
| color-thumb-info | #0c2438 | #e0eef9 |
| color-thumb-violet | #1a1726 | #ebe7f7 |
| color-thumb-rose | #221820 | #f7e6ec |
| color-thumb-warm | #241a14 | #f7ece2 |
| color-scrim | rgba(10, 12, 16, 0.64) | rgba(10, 12, 16, 0.64) |
| **Radius** | | |
| radius-xs | 0.125rem |  |
| radius-sm | 0.25rem |  |
| radius-md | 0.375rem |  |
| radius-lg | 0.5rem |  |
| radius-xl | 0.75rem |  |
| radius-full | 9999px |  |
| **Shadows** | | |
| shadow-modal | 0 12px 32px -4px rgba(0, 0, 0, 0.7), 0 4px 12px rgba(0, 0, 0, 0.5) | 0 12px 32px -4px rgba(0, 0, 0, 0.7), 0 4px 12px rgba(0, 0, 0, 0.5) |
| shadow-active-dot | 0 0 6px var(--color-primary-container) | 0 0 6px var(--color-primary) |
| **Blur** | | |
| blur-scrim | 2px |  |
| **Spacing** | | |
| spacing-gutter | 1rem |  |
| spacing-gutter-dense | 0.75rem |  |
| spacing-margin | 1.5rem |  |
| spacing-margin-mobile | 1rem |  |
| spacing-sidebar | 244px |  |
| spacing-space-xs | 0.25rem |  |
| spacing-space-sm | 0.5rem |  |
| spacing-space-md | 0.75rem |  |
| spacing-space-lg | 1.125rem |  |
| spacing-space-xl | 1.5rem |  |
| **Typography** | | |
| font-stat-lg | var(--font-ibm-plex-mono), ui-monospace, SFMono-Regular, monospace |  |
| text-stat-lg | 27px |  |
| text-stat-lg--line-height | 32px |  |
| text-stat-lg--font-weight | 600 |  |
| font-headline-lg | var(--font-ibm-plex-sans), ui-sans-serif, system-ui, sans-serif |  |
| text-headline-lg | 21px |  |
| text-headline-lg--line-height | 28px |  |
| text-headline-lg--font-weight | 700 |  |
| font-headline-lg-mobile | var(--font-ibm-plex-sans), ui-sans-serif, system-ui, sans-serif |  |
| text-headline-lg-mobile | 18px |  |
| text-headline-lg-mobile--line-height | 24px |  |
| text-headline-lg-mobile--font-weight | 700 |  |
| font-panel-title | var(--font-ibm-plex-sans), ui-sans-serif, system-ui, sans-serif |  |
| text-panel-title | 14px |  |
| text-panel-title--line-height | 20px |  |
| text-panel-title--font-weight | 600 |  |
| font-body-default | var(--font-ibm-plex-sans), ui-sans-serif, system-ui, sans-serif |  |
| text-body-default | 13px |  |
| text-body-default--line-height | 18px |  |
| text-body-default--font-weight | 400 |  |
| font-body-code | var(--font-ibm-plex-mono), ui-monospace, SFMono-Regular, monospace |  |
| text-body-code | 12.5px |  |
| text-body-code--line-height | 18px |  |
| text-body-code--font-weight | 400 |  |
| font-body-code-bold | var(--font-ibm-plex-mono), ui-monospace, SFMono-Regular, monospace |  |
| text-body-code-bold | 12.5px |  |
| text-body-code-bold--line-height | 18px |  |
| text-body-code-bold--font-weight | 600 |  |
| font-label-caps | var(--font-ibm-plex-sans), ui-sans-serif, system-ui, sans-serif |  |
| text-label-caps | 11px |  |
| text-label-caps--line-height | 14px |  |
| text-label-caps--font-weight | 600 |  |
| text-label-caps--letter-spacing | 0.05em |  |
| font-caption | var(--font-ibm-plex-sans), ui-sans-serif, system-ui, sans-serif |  |
| text-caption | 11px |  |
| text-caption--line-height | 14px |  |
| text-caption--font-weight | 400 |  |
| text-icon | 17px |  |
| text-micro | 10px |  |
| text-micro--line-height | 14px |  |

## Typography

Typography enforces a strict bifurcated system designed for technical clarity:

1. **Interface Engine (`IBM Plex Sans`):** Used for navigation, page headers, form labels, control triggers, and conversational feedback. It offers crisp legibility in dense matrix environments.
2. **Telemetry & Data Engine (`IBM Plex Mono`):** Non-negotiable for all operational technical data including hostnames, IPs, URIs, hashes, port mappings, command-line arguments, and metrics. All numerical readings must enforce `font-variant-numeric: tabular-nums` to eliminate jitter in real-time streaming counters.

### Typographic Rules
- **Header Balancing:** Large section headers and titles utilize `text-wrap: balance` to prevent orphan tags in narrow panes.
- **Section Headers & Metric Labels:** All metadata headers, table sorting keys, and card categorizers use `label-caps` (`11px`, `600`, uppercase, `0.05em` track).
- **Code Elements:** Inline technical strings must be enclosed in `body-code` with consistent vertical glyph centering.

## Layout & Spacing

The layout is constructed on a strict **4px modular baseline grid**. Density is deliberately high, prioritizing operator throughput and visible payload metrics over airy margins.

### Shell & Structural Geometry
- **Top Bar:** Fixed `56px` height with continuous bottom border `1px solid var(--border)`.
- **Primary Rail/Sidebar:** `244px` expanded width (token `spacing-sidebar`), folding into a `64px` icon rail on command or breakpoint compression.
- **Content Canvas:** Fluid grid bound by responsive inner limits:
  - Standard Card Padding: `18px` (`space-lg`).
  - Table Cell Padding: `10px` vertical, `14px` horizontal.
  - Dashboard Tile Matrix: `12px` to `20px` dynamic gap.

### Responsive Breakpoint Continuum
- **Desktop Ultrawide (≥1280px):** Full 4-column metric galleries and split master-detail consoles active. Margin set to `24px`.
- **Desktop Compact (1060px–1279px):** Metric gallery compresses to 3 columns; sidebars remain docked; 2-column detail panels maintained.
- **Tablet / Split Screen (861px–1059px):** Detail inspector sheets collapse underneath primary feeds into 1 column. Navigation rail collapses to compact mode (`64px`).
- **Operator Mobile (≤860px):** Navigation transitions to off-canvas slideover sheet (`≡` trigger). Header stacks vertically. Filter toolbars compress into popover drawers.
- **Compact Viewport (≤560px):** Margin adjusts to `16px`. Metric clusters drop to 2 columns. Tables, terminal consoles, and segmented filter arrays isolate horizontal scrolling natively (`overflow-x: auto`) with zero viewport-level lateral drift.

## Elevation & Depth

Depth in this system is defined almost exclusively by **tonal layering** and **structural hairline borders**, rejecting luminous shadows and ambient visual haze. This creates an uncompromising operator console aesthetic where surfaces feel physical and precise.

### Layering Hierarchy
1. **Level 0 (Canvas):** `#0a0c10` (Global workspace base).
2. **Level 1 (Docked Containers):** `#14161c` bounded by `1px solid #282d38` (Cards, panels, tabular structures).
3. **Level 2 (Inset Surfaces / Headers):** `#1b1e26` (Table column tracks, input backgrounds, active segmented control track).
4. **Level 3 (Interactive Active States):** `#232733` (Row hover fills, interactive control selections).
5. **Level 4 (Floating Overlays):** `#14161c` flanked by `1px solid #3a4150` with elevation drop:
   - Modals, popovers, and quick-find command palettes take an engineered drop shadow: `0 12px 32px -4px rgba(0, 0, 0, 0.7), 0 4px 12px rgba(0, 0, 0, 0.5)`.
   - The active navigation dot is the one exception to the no-glow rule: it takes `shadow-active-dot`, a 6px blur in the accent (`primary-container`) in the dark theme. The light theme uses `primary`, because `primary-container` is a pale cyan that a glow cannot show against a near-white surface.
   - Modals deploy a scrim overlay of `rgba(10, 12, 16, 0.64)` combined with `backdrop-filter: blur(2px)`, token `blur-scrim`.

### Focus Engine
Every keyboard/interactive focus state requires a high-contrast focus ring: `3px` solid or spread tint using `--ring` (`#22d3ee66`), offset by `1px` from the component edge.

## Shapes

The design uses a restrained, semi-compact curvature language (`roundedness: 2`). This prevents elements from appearing blocky or dated while strictly avoiding consumer-centric bubbly geometries.

### Geometry Standards
Thang bo góc theo Tailwind 4 và khớp từng pixel với mockup trong `docs/design/screens/` (mockup dùng thang Tailwind 3). Mockup `rounded-sm` (2px) thành `rounded-xs` trong ứng dụng, mockup `rounded` trần (4px) thành `rounded-sm`. Từ `md` trở lên hai phiên bản trùng pixel nên giữ tên.
- **Panels, cards, inputs, buttons, badges (`rounded-sm`):** `4px`. Mockup viết `rounded`. Đây là giá trị dùng nhiều nhất.
- **Sub-atomic Targets (`rounded-xs`):** `2px`. Mockup viết `rounded-sm`.
- **Medium Controls (`rounded-md`):** `6px`.
- **Large Containers (`rounded-lg`):** `8px`, dùng cho khối lồng như thẻ tài khoản ở chân sidebar.
- **Modals & Overlays (`rounded-xl`):** `12px`, dùng cho thẻ đăng nhập và bề mặt modal.
- **Pill / Circular:** Strictly reserved for status pings (e.g. live sync dots), binary toggle pills, and count pills.

## Components

Hex trong mục này là giá trị theme tối. Bảng Token Table ở trên là nguồn duy nhất cho cả hai theme: nhiều token có giá trị sáng khác hẳn, ví dụ `accent-ink` tối `#06222b` nhưng sáng `#00353d`, `accent-hover` tối `#5ee0f2` nhưng sáng `#7fe3f7`. Đọc giá trị sáng ở bảng, không suy từ mục này.

### Buttons & Interactive Triggers
- **Primary Button:** Fills with `accent` (`#22d3ee`) coupled with contrasting `accent-ink` (`#06222b`) text and icons at `600` weight. Hover translates to `accent-hover` (`#5ee0f2`). Standard height `36px` (`md`) or `30px` (`sm`).
- **Secondary / Panel Button:** Surface `#14161c` with `1px solid var(--border-strong)`. Text `#e7ebf0`. Hover fill shifts to `surface-2`.
- **Destructive Button:** Tinted `crit-soft` surface with `1px solid var(--crit-bd)` and `crit` text. Active/hover shifts to solid `crit` with `surface` text.

### Inputs & Search Fields
- **Container:** Height `36px`, filled with `surface` (`#14161c`) and outlined by `1px solid var(--border-strong)`. 
- **Typography:** Placeholder utilizes `fg-faint` (`#6a7483`); entered text uses `fg` (`#e7ebf0`). Technical inputs (IPs, Regex, Paths) instantly trigger `IBM Plex Mono`.
- **Focus:** Border transitions to `accent`, emitting a `3px` focus ring using `var(--ring)`.

### Cards & Telemetry Panels
- **Standard Card:** Background `surface` with `1px solid var(--border)`. Internal padding `18px`.
- **Stat Tile:** Features an optional `3px` top line accent keyed to health status (`good`, `warn`, `crit`) or asset class. Large metric values render via `stat-lg` (`IBM Plex Mono`), paired with a top-aligned uppercase label (`label-caps`).

### Badges & Semantic Chips
- **Status Indicators:** Micro-pills rendered with soft tinted fills (`x-soft`), hairline perimeter lines (`x-bd`), and high-readability foregrounds (`x`). Always paired with an icon or numeric code to ensure accessibility.
- **Asset Tags:** Structured inline markers pairing category icons (globe, link, server, terminal) with strict asset colors (`asset-domain`, `asset-url`, `asset-ip`, `asset-service`).

### Data Tables
- **Header:** Sticky row filled with `surface-2`, height `32px`. Text styled via `label-caps` in `fg-muted`.
- **Data Rows:** Standard cell padding `10px 14px`. Bottom border `1px solid var(--border)`. Hover state applies `surface-3` with a zero-jitter background transition.
- **Data Rendering:** URLs, IPs, ports, and timestamps default to `IBM Plex Mono` tabular numerals.

### Checkboxes & Switches
- **Checkbox:** `16px × 16px`, corner radius `4px`. Background `surface`, border `1px solid var(--border-strong)`. Checked state turns solid `accent` with `accent-ink` checkmark.
- **Switch:** Track `34px × 20px`, pill radius. Inactive track `surface-2` with `border-strong`; active track fills `accent`. Handle moves with a fast `120ms` linear slide.