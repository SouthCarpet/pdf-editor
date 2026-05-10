// Phase 9+ will add commands to `pdf_editor_lib::specta_builder()` via
// `collect_commands![]`. Once `src/bindings.ts` contains real exports (i.e.
// it stops being a single-line comment file), uncomment the re-export below
// and delete the hand-rolled `helloCommand` that lives at the bottom.
//
// export * from "../bindings";

// Hand-rolled wrapper for the `hello_command` smoke test (Phase 2 legacy).
import { invoke } from "@tauri-apps/api/core";

export async function helloCommand(name: string): Promise<string> {
  return invoke<string>("hello_command", { name });
}
