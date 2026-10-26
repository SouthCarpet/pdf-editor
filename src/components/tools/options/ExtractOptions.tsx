// Delta U: reusable Extract options panel.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { parsePageList } from "@/lib/parsePageList";
import { AlertNote, TextField } from "./fields";

const MAX_PAGE_HINT = 100000;

export interface ExtractOptionsValue {
  pageInput: string;
}

// eslint-disable-next-line react-refresh/only-export-components
export const DEFAULT_EXTRACT_OPTIONS: ExtractOptionsValue = {
  pageInput: "1",
};

interface Props {
  value: ExtractOptionsValue;
  onChange: (next: ExtractOptionsValue) => void;
  mode?: "standalone" | "pipeline-node";
}

export function ExtractOptions({ value, onChange }: Props) {
  const { t } = useTranslation("tools");
  const pages = useMemo(() => parsePageList(value.pageInput, MAX_PAGE_HINT), [value.pageInput]);
  const valid = pages !== null && pages.length > 0;
  return (
    <div className="space-y-2">
      <TextField label={t("extract.pages_label")}>
        <Input
          type="text"
          value={value.pageInput}
          onChange={(e) => onChange({ pageInput: e.target.value })}
          placeholder="1,3,5-7"
        />
      </TextField>
      {!valid && value.pageInput.length > 0 && (
        <AlertNote kind="error">{t("extract.invalid_pages")}</AlertNote>
      )}
    </div>
  );
}
