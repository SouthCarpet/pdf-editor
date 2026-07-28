use pdf_editor_lib::services::ocr_engine::{
    build_invisible_text_stream, OcrBackend, OcrRecognitionOptions,
};
use pdf_editor_lib::sidecars::{
    manager::SidecarManager, pdfcrack::PdfcrackWrapper, tesseract::TesseractWrapper,
};
use std::path::Path;
use tempfile::TempDir;

#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "requires real tesseract binary + tessdata + image fixture; --features sidecar-tests"
)]
async fn tesseract_ocr_image_returns_text() {
    let mgr = SidecarManager::new(2);
    let t = TesseractWrapper::new(mgr);
    let text = t
        .ocr_image(
            Path::new("tests/fixtures/images/word_test.png"),
            "eng",
            None,
        )
        .await
        .expect("ocr");
    assert!(text.to_uppercase().contains("TEST"));
}

#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "requires real tesseract binary + tessdata + image fixture; --features sidecar-tests"
)]
async fn tesseract_trait_text_layer_is_deterministic() {
    let backend = TesseractWrapper::new(SidecarManager::new(2));
    let backend: &dyn OcrBackend = &backend;
    let image = Path::new("tests/fixtures/images/word_test.png");
    let options = OcrRecognitionOptions {
        psm: 3,
        oem: 3,
        cancellation: None,
    };

    let first = backend
        .recognize(image, "eng", &options)
        .await
        .expect("first OCR pass");
    let second = backend
        .recognize(image, "eng", &options)
        .await
        .expect("second OCR pass");

    assert!(!first.is_empty(), "fixture must produce recognized words");
    assert_eq!(first, second);
    assert_eq!(
        build_invisible_text_stream(&first, 417, 208, 200.0, 100.0, None),
        build_invisible_text_stream(&second, 417, 208, 200.0, 100.0, None)
    );
}

#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "requires real pdfcrack binary + password-protected fixture; --features sidecar-tests"
)]
async fn pdfcrack_dictionary_finds_user_password() {
    let mgr = SidecarManager::new(2);
    let p = PdfcrackWrapper::new(mgr);
    let tmp = TempDir::new().unwrap();
    let wordlist = tmp.path().join("words.txt");
    std::fs::write(&wordlist, "wrong1\nwrong2\nuser\nwrong3\n").unwrap();
    let pwd = p
        .dictionary_attack(
            Path::new("tests/fixtures/pdfs/password-open.pdf"),
            &wordlist,
            None,
        )
        .await
        .expect("attack");
    assert_eq!(pwd, Some("user".to_string()));
}
