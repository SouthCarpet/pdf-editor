use lopdf::content::Content;
use lopdf::{Document, Object};
use pdf_editor_lib::services::annotations::{apply_annotations, Annotation};
use pdf_editor_lib::services::text_style::{TextAlign, TextStyle, VerticalAlign};
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
