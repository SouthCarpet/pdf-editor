//! Plan 119 O1: an own form field (`Annotation::FormField`) is saved as a
//! real AcroForm field. Tests R1 to R3 and R5 to R12 of the plan; R9 needs
//! the real qpdf and mutool binaries (`--features sidecar-tests`).

use lopdf::{dictionary, text_string, Dictionary, Document, Object, ObjectId};
use pdf_editor_lib::services::annotations::{save_annotations, Annotation, AnnotationRef};
use pdf_editor_lib::services::forms::{
    read_form_fields, set_form_values, FormField, FormFieldKind, FormValueUpdate,
};
use pdf_editor_lib::services::own_fields::{sanitize_field_name, OwnFieldKind};
use std::path::{Path, PathBuf};
use tempfile::TempDir;

const RECT_ERROR: &str = "own field rect must be finite and at least 4 x 4 pt";
const NAME_RECT: [f32; 4] = [100.0, 650.0, 240.0, 672.0];
const MOVED_RECT: [f32; 4] = [100.0, 600.0, 240.0, 622.0];
const EXISTING_RECT: [f32; 4] = [36.0, 700.0, 240.0, 724.0];

// Oracle: E1 item 8. Adding an AcroForm field to an XFA hybrid must keep
// its existing XFA packet. This is preservation, not dynamic XFA editing.
#[test]
fn edge_xfa_packet_survives_an_own_field_save() {
    let fixture = fixture(None, Form::Missing);
    let mut doc = Document::load(&fixture.input).unwrap();
    let packet = b"<template xmlns=\"http://www.xfa.org/schema/xfa-template/3.3/\"/>";
    let xfa = doc.add_object(lopdf::Stream::new(dictionary! {}, packet.to_vec()));
    doc.catalog_mut().unwrap().set(
        "AcroForm",
        dictionary! {
            "Fields" => Vec::<Object>::new(), "XFA" => xfa,
        },
    );
    doc.save(&fixture.input).unwrap();
    let output = fixture.path("xfa.pdf");
    let result = save_annotations(
        &fixture.input,
        &output,
        &[text_field("Own", NAME_RECT)],
        &[],
    );
    if let Err(error) = result {
        let kept = fixture._dir.keep();
        panic!(
            "XFA save failed: {error:#}; generated files kept at {}",
            kept.display()
        );
    }
    let saved = match Document::load(&output) {
        Ok(saved) => saved,
        Err(error) => {
            let kept = fixture._dir.keep();
            panic!(
                "XFA reopen failed: {error}; generated files kept at {}",
                kept.display()
            );
        }
    };
    assert_eq!(
        acroform(&saved).get(b"XFA").unwrap(),
        &Object::Reference(xfa)
    );
    assert_eq!(
        saved
            .get_object(xfa)
            .unwrap()
            .as_stream()
            .unwrap()
            .get_plain_content()
            .unwrap(),
        packet
    );
    assert_eq!(fields(&output)[0].name, "Own");
}

// Oracle: E1 item 8. The existing form reader must expose a signature field
// carrying a signature dictionary, so the frontend can warn before writing.
// The dummy bytes model signature structure, not a cryptographic signature.
#[test]
fn edge_signature_field_is_reported_before_and_after_an_own_field_save() {
    let fixture = fixture(
        None,
        Form::Direct {
            existing: "Approval",
        },
    );
    let mut doc = Document::load(&fixture.input).unwrap();
    let signature = doc.add_object(dictionary! {
        "Type" => "Sig", "Filter" => "Adobe.PPKLite", "SubFilter" => "adbe.pkcs7.detached",
        "ByteRange" => vec![0.into(), 100.into(), 200.into(), 10.into()],
        "Contents" => Object::String(vec![0; 32], lopdf::StringFormat::Hexadecimal),
    });
    let widget = doc
        .get_dictionary_mut(fixture.existing_id.unwrap())
        .unwrap();
    widget.set("FT", "Sig");
    widget.set("V", signature);
    doc.save(&fixture.input).unwrap();
    assert_eq!(fields(&fixture.input)[0].kind, FormFieldKind::Signature);
    let output = fixture.path("signed-structure.pdf");
    save(
        &fixture.input,
        &output,
        &[text_field("Own", NAME_RECT)],
        &[],
    );
    assert_eq!(fields(&output)[0].kind, FormFieldKind::Signature);
    assert_eq!(fields(&output).len(), 2);
}

// Oracle: E1 item 8 asks for a measurement, with no pass/fail time limit.
// One field on the last of 500 blank synthetic pages must survive a reopen.
#[test]
fn edge_500_pages_save_one_own_field_and_report_elapsed_time() {
    let fixture = fixture(None, Form::Missing);
    let mut doc = Document::load(&fixture.input).unwrap();
    let page = doc.get_dictionary(fixture.page_id).unwrap().clone();
    let parent = page.get(b"Parent").unwrap().as_reference().unwrap();
    let mut kids = vec![Object::Reference(fixture.page_id)];
    for _ in 1..500 {
        kids.push(Object::Reference(doc.add_object(page.clone())));
    }
    let pages = doc.get_dictionary_mut(parent).unwrap();
    pages.set("Kids", kids);
    pages.set("Count", 500);
    doc.save(&fixture.input).unwrap();
    let output = fixture.path("500-pages.pdf");
    let mut field = text_field("Last page", NAME_RECT);
    if let Annotation::FormField { page, .. } = &mut field {
        *page = 499;
    }
    let start = std::time::Instant::now();
    save(&fixture.input, &output, &[field], &[]);
    eprintln!(
        "E1 500-page own-field save: {:.3} ms",
        start.elapsed().as_secs_f64() * 1000.0
    );
    assert_eq!(Document::load(&output).unwrap().get_pages().len(), 500);
    assert_eq!(fields(&output)[0].page_index, Some(499));
    assert_eq!(fields(&output)[0].rect, NAME_RECT);
}

// Oracle: E1 item 8. Password unlock uses the production qpdf wrapper;
// the unlocked copy accepts a field and preserves it through a reopen.
#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "requires real qpdf; --features sidecar-tests"
)]
async fn edge_password_unlocked_pdf_accepts_an_own_field() {
    use pdf_editor_lib::sidecars::{manager::SidecarManager, qpdf::QpdfWrapper};
    let fixture = fixture(None, Form::Missing);
    let encrypted = fixture.path("encrypted.pdf");
    let unlocked = fixture.path("unlocked.pdf");
    let output = fixture.path("filled-unlocked.pdf");
    run_sidecar(
        "qpdf",
        &[
            "--encrypt".into(),
            "test-user".into(),
            "test-owner".into(),
            "256".into(),
            "--".into(),
            fixture.input.display().to_string(),
            encrypted.display().to_string(),
        ],
    )
    .await;
    QpdfWrapper::new(SidecarManager::new(1))
        .decrypt(&encrypted, &unlocked, Some("test-user"))
        .await
        .unwrap();
    save(&unlocked, &output, &[text_field("Own", NAME_RECT)], &[]);
    assert_eq!(fields(&output)[0].name, "Own");
}

// Oracle: E1 item 8. Both qpdf storage forms must be readable before editing.
// A full save need not preserve linearization or compressed object storage.
#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "requires real qpdf; --features sidecar-tests"
)]
async fn edge_linearized_and_object_stream_pdfs_accept_an_own_field() {
    use pdf_editor_lib::sidecars::{manager::SidecarManager, qpdf::QpdfWrapper};
    let fixture = fixture(None, Form::Missing);
    let linear = fixture.path("linear.pdf");
    let objects = fixture.path("objects.pdf");
    let qpdf = QpdfWrapper::new(SidecarManager::new(1));
    qpdf.linearize(&fixture.input, &linear, None).await.unwrap();
    qpdf.object_streams_generate(&fixture.input, &objects, None)
        .await
        .unwrap();
    assert!(std::fs::read(&linear)
        .unwrap()
        .windows(11)
        .any(|bytes| bytes == b"/Linearized"));
    assert!(std::fs::read(&objects)
        .unwrap()
        .windows(7)
        .any(|bytes| bytes == b"/ObjStm"));
    for input in [linear, objects] {
        let output = fixture.path("edited.pdf");
        save(&input, &output, &[text_field("Own", NAME_RECT)], &[]);
        assert_eq!(fields(&output)[0].rect, NAME_RECT);
        let (stdout, _) =
            run_sidecar("qpdf", &["--check".into(), output.display().to_string()]).await;
        assert!(
            stdout.contains("No syntax or stream encoding errors found"),
            "{stdout}"
        );
    }
}

// Oracle: writer rule 5 stores the unrotated PDF rect exactly and copies
// /Rotate into /MK /R, including the 180 and 270 degree cases from V2 D.
#[test]
fn edge_rotations_180_and_270_keep_the_exact_rect() {
    for rotation in [180, 270] {
        let fixture = fixture(Some(rotation), Form::Missing);
        let output = fixture.path("rotated.pdf");
        let written = save(
            &fixture.input,
            &output,
            &[text_field("Own", NAME_RECT)],
            &[],
        );
        let doc = Document::load(&output).unwrap();
        let field = widget(&doc, written_id(&written, 0));
        assert_eq!(rect_values(field, b"Rect"), NAME_RECT);
        assert_eq!(
            field
                .get(b"MK")
                .unwrap()
                .as_dict()
                .unwrap()
                .get(b"R")
                .unwrap(),
            &Object::Integer(rotation)
        );
        assert_eq!(fields(&output)[0].rect, NAME_RECT);
    }
}

// Oracle: PDF rects use unrotated user space. A non-zero MediaBox origin
// and a smaller CropBox must not translate the rect or change either box.
#[test]
fn edge_media_origin_and_crop_box_do_not_change_the_field_rect() {
    let fixture = fixture(None, Form::Missing);
    let media = rect_object(&[20.0, 30.0, 632.0, 822.0]);
    let crop = rect_object(&[50.0, 60.0, 580.0, 750.0]);
    let mut doc = Document::load(&fixture.input).unwrap();
    let page = doc.get_dictionary_mut(fixture.page_id).unwrap();
    page.set("MediaBox", media.clone());
    page.set("CropBox", crop.clone());
    doc.save(&fixture.input).unwrap();
    let output = fixture.path("cropped.pdf");
    let written = save(
        &fixture.input,
        &output,
        &[text_field("Own", NAME_RECT)],
        &[],
    );
    let doc = Document::load(&output).unwrap();
    let page = doc.get_dictionary(fixture.page_id).unwrap();
    assert_eq!(rect_values(page, b"MediaBox"), [20.0, 30.0, 632.0, 822.0]);
    assert_eq!(rect_values(page, b"CropBox"), [50.0, 60.0, 580.0, 750.0]);
    assert_eq!(
        rect_values(widget(&doc, written_id(&written, 0)), b"Rect"),
        NAME_RECT
    );
    assert_eq!(fields(&output)[0].rect, NAME_RECT);
}

// Oracle: writer rule 2 creates a missing /Fields array in an existing
// AcroForm, keeps unrelated entries, and registers the resolving widget.
#[test]
fn edge_acroform_without_fields_registers_the_new_widget() {
    let fixture = fixture(None, Form::Missing);
    let mut doc = Document::load(&fixture.input).unwrap();
    let root = doc.trailer.get(b"Root").unwrap().as_reference().unwrap();
    doc.get_dictionary_mut(root)
        .unwrap()
        .set("AcroForm", dictionary! { "SigFlags" => 3 });
    doc.save(&fixture.input).unwrap();
    let output = fixture.path("missing-fields.pdf");
    let written = save(
        &fixture.input,
        &output,
        &[text_field("Own", NAME_RECT)],
        &[],
    );
    let doc = Document::load(&output).unwrap();
    assert_eq!(field_ids(&doc), vec![written_id(&written, 0)]);
    assert_eq!(page_annot_ids(&doc), field_ids(&doc));
    assert_eq!(
        acroform(&doc).get(b"SigFlags").unwrap(),
        &Object::Integer(3)
    );
    assert_eq!(fields(&output)[0].name, "Own");
}

// Oracle: rule 2 adds a missing /Helv to direct resources. The documented
// indirect /DR /Font limit leaves those objects intact and the PDF readable.
#[test]
fn edge_missing_helv_preserves_direct_and_indirect_default_resources() {
    for indirect in [false, true] {
        let fixture = fixture(None, Form::Missing);
        let mut doc = Document::load(&fixture.input).unwrap();
        let original = dictionary! { "Original" => dictionary! {
            "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Courier",
        }};
        let fonts_id = doc.add_object(original.clone());
        let resources = dictionary! { "Font" => if indirect {
            Object::Reference(fonts_id)
        } else { Object::Dictionary(original.clone()) } };
        let resources_id = doc.add_object(resources.clone());
        let root = doc.trailer.get(b"Root").unwrap().as_reference().unwrap();
        doc.get_dictionary_mut(root).unwrap().set("AcroForm", dictionary! {
            "Fields" => Vec::<Object>::new(),
            "DR" => if indirect { Object::Reference(resources_id) } else { Object::Dictionary(resources) },
        });
        doc.save(&fixture.input).unwrap();
        let output = fixture.path("default-resources.pdf");
        save(
            &fixture.input,
            &output,
            &[text_field("Own", NAME_RECT)],
            &[],
        );
        let doc = Document::load(&output).unwrap();
        assert_default_fonts(&doc, indirect, fonts_id, resources_id, &original);
        assert_eq!(fields(&output)[0].name, "Own");
        assert_eq!(page_annot_ids(&doc), field_ids(&doc));
    }
}

fn assert_default_fonts(
    doc: &Document,
    indirect: bool,
    fonts_id: ObjectId,
    resources_id: ObjectId,
    original: &Dictionary,
) {
    let entry = acroform(doc).get(b"DR").unwrap();
    let resources = resolve(doc, entry).as_dict().unwrap();
    let font_entry = resources.get(b"Font").unwrap();
    let fonts = resolve(doc, font_entry).as_dict().unwrap();
    assert_eq!(
        fonts.get(b"Original").unwrap(),
        original.get(b"Original").unwrap()
    );
    if indirect {
        assert_eq!(entry.as_reference().unwrap(), resources_id);
        assert_eq!(font_entry.as_reference().unwrap(), fonts_id);
        assert_eq!(fonts, original);
    } else {
        let helv = fonts.get(b"Helv").unwrap().as_dict().unwrap();
        assert_eq!(name_of(helv, b"BaseFont"), "Helvetica");
        assert_eq!(name_of(helv, b"Encoding"), "WinAnsiEncoding");
    }
}

fn rect_values(dict: &Dictionary, key: &[u8]) -> Vec<f32> {
    dict.get(key)
        .unwrap()
        .as_array()
        .unwrap()
        .iter()
        .map(|number| number.as_float().unwrap())
        .collect()
}

// Oracle: O4 protects every source field. A terminal field can inherit
// /FT from an ancestor and have a separate widget, without its own /FT.
#[test]
fn o4_source_field_with_inherited_type_is_refused_without_writing() {
    let fixture = fixture(None, Form::Direct { existing: "Source" });
    let mut doc = Document::load(&fixture.input).unwrap();
    let widget_id = fixture.existing_id.unwrap();
    let ancestor_id = doc.new_object_id();
    let field_id = doc.new_object_id();
    let widget = doc.get_dictionary_mut(widget_id).unwrap();
    widget.remove(b"FT");
    widget.remove(b"T");
    widget.remove(b"V");
    widget.set("Parent", Object::Reference(field_id));
    doc.set_object(
        ancestor_id,
        dictionary! {
            "FT" => "Tx", "T" => text_string("Group"),
            "Kids" => vec![Object::Reference(field_id)],
        },
    );
    doc.set_object(
        field_id,
        dictionary! {
            "T" => text_string("Source"), "V" => text_string("Hello"),
            "Parent" => Object::Reference(ancestor_id),
            "Kids" => vec![Object::Reference(widget_id)],
        },
    );
    let catalog_id = doc
        .trailer
        .get(b"Root")
        .and_then(Object::as_reference)
        .unwrap();
    doc.get_dictionary_mut(catalog_id).unwrap().set(
        "AcroForm",
        dictionary! {
            "Fields" => vec![Object::Reference(ancestor_id)],
        },
    );
    doc.save(&fixture.input).unwrap();
    let read = fields(&fixture.input);
    assert_eq!(read.len(), 1);
    assert_eq!(read[0].name, "Group.Source");
    assert!(!read[0].own);
    let output = fixture.path("refused-inherited.pdf");
    let result = save_annotations(&fixture.input, &output, &[], &[field_id.into()]);
    assert_eq!(
        result.unwrap_err().to_string(),
        "cannot remove a source form field"
    );
    assert!(!output.exists());
}

// Oracle: new fields start empty. Deleting a filled field and drawing a
// new one with the same name must not copy the deleted field's value.
#[test]
fn o4_new_field_reusing_a_deleted_name_starts_empty() {
    let fixture = fixture(None, Form::Missing);
    let output = fixture.path("reuse-name.pdf");
    let original = save(
        &fixture.input,
        &output,
        &[text_field("Employee", NAME_RECT)],
        &[],
    )[0]
    .unwrap();
    set_form_values(
        &output,
        &output,
        &[FormValueUpdate {
            field_id: format!("{}:{}", original.object, original.generation),
            value: Some("Alice".into()),
        }],
    )
    .unwrap();
    save(
        &output,
        &output,
        &[text_field("Employee", MOVED_RECT)],
        &[original],
    );
    let read = fields(&output);
    assert_eq!(read.len(), 1);
    assert_eq!(read[0].name, "Employee");
    assert_eq!(read[0].value, None);
}

fn linked_field(source: AnnotationRef, rect: [f32; 4]) -> Annotation {
    serde_json::from_value(serde_json::json!({
        "type": "form_field", "page": 0, "rect": rect,
        "name": "Employee", "kind": "text", "multiline": false,
        "font_size": 0, "source_field": source,
    }))
    .unwrap()
}

// Oracle: a layout source must be removed in the same atomic save.
#[test]
fn o4_source_not_in_removals_is_refused_without_writing() {
    let fixture = fixture(None, Form::Missing);
    let first = fixture.path("first.pdf");
    let output = fixture.path("refused-source.pdf");
    let original = save(
        &fixture.input,
        &first,
        &[text_field("Employee", NAME_RECT)],
        &[],
    )[0]
    .unwrap();
    let result = save_annotations(&first, &output, &[linked_field(original, MOVED_RECT)], &[]);
    assert_eq!(
        result.unwrap_err().to_string(),
        "saved own field source must be replaced"
    );
    assert!(!output.exists());
}

// Oracle: one saved object can supply only one layout replacement.
#[test]
fn o4_source_used_twice_is_refused_without_writing() {
    let fixture = fixture(None, Form::Missing);
    let first = fixture.path("first.pdf");
    let output = fixture.path("refused-duplicate.pdf");
    let original = save(
        &fixture.input,
        &first,
        &[text_field("Employee", NAME_RECT)],
        &[],
    )[0]
    .unwrap();
    let result = save_annotations(
        &first,
        &output,
        &[
            linked_field(original, MOVED_RECT),
            linked_field(original, NAME_RECT),
        ],
        &[original],
    );
    assert_eq!(
        result.unwrap_err().to_string(),
        "duplicate saved own field source"
    );
    assert!(!output.exists());
}

// Oracle: O4 brief, part 1. Only marked app fields can be moved or deleted.
#[test]
fn o4_saved_field_has_marker_and_source_field_does_not() {
    let fixture = fixture(None, Form::Direct { existing: "Source" });
    let output = fixture.path("marked.pdf");
    let written = save(
        &fixture.input,
        &output,
        &[text_field("Own", NAME_RECT)],
        &[],
    );
    let doc = Document::load(&output).unwrap();
    assert_eq!(
        widget(&doc, written_id(&written, 0))
            .get(b"PdfEditorOwn")
            .unwrap(),
        &Object::Boolean(true)
    );
    let read = fields(&output);
    assert_eq!(
        serde_json::to_value(field_with_rect(&read, NAME_RECT)).unwrap()["own"],
        true
    );
    assert_eq!(
        serde_json::to_value(field_with_rect(&read, EXISTING_RECT)).unwrap()["own"],
        false
    );
}

#[test]
fn o4_move_keeps_one_named_field_and_delete_leaves_no_dangling_fields() {
    let fixture = fixture(None, Form::Indirect);
    let first = fixture.path("first.pdf");
    let moved = fixture.path("moved.pdf");
    let deleted = fixture.path("deleted.pdf");
    let original = save(
        &fixture.input,
        &first,
        &[text_field("Employee", NAME_RECT)],
        &[],
    )[0]
    .unwrap();
    let replacement = save(
        &first,
        &moved,
        &[text_field("Employee", MOVED_RECT)],
        &[original],
    )[0]
    .unwrap();
    let read = fields(&moved);
    assert_eq!(read.len(), 1);
    assert_eq!(read[0].name, "Employee");
    assert_eq!(read[0].rect, MOVED_RECT);
    let doc = Document::load(&moved).unwrap();
    assert_eq!(field_ids(&doc), vec![object_id(replacement)]);
    assert_eq!(page_annot_ids(&doc), vec![object_id(replacement)]);
    save(&moved, &deleted, &[], &[replacement]);
    assert_eq!(fields(&deleted), vec![]);
    let doc = Document::load(&deleted).unwrap();
    assert_eq!(field_ids(&doc), vec![]);
    assert_eq!(page_annot_ids(&doc), vec![]);
}

#[test]
fn o4_delete_unmarked_source_widget_is_refused_without_writing() {
    let fixture = fixture(None, Form::Direct { existing: "Source" });
    let output = fixture.path("refused.pdf");
    let result = save_annotations(
        &fixture.input,
        &output,
        &[],
        &[fixture.existing_id.unwrap().into()],
    );
    assert!(result
        .unwrap_err()
        .to_string()
        .contains("cannot remove a source form field"));
    assert!(!output.exists());
    assert_eq!(fields(&fixture.input).len(), 1);
}

// Oracle: a layout move changes placement only, never a filled value or
// the saved text settings. O4 permits move/resize/delete of saved fields.
#[test]
fn o4_move_preserves_filled_text_and_saved_text_settings() {
    let fixture = fixture(None, Form::Missing);
    let output = fixture.path("filled.pdf");
    let field = Annotation::FormField {
        page: 0,
        rect: NAME_RECT,
        name: "Employee".into(),
        kind: OwnFieldKind::Text,
        multiline: true,
        font_size: 16.0,
        source_field: None,
    };
    let original = save(&fixture.input, &output, &[field], &[])[0].unwrap();
    set_form_values(
        &output,
        &output,
        &[FormValueUpdate {
            field_id: format!("{}:{}", original.object, original.generation),
            value: Some("Alice".into()),
        }],
    )
    .unwrap();
    let replacement = save(
        &output,
        &output,
        &[linked_field(original, MOVED_RECT)],
        &[original],
    )[0]
    .unwrap();
    assert_eq!(fields(&output)[0].value.as_deref(), Some("Alice"));
    let doc = Document::load(&output).unwrap();
    let widget = widget(&doc, object_id(replacement));
    assert_eq!(widget.get(b"Ff").unwrap(), &Object::Integer(4096));
    assert_eq!(
        widget.get(b"DA").and_then(Object::as_str).unwrap(),
        b"/Helv 16 Tf 0 g"
    );
    assert!(
        !widget.has(b"AP"),
        "the filled text appearance is generated by the reader"
    );
}

#[test]
fn o4_resize_preserves_checked_state_and_resolving_appearances() {
    let fixture = fixture(None, Form::Missing);
    let output = fixture.path("checked.pdf");
    let original = save(
        &fixture.input,
        &output,
        &[checkbox("Consent", [100.0, 650.0, 114.0, 664.0])],
        &[],
    )[0]
    .unwrap();
    set_form_values(
        &output,
        &output,
        &[FormValueUpdate {
            field_id: format!("{}:{}", original.object, original.generation),
            value: Some("Yes".into()),
        }],
    )
    .unwrap();
    let replacement = save(
        &output,
        &output,
        &[Annotation::FormField {
            page: 0,
            rect: [100.0, 600.0, 128.0, 628.0],
            name: "Consent".into(),
            kind: OwnFieldKind::Checkbox,
            multiline: false,
            font_size: 0.0,
            source_field: Some(original),
        }],
        &[original],
    )[0]
    .unwrap();
    assert_eq!(fields(&output)[0].value.as_deref(), Some("Yes"));
    let doc = Document::load(&output).unwrap();
    let widget = widget(&doc, object_id(replacement));
    assert_eq!(name_of(widget, b"AS"), "Yes");
    let states = widget
        .get(b"AP")
        .and_then(Object::as_dict)
        .unwrap()
        .get(b"N")
        .and_then(Object::as_dict)
        .unwrap();
    let yes = states.get(b"Yes").and_then(Object::as_reference).unwrap();
    assert!(doc.get_object(yes).and_then(Object::as_stream).is_ok());
}

// Oracle: V-P0 F3. Saving a visible value must preserve Im0, including
// indirect Resources and Font dictionaries, so the original image renders.
fn indirect_resources_value_copy() -> (Fixture, PathBuf, ObjectId) {
    use pdf_editor_lib::services::text_style::TextStyle;
    let fixture = fixture(None, Form::Missing);
    let mut doc = Document::load(&fixture.input).unwrap();
    let image = doc.add_object(lopdf::Stream::new(
        dictionary! {
            "Type" => "XObject", "Subtype" => "Image", "Width" => 1,
            "Height" => 1, "ColorSpace" => "DeviceRGB", "BitsPerComponent" => 8,
        },
        vec![255, 0, 0],
    ));
    let fonts = doc.add_object(dictionary! { "Original" => dictionary! {
        "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Courier",
    }});
    let resources = doc.add_object(dictionary! {
        "XObject" => dictionary! { "Im0" => Object::Reference(image) },
        "Font" => Object::Reference(fonts),
    });
    let content = doc.add_object(lopdf::Stream::new(
        dictionary! {},
        b"q 100 0 0 100 0 0 cm /Im0 Do Q".to_vec(),
    ));
    let page = doc.get_dictionary_mut(fixture.page_id).unwrap();
    page.set("Resources", Object::Reference(resources));
    page.set("Contents", Object::Reference(content));
    doc.save(&fixture.input).unwrap();
    let output = fixture.path("values.pdf");
    save(
        &fixture.input,
        &output,
        &[Annotation::FreeText {
            page: 0,
            rect: NAME_RECT,
            contents: "Alice".to_string(),
            style: TextStyle::default(),
            background_fill: None,
            border_color: [0.0; 3],
            border_width: 0.0,
            auto_resize: false,
        }],
        &[],
    );
    (fixture, output, image)
}

#[test]
fn o4_value_save_preserves_indirect_page_resources_and_image() {
    let (fixture, output, image) = indirect_resources_value_copy();
    let saved = Document::load(&output).unwrap();
    let page = saved.get_dictionary(fixture.page_id).unwrap();
    let resources = resolve(&saved, page.get(b"Resources").unwrap())
        .as_dict()
        .unwrap();
    assert_eq!(
        resources
            .get(b"XObject")
            .and_then(Object::as_dict)
            .unwrap()
            .get(b"Im0")
            .unwrap(),
        &Object::Reference(image)
    );
    let fonts = resolve(&saved, resources.get(b"Font").unwrap())
        .as_dict()
        .unwrap();
    assert!(fonts.has(b"Original"));
    assert!(fonts.len() >= 2, "the new value font must also be bound");
}

#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "requires mutool; --features sidecar-tests"
)]
async fn o4_indirect_resources_value_copy_renders_without_missing_im0() {
    let (fixture, output, _) = indirect_resources_value_copy();
    let png = fixture.path("values.png");
    let args = [
        "draw",
        "-F",
        "png",
        "-o",
        png.to_str().unwrap(),
        output.to_str().unwrap(),
        "1",
    ]
    .map(String::from);
    let (_, stderr) = run_sidecar("mutool", &args).await;
    assert!(!stderr.to_lowercase().contains("error"), "{stderr}");
    assert!(png.exists());
}

/// The AcroForm of the fixture.
#[derive(Clone, Copy)]
enum Form {
    /// No `/AcroForm` in the catalog.
    Missing,
    /// A direct `/AcroForm` dictionary with one merged text field.
    Direct { existing: &'static str },
    /// An indirect `/AcroForm` object whose `/Fields` is an indirect, empty array.
    Indirect,
}

struct Fixture {
    _dir: TempDir,
    input: PathBuf,
    page_id: ObjectId,
    existing_id: Option<ObjectId>,
}

impl Fixture {
    fn path(&self, name: &str) -> PathBuf {
        self._dir.path().join(name)
    }
}

fn rect_object(rect: &[f32; 4]) -> Object {
    Object::Array(rect.iter().map(|v| Object::Real(*v)).collect())
}

/// One page 612 x 792, optionally rotated, with the given AcroForm.
fn fixture(rotate: Option<i64>, form: Form) -> Fixture {
    let mut doc = Document::with_version("1.7");
    let pages_id = doc.new_object_id();
    let page_id = doc.new_object_id();
    let mut page = dictionary! {
        "Type" => "Page",
        "Parent" => Object::Reference(pages_id),
        "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
        "Resources" => dictionary! {},
    };
    if let Some(rotate) = rotate {
        page.set("Rotate", rotate);
    }
    let mut catalog = dictionary! {
        "Type" => "Catalog",
        "Pages" => Object::Reference(pages_id),
    };
    let mut existing_id = None;
    match form {
        Form::Missing => {}
        Form::Direct { existing } => {
            let id = doc.add_object(dictionary! {
                "Type" => "Annot",
                "Subtype" => "Widget",
                "FT" => "Tx",
                "T" => text_string(existing),
                "V" => text_string("Hello"),
                "P" => Object::Reference(page_id),
                "Rect" => rect_object(&EXISTING_RECT),
            });
            page.set("Annots", vec![Object::Reference(id)]);
            catalog.set(
                "AcroForm",
                dictionary! { "Fields" => vec![Object::Reference(id)] },
            );
            existing_id = Some(id);
        }
        Form::Indirect => {
            let fields_id = doc.add_object(Object::Array(Vec::new()));
            let acroform_id = doc.add_object(dictionary! {
                "Fields" => Object::Reference(fields_id),
            });
            catalog.set("AcroForm", Object::Reference(acroform_id));
        }
    }
    doc.set_object(page_id, page);
    doc.set_object(
        pages_id,
        dictionary! {
            "Type" => "Pages",
            "Kids" => vec![Object::Reference(page_id)],
            "Count" => 1,
        },
    );
    let catalog_id = doc.add_object(catalog);
    doc.trailer.set("Root", Object::Reference(catalog_id));
    let dir = TempDir::new().expect("tempdir");
    let input = dir.path().join("input.pdf");
    doc.save(&input).expect("write fixture");
    Fixture {
        _dir: dir,
        input,
        page_id,
        existing_id,
    }
}

fn text_field(name: &str, rect: [f32; 4]) -> Annotation {
    Annotation::FormField {
        page: 0,
        rect,
        name: name.to_string(),
        kind: OwnFieldKind::Text,
        multiline: false,
        font_size: 0.0,
        source_field: None,
    }
}

fn checkbox(name: &str, rect: [f32; 4]) -> Annotation {
    Annotation::FormField {
        page: 0,
        rect,
        name: name.to_string(),
        kind: OwnFieldKind::Checkbox,
        multiline: false,
        font_size: 0.0,
        source_field: None,
    }
}

fn save(
    input: &Path,
    output: &Path,
    annotations: &[Annotation],
    replaced: &[AnnotationRef],
) -> Vec<Option<AnnotationRef>> {
    save_annotations(input, output, annotations, replaced).expect("save own fields")
}

fn object_id(reference: AnnotationRef) -> ObjectId {
    (reference.object, reference.generation)
}

fn written_id(written: &[Option<AnnotationRef>], index: usize) -> ObjectId {
    object_id(written[index].expect("field written"))
}

fn resolve<'a>(doc: &'a Document, object: &'a Object) -> &'a Object {
    doc.dereference(object).expect("resolve reference").1
}

fn acroform(doc: &Document) -> &Dictionary {
    let catalog = doc.catalog().expect("catalog");
    resolve(doc, catalog.get(b"AcroForm").expect("/AcroForm"))
        .as_dict()
        .expect("/AcroForm is a dictionary")
}

fn reference_ids(doc: &Document, array: &Object) -> Vec<ObjectId> {
    resolve(doc, array)
        .as_array()
        .expect("an array")
        .iter()
        .map(|entry| entry.as_reference().expect("a reference"))
        .collect()
}

fn field_ids(doc: &Document) -> Vec<ObjectId> {
    reference_ids(doc, acroform(doc).get(b"Fields").expect("/Fields"))
}

fn page_annot_ids(doc: &Document) -> Vec<ObjectId> {
    let page_id = *doc.get_pages().get(&1).expect("page 1");
    match doc.get_dictionary(page_id).expect("page").get(b"Annots") {
        Ok(annots) => reference_ids(doc, annots),
        Err(_) => Vec::new(),
    }
}

fn widget(doc: &Document, id: ObjectId) -> &Dictionary {
    doc.get_dictionary(id).expect("widget dictionary")
}

fn name_of<'a>(dict: &'a Dictionary, key: &[u8]) -> &'a str {
    let name = dict
        .get(key)
        .and_then(Object::as_name)
        .expect("a name value");
    std::str::from_utf8(name).expect("an ASCII name")
}

fn fields(path: &Path) -> Vec<FormField> {
    read_form_fields(path).expect("read form fields")
}

fn field_with_rect(fields: &[FormField], rect: [f32; 4]) -> &FormField {
    fields
        .iter()
        .find(|field| field.rect == rect)
        .expect("a field with the rect")
}

#[test]
fn r1_text_field_is_a_real_acroform_field() {
    let fixture = fixture(None, Form::Missing);
    let output = fixture.path("r1.pdf");

    let written = save(
        &fixture.input,
        &output,
        &[text_field("Meno", NAME_RECT)],
        &[],
    );

    let read = fields(&output);
    let expected = FormField {
        id: format!(
            "{}:{}",
            written_id(&written, 0).0,
            written_id(&written, 0).1
        ),
        name: "Meno".to_string(),
        kind: FormFieldKind::Text,
        value: None,
        page_index: Some(0),
        rect: NAME_RECT,
        options: Vec::new(),
        read_only: false,
        required: false,
        own: true,
    };
    assert_eq!(read, vec![expected]);

    let doc = Document::load(&output).expect("load saved copy");
    let id = written_id(&written, 0);
    let widget = widget(&doc, id);
    assert_eq!(name_of(widget, b"Subtype"), "Widget");
    assert_eq!(name_of(widget, b"FT"), "Tx");
    assert_eq!(widget.get(b"F").expect("/F"), &Object::Integer(4));
    assert_eq!(
        widget.get(b"P").and_then(Object::as_reference).expect("/P"),
        fixture.page_id
    );
    assert!(page_annot_ids(&doc).contains(&id));
    assert!(field_ids(&doc).contains(&id));
}

#[test]
fn r2_names_are_unique_across_existing_and_new_fields() {
    let fixture = fixture(None, Form::Direct { existing: "Meno" });
    let output = fixture.path("r2.pdf");
    let first = [100.0, 600.0, 240.0, 622.0];
    let second = [100.0, 550.0, 240.0, 572.0];
    let dotted = [100.0, 500.0, 240.0, 522.0];
    let slovak = [100.0, 450.0, 240.0, 472.0];

    save(
        &fixture.input,
        &output,
        &[
            text_field("Meno", first),
            text_field("Meno", second),
            text_field("a.b", dotted),
            text_field("Dátum narodenia Ľ", slovak),
        ],
        &[],
    );

    let read = fields(&output);
    assert_eq!(read.len(), 5);
    assert_eq!(field_with_rect(&read, EXISTING_RECT).name, "Meno");
    assert_eq!(field_with_rect(&read, first).name, "Meno_2");
    assert_eq!(field_with_rect(&read, second).name, "Meno_3");
    assert_eq!(field_with_rect(&read, dotted).name, "a_b");
    assert_eq!(field_with_rect(&read, slovak).name, "Dátum narodenia Ľ");
}

#[test]
fn r2_rule_n_sanitizes_the_requested_name() {
    assert_eq!(sanitize_field_name("a.b"), "a_b");
    assert_eq!(sanitize_field_name("Meno."), "Meno_");
    assert_eq!(sanitize_field_name(""), "Field");
    assert_eq!(sanitize_field_name("    "), "Field");
    assert_eq!(sanitize_field_name(&"x".repeat(200)), "x".repeat(128));
    assert_eq!(sanitize_field_name("\tMe\u{7}no\n"), "Meno");
    assert_eq!(sanitize_field_name("  Meno  "), "Meno");
}

#[test]
fn r3_rotated_page_sets_the_widget_rotation() {
    let fixture = fixture(Some(90), Form::Missing);
    let output = fixture.path("r3.pdf");

    let written = save(
        &fixture.input,
        &output,
        &[text_field("Meno", NAME_RECT)],
        &[],
    );

    let doc = Document::load(&output).expect("load saved copy");
    let mk = widget(&doc, written_id(&written, 0))
        .get(b"MK")
        .and_then(Object::as_dict)
        .expect("/MK");
    assert_eq!(mk.get(b"R").expect("/MK /R"), &Object::Integer(90));
    assert_eq!(fields(&output)[0].rect, NAME_RECT);
}

#[test]
fn r5_checkbox_has_a_yes_state_and_can_be_checked() {
    let fixture = fixture(None, Form::Missing);
    let output = fixture.path("r5.pdf");
    let checked = fixture.path("r5-checked.pdf");

    let written = save(
        &fixture.input,
        &output,
        &[checkbox("Suhlas", [100.0, 600.0, 114.0, 614.0])],
        &[],
    );
    let read = fields(&output);
    assert_eq!(read.len(), 1);
    assert_eq!(read[0].kind, FormFieldKind::Checkbox);
    assert_eq!(read[0].options, vec!["Yes".to_string()]);

    set_form_values(
        &output,
        &checked,
        &[FormValueUpdate {
            field_id: read[0].id.clone(),
            value: Some("Yes".to_string()),
        }],
    )
    .expect("check the box");

    let read = fields(&checked);
    assert_eq!(read[0].options, vec!["Yes".to_string()]);
    assert_eq!(read[0].value.as_deref(), Some("Yes"));
    let doc = Document::load(&checked).expect("load checked copy");
    assert_eq!(name_of(widget(&doc, written_id(&written, 0)), b"AS"), "Yes");
}

#[test]
fn r6_direct_acroform_keeps_the_existing_field() {
    let fixture = fixture(
        None,
        Form::Direct {
            existing: "Existing",
        },
    );
    let output = fixture.path("r6.pdf");

    save(
        &fixture.input,
        &output,
        &[text_field("Meno", NAME_RECT)],
        &[],
    );

    let read = fields(&output);
    let existing = field_with_rect(&read, EXISTING_RECT);
    assert_eq!(existing.name, "Existing");
    assert_eq!(existing.value.as_deref(), Some("Hello"));
    let doc = Document::load(&output).expect("load saved copy");
    assert_eq!(field_ids(&doc).len(), 2);
    assert!(field_ids(&doc).contains(&fixture.existing_id.expect("existing id")));
    let form = acroform(&doc);
    assert!(form.has(b"DA"));
    let fonts = resolve(&doc, form.get(b"DR").expect("/DR"))
        .as_dict()
        .expect("/DR dictionary")
        .get(b"Font")
        .map(|fonts| resolve(&doc, fonts))
        .and_then(Object::as_dict)
        .expect("/DR /Font");
    assert!(fonts.has(b"Helv"));
}

#[test]
fn r7_rejects_a_small_or_non_finite_rect() {
    let fixture = fixture(None, Form::Missing);
    let output = fixture.path("r7.pdf");

    for rect in [[10.0, 10.0, 12.0, 12.0], [f32::NAN, 10.0, 100.0, 40.0]] {
        let error = save_annotations(&fixture.input, &output, &[text_field("Meno", rect)], &[])
            .expect_err("rect is rejected");
        assert_eq!(error.to_string(), RECT_ERROR);
    }
    assert!(!output.exists());
}

#[test]
fn r8_second_save_over_the_first_copy_keeps_both_fields() {
    let fixture = fixture(None, Form::Missing);
    let output = fixture.path("r8.pdf");

    save(
        &fixture.input,
        &output,
        &[text_field("Meno", NAME_RECT)],
        &[],
    );
    save(&output, &output, &[text_field("Meno", MOVED_RECT)], &[]);

    let read = fields(&output);
    assert_eq!(read.len(), 2);
    assert_eq!(field_with_rect(&read, NAME_RECT).name, "Meno");
    assert_eq!(field_with_rect(&read, MOVED_RECT).name, "Meno_2");
}

/// R10 and R12: the replaced field leaves no trace and every remaining
/// reference resolves.
fn assert_replaced_cleanly(output: &Path, replaced: ObjectId) {
    let doc = Document::load(output).expect("load saved copy");
    let fields_now = field_ids(&doc);
    let annots_now = page_annot_ids(&doc);
    assert_eq!(fields_now.len(), 1);
    assert!(!fields_now.contains(&replaced));
    assert!(!annots_now.contains(&replaced));
    assert!(!doc.objects.contains_key(&replaced));
    for id in fields_now.iter().chain(annots_now.iter()) {
        assert!(doc.get_object(*id).is_ok(), "{id:?} resolves");
    }
    let read = fields(output);
    assert_eq!(read.len(), 1);
    assert_eq!(read[0].name, "Meno");
    assert_eq!(read[0].rect, MOVED_RECT);
}

fn replace_round_trip(form: Form, name: &str) {
    let fixture = fixture(None, form);
    let output = fixture.path(name);
    let first = save(
        &fixture.input,
        &output,
        &[text_field("Meno", NAME_RECT)],
        &[],
    );
    let replaced = first[0].expect("first field written");

    save(
        &output,
        &output,
        &[text_field("Meno", MOVED_RECT)],
        &[replaced],
    );

    assert_replaced_cleanly(&output, object_id(replaced));
}

#[test]
fn r10_replacing_a_field_keeps_its_name_and_no_dangling_reference() {
    replace_round_trip(Form::Missing, "r10.pdf");
}

#[test]
fn r11_deleting_the_only_field_keeps_an_empty_acroform() {
    let fixture = fixture(None, Form::Missing);
    let output = fixture.path("r11.pdf");
    let first = save(
        &fixture.input,
        &output,
        &[text_field("Meno", NAME_RECT)],
        &[],
    );
    let replaced = first[0].expect("field written");

    save(&output, &output, &[], &[replaced]);

    let doc = Document::load(&output).expect("load saved copy");
    assert_eq!(field_ids(&doc).len(), 0);
    assert!(doc.catalog().expect("catalog").has(b"AcroForm"));
    assert!(fields(&output).is_empty());
    assert!(!page_annot_ids(&doc).contains(&object_id(replaced)));
}

#[test]
fn r12_replace_with_an_indirect_acroform_and_indirect_fields() {
    replace_round_trip(Form::Indirect, "r12.pdf");
}

async fn run_sidecar(name: &str, args: &[String]) -> (String, String) {
    use pdf_editor_lib::sidecars::manager::{SidecarManager, SidecarRunSpec};
    let output = SidecarManager::new(1)
        .run(SidecarRunSpec {
            name: name.to_string(),
            args: args.to_vec(),
            stdin: None,
            timeout: Some(std::time::Duration::from_secs(60)),
            cancellation: None,
        })
        .await
        .unwrap_or_else(|error| panic!("{name} failed: {error:?}"));
    (
        String::from_utf8_lossy(&output.stdout).to_string(),
        String::from_utf8_lossy(&output.stderr).to_string(),
    )
}

#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "requires real qpdf and mutool binaries; --features sidecar-tests"
)]
async fn r9_qpdf_and_mutool_accept_the_saved_fields() {
    let fixture = fixture(None, Form::Missing);
    let output = fixture.path("r9.pdf");
    save(
        &fixture.input,
        &output,
        &[
            text_field("Meno", NAME_RECT),
            checkbox("Suhlas", [100.0, 600.0, 114.0, 614.0]),
        ],
        &[],
    );
    let file = output.display().to_string();

    let (stdout, _) = run_sidecar("qpdf", &["--check".to_string(), file.clone()]).await;
    assert!(
        stdout.contains("No syntax or stream encoding errors found"),
        "{stdout}"
    );

    let png = fixture.path("r9-page1.png").display().to_string();
    let draw = ["draw", "-F", "png", "-o", &png, &file, "1"].map(String::from);
    let (_, stderr) = run_sidecar("mutool", &draw).await;
    assert!(!stderr.to_lowercase().contains("error"), "{stderr}");
    assert!(Path::new(&png).exists());

    let show = ["show", &file, "trailer/Root"].map(String::from);
    let (stdout, _) = run_sidecar("mutool", &show).await;
    assert!(stdout.contains("/AcroForm"), "{stdout}");

    let png = fixture.path("ghostscript-page1.png");
    run_sidecar(
        "gswin64c",
        &[
            "-dSAFER".into(),
            "-dBATCH".into(),
            "-dNOPAUSE".into(),
            "-dPrinted=true".into(),
            "-sDEVICE=png16m".into(),
            "-r72".into(),
            format!("-sOutputFile={}", png.display()),
            file.clone(),
        ],
    )
    .await;
    assert!(image::open(png).unwrap().width() > 0);

    // Real pdf.js runs in a separate Node process: its optional native canvas
    // must not load into a Vitest worker (the same boundary as viewport tests).
    let script = r#"
        const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const { readFileSync } = await import('node:fs');
        const task = getDocument({ data: new Uint8Array(readFileSync(process.argv[1])) });
        try {
            const pdf = await task.promise;
            const page = await pdf.getPage(1);
            const fields = (await page.getAnnotations()).map(a => ({ name: a.fieldName, type: a.fieldType, rect: a.rect }));
            fields.sort((a, b) => a.name.localeCompare(b.name));
            console.log(JSON.stringify(fields));
        } finally { await task.destroy(); }
    "#;
    let result = std::process::Command::new("node")
        .args(["--input-type=module", "--eval", script, &file])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    let stdout = String::from_utf8_lossy(&result.stdout);
    let read: serde_json::Value = serde_json::from_str(stdout.lines().last().unwrap()).unwrap();
    assert_eq!(
        read,
        serde_json::json!([
            { "name": "Meno", "type": "Tx", "rect": [100, 650, 240, 672] },
            { "name": "Suhlas", "type": "Btn", "rect": [100, 600, 114, 614] },
        ])
    );
}

// Oracle: E1 item 10 and the own-field contract: a pending empty field is
// saved through the print-copy writer with a 0.5 pt edge and no label or fill.
#[test]
fn edge_empty_own_field_prints_only_a_half_point_border() {
    use lopdf::content::Content;
    let fixture = fixture(None, Form::Missing);
    let output = fixture.path("print-copy.pdf");
    let written = save(
        &fixture.input,
        &output,
        &[text_field("Do not print this name", NAME_RECT)],
        &[],
    );
    let doc = Document::load(output).unwrap();
    let widget = widget(&doc, written_id(&written, 0));
    assert_eq!(widget.get(b"F").unwrap(), &Object::Integer(4));
    let ap = widget
        .get(b"AP")
        .unwrap()
        .as_dict()
        .unwrap()
        .get(b"N")
        .unwrap()
        .as_reference()
        .unwrap();
    let content = Content::decode(
        &doc.get_object(ap)
            .unwrap()
            .as_stream()
            .unwrap()
            .get_plain_content()
            .unwrap(),
    )
    .unwrap();
    let width = content
        .operations
        .iter()
        .find(|op| op.operator == "w")
        .unwrap();
    assert_eq!(width.operands, vec![Object::Real(0.5)]);
    let operators: Vec<_> = content
        .operations
        .iter()
        .map(|op| op.operator.as_str())
        .collect();
    assert_eq!(operators, ["q", "RG", "w", "re", "S", "Q", "BMC", "EMC"]);
}
