import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { ToolDef } from "@/config/tools";

export function ToolTile({ tool }: { tool: ToolDef }) {
  const { t } = useTranslation("common");
  const Icon = tool.icon;
  return (
    // Tool routes are added in later phases (8-12); cast to keep Task 43 typecheck-clean.
    // Phase 17 Task 88: the per-tool class hook (e.g. tool-tile-merge)
    // lets the intro.js onboarding tour target a specific tile.
    <Link
      to={tool.route as never}
      className={`tool-tile-${tool.id} flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3 transition-colors hover:border-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-900`}
    >
      <Icon className="h-8 w-8" />
      <span className="text-center text-sm font-medium">{t(`tools.${tool.i18nKey}`)}</span>
    </Link>
  );
}
