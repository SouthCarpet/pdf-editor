# /gen-test Follow-up Targets

Phase 18 Task 90m. Each module below is a high-risk surface that warrants
deep, bug-revealing tests beyond the smoke + property coverage already in
place. We've deferred actual `/gen-test` invocation here (slow,
high-context) and scaffolded the queue instead — each entry is a future
issue stub.

The `/gen-test` skill produces tests that are "hard to fake-pass and
capable of exposing real defects". When you run it on one of these
targets, prune false positives and commit the surviving tests under the
matching `__tests__` or `tests/` directory.

## Targets

| Module | Why it's high risk | What to ask /gen-test |
|---|---|---|
| `src-tauri/src/services/pdf_editor.rs` | Merge/split/extract/reorder with synthetic vs real PDFs diverge — off-by-one + empty-input bugs hide here. The Phase 18 proptest already documents that synthetic-PDF merge produces 0-page output (real bug). | "Generate tests that exercise empty inputs, single-page inputs, duplicate inputs, out-of-range page indexes, and pages that don't exist." |
| `src-tauri/src/error.rs` | Hand-rolled `Serialize` + manual `specta::Type` impl — easy to break the `{key, data}` envelope without noticing. | "Generate property tests verifying the serialized shape is always `{key: string, data: object}` for every variant, including round-trip through serde_json." |
| `src-tauri/src/services/ocr_engine.rs` | `OCR_SIDECAR_THRESHOLD = 10` page boundary is a classic off-by-one. The routing decision today is hardcoded to always-sidecar; if the in-process path ever lands, the boundary needs exhaustive coverage. | "Generate tests for the routing decision at N=0, 1, 9, 10, 11, 100 pages and assert which path is taken." |
| `src-tauri/src/sidecars/manager.rs` | Async race conditions in cancellation + timeout + stderr-tail-500. The Phase 18 security_test covers the bound but doesn't exercise concurrent cancel-during-spawn or timeout-during-stderr-drain. | "Generate tests that race cancellation against process spawn and against stderr collection; verify no resource leaks." |
| `src-tauri/src/sidecars/qpdf.rs` | Unlock error mapping (Type A vs Type B vs invalid pw vs corrupt). Brittle: any change in qpdf exit codes shifts the mapping. | "Generate tests for every exit code qpdf is documented to emit, asserting the AppError variant." |
| `src-tauri/src/services/image_to_pdf.rs` | Image-crate trap zone: huge images, alpha channels, monochrome, non-square pixels, CMYK. | "Generate tests for each ImageFormat variant + each ColorType, including 1×1 and 100k×1 dimensions." |
| `src-tauri/src/persistence/recent_files.rs` | UPSERT on duplicate path — SQL conflict resolution is easy to break under concurrent writes. | "Generate tests that hammer recent_files_upsert from multiple tasks and assert the table converges to one row per path." |
| `src/lib/parsePageList.ts` | "1,3,5-7" parser. Frontend input validation; already has tests but no fuzz coverage. | "Generate fuzz-style tests with malformed, very-long, and Unicode inputs; assert no thrown exceptions." |
| `src/stores/jobsStore.ts` | Concurrent transitions between pending/running/done/error/cancelled. Map-based store invariants. | "Generate tests that interleave start, update, finish, fail, cancel on the same id; assert final state is deterministic." |
| `src/hooks/useToolJob.ts` | Effect lifecycle: cancel mid-run, listener cleanup on unmount, jobId injection. | "Generate tests for unmount during run, cancel race with progress event, double-run from the same hook instance." |

## Invocation pattern

```text
/gen-test
target: src-tauri/src/services/pdf_editor.rs
prompt: "generate proptest property tests targeting stateful invariants
         on synthetic + real PDFs; include empty inputs and boundary
         page indexes; mock sidecars where present"
```

Review output. Drop false positives (often tests that depend on
implementation details rather than observable behavior). Keep the rest.
Commit under the matching `tests/` directory.
