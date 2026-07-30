# UI theming audit

Scope: `src/` at `4c84b0c`. This is the item 1 audit only; it records the
pre-fix state and does not prescribe a redesign.

## Existing theme path

- `src/styles/globals.css` is the single theme source. Tailwind v4 exposes five
  CSS variables (`background`, `foreground`, `muted`, `border`, and `card`) and
  `.dark` overrides those variables.
- `src/components/ThemeProvider.tsx` owns switching. It adds either `light` or
  `dark` to `<html>`, persists the preference in `localStorage`, and follows
  `prefers-color-scheme` while the preference is `system`.
- `tailwind.config.ts` contains only the content paths; there is no second
  palette or class-based dark-mode configuration.
- Controls currently mix the five variables with literal Tailwind neutral,
  blue, red, amber, green, and white classes. That split is the root cause of
  incomplete dark-mode propagation.

## Interactive-control inventory

Counts exclude test-only controls: 37 native selects in 13 files, 32 raw
buttons in 16 files, 58 native inputs in 21 files plus the shared input
primitive, 2 textareas, 106 shared `Button` uses in 41 files, 34 shared `Input`
uses in 12 files, 2 popovers, and 1 shared dialog use. The Radix `Select` and
`DropdownMenu` primitives exist but currently have no product call sites.

| Record | Locations / count | Current color source | Light contrast | Dark contrast | Native / focus / autofill leak |
| --- | --- | --- | --- | --- | --- |
| Shared `Button` | `components/ui/button.tsx`; 106 uses | Literal neutral/white/red classes; no foreground on outline/ghost | Default 17.93:1; outline inherits 18.88:1 | Default remains near-black on dark; outline can become white text on white (1.00:1) | Focus ring is literal near-black and disappears on dark; no common pressed treatment |
| Raw buttons | 32 in opening, recovery, workspace, tool-option, project, font/color-picker files | Mixed token borders with literal neutral/blue/red/white hover and selected states | Usually readable; blue-500/white selected text is 3.68:1 | Several light-only hover/selected fills and missing explicit foregrounds | Browser reset is inconsistent; many have no common focus-visible ring; visible hit areas range below 40px |
| Shared `Input` | `components/ui/input.tsx`; 34 uses | Literal white, neutral-200/500/950 and near-black ring | Text 18.88:1; placeholder 4.74:1 | White inherited text on white can be 1.00:1; placeholder remains light-only | No `color-scheme`; browser autofill can inject light background/text; file control and focus ring are literal |
| Raw text/number/password inputs | subset of 58 native inputs across tool options, workspace, projects, pipeline, recovery, font picker | Mixed token card/border with plain `border`, `bg-transparent`, or literal neutral classes | Tokened examples pass; unstyled examples depend on UA | Unstyled/light-only examples can render dark foreground on a light UA field or light inherited text on white | Inconsistent UA appearance, focus ring, placeholder, spinner, and autofill behavior |
| Placeholders | 29 explicit placeholders | Shared `Input` uses literal neutral-500; raw inputs often have no placeholder class | Shared value is 4.74:1; raw browser default is not guaranteed | Literal neutral-500 on dark card is 3.93:1 (fails AA); UA defaults vary | Placeholder opacity and color leak from browser on raw inputs |
| Checkbox/radio/range/color inputs | remainder of 58 native inputs plus shared checkbox/slider | Native controls mixed with literal neutral/blue and token borders | Generally visible, but styling is inconsistent | Native accent, track, thumb, and focus treatment can stay light-only | UA appearance is intentionally present but uncoordinated; shared checkbox is 16px with a literal dark border/ring |
| Native selects | 37 in settings, tools/options, scan dialog, and workspace panels | 2 are tokened; many use literal `bg-white border-neutral-200`; others rely on plain `border` | Usually readable; literal white/near-black is 18.88:1 | Literal/UA white background with inherited light text reaches 1.00:1 | `appearance` is not reset, native arrow/chrome leaks, popup follows OS/browser, focus rings vary |
| Radix select primitive | `components/ui/select.tsx`; 0 uses | Entirely literal white/neutral palette | Readable in light mode | Trigger/content can reach 1.00:1 | Custom chevrons exist, but literal focus and surface colors bypass theme |
| Radix dropdown primitive | `components/ui/dropdown-menu.tsx`; 0 uses | Entirely literal white/neutral palette | Readable in light mode | Content can reach 1.00:1 | No native menu leak, but focus/surface states bypass theme |
| Drop-in / browse surface | `components/FileDropzone.tsx` and app-wide overlay in `opening/OpenFilesProvider.tsx` | Token border/card mixed with literal neutral hover border/background; browse button inherits broken outline variant | Muted copy is 4.74:1; browse button passes | Drop copy uses the dark muted token and passes, but the outline browse button can be 1.00:1 | No explicit drop-zone text/background tokens; default copy is a paragraph rather than an input placeholder |
| Panels and dialogs | shared popover/dialog plus scan, recovery, pipeline, settings, workspace panels | Popover is tokened; dialog is literal white/neutral; feature panels mix tokens and light-only neutral/status fills | Most pass; muted text is at least 4.74:1 | Shared dialog can be white-on-white (1.00:1); several light-only panel fills do not switch | Dialog close uses literal ring-offset/focus; portal surfaces need explicit themed foreground |
| Tooltips / floating menus | Radix tooltip dependency has no wrapper/use; popover, font list, select/dropdown content are floating surfaces | Popover tokened; font rows and menu primitives use literal neutral/blue states | Normal copy passes; blue-500/white selected state is 3.68:1 | Literal light menu surfaces and selected states are incomplete | Portal content is outside component ancestry but still receives root variables; focus styles remain inconsistent |
| Global document / autofill | `styles/globals.css` | Only body background/text are tokened | Base pair is 18.10:1 | Base pair is 19.14:1 | No `color-scheme`, root font smoothing, selection, placeholder, or `:-webkit-autofill` theme rules |

## Defect summary before fixes

| Defect class | Audited exposure |
| --- | ---: |
| Native/custom dropdown styling leak | 37 used native selects; 2 unused custom menu primitives are light-only |
| Button inconsistency | 32 raw product buttons plus 1 shared primitive affecting 106 uses |
| Placeholder/drop-zone styling gap | 29 explicit placeholders plus 2 drop surfaces |
| Light/dark incomplete or same-on-same | 7 shared/floating primitives and at least 16 product files contain light-only interactive classes |
| Focus/autofill/native appearance gap | All native control families; no global autofill or `color-scheme` handling |

The worst deterministic pre-fix pair is inherited `#fafafa` text on a literal
`#ffffff` control/dialog background in dark mode: 1.00:1 after rounding. The
common selected blue (`#3b82f6`) with white text is 3.68:1. Both fail WCAG AA
for normal text.
