use anyhow::{Context, Result};
use lopdf::{Document, Object, ObjectId};
use std::collections::BTreeMap;
use std::ops::RangeInclusive;
use std::path::{Path, PathBuf};

pub fn merge_pdfs(inputs: &[PathBuf], output: &Path) -> Result<()> {
    if inputs.is_empty() {
        anyhow::bail!("no input pdfs");
    }
    let mut docs: Vec<Document> = inputs
        .iter()
        .map(|p| Document::load(p).with_context(|| format!("load {}", p.display())))
        .collect::<Result<_>>()?;

    let mut merged = Document::with_version("1.7");
    let mut max_id = 1u32;
    let mut pages_by_id = BTreeMap::new();
    let mut documents_objects = BTreeMap::new();

    for doc in docs.iter_mut() {
        doc.renumber_objects_with(max_id);
        max_id = doc.max_id + 1;
        documents_objects.extend(doc.objects.clone());
        pages_by_id.extend(doc.get_pages().into_iter().map(|(_, oid)| (oid, oid)));
    }

    let catalog_id = merged.new_object_id();
    let pages_id = merged.new_object_id();
    let mut kids = Vec::new();

    for (_, &page_id) in &pages_by_id {
        if let Some(obj) = documents_objects.get(&page_id) {
            if let Ok(mut dict) = obj.as_dict().cloned() {
                dict.set("Parent", pages_id);
                merged.objects.insert(page_id, Object::Dictionary(dict));
                kids.push(Object::Reference(page_id));
            }
        }
    }
    for (id, obj) in documents_objects {
        if !merged.objects.contains_key(&id) {
            merged.objects.insert(id, obj);
        }
    }

    let count = kids.len() as i64;
    let mut pages_dict = lopdf::Dictionary::new();
    pages_dict.set("Type", "Pages");
    pages_dict.set("Kids", kids);
    pages_dict.set("Count", count);
    merged.objects.insert(pages_id, Object::Dictionary(pages_dict));

    let mut catalog = lopdf::Dictionary::new();
    catalog.set("Type", "Catalog");
    catalog.set("Pages", pages_id);
    merged.objects.insert(catalog_id, Object::Dictionary(catalog));
    merged.trailer.set("Root", catalog_id);
    merged.compress();

    merged
        .save(output)
        .with_context(|| format!("save {}", output.display()))?;
    Ok(())
}

pub fn split_pdf(
    input: &Path,
    ranges: &[RangeInclusive<u32>],
    out_dir: &Path,
) -> Result<Vec<PathBuf>> {
    std::fs::create_dir_all(out_dir).ok();
    let stem = input
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("split");
    let mut outputs = Vec::new();
    for (i, range) in ranges.iter().enumerate() {
        let pages: Vec<u32> = range.clone().collect();
        let mut doc = Document::load(input)?;
        let total: u32 = doc.get_pages().len() as u32;
        let to_delete: Vec<u32> = (1..=total).filter(|p| !pages.contains(p)).collect();
        doc.delete_pages(&to_delete);
        doc.renumber_objects();
        doc.compress();
        let out = out_dir.join(format!("{stem}_{:02}.pdf", i + 1));
        doc.save(&out)?;
        outputs.push(out);
    }
    Ok(outputs)
}

pub fn extract_pages(input: &Path, pages: &[u32], output: &Path) -> Result<()> {
    let mut doc = Document::load(input)?;
    let total: u32 = doc.get_pages().len() as u32;
    let to_delete: Vec<u32> = (1..=total).filter(|p| !pages.contains(p)).collect();
    doc.delete_pages(&to_delete);
    doc.renumber_objects();
    doc.compress();
    doc.save(output)?;
    Ok(())
}

pub fn delete_pages(input: &Path, pages: &[u32], output: &Path) -> Result<()> {
    let mut doc = Document::load(input)?;
    doc.delete_pages(pages);
    doc.renumber_objects();
    doc.compress();
    doc.save(output)?;
    Ok(())
}

pub fn rotate_pages(
    input: &Path,
    page_rotations: &[(u32, i64)],
    output: &Path,
) -> Result<()> {
    let mut doc = Document::load(input)?;
    for (page, rotation) in page_rotations {
        let pages = doc.get_pages();
        if let Some(page_id) = pages.get(page).copied() {
            if let Some(obj) = doc.objects.get_mut(&page_id) {
                if let Ok(dict) = obj.as_dict_mut() {
                    dict.set("Rotate", *rotation);
                }
            }
        }
    }
    doc.compress();
    doc.save(output)?;
    Ok(())
}

/// Insert a single blank page into the document AFTER the given 0-based
/// page index. The new page's MediaBox is `(0, 0, width, height)` in PDF
/// user-space (72 pt) units. Phase 11 Task 63 — Organize tool.
pub fn insert_blank_page(
    input: &Path,
    after_page_index: u32,
    output: &Path,
    width: f32,
    height: f32,
) -> Result<()> {
    let mut doc = Document::load(input)?;
    let pages_id: ObjectId = doc
        .catalog()
        .ok()
        .and_then(|c| c.get(b"Pages").ok())
        .and_then(|o| o.as_reference().ok())
        .ok_or_else(|| anyhow::anyhow!("missing /Pages in catalog"))?;

    // Create an empty content stream for the blank page.
    let contents_id = doc.add_object(Object::Stream(lopdf::Stream::new(
        lopdf::Dictionary::new(),
        Vec::new(),
    )));

    let mut blank = lopdf::Dictionary::new();
    blank.set("Type", Object::Name(b"Page".to_vec()));
    blank.set("Parent", pages_id);
    blank.set(
        "MediaBox",
        vec![
            Object::Real(0.0),
            Object::Real(0.0),
            Object::Real(width),
            Object::Real(height),
        ],
    );
    blank.set("Resources", lopdf::Dictionary::new());
    blank.set("Contents", Object::Reference(contents_id));
    let blank_id = doc.add_object(Object::Dictionary(blank));

    // Splice the blank into /Pages /Kids at the requested position.
    let pages_map = doc.get_pages();
    let mut kid_order: Vec<ObjectId> = (1..=pages_map.len() as u32)
        .filter_map(|n| pages_map.get(&n).copied())
        .collect();
    let insert_at = (after_page_index as usize + 1).min(kid_order.len());
    kid_order.insert(insert_at, blank_id);

    if let Some(obj) = doc.objects.get_mut(&pages_id) {
        if let Ok(d) = obj.as_dict_mut() {
            d.set(
                "Kids",
                kid_order
                    .iter()
                    .map(|id| Object::Reference(*id))
                    .collect::<Vec<_>>(),
            );
            d.set("Count", kid_order.len() as i64);
        }
    }
    doc.compress();
    doc.save(output)?;
    Ok(())
}

pub fn reorder_pages(input: &Path, new_order: &[u32], output: &Path) -> Result<()> {
    let mut doc = Document::load(input)?;
    let pages = doc.get_pages();
    let mut new_kids: Vec<Object> = Vec::with_capacity(new_order.len());
    for &page_num in new_order {
        if let Some(&page_id) = pages.get(&page_num) {
            new_kids.push(Object::Reference(page_id));
        }
    }
    let pages_dict_id: ObjectId = doc
        .catalog()
        .ok()
        .and_then(|c| c.get(b"Pages").ok())
        .and_then(|o| o.as_reference().ok())
        .ok_or_else(|| anyhow::anyhow!("missing /Pages in catalog"))?;
    if let Some(obj) = doc.objects.get_mut(&pages_dict_id) {
        if let Ok(dict) = obj.as_dict_mut() {
            dict.set("Kids", new_kids.clone());
            dict.set("Count", new_kids.len() as i64);
        }
    }
    doc.compress();
    doc.save(output)?;
    Ok(())
}
