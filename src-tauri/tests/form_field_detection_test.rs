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

// Locked from the first honest run of this pipeline against hodiny.pdf:
// 203 fields, 170 box and 33 underline, on a 1241x1754 raster
// (2026-08-28). The sample is an hours grid, so the box count is mostly
// real table cells, which the ADR's hole-first rule requires to survive.
// The band is a tolerance around that measurement, not a number invented
// at design time. A count outside it means the pipeline changed behaviour
// on a file that did not change.
const MIN_FIELDS: usize = 180;
const MAX_FIELDS: usize = 225;

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
async fn hodiny_yields_boxes_and_underlines_inside_the_locked_band() {
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

    assert!(boxes >= 1, "the sample has visible empty boxes");
    assert!(underlines >= 1, "the sample has visible empty lines");
    assert!(
        (MIN_FIELDS..=MAX_FIELDS).contains(&analysis.fields.len()),
        "field count {} left the locked band [{MIN_FIELDS}, {MAX_FIELDS}] \
         ({boxes} boxes, {underlines} underlines)",
        analysis.fields.len()
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
async fn filling_one_box_and_one_underline_writes_rects_inside_the_detected_fields() {
    let analysis = detect().await;
    let box_field = first_of(&analysis.fields, DetectedFieldKind::Box);
    let underline_field = first_of(&analysis.fields, DetectedFieldKind::Underline);

    let tmp = TempDir::new().unwrap();
    let output: PathBuf = tmp.path().join("hodiny.filled.pdf");
    let annotations = vec![
        free_text(box_field, "Peter"),
        free_text(underline_field, "12.5"),
    ];
    apply_annotations(Path::new(HODINY), &output, &annotations).expect("fill the detected fields");

    let written = annotation_rects(&output);
    assert_eq!(written.len(), 2, "one FreeText per filled field");
    println!(
        "fill proof: box detected {:?}, written {:?}; underline detected {:?}, written {:?}",
        box_field.rect, written[0], underline_field.rect, written[1]
    );
    for (annot, field) in written.iter().zip([box_field, underline_field]) {
        for (index, value) in annot.iter().enumerate() {
            assert!(
                (value - field.rect[index]).abs() < 0.01,
                "the exported /Rect {annot:?} does not match the detected rect {:?}",
                field.rect
            );
        }
    }

    // The underline fill rect is the expanded whitespace band, not the
    // 1 to 5 pixel stroke (which would be under 2.5pt at 150 DPI).
    let underline_height = underline_field.rect[3] - underline_field.rect[1];
    assert!(
        underline_height > 3.0,
        "the underline fill rect was not expanded: {underline_height}pt"
    );
}

fn first_of(fields: &[DetectedFormField], kind: DetectedFieldKind) -> &DetectedFormField {
    fields
        .iter()
        .find(|field| field.kind == kind)
        .unwrap_or_else(|| panic!("hodiny.pdf must yield at least one {kind:?} field"))
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

/// Reads the `/Rect` of every annotation on page 1 of an exported PDF.
fn annotation_rects(path: &Path) -> Vec<[f32; 4]> {
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
        .map(|entry| {
            let dict = match entry {
                Object::Reference(id) => doc.get_object(*id).unwrap().as_dict().unwrap(),
                other => other.as_dict().unwrap(),
            };
            let rect = dict.get(b"Rect").unwrap().as_array().unwrap();
            let value = |index: usize| rect[index].as_float().unwrap();
            [value(0), value(1), value(2), value(3)]
        })
        .collect()
}
