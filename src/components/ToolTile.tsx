import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { ToolDef } from "@/config/tools";

// A tool is a link, so it is a plain row on the paper: icon and name, a fill
// step on hover. No card, border or tile (R24, slop catalog SLOP-LAYOUT-01).
export function ToolTile({ tool }: { tool: ToolDef }) {
  const { t } = useTranslation("common");
  const Icon = tool.icon;
  return (
    // Tool routes are added in later phases (8-12); cast to keep Task 43 typecheck-clean.
    // Phase 17 Task 88: the per-tool class hook (e.g. tool-tile-merge)
    // lets the intro.js onboarding tour target a specific tile.
    <Link
      to={tool.route as never}
      className={`tool-tile-${tool.id} k-list-item flex min-h-[var(--control-h)] items-center gap-3 rounded-md px-3 py-2 no-underline`}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="k-list-title">{t(`tools.${tool.i18nKey}`)}</span>
    </Link>
  );
}
