# Tools Reference

One-paragraph summary per tool. Detailed option semantics live in the per-tool option panels (open the tool, hover any control for its tooltip).

## Merge
Combines multiple PDFs into one. Order is the order you add files. Preserves all source pages without re-encoding.

## Split
Splits one PDF into N outputs by page ranges (`1-5, 6-10` produces two files) or by chunk size (every 10 pages).

## Extract pages
Produces a new PDF containing only the page numbers you list. Same parser as Split's range field.

## Organize
Reorder, rotate (90/180/270 degrees), delete, and insert blank pages in any combination. Operates on a single PDF.

## Compress
Reduces file size via Ghostscript presets (Screen / Recommended / Print) or a Custom preset that exposes DPI + color mode + downsampling explicitly.

## Optimize
Modular pipeline: deduplicate, subset fonts, strip unused objects, recompress images, garbage-collect. Each step is opt-in with sensible defaults.

## Edit
Three sub-tools, all in the Workspace:
- **Forms**: fill out / flatten AcroForm fields.
- **Annotations**: text notes, highlights, shapes, free-draw.
- **Text**: real inline text editing of existing content. Replaces text with proper Type0 CIDFont embedding (preserves Slovak/Czech/German/etc. diacritics with no Standard-14 fallback).

## Crop
Set page-box rectangles manually, lock to a preset paper size, or auto-detect content margins. Supports per-page or apply-to-all.

## Compare
Side-by-side visual diff + text-level diff. Reports per-page divergence ratio and highlights changes inline.

## Unlock
Removes the user/owner password from a PDF you have rights to open. Type A (owner-only permission lock) is automatic; Type B (user open password) accepts the password you type. Secondary Recovery mode runs Dictionary or Brute force attacks via pdfcrack.

## Convert PDF -> ...
Tier A (text): TXT, HTML. Tier B (office): DOCX, ODT, RTF, ePub. Tier B (raster): JPG, PNG, TIFF (DPI configurable). PDF/A export defaults to PDF/A-2 via LibreOffice with Ghostscript fallback.

## Convert ... -> PDF
Images (JPG/PNG/TIFF/BMP), office (DOCX/ODT/XLSX/PPTX/RTF/ePub), HTML. Multi-page output preserves source pagination.

## OCR
Tesseract 5 sidecar. Bundled languages: English, Slovak, Czech, German. Output modes: Searchable PDF (text layer overlay), Text-only PDF, plaintext. Deskew + despeckle pre-processing optional. Slovak diacritics preserved through Type0 CIDFont injection.

## Pipeline
Chain any subset of the above tools into a DAG via the xyflow node editor. Save presets. Run on a single file, a list, or every PDF in a folder.

## Projects
Group related PDFs + saved pipelines. "Run all" iterates each pipeline against the project's files. Export/import as `.pdf-project` for sharing.
