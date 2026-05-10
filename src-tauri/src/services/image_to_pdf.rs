use anyhow::{Context, Result};
use image::ImageReader;
use lopdf::{dictionary, Document, Object, Stream};
use std::io::Cursor;
use std::path::{Path, PathBuf};

pub fn images_to_pdf(images: &[PathBuf], output: &Path, dpi: f32) -> Result<()> {
    if images.is_empty() {
        anyhow::bail!("no images");
    }

    let mut doc = Document::with_version("1.7");
    let pages_id = doc.new_object_id();
    let mut kids = Vec::new();

    for img_path in images {
        let img = ImageReader::open(img_path)
            .with_context(|| format!("open {}", img_path.display()))?
            .with_guessed_format()?
            .decode()
            .with_context(|| format!("decode {}", img_path.display()))?;
        let rgb = img.to_rgb8();
        let (w, h) = rgb.dimensions();

        let mut jpeg_bytes = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut Cursor::new(&mut jpeg_bytes), 85)
            .encode(rgb.as_raw(), w, h, image::ExtendedColorType::Rgb8)?;

        let img_dict = dictionary! {
            "Type" => "XObject",
            "Subtype" => "Image",
            "Width" => w as i64,
            "Height" => h as i64,
            "ColorSpace" => "DeviceRGB",
            "BitsPerComponent" => 8,
            "Filter" => "DCTDecode",
        };
        let img_id = doc.add_object(Object::Stream(Stream::new(img_dict, jpeg_bytes)));

        let page_w = (w as f32 * 72.0 / dpi) as i64;
        let page_h = (h as f32 * 72.0 / dpi) as i64;

        let content = format!(
            "q\n{w} 0 0 {h} 0 0 cm\n/Im0 Do\nQ\n",
            w = page_w,
            h = page_h
        );
        let content_id = doc.add_object(Object::Stream(Stream::new(
            dictionary! {},
            content.into_bytes(),
        )));

        let resources = dictionary! { "XObject" => dictionary! { "Im0" => img_id } };
        let page_dict = dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "MediaBox" => vec![0.into(), 0.into(), page_w.into(), page_h.into()],
            "Resources" => resources,
            "Contents" => content_id,
        };
        let page_id = doc.add_object(page_dict);
        kids.push(Object::Reference(page_id));
    }

    let count = kids.len() as i64;
    let pages_dict = dictionary! {
        "Type" => "Pages",
        "Kids" => kids,
        "Count" => count,
    };
    doc.objects.insert(pages_id, Object::Dictionary(pages_dict));

    let catalog_id = doc.add_object(dictionary! {
        "Type" => "Catalog",
        "Pages" => pages_id,
    });
    doc.trailer.set("Root", catalog_id);
    doc.compress();
    doc.save(output)?;
    Ok(())
}
