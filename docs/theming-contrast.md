# Theme contrast verification

Ratios use the WCAG relative-luminance formula. The automated source of truth
is `src/test/themeContrast.spec.ts`. Since Kaliber r4 (plan 119 K1) it reads
`src/styles/tokens.css` (oklch) and the alias block of `src/styles/globals.css`,
converts to sRGB and fails below 4.5:1. The ratios below are the K1 state; the
older table (hex values of the pre-r4 theme) is gone.

| Token pair | Light | Dark |
| --- | ---: | ---: |
| foreground / background | 16.75:1 | 16.53:1 |
| muted / background | 8.20:1 | 10.95:1 |
| foreground / card | 18.46:1 | 15.31:1 |
| muted / card | 9.04:1 | 10.15:1 |
| control foreground / control | 18.46:1 | 15.31:1 |
| placeholder / control | 9.04:1 | 10.15:1 |
| accent foreground / accent | 7.75:1 | 9.31:1 |
| accent-soft foreground / accent-soft | 9.93:1 | 10.54:1 |
| danger foreground / danger | 6.29:1 | 6.95:1 |
| danger text / background | 5.77:1 | 6.77:1 |
| danger-soft foreground / danger-soft | 5.36:1 | 5.89:1 |
| warning text / background | 5.48:1 | 8.44:1 |
| warning text / card | 6.04:1 | 7.82:1 |
| warning foreground / warning | 4.84:1 | 8.67:1 |
| warning-soft foreground / warning-soft | 16.19:1 | 14.28:1 |
| success text / background | 5.07:1 | 8.03:1 |
| success-soft foreground / success-soft | 16.44:1 | 14.09:1 |
| foreground / drop zone | 18.46:1 | 15.31:1 |
| placeholder / drop zone | 9.04:1 | 10.15:1 |

`warning text` is an app-level role (`--color-warning-text` in the alias
block of `globals.css`). Light is `oklch(0.5 0.12 70)`; dark is the Kaliber
`warning` token itself, so dark keeps its ratio. Warning text (a short line or
a heading) uses this role. The Kaliber `warning` token (4.44:1 on the light
paper, 8.44:1 on the dark paper) stays for icons, borders and fills, which
need 3:1 only. The test pins the role at 4.5:1 or more on the paper and on a
card, in both themes.

## Worst offenders

Measured on the K1 fix head (2026-10-24), lowest ratio over both themes:

| Surface | Ratio |
| --- | ---: |
| warning (token) as a border or icon on the light paper, 3:1 rule, not text | 4.44:1 |
| warning foreground on a warning fill, light | 4.84:1 |
| success text on the light paper | 5.07:1 |
| focus ring on the light paper, 3:1 rule, not text | 5.24:1 |
| danger-soft foreground on danger-soft, light | 5.36:1 |

Every normal-text pair in the table above meets WCAG AA (4.5:1) in both
modes. Focus indicators use the `focus` token (`oklch(0.5 0.1 235)` light,
`oklch(0.72 0.1 235)` dark) and are non-text, so they need 3:1; they sit at
5.24:1 / 7.85:1 on the paper.

## History

Before Kaliber r4 (until 2026-10-23) the focus colours were `#2563eb` light
and `#60a5fa` dark. The older "Worst offenders" table (white-on-white inputs
1.00:1, blue-500 selected control 3.68:1, dark placeholder 3.78:1) described
that hex theme and no longer applies. K1 round 1 also pinned a known gap of
4.44:1 for warning text on the light paper; the warning text role closed it.
