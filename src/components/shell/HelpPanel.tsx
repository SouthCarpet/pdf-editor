import { useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronDown, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ShortcutList } from "./ShortcutList";

type TopicId = "open" | "tools" | "save" | "theme" | "update" | "shortcuts";

interface Topic {
  id: TopicId;
  title: string;
  body: string | null;
}

interface HelpPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShowTour: () => void;
}

function matches(topic: Topic, query: string): boolean {
  if (query === "") return true;
  return `${topic.title} ${topic.body ?? ""}`.toLowerCase().includes(query);
}

/**
 * The F1 help panel: a search field and an accordion of topics (Kaliber
 * "App shell" specimen). Radix Dialog gives the focus trap and Escape; the
 * `k-drawer` classes give the look. The shortcut topic lists every shortcut
 * of the workspace, so the sheet is reachable from every screen.
 */
export function HelpPanel({ open, onOpenChange, onShowTour }: HelpPanelProps) {
  const { t } = useTranslation("common");
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  const topics = useMemo<Topic[]>(
    () => [
      { id: "open", title: t("shell.help.open_title"), body: t("shell.help.open_body") },
      { id: "tools", title: t("shell.help.tools_title"), body: t("shell.help.tools_body") },
      { id: "save", title: t("shell.help.save_title"), body: t("shell.help.save_body") },
      { id: "theme", title: t("shell.help.theme_title"), body: t("shell.help.theme_body") },
      { id: "update", title: t("shell.help.update_title"), body: t("shell.help.update_body") },
      { id: "shortcuts", title: t("shell.help.shortcuts_title"), body: null },
    ],
    [t],
  );
  const shown = topics.filter((topic) => matches(topic, needle));

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="k-scrim fixed inset-0 z-50" />
        <DialogPrimitive.Content
          className="k-drawer fixed z-50"
          aria-describedby={undefined}
        >
          <div className="k-drawer-head">
            <DialogPrimitive.Title className="k-dialog-title">{t("shell.help.title")}</DialogPrimitive.Title>
            <DialogPrimitive.Close className="k-x-btn" aria-label={t("shell.help.close")}>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="k-drawer-body">
            <div className="k-field-block">
              <label className="k-field-label" htmlFor="help-search">
                {t("shell.help.search")}
              </label>
              <input
                id="help-search"
                type="search"
                className="k-input border-[var(--color-border-strong)]"
                autoComplete="off"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="k-accordion mt-4">
              {shown.map((topic) => (
                <TopicRow key={topic.id} topic={topic} forceOpen={needle !== ""} />
              ))}
            </div>
            {shown.length === 0 && (
              <p className="k-caption mt-3" role="status">
                {t("shell.help.none")}
              </p>
            )}
          </div>
          <div className="k-drawer-foot">
            <Button variant="outline" onClick={onShowTour}>
              {t("shell.help.show_tour")}
            </Button>
            <DialogPrimitive.Close asChild>
              <Button>{t("close")}</Button>
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function TopicRow({ topic, forceOpen }: { topic: Topic; forceOpen: boolean }) {
  return (
    <details className="k-disclosure" open={forceOpen || undefined}>
      <summary className="k-disclosure-summary">
        {topic.title}
        <ChevronDown className="k-chevron h-3 w-3" aria-hidden="true" />
      </summary>
      <div className="k-disclosure-body">
        {topic.body === null ? <ShortcutList /> : topic.body}
      </div>
    </details>
  );
}
