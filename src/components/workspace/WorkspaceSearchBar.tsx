import { forwardRef } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface Props {
  query: string;
  position: number;
  total: number;
  indexing: boolean;
  onQueryChange: (query: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}

export const WorkspaceSearchBar = forwardRef<HTMLInputElement, Props>(
  (
    { query, position, total, indexing, onQueryChange, onPrevious, onNext, onClose },
    ref,
  ) => {
    const { t } = useTranslation("workspace");
    return (
      <div
        role="search"
        aria-label={t("search.label")}
        aria-busy={indexing}
        className="flex h-12 shrink-0 items-center justify-end gap-1 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2"
      >
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--color-text-muted)]"
            aria-hidden="true"
          />
          <input
            ref={ref}
            data-workspace-search-input
            type="search"
            value={query}
            aria-label={t("search.query")}
            placeholder={t("search.placeholder")}
            onChange={(event) => onQueryChange(event.target.value)}
            className="k-input min-w-0 w-full pl-10"
          />
        </div>
        <span
          role="status"
          className="min-w-16 text-center text-xs tabular-nums text-[var(--color-text-muted)]"
        >
          {position} / {total}
        </span>
        <Button
          type="button"

          variant="ghost"
          className="h-10 w-10 p-0"
          aria-label={t("search.previous")}
          disabled={total === 0}
          onClick={onPrevious}
        >
          <ChevronUp className="size-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"

          variant="ghost"
          className="h-10 w-10 p-0"
          aria-label={t("search.next")}
          disabled={total === 0}
          onClick={onNext}
        >
          <ChevronDown className="size-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"

          variant="ghost"
          className="h-10 w-10 p-0"
          aria-label={t("search.close")}
          onClick={onClose}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
    );
  },
);
WorkspaceSearchBar.displayName = "WorkspaceSearchBar";
