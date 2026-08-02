"""Plan 029: point the tool pages at the translations that already exist.

src/locales/sk/tools.json carries 185 keys matching en exactly, and almost
none of them were called. Every tool page hardcoded its English description,
so the Slovak UI showed a translated title over untranslated body text.

This wires the `description=` prop of each ToolPage to its existing
`tools:<tool>.description` key. It checks the key is really present in BOTH
catalogs before touching a file, so a typo fails loudly here rather than
rendering a raw key path in the UI.
"""

import io
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS_DIR = os.path.join(ROOT, "src", "components", "tools")
LOCALES = os.path.join(ROOT, "src", "locales")

# component file -> key in the tools namespace
MAPPING = {
    "CompressTool.tsx": "compress",
    "ConvertImportTool.tsx": "convert_import",
    "ConvertExportTool.tsx": "convert_export",
    "ExtractTool.tsx": "extract",
    "OptimizeTool.tsx": "optimize",
    "SplitTool.tsx": "split",
    "UnlockTool.tsx": "unlock",
}

DESC_RE = re.compile(r'description="[^"]*"')


def load(lang):
    path = os.path.join(LOCALES, lang, "tools.json")
    return json.load(io.open(path, encoding="utf-8"))


def main():
    en, sk = load("en"), load("sk")

    missing = []
    for component, key in MAPPING.items():
        for lang, cat in (("en", en), ("sk", sk)):
            if not cat.get(key, {}).get("description"):
                missing.append("%s.description missing in %s" % (key, lang))
    if missing:
        for m in missing:
            print("REFUSING: " + m)
        return

    for component, key in sorted(MAPPING.items()):
        path = os.path.join(TOOLS_DIR, component)
        text = io.open(path, encoding="utf-8").read()
        new_text, count = DESC_RE.subn(
            'description={t("tools:%s.description")}' % key, text, count=1
        )
        if count == 0:
            print("%-24s no hardcoded description found" % component)
            continue
        io.open(path, "w", encoding="utf-8").write(new_text)
        print("%-24s -> tools:%s.description" % (component, key))
        print("      sk: %s" % sk[key]["description"])


if __name__ == "__main__":
    main()
