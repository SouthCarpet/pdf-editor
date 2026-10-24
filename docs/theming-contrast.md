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
| warning foreground / warning | 4.84:1 | 8.67:1 |
| warning-soft foreground / warning-soft | 16.19:1 | 14.28:1 |
| success text / background | 5.07:1 | 8.03:1 |
| success-soft foreground / success-soft | 16.44:1 | 14.09:1 |
| foreground / drop zone | 18.46:1 | 15.31:1 |
| placeholder / drop zone | 9.04:1 | 10.15:1 |

Known gap: `warning` as text on the light paper is 4.44:1 (dark: 8.44:1). The
token is a Kaliber token, so the decision belongs to the design tree. The
test pins the gap (above 4.3 and below 4.5) and fails when the token changes.

## Worst offenders

| Surface | Before | After |
| --- | ---: | ---: |
| Dark outline button, input, select, or dialog with inherited light text on literal white | 1.00:1 | 17.18:1 |
| White text on the former blue-500 selected control | 3.68:1 | 6.70:1 light / 5.17:1 dark |
| Placeholder on a dark card | 3.78:1 | 7.11:1 |
| Light placeholder on a control | 4.74:1 | 4.74:1 (retained at AA threshold) |

All audited normal-text pairs now meet WCAG AA in both modes. Focus indicators
use `focus` tokens (`#2563eb` light and `#60a5fa` dark) and are not evaluated
as text/background pairs.
