import {
  Combine,
  Scissors,
  Edit3,
  Minimize2,
  FileOutput,
  FileInput,
  Crop,
  LayoutGrid,
  GitCompare,
  Unlock,
  Zap,
  FileText,
  Workflow,
  FolderOpen,
} from "lucide-react";
import type { ComponentType } from "react";

export interface ToolDef {
  id: string;
  i18nKey: string;
  route: string;
  icon: ComponentType<{ className?: string }>;
  category: "tool" | "system";
}

export const TOOLS: ToolDef[] = [
  { id: "merge",          i18nKey: "merge",          route: "/tools/merge",                  icon: Combine,    category: "tool" },
  { id: "split",          i18nKey: "split",          route: "/tools/split",                  icon: Scissors,   category: "tool" },
  { id: "edit",           i18nKey: "edit",           route: "/workspace/new?tool=edit",      icon: Edit3,      category: "tool" },
  { id: "compress",       i18nKey: "compress",       route: "/tools/compress",               icon: Minimize2,  category: "tool" },
  { id: "convert_export", i18nKey: "convert_export", route: "/tools/convert/export",         icon: FileOutput, category: "tool" },
  { id: "convert_import", i18nKey: "convert_import", route: "/tools/convert/import",         icon: FileInput,  category: "tool" },
  { id: "crop",           i18nKey: "crop",           route: "/workspace/new?tool=crop",      icon: Crop,       category: "tool" },
  { id: "organize",       i18nKey: "organize",       route: "/workspace/new?tool=organize",  icon: LayoutGrid, category: "tool" },
  { id: "compare",        i18nKey: "compare",        route: "/workspace/new?tool=compare",   icon: GitCompare, category: "tool" },
  { id: "unlock",         i18nKey: "unlock",         route: "/tools/unlock",                 icon: Unlock,     category: "tool" },
  { id: "optimize",       i18nKey: "optimize",       route: "/tools/optimize",               icon: Zap,        category: "tool" },
  { id: "extract",        i18nKey: "extract",        route: "/tools/extract",                icon: FileText,   category: "tool" },
  { id: "pipeline",       i18nKey: "pipeline",       route: "/pipeline",                     icon: Workflow,   category: "system" },
  { id: "projects",       i18nKey: "projects",       route: "/projects",                     icon: FolderOpen, category: "system" },
];
