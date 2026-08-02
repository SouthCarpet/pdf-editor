use anyhow::{anyhow, Context, Result};
use lopdf::{Dictionary, Document, Object, ObjectId};
use std::collections::HashSet;

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct OcrPageGeometry {
    pub origin_x: f32,
    pub origin_y: f32,
    pub width: f32,
    pub height: f32,
    pub rotation: i32,
}

impl OcrPageGeometry {
    pub fn display_dimensions(self) -> (f32, f32) {
        match self.rotation {
            90 | 270 => (self.height, self.width),
            _ => (self.width, self.height),
        }
    }

    /// Matrix mapping the rotation-corrected raster/display coordinate system
    /// back into the page's unrotated user space.
    pub fn display_to_page_matrix(self) -> [f32; 6] {
        match self.rotation {
            0 => [1.0, 0.0, 0.0, 1.0, self.origin_x, self.origin_y],
            90 => [
                0.0,
                1.0,
                -1.0,
                0.0,
                self.origin_x + self.width,
                self.origin_y,
            ],
            180 => [
                -1.0,
                0.0,
                0.0,
                -1.0,
                self.origin_x + self.width,
                self.origin_y + self.height,
            ],
            270 => [
                0.0,
                -1.0,
                1.0,
                0.0,
                self.origin_x,
                self.origin_y + self.height,
            ],
            _ => unreachable!("rotation is normalized by page_geometry"),
        }
    }

    /// Rect-level round trip through the page matrix. Production places
    /// content by emitting the matrix as a `cm` prologue (see
    /// `wrap_display_content`) rather than by transforming coordinates, so
    /// this exists only to assert the matrix itself in tests.
    #[cfg(test)]
    pub fn display_rect_to_page(self, rect: [f32; 4]) -> [f32; 4] {
        let [x, y, width, height] = rect;
        let matrix = self.display_to_page_matrix();
        let points = [
            transform_point(matrix, x, y),
            transform_point(matrix, x + width, y),
            transform_point(matrix, x, y + height),
            transform_point(matrix, x + width, y + height),
        ];
        let min_x = points
            .iter()
            .map(|point| point.0)
            .fold(f32::INFINITY, f32::min);
        let min_y = points
            .iter()
            .map(|point| point.1)
            .fold(f32::INFINITY, f32::min);
        let max_x = points
            .iter()
            .map(|point| point.0)
            .fold(f32::NEG_INFINITY, f32::max);
        let max_y = points
            .iter()
            .map(|point| point.1)
            .fold(f32::NEG_INFINITY, f32::max);
        [min_x, min_y, max_x - min_x, max_y - min_y]
    }

    pub fn wrap_display_content(self, content: Vec<u8>) -> Vec<u8> {
        let [a, b, c, d, e, f] = self.display_to_page_matrix();
        let mut wrapped = format!("q\n{a} {b} {c} {d} {e} {f} cm\n").into_bytes();
        wrapped.extend(content);
        wrapped.extend_from_slice(b"Q\n");
        wrapped
    }
}

#[cfg(test)]
fn transform_point(matrix: [f32; 6], x: f32, y: f32) -> (f32, f32) {
    let [a, b, c, d, e, f] = matrix;
    (a * x + c * y + e, b * x + d * y + f)
}

pub(crate) fn page_geometry(doc: &Document, page_id: ObjectId) -> Result<OcrPageGeometry> {
    let media_box = inherited_page_value(doc, page_id, b"MediaBox")?
        .context("page MediaBox is missing")?
        .as_array()
        .map_err(|_| anyhow!("page MediaBox is invalid"))?;
    if media_box.len() != 4 {
        return Err(anyhow!("page MediaBox is invalid"));
    }
    let number = |object: &Object| -> Result<f32> {
        match object {
            Object::Integer(value) => Ok(*value as f32),
            Object::Real(value) => Ok(*value),
            _ => Err(anyhow!("page MediaBox contains a non-number")),
        }
    };
    let origin_x = number(&media_box[0])?;
    let origin_y = number(&media_box[1])?;
    let width = number(&media_box[2])? - origin_x;
    let height = number(&media_box[3])? - origin_y;
    if width <= 0.0 || height <= 0.0 {
        return Err(anyhow!("page MediaBox has no area"));
    }

    let rotation = match inherited_page_value(doc, page_id, b"Rotate")? {
        Some(value) => i32::try_from(
            value
                .as_i64()
                .map_err(|_| anyhow!("page Rotate is not an integer"))?,
        )
        .map_err(|_| anyhow!("page Rotate is outside the supported range"))?
        .rem_euclid(360),
        None => 0,
    };
    if rotation % 90 != 0 {
        return Err(anyhow!("page Rotate must be a multiple of 90 degrees"));
    }

    Ok(OcrPageGeometry {
        origin_x,
        origin_y,
        width,
        height,
        rotation,
    })
}

/// Adds a font resource without replacing any page resource or existing font
/// binding. Indirect/inherited resource dictionaries are cloned inline so all
/// original entries survive normalization.
pub(crate) fn add_page_font_resource(
    doc: &mut Document,
    page_id: ObjectId,
    name: &[u8],
    font_id: ObjectId,
) -> Result<()> {
    let resources_object = inherited_page_value(doc, page_id, b"Resources")?
        .context("page Resources are missing; refusing to synthesize an empty dictionary")?;
    let mut resources = resources_object
        .as_dict()
        .map_err(|_| anyhow!("page Resources cannot be resolved to a dictionary"))?
        .clone();

    let mut fonts = match resources.get(b"Font") {
        Ok(object) => doc
            .dereference(object)
            .context("page Font resources cannot be resolved")?
            .1
            .as_dict()
            .map_err(|_| anyhow!("page Font resources are not a dictionary"))?
            .clone(),
        Err(_) => Dictionary::new(),
    };
    if fonts.get(name).is_ok() {
        return Err(anyhow!(
            "page font resource /{} already exists; refusing to replace an unowned resource",
            String::from_utf8_lossy(name)
        ));
    }
    fonts.set(name, Object::Reference(font_id));
    resources.set("Font", Object::Dictionary(fonts));
    doc.get_object_mut(page_id)?
        .as_dict_mut()?
        .set("Resources", Object::Dictionary(resources));
    Ok(())
}

fn inherited_page_value<'a>(
    doc: &'a Document,
    page_id: ObjectId,
    key: &[u8],
) -> Result<Option<&'a Object>> {
    let mut current_id = page_id;
    let mut seen = HashSet::new();
    loop {
        if !seen.insert(current_id) {
            return Err(anyhow!("page tree contains a reference cycle"));
        }
        let node = doc.get_object(current_id)?.as_dict()?;
        if let Ok(value) = node.get(key) {
            return doc
                .dereference(value)
                .map(|(_, resolved)| Some(resolved))
                .with_context(|| {
                    format!("page {} cannot be resolved", String::from_utf8_lossy(key))
                });
        }
        let Ok(parent_id) = node.get(b"Parent").and_then(Object::as_reference) else {
            return Ok(None);
        };
        current_id = parent_id;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use lopdf::dictionary;

    #[test]
    fn synthetic_rotated_origin_fixture_swaps_axes_and_maps_back_to_page_space() {
        let mut doc = Document::with_version("1.7");
        let page_id = doc.add_object(dictionary! {
            "Type" => "Page",
            "MediaBox" => vec![10.into(), 20.into(), 210.into(), 120.into()],
            "Rotate" => 90,
        });

        let geometry = page_geometry(&doc, page_id).unwrap();

        assert_eq!(geometry.display_dimensions(), (100.0, 200.0));
        assert_eq!(
            geometry.display_to_page_matrix(),
            [0.0, 1.0, -1.0, 0.0, 210.0, 20.0]
        );
        assert_eq!(
            geometry.display_rect_to_page([10.0, 30.0, 20.0, 40.0]),
            [140.0, 30.0, 40.0, 20.0]
        );
    }

    /// The unrotated page with a shifted MediaBox origin is the case that
    /// actually ships, and until now it was only covered through
    /// `display_rect_to_page`, which production does not call. This asserts
    /// the path that does run: the emitted `cm` prologue must translate by
    /// the origin, so content authored in display space lands in the right
    /// place on a page whose lower left corner is not at 0 0.
    #[test]
    fn unrotated_page_origin_is_applied_through_the_emitted_prologue() {
        let mut doc = Document::with_version("1.7");
        let page_id = doc.add_object(dictionary! {
            "Type" => "Page",
            "MediaBox" => vec![10.into(), 20.into(), 210.into(), 120.into()],
        });

        let geometry = page_geometry(&doc, page_id).unwrap();

        assert_eq!(geometry.display_dimensions(), (200.0, 100.0));
        assert_eq!(
            geometry.display_to_page_matrix(),
            [1.0, 0.0, 0.0, 1.0, 10.0, 20.0],
            "an unrotated page must map through a pure translation by its origin"
        );

        let wrapped = geometry.wrap_display_content(b"BT ET\n".to_vec());
        let text = String::from_utf8(wrapped).unwrap();
        assert!(
            text.starts_with("q\n1 0 0 1 10 20 cm\n"),
            "prologue must carry the origin, got: {text}"
        );
        assert!(text.ends_with("Q\n"), "prologue must be balanced");
        assert!(text.contains("BT ET"), "original content must survive");
    }

    #[test]
    fn indirect_resources_are_normalized_without_losing_existing_entries() {
        let mut doc = Document::with_version("1.7");
        let old_font_id = doc.add_object(dictionary! {
            "Type" => "Font",
            "Subtype" => "Type1",
            "BaseFont" => "Helvetica",
        });
        let new_font_id = doc.add_object(dictionary! {
            "Type" => "Font",
            "Subtype" => "Type1",
            "BaseFont" => "Courier",
        });
        let image_id = doc.add_object(dictionary! { "Type" => "XObject", "Subtype" => "Image" });
        let fonts_id =
            doc.add_object(dictionary! { "ScannerFont" => Object::Reference(old_font_id) });
        let resources_id = doc.add_object(dictionary! {
            "Font" => Object::Reference(fonts_id),
            "XObject" => dictionary! { "ScannedPage" => Object::Reference(image_id) },
        });
        let page_id = doc.add_object(dictionary! {
            "Type" => "Page",
            "Resources" => Object::Reference(resources_id),
        });

        add_page_font_resource(&mut doc, page_id, b"AnimusOcrF", new_font_id).unwrap();

        let resources = doc
            .get_object(page_id)
            .unwrap()
            .as_dict()
            .unwrap()
            .get(b"Resources")
            .unwrap()
            .as_dict()
            .unwrap();
        assert_eq!(
            resources
                .get(b"XObject")
                .unwrap()
                .as_dict()
                .unwrap()
                .get(b"ScannedPage")
                .unwrap()
                .as_reference()
                .unwrap(),
            image_id
        );
        let fonts = resources.get(b"Font").unwrap().as_dict().unwrap();
        assert_eq!(
            fonts.get(b"ScannerFont").unwrap().as_reference().unwrap(),
            old_font_id
        );
        assert_eq!(
            fonts.get(b"AnimusOcrF").unwrap().as_reference().unwrap(),
            new_font_id
        );
    }

    #[test]
    fn unresolved_resources_fail_without_replacing_the_reference() {
        let mut doc = Document::with_version("1.7");
        let missing_id = (999, 0);
        let page_id = doc.add_object(dictionary! {
            "Type" => "Page",
            "Resources" => Object::Reference(missing_id),
        });
        let font_id = doc.add_object(dictionary! { "Type" => "Font" });

        let error = add_page_font_resource(&mut doc, page_id, b"AnimusOcrF", font_id)
            .unwrap_err()
            .to_string();

        assert!(error.contains("cannot be resolved"));
        assert_eq!(
            doc.get_object(page_id)
                .unwrap()
                .as_dict()
                .unwrap()
                .get(b"Resources")
                .unwrap()
                .as_reference()
                .unwrap(),
            missing_id
        );
    }
}
