"""Plan 029: wire CompressOptions to the catalog keys that already exist.

The compress panel is the one the user screenshotted: Slovak title over an
English body. Every string below already has a key in both en and sk
tools.json and simply was never called, which is why the old parity gate read
green over it.

Visible labels keep their numeric range in the source string rather than in
the catalog, so the range stays next to the input it describes and the
translator is not asked to maintain a number.
"""

import io
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "src", "components", "tools", "options", "CompressOptions.tsx")
EN = os.path.join(ROOT, "src", "locales", "en", "tools.json")
SK = os.path.join(ROOT, "src", "locales", "sk", "tools.json")

# (literal in source, catalog key under compress.)
REPLACEMENTS = [
    ('aria-label="JPEG quality"', 'aria-label={t("compress.jpeg_quality")}', "jpeg_quality"),
    ('aria-label="Color image DPI"', 'aria-label={t("compress.color_dpi")}', "color_dpi"),
    ('aria-label="Grayscale image DPI"', 'aria-label={t("compress.grayscale_dpi")}', "grayscale_dpi"),
    ('aria-label="Monochrome DPI"', 'aria-label={t("compress.mono_dpi")}', "mono_dpi"),
    ('aria-label="Color mode"', 'aria-label={t("compress.color_mode")}', "color_mode"),
    ('aria-label="Compression filter"', 'aria-label={t("compress.filter")}', "filter"),
    ('aria-label="Downsample method"', 'aria-label={t("compress.downsample")}', "downsample"),
    # visible labels: keep the range in source, translate the noun
    ("JPEG quality (1-100):", '{t("compress.jpeg_quality")} (1-100):', "jpeg_quality"),
    ("Color image DPI (36-300):", '{t("compress.color_dpi")} (36-300):', "color_dpi"),
    ("Grayscale image DPI (36-300):", '{t("compress.grayscale_dpi")} (36-300):', "grayscale_dpi"),
    ("Monochrome DPI (72-600):", '{t("compress.mono_dpi")} (72-600):', "mono_dpi"),
]


def main():
    en = json.load(io.open(EN, encoding="utf-8")).get("compress", {})
    sk = json.load(io.open(SK, encoding="utf-8")).get("compress", {})

    absent = [k for _, _, k in REPLACEMENTS if k not in en or k not in sk]
    if absent:
        print("REFUSING, keys missing from a catalog: %s" % sorted(set(absent)))
        return

    text = io.open(TARGET, encoding="utf-8").read()
    applied, skipped = [], []
    for old, new, key in REPLACEMENTS:
        if old not in text:
            skipped.append(old)
            continue
        text = text.replace(old, new, 1)
        applied.append("%-34s -> compress.%s   sk: %s" % (old[:34], key, sk[key]))
    io.open(TARGET, "w", encoding="utf-8").write(text)

    print("applied %d, skipped %d" % (len(applied), len(skipped)))
    for line in applied:
        print("   " + line)
    for line in skipped:
        print("   NOT FOUND: " + line)


if __name__ == "__main__":
    main()
