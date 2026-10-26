# Theme contrast verification

Ratios use the WCAG relative-luminance formula. The automated source of truth
is `src/test/themeContrast.spec.ts`. Since Kaliber r4 (plan 119 K1) it reads
`src/styles/tokens.css` (oklch) and the app roles in `src/styles/globals.css`,
converts to sRGB and fails below 4.5:1. The ratios below are the K1 state, with the dark column recomputed on 2026-10-24 for the darker neutrals; the
older table (hex values of the pre-r4 theme) is gone.
Toolbar selected and hover rows were measured for K5 on 2026-10-25.

| Token pair | Light | Dark |
| --- | ---: | ---: |
| text / background | 16.75:1 | 17.11:1 |
| text-muted / background | 8.20:1 | 11.34:1 |
| text-muted / selected surface (toolbar) | 5.33:1 | 4.78:1 |
| text-muted / hover surface (toolbar) | 8.08:1 | 9.80:1 |
| text / surface-raised | 18.46:1 | 16.11:1 |
| text-muted / surface-raised | 9.04:1 | 10.68:1 |
| text / field-surface | 18.46:1 | 16.11:1 |
| text-muted / field-surface | 9.04:1 | 10.68:1 |
| on-accent / accent | 7.75:1 | 9.31:1 |
| accent-soft-foreground / accent-soft | 9.93:1 | 10.54:1 |
| on-accent / danger | 6.29:1 | 6.95:1 |
| danger / background | 5.77:1 | 7.01:1 |
| danger / danger-soft | 5.36:1 | 5.89:1 |
| warning text / background | 5.48:1 | 8.73:1 |
| warning text / surface-raised | 6.04:1 | 8.22:1 |
| on-accent / warning | 4.84:1 | 8.67:1 |
| text / warning-soft | 16.19:1 | 14.28:1 |
| success / background | 5.07:1 | 8.31:1 |
| text / success-soft | 16.44:1 | 14.09:1 |
| text / surface-raised | 18.46:1 | 16.11:1 |
| text-muted / surface-raised | 9.04:1 | 10.68:1 |

On-page marks always use the light values through `.paper-light`, guarded by the drift test in `paperScope.test.tsx`.

`warning text` is an app-level role (`--color-warning-text` in
`globals.css`). Light is `oklch(0.5 0.12 70)`; dark is the Kaliber
`warning` token itself, so dark keeps its ratio. Warning text (a short line or
a heading) uses this role. The Kaliber `warning` token (4.44:1 on the light
paper, 8.73:1 on the dark paper) stays for icons, borders and fills, which
need 3:1 only. The test pins the role at 4.5:1 or more on the paper and on a
card, in both themes.

## Worst offenders

Styles use Kaliber role names directly. The native select chevron keeps its
light and dark SVG values as `--app-select-chevron`.

The app-local `--color-field-surface` names the native field and autofill
background. `--color-control` keeps the shared Kaliber control edge. This
keeps unchecked switches visible without changing the field text ratios.

Workspace toolbar labels use the muted text role at regular weight. The
normal, selected and hover backgrounds all keep at least 4.5:1 contrast.

Measured on the K1 fix head (2026-10-24), with the K5 toolbar pair added
on 2026-10-25. Lowest ratios over both themes:

| Surface | Ratio |
| --- | ---: |
| warning (token) as a border or icon on the light paper, 3:1 rule, not text | 4.44:1 |
| muted toolbar text on the selected surface, dark | 4.78:1 |
| warning foreground on a warning fill, light | 4.84:1 |
| success text on the light paper | 5.07:1 |
| focus ring on the light paper, 3:1 rule, not text | 5.24:1 |
| danger-soft foreground on danger-soft, light | 5.36:1 |

Every normal-text pair in the table above meets WCAG AA (4.5:1) in both
modes. Focus indicators use the `focus` token (`oklch(0.5 0.1 235)` light,
`oklch(0.72 0.1 235)` dark) and are non-text, so they need 3:1; they sit at
5.24:1 / 8.13:1 on the paper.

## History

Before Kaliber r4 (until 2026-10-23) the focus colours were `#2563eb` light
and `#60a5fa` dark. The older "Worst offenders" table (white-on-white inputs
1.00:1, blue-500 selected control 3.68:1, dark placeholder 3.78:1) described
that hex theme and no longer applies. K1 round 1 also pinned a known gap of
4.44:1 for warning text on the light paper; the warning text role closed it.

On 2026-10-24 the shared Kaliber dark neutrals became darker (background L 0.145, card L 0.185). The dark column and the dark focus ratio above were recomputed from the new tokens. The light column and the worst offenders (all light) did not change.
