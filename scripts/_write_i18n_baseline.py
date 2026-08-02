"""Capture the current i18n debt as a baseline so the ratchet can start.

Runs the hardened checker, parses the UNUSED and LITERAL sections out of its
output, and writes them to scripts/i18n-baseline.json. From then on the gate
fails on anything NEW, and also on any baseline entry that has since been
fixed, so the list is forced to shrink rather than becoming a permanent
exemption.

Re-run this only to REBUILD the baseline deliberately. Do not run it to make a
failing build pass.
"""

import io
import json
import os
import re
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "scripts", "i18n-baseline.json")

proc = subprocess.run(
    ["node", "scripts/check-i18n.mjs"],
    cwd=ROOT,
    capture_output=True,
    text=True,
)
text = proc.stdout + proc.stderr

sections = {"unused": [], "literals": []}
current = None
for line in text.splitlines():
    if line.startswith("[FAIL] UNUSED"):
        current = "unused"
        continue
    if line.startswith("[FAIL] LITERAL"):
        current = "literals"
        continue
    if line.startswith("[FAIL]"):
        current = None
        continue
    m = re.match(r"^\s+- (.*)$", line)
    if m and current:
        sections[current].append(m.group(1).rstrip())

if not sections["unused"] and not sections["literals"]:
    print("nothing to baseline; the checker is already clean")
else:
    payload = {
        "_why": (
            "Known i18n debt captured 2026-08-02 under plan 029. The gate fails "
            "on anything not listed here, and also on anything listed here that "
            "has since been fixed, so this file must shrink over time. Do not "
            "add to it to silence a failure."
        ),
        "unused": sorted(sections["unused"]),
        "literals": sorted(sections["literals"]),
    }
    io.open(OUT, "w", encoding="utf-8").write(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    )
    print(
        "baseline written: %d unused, %d literals"
        % (len(payload["unused"]), len(payload["literals"]))
    )
