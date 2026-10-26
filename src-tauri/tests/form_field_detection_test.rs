// Plan 050 task D2: scanned form field detection on the synthetic scan.
//
// The design note "Verification plan for D2-impl" lists what "verified on
// timesheet-scan.pdf" means. Every bullet there has an assertion here.
//
// timesheet-scan.pdf is a generated 1-bit image-only PDF: one page,
// no text layer or AcroForm, MediaBox [0 0 595.44 841.91519],
// rotation 0, no /CropBox.
//
// Gated behind `sidecar-tests` like the other tests that need a real
// binary: detection renders the page through the mutool sidecar.
use lopdf::Object;
use pdf_editor_lib::services::annotations::{apply_annotations, save_annotations, Annotation};
use pdf_editor_lib::services::form_field_detection::{
    detect_scanned_form_fields, DetectedFieldKind, DetectedFormField, DetectionAnalysis,
};
use pdf_editor_lib::services::text_style::TextStyle;
use pdf_editor_lib::sidecars::manager::SidecarManager;
use pdf_editor_lib::sidecars::mupdf::MupdfWrapper;
use std::path::{Path, PathBuf};
use tempfile::TempDir;

const TIMESHEET: &str = "tests/fixtures/pdfs/timesheet-scan.pdf";
const DPI: u32 = 150;
const PAGE_WIDTH_PT: f32 = 595.44;
const PAGE_HEIGHT_PT: f32 = 841.915_19;

// Synthetic grid: 35 empty value cells plus one signature cell.
// The +/-10% band allows minor raster/toolchain drift, but rejects a
// duplicate underline for every table border.
const MIN_FIELDS: usize = 32;
const MAX_FIELDS: usize = 40;
// "Sign:" leaves a wide free stretch to type in.
const SIGNATURE_CELL_PT: [f32; 4] = [53.0, 160.0, 344.0, 180.0];
// "Day" fills a narrow label cell.
const DAY_LABEL_CELL_PT: [f32; 4] = [53.0, 644.0, 94.0, 664.0];
const FIRST_MO_ROW_BOTTOM_PT: f32 = 624.0;
const FIRST_MO_ROW_TOP_PT: f32 = 644.0;
const COLUMN_POSITION_TOLERANCE_PT: f32 = 0.5;

async fn detect() -> DetectionAnalysis {
    let mupdf = MupdfWrapper::new(SidecarManager::new(2));
    detect_scanned_form_fields(&mupdf, Path::new(TIMESHEET), 0, DPI)
        .await
        .expect("detection runs on timesheet-scan.pdf")
}

#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "renders the page through the real mutool sidecar; --features sidecar-tests"
)]
async fn timesheet_yields_one_box_per_cell_inside_the_locked_band() {
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
        "timesheet-scan.pdf: {} fields ({boxes} boxes, {underlines} underlines), raster {}x{}",
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
    println!("timesheet-scan first Mo row fields sorted by x: {first_mo_row_rects:#?}");

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

    assert!(
        analysis
            .fields
            .iter()
            .any(|field| covers(field.rect, SIGNATURE_CELL_PT)),
        "the signature cell (label plus free space) stays a field"
    );
    assert!(
        !analysis
            .fields
            .iter()
            .any(|field| covers(field.rect, DAY_LABEL_CELL_PT)),
        "the Day label cell is not a field"
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

    // Column interiors measured from the generated scan at 150 DPI.
    let expected_x_ranges = [
        [94.5, 153.5],
        [154.5, 213.5],
        [214.5, 273.5],
        [274.5, 343.5],
        [344.5, 523.5],
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
    // timesheet-scan.pdf has origin 0 and rotation 0, so the general mapping must
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
    let output: PathBuf = tmp.path().join("timesheet-scan.filled.pdf");
    let annotations = vec![free_text(first, "07:00"), free_text(second, "15:30")];
    apply_annotations(Path::new(TIMESHEET), &output, &annotations)
        .expect("fill the detected fields");

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
    let saved: PathBuf = tmp.path().join("timesheet-scan.filled.pdf");

    apply_annotations(
        Path::new(TIMESHEET),
        &saved,
        &[free_text(cells[0], "07:00")],
    )
    .expect("first save");
    apply_annotations(&saved, &saved, &[free_text(cells[1], "Štúrovo č. 5")])
        .expect("second save over the saved copy");

    assert_eq!(
        annotation_contents(&saved),
        vec!["07:00".to_string(), "Štúrovo č. 5".to_string()]
    );
}

// Plan 119 p1b (debug note 055): fill, save, click the same cell, change,
// save, reopen: one annotation, with the new value.
#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "renders the page through the real mutool sidecar; --features sidecar-tests"
)]
async fn editing_a_saved_value_replaces_it() {
    let analysis = detect().await;
    let cell = first_mo_row(&analysis.fields)[0];
    let tmp = TempDir::new().unwrap();
    let saved: PathBuf = tmp.path().join("timesheet-scan.filled.pdf");

    let written = save_annotations(
        Path::new(TIMESHEET),
        &saved,
        &[free_text(cell, "07:00")],
        &[],
    )
    .expect("first save");
    let old = written[0].expect("the value was written");
    save_annotations(&saved, &saved, &[free_text(cell, "08:30")], &[old])
        .expect("save the edited value");

    assert_eq!(annotation_contents(&saved), vec!["08:30".to_string()]);
}

// Plan 119 p1 (debug note 053): reopening a saved copy must find the same
// cells. Its values are FreeText annotations; detection renders the page
// without them, so a cell full of text is still the empty printed cell.
#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "renders the page through the real mutool sidecar; --features sidecar-tests"
)]
async fn a_saved_copy_with_values_yields_the_same_fields() {
    let original = detect().await;
    let values: Vec<Annotation> = first_mo_row(&original.fields)
        .into_iter()
        .map(|cell| free_text(cell, "Štúrovo námestie č. 5, Ľubica"))
        .collect();
    let tmp = TempDir::new().unwrap();
    let saved: PathBuf = tmp.path().join("timesheet-scan.filled.pdf");
    apply_annotations(Path::new(TIMESHEET), &saved, &values).expect("save the values");

    let mupdf = MupdfWrapper::new(SidecarManager::new(2));
    let reopened = detect_scanned_form_fields(&mupdf, &saved, 0, DPI)
        .await
        .expect("detection runs on the saved copy");

    assert_eq!(reopened.fields, original.fields);
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

// Regression for duplicate box/underline candidates in one visible cell.
// The synthetic scan keeps table borders that exercise both candidates.
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

/// True when `rect` matches `cell` within two points on every side.
fn covers(rect: [f32; 4], cell: [f32; 4]) -> bool {
    rect.iter()
        .zip(cell)
        .all(|(value, expected)| (value - expected).abs() < 2.0)
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
