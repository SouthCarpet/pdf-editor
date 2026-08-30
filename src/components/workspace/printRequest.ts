export const WORKSPACE_PRINT_REQUEST_EVENT = "pdf-editor:workspace-print-request";

export interface WorkspacePrintRequestDetail {
  docId: string;
}

export function requestWorkspacePrint(docId: string): void {
  window.dispatchEvent(
    new CustomEvent<WorkspacePrintRequestDetail>(WORKSPACE_PRINT_REQUEST_EVENT, {
      detail: { docId },
    }),
  );
}
