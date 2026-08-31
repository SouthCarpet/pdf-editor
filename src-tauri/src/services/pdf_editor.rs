use anyhow::{Context, Result};
use lopdf::{Document, Object, ObjectId};
use std::collections::{BTreeMap, HashSet};
use std::ops::RangeInclusive;
use std::path::{Path, PathBuf};

pub fn merge_pdfs(inputs: &[PathBuf], output: &Path) -> Result<()> {
    if inputs.is_empty() {
        anyhow::bail!("no input pdfs");
    }
    let mut docs: Vec<Document> = inputs
        .iter()
        .map(|p| {
            crate::services::pdf_guard::load_guarded(p)
                .with_context(|| format!("load {}", p.display()))
        })
        .collect::<Result<_>>()?;

    let mut merged = Document::with_version("1.7");
    let mut max_id = 1u32;
    let mut pages_by_id = BTreeMap::new();
    let mut documents_objects = BTreeMap::new();

    for doc in docs.iter_mut() {
        doc.renumber_objects_with(max_id);
        max_id = doc.max_id + 1;
        documents_objects.extend(doc.objects.clone());
        pages_by_id.extend(doc.get_pages().into_values().map(|oid| (oid, oid)));
    }

    let catalog_id = merged.new_object_id();
    let pages_id = merged.new_object_id();
    let mut kids = Vec::new();

    for &page_id in pages_by_id.values() {
        if let Some(obj) = documents_objects.get(&page_id) {
            if let Ok(mut dict) = obj.as_dict().cloned() {
                dict.set("Parent", pages_id);
                merged.objects.insert(page_id, Object::Dictionary(dict));
                kids.push(Object::Reference(page_id));
            }
        }
    }
    for (id, obj) in documents_objects {
        merged.objects.entry(id).or_insert(obj);
    }

    let count = kids.len() as i64;
    let mut pages_dict = lopdf::Dictionary::new();
    pages_dict.set("Type", "Pages");
    pages_dict.set("Kids", kids);
    pages_dict.set("Count", count);
    merged
        .objects
        .insert(pages_id, Object::Dictionary(pages_dict));

    let mut catalog = lopdf::Dictionary::new();
    catalog.set("Type", "Catalog");
    catalog.set("Pages", pages_id);
    merged
        .objects
        .insert(catalog_id, Object::Dictionary(catalog));
    merged.trailer.set("Root", catalog_id);

    // We inserted objects with IDs greater than merged.max_id (which only counts
    // ids handed out by new_object_id()). Without updating it lopdf's save()
    // writes a truncated xref and the Pages Kids array dangles to objects that
    // re-parse as non-Dictionary, producing a 0-page output.
    merged.max_id = merged
        .objects
        .keys()
        .map(|(id, _)| *id)
        .max()
        .unwrap_or(merged.max_id);
    merged.renumber_objects();
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
        let mut doc = crate::services::pdf_guard::load_guarded(input)?;
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
    let mut doc = crate::services::pdf_guard::load_guarded(input)?;
    let total: u32 = doc.get_pages().len() as u32;
    let to_delete: Vec<u32> = (1..=total).filter(|p| !pages.contains(p)).collect();
    doc.delete_pages(&to_delete);
    doc.renumber_objects();
    doc.compress();
    doc.save(output)?;
    Ok(())
}

pub fn delete_pages(input: &Path, pages: &[u32], output: &Path) -> Result<()> {
    let mut doc = crate::services::pdf_guard::load_guarded(input)?;
    doc.delete_pages(pages);
    doc.renumber_objects();
    doc.compress();
    doc.save(output)?;
    Ok(())
}

pub fn rotate_pages(input: &Path, page_rotations: &[(u32, i64)], output: &Path) -> Result<()> {
    let mut doc = crate::services::pdf_guard::load_guarded(input)?;
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
/// page index. Pass a negative index (`-1`) to insert before the first
/// page. The new page's MediaBox is `(0, 0, width, height)` in PDF
/// user-space (72 pt) units. Phase 11 Task 63 — Organize tool.
///
/// `after_page_index` is `impl Into<i64>` so pipeline callers can keep
/// passing `u32` (0 = after the first page) while `insert_blank_page_cmd`
/// can pass `-1` for prepend.
pub fn insert_blank_page(
    input: &Path,
    after_page_index: impl Into<i64>,
    output: &Path,
    width: f32,
    height: f32,
) -> Result<()> {
    let after_page_index = after_page_index.into();
    let mut doc = crate::services::pdf_guard::load_guarded(input)?;
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
    let insert_at = if after_page_index < 0 {
        0
    } else {
        (after_page_index as usize)
            .saturating_add(1)
            .min(kid_order.len())
    };
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
    let mut doc = crate::services::pdf_guard::load_guarded(input)?;
    let pages = doc.get_pages();
    let mut new_kids: Vec<Object> = Vec::with_capacity(new_order.len());
    let mut seen = HashSet::new();
    for &page_num in new_order {
        let Some(&page_id) = pages.get(&page_num) else {
            continue;
        };
        if seen.insert(page_id) {
            new_kids.push(Object::Reference(page_id));
            continue;
        }
        // Repeated index: clone the page dictionary so each copy can carry
        // its own /Rotate. Content streams and resources stay shared.
        let cloned = doc
            .get_object(page_id)
            .ok()
            .and_then(|obj| obj.as_dict().ok())
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("page {page_num} is not a dictionary"))?;
        let clone_id = doc.add_object(Object::Dictionary(cloned));
        new_kids.push(Object::Reference(clone_id));
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::pdf_guard::load_guarded;
    use tempfile::tempdir;

    fn write_n_page_pdf(path: &Path, n: u32) {
        let mut doc = Document::with_version("1.7");
        let pages_id = doc.new_object_id();
        let mut kids = Vec::new();
        for _ in 0..n {
            let contents_id = doc.add_object(Object::Stream(lopdf::Stream::new(
                lopdf::Dictionary::new(),
                Vec::new(),
            )));
            let mut page = lopdf::Dictionary::new();
            page.set("Type", Object::Name(b"Page".to_vec()));
            page.set("Parent", pages_id);
            page.set(
                "MediaBox",
                vec![
                    Object::Integer(0),
                    Object::Integer(0),
                    Object::Integer(595),
                    Object::Integer(842),
                ],
            );
            page.set("Resources", lopdf::Dictionary::new());
            page.set("Contents", Object::Reference(contents_id));
            let page_id = doc.add_object(Object::Dictionary(page));
            kids.push(Object::Reference(page_id));
        }
        let count = kids.len() as i64;
        let mut pages_dict = lopdf::Dictionary::new();
        pages_dict.set("Type", "Pages");
        pages_dict.set("Kids", kids);
        pages_dict.set("Count", count);
        doc.objects.insert(pages_id, Object::Dictionary(pages_dict));
        let catalog_id = doc.new_object_id();
        let mut catalog = lopdf::Dictionary::new();
        catalog.set("Type", "Catalog");
        catalog.set("Pages", pages_id);
        doc.objects.insert(catalog_id, Object::Dictionary(catalog));
        doc.trailer.set("Root", catalog_id);
        doc.save(path).expect("write fixture pdf");
    }

    fn page_count(path: &Path) -> usize {
        load_guarded(path).unwrap().get_pages().len()
    }

    fn kid_ids(path: &Path) -> Vec<ObjectId> {
        let doc = load_guarded(path).unwrap();
        let pages = doc.get_pages();
        (1..=pages.len() as u32)
            .filter_map(|n| pages.get(&n).copied())
            .collect()
    }

    fn page_rotate(path: &Path, page_1based: u32) -> i64 {
        let doc = load_guarded(path).unwrap();
        let pages = doc.get_pages();
        let page_id = *pages.get(&page_1based).expect("page");
        doc.get_object(page_id)
            .ok()
            .and_then(|obj| obj.as_dict().ok())
            .and_then(|dict| dict.get(b"Rotate").ok())
            .and_then(|obj| obj.as_i64().ok())
            .unwrap_or(0)
    }

    #[test]
    fn reorder_empty_keep_list_drops_every_original_page() {
        let tmp = tempdir().unwrap();
        let src = tmp.path().join("src.pdf");
        write_n_page_pdf(&src, 2);
        let out = tmp.path().join("empty.pdf");
        reorder_pages(&src, &[], &out).unwrap();
        assert_eq!(page_count(&out), 0);
    }

    #[test]
    fn delete_all_pages_also_yields_empty_document() {
        let tmp = tempdir().unwrap();
        let src = tmp.path().join("src.pdf");
        write_n_page_pdf(&src, 2);
        let out = tmp.path().join("deleted.pdf");
        delete_pages(&src, &[1, 2], &out).unwrap();
        assert_eq!(page_count(&out), 0);
    }

    #[test]
    fn empty_reorder_then_prepend_blank_yields_one_page() {
        let tmp = tempdir().unwrap();
        let src = tmp.path().join("src.pdf");
        write_n_page_pdf(&src, 2);
        let empty = tmp.path().join("empty.pdf");
        reorder_pages(&src, &[], &empty).unwrap();
        let out = tmp.path().join("blank.pdf");
        insert_blank_page(&empty, -1i32, &out, 595.0, 842.0).unwrap();
        assert_eq!(page_count(&out), 1);
    }

    #[test]
    fn insert_blank_after_negative_one_prepends_before_page_one() {
        let tmp = tempdir().unwrap();
        let src = tmp.path().join("src.pdf");
        write_n_page_pdf(&src, 2);
        let before = kid_ids(&src);
        let out = tmp.path().join("prepended.pdf");
        insert_blank_page(&src, -1i32, &out, 595.0, 842.0).unwrap();
        let after = kid_ids(&out);
        assert_eq!(after.len(), 3);
        assert_eq!(after[1], before[0]);
        assert_eq!(after[2], before[1]);
        assert_ne!(after[0], before[0]);
    }

    #[test]
    fn insert_blank_after_zero_still_inserts_after_the_first_page() {
        let tmp = tempdir().unwrap();
        let src = tmp.path().join("src.pdf");
        write_n_page_pdf(&src, 2);
        let before = kid_ids(&src);
        let out = tmp.path().join("after-first.pdf");
        insert_blank_page(&src, 0u32, &out, 595.0, 842.0).unwrap();
        let after = kid_ids(&out);
        assert_eq!(after.len(), 3);
        assert_eq!(after[0], before[0]);
        assert_eq!(after[2], before[1]);
        assert_ne!(after[1], before[0]);
    }

    #[test]
    fn reorder_repeated_index_then_rotate_copy_leaves_original_unrotated() {
        let tmp = tempdir().unwrap();
        let src = tmp.path().join("src.pdf");
        write_n_page_pdf(&src, 1);
        let dup = tmp.path().join("dup.pdf");
        reorder_pages(&src, &[1, 1], &dup).unwrap();
        assert_eq!(page_count(&dup), 2);
        let rotated = tmp.path().join("rot.pdf");
        rotate_pages(&dup, &[(2, 90)], &rotated).unwrap();
        assert_eq!(page_rotate(&rotated, 1), 0);
        assert_eq!(page_rotate(&rotated, 2), 90);
    }
}
