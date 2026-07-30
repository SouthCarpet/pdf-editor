# Theme contrast verification

Ratios use the WCAG relative-luminance formula. The automated source of truth
is `src/test/themeContrast.spec.ts`, which reads the light and dark variables
from `src/styles/globals.css` and fails below 4.5:1.

| Token pair | Light | Dark |
| --- | ---: | ---: |
| foreground / background | 18.09:1 | 18.97:1 |
| muted / background | 6.12:1 | 7.85:1 |
| foreground / card | 18.88:1 | 17.18:1 |
| muted / card | 6.39:1 | 7.11:1 |
| control foreground / control | 18.88:1 | 17.18:1 |
| placeholder / control | 4.74:1 | 7.11:1 |
| accent foreground / accent | 6.70:1 | 5.17:1 |
| accent-soft foreground / accent-soft | 8.49:1 | 10.34:1 |
| danger foreground / danger | 6.47:1 | 4.83:1 |
| danger-soft foreground / danger-soft | 6.80:1 | 11.16:1 |
| foreground / drop zone | 18.88:1 | 17.18:1 |
| placeholder / drop zone | 4.74:1 | 7.11:1 |

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
