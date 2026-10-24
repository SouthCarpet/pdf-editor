import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

// The file or files picked for a tool, as ruled rows on the paper (no boxes).
export function SelectedFile({ path }: { path: string }) {
  return (
    <p className="truncate border-b border-[var(--color-border)] pb-2" title={path}>
      {path}
    </p>
  );
}

export function SelectedFiles({
  files,
  onRemove,
}: {
  files: string[];
  onRemove: (index: number) => void;
}) {
  const { t } = useTranslation();
  if (files.length === 0) return null;
  return (
    <ul className="border-t border-[var(--color-border)]">
      {files.map((f, i) => (
        <li
          key={`${f}-${i}`}
          className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] py-1"
        >
          <span className="truncate" title={f}>
            {f}
          </span>
          <Button variant="ghost" size="sm" onClick={() => onRemove(i)}>
            {t("delete")}
          </Button>
        </li>
      ))}
    </ul>
  );
}
