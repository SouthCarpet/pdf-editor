// Workspace route. `$docId` is the path param — for now we accept the
// raw file path (URL-encoded) or the sentinel "new" which pops a file
// picker. Once the user has picked, we call `open_document` to register
// the file in recent_files + verify metadata, then mount <Workspace>.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { commands } from "@/bindings";
import { Workspace } from "@/components/workspace/Workspace";
import { usePdfDocument } from "@/hooks/usePdfDocument";
import { useDocuments } from "@/stores/documentStore";

export const Route = createFileRoute("/workspace/$docId")({
  component: WorkspaceRoute,
});

function WorkspaceRoute() {
  const { docId } = Route.useParams();
  const navigate = useNavigate();
  const addDoc = useDocuments((s) => s.add);
  const [path, setPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Resolve docId → absolute file path. "new" triggers the picker; anything
  // else is treated as the URL-encoded path (TanStack params are decoded
  // automatically, so `decodeURIComponent` is not needed here).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (docId === "new") {
        const picked = await openDialog({
          multiple: false,
          directory: false,
          filters: [{ name: "PDF", extensions: ["pdf"] }],
        });
        if (cancelled) return;
        if (!picked) {
          navigate({ to: "/" });
          return;
        }
        const absolute = typeof picked === "string" ? picked : picked;
        await loadAndRegister(absolute);
        if (cancelled) return;
        // Replace history so the back button doesn't re-trigger the picker.
        navigate({
          to: "/workspace/$docId",
          params: { docId: encodeURIComponent(absolute) },
          replace: true,
        });
      } else {
        await loadAndRegister(docId);
      }
    })().catch((err) => {
      if (!cancelled) setError(String(err?.message ?? err));
    });
    return () => {
      cancelled = true;
    };

    async function loadAndRegister(p: string) {
      const opened = await commands.openDocument(p);
      if (opened.status === "error") throw opened.error;
      const doc = opened.data;
      addDoc({
        id: doc.path,
        path: doc.path,
        pageCount: doc.page_count,
        dirty: false,
      });
      if (!cancelled) setPath(doc.path);
    }
  }, [docId, navigate, addDoc]);

  const pdfDoc = usePdfDocument(path);

  if (error) {
    return (
      <div className="p-6 text-red-600">Failed to open document: {error}</div>
    );
  }
  if (!path || !pdfDoc) {
    return <div className="p-6 text-[var(--color-muted)]">Loading…</div>;
  }
  return <Workspace pdf={pdfDoc.pdf} />;
}
