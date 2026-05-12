// Generated bindings live in `src/bindings.ts`. Re-export `commands` and any
// generated types so call-sites import from a stable path (`@/tauri/commands`)
// even if the bindings file moves later. Hand-rolled wrappers belong below the
// re-export, but Phase 7 Task 45 wired `hello_command` into specta, so the
// previous hand-rolled `helloCommand` was removed in favour of the generated
// `commands.helloCommand` (which returns a plain string for the smoke-test
// command — error-typed commands use the `typedError` wrapper).
export * from "../bindings";
