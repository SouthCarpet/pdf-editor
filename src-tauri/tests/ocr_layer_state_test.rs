// Plan 067 W1 — the OCR text layer must be placed in the page's own space.
//
// A page's /Contents array is concatenated into ONE content stream
// (ISO 32000-1, 7.8.2), so graphics state an earlier stream leaves behind is
// still in force when a later stream starts. Scanned pages routinely paint
// their image with a bare `<w> 0 0 <h> 0 0 cm /Im0 Do` and never balance it
// with `q`/`Q`. Before the fix, the invisible OCR overlay appended after that
// content inherited the page-sized scale: the text was drawn 900x too large,
// hundreds of page widths to the right of the MediaBox, and no extractor
// (mutool, Acrobat, a reader's find bar) could see it. `ocr_engine_test`'s
// `ocr_makes_scanned_pdf_searchable` caught it only as "no text at all".
//
// These tests need no sidecar and no fixture, so they run in the plain
// `rust-unit` CI job where a regression guard belongs.

use lopdf::content::Content;
use lopdf::{dictionary, Document, Object, Stream};
use pdf_editor_lib::commands::ocr::inject_text_layers;
use pdf_editor_lib::services::ocr_engine::{OcrOptions, OcrOutputMode};
use tempfile::TempDir;

/// One recognized word, `bbox <left> <top> <right> <bottom>` in raster pixels,
/// in the subset of hOCR that `parse_hocr_word` reads.
const HOCR_ONE_WORD: &str = "<html><body><p class='ocr_par' id='par_0'>\
<span class='ocr_line' id='line_0'>\
<span class='ocrx_word' title='bbox 300 400 900 600; x_wconf 96'>Cadca</span>\
</span></p></body></html>";

const RASTER_WIDTH_PX: u32 = 3000;
const RASTER_HEIGHT_PX: u32 = 1000;

/// A one-page PDF that draws a full-page image the way a scan does: a `cm`
/// with no `q` before it and no `Q` after it, so the CTM is still scaled by
/// the page size when the next content stream starts.
fn scanned_page_with_unbalanced_ctm(path: &std::path::Path) {
    let mut doc = Document::with_version("1.7");
    let pages_id = doc.new_object_id();
    let content_id = doc.add_object(Stream::new(
        dictionary! {},
        b"900 0 0 300 0 0 cm\n/Im0 Do\n".to_vec(),
    ));
    let page_id = doc.add_object(dictionary! {
        "Type" => "Page",
        "Parent" => pages_id,
        "MediaBox" => vec![0.into(), 0.into(), 900.into(), 300.into()],
        "Resources" => dictionary! {},
        "Contents" => content_id,
    });
    doc.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => vec![page_id.into()],
            "Count" => 1,
        }),
    );
    let catalog_id = doc.add_object(dictionary! {
        "Type" => "Catalog",
        "Pages" => pages_id,
    });
    doc.trailer.set("Root", catalog_id);
    doc.save(path).expect("write the synthetic scanned page");
}

fn ocr_options() -> OcrOptions {
    OcrOptions {
        engine: Default::default(),
        language: "slk".into(),
        dpi: 300,
        psm: 3,
        oem: 3,
        output: OcrOutputMode::SearchablePdf,
        deskew: true,
        despeckle: false,
        preserve_raster: true,
    }
}

#[test]
fn ocr_overlay_text_lands_on_the_page_despite_a_ctm_the_scan_left_behind() {
    let tmp = TempDir::new().unwrap();
    let scanned = tmp.path().join("scanned.pdf");
    let ocred = tmp.path().join("ocred.pdf");
    scanned_page_with_unbalanced_ctm(&scanned);

    inject_text_layers(
        &scanned,
        &ocred,
        &ocr_options(),
        &[(
            0,
            HOCR_ONE_WORD.to_string(),
            RASTER_WIDTH_PX,
            RASTER_HEIGHT_PX,
        )],
    )
    .expect("inject");

    // Expected from the documented raster-to-points mapping on
    // `build_invisible_text_stream`: x = left * page_w / raster_w = 300 * 0.3,
    // y = page_h - bottom * page_h / raster_h = 300 - 600 * 0.3.
    let (x, y, ctm) = first_text_origin_in_page_space(&ocred);
    assert!(
        (x - 90.0).abs() < 0.05 && (y - 120.0).abs() < 0.05,
        "OCR word must be drawn at (90, 120) on a 900x300 page, got ({x}, {y}); \
         the graphics state in force at the overlay was {ctm:?} instead of the identity"
    );
}

#[test]
fn ocr_injection_leaves_the_pages_own_content_stream_byte_identical() {
    let tmp = TempDir::new().unwrap();
    let scanned = tmp.path().join("scanned.pdf");
    let ocred = tmp.path().join("ocred.pdf");
    scanned_page_with_unbalanced_ctm(&scanned);

    inject_text_layers(
        &scanned,
        &ocred,
        &ocr_options(),
        &[(
            0,
            HOCR_ONE_WORD.to_string(),
            RASTER_WIDTH_PX,
            RASTER_HEIGHT_PX,
        )],
    )
    .expect("inject");

    let content = String::from_utf8(page_content(&ocred)).expect("page content is ASCII here");
    assert!(
        content.contains("900 0 0 300 0 0 cm\n/Im0 Do"),
        "the page's own drawing operators must survive untouched, got: {content}"
    );
}

/// Concatenation of every stream in page 1's /Contents, in array order — what
/// a reader executes (ISO 32000-1, 7.8.2).
fn page_content(pdf: &std::path::Path) -> Vec<u8> {
    let doc = Document::load(pdf).expect("load the injected pdf");
    let page_id = *doc.get_pages().get(&1).expect("page 1");
    doc.get_page_content(page_id)
}

/// Replays the page's content the way a reader does — `q`/`Q` on a stack,
/// `cm` concatenated onto the CTM — and returns the first text-positioning
/// origin in page space, plus the CTM that produced it for the failure
/// message.
fn first_text_origin_in_page_space(pdf: &std::path::Path) -> (f32, f32, [f32; 6]) {
    let bytes = page_content(pdf);
    let content = Content::decode(&bytes).expect("decode page content");
    let mut ctm = [1.0f32, 0.0, 0.0, 1.0, 0.0, 0.0];
    let mut stack: Vec<[f32; 6]> = Vec::new();
    for operation in &content.operations {
        match operation.operator.as_str() {
            "q" => stack.push(ctm),
            "Q" => {
                ctm = stack
                    .pop()
                    .expect("unbalanced Q in the injected page content")
            }
            "cm" => ctm = concat(matrix(&operation.operands), ctm),
            "Tm" => {
                let text_matrix = matrix(&operation.operands);
                let (x, y) = apply(ctm, text_matrix[4], text_matrix[5]);
                return (x, y, ctm);
            }
            _ => {}
        }
    }
    panic!("the injected page has no Tm operator");
}

fn matrix(operands: &[Object]) -> [f32; 6] {
    let mut out = [0.0f32; 6];
    for (slot, operand) in out.iter_mut().zip(operands) {
        *slot = match operand {
            Object::Integer(value) => *value as f32,
            Object::Real(value) => *value,
            other => panic!("matrix operand is not a number: {other:?}"),
        };
    }
    out
}

/// `m x n`, the PDF matrix product (`m` applied first).
fn concat(m: [f32; 6], n: [f32; 6]) -> [f32; 6] {
    [
        m[0] * n[0] + m[1] * n[2],
        m[0] * n[1] + m[1] * n[3],
        m[2] * n[0] + m[3] * n[2],
        m[2] * n[1] + m[3] * n[3],
        m[4] * n[0] + m[5] * n[2] + n[4],
        m[4] * n[1] + m[5] * n[3] + n[5],
    ]
}

fn apply(m: [f32; 6], x: f32, y: f32) -> (f32, f32) {
    (x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5])
}
