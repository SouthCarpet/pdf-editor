import { createFileRoute } from "@tanstack/react-router";
import { RecoveryRoute } from "@/components/recovery/RecoveryRoute";

interface RecoverySearch {
  input?: string;
}

export const Route = createFileRoute("/tools/unlock/recovery")({
  component: RecoveryRoute,
  validateSearch: (search: Record<string, unknown>): RecoverySearch => {
    const input = typeof search.input === "string" ? search.input : undefined;
    return { input };
  },
});
