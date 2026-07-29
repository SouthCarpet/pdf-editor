# OCR resource provenance

Byte-level SHA-256 is the identity used for every vendored OCR resource.
Runtime paths are fixed in the Rust model registry. The application never
downloads OCR resources.

## Tesseract Polish language data

| File | Source | SHA-256 | Size | License |
|---|---|---|---:|---|
| `resources/tessdata/pol.traineddata` | https://github.com/tesseract-ocr/tessdata_best/raw/main/pol.traineddata | `e80cc4cefbdface06e9223f43f089556b9dcf104020fbc0a200f6863c57d4405` | 11,978,867 bytes | Apache-2.0 |

The file is downloaded byte-for-byte from the official
`tesseract-ocr/tessdata_best` repository. There is no local conversion step.

## RapidOCR PP-OCRv5 models

RapidOCR's pinned model registry at commit
`66e00f4beb4be435504ab93bf1986623ce3d3fd0` records the following official
RapidAI distribution URLs and the same model hashes:
https://github.com/RapidAI/RapidOCR/blob/66e00f4beb4be435504ab93bf1986623ce3d3fd0/python/rapidocr/default_models.yaml

| File | Source | SHA-256 | Size | License |
|---|---|---|---:|---|
| `ch_PP-OCRv5_mobile_det.onnx` | https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.3.0/onnx/PP-OCRv5/det/ch_PP-OCRv5_mobile_det.onnx | `4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae` | 4,819,576 bytes | Apache-2.0 |
| `latin_PP-OCRv5_rec_mobile_infer.onnx` | https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.3.0/onnx/PP-OCRv5/rec/latin_PP-OCRv5_rec_mobile_infer.onnx | `b20bd37c168a570f583afbc8cd7925603890efbcdc000a59e22c269d160b5f5a` | 7,904,513 bytes | Apache-2.0 |
| `ppocrv5_latin_dict.txt` | https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.3.0/paddle/PP-OCRv5/rec/latin_PP-OCRv5_rec_mobile_infer/ppocrv5_latin_dict.txt | `3c0a8a79b612653c25f765271714f71281e4e955962c153e272b7b8c1d2b13ff` | 1,634 bytes | Apache-2.0 |
| `LICENSE-RapidOCR-APACHE-2.0.txt` | https://raw.githubusercontent.com/RapidAI/RapidOCR/66e00f4beb4be435504ab93bf1986623ce3d3fd0/LICENSE | `3e0af25fdd06aa9586ae97adb00ea927ebe5a3805ac77d2d3a81ce5f55693333` | 11,422 bytes | Apache-2.0 |

The ONNX files are RapidAI conversions of PaddleOCR PP-OCRv5 models. The
exact converter and converter version are not embedded in the files or stated
by the pinned RapidOCR registry. Fidelity is therefore unestablished,
third-party conversion, byte-hash only. No local conversion was performed.

## RapidOCR language verification

The official PaddleOCR PP-OCRv5 multilingual documentation lists Czech,
Polish, Slovak, and German in the supported-language set for
`latin_PP-OCRv5_mobile_rec`; English is the Latin model's base language. This
covers all five required languages: English, Slovak, Czech, German, and Polish.

Source, section 5:
https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/algorithm/PP-OCRv5/PP-OCRv5_multi_languages.en.md

