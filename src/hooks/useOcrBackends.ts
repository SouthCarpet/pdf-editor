import { useEffect, useState } from "react";
import { commands, type OcrBackendInfo } from "@/bindings";

const FALLBACK_BACKENDS: OcrBackendInfo[] = [
  {
    id: "tesseract",
    display_name: "Tesseract",
    supported_languages: ["eng", "slk", "ces", "deu", "pol"],
    supports_multi_language: true,
    available: true,
    unavailable_reason: null,
  },
  {
    id: "rapidocr",
    display_name: "RapidOCR",
    supported_languages: ["eng", "slk", "ces", "deu", "pol"],
    supports_multi_language: true,
    available: false,
    unavailable_reason: null,
  },
];

export type OcrEngineId = "tesseract" | "rapidocr";

export function useOcrBackends(active = true) {
  const [backends, setBackends] = useState<OcrBackendInfo[]>(FALLBACK_BACKENDS);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await commands.listOcrBackends();
        if (!cancelled) setBackends(result);
      } catch {
        // Keep the conservative fallback metadata when Tauri is unavailable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  return backends;
}
