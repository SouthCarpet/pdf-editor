//! Plan 119 O0: saving or deleting an annotation keeps every other entry of
//! the page `/Annots`, whether the key holds a direct array, an indirect
//! reference to an array object, or nothing.

use lopdf::{dictionary, Document, Object, ObjectId};
use pdf_editor_lib::services::annotations::{
    save_annotations, Annotation, AnnotationRef,
};
use pdf_editor_lib::services::text_style::TextStyle;
use std::path::Path;
use tempfile::TempDir;

const LINK_RECTS: [[f32; 4]; 2] = [[10.0, 10.0, 50.0, 20.0], [60.0, 10.0, 100.0, 20.0]];

#[derive(Clone, Copy)]
enum AnnotsShape {
    Indirect,
    Direct,
    Missing,
}

struct Fixture {
    doc: Document,
    page_id: ObjectId,
    link_ids: Vec<ObjectId>,
}

fn rect_object(rect: &[f32; 4]) -> Object {
    Object::Array(rect.iter().map(|v| Object::Real(*v)).collect())
}

fn add_annotation(doc: &mut Document, subtype: &str, rect: &[f32; 4]) -> ObjectId {
    doc.add_object(dictionary! {
        "Type" => "Annot",
        "Subtype" => subtype,
        "Rect" => rect_object(rect),
    })
}

/// One page 612 x 792 with two Link annotations; `/Annots` has the given shape.
fn fixture(shape: AnnotsShape, extra_free_text: bool) -> (Fixture, Option<ObjectId>) {
    let mut doc = Document::with_version("1.7");
    let link_ids: Vec<ObjectId> = LINK_RECTS
        .iter()
        .map(|rect| add_annotation(&mut doc, "Link", rect))
        .collect();
    let mut entries: Vec<Object> = link_ids.iter().copied().map(Object::Reference).collect();
    let free_text_id = extra_free_text
        .then(|| add_annotation(&mut doc, "FreeText", &[100.0, 650.0, 240.0, 672.0]));
    if let Some(id) = free_text_id {
        entries.push(Object::Reference(id));
    }
    let pages_id = doc.new_object_id();
    let mut page = dictionary! {
        "Type" => "Page",
        "Parent" => Object::Reference(pages_id),
        "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
        "Resources" => dictionary! {},
    };
    match shape {
        AnnotsShape::Indirect => {
            let array_id = doc.add_object(Object::Array(entries));
            page.set("Annots", Object::Reference(array_id));
        }
        AnnotsShape::Direct => page.set("Annots", Object::Array(entries)),
        AnnotsShape::Missing => {}
    }
    let page_id = doc.add_object(page);
    doc.set_object(
        pages_id,
        dictionary! {
            "Type" => "Pages",
            "Kids" => vec![Object::Reference(page_id)],
            "Count" => 1,
        },
    );
    let catalog_id = doc.add_object(dictionary! {
        "Type" => "Catalog",
        "Pages" => Object::Reference(pages_id),
    });
    doc.trailer.set("Root", Object::Reference(catalog_id));
    (
        Fixture {
            doc,
            page_id,
            link_ids,
        },
        free_text_id,
    )
}

fn write_fixture(fixture: &mut Fixture, path: &Path) {
    fixture.doc.save(path).expect("write fixture");
}

fn free_text() -> Annotation {
    Annotation::FreeText {
        page: 0,
        rect: [100.0, 650.0, 240.0, 672.0],
        contents: "Test".to_string(),
        style: TextStyle::default(),
        background_fill: None,
        border_color: [0.0, 0.0, 0.0],
        border_width: 0.0,
        auto_resize: false,
    }
}

/// The resolved page `/Annots` array of page 1 in the saved file.
fn resolved_annots(path: &Path) -> (Document, Vec<Object>) {
    let doc = Document::load(path).expect("load saved copy");
    let page_id = *doc.get_pages().get(&1).expect("page 1");
    let page = doc.get_dictionary(page_id).expect("page dictionary");
    let annots = match page.get(b"Annots") {
        Ok(entry) => doc
            .dereference(entry)
            .expect("resolve /Annots")
            .1
            .as_array()
            .expect("/Annots is an array")
            .clone(),
        Err(_) => Vec::new(),
    };
    (doc, annots)
}

fn ids(annots: &[Object]) -> Vec<ObjectId> {
    annots
        .iter()
        .map(|entry| entry.as_reference().expect("reference entry"))
        .collect()
}

fn add_one(shape: AnnotsShape) -> (TempDir, Fixture, Vec<Object>) {
    let folder = TempDir::new().expect("scratch folder");
    let input = folder.path().join("in.pdf");
    let output = folder.path().join("out.pdf");
    let (mut fx, _) = fixture(shape, false);
    write_fixture(&mut fx, &input);
    save_annotations(&input, &output, &[free_text()], &[]).expect("save");
    let (_, annots) = resolved_annots(&output);
    (folder, fx, annots)
}

#[test]
fn a1_add_keeps_the_links_of_an_indirect_annots_list() {
    let (_folder, fx, annots) = add_one(AnnotsShape::Indirect);

    assert_eq!(annots.len(), 3);
    let kept = ids(&annots);
    for link in &fx.link_ids {
        assert!(kept.contains(link), "link {link:?} lost");
    }
}

#[test]
fn a1_add_keeps_the_page_reference_indirect() {
    let folder = TempDir::new().expect("scratch folder");
    let input = folder.path().join("in.pdf");
    let output = folder.path().join("out.pdf");
    let (mut fx, _) = fixture(AnnotsShape::Indirect, false);
    write_fixture(&mut fx, &input);
    save_annotations(&input, &output, &[free_text()], &[]).expect("save");

    let doc = Document::load(&output).expect("load saved copy");
    let page = doc.get_dictionary(fx.page_id).expect("page dictionary");
    assert!(page.get(b"Annots").unwrap().as_reference().is_ok());
}

#[test]
fn a2_remove_keeps_the_links_of_an_indirect_annots_list() {
    let folder = TempDir::new().expect("scratch folder");
    let input = folder.path().join("in.pdf");
    let output = folder.path().join("out.pdf");
    let (mut fx, free_text_id) = fixture(AnnotsShape::Indirect, true);
    let free_text_id = free_text_id.expect("free text in fixture");
    write_fixture(&mut fx, &input);

    save_annotations(&input, &output, &[], &[AnnotationRef::from(free_text_id)])
        .expect("save");

    let (doc, annots) = resolved_annots(&output);
    assert_eq!(annots.len(), 2);
    let kept = ids(&annots);
    for link in &fx.link_ids {
        assert!(kept.contains(link), "link {link:?} lost");
    }
    assert!(!kept.contains(&free_text_id));
    assert!(doc.objects.get(&free_text_id).is_none());
}

#[test]
fn a3_direct_annots_list_gets_three_after_add_and_two_after_remove() {
    let (_folder, _, annots) = add_one(AnnotsShape::Direct);
    assert_eq!(annots.len(), 3);

    let folder = TempDir::new().expect("scratch folder");
    let input = folder.path().join("in.pdf");
    let output = folder.path().join("out.pdf");
    let (mut fx, free_text_id) = fixture(AnnotsShape::Direct, true);
    write_fixture(&mut fx, &input);
    let removed = AnnotationRef::from(free_text_id.expect("free text in fixture"));
    save_annotations(&input, &output, &[], &[removed]).expect("save");
    assert_eq!(resolved_annots(&output).1.len(), 2);
}

#[test]
fn a3_missing_annots_list_gets_one_after_add() {
    let (_folder, _, annots) = add_one(AnnotsShape::Missing);
    assert_eq!(annots.len(), 1);
}
