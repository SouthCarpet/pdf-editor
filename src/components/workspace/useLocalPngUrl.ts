import { useEffect, useState } from "react";
import { readFile } from "@tauri-apps/plugin-fs";

export function useLocalPngUrl(path: string | null): string | null {
  const [loaded, setLoaded] = useState<{ path: string; url: string } | null>(null);

  useEffect(() => {
    if (path === null) return;
    let active = true;
    let objectUrl: string | null = null;
    void readFile(path)
      .then((bytes) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
        setLoaded({ path, url: objectUrl });
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return loaded?.path === path ? loaded.url : null;
}
