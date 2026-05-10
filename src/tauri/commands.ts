import { invoke } from "@tauri-apps/api/core";

export async function helloCommand(name: string): Promise<string> {
  return invoke<string>("hello_command", { name });
}
