use crate::error::{AppError, AppResult};
use crate::services::ocr_geometry::{page_geometry, OcrPageGeometry};
use crate::sidecars::mupdf::MupdfWrapper;
use image::{GrayImage, Luma};
use imageproc::contours::{find_contours, BorderType};
use imageproc::distance_transform::Norm;
use imageproc::morphology::dilate_mut;
use serde::{Deserialize, Serialize};
use std::path::Path;

const INK_THRESHOLD: u8 = 200;
const MIN_BOX_WIDTH: u32 = 30;
const MIN_BOX_HEIGHT: u32 = 12;
const MIN_BOX_EXTENT: f32 = 0.6;
const EDGE_MARGIN: u32 = 2;
const MIN_UNDERLINE_LENGTH: u32 = 60;
const MAX_STROKE_THICKNESS: u32 = 5;
const MIN_WHITESPACE_HEIGHT: u32 = 8;
const MAX_WHITESPACE_HEIGHT: u32 = 20;
const MAX_WHITESPACE_DENSITY: f32 = 0.05;
// At the 150 DPI detection scale, 30 px is 14.4 pt (about 5 mm): enough
// room for a short value while discarding border-adjacent slivers.
const MIN_SPLIT_UNDERLINE_WIDTH: u32 = 30;
const VERTICAL_STROKE_TOLERANCE: u32 = 2;
// A stroke within 3 px of a box edge is that edge: the box is the hole of
// the mask after a one-pixel dilation, so it sits 1 to 2 px inside the line.
const BOX_EDGE_TOLERANCE: u32 = 3;
const MIN_STROKE_OVERLAP: f32 = 0.8;
const MIN_NESTED_AREA: f32 = 0.5;
// Label cells (plan 119 p1, debug note 051). Ink in a horizontal run of
// 30 px or more is a rule or an underscore run, not printed label text.
// Fewer than 40 label-ink pixels is scan noise. A cell with label text is
// a field only when the label leaves a free stretch of at least 60 px
// (about 10 mm) and at least half of the cell's inner width.
const LABEL_INSET: u32 = 2;
const MIN_LABEL_INK: u32 = 40;
const MIN_FREE_WRITING_WIDTH: u32 = 60;

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq)]
pub struct DetectedFormField {
    pub id: String,
    pub page_index: u32,
    pub rect: [f32; 4],
    pub kind: DetectedFieldKind,
    pub confidence: f32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DetectedFieldKind {
    Box,
    Underline,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PixelRect {
    pub x0: u32,
    pub y0: u32,
    pub x1: u32,
    pub y1: u32,
}

impl PixelRect {
    pub fn width(self) -> u32 {
        self.x1.saturating_sub(self.x0)
    }

    pub fn height(self) -> u32 {
        self.y1.saturating_sub(self.y0)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct BoxCandidate {
    pub rect: PixelRect,
    pub extent: f32,
}

#[derive(Debug, Clone, PartialEq)]
struct UnderlineCandidate {
    fill_rect: PixelRect,
    stroke_rect: PixelRect,
    confidence: f32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DetectionAnalysis {
    pub fields: Vec<DetectedFormField>,
    pub boxes: Vec<BoxCandidate>,
    pub raster_width: u32,
    pub raster_height: u32,
}

pub async fn detect_scanned_form_fields(
    mupdf: &MupdfWrapper,
    path: &Path,
    page_index: u32,
    dpi: u32,
) -> AppResult<DetectionAnalysis> {
    let scratch = tempfile::tempdir().map_err(AppError::from)?;
    let mut doc =
        crate::services::pdf_guard::load_guarded(path).map_err(|error| AppError::PdfCorrupted {
            detail: error.to_string(),
        })?;
    let page_id = doc
        .get_pages()
        .get(&(page_index + 1))
        .copied()
        .ok_or_else(|| AppError::InvalidArgument {
            detail: format!("page index {page_index} is outside the document"),
        })?;
    let geometry = page_geometry(&doc, page_id).map_err(AppError::from)?;
    let printed_page = page_without_annotations(&mut doc, page_id, path, scratch.path())?;

    let raster_path = scratch.path().join("page.png");
    mupdf
        .render_page_to_png(&printed_page, page_index, &raster_path, dpi, None)
        .await?;

    let gray = image::open(&raster_path)
        .map_err(|error| AppError::Internal {
            detail: format!("load rendered form page: {error}"),
        })?
        .into_luma8();

    Ok(analyze_form_raster(&gray, geometry, page_index))
}

/// Plan 119 p1: detection looks at the printed form, not at values typed
/// into it. A saved copy carries its values as FreeText annotations; drawn
/// into the raster they would turn a filled cell into a label cell and hide
/// it on reopen. Returns `path` itself when the page has no annotations.
fn page_without_annotations(
    doc: &mut lopdf::Document,
    page_id: lopdf::ObjectId,
    path: &Path,
    scratch: &Path,
) -> AppResult<std::path::PathBuf> {
    let page = doc
        .get_dictionary_mut(page_id)
        .map_err(|error| AppError::PdfCorrupted {
            detail: error.to_string(),
        })?;
    if page.remove(b"Annots").is_none() {
        return Ok(path.to_path_buf());
    }
    let printed = scratch.join("printed.pdf");
    doc.save(&printed).map_err(|error| AppError::Internal {
        detail: format!("write the page without annotations: {error}"),
    })?;
    Ok(printed)
}

pub(crate) fn analyze_form_raster(
    gray: &GrayImage,
    geometry: OcrPageGeometry,
    page_index: u32,
) -> DetectionAnalysis {
    let mask = threshold(gray);
    let all_boxes = find_box_candidates(&mask);
    // Split first, suppress second (plan 119 p1, debug note 051): a table
    // border that spans several cells only matches one cell box after the
    // column split has cut it into per-cell segments.
    let underlines = split_underlines_at_vertical_strokes(&mask, find_underline_candidates(&mask));
    let underlines = suppress_underlines_on_boxes(underlines, &all_boxes);
    let boxes = drop_label_cells(&mask, drop_container_boxes(all_boxes));
    let mut candidates: Vec<(PixelRect, DetectedFieldKind, f32)> = boxes
        .iter()
        .map(|candidate| {
            let confidence = if candidate.extent >= 0.85 { 0.9 } else { 0.6 };
            (candidate.rect, DetectedFieldKind::Box, confidence)
        })
        .chain(underlines.into_iter().map(|candidate| {
            (
                candidate.fill_rect,
                DetectedFieldKind::Underline,
                candidate.confidence,
            )
        }))
        .collect();
    candidates.sort_by_key(|(rect, kind, _)| {
        (
            rect.y0,
            rect.x0,
            match kind {
                DetectedFieldKind::Box => 0,
                DetectedFieldKind::Underline => 1,
            },
        )
    });

    let fields = candidates
        .into_iter()
        .enumerate()
        .map(|(ordinal, (rect, kind, confidence))| DetectedFormField {
            id: format!("{page_index}:{ordinal}"),
            page_index,
            rect: pixel_rect_to_pdf(rect, gray.width(), gray.height(), geometry),
            kind,
            confidence,
        })
        .collect();

    DetectionAnalysis {
        fields,
        boxes,
        raster_width: gray.width(),
        raster_height: gray.height(),
    }
}

fn threshold(gray: &GrayImage) -> GrayImage {
    GrayImage::from_fn(gray.width(), gray.height(), |x, y| {
        Luma([if gray.get_pixel(x, y)[0] < INK_THRESHOLD {
            255
        } else {
            0
        }])
    })
}

fn find_box_candidates(mask: &GrayImage) -> Vec<BoxCandidate> {
    let mut joined = mask.clone();
    dilate_mut(&mut joined, Norm::LInf, 1);
    find_contours::<u32>(&joined)
        .into_iter()
        .filter(|contour| contour.border_type == BorderType::Hole)
        .filter_map(|contour| {
            let rect = contour_bounds(&contour.points)?;
            let extent = polygon_area(&contour.points) / (rect.width() * rect.height()) as f32;
            box_candidate_passes(rect, extent, mask.width(), mask.height())
                .then_some(BoxCandidate { rect, extent })
        })
        .collect()
}

fn contour_bounds(points: &[imageproc::point::Point<u32>]) -> Option<PixelRect> {
    let min_x = points.iter().map(|point| point.x).min()?;
    let min_y = points.iter().map(|point| point.y).min()?;
    let max_x = points.iter().map(|point| point.x).max()?;
    let max_y = points.iter().map(|point| point.y).max()?;
    Some(PixelRect {
        x0: min_x,
        y0: min_y,
        x1: max_x + 1,
        y1: max_y + 1,
    })
}

fn polygon_area(points: &[imageproc::point::Point<u32>]) -> f32 {
    if points.len() < 3 {
        return 0.0;
    }
    let twice_area: i64 = points
        .iter()
        .zip(points.iter().cycle().skip(1))
        .take(points.len())
        .map(|(left, right)| {
            i64::from(left.x) * i64::from(right.y) - i64::from(right.x) * i64::from(left.y)
        })
        .sum();
    twice_area.unsigned_abs() as f32 / 2.0
}

fn box_candidate_passes(rect: PixelRect, extent: f32, page_width: u32, page_height: u32) -> bool {
    rect.width() >= MIN_BOX_WIDTH
        && rect.width() as f32 <= page_width as f32 * 0.9
        && rect.height() >= MIN_BOX_HEIGHT
        && rect.height() as f32 <= page_height as f32 * 0.15
        && extent >= MIN_BOX_EXTENT
        && rect.x0 > EDGE_MARGIN
        && rect.y0 > EDGE_MARGIN
        && rect.x1 < page_width.saturating_sub(EDGE_MARGIN)
        && rect.y1 < page_height.saturating_sub(EDGE_MARGIN)
}

#[derive(Debug, Clone)]
struct StrokeGroup {
    x0: u32,
    x1: u32,
    y0: u32,
    y1: u32,
    stable: bool,
}

fn find_underline_candidates(mask: &GrayImage) -> Vec<UnderlineCandidate> {
    let mut groups: Vec<StrokeGroup> = Vec::new();
    for y in 0..mask.height() {
        for (x0, x1) in ink_runs(mask, y) {
            if x1 - x0 < MIN_UNDERLINE_LENGTH {
                continue;
            }
            let matching = groups.iter_mut().rev().find(|group| {
                group.y1 == y
                    && group.y1 - group.y0 < MAX_STROKE_THICKNESS
                    && ranges_overlap_with_tolerance(group.x0, group.x1, x0, x1, 2)
            });
            if let Some(group) = matching {
                group.stable &= group.x0.abs_diff(x0) <= 2 && group.x1.abs_diff(x1) <= 2;
                group.x0 = group.x0.min(x0);
                group.x1 = group.x1.max(x1);
                group.y1 = y + 1;
            } else {
                groups.push(StrokeGroup {
                    x0,
                    x1,
                    y0: y,
                    y1: y + 1,
                    stable: true,
                });
            }
        }
    }

    groups
        .into_iter()
        .filter_map(|group| underline_from_group(mask, group))
        .collect()
}

fn ink_runs(mask: &GrayImage, y: u32) -> Vec<(u32, u32)> {
    let mut runs = Vec::new();
    let mut x = 0;
    while x < mask.width() {
        if mask.get_pixel(x, y)[0] == 0 {
            x += 1;
            continue;
        }
        let start = x;
        while x < mask.width() && mask.get_pixel(x, y)[0] != 0 {
            x += 1;
        }
        runs.push((start, x));
    }
    runs
}

fn underline_from_group(mask: &GrayImage, group: StrokeGroup) -> Option<UnderlineCandidate> {
    let thickness = group.y1 - group.y0;
    if thickness > MAX_STROKE_THICKNESS || group.y0 < MIN_WHITESPACE_HEIGHT {
        return None;
    }
    let whitespace_height = group.y0.min(MAX_WHITESPACE_HEIGHT);
    if whitespace_height < MIN_WHITESPACE_HEIGHT {
        return None;
    }
    let whitespace_y = group.y0 - whitespace_height;
    let density = ink_density(mask, group.x0, whitespace_y, group.x1, group.y0);
    if density >= MAX_WHITESPACE_DENSITY {
        return None;
    }
    Some(UnderlineCandidate {
        fill_rect: PixelRect {
            x0: group.x0,
            y0: whitespace_y,
            x1: group.x1,
            y1: group.y1,
        },
        stroke_rect: PixelRect {
            x0: group.x0,
            y0: group.y0,
            x1: group.x1,
            y1: group.y1,
        },
        confidence: if group.stable && density < 0.01 {
            0.9
        } else {
            0.6
        },
    })
}

fn ink_density(mask: &GrayImage, x0: u32, y0: u32, x1: u32, y1: u32) -> f32 {
    let area = (x1 - x0) * (y1 - y0);
    if area == 0 {
        return 1.0;
    }
    let ink = (y0..y1)
        .flat_map(|y| (x0..x1).map(move |x| (x, y)))
        .filter(|&(x, y)| mask.get_pixel(x, y)[0] != 0)
        .count();
    ink as f32 / area as f32
}

fn split_underlines_at_vertical_strokes(
    mask: &GrayImage,
    underlines: Vec<UnderlineCandidate>,
) -> Vec<UnderlineCandidate> {
    underlines
        .into_iter()
        .flat_map(|underline| split_underline_at_vertical_strokes(mask, underline))
        .collect()
}

fn split_underline_at_vertical_strokes(
    mask: &GrayImage,
    underline: UnderlineCandidate,
) -> Vec<UnderlineCandidate> {
    let separators = vertical_stroke_ranges(mask, &underline);
    if separators.is_empty() {
        return vec![underline];
    }

    let mut segments = Vec::new();
    let mut segment_x0 = underline.fill_rect.x0;
    for (stroke_x0, stroke_x1) in separators {
        if let Some(segment) = underline_segment(&underline, segment_x0, stroke_x0) {
            segments.push(segment);
        }
        segment_x0 = stroke_x1;
    }
    if let Some(segment) = underline_segment(&underline, segment_x0, underline.fill_rect.x1) {
        segments.push(segment);
    }
    segments
}

fn underline_segment(
    underline: &UnderlineCandidate,
    x0: u32,
    x1: u32,
) -> Option<UnderlineCandidate> {
    (x1.saturating_sub(x0) >= MIN_SPLIT_UNDERLINE_WIDTH).then_some(UnderlineCandidate {
        fill_rect: PixelRect {
            x0,
            x1,
            ..underline.fill_rect
        },
        stroke_rect: PixelRect {
            x0,
            x1,
            ..underline.stroke_rect
        },
        confidence: underline.confidence,
    })
}

fn vertical_stroke_ranges(mask: &GrayImage, underline: &UnderlineCandidate) -> Vec<(u32, u32)> {
    let mut ranges = Vec::new();
    for x in underline.stroke_rect.x0..underline.stroke_rect.x1 {
        if !has_crossing_vertical_stroke(mask, x, underline) {
            continue;
        }
        match ranges.last_mut() {
            Some((_, x1)) if *x1 == x => *x1 = x + 1,
            _ => ranges.push((x, x + 1)),
        }
    }
    ranges
}

fn has_crossing_vertical_stroke(mask: &GrayImage, x: u32, underline: &UnderlineCandidate) -> bool {
    let minimum_height = underline.fill_rect.height();
    let mut y = 0;
    while y < mask.height() {
        if mask.get_pixel(x, y)[0] == 0 {
            y += 1;
            continue;
        }
        let y0 = y;
        while y < mask.height() && mask.get_pixel(x, y)[0] != 0 {
            y += 1;
        }
        if y - y0 > minimum_height
            && ranges_overlap_with_tolerance(
                y0,
                y,
                underline.stroke_rect.y0,
                underline.stroke_rect.y1,
                VERTICAL_STROKE_TOLERANCE,
            )
        {
            return true;
        }
    }
    false
}

fn ranges_overlap_with_tolerance(
    left_0: u32,
    left_1: u32,
    right_0: u32,
    right_1: u32,
    tolerance: u32,
) -> bool {
    left_0 <= right_1.saturating_add(tolerance) && right_0 <= left_1.saturating_add(tolerance)
}

/// Drops every underline that is part of a box: its stroke lies on a box
/// edge or inside the box (an inner baseline, a typed underscore run), over
/// at least 80 % of the stroke's width. Such a line belongs to the visible
/// cell the box already covers, so keeping it puts two fields in one cell.
fn suppress_underlines_on_boxes(
    underlines: Vec<UnderlineCandidate>,
    boxes: &[BoxCandidate],
) -> Vec<UnderlineCandidate> {
    underlines
        .into_iter()
        .filter(|underline| {
            !boxes.iter().any(|box_candidate| {
                stroke_belongs_to_box(underline.stroke_rect, box_candidate.rect)
            })
        })
        .collect()
}

fn stroke_belongs_to_box(stroke: PixelRect, cell: PixelRect) -> bool {
    // Compare the stroke's near side only: a scanned table border is up to
    // five pixels thick, so its far side sits further from the hole.
    let touches_box_rows =
        stroke.y1 + BOX_EDGE_TOLERANCE >= cell.y0 && stroke.y0 <= cell.y1 + BOX_EDGE_TOLERANCE;
    let overlap = stroke
        .x1
        .min(cell.x1)
        .saturating_sub(stroke.x0.max(cell.x0));
    touches_box_rows && overlap as f32 >= stroke.width() as f32 * MIN_STROKE_OVERLAP
}

/// Drops a box that holds another box covering at least half of its area:
/// a double border or an inner frame draws one visible cell as two nested
/// holes, and the inner one is where the value goes. A small box inside a
/// large one (a checkbox in a corner) stays a separate field.
fn drop_container_boxes(boxes: Vec<BoxCandidate>) -> Vec<BoxCandidate> {
    let keep: Vec<bool> = boxes
        .iter()
        .map(|outer| {
            !boxes.iter().any(|inner| {
                inner.rect != outer.rect
                    && contains(outer.rect, inner.rect)
                    && area(inner.rect) as f32 >= area(outer.rect) as f32 * MIN_NESTED_AREA
            })
        })
        .collect();
    boxes
        .into_iter()
        .zip(keep)
        .filter_map(|(candidate, keep)| keep.then_some(candidate))
        .collect()
}

/// Drops a box whose printed label leaves no room to write: "Name:" in a
/// narrow cell, a column header, a day name. A cell with a label plus a
/// wide empty stretch ("Unterschrift: ______") stays a field.
fn drop_label_cells(mask: &GrayImage, boxes: Vec<BoxCandidate>) -> Vec<BoxCandidate> {
    boxes
        .into_iter()
        .filter(|candidate| has_free_writing_space(mask, candidate.rect))
        .collect()
}

fn has_free_writing_space(mask: &GrayImage, cell: PixelRect) -> bool {
    let inner = PixelRect {
        x0: cell.x0 + LABEL_INSET,
        y0: cell.y0 + LABEL_INSET,
        x1: cell.x1.saturating_sub(LABEL_INSET),
        y1: cell.y1.saturating_sub(LABEL_INSET),
    };
    if inner.width() == 0 || inner.height() == 0 {
        return true;
    }
    let columns = label_ink_per_column(mask, inner);
    if columns.iter().sum::<u32>() < MIN_LABEL_INK {
        return true;
    }
    longest_empty_run(&columns) >= MIN_FREE_WRITING_WIDTH.max(inner.width() / 2)
}

/// Label-ink pixels per column of `inner`: ink in horizontal runs shorter
/// than `MIN_SPLIT_UNDERLINE_WIDTH`, so rules and underscore runs that
/// cross the cell do not count as text.
fn label_ink_per_column(mask: &GrayImage, inner: PixelRect) -> Vec<u32> {
    let mut columns = vec![0; inner.width() as usize];
    for y in inner.y0..inner.y1 {
        for (x0, x1) in ink_runs(mask, y) {
            if x1 - x0 >= MIN_SPLIT_UNDERLINE_WIDTH {
                continue;
            }
            for x in x0.max(inner.x0)..x1.min(inner.x1) {
                columns[(x - inner.x0) as usize] += 1;
            }
        }
    }
    columns
}

fn longest_empty_run(columns: &[u32]) -> u32 {
    let mut longest = 0;
    let mut current = 0;
    for &ink in columns {
        current = if ink == 0 { current + 1 } else { 0 };
        longest = longest.max(current);
    }
    longest
}

fn contains(outer: PixelRect, inner: PixelRect) -> bool {
    inner.x0 >= outer.x0 && inner.y0 >= outer.y0 && inner.x1 <= outer.x1 && inner.y1 <= outer.y1
}

fn area(rect: PixelRect) -> u64 {
    u64::from(rect.width()) * u64::from(rect.height())
}

fn pixel_rect_to_pdf(
    rect: PixelRect,
    pixel_width: u32,
    pixel_height: u32,
    geometry: OcrPageGeometry,
) -> [f32; 4] {
    let (display_width, display_height) = geometry.display_dimensions();
    let sx = display_width / pixel_width as f32;
    let sy = display_height / pixel_height as f32;
    let left = rect.x0 as f32 * sx;
    let bottom = display_height - rect.y1 as f32 * sy;
    let right = rect.x1 as f32 * sx;
    let top = display_height - rect.y0 as f32 * sy;
    let [x, y, width, height] =
        geometry.display_rect_to_page([left, bottom, right - left, top - bottom]);
    [x, y, x + width, y + height]
}

#[cfg(test)]
mod tests {
    use super::*;

    // A4 at the 150 DPI the ADR renders at. The size filters are relative
    // to the page (height cap 0.15 of it), so a toy raster rejects every
    // realistic field and proves nothing.
    const PAGE_W: u32 = 1240;
    const PAGE_H: u32 = 1754;

    fn geometry(width: u32, height: u32) -> OcrPageGeometry {
        OcrPageGeometry {
            origin_x: 0.0,
            origin_y: 0.0,
            width: width as f32,
            height: height as f32,
            rotation: 0,
        }
    }

    fn blank(width: u32, height: u32) -> GrayImage {
        GrayImage::from_pixel(width, height, Luma([255]))
    }

    fn draw_horizontal(image: &mut GrayImage, x0: u32, x1: u32, y: u32) {
        for x in x0..x1 {
            image.put_pixel(x, y, Luma([0]));
        }
    }

    fn draw_vertical(image: &mut GrayImage, x: u32, y0: u32, y1: u32) {
        for y in y0..y1 {
            image.put_pixel(x, y, Luma([0]));
        }
    }

    fn draw_box(image: &mut GrayImage, x0: u32, y0: u32, x1: u32, y1: u32) {
        draw_horizontal(image, x0, x1 + 1, y0);
        draw_horizontal(image, x0, x1 + 1, y1);
        draw_vertical(image, x0, y0, y1 + 1);
        draw_vertical(image, x1, y0, y1 + 1);
    }

    #[test]
    fn isolated_hollow_box_is_detected_as_one_box() {
        let mut image = blank(PAGE_W, PAGE_H);
        draw_box(&mut image, 200, 300, 600, 380);

        let analysis = analyze_form_raster(&image, geometry(PAGE_W, PAGE_H), 0);

        assert_eq!(
            analysis
                .fields
                .iter()
                .filter(|field| field.kind == DetectedFieldKind::Box)
                .count(),
            1,
            "the ADR defines one hollow rectangle as one box field"
        );
    }

    #[test]
    fn two_by_two_grid_yields_four_cell_boxes() {
        let mut image = blank(PAGE_W, PAGE_H);
        for x in [200, 500, 800] {
            draw_vertical(&mut image, x, 300, 501);
        }
        for y in [300, 400, 500] {
            draw_horizontal(&mut image, 200, 801, y);
        }

        let analysis = analyze_form_raster(&image, geometry(PAGE_W, PAGE_H), 0);

        assert_eq!(
            analysis
                .fields
                .iter()
                .filter(|field| field.kind == DetectedFieldKind::Box)
                .count(),
            4,
            "the ADR's hole-first rule requires every grid cell to survive"
        );
    }

    #[test]
    fn underline_with_blank_band_above_is_detected_and_expanded() {
        let mut image = blank(PAGE_W, PAGE_H);
        draw_horizontal(&mut image, 200, 700, 800);
        draw_horizontal(&mut image, 200, 700, 801);

        let analysis = analyze_form_raster(&image, geometry(PAGE_W, PAGE_H), 0);
        let underline = analysis
            .fields
            .iter()
            .find(|field| field.kind == DetectedFieldKind::Underline)
            .expect("the ADR accepts a long rule with blank space above it");

        assert!(
            underline.rect[3] - underline.rect[1] >= 20.0,
            "the fill rectangle must include the whitespace band, got {:?}",
            underline.rect
        );
    }

    #[test]
    fn underline_crossed_by_two_vertical_strokes_yields_three_fields() {
        let mut image = blank(PAGE_W, PAGE_H);
        draw_horizontal(&mut image, 200, 800, 800);
        draw_vertical(&mut image, 400, 760, 821);
        draw_vertical(&mut image, 600, 760, 821);

        let analysis = analyze_form_raster(&image, geometry(PAGE_W, PAGE_H), 0);
        let x_ranges: Vec<[f32; 2]> = analysis
            .fields
            .iter()
            .filter(|field| field.kind == DetectedFieldKind::Underline)
            .map(|field| [field.rect[0], field.rect[2]])
            .collect();

        assert_eq!(
            x_ranges,
            vec![[200.0, 400.0], [401.0, 600.0], [601.0, 800.0]],
            "two crossing column borders must divide the underline into three cell fields"
        );
    }

    #[test]
    fn vertical_stroke_stopping_above_underline_does_not_split_field() {
        let mut image = blank(PAGE_W, PAGE_H);
        draw_horizontal(&mut image, 200, 800, 800);
        draw_vertical(&mut image, 400, 740, 797);

        let analysis = analyze_form_raster(&image, geometry(PAGE_W, PAGE_H), 0);
        let x_ranges: Vec<[f32; 2]> = analysis
            .fields
            .iter()
            .filter(|field| field.kind == DetectedFieldKind::Underline)
            .map(|field| [field.rect[0], field.rect[2]])
            .collect();

        assert_eq!(
            x_ranges,
            vec![[200.0, 800.0]],
            "a vertical stroke ending outside the two-pixel crossing tolerance is not a border"
        );
    }

    #[test]
    fn split_underline_drops_leftover_narrower_than_thirty_pixels() {
        let mut image = blank(PAGE_W, PAGE_H);
        draw_horizontal(&mut image, 200, 500, 800);
        draw_vertical(&mut image, 225, 760, 821);

        let analysis = analyze_form_raster(&image, geometry(PAGE_W, PAGE_H), 0);
        let x_ranges: Vec<[f32; 2]> = analysis
            .fields
            .iter()
            .filter(|field| field.kind == DetectedFieldKind::Underline)
            .map(|field| [field.rect[0], field.rect[2]])
            .collect();

        assert_eq!(
            x_ranges,
            vec![[226.0, 500.0]],
            "a 25-pixel remnant is too narrow to be a usable form field"
        );
    }

    #[test]
    fn rule_with_content_directly_above_is_not_an_underline() {
        let mut image = blank(PAGE_W, PAGE_H);
        draw_horizontal(&mut image, 200, 700, 800);
        // Printed text sitting in the whitespace band: this is the bottom
        // rule of a filled table row, not a field to write on. The glyphs
        // are short marks, so none of them is a stroke candidate itself.
        for glyph in 0..31 {
            let left = 220 + glyph * 15;
            for x in left..left + 8 {
                for y in 784..795 {
                    image.put_pixel(x, y, Luma([0]));
                }
            }
        }

        let analysis = analyze_form_raster(&image, geometry(PAGE_W, PAGE_H), 0);

        assert!(
            analysis
                .fields
                .iter()
                .all(|field| field.kind != DetectedFieldKind::Underline),
            "the ADR rejects a table rule with content in its whitespace band"
        );
    }

    #[test]
    fn box_touching_page_edge_is_rejected() {
        let mut image = blank(PAGE_W, PAGE_H);
        draw_box(&mut image, 0, 200, 600, 280);

        let analysis = analyze_form_raster(&image, geometry(PAGE_W, PAGE_H), 0);

        assert!(
            analysis.boxes.is_empty(),
            "the ADR rejects edge-touching holes"
        );
    }

    #[test]
    fn box_below_minimum_extent_is_rejected() {
        let rect = PixelRect {
            x0: 100,
            y0: 200,
            x1: 300,
            y1: 260,
        };

        // Oracle: the D2 verification plan requires extent >= 0.6.
        assert!(box_candidate_passes(rect, 0.60, PAGE_W, PAGE_H));
        assert!(!box_candidate_passes(rect, 0.59, PAGE_W, PAGE_H));
    }

    #[test]
    fn box_bottom_is_not_emitted_again_as_an_underline() {
        let mut image = blank(PAGE_W, PAGE_H);
        draw_box(&mut image, 200, 300, 800, 420);

        let analysis = analyze_form_raster(&image, geometry(PAGE_W, PAGE_H), 0);

        assert_eq!(
            analysis.boxes.len(),
            1,
            "the box precondition must be present"
        );
        assert!(
            analysis
                .fields
                .iter()
                .all(|field| field.kind != DetectedFieldKind::Underline),
            "the ADR's box-bottom NMS removes the duplicate underline"
        );
    }

    fn kinds(analysis: &DetectionAnalysis) -> Vec<DetectedFieldKind> {
        analysis.fields.iter().map(|field| field.kind).collect()
    }

    fn draw_grid(image: &mut GrayImage, xs: &[u32], ys: &[u32]) {
        let (left, right) = (xs[0], xs[xs.len() - 1] + 1);
        let (top, bottom) = (ys[0], ys[ys.len() - 1] + 1);
        for &x in xs {
            draw_vertical(image, x, top, bottom);
        }
        for &y in ys {
            draw_horizontal(image, left, right, y);
        }
    }

    // Plan 119 p1 (debug note 051): a table border that spans several
    // cells overlapped each single cell by less than 80 %, so the box-edge
    // rule kept it, and the column split then cut it into one underline per
    // cell: every cell got a box and an underline.
    #[test]
    fn grid_cells_sharing_borders_yield_exactly_one_box_each() {
        let mut image = blank(PAGE_W, PAGE_H);
        draw_grid(&mut image, &[200, 500, 800], &[300, 400, 500]);

        let analysis = analyze_form_raster(&image, geometry(PAGE_W, PAGE_H), 0);

        assert_eq!(
            kinds(&analysis),
            vec![DetectedFieldKind::Box; 4],
            "four cells are four fields, no border may come back as an underline: {:?}",
            analysis.fields
        );
    }

    #[test]
    fn one_row_of_adjacent_cells_yields_one_box_per_cell() {
        let mut image = blank(PAGE_W, PAGE_H);
        draw_grid(&mut image, &[200, 400, 600, 800], &[300, 360]);

        let analysis = analyze_form_raster(&image, geometry(PAGE_W, PAGE_H), 0);

        assert_eq!(
            kinds(&analysis),
            vec![DetectedFieldKind::Box; 3],
            "{:?}",
            analysis.fields
        );
    }

    #[test]
    fn cell_with_an_inner_baseline_yields_one_field() {
        let mut image = blank(PAGE_W, PAGE_H);
        draw_box(&mut image, 200, 300, 600, 380);
        draw_horizontal(&mut image, 220, 580, 362);

        let analysis = analyze_form_raster(&image, geometry(PAGE_W, PAGE_H), 0);

        assert_eq!(
            kinds(&analysis),
            vec![DetectedFieldKind::Box],
            "a baseline printed inside a cell is part of that cell: {:?}",
            analysis.fields
        );
    }

    #[test]
    fn cell_with_a_label_and_underscores_yields_one_field() {
        let mut image = blank(PAGE_W, PAGE_H);
        draw_box(&mut image, 200, 300, 700, 380);
        // A short printed label on the left, then a typed "_____" run.
        for glyph in 0..4 {
            let left = 215 + glyph * 12;
            for x in left..left + 8 {
                draw_vertical(&mut image, x, 350, 362);
            }
        }
        draw_horizontal(&mut image, 280, 680, 362);
        draw_horizontal(&mut image, 280, 680, 363);

        let analysis = analyze_form_raster(&image, geometry(PAGE_W, PAGE_H), 0);

        assert_eq!(
            kinds(&analysis),
            vec![DetectedFieldKind::Box],
            "{:?}",
            analysis.fields
        );
    }

    fn draw_glyphs(image: &mut GrayImage, left: u32, count: u32, y0: u32, y1: u32) {
        for glyph in 0..count {
            let x0 = left + glyph * 12;
            for x in x0..x0 + 8 {
                draw_vertical(image, x, y0, y1);
            }
        }
    }

    #[test]
    fn cell_filled_by_its_label_is_not_a_field() {
        let mut image = blank(PAGE_W, PAGE_H);
        draw_box(&mut image, 200, 300, 300, 360);
        draw_glyphs(&mut image, 210, 7, 320, 340);

        let analysis = analyze_form_raster(&image, geometry(PAGE_W, PAGE_H), 0);

        assert_eq!(kinds(&analysis), vec![], "{:?}", analysis.fields);
    }

    #[test]
    fn centered_column_header_is_not_a_field() {
        // 370 px cell, 170 px of text in the middle: 100 px free on each
        // side is under half of the cell.
        let mut image = blank(PAGE_W, PAGE_H);
        draw_box(&mut image, 200, 300, 570, 368);
        draw_glyphs(&mut image, 300, 15, 324, 344);

        let analysis = analyze_form_raster(&image, geometry(PAGE_W, PAGE_H), 0);

        assert_eq!(kinds(&analysis), vec![], "{:?}", analysis.fields);
    }

    #[test]
    fn cell_with_a_label_and_wide_free_space_stays_a_field() {
        let mut image = blank(PAGE_W, PAGE_H);
        draw_box(&mut image, 200, 300, 800, 340);
        draw_glyphs(&mut image, 210, 15, 312, 330);

        let analysis = analyze_form_raster(&image, geometry(PAGE_W, PAGE_H), 0);

        assert_eq!(
            kinds(&analysis),
            vec![DetectedFieldKind::Box],
            "{:?}",
            analysis.fields
        );
    }

    #[test]
    fn short_label_in_a_narrow_cell_is_not_a_field() {
        // 80 px cell, 46 px free: half the cell, but under the 60 px floor.
        let mut image = blank(PAGE_W, PAGE_H);
        draw_box(&mut image, 200, 300, 280, 368);
        draw_glyphs(&mut image, 204, 2, 324, 344);

        let analysis = analyze_form_raster(&image, geometry(PAGE_W, PAGE_H), 0);

        assert_eq!(kinds(&analysis), vec![], "{:?}", analysis.fields);
    }

    #[test]
    fn scan_speck_in_an_empty_cell_keeps_the_field() {
        let mut image = blank(PAGE_W, PAGE_H);
        draw_box(&mut image, 200, 300, 330, 340);
        for x in 264..267 {
            draw_vertical(&mut image, x, 318, 321);
        }

        let analysis = analyze_form_raster(&image, geometry(PAGE_W, PAGE_H), 0);

        assert_eq!(
            kinds(&analysis),
            vec![DetectedFieldKind::Box],
            "{:?}",
            analysis.fields
        );
    }

    #[test]
    fn double_bordered_cell_yields_only_the_inner_box() {
        let mut image = blank(PAGE_W, PAGE_H);
        draw_box(&mut image, 200, 300, 800, 420);
        draw_box(&mut image, 206, 306, 794, 414);

        let analysis = analyze_form_raster(&image, geometry(PAGE_W, PAGE_H), 0);

        assert_eq!(
            kinds(&analysis),
            vec![DetectedFieldKind::Box],
            "{:?}",
            analysis.fields
        );
        let [x0, _, x1, _] = analysis.fields[0].rect;
        assert!(
            x0 > 206.0 && x1 <= 794.0,
            "the inner rectangle (lines at x 206 and 794), not the outer one              (lines at 200 and 800), is the field: {:?}",
            analysis.fields[0].rect
        );
    }

    #[test]
    fn small_box_inside_a_large_box_keeps_both_fields() {
        let mut image = blank(PAGE_W, PAGE_H);
        draw_box(&mut image, 200, 300, 800, 460);
        draw_box(&mut image, 700, 320, 760, 350);

        let analysis = analyze_form_raster(&image, geometry(PAGE_W, PAGE_H), 0);

        assert_eq!(
            kinds(&analysis),
            vec![DetectedFieldKind::Box; 2],
            "a checkbox in a corner of a large field covers less than half of it: {:?}",
            analysis.fields
        );
    }

    #[test]
    fn rotated_page_grid_yields_one_box_per_cell_inside_the_page() {
        let mut image = blank(PAGE_H, PAGE_W);
        draw_grid(&mut image, &[300, 600, 900], &[200, 300, 400]);
        let rotated = OcrPageGeometry {
            origin_x: 0.0,
            origin_y: 0.0,
            width: PAGE_W as f32,
            height: PAGE_H as f32,
            rotation: 90,
        };

        let analysis = analyze_form_raster(&image, rotated, 0);

        assert_eq!(
            kinds(&analysis),
            vec![DetectedFieldKind::Box; 4],
            "{:?}",
            analysis.fields
        );
        for field in &analysis.fields {
            let [x0, y0, x1, y1] = field.rect;
            assert!(
                x0 >= 0.0 && y0 >= 0.0 && x1 <= PAGE_W as f32 && y1 <= PAGE_H as f32,
                "{:?} is outside the unrotated MediaBox",
                field.rect
            );
        }
    }

    #[test]
    fn free_standing_underline_next_to_a_box_is_kept() {
        let mut image = blank(PAGE_W, PAGE_H);
        draw_box(&mut image, 200, 300, 500, 380);
        draw_horizontal(&mut image, 600, 1000, 378);

        let analysis = analyze_form_raster(&image, geometry(PAGE_W, PAGE_H), 0);

        assert_eq!(
            kinds(&analysis),
            vec![DetectedFieldKind::Box, DetectedFieldKind::Underline],
            "a line outside every box is its own field: {:?}",
            analysis.fields
        );
    }

    #[test]
    fn fixed_threshold_marks_only_luma_below_two_hundred_as_ink() {
        let gradient = GrayImage::from_fn(256, 1, |x, _| Luma([x as u8]));

        let mask = threshold(&gradient);

        assert_eq!(
            mask.get_pixel(199, 0)[0],
            255,
            "199 is ink by the ADR cutoff"
        );
        assert_eq!(
            mask.get_pixel(200, 0)[0],
            0,
            "200 is background by the ADR cutoff"
        );
    }

    #[test]
    fn rotated_page_mapping_swaps_axes_and_returns_pdf_rect_corners() {
        let rotated = OcrPageGeometry {
            origin_x: 10.0,
            origin_y: 20.0,
            width: 200.0,
            height: 100.0,
            rotation: 90,
        };

        let rect = pixel_rect_to_pdf(
            PixelRect {
                x0: 10,
                y0: 130,
                x1: 30,
                y1: 170,
            },
            100,
            200,
            rotated,
        );

        assert_eq!(rect, [140.0, 30.0, 180.0, 50.0]);
    }
}
