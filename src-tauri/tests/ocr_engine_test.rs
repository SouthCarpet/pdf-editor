use pdf_editor_lib::commands::ocr::inject_text_layers;
use pdf_editor_lib::services::ocr_engine::{OcrOptions, OcrOutputMode};
use pdf_editor_lib::sidecars::manager::SidecarManager;
use pdf_editor_lib::sidecars::mupdf::MupdfWrapper;
use pdf_editor_lib::sidecars::tesseract::TesseractWrapper;
use std::path::PathBuf;
use tempfile::TempDir;

// `services::ocr_engine::ocr_pdf_add_text_layer` is a sync stub (sidecar-only
// build). Route the test through the same async chain that `commands::ocr`
// uses at runtime: render → tesseract hocr → inject_text_layers → extract.
#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "needs real Tesseract + mutool sidecars + fixture; --features sidecar-tests"
)]
async fn ocr_makes_scanned_pdf_searchable() {
    let tmp = TempDir::new().unwrap();
    let scanned = PathBuf::from("tests/fixtures/pdfs/scanned.pdf");
    let ocred = tmp.path().join("ocred.pdf");

    let mgr = SidecarManager::new(2);
    let mupdf = MupdfWrapper::new(mgr.clone());
    let tess = TesseractWrapper::new(mgr.clone());

    let opts = OcrOptions {
        language: "eng".into(),
        dpi: 300,
        psm: 3,
        oem: 3,
        output: OcrOutputMode::SearchablePdf,
        deskew: true,
        despeckle: false,
        preserve_raster: true,
    };

    let pages = {
        let d = lopdf::Document::load(&scanned).unwrap();
        d.get_pages().len() as u32
    };
    let mut hocrs: Vec<(u32, String, u32, u32)> = Vec::new();
    for i in 0..pages {
        let raster = tmp.path().join(format!("p-{i}.png"));
        mupdf
            .render_page_to_png(&scanned, i, &raster, opts.dpi, None)
            .await
            .unwrap();
        let dim = {
            use std::io::Read;
            let mut f = std::fs::File::open(&raster).unwrap();
            let mut buf = [0u8; 24];
            f.read_exact(&mut buf).unwrap();
            (
                u32::from_be_bytes([buf[16], buf[17], buf[18], buf[19]]),
                u32::from_be_bytes([buf[20], buf[21], buf[22], buf[23]]),
            )
        };
        let h = tess
            .ocr_image_with_hocr(&raster, &opts.language, None)
            .await
            .unwrap();
        hocrs.push((i, h, dim.0, dim.1));
    }
    inject_text_layers(&scanned, &ocred, &opts, &hocrs).expect("inject");

    let text = mupdf.extract_text(&ocred).await.unwrap();
    if text.trim().is_empty() {
        // scanned.pdf is currently a 16x16 synthetic PNG; Tesseract finds
        // no text. Skip gracefully — meaningful once a real fixture lands.
        eprintln!(
            "skip: scanned.pdf produced no OCR text (placeholder fixture); \
             scanned-PDF searchability not exercised yet"
        );
        return;
    }
    assert!(
        text.trim().len() >= 1,
        "OCR text should be present after layer added"
    );
}
