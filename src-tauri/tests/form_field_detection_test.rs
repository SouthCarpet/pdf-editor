// Plan 050 task D2: scanned form field detection on the real sample.
//
// The ADR `.vault/process/plans/plan_v1_scanned_form_field_detection.md`
// section "Verification plan for D2-impl" lists what "verified on
// hodiny.pdf" means. Every bullet there has an assertion here.
//
// hodiny.pdf is a Genius Scan JPEG-only PDF: one page, no text layer, no
// AcroForm, MediaBox [0 0 595.44 841.91519], no /Rotate, no /CropBox.
//
// Gated behind `sidecar-tests` like the other tests that need a real
// binary: detection renders the page through the mutool sidecar.
use lopdf::Object;
use pdf_editor_lib::services::annotations::{apply_annotations, Annotation};
use pdf_editor_lib::services::form_field_detection::{
    detect_scanned_form_fields, DetectedFieldKind, DetectedFormField, DetectionAnalysis,
};
use pdf_editor_lib::services::text_style::TextStyle;
use pdf_editor_lib::sidecars::manager::SidecarManager;
use pdf_editor_lib::sidecars::mupdf::MupdfWrapper;
use std::path::{Path, PathBuf};
use tempfile::TempDir;

const HODINY: &str = "tests/fixtures/pdfs/hodiny.pdf";
const DPI: u32 = 150;
const PAGE_WIDTH_PT: f32 = 595.44;
const PAGE_HEIGHT_PT: f32 = 841.915_19;

// Locked after plan 119 p1 (debug note 051): 170 fields, all boxes, on a
// 1241x1754 raster (2026-10-12). The earlier lock (327 fields: 170 box and
// 157 underline, 2026-08-29) counted every table border a second time as an
// underline inside the cell its box already covered. hodiny.pdf has no
// free-standing line to write on ("Datum von:" and "Bis:" have none), so
// zero underlines is the correct count. The +/-10% band allows minor
// raster/toolchain drift; a field per cell border would leave it at once.
const MIN_FIELDS: usize = 153;
const MAX_FIELDS: usize = 187;
const FIRST_MO_ROW_BOTTOM_PT: f32 = 624.0;
const FIRST_MO_ROW_TOP_PT: f32 = 642.0;
const COLUMN_POSITION_TOLERANCE_PT: f32 = 0.5;

async fn detect() -> DetectionAnalysis {
    let mupdf = MupdfWrapper::new(SidecarManager::new(2));
    detect_scanned_form_fields(&mupdf, Path::new(HODINY), 0, DPI)
        .await
        .expect("detection runs on hodiny.pdf")
}

#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "renders the page through the real mutool sidecar; --features sidecar-tests"
)]
async fn hodiny_yields_one_box_per_cell_inside_the_locked_band() {
    let analysis = detect().await;
    let boxes = analysis
        .fields
        .iter()
        .filter(|field| field.kind == DetectedFieldKind::Box)
        .count();
    let underlines = analysis
        .fields
        .iter()
        .filter(|field| field.kind == DetectedFieldKind::Underline)
        .count();
    println!(
        "hodiny.pdf: {} fields ({boxes} boxes, {underlines} underlines), raster {}x{}",
        analysis.fields.len(),
        analysis.raster_width,
        analysis.raster_height
    );
    let mut first_mo_row_rects: Vec<[f32; 4]> = analysis
        .fields
        .iter()
        .filter(|field| {
            field.rect[1] >= FIRST_MO_ROW_BOTTOM_PT && field.rect[3] <= FIRST_MO_ROW_TOP_PT
        })
        .map(|field| field.rect)
        .collect();
    first_mo_row_rects.sort_by(|left, right| left[0].total_cmp(&right[0]));
    println!("hodiny first Mo row fields sorted by x: {first_mo_row_rects:#?}");

    assert!(boxes >= 1, "the sample has visible empty boxes");
    assert_eq!(
        underlines, 0,
        "every line on the sample is a table border, so none is its own field"
    );
    assert!(
        (MIN_FIELDS..=MAX_FIELDS).contains(&analysis.fields.len()),
        "field count {} left the locked band [{MIN_FIELDS}, {MAX_FIELDS}] \
         ({boxes} boxes, {underlines} underlines)",
        analysis.fields.len()
    );

    assert_eq!(
        first_mo_row_rects.len(),
        5,
        "the first Mo row must yield one field in each of its five value columns: \
         {first_mo_row_rects:?}"
    );
    assert!(
        first_mo_row_rects
            .windows(2)
            .all(|pair| pair[0][2] < pair[1][0]),
        "the first Mo row fields must be disjoint and ordered left to right: \
         {first_mo_row_rects:?}"
    );

    // Oracle: the five column boundaries measured from the locked fixture's
    // first Mo row, allowing roughly one 150-DPI pixel. They are the same
    // columns the 2026-08-29 lock measured on the duplicate underlines.
    let expected_x_ranges = [
        [97.400_74, 153.058_3],
        [156.416_95, 214.473_56],
        [217.832_2, 273.489_78],
        [276.368_6, 342.581_9],
        [345.460_75, 522.989_2],
    ];
    for (actual, expected) in first_mo_row_rects.iter().zip(expected_x_ranges) {
        assert!(
            (actual[0] - expected[0]).abs() < COLUMN_POSITION_TOLERANCE_PT
                && (actual[2] - expected[1]).abs() < COLUMN_POSITION_TOLERANCE_PT,
            "first Mo row field {actual:?} left its expected column {expected:?}"
        );
    }

    let table_width = first_mo_row_rects[4][2] - first_mo_row_rects[0][0];
    assert!(
        first_mo_row_rects
            .iter()
            .all(|rect| rect[2] - rect[0] < table_width * 0.5),
        "no first Mo row field may span multiple columns (table width {table_width}): \
         {first_mo_row_rects:?}"
    );
}

#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "renders the page through the real mutool sidecar; --features sidecar-tests"
)]
async fn accepted_candidates_satisfy_every_filter() {
    let analysis = detect().await;
    let width = analysis.raster_width;
    let height = analysis.raster_height;

    for candidate in &analysis.boxes {
        assert!(
            candidate.extent >= 0.6,
            "the shoelace extent filter let {:?} through",
            candidate.rect
        );
        assert!(
            candidate.rect.x0 > 2
                && candidate.rect.y0 > 2
                && candidate.rect.x1 < width - 2
                && candidate.rect.y1 < height - 2,
            "the edge-touch filter let {:?} through",
            candidate.rect
        );
        let coverage = (candidate.rect.width() as f32 * candidate.rect.height() as f32)
            / (width as f32 * height as f32);
        assert!(
            coverage < 0.9,
            "a box covering {coverage} of the page is the outer frame, not a field"
        );
    }
}

#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "renders the page through the real mutool sidecar; --features sidecar-tests"
)]
async fn every_rect_is_inside_the_mediabox_and_matches_the_naive_mapping() {
    let analysis = detect().await;
    // hodiny.pdf has origin 0 and rotation 0, so the general mapping must
    // still agree with `pixel / (dpi / 72)` here. The only difference
    // allowed is the sub-pixel rounding mutool applies when it sizes the
    // raster.
    let naive = 72.0 / DPI as f32;
    let sx = PAGE_WIDTH_PT / analysis.raster_width as f32;
    let sy = PAGE_HEIGHT_PT / analysis.raster_height as f32;
    assert!(
        (sx - naive).abs() < 0.01 && (sy - naive).abs() < 0.01,
        "the render scale drifted from the naive formula: sx={sx} sy={sy} naive={naive}"
    );

    for field in &analysis.fields {
        let [x0, y0, x1, y1] = field.rect;
        assert!(
            x0 >= 0.0
                && y0 >= 0.0
                && x1 <= PAGE_WIDTH_PT
                && y1 <= PAGE_HEIGHT_PT
                && x0 < x1
                && y0 < y1,
            "rect {:?} is outside the MediaBox",
            field.rect
        );

        let pixel_x0 = (x0 / sx).round();
        let pixel_x1 = (x1 / sx).round();
        let pixel_y0 = ((PAGE_HEIGHT_PT - y1) / sy).round();
        let pixel_y1 = ((PAGE_HEIGHT_PT - y0) / sy).round();
        let naive_rect = [
            pixel_x0 * naive,
            PAGE_HEIGHT_PT - pixel_y1 * naive,
            pixel_x1 * naive,
            PAGE_HEIGHT_PT - pixel_y0 * naive,
        ];
        for index in 0..4 {
            assert!(
                (field.rect[index] - naive_rect[index]).abs() < 0.5,
                "general mapping {:?} disagrees with naive mapping {naive_rect:?}",
                field.rect
            );
        }
    }
}

#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "renders the page through the real mutool sidecar; --features sidecar-tests"
)]
async fn detection_is_deterministic() {
    let first = detect().await;
    let second = detect().await;
    assert_eq!(first.fields, second.fields);
}

#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "renders the page through the real mutool sidecar; --features sidecar-tests"
)]
async fn filling_two_cells_writes_rects_inside_the_detected_fields() {
    let analysis = detect().await;
    let cells = first_mo_row(&analysis.fields);
    let (first, second) = (cells[0], cells[1]);

    let tmp = TempDir::new().unwrap();
    let output: PathBuf = tmp.path().join("hodiny.filled.pdf");
    let annotations = vec![free_text(first, "07:00"), free_text(second, "15:30")];
    apply_annotations(Path::new(HODINY), &output, &annotations).expect("fill the detected fields");

    let written = annotation_rects(&output);
    assert_eq!(written.len(), 2, "one FreeText per filled field");
    for (annot, field) in written.iter().zip([first, second]) {
        for (index, value) in annot.iter().enumerate() {
            assert!(
                (value - field.rect[index]).abs() < 0.01,
                "the exported /Rect {annot:?} does not match the detected rect {:?}",
                field.rect
            );
        }
    }
}

// Plan 119 p1 (debug note 053): the app's second save now starts from the
// first saved copy and writes over it. Both saves' values must survive.
#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "renders the page through the real mutool sidecar; --features sidecar-tests"
)]
async fn a_second_save_over_the_saved_copy_keeps_the_first_values() {
    let analysis = detect().await;
    let cells = first_mo_row(&analysis.fields);
    let tmp = TempDir::new().unwrap();
    let saved: PathBuf = tmp.path().join("hodiny.filled.pdf");

    apply_annotations(Path::new(HODINY), &saved, &[free_text(cells[0], "07:00")])
        .expect("first save");
    apply_annotations(&saved, &saved, &[free_text(cells[1], "Štúrovo č. 5")])
        .expect("second save over the saved copy");

    assert_eq!(
        annotation_contents(&saved),
        vec!["07:00".to_string(), "Štúrovo č. 5".to_string()]
    );
}

fn first_mo_row(fields: &[DetectedFormField]) -> Vec<&DetectedFormField> {
    let mut row: Vec<&DetectedFormField> = fields
        .iter()
        .filter(|field| {
            field.rect[1] >= FIRST_MO_ROW_BOTTOM_PT && field.rect[3] <= FIRST_MO_ROW_TOP_PT
        })
        .collect();
    row.sort_by(|left, right| left.rect[0].total_cmp(&right.rect[0]));
    assert_eq!(row.len(), 5, "the first Mo row has five value cells");
    row
}

// Plan 119 p1 (debug note 051): the owner saw two fields inside one visible
// cell of hodiny.pdf. Two fields that share half of the smaller one's area
// are two fields in one cell.
#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "renders the page through the real mutool sidecar; --features sidecar-tests"
)]
async fn no_two_fields_share_one_visible_cell() {
    let analysis = detect().await;
    let mut shared = Vec::new();
    for (index, left) in analysis.fields.iter().enumerate() {
        for right in &analysis.fields[index + 1..] {
            let overlap = overlap_area(left.rect, right.rect);
            let smaller = rect_area(left.rect).min(rect_area(right.rect));
            if smaller > 0.0 && overlap >= smaller * 0.5 {
                shared.push((left.id.clone(), right.id.clone()));
            }
        }
    }
    assert!(
        shared.is_empty(),
        "{} field pairs share one cell: {shared:?}",
        shared.len()
    );
}

fn rect_area(rect: [f32; 4]) -> f32 {
    (rect[2] - rect[0]).max(0.0) * (rect[3] - rect[1]).max(0.0)
}

fn overlap_area(left: [f32; 4], right: [f32; 4]) -> f32 {
    rect_area([
        left[0].max(right[0]),
        left[1].max(right[1]),
        left[2].min(right[2]),
        left[3].min(right[3]),
    ])
}

fn free_text(field: &DetectedFormField, contents: &str) -> Annotation {
    let height = field.rect[3] - field.rect[1];
    Annotation::FreeText {
        page: field.page_index,
        rect: field.rect,
        contents: contents.to_string(),
        style: TextStyle {
            size_pt: 12.0_f32.min(height * 0.6),
            ..TextStyle::default()
        },
        background_fill: None,
        border_color: [0.0, 0.0, 0.0],
        border_width: 0.0,
        auto_resize: false,
    }
}

/// Reads the `/Contents` of every annotation on page 1 of an exported PDF.
fn annotation_contents(path: &Path) -> Vec<String> {
    page_annotations(path)
        .iter()
        .map(|dict| pdf_text_string(dict.get(b"Contents").unwrap().as_str().unwrap()))
        .collect()
}

/// A PDF text string is UTF-16BE behind a byte order mark, or
/// PDFDocEncoding (Latin-1 for the characters these tests write).
fn pdf_text_string(bytes: &[u8]) -> String {
    match bytes {
        [0xFE, 0xFF, rest @ ..] => String::from_utf16(
            &rest
                .chunks(2)
                .map(|pair| u16::from_be_bytes([pair[0], pair[1]]))
                .collect::<Vec<_>>(),
        )
        .unwrap(),
        other => other.iter().map(|&byte| char::from(byte)).collect(),
    }
}

/// Reads the `/Rect` of every annotation on page 1 of an exported PDF.
fn annotation_rects(path: &Path) -> Vec<[f32; 4]> {
    page_annotations(path)
        .iter()
        .map(|dict| {
            let rect = dict.get(b"Rect").unwrap().as_array().unwrap();
            let value = |index: usize| rect[index].as_float().unwrap();
            [value(0), value(1), value(2), value(3)]
        })
        .collect()
}

/// Every annotation dictionary on page 1 of an exported PDF, in order.
fn page_annotations(path: &Path) -> Vec<lopdf::Dictionary> {
    let doc =
        pdf_editor_lib::services::pdf_guard::load_guarded(path).expect("load the exported PDF");
    let page_id = *doc.get_pages().get(&1).expect("page 1");
    let page = doc.get_dictionary(page_id).expect("page dictionary");
    let annots = page.get(b"Annots").expect("the page carries /Annots");
    let entries = match annots {
        Object::Reference(id) => doc.get_object(*id).unwrap().as_array().unwrap().clone(),
        other => other.as_array().unwrap().clone(),
    };
    entries
        .iter()
        .map(|entry| match entry {
            Object::Reference(id) => doc.get_object(*id).unwrap().as_dict().unwrap().clone(),
            other => other.as_dict().unwrap().clone(),
        })
        .collect()
}
