// Route-component for /workspace/$docId. Lives separately from the
// TanStack `Route = createFileRoute(...)` definition so the route file
// only exports the `Route` object (keeps React Refresh / Fast Refresh
// happy: the warning fires when a route file mixes route exports with
// any other component).
//
// Phase 11 Task 62: read the optional `?tool=` search param so the
// dashboard can land directly on a specific workspace tool (Crop in
// this commit, Organize/Extract/Compare in later Phase 11 commits).
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { commands } from "@/bindings";
import { usePdfDocument } from "@/hooks/usePdfDocument";
import { useDocuments } from "@/stores/documentStore";
import { useWorkspace } from "@/stores/workspaceStore";
import { Workspace } from "./Workspace";

export function WorkspaceRoute() {
  const { docId } = useParams({ from: "/workspace/$docId" });
  const search = useSearch({ from: "/workspace/$docId" });
  const navigate = useNavigate();
  const addDoc = useDocuments((s) => s.add);
  const setTool = useWorkspace((s) => s.setTool);
  const [path, setPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Apply the tool search param exactly once on first mount.
  useEffect(() => {
    if (search.tool) setTool(search.tool);
  }, [search.tool, setTool]);

  // Resolve docId → absolute file path. "new" triggers the picker; anything
  // else is the URL-encoded absolute path (TanStack params are decoded by
  // the router, so we don't need decodeURIComponent here).
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
          search,
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
  }, [docId, navigate, addDoc, search]);

  const pdfDoc = usePdfDocument(path);

  if (error) {
    return (
      <div className="p-6 text-red-600">Failed to open document: {error}</div>
    );
  }
  if (!path || !pdfDoc) {
    return <div className="p-6 text-[var(--color-muted)]">Loading…</div>;
  }
  return <Workspace pdf={pdfDoc.pdf} path={path} />;
}
