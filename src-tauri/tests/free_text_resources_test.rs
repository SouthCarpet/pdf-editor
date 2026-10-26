use lopdf::{content::Content, dictionary, Dictionary, Document, Object, ObjectId, Stream};
use pdf_editor_lib::services::annotations::{save_annotations, Annotation};
use pdf_editor_lib::services::text_style::TextStyle;
use tempfile::TempDir;

// Oracle: controller's FreeText collision case. Occupied /Helv and /Helv1
// must survive; the page, /DA, /DR and appearance must all use free /Helv2.
#[test]
fn free_text_preserves_occupied_font_aliases_and_uses_one_free_name() {
    for indirect in [false, true] {
        let temp = TempDir::new().unwrap();
        let input = temp.path().join("input.pdf");
        let output = temp.path().join("output.pdf");
        let (mut doc, page_id, original_font) = page_with_occupied_aliases(indirect);
        doc.save(&input).unwrap();
        let annotation = Annotation::FreeText {
            page: 0,
            rect: [10.0, 20.0, 150.0, 45.0],
            contents: "New text".into(),
            style: TextStyle::default(),
            background_fill: None,
            border_color: [0.0; 3],
            border_width: 0.0,
            auto_resize: false,
        };
        let saved_ids = save_annotations(&input, &output, &[annotation], &[]).unwrap();
        let saved = Document::load(output).unwrap();
        let reference = saved_ids[0].unwrap();
        assert_font_bindings(
            &saved,
            page_id,
            original_font,
            (reference.object, reference.generation),
        );
    }
}

fn page_with_occupied_aliases(indirect: bool) -> (Document, ObjectId, ObjectId) {
    let mut doc = Document::with_version("1.7");
    let pages = doc.new_object_id();
    let original = doc.add_object(dictionary! {
        "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Courier",
    });
    let fonts = dictionary! { "Helv" => original, "Helv1" => original };
    let fonts = if indirect {
        Object::Reference(doc.add_object(fonts))
    } else {
        Object::Dictionary(fonts)
    };
    let resources = dictionary! { "Font" => fonts };
    let resources = if indirect {
        Object::Reference(doc.add_object(resources))
    } else {
        Object::Dictionary(resources)
    };
    let contents = doc.add_object(Stream::new(
        dictionary! {},
        b"BT /Helv 12 Tf 10 20 Td (Original) Tj ET".to_vec(),
    ));
    let page = doc.add_object(dictionary! {
        "Type" => "Page", "Parent" => pages,
        "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
        "Resources" => resources, "Contents" => contents,
    });
    doc.set_object(
        pages,
        dictionary! { "Type" => "Pages", "Kids" => vec![Object::Reference(page)], "Count" => 1 },
    );
    let root = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages });
    doc.trailer.set("Root", root);
    (doc, page, original)
}

fn resolved_dict<'a>(doc: &'a Document, value: &'a Object) -> &'a Dictionary {
    doc.dereference(value).unwrap().1.as_dict().unwrap()
}

fn assert_font_bindings(
    doc: &Document,
    page_id: ObjectId,
    original_font: ObjectId,
    annotation_id: ObjectId,
) {
    let page = doc.get_dictionary(page_id).unwrap();
    let resources = resolved_dict(doc, page.get(b"Resources").unwrap());
    let fonts = resolved_dict(doc, resources.get(b"Font").unwrap());
    assert_eq!(
        fonts.get(b"Helv").unwrap().as_reference().unwrap(),
        original_font,
        "original /Helv binding preserved"
    );
    assert_eq!(
        fonts.get(b"Helv1").unwrap().as_reference().unwrap(),
        original_font
    );
    assert_eq!(
        doc.get_dictionary(original_font).unwrap(),
        &dictionary! {
            "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Courier",
        },
        "original font object preserved"
    );
    let added = fonts.get(b"Helv2").unwrap().as_reference().unwrap();
    assert_ne!(added, original_font);
    let annotation = doc.get_dictionary(annotation_id).unwrap();
    assert_eq!(
        annotation.get(b"DA").unwrap().as_str().unwrap(),
        b"/Helv2 11 Tf 0 0 0 rg"
    );
    let dr = resolved_dict(doc, annotation.get(b"DR").unwrap());
    assert_eq!(
        resolved_dict(doc, dr.get(b"Font").unwrap())
            .get(b"Helv2")
            .unwrap()
            .as_reference()
            .unwrap(),
        added
    );
    let ap = resolved_dict(doc, annotation.get(b"AP").unwrap());
    let stream = doc
        .dereference(ap.get(b"N").unwrap())
        .unwrap()
        .1
        .as_stream()
        .unwrap();
    let resources = resolved_dict(doc, stream.dict.get(b"Resources").unwrap());
    assert_eq!(
        resolved_dict(doc, resources.get(b"Font").unwrap())
            .get(b"Helv2")
            .unwrap()
            .as_reference()
            .unwrap(),
        added
    );
    let content = Content::decode(&stream.get_plain_content().unwrap()).unwrap();
    let tf = content
        .operations
        .iter()
        .find(|op| op.operator == "Tf")
        .unwrap();
    assert_eq!(tf.operands[0].as_name().unwrap(), b"Helv2");
}
