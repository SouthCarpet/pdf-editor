use lopdf::{dictionary, Document, Object, Stream};
use pdf_editor_lib::services::text_edit::replace_run_via_redaction;
use tempfile::TempDir;

// Contract cases: indirect Resources preserves image + old font + new font;
// direct Resources with indirect Font preserves the same three resources.
#[test]
fn fallback_with_indirect_resources_preserves_image_and_existing_font() {
    assert_fallback_preserves_resources(true, "Original", "F1");
}

#[test]
fn fallback_with_indirect_fonts_preserves_image_and_existing_font() {
    assert_fallback_preserves_resources(false, "Original", "F1");
}

// Oracle: V2 finding A. Existing /F1 and /F2 bindings must remain unchanged;
// the fallback text must use the first free name, /F3, in its Tf operation.
#[test]
fn fallback_preserves_existing_f1_and_uses_a_free_font_name() {
    assert_fallback_preserves_resources(true, "F1", "F3");
    assert_fallback_preserves_resources(false, "F1", "F3");
}

fn assert_fallback_preserves_resources(
    indirect_resources: bool,
    original_alias: &str,
    fallback_alias: &str,
) {
    let temp = TempDir::new().unwrap();
    let input = temp.path().join("input.pdf");
    let output = temp.path().join("output.pdf");
    let mut doc = Document::with_version("1.7");
    let pages_id = doc.new_object_id();
    let original_font = doc.add_object(dictionary! {
        "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Courier",
    });
    let image = doc.add_object(Stream::new(
        dictionary! {
            "Type" => "XObject", "Subtype" => "Image", "Width" => 1,
            "Height" => 1, "ColorSpace" => "DeviceGray", "BitsPerComponent" => 8,
        },
        vec![128],
    ));
    let mut fonts = dictionary! { original_alias => original_font };
    if original_alias == "F1" {
        fonts.set("F2", original_font);
    }
    let font_entry = if indirect_resources {
        Object::Dictionary(fonts)
    } else {
        Object::Reference(doc.add_object(fonts))
    };
    let resources = dictionary! {
        "Font" => font_entry, "XObject" => dictionary! { "Image" => image },
    };
    let resource_entry = if indirect_resources {
        Object::Reference(doc.add_object(resources))
    } else {
        Object::Dictionary(resources)
    };
    let contents = doc.add_object(Stream::new(
        dictionary! {},
        format!("q 1 0 0 1 50 50 cm /Image Do Q BT /{original_alias} 12 Tf 10 20 Td (old) Tj ET")
            .into_bytes(),
    ));
    let page_id = doc.add_object(dictionary! {
        "Type" => "Page", "Parent" => pages_id,
        "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
        "Resources" => resource_entry, "Contents" => contents,
    });
    doc.set_object(
        pages_id,
        dictionary! {
            "Type" => "Pages", "Kids" => vec![Object::Reference(page_id)], "Count" => 1,
        },
    );
    let catalog = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
    doc.trailer.set("Root", catalog);
    doc.save(&input).unwrap();

    replace_run_via_redaction(&input, &output, 0, [10., 20., 30., 14.], "new", 12.).unwrap();

    let saved = Document::load(output).unwrap();
    assert_saved_resources(
        &saved,
        page_id,
        image,
        original_font,
        original_alias,
        fallback_alias,
    );
}

fn assert_saved_resources(
    saved: &Document,
    page_id: lopdf::ObjectId,
    image: lopdf::ObjectId,
    original_font: lopdf::ObjectId,
    original_alias: &str,
    fallback_alias: &str,
) {
    let page = saved.get_dictionary(page_id).unwrap();
    let resources = saved
        .dereference(page.get(b"Resources").unwrap())
        .unwrap()
        .1
        .as_dict()
        .unwrap();
    let images = saved
        .dereference(
            resources
                .get(b"XObject")
                .expect("image resources preserved"),
        )
        .unwrap()
        .1
        .as_dict()
        .unwrap();
    let image_id = images.get(b"Image").unwrap().as_reference().unwrap();
    assert_eq!(image_id, image, "original image binding preserved");
    assert_eq!(
        saved
            .get_object(image_id)
            .unwrap()
            .as_stream()
            .unwrap()
            .dict
            .get(b"Subtype")
            .unwrap()
            .as_name()
            .unwrap(),
        b"Image"
    );
    let fonts = saved
        .dereference(resources.get(b"Font").unwrap())
        .unwrap()
        .1
        .as_dict()
        .unwrap();
    assert_eq!(
        fonts
            .get(original_alias.as_bytes())
            .expect("original font preserved")
            .as_reference()
            .unwrap(),
        original_font
    );
    assert_eq!(
        saved.get_dictionary(original_font).unwrap(),
        &dictionary! {
            "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Courier",
        },
        "original font object preserved"
    );
    let added_font = fonts
        .get(fallback_alias.as_bytes())
        .expect("fallback font added")
        .as_reference()
        .unwrap();
    assert_eq!(
        saved
            .get_dictionary(added_font)
            .unwrap()
            .get(b"BaseFont")
            .unwrap()
            .as_name()
            .unwrap(),
        b"Helvetica"
    );
    let content = saved.get_and_decode_page_content(page_id).unwrap();
    if original_alias == "F1" {
        assert_eq!(
            fonts.get(b"F2").unwrap().as_reference().unwrap(),
            original_font
        );
    }
    assert_eq!(
        content
            .operations
            .iter()
            .rfind(|op| op.operator == "Tf")
            .unwrap()
            .operands,
        vec![
            Object::Name(fallback_alias.as_bytes().to_vec()),
            Object::Integer(12)
        ]
    );
    assert_eq!(content.operations.last().unwrap().operator, "ET");
    assert!(content
        .operations
        .iter()
        .any(|op| op.operator == "Tj" && op.operands == vec![Object::string_literal("new")]));
}
