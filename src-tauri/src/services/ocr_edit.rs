use crate::persistence::ocr_cache::OcrCacheKey;
use crate::services::ocr_engine::WordBox;
use crate::services::ocr_geometry::{add_page_font_resource, page_geometry, OcrPageGeometry};
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
    let doc = crate::services::pdf_guard::load_guarded(path)?;
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
    let mut doc = crate::services::pdf_guard::load_guarded(input)?;
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

    let geometry = page_geometry(&doc, page_id)?;
    let (display_width, display_height) = geometry.display_dimensions();
    let display_rect = union_word_boxes_in_display(
        &chosen,
        pixel_width,
        pixel_height,
        display_width,
        display_height,
    )
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

    append_page_stream(
        &mut doc,
        page_id,
        transform_stream_for_page(patch_stream(display_rect)?, geometry),
    )?;
    if let Some(text) = replacement.filter(|text| !text.is_empty()) {
        let font_name = available_replacement_font_name(&doc, page_id)?;
        let font_id = doc.add_object(dictionary! {
            "Type" => "Font",
            "Subtype" => "Type1",
            "BaseFont" => "Helvetica",
            "Encoding" => "WinAnsiEncoding",
        });
        add_page_font_resource(&mut doc, page_id, &font_name, font_id)?;
        append_page_stream(
            &mut doc,
            page_id,
            transform_stream_for_page(
                replacement_stream(display_rect, text, &font_name)?,
                geometry,
            ),
        )?;
    }
    doc.compress();
    doc.save(output)?;

    Ok(OcrMutation {
        removed_word_ids,
        skipped_word_ids,
        cache_key,
    })
}

/// Page-space union of word boxes. Production works in DISPLAY space and lets
/// the `cm` prologue map back to the page (see `union_word_boxes_in_display`
/// and `wrap_display_content`), so this page-space form is kept for tests that
/// assert the mapping end to end.
#[cfg(test)]
pub(crate) fn union_word_boxes(
    words: &[WordBox],
    pixel_width: u32,
    pixel_height: u32,
    geometry: OcrPageGeometry,
) -> Option<[f32; 4]> {
    let (display_width, display_height) = geometry.display_dimensions();
    union_word_boxes_in_display(
        words,
        pixel_width,
        pixel_height,
        display_width,
        display_height,
    )
    .map(|rect| geometry.display_rect_to_page(rect))
}

fn union_word_boxes_in_display(
    words: &[WordBox],
    pixel_width: u32,
    pixel_height: u32,
    display_width: f32,
    display_height: f32,
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
    let sx = display_width / pixel_width as f32;
    let sy = display_height / pixel_height as f32;
    Some([
        x0 * sx,
        display_height - bottom * sy,
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
        // A single reference is the common case, but it may point at an ARRAY
        // of stream references rather than at a stream. Without resolving that
        // one extra level such a page reports "no OCR layer" and the
        // multiple-layer guard below never gets to run.
        Ok(Object::Reference(id)) => match doc.get_object(*id) {
            Ok(Object::Array(items)) => {
                for item in items {
                    match item {
                        Object::Reference(inner) => references.push(*inner),
                        Object::Stream(stream)
                            if matches!(
                                stream.dict.get(OCR_LAYER_MARKER),
                                Ok(Object::Boolean(true))
                            ) =>
                        {
                            return Err(anyhow!(
                                "pipeline-owned OCR layer is inline and cannot be edited safely"
                            ));
                        }
                        _ => {}
                    }
                }
            }
            _ => references.push(*id),
        },
        Ok(Object::Array(items)) => {
            for item in items {
                match item {
                    Object::Reference(id) => references.push(*id),
                    Object::Stream(stream)
                        if matches!(
                            stream.dict.get(OCR_LAYER_MARKER),
                            Ok(Object::Boolean(true))
                        ) =>
                    {
                        return Err(anyhow!(
                            "pipeline-owned OCR layer is inline and cannot be edited safely"
                        ));
                    }
                    _ => {}
                }
            }
        }
        Ok(Object::Stream(stream))
            if matches!(stream.dict.get(OCR_LAYER_MARKER), Ok(Object::Boolean(true))) =>
        {
            return Err(anyhow!(
                "pipeline-owned OCR layer is inline and cannot be edited safely"
            ));
        }
        _ => {}
    }
    let mut identified = Vec::new();
    for id in references {
        let Object::Stream(stream) = doc.get_object(id)? else {
            continue;
        };
        if matches!(stream.dict.get(OCR_LAYER_MARKER), Ok(Object::Boolean(true))) {
            identified.push((id, stream));
        }
    }
    match identified.len() {
        0 => Ok(None),
        1 => Ok(identified.pop()),
        count => Err(anyhow!(
            "page contains {count} pipeline-owned OCR layers; refusing to choose one silently"
        )),
    }
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

fn replacement_stream(rect: [f32; 4], text: &str, font_name: &[u8]) -> Result<Stream> {
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
                vec![Object::Name(font_name.to_vec()), font_size.into()],
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

fn transform_stream_for_page(mut stream: Stream, geometry: OcrPageGeometry) -> Stream {
    // set_content, not a raw `stream.content = ...` write: lopdf only updates
    // /Length in Stream::new and set_content. wrap_display_content always grows
    // the buffer (a `q ... cm` prologue plus a trailing `Q`), so a raw write
    // leaves /Length short and any Length-respecting reader, lopdf included,
    // truncates the stream: the balancing Q is dropped and the rotation CTM
    // leaks into the next appended stream.
    let content = std::mem::take(&mut stream.content);
    stream.set_content(geometry.wrap_display_content(content));
    stream
}

fn append_page_stream(doc: &mut Document, page_id: ObjectId, stream: Stream) -> Result<()> {
    let stream_id = doc.add_object(Object::Stream(stream));
    let page = doc.get_object_mut(page_id)?.as_dict_mut()?;
    let mut contents = match page.get(b"Contents").cloned() {
        Ok(Object::Array(items)) => items,
        Ok(existing) => vec![existing],
        Err(_) => Vec::new(),
    };
    contents.push(Object::Reference(stream_id));
    page.set("Contents", contents);
    Ok(())
}

fn available_replacement_font_name(doc: &Document, page_id: ObjectId) -> Result<Vec<u8>> {
    let fonts = doc.get_page_fonts(page_id)?;
    for suffix in 1..=10_000 {
        let name = if suffix == 1 {
            b"AnimusOcrReplaceF".to_vec()
        } else {
            format!("AnimusOcrReplaceF{suffix}").into_bytes()
        };
        if !fonts.contains_key(&name) {
            return Ok(name);
        }
    }
    Err(anyhow!("no available pipeline OCR replacement font name"))
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
            OcrPageGeometry {
                origin_x: 0.0,
                origin_y: 0.0,
                width: 500.0,
                height: 1000.0,
                rotation: 0,
            },
        )
        .unwrap();
        assert_eq!(rect, [50.0, 865.0, 200.0, 40.0]);
    }

    #[test]
    fn union_preserves_media_box_origin() {
        let rect = union_word_boxes(
            &[word(0, [100, 200, 300, 260])],
            1000,
            2000,
            OcrPageGeometry {
                origin_x: 25.0,
                origin_y: -10.0,
                width: 500.0,
                height: 1000.0,
                rotation: 0,
            },
        )
        .unwrap();
        assert_eq!(rect, [75.0, 860.0, 100.0, 30.0]);
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

    #[test]
    fn multiple_pipeline_layers_fail_loud_instead_of_selecting_the_latest() {
        let mut doc = Document::with_version("1.7");
        let first = doc.add_object(Stream::new(
            dictionary! { "AnimusOcrLayer" => true },
            Vec::new(),
        ));
        let second = doc.add_object(Stream::new(
            dictionary! { "AnimusOcrLayer" => true },
            Vec::new(),
        ));
        let page_id = doc.add_object(dictionary! {
            "Type" => "Page",
            "Contents" => vec![Object::Reference(first), Object::Reference(second)],
        });

        let error = latest_ocr_stream(&doc, page_id).unwrap_err().to_string();

        assert!(error.contains("2 pipeline-owned OCR layers"));
    }

    #[test]
    fn rotated_replacement_stream_uses_display_to_page_transform() {
        let geometry = OcrPageGeometry {
            origin_x: 10.0,
            origin_y: 20.0,
            width: 200.0,
            height: 100.0,
            rotation: 90,
        };
        let stream = transform_stream_for_page(
            replacement_stream([10.0, 30.0, 20.0, 40.0], "replacement", b"TestF").unwrap(),
            geometry,
        );
        let content = Content::decode(&stream.content).unwrap();

        assert_eq!(content.operations[0].operator, "q");
        assert_eq!(content.operations[1].operator, "cm");
        assert_eq!(
            content.operations[1].operands,
            vec![
                0.into(),
                1.into(),
                (-1).into(),
                0.into(),
                210.into(),
                20.into()
            ]
        );
    }

    /// Transforming a stream must keep /Length in sync with the wrapped bytes.
    /// The transform grows the buffer, and lopdf's writer emits the dict
    /// verbatim, so a stale /Length silently truncates the stream on read:
    /// the white patch may not draw at all and the unbalanced `q` leaks the
    /// page CTM into the next appended stream. Both mutation paths are
    /// covered because patch and replacement streams are built separately.
    #[test]
    fn transformed_streams_keep_length_in_sync_with_content() {
        let geometry = OcrPageGeometry {
            origin_x: 10.0,
            origin_y: 20.0,
            width: 200.0,
            height: 100.0,
            rotation: 90,
        };

        for (label, built) in [
            ("patch", patch_stream([10.0, 30.0, 20.0, 40.0]).unwrap()),
            (
                "replacement",
                replacement_stream([10.0, 30.0, 20.0, 40.0], "replacement", b"TestF").unwrap(),
            ),
        ] {
            let before = built.dict.get(b"Length").unwrap().as_i64().unwrap();
            let stream = transform_stream_for_page(built, geometry);
            let declared = stream.dict.get(b"Length").unwrap().as_i64().unwrap();

            assert_eq!(
                declared,
                stream.content.len() as i64,
                "{label} stream declares /Length {declared} but carries {} bytes",
                stream.content.len()
            );
            assert!(
                declared > before,
                "{label} wrap must grow the stream; /Length went {before} -> {declared}"
            );
        }
    }
}
