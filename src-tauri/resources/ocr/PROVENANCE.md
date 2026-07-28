# OCR resource provenance

Byte-level SHA-256 is the identity used for every vendored OCR resource.

## Tesseract Polish language data

| File | Source | SHA-256 | Size | License |
|---|---|---|---:|---|
| `resources/tessdata/pol.traineddata` | https://github.com/tesseract-ocr/tessdata_best/raw/main/pol.traineddata | `e80cc4cefbdface06e9223f43f089556b9dcf104020fbc0a200f6863c57d4405` | 11,978,867 bytes | Apache-2.0 |

The file is downloaded byte-for-byte from the official `tesseract-ocr/tessdata_best`
repository. There is no local conversion step.

## RapidOCR language verification stop gate

Official language matrix:
https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/algorithm/PP-OCRv5/PP-OCRv5_multi_languages.en.md

The binding research report that was required to establish the complete
Slovak, Czech, Polish, English, and German matrix was absent from
`D:/projects-vault/animus/data/agent-runs/009_pdf-ocr-unlimited/research-report.md`
at implementation time. The recovered local transcript only established an
explicit official-source claim for Czech and Slovak and did not contain the
official matrix text proving all five required languages. General web access
was forbidden by the implementation brief.

RapidOCR therefore stopped before model, dictionary, runtime, dependency, or
UI integration. No RapidOCR artifact was downloaded or vendored.
