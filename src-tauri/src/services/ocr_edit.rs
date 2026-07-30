use crate::persistence::ocr_cache::OcrCacheKey;
use crate::services::ocr_engine::WordBox;
use anyhow::{anyhow, Context, Result};
use lopdf::content::{Content, Operation};
use lopdf::{dictionary, Document, Object, ObjectId, Stream};
use serde::Serialize;
use std::collections::HashSet;
use std::path::Path;

const OCR_LAYER_MARKER: &[u8] = b"AnimusOcrLayer";
const OCR_WORDS_KEY: &[u8] = b"AnimusOcrWords";

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct OcrSelectableWord {
    pub id: u32,
    pub text: String,
    /// Normalized top-left coordinates: [x0, y0, x1, y1].
    pub bbox: [f32; 4],
    pub confidence: Option<f32>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct OcrPageWords {
    pub words: Vec<OcrSelectableWord>,
    pub layer_identified: bool,
    pub notice: Option<String>,
}

#[derive(Debug, Clone)]
pub struct OcrMutation {
    pub removed_word_ids: Vec<u32>,
    pub skipped_word_ids: Vec<u32>,
    pub cache_key: Option<OcrCacheKey>,
}

pub fn list_page_words(path: &Path, page_index: u32) -> Result<OcrPageWords> {
    let doc = Document::load(path)?;
    let page_id = page_id(&doc, page_index)?;
    let Some((_, stream)) = latest_ocr_stream(&doc, page_id)? else {
        return Ok(OcrPageWords {
            words: Vec::new(),
            layer_identified: false,
            notice: Some("No pipeline-owned OCR layer was identified on this page.".into()),
        });
    };
    let words = stream_words(stream)?;
    let pixel_width = positive_stream_integer(stream, b"AnimusPixelWidth")? as f32;
    let pixel_height = positive_stream_integer(stream, b"AnimusPixelHeight")? as f32;
    Ok(OcrPageWords {
        words: words
            .into_iter()
            .map(|word| OcrSelectableWord {
                id: word.reading_order,
                text: word.text,
                bbox: [
                    word.bbox[0] as f32 / pixel_width,
                    word.bbox[1] as f32 / pixel_height,
                    word.bbox[2] as f32 / pixel_width,
                    word.bbox[3] as f32 / pixel_height,
                ],
                confidence: word.confidence,
            })
            .collect(),
        layer_identified: true,
        notice: None,
    })
}

pub fn mutate_page_words(
    input: &Path,
    output: &Path,
    page_index: u32,
    selected_word_ids: &[u32],
    replacement: Option<&str>,
) -> Result<OcrMutation> {
    if selected_word_ids.is_empty() {
        return Err(anyhow!("at least one OCR word must be selected"));
    }
    let selected: HashSet<u32> = selected_word_ids.iter().copied().collect();
    let mut doc = Document::load(input)?;
    let page_id = page_id(&doc, page_index)?;
    let (stream_id, words, pixel_width, pixel_height, cache_key) = {
        let (stream_id, stream) = latest_ocr_stream(&doc, page_id)?
            .context("no pipeline-owned OCR layer was identified on this page")?;
        (
            stream_id,
            stream_words(stream)?,
            positive_stream_integer(stream, b"AnimusPixelWidth")? as u32,
            positive_stream_integer(stream, b"AnimusPixelHeight")? as u32,
            stream_cache_key(stream, page_index),
        )
    };
    let chosen: Vec<WordBox> = words
        .iter()
        .filter(|word| selected.contains(&word.reading_order))
        .cloned()
        .collect();
    if chosen.len() != selected.len() {
        return Err(anyhow!("one or more selected OCR words no longer exist"));
    }

    let (page_width, page_height) = page_dimensions(&doc, page_id)?;
    let patch_rect = union_word_boxes(&chosen, pixel_width, pixel_height, page_width, page_height)
        .context("selected OCR word boxes have no area")?;

    let removed = {
        let stream = doc
            .get_object_mut(stream_id)?
            .as_stream_mut()
            .map_err(|_| anyhow!("identified OCR layer is not a stream"))?;
        remove_selected_spans(stream, &words, &selected)?
    };
    let (removed_word_ids, skipped_word_ids) = if removed {
        (selected_word_ids.to_vec(), Vec::new())
    } else {
        (Vec::new(), selected_word_ids.to_vec())
    };

    append_page_stream(&mut doc, page_id, patch_stream(patch_rect)?)?;
    if let Some(text) = replacement.filter(|text| !text.is_empty()) {
        let font_id = doc.add_object(dictionary! {
            "Type" => "Font",
            "Subtype" => "Type1",
            "BaseFont" => "Helvetica",
            "Encoding" => "WinAnsiEncoding",
        });
        ensure_page_font(&mut doc, page_id, b"AnimusOcrReplaceF", font_id)?;
        append_page_stream(&mut doc, page_id, replacement_stream(patch_rect, text)?)?;
    }
    doc.compress();
    doc.save(output)?;

    Ok(OcrMutation {
        removed_word_ids,
        skipped_word_ids,
        cache_key,
    })
}

pub fn union_word_boxes(
    words: &[WordBox],
    pixel_width: u32,
    pixel_height: u32,
    page_width: f32,
    page_height: f32,
) -> Option<[f32; 4]> {
    if words.is_empty() || pixel_width == 0 || pixel_height == 0 {
        return None;
    }
    let x0 = words.iter().map(|word| word.bbox[0]).min()? as f32;
    let top = words.iter().map(|word| word.bbox[1]).min()? as f32;
    let x1 = words.iter().map(|word| word.bbox[2]).max()? as f32;
    let bottom = words.iter().map(|word| word.bbox[3]).max()? as f32;
    if x1 <= x0 || bottom <= top {
        return None;
    }
    let sx = page_width / pixel_width as f32;
    let sy = page_height / pixel_height as f32;
    Some([
        x0 * sx,
        page_height - bottom * sy,
        (x1 - x0) * sx,
        (bottom - top) * sy,
    ])
}

fn remove_selected_spans(
    stream: &mut Stream,
    words: &[WordBox],
    selected: &HashSet<u32>,
) -> Result<bool> {
    let bytes = stream
        .decompressed_content()
        .unwrap_or_else(|_| stream.content.clone());
    let mut content = match Content::decode(&bytes) {
        Ok(content) => content,
        Err(_) => return Ok(false),
    };
    let text_indices: Vec<usize> = content
        .operations
        .iter()
        .enumerate()
        .filter_map(|(index, operation)| (operation.operator == "Tj").then_some(index))
        .collect();
    if text_indices.len() != words.len()
        || text_indices
            .iter()
            .any(|index| *index == 0 || content.operations[*index - 1].operator != "Tm")
    {
        return Ok(false);
    }

    let mut remove = HashSet::new();
    for (word, text_index) in words.iter().zip(text_indices) {
        if selected.contains(&word.reading_order) {
            remove.insert(text_index - 1);
            remove.insert(text_index);
        }
    }
    content.operations = content
        .operations
        .into_iter()
        .enumerate()
        .filter_map(|(index, operation)| (!remove.contains(&index)).then_some(operation))
        .collect();
    let remaining: Vec<WordBox> = words
        .iter()
        .filter(|word| !selected.contains(&word.reading_order))
        .cloned()
        .collect();
    stream.set_plain_content(content.encode()?);
    stream.dict.set(
        "AnimusOcrWords",
        Object::string_literal(serde_json::to_string(&remaining)?),
    );
    Ok(true)
}

fn latest_ocr_stream(doc: &Document, page_id: ObjectId) -> Result<Option<(ObjectId, &Stream)>> {
    let page = doc.get_object(page_id)?.as_dict()?;
    let mut references = Vec::new();
    match page.get(b"Contents") {
        Ok(Object::Reference(id)) => references.push(*id),
        Ok(Object::Array(items)) => {
            references.extend(items.iter().filter_map(|item| item.as_reference().ok()));
        }
        _ => {}
    }
    for id in references.into_iter().rev() {
        let Ok(Object::Stream(stream)) = doc.get_object(id) else {
            continue;
        };
        if matches!(stream.dict.get(OCR_LAYER_MARKER), Ok(Object::Boolean(true))) {
            return Ok(Some((id, stream)));
        }
    }
    Ok(None)
}

fn stream_words(stream: &Stream) -> Result<Vec<WordBox>> {
    let bytes = stream.dict.get(OCR_WORDS_KEY)?.as_str()?;
    serde_json::from_slice(bytes).context("pipeline-owned OCR word metadata is invalid")
}

fn positive_stream_integer(stream: &Stream, key: &[u8]) -> Result<i64> {
    let value = stream.dict.get(key)?.as_i64()?;
    if value <= 0 {
        return Err(anyhow!("pipeline-owned OCR geometry is invalid"));
    }
    Ok(value)
}

fn stream_cache_key(stream: &Stream, page_index: u32) -> Option<OcrCacheKey> {
    Some(OcrCacheKey {
        file_sha256: String::from_utf8(
            stream
                .dict
                .get(b"AnimusSourceSha256")
                .ok()?
                .as_str()
                .ok()?
                .to_vec(),
        )
        .ok()?,
        page_index,
        dpi: u32::try_from(stream.dict.get(b"AnimusOcrDpi").ok()?.as_i64().ok()?).ok()?,
        language: String::from_utf8(
            stream
                .dict
                .get(b"AnimusOcrLanguage")
                .ok()?
                .as_str()
                .ok()?
                .to_vec(),
        )
        .ok()?,
        engine: String::from_utf8(
            stream
                .dict
                .get(b"AnimusOcrEngine")
                .ok()?
                .as_str()
                .ok()?
                .to_vec(),
        )
        .ok()?,
    })
}

fn page_id(doc: &Document, page_index: u32) -> Result<ObjectId> {
    doc.get_pages()
        .get(&(page_index + 1))
        .copied()
        .context("page not found")
}

fn page_dimensions(doc: &Document, page_id: ObjectId) -> Result<(f32, f32)> {
    let page = doc.get_object(page_id)?.as_dict()?;
    let media_box = page.get(b"MediaBox")?.as_array()?;
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
    Ok((
        number(&media_box[2])? - number(&media_box[0])?,
        number(&media_box[3])? - number(&media_box[1])?,
    ))
}

fn patch_stream(rect: [f32; 4]) -> Result<Stream> {
    let [x, y, width, height] = rect;
    let content = Content {
        operations: vec![
            Operation::new("q", vec![]),
            Operation::new("rg", vec![1.0.into(), 1.0.into(), 1.0.into()]),
            Operation::new("re", vec![x.into(), y.into(), width.into(), height.into()]),
            Operation::new("f", vec![]),
            Operation::new("Q", vec![]),
        ],
    };
    Ok(Stream::new(
        dictionary! {
            "AnimusOcrPatch" => true,
            "AnimusOcrVersion" => 1,
        },
        content.encode()?,
    ))
}

fn replacement_stream(rect: [f32; 4], text: &str) -> Result<Stream> {
    let [x, y, _, height] = rect;
    let font_size = (height * 0.85).max(1.0);
    let baseline = y + (height - font_size).max(0.0);
    let content = Content {
        operations: vec![
            Operation::new("q", vec![]),
            Operation::new("rg", vec![0.0.into(), 0.0.into(), 0.0.into()]),
            Operation::new("BT", vec![]),
            Operation::new(
                "Tf",
                vec![
                    Object::Name(b"AnimusOcrReplaceF".to_vec()),
                    font_size.into(),
                ],
            ),
            Operation::new(
                "Tm",
                vec![
                    1.0.into(),
                    0.0.into(),
                    0.0.into(),
                    1.0.into(),
                    x.into(),
                    baseline.into(),
                ],
            ),
            Operation::new("Tj", vec![Object::string_literal(text)]),
            Operation::new("ET", vec![]),
            Operation::new("Q", vec![]),
        ],
    };
    Ok(Stream::new(
        dictionary! {
            "AnimusOcrReplacement" => true,
            "AnimusOcrVersion" => 1,
        },
        content.encode()?,
    ))
}

fn append_page_stream(doc: &mut Document, page_id: ObjectId, stream: Stream) -> Result<()> {
    let stream_id = doc.add_object(Object::Stream(stream));
    let page = doc.get_object_mut(page_id)?.as_dict_mut()?;
    let mut contents = match page.get(b"Contents").cloned() {
        Ok(Object::Reference(id)) => vec![Object::Reference(id)],
        Ok(Object::Array(items)) => items,
        _ => Vec::new(),
    };
    contents.push(Object::Reference(stream_id));
    page.set("Contents", contents);
    Ok(())
}

fn ensure_page_font(
    doc: &mut Document,
    page_id: ObjectId,
    name: &[u8],
    font_id: ObjectId,
) -> Result<()> {
    let page = doc.get_object_mut(page_id)?.as_dict_mut()?;
    let resources = page
        .get_mut(b"Resources")
        .and_then(Object::as_dict_mut)
        .map_err(|_| anyhow!("pipeline-owned OCR page resources are not directly editable"))?;
    if resources.get(b"Font").and_then(Object::as_dict).is_err() {
        resources.set("Font", Object::Dictionary(lopdf::Dictionary::new()));
    }
    resources
        .get_mut(b"Font")?
        .as_dict_mut()?
        .set(name, Object::Reference(font_id));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn word(id: u32, bbox: [i32; 4]) -> WordBox {
        WordBox {
            text: format!("word-{id}"),
            bbox,
            confidence: Some(90.0),
            paragraph_index: 0,
            line_index: 0,
            reading_order: id,
        }
    }

    #[test]
    fn union_maps_top_left_pixels_to_pdf_points() {
        let rect = union_word_boxes(
            &[word(0, [100, 200, 300, 260]), word(1, [320, 190, 500, 270])],
            1000,
            2000,
            500.0,
            1000.0,
        )
        .unwrap();
        assert_eq!(rect, [50.0, 865.0, 200.0, 40.0]);
    }

    #[test]
    fn structurally_identified_spans_are_removed() {
        let words = vec![word(0, [0, 0, 10, 10]), word(1, [20, 0, 30, 10])];
        let content = Content {
            operations: vec![
                Operation::new("BT", vec![]),
                Operation::new(
                    "Tm",
                    vec![1.into(), 0.into(), 0.into(), 1.into(), 0.into(), 0.into()],
                ),
                Operation::new("Tj", vec![Object::string_literal("word-0")]),
                Operation::new(
                    "Tm",
                    vec![1.into(), 0.into(), 0.into(), 1.into(), 20.into(), 0.into()],
                ),
                Operation::new("Tj", vec![Object::string_literal("word-1")]),
                Operation::new("ET", vec![]),
            ],
        };
        let mut stream = Stream::new(
            dictionary! {
                "AnimusOcrLayer" => true,
                "AnimusOcrWords" => Object::string_literal(serde_json::to_string(&words).unwrap()),
            },
            content.encode().unwrap(),
        );
        assert!(remove_selected_spans(&mut stream, &words, &HashSet::from([1])).unwrap());
        let decoded = Content::decode(&stream.content).unwrap();
        assert_eq!(
            decoded
                .operations
                .iter()
                .filter(|op| op.operator == "Tj")
                .count(),
            1
        );
        assert_eq!(stream_words(&stream).unwrap(), vec![words[0].clone()]);
    }

    #[test]
    fn ambiguous_operator_mapping_skips_span_removal() {
        let words = vec![word(0, [0, 0, 10, 10])];
        let original = b"BT\n(word-0) Tj\nET".to_vec();
        let mut stream = Stream::new(
            dictionary! {
                "AnimusOcrLayer" => true,
                "AnimusOcrWords" => Object::string_literal(serde_json::to_string(&words).unwrap()),
            },
            original.clone(),
        );
        assert!(!remove_selected_spans(&mut stream, &words, &HashSet::from([0])).unwrap());
        assert_eq!(stream.content, original);
        assert_eq!(stream_words(&stream).unwrap(), words);
    }
}
