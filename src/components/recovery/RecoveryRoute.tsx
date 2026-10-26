// Thin wrapper that reads `input` from the URL search params and forwards
// it to RecoveryWizard. Kept in its own file so the route file under
// src/routes/tools/unlock/recovery.tsx only exports `Route`.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearch } from "@tanstack/react-router";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/FileDropzone";
import { RecoveryWizard } from "./RecoveryWizard";

export function RecoveryRoute() {
  const { t } = useTranslation("recovery");
  const search = useSearch({ from: "/tools/unlock/recovery" });
  const [input, setInput] = useState<string | null>(search.input ?? null);

  async function pick() {
    const r = await openDialog({
      multiple: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (typeof r === "string") setInput(r);
  }

  if (!input) {
    return (
      <div className="mx-auto max-w-3xl space-y-[var(--space-6)]">
        <h1 className="k-page-title">{t("title")}</h1>
        <p className="text-sm text-[var(--color-text-muted)]">{t("pick_file_description")}</p>
        <FileDropzone multiple={false} onFiles={(p) => p[0] && setInput(p[0])} />
        <Button variant="outline" onClick={pick}>
          {t("choose_file")}
        </Button>
      </div>
    );
  }

  return <RecoveryWizard inputPath={input} />;
}
