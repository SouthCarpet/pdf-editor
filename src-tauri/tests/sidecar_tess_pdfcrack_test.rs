use pdf_editor_lib::sidecars::{
    manager::SidecarManager, pdfcrack::PdfcrackWrapper, tesseract::TesseractWrapper,
};
use std::path::Path;
use tempfile::TempDir;

#[tokio::test]
#[ignore = "requires real tesseract binary + tessdata + image fixture"]
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
#[ignore = "requires real pdfcrack binary + password-protected fixture"]
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
