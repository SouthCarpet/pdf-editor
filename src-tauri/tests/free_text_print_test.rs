use lopdf::{dictionary, Document, Object};
use pdf_editor_lib::services::annotations::{save_annotations, Annotation};
use pdf_editor_lib::services::text_style::TextStyle;
use std::path::{Path, PathBuf};
use tempfile::TempDir;

fn saved_text(dir: &Path) -> (PathBuf, lopdf::ObjectId) {
    let input = dir.join("blank.pdf");
    let output = dir.join("print-text.pdf");
    let mut doc = Document::with_version("1.7");
    let pages = doc.new_object_id();
    let page = doc.add_object(dictionary! {
        "Type" => "Page", "Parent" => pages,
        "MediaBox" => vec![0.into(), 0.into(), 300.into(), 200.into()],
        "Resources" => dictionary! {},
    });
    doc.set_object(
        pages,
        dictionary! {
            "Type" => "Pages", "Kids" => vec![Object::Reference(page)], "Count" => 1,
        },
    );
    let root = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages });
    doc.trailer.set("Root", root);
    doc.save(&input).unwrap();
    let written = save_annotations(
        &input,
        &output,
        &[Annotation::FreeText {
            page: 0,
            rect: [30.0, 100.0, 270.0, 140.0],
            contents: "PRINT ME".into(),
            style: TextStyle::default(),
            background_fill: None,
            border_color: [0.0; 3],
            border_width: 0.0,
            auto_resize: false,
        }],
        &[],
    )
    .unwrap();
    let reference = written[0].unwrap();
    (output, (reference.object, reference.generation))
}

// Oracle: O6 and PDF annotation flag bit 3 (Print). Screen-only annotations
// disappear in a printed render unless /F contains 4.
#[test]
fn saved_free_text_sets_the_print_flag() {
    let dir = TempDir::new().unwrap();
    let (output, id) = saved_text(dir.path());
    let doc = Document::load(output).unwrap();
    assert_eq!(
        doc.get_dictionary(id).unwrap().get(b"F").unwrap(),
        &Object::Integer(4)
    );
}

// Oracle: O6. A print render of an otherwise blank synthetic page must draw
// the borderless FreeText. The only non-white pixels can come from its text.
#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "requires bundled Ghostscript; --features sidecar-tests"
)]
async fn ghostscript_print_render_contains_the_saved_free_text() {
    use pdf_editor_lib::sidecars::manager::{SidecarManager, SidecarRunSpec};
    let dir = TempDir::new().unwrap();
    let (output, _) = saved_text(dir.path());
    let png = dir.path().join("printed.png");
    SidecarManager::new(1)
        .run(SidecarRunSpec {
            name: "gswin64c".into(),
            args: vec![
                "-dSAFER".into(),
                "-dBATCH".into(),
                "-dNOPAUSE".into(),
                "-dPrinted=true".into(),
                "-sDEVICE=png16m".into(),
                "-r72".into(),
                format!("-sOutputFile={}", png.display()),
                output.display().to_string(),
            ],
            stdin: None,
            timeout: Some(std::time::Duration::from_secs(60)),
            cancellation: None,
        })
        .await
        .unwrap();
    let image = image::open(png).unwrap().to_rgb8();
    let ink = image
        .pixels()
        .filter(|pixel| pixel.0.iter().all(|value| *value < 128))
        .count();
    assert!(
        ink > 40,
        "printed text must leave visible ink, got {ink} pixels"
    );
}
