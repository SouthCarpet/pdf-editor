import { useState } from "react";
import { Button } from "@/components/ui/button";
import { helloCommand } from "@/tauri/commands";

export default function App() {
  const [reply, setReply] = useState<string>("");
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">PDF Editor</h1>
      <Button className="mt-4" onClick={async () => setReply(await helloCommand("Tauri"))}>
        Say hello
      </Button>
      <p className="mt-2 text-sm text-neutral-700">{reply}</p>
    </div>
  );
}
