import type { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  children: ReactNode;
}

// One lead element per tool page: the title. The description is demoted to
// small muted text under it (R24).
export function ToolPage({ title, description, children }: Props) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="k-caption">{description}</p>}
      </header>
      {children}
    </div>
  );
}
