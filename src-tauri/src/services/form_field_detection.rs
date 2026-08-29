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
    let raster_path = scratch.path().join("page.png");
    mupdf
        .render_page_to_png(path, page_index, &raster_path, dpi, None)
        .await?;

    let gray = image::open(&raster_path)
        .map_err(|error| AppError::Internal {
            detail: format!("load rendered form page: {error}"),
        })?
        .into_luma8();
    let doc =
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

    Ok(analyze_form_raster(&gray, geometry, page_index))
}

pub(crate) fn analyze_form_raster(
    gray: &GrayImage,
    geometry: OcrPageGeometry,
    page_index: u32,
) -> DetectionAnalysis {
    let mask = threshold(gray);
    let boxes = find_box_candidates(&mask);
    let underlines = suppress_box_bottom_underlines(find_underline_candidates(&mask), &boxes);
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

fn ranges_overlap_with_tolerance(
    left_x0: u32,
    left_x1: u32,
    right_x0: u32,
    right_x1: u32,
    tolerance: u32,
) -> bool {
    left_x0 <= right_x1.saturating_add(tolerance) && right_x0 <= left_x1.saturating_add(tolerance)
}

fn suppress_box_bottom_underlines(
    underlines: Vec<UnderlineCandidate>,
    boxes: &[BoxCandidate],
) -> Vec<UnderlineCandidate> {
    underlines
        .into_iter()
        .filter(|underline| {
            !boxes.iter().any(|box_candidate| {
                // The ADR names the box bottom edge. A drawn rectangle has a
                // top edge with the same geometry and clean whitespace above
                // it, so it produces the same duplicate; both edges are
                // suppressed here.
                let vertical_match = underline.stroke_rect.y0.abs_diff(box_candidate.rect.y1) <= 3
                    || underline.stroke_rect.y1.abs_diff(box_candidate.rect.y0) <= 3;
                let overlap_start = underline.stroke_rect.x0.max(box_candidate.rect.x0);
                let overlap_end = underline.stroke_rect.x1.min(box_candidate.rect.x1);
                let overlap = overlap_end.saturating_sub(overlap_start);
                vertical_match && overlap as f32 >= underline.stroke_rect.width() as f32 * 0.8
            })
        })
        .collect()
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
