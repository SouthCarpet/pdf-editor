use lopdf::content::Content;
use lopdf::{dictionary, Document, Object};
use pdf_editor_lib::services::annotations::{apply_annotations, Annotation};
use pdf_editor_lib::services::fonts::list_system_fonts;
use pdf_editor_lib::services::text_extractor::extract_text_with_mupdf;
use pdf_editor_lib::services::text_style::{TextAlign, TextStyle, VerticalAlign};
use pdf_editor_lib::sidecars::manager::SidecarManager;
use pdf_editor_lib::sidecars::qpdf::QpdfWrapper;
use std::path::Path;
use tempfile::TempDir;

const SAMPLE: &str = "tests/fixtures/pdfs/sample.pdf";

struct FaceCase {
    family: &'static str,
    postscript_name: &'static str,
    alias: &'static str,
    bold: bool,
    italic: bool,
    underline: bool,
    strikethrough: bool,
    align: TextAlign,
    vertical_align: VerticalAlign,
    expected_q: i64,
    expected_first_baseline: f32,
    expected_decoration_rectangles: usize,
}

const FACE_CASES: &[FaceCase] = &[
    FaceCase {
        family: "Helvetica",
        postscript_name: "Helvetica",
        alias: "Helv",
        bold: false,
        italic: false,
        underline: false,
        strikethrough: false,
        align: TextAlign::Left,
        vertical_align: VerticalAlign::Top,
        expected_q: 0,
        expected_first_baseline: 30.0,
        expected_decoration_rectangles: 0,
    },
    FaceCase {
        family: "Helvetica",
        postscript_name: "Helvetica-Bold",
        alias: "HelvB",
        bold: true,
        italic: false,
        underline: true,
        strikethrough: false,
        align: TextAlign::Center,
        vertical_align: VerticalAlign::Middle,
        expected_q: 1,
        expected_first_baseline: 22.0,
        expected_decoration_rectangles: 2,
    },
    FaceCase {
        family: "Helvetica",
        postscript_name: "Helvetica-Oblique",
        alias: "HelvO",
        bold: false,
        italic: true,
        underline: false,
        strikethrough: true,
        align: TextAlign::Right,
        vertical_align: VerticalAlign::Bottom,
        expected_q: 2,
        expected_first_baseline: 14.0,
        expected_decoration_rectangles: 2,
    },
    FaceCase {
        family: "Helvetica",
        postscript_name: "Helvetica-BoldOblique",
        alias: "HelvBO",
        bold: true,
        italic: true,
        underline: true,
        strikethrough: true,
        align: TextAlign::Left,
        vertical_align: VerticalAlign::Top,
        expected_q: 0,
        expected_first_baseline: 30.0,
        expected_decoration_rectangles: 4,
    },
    FaceCase {
        family: "Times",
        postscript_name: "Times-Roman",
        alias: "TiR",
        bold: false,
        italic: false,
        underline: false,
        strikethrough: false,
        align: TextAlign::Center,
        vertical_align: VerticalAlign::Middle,
        expected_q: 1,
        expected_first_baseline: 22.0,
        expected_decoration_rectangles: 0,
    },
    FaceCase {
        family: "Times",
        postscript_name: "Times-Bold",
        alias: "TiB",
        bold: true,
        italic: false,
        underline: true,
        strikethrough: false,
        align: TextAlign::Right,
        vertical_align: VerticalAlign::Bottom,
        expected_q: 2,
        expected_first_baseline: 14.0,
        expected_decoration_rectangles: 2,
    },
    FaceCase {
        family: "Times",
        postscript_name: "Times-Italic",
        alias: "TiI",
        bold: false,
        italic: true,
        underline: false,
        strikethrough: true,
        align: TextAlign::Left,
        vertical_align: VerticalAlign::Top,
        expected_q: 0,
        expected_first_baseline: 30.0,
        expected_decoration_rectangles: 2,
    },
    FaceCase {
        family: "Times",
        postscript_name: "Times-BoldItalic",
        alias: "TiBI",
        bold: true,
        italic: true,
        underline: true,
        strikethrough: true,
        align: TextAlign::Center,
        vertical_align: VerticalAlign::Middle,
        expected_q: 1,
        expected_first_baseline: 22.0,
        expected_decoration_rectangles: 4,
    },
    FaceCase {
        family: "Courier",
        postscript_name: "Courier",
        alias: "Cou",
        bold: false,
        italic: false,
        underline: false,
        strikethrough: false,
        align: TextAlign::Right,
        vertical_align: VerticalAlign::Bottom,
        expected_q: 2,
        expected_first_baseline: 14.0,
        expected_decoration_rectangles: 0,
    },
    FaceCase {
        family: "Courier",
        postscript_name: "Courier-Bold",
        alias: "CouB",
        bold: true,
        italic: false,
        underline: true,
        strikethrough: false,
        align: TextAlign::Left,
        vertical_align: VerticalAlign::Top,
        expected_q: 0,
        expected_first_baseline: 30.0,
        expected_decoration_rectangles: 2,
    },
    FaceCase {
        family: "Courier",
        postscript_name: "Courier-Oblique",
        alias: "CouO",
        bold: false,
        italic: true,
        underline: false,
        strikethrough: true,
        align: TextAlign::Center,
        vertical_align: VerticalAlign::Middle,
        expected_q: 1,
        expected_first_baseline: 22.0,
        expected_decoration_rectangles: 2,
    },
    FaceCase {
        family: "Courier",
        postscript_name: "Courier-BoldOblique",
        alias: "CouBO",
        bold: true,
        italic: true,
        underline: true,
        strikethrough: true,
        align: TextAlign::Right,
        vertical_align: VerticalAlign::Bottom,
        expected_q: 2,
        expected_first_baseline: 14.0,
        expected_decoration_rectangles: 4,
    },
];

#[test]
fn apply_annotations_roundtrips_all_twelve_standard_text_faces_and_styles() {
    let temp = TempDir::new().expect("temporary output directory");
    let output = temp.path().join("styled-free-text.pdf");
    let annotations: Vec<Annotation> = FACE_CASES
        .iter()
        .map(|case| Annotation::FreeText {
            page: 0,
            rect: [10.0, 10.0, 110.0, 50.0],
            contents: "MM\nMM".to_string(),
            style: TextStyle {
                font_family: case.family.to_string(),
                font_postscript_name: case.postscript_name.to_string(),
                size_pt: 10.0,
                bold: case.bold,
                italic: case.italic,
                underline: case.underline,
                strikethrough: case.strikethrough,
                align: case.align,
                vertical_align: case.vertical_align,
                ..TextStyle::default()
            },
            background_fill: None,
            border_color: [0.0, 0.0, 0.0],
            border_width: 0.0,
            auto_resize: false,
        })
        .collect();

    apply_annotations(Path::new(SAMPLE), &output, &annotations)
        .expect("apply all Standard-14 FreeText styles");

    let doc =
        pdf_editor_lib::services::pdf_guard::load_guarded(&output).expect("reload styled PDF");
    let entries = page_annotation_entries(&doc);
    assert_eq!(entries.len(), 12, "one annotation per Standard-14 face");

    for (entry, case) in entries.iter().zip(FACE_CASES) {
        let dict = referenced_dictionary(&doc, entry);
        let da = dict.get(b"DA").expect("/DA").as_str().expect("/DA string");
        assert_eq!(
            std::str::from_utf8(da).expect("UTF-8 /DA"),
            format!("/{} 10 Tf 0 0 0 rg", case.alias),
            "wrong /DA for {}",
            case.postscript_name
        );
        assert_eq!(
            dict.get(b"Q").expect("/Q").as_i64().expect("integer /Q"),
            case.expected_q,
            "wrong /Q for {}",
            case.postscript_name
        );

        let font = annotation_font_dictionary(&doc, dict, case.alias);
        assert_eq!(
            font.get(b"Subtype").expect("/Subtype").as_name().unwrap(),
            b"Type1",
            "{} must stay unembedded Type1",
            case.postscript_name
        );
        assert_eq!(
            font.get(b"BaseFont").expect("/BaseFont").as_name().unwrap(),
            case.postscript_name.as_bytes(),
            "wrong /BaseFont for {}",
            case.postscript_name
        );

        let appearance = appearance_content(&doc, dict);
        let tf_alias = appearance
            .operations
            .iter()
            .find(|operation| operation.operator == "Tf")
            .expect("appearance /Tf")
            .operands[0]
            .as_name()
            .expect("appearance font alias");
        assert_eq!(tf_alias, case.alias.as_bytes());

        let first_tm = appearance
            .operations
            .iter()
            .find(|operation| operation.operator == "Tm")
            .expect("first line text matrix");
        assert!(
            (pdf_number(&first_tm.operands[5]) - case.expected_first_baseline).abs() < 0.01,
            "wrong vertical placement for {}",
            case.postscript_name
        );

        assert_eq!(
            appearance
                .operations
                .iter()
                .filter(|operation| operation.operator == "re")
                .count(),
            case.expected_decoration_rectangles,
            "wrong decoration count for {}",
            case.postscript_name
        );
    }
}

#[test]
fn ascii_helvetica_bold_stays_unembedded_type1_standard_14() {
    let temp = TempDir::new().expect("temporary output directory");
    let output = temp.path().join("ascii-standard-14.pdf");
    let annotation = Annotation::FreeText {
        page: 0,
        rect: [10.0, 10.0, 210.0, 50.0],
        contents: "Plain ASCII text".to_string(),
        style: TextStyle {
            font_family: "Helvetica".to_string(),
            font_postscript_name: "Helvetica-Bold".to_string(),
            bold: true,
            ..TextStyle::default()
        },
        background_fill: None,
        border_color: [0.0, 0.0, 0.0],
        border_width: 0.0,
        auto_resize: false,
    };

    apply_annotations(Path::new(SAMPLE), &output, &[annotation])
        .expect("apply ASCII FreeText annotation");

    let doc = pdf_editor_lib::services::pdf_guard::load_guarded(&output).expect("reload ASCII PDF");
    let entries = page_annotation_entries(&doc);
    let dict = referenced_dictionary(&doc, &entries[0]);
    let font = annotation_font_dictionary(&doc, dict, "HelvB");
    assert_eq!(
        font.get(b"Subtype").expect("/Subtype").as_name().unwrap(),
        b"Type1",
        "ASCII Helvetica-Bold must remain a Standard-14 Type1 resource"
    );
}

#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "needs real qpdf + mupdf sidecars to flatten and extract the FreeText appearance; --features sidecar-tests"
)]
async fn helvetica_bold_slovak_free_text_roundtrips_exactly_through_extractor() {
    assert_slovak_free_text_roundtrip("Helvetica", "Helvetica-Bold", true, false).await;
}

#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "needs real qpdf + mupdf sidecars to flatten and extract the FreeText appearance; --features sidecar-tests"
)]
async fn times_italic_slovak_free_text_roundtrips_exactly_through_extractor() {
    assert_slovak_free_text_roundtrip("Times", "Times-Italic", false, true).await;
}

async fn assert_slovak_free_text_roundtrip(
    family: &str,
    postscript_name: &str,
    bold: bool,
    italic: bool,
) {
    const SLOVAK_TEXT: &str = "Ľubomír Šťastný, Čadca";

    let required_style = match postscript_name {
        "Helvetica-Bold" => ("Arial", "Bold"),
        "Times-Italic" => ("Times New Roman", "Italic"),
        _ => panic!("round-trip test has no fallback mapping for {postscript_name}"),
    };
    let has_fallback = list_system_fonts().into_iter().any(|font| {
        !font.is_standard_14
            && !font.file_path.is_empty()
            && font.family.eq_ignore_ascii_case(required_style.0)
            && font.style == required_style.1
    });
    if !has_fallback {
        eprintln!(
            "SKIP: {postscript_name} Slovak round-trip needs installed {} {}",
            required_style.0, required_style.1
        );
        return;
    }

    let temp = TempDir::new().expect("temporary output directory");
    let input = temp.path().join("blank.pdf");
    let output = temp.path().join("slovak-free-text.pdf");
    let flattened = temp.path().join("slovak-free-text-flattened.pdf");
    write_blank_pdf(&input);
    let annotation = Annotation::FreeText {
        page: 0,
        rect: [72.0, 700.0, 500.0, 740.0],
        contents: SLOVAK_TEXT.to_string(),
        style: TextStyle {
            font_family: family.to_string(),
            font_postscript_name: postscript_name.to_string(),
            size_pt: 12.0,
            bold,
            italic,
            ..TextStyle::default()
        },
        background_fill: None,
        border_color: [0.0, 0.0, 0.0],
        border_width: 0.0,
        auto_resize: false,
    };

    apply_annotations(&input, &output, &[annotation]).expect("apply Slovak FreeText annotation");

    let manager = SidecarManager::new(1);
    QpdfWrapper::new(manager.clone())
        .flatten_annotations(&output, &flattened, None)
        .await
        .expect("flatten FreeText appearance into page content");
    let extracted = extract_text_with_mupdf(&flattened, manager)
        .await
        .expect("extract saved FreeText through services::text_extractor");
    assert_eq!(
        extracted.trim(),
        SLOVAK_TEXT,
        "saved {postscript_name} FreeText must extract exactly"
    );
}

fn write_blank_pdf(path: &Path) {
    let mut doc = Document::with_version("1.7");
    let pages_id = doc.new_object_id();
    let page_id = doc.new_object_id();
    let catalog_id = doc.new_object_id();
    doc.set_object(
        page_id,
        dictionary! {
            "Type" => "Page",
            "Parent" => Object::Reference(pages_id),
            "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
            "Resources" => dictionary! {},
        },
    );
    doc.set_object(
        pages_id,
        dictionary! {
            "Type" => "Pages",
            "Kids" => vec![Object::Reference(page_id)],
            "Count" => 1,
        },
    );
    doc.set_object(
        catalog_id,
        dictionary! {
            "Type" => "Catalog",
            "Pages" => Object::Reference(pages_id),
        },
    );
    doc.trailer.set("Root", Object::Reference(catalog_id));
    doc.save(path).expect("save blank PDF fixture");
}

fn page_annotation_entries(doc: &Document) -> Vec<Object> {
    let page_id = *doc.get_pages().get(&1).expect("page 1");
    let page = doc.get_dictionary(page_id).expect("page dictionary");
    match page.get(b"Annots").expect("page /Annots") {
        Object::Reference(id) => doc
            .get_object(*id)
            .expect("/Annots object")
            .as_array()
            .expect("/Annots array")
            .clone(),
        object => object.as_array().expect("/Annots array").clone(),
    }
}

fn referenced_dictionary<'a>(doc: &'a Document, object: &'a Object) -> &'a lopdf::Dictionary {
    match object {
        Object::Reference(id) => doc
            .get_object(*id)
            .expect("annotation object")
            .as_dict()
            .expect("annotation dictionary"),
        object => object.as_dict().expect("annotation dictionary"),
    }
}

fn annotation_font_dictionary<'a>(
    doc: &'a Document,
    annotation: &'a lopdf::Dictionary,
    alias: &str,
) -> &'a lopdf::Dictionary {
    let dr = annotation
        .get(b"DR")
        .expect("/DR")
        .as_dict()
        .expect("/DR dictionary");
    let fonts = dr
        .get(b"Font")
        .expect("/DR /Font")
        .as_dict()
        .expect("/Font dictionary");
    let id = fonts
        .get(alias.as_bytes())
        .expect("font alias")
        .as_reference()
        .expect("font reference");
    doc.get_object(id)
        .expect("font object")
        .as_dict()
        .expect("font dictionary")
}

fn appearance_content(doc: &Document, annotation: &lopdf::Dictionary) -> Content {
    let ap = annotation
        .get(b"AP")
        .expect("/AP")
        .as_dict()
        .expect("/AP dictionary");
    let id = ap
        .get(b"N")
        .expect("/AP /N")
        .as_reference()
        .expect("appearance reference");
    let stream = doc
        .get_object(id)
        .expect("appearance object")
        .as_stream()
        .expect("appearance stream");
    let bytes = stream
        .decompressed_content()
        .expect("decompress appearance stream");
    Content::decode(&bytes).expect("decode appearance stream")
}

fn pdf_number(object: &Object) -> f32 {
    match object {
        Object::Integer(value) => *value as f32,
        Object::Real(value) => *value,
        other => panic!("expected PDF number, got {other:?}"),
    }
}
