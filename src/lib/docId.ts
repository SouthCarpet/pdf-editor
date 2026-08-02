// Route-param encoding for /workspace/$docId.
//
// The param arrives PERCENT-ENCODED. A comment in WorkspaceRoute used to assert
// the opposite ("TanStack params are decoded by the router, so we don't need
// decodeURIComponent"), and that assertion was the bug reported 2026-08-02:
// openDocument received the literal string "C%3A%5CUsers%5C..." and correctly
// reported file_not_found for a path that does not exist.
//
// It survived because every working entry point - the file picker, drag and
// drop - hands loadAndRegister an absolute path without ever crossing the
// router. The one entry point that did cross it, the recent-files list, was
// rendered as plain text with no click handler. The two defects hid each other:
// the only route that would have exposed the decode bug was unreachable.
//
// Lives here rather than in the component so it can be tested without importing
// WorkspaceRoute, which pulls in pdfjs and needs a DOM canvas.

/** Inverse of `encodeURIComponent`, safe on input that was never encoded. */
export function decodeDocId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    // decodeURIComponent throws URIError on a lone "%" that is not a valid
    // escape sequence, and a Windows path can legitimately contain one
    // ("100% done.pdf"). Trading file_not_found for an uncaught crash would be
    // a worse bug than the one this fixes.
    return raw;
  }
}
