// Phase 17 Task 87 - Last session restore prompt.
//
// On mount, list the persisted SessionSlot rows. If any exist, surface
// a small banner with Restore / Discard. Restore navigates to the
// workspace route for the saved document; Discard wipes the table.
//
// v1 supports a single slot (slot = 0). Multi-tab restore is a
// follow-up that fans this banner into a slot picker.
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { commands, type SessionSlot } from "@/bindings";

export function SessionRestorePrompt() {
  const { t } = useTranslation("common");
  const [slots, setSlots] = useState<SessionSlot[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    commands
      .sessionList()
      .then((r) => {
        if (r.status === "ok" && r.data.length > 0) setSlots(r.data);
      })
      .catch(() => {
        // Silent: the prompt is a convenience, not a critical path.
      });
  }, []);

  if (dismissed || slots.length === 0) return null;

  async function restore() {
    const first = slots[0];
    if (!first) return;
    // The workspace route accepts a doc path on the URL; encode the
    // saved path so it round-trips Windows backslashes and spaces.
    setDismissed(true);
    navigate({
      to: "/workspace/$docId",
      params: { docId: encodeURIComponent(first.doc_path) },
    }).catch(() => {});
  }

  async function discard() {
    setDismissed(true);
    await commands.sessionClear().catch(() => {});
  }

  return (
    <div role="alert" className="k-alert k-alert--info mx-4 mt-2">
      <Info className="k-alert-icon h-4 w-4" aria-hidden="true" />
      <p className="k-alert-body">
        {t("session.restore_prompt", {
          count: slots.length,
          defaultValue: `Restore last session? (${slots.length} document${slots.length === 1 ? "" : "s"})`,
        })}
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="default" onClick={restore}>
          {t("session.restore", { defaultValue: "Restore" })}
        </Button>
        <Button size="sm" variant="outline" onClick={discard}>
          {t("session.discard", { defaultValue: "Discard" })}
        </Button>
      </div>
    </div>
  );
}