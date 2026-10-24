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
    assert_eq!(read.len(), 1);
    assert_eq!(read[0].name, "Meno");
    assert_eq!(read[0].kind, FormFieldKind::Text);
    assert_eq!(read[0].page_index, Some(0));
    assert_eq!(read[0].rect, NAME_RECT);
    assert_eq!(read[0].value, None);

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
}
