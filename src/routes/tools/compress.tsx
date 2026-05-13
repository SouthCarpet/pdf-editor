import { createFileRoute } from "@tanstack/react-router";
import { CompressTool } from "@/components/tools/CompressTool";

export const Route = createFileRoute("/tools/compress")({ component: CompressTool });
