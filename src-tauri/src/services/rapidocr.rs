use crate::error::{AppError, AppResult};
use crate::services::ocr_engine::{
    OcrBackend, OcrBackendCapabilities, OcrBackendFuture, OcrRecognitionOptions, WordBox,
};
use image::imageops::FilterType;
use image::{GrayImage, Luma, RgbImage};
use imageproc::contours::{find_contours, BorderType};
use imageproc::distance_transform::Norm;
use imageproc::morphology::dilate_mut;
use sha2::{Digest, Sha256};
use std::cmp::Ordering;
use std::ffi::{c_char, c_int, CStr};
use std::fs::File;
use std::io::Read;
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::ptr;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

const DET_MODEL_FILE: &str = "ch_PP-OCRv5_mobile_det.onnx";
const REC_MODEL_FILE: &str = "latin_PP-OCRv5_rec_mobile_infer.onnx";
const DICTIONARY_FILE: &str = "ppocrv5_latin_dict.txt";
const RUNTIME_FILE: &str = "onnxruntime.dll";
const RAPID_OCR_TIMEOUT: Duration = Duration::from_secs(30);
const DET_MAX_SIDE: u32 = 1600;
const DET_THRESHOLD: f32 = 0.3;
const DET_BOX_THRESHOLD: f32 = 0.5;
const MAX_DETECTION_BOXES: usize = 256;

pub const RAPID_OCR_LANGUAGES: &[&str] = &["eng", "slk", "ces", "deu", "pol"];

#[derive(Debug, Clone, Copy)]
pub struct ModelAsset {
    pub file_name: &'static str,
    pub sha256: &'static str,
}

pub const MODEL_REGISTRY: &[ModelAsset] = &[
    ModelAsset {
        file_name: DET_MODEL_FILE,
        sha256: "4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae",
    },
    ModelAsset {
        file_name: REC_MODEL_FILE,
        sha256: "b20bd37c168a570f583afbc8cd7925603890efbcdc000a59e22c269d160b5f5a",
    },
    ModelAsset {
        file_name: DICTIONARY_FILE,
        sha256: "3c0a8a79b612653c25f765271714f71281e4e955962c153e272b7b8c1d2b13ff",
    },
    ModelAsset {
        file_name: RUNTIME_FILE,
        sha256: "7788f3f38e9a339003f7d7e1bf47f928287cf409bb5273273149e1282fbf503f",
    },
];

#[repr(C)]
struct RapidOrtRuntime {
    _private: [u8; 0],
}

#[repr(C)]
struct RapidOrtSession {
    _private: [u8; 0],
}

extern "C" {
    fn rapid_ort_runtime_create(
        dll_path: *const u16,
        out_runtime: *mut *mut RapidOrtRuntime,
        error: *mut c_char,
        error_capacity: usize,
    ) -> c_int;
    fn rapid_ort_runtime_destroy(runtime: *mut RapidOrtRuntime);
    fn rapid_ort_session_create(
        runtime: *mut RapidOrtRuntime,
        model_path: *const u16,
        out_session: *mut *mut RapidOrtSession,
        error: *mut c_char,
        error_capacity: usize,
    ) -> c_int;
    fn rapid_ort_session_destroy(session: *mut RapidOrtSession);
    fn rapid_ort_session_run_f32(
        session: *mut RapidOrtSession,
        input_data: *mut f32,
        input_length: usize,
        input_dims: *const i64,
        input_rank: usize,
        out_data: *mut *mut f32,
        out_length: *mut usize,
        out_dims: *mut *mut i64,
        out_rank: *mut usize,
        error: *mut c_char,
        error_capacity: usize,
    ) -> c_int;
    fn rapid_ort_free_output(data: *mut f32, dims: *mut i64);
}

struct OrtRuntimeHandle {
    ptr: *mut RapidOrtRuntime,
}

unsafe impl Send for OrtRuntimeHandle {}
unsafe impl Sync for OrtRuntimeHandle {}

impl OrtRuntimeHandle {
    fn load(path: &Path) -> Result<Arc<Self>, String> {
        let wide = wide_path(path);
        let mut ptr = ptr::null_mut();
        let mut error = vec![0i8; 2048];
        let status = unsafe {
            rapid_ort_runtime_create(wide.as_ptr(), &mut ptr, error.as_mut_ptr(), error.len())
        };
        if status != 0 || ptr.is_null() {
            return Err(read_native_error(&error));
        }
        Ok(Arc::new(Self { ptr }))
    }
}

impl Drop for OrtRuntimeHandle {
    fn drop(&mut self) {
        unsafe { rapid_ort_runtime_destroy(self.ptr) }
    }
}

struct OrtSessionHandle {
    ptr: *mut RapidOrtSession,
    _runtime: Arc<OrtRuntimeHandle>,
}

unsafe impl Send for OrtSessionHandle {}

impl OrtSessionHandle {
    fn load(runtime: Arc<OrtRuntimeHandle>, model_path: &Path) -> Result<Self, String> {
        let wide = wide_path(model_path);
        let mut ptr = ptr::null_mut();
        let mut error = vec![0i8; 2048];
        let status = unsafe {
            rapid_ort_session_create(
                runtime.ptr,
                wide.as_ptr(),
                &mut ptr,
                error.as_mut_ptr(),
                error.len(),
            )
        };
        if status != 0 || ptr.is_null() {
            return Err(read_native_error(&error));
        }
        Ok(Self {
            ptr,
            _runtime: runtime,
        })
    }

    fn run(&mut self, mut input: Vec<f32>, dims: &[i64]) -> Result<TensorOutput, String> {
        let expected = dims
            .iter()
            .try_fold(1usize, |size, dim| {
                usize::try_from(*dim)
                    .ok()
                    .and_then(|dim| size.checked_mul(dim))
            })
            .ok_or_else(|| "invalid ONNX input dimensions".to_string())?;
        if expected != input.len() {
            return Err(format!(
                "ONNX input length mismatch: expected {expected}, got {}",
                input.len()
            ));
        }

        let mut out_data = ptr::null_mut();
        let mut out_length = 0usize;
        let mut out_dims = ptr::null_mut();
        let mut out_rank = 0usize;
        let mut error = vec![0i8; 2048];
        let status = unsafe {
            rapid_ort_session_run_f32(
                self.ptr,
                input.as_mut_ptr(),
                input.len(),
                dims.as_ptr(),
                dims.len(),
                &mut out_data,
                &mut out_length,
                &mut out_dims,
                &mut out_rank,
                error.as_mut_ptr(),
                error.len(),
            )
        };
        if status != 0 || out_data.is_null() || out_dims.is_null() {
            return Err(read_native_error(&error));
        }

        let data = unsafe { std::slice::from_raw_parts(out_data, out_length).to_vec() };
        let dims = unsafe { std::slice::from_raw_parts(out_dims, out_rank).to_vec() };
        unsafe { rapid_ort_free_output(out_data, out_dims) };
        Ok(TensorOutput { data, dims })
    }
}

impl Drop for OrtSessionHandle {
    fn drop(&mut self) {
        unsafe { rapid_ort_session_destroy(self.ptr) }
    }
}

struct TensorOutput {
    data: Vec<f32>,
    dims: Vec<i64>,
}

struct RapidOcrInner {
    det: Mutex<OrtSessionHandle>,
    rec: Mutex<OrtSessionHandle>,
    dictionary: Vec<String>,
}

#[derive(Clone)]
pub struct RapidOcrBackend {
    inner: Arc<RapidOcrInner>,
}

#[derive(Clone)]
pub struct RapidOcrState {
    pub backend: Option<Arc<RapidOcrBackend>>,
    pub unavailable_reason: Option<String>,
}

impl RapidOcrState {
    pub fn initialize() -> Self {
        static INSTANCE: OnceLock<Result<Arc<RapidOcrBackend>, String>> = OnceLock::new();
        match INSTANCE.get_or_init(|| RapidOcrBackend::load().map(Arc::new)) {
            Ok(backend) => Self {
                backend: Some(backend.clone()),
                unavailable_reason: None,
            },
            Err(error) => Self {
                backend: None,
                unavailable_reason: Some(error.clone()),
            },
        }
    }
}

impl RapidOcrBackend {
    pub fn load() -> Result<Self, String> {
        let root = resource_root();
        verify_registry(&root)?;
        let dictionary = std::fs::read_to_string(root.join(DICTIONARY_FILE))
            .map_err(|error| format!("could not read RapidOCR dictionary: {error}"))?
            .lines()
            .map(ToOwned::to_owned)
            .collect::<Vec<_>>();
        if dictionary.is_empty() {
            return Err("RapidOCR dictionary is empty".into());
        }

        let runtime = OrtRuntimeHandle::load(&root.join(RUNTIME_FILE))?;
        let det = OrtSessionHandle::load(runtime.clone(), &root.join(DET_MODEL_FILE))?;
        let rec = OrtSessionHandle::load(runtime, &root.join(REC_MODEL_FILE))?;

        Ok(Self {
            inner: Arc::new(RapidOcrInner {
                det: Mutex::new(det),
                rec: Mutex::new(rec),
                dictionary,
            }),
        })
    }

    fn recognize_sync(inner: &RapidOcrInner, image_path: &Path) -> AppResult<Vec<WordBox>> {
        let image = image::open(image_path)
            .map_err(|error| AppError::Internal {
                detail: format!("RapidOCR could not open raster image: {error}"),
            })?
            .to_rgb8();
        let (det_input, det_dims, det_scale) = prepare_detection_input(&image);
        let det_output = inner
            .det
            .lock()
            .map_err(|_| AppError::Internal {
                detail: "RapidOCR detection session lock was poisoned".into(),
            })?
            .run(det_input, &det_dims)
            .map_err(rapid_error)?;
        let boxes = detection_boxes(&det_output, image.width(), image.height(), det_scale)?;

        let mut lines = Vec::new();
        for bbox in boxes {
            let (rec_input, rec_dims) = prepare_recognition_input(&image, bbox);
            let rec_output = inner
                .rec
                .lock()
                .map_err(|_| AppError::Internal {
                    detail: "RapidOCR recognition session lock was poisoned".into(),
                })?
                .run(rec_input, &rec_dims)
                .map_err(rapid_error)?;
            let (text, confidence) = decode_ctc(&rec_output, &inner.dictionary)?;
            if !text.trim().is_empty() {
                lines.push((bbox, text, confidence));
            }
        }
        Ok(lines_to_words(lines))
    }
}

impl OcrBackend for RapidOcrBackend {
    fn capabilities(&self) -> OcrBackendCapabilities {
        OcrBackendCapabilities {
            id: "rapidocr",
            display_name: "RapidOCR",
            supported_languages: RAPID_OCR_LANGUAGES,
            supports_multi_language: true,
            provides_word_confidence: true,
        }
    }

    fn recognize<'a>(
        &'a self,
        image: &'a Path,
        lang: &'a str,
        opts: &'a OcrRecognitionOptions,
    ) -> OcrBackendFuture<'a> {
        Box::pin(async move {
            if !RAPID_OCR_LANGUAGES.contains(&lang)
                && lang
                    .split('+')
                    .any(|part| !RAPID_OCR_LANGUAGES.contains(&part))
            {
                return Err(AppError::InvalidArgument {
                    detail: format!("RapidOCR does not support language selection '{lang}'"),
                });
            }
            if opts
                .cancellation
                .as_ref()
                .is_some_and(|token| token.is_cancelled())
            {
                return Err(AppError::Cancelled);
            }

            let inner = self.inner.clone();
            let image = image.to_path_buf();
            let task = tokio::task::spawn_blocking(move || Self::recognize_sync(&inner, &image));
            let result = tokio::time::timeout(RAPID_OCR_TIMEOUT, task)
                .await
                .map_err(|_| AppError::Internal {
                    detail: format!(
                        "RapidOCR inference exceeded the {} second timeout",
                        RAPID_OCR_TIMEOUT.as_secs()
                    ),
                })?
                .map_err(|error| AppError::Internal {
                    detail: format!("RapidOCR inference task failed: {error}"),
                })??;

            if opts
                .cancellation
                .as_ref()
                .is_some_and(|token| token.is_cancelled())
            {
                return Err(AppError::Cancelled);
            }
            Ok(result)
        })
    }
}

pub fn resource_root() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let bundled = parent.join("resources/ocr");
            if bundled.exists() {
                return bundled;
            }
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/ocr")
}

pub fn verify_registry(root: &Path) -> Result<(), String> {
    for asset in MODEL_REGISTRY {
        verify_file_hash(&root.join(asset.file_name), asset.sha256)?;
    }
    Ok(())
}

pub fn verify_file_hash(path: &Path, expected: &str) -> Result<(), String> {
    let mut file = File::open(path).map_err(|error| {
        format!(
            "RapidOCR asset '{}' is unavailable: {error}",
            path.display()
        )
    })?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("could not hash '{}': {error}", path.display()))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    let actual = hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    if actual != expected {
        return Err(format!(
            "RapidOCR asset '{}' failed SHA-256 verification (expected {expected}, got {actual})",
            path.display()
        ));
    }
    Ok(())
}

fn prepare_detection_input(image: &RgbImage) -> (Vec<f32>, Vec<i64>, (f32, f32)) {
    let (width, height) = image.dimensions();
    let ratio = (DET_MAX_SIDE as f32 / width.max(height) as f32).min(1.0);
    let resized_width = round_to_multiple((width as f32 * ratio).round() as u32, 32).max(32);
    let resized_height = round_to_multiple((height as f32 * ratio).round() as u32, 32).max(32);
    let resized =
        image::imageops::resize(image, resized_width, resized_height, FilterType::Triangle);
    let plane = (resized_width * resized_height) as usize;
    let mut input = vec![0.0f32; plane * 3];
    for (x, y, pixel) in resized.enumerate_pixels() {
        let index = (y * resized_width + x) as usize;
        for channel in 0..3 {
            input[channel * plane + index] = pixel[channel] as f32 / 127.5 - 1.0;
        }
    }
    (
        input,
        vec![1, 3, resized_height as i64, resized_width as i64],
        (
            resized_width as f32 / width.max(1) as f32,
            resized_height as f32 / height.max(1) as f32,
        ),
    )
}

fn detection_boxes(
    output: &TensorOutput,
    original_width: u32,
    original_height: u32,
    scale: (f32, f32),
) -> AppResult<Vec<[i32; 4]>> {
    if output.dims.len() < 2 {
        return Err(rapid_error("detection output rank is below 2".into()));
    }
    let map_height = usize::try_from(output.dims[output.dims.len() - 2])
        .map_err(|_| rapid_error("invalid detection output height".into()))?;
    let map_width = usize::try_from(output.dims[output.dims.len() - 1])
        .map_err(|_| rapid_error("invalid detection output width".into()))?;
    if map_height == 0 || map_width == 0 || output.data.len() < map_width * map_height {
        return Err(rapid_error("invalid detection output shape".into()));
    }

    let mut mask = GrayImage::new(map_width as u32, map_height as u32);
    for y in 0..map_height {
        for x in 0..map_width {
            let probability = normalized_probability(output.data[y * map_width + x]);
            mask.put_pixel(
                x as u32,
                y as u32,
                Luma([if probability >= DET_THRESHOLD { 255 } else { 0 }]),
            );
        }
    }
    dilate_mut(&mut mask, Norm::LInf, 1);

    let mut candidates = Vec::new();
    for contour in find_contours::<u32>(&mask) {
        if contour.border_type != BorderType::Outer || contour.points.len() < 4 {
            continue;
        }
        let min_x = contour
            .points
            .iter()
            .map(|point| point.x)
            .min()
            .unwrap_or(0) as usize;
        let max_x = contour
            .points
            .iter()
            .map(|point| point.x)
            .max()
            .unwrap_or(0) as usize;
        let min_y = contour
            .points
            .iter()
            .map(|point| point.y)
            .min()
            .unwrap_or(0) as usize;
        let max_y = contour
            .points
            .iter()
            .map(|point| point.y)
            .max()
            .unwrap_or(0) as usize;
        if max_x.saturating_sub(min_x) < 3 || max_y.saturating_sub(min_y) < 3 {
            continue;
        }
        let mut score_sum = 0.0f32;
        let mut score_count = 0usize;
        for y in min_y..=max_y.min(map_height - 1) {
            for x in min_x..=max_x.min(map_width - 1) {
                score_sum += normalized_probability(output.data[y * map_width + x]);
                score_count += 1;
            }
        }
        let score = score_sum / score_count.max(1) as f32;
        if score < DET_BOX_THRESHOLD {
            continue;
        }

        let padding_x = ((max_x - min_x) as f32 * 0.08).max(2.0);
        let padding_y = ((max_y - min_y) as f32 * 0.16).max(2.0);
        let x0 = ((min_x as f32 - padding_x) / scale.0).floor().max(0.0);
        let y0 = ((min_y as f32 - padding_y) / scale.1).floor().max(0.0);
        let x1 = ((max_x as f32 + padding_x) / scale.0)
            .ceil()
            .min(original_width as f32);
        let y1 = ((max_y as f32 + padding_y) / scale.1)
            .ceil()
            .min(original_height as f32);
        if x1 - x0 >= 3.0 && y1 - y0 >= 3.0 {
            candidates.push(([x0 as i32, y0 as i32, x1 as i32, y1 as i32], score));
        }
    }

    candidates.sort_by(|(a, score_a), (b, score_b)| {
        reading_order_cmp(a, b)
            .then_with(|| score_b.partial_cmp(score_a).unwrap_or(Ordering::Equal))
    });
    candidates.truncate(MAX_DETECTION_BOXES);
    Ok(candidates.into_iter().map(|(bbox, _)| bbox).collect())
}

fn prepare_recognition_input(image: &RgbImage, bbox: [i32; 4]) -> (Vec<f32>, Vec<i64>) {
    const HEIGHT: u32 = 48;
    const WIDTH: u32 = 320;
    let x = bbox[0].max(0) as u32;
    let y = bbox[1].max(0) as u32;
    let width = (bbox[2] - bbox[0]).max(1) as u32;
    let height = (bbox[3] - bbox[1]).max(1) as u32;
    let crop = image::imageops::crop_imm(
        image,
        x.min(image.width().saturating_sub(1)),
        y.min(image.height().saturating_sub(1)),
        width.min(image.width().saturating_sub(x)),
        height.min(image.height().saturating_sub(y)),
    )
    .to_image();
    let target_width = ((WIDTH as f32).min(HEIGHT as f32 * width as f32 / height as f32))
        .round()
        .max(1.0) as u32;
    let resized = image::imageops::resize(&crop, target_width, HEIGHT, FilterType::Lanczos3);
    let plane = (WIDTH * HEIGHT) as usize;
    let mut input = vec![1.0f32; plane * 3];
    for (px, py, pixel) in resized.enumerate_pixels() {
        let index = (py * WIDTH + px) as usize;
        for channel in 0..3 {
            input[channel * plane + index] = pixel[channel] as f32 / 127.5 - 1.0;
        }
    }
    (input, vec![1, 3, HEIGHT as i64, WIDTH as i64])
}

fn decode_ctc(output: &TensorOutput, dictionary: &[String]) -> AppResult<(String, f32)> {
    if output.dims.len() < 2 {
        return Err(rapid_error("recognition output rank is below 2".into()));
    }
    let classes = usize::try_from(*output.dims.last().unwrap_or(&0))
        .map_err(|_| rapid_error("invalid recognition class count".into()))?;
    if classes < 2 || output.data.len() % classes != 0 {
        return Err(rapid_error("invalid recognition output shape".into()));
    }
    let time_steps = output.data.len() / classes;
    let mut text = String::new();
    let mut confidences = Vec::new();
    let mut previous = 0usize;
    for step in 0..time_steps {
        let row = &output.data[step * classes..(step + 1) * classes];
        let (class, confidence) = class_peak(row);
        if class != 0 && class != previous {
            let dictionary_index = class - 1;
            if dictionary_index < dictionary.len() {
                text.push_str(&dictionary[dictionary_index]);
                confidences.push(confidence);
            } else if dictionary_index == dictionary.len() {
                text.push(' ');
                confidences.push(confidence);
            }
        }
        previous = class;
    }
    let confidence = if confidences.is_empty() {
        0.0
    } else {
        confidences.iter().sum::<f32>() / confidences.len() as f32 * 100.0
    };
    Ok((text.trim().to_string(), confidence.clamp(0.0, 100.0)))
}

fn class_peak(row: &[f32]) -> (usize, f32) {
    let (class, max_value) = row
        .iter()
        .copied()
        .enumerate()
        .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap_or(Ordering::Equal))
        .unwrap_or((0, 0.0));
    let sum = row.iter().sum::<f32>();
    let already_probabilities =
        row.iter().all(|value| (0.0..=1.0).contains(value)) && (sum - 1.0).abs() < 0.05;
    if already_probabilities {
        return (class, max_value);
    }
    let denominator = row
        .iter()
        .map(|value| (*value - max_value).exp())
        .sum::<f32>();
    (
        class,
        (1.0 / denominator.max(f32::MIN_POSITIVE)).clamp(0.0, 1.0),
    )
}

fn lines_to_words(mut lines: Vec<([i32; 4], String, f32)>) -> Vec<WordBox> {
    lines.sort_by(|(a, _, _), (b, _, _)| reading_order_cmp(a, b));
    let mut words = Vec::new();
    let mut paragraph = 0u32;
    let mut previous_bottom = None;
    let mut previous_height = 0i32;
    for (line_index, (bbox, text, confidence)) in lines.into_iter().enumerate() {
        let height = (bbox[3] - bbox[1]).max(1);
        if previous_bottom.is_some_and(|bottom| bbox[1] - bottom > previous_height.max(height)) {
            paragraph += 1;
        }
        previous_bottom = Some(bbox[3]);
        previous_height = height;

        let tokens = text.split_whitespace().collect::<Vec<_>>();
        if tokens.is_empty() {
            continue;
        }
        let total_chars = tokens
            .iter()
            .map(|token| token.chars().count())
            .sum::<usize>()
            + tokens.len().saturating_sub(1);
        let line_width = (bbox[2] - bbox[0]).max(1) as f32;
        let mut offset_chars = 0usize;
        for token in tokens {
            let token_chars = token.chars().count();
            let x0 =
                bbox[0] + (line_width * offset_chars as f32 / total_chars as f32).round() as i32;
            let x1 = bbox[0]
                + (line_width * (offset_chars + token_chars) as f32 / total_chars as f32).round()
                    as i32;
            words.push(WordBox {
                text: token.to_string(),
                bbox: [x0, bbox[1], x1.max(x0 + 1), bbox[3]],
                confidence: Some(confidence),
                paragraph_index: paragraph,
                line_index: line_index as u32,
                reading_order: words.len() as u32,
            });
            offset_chars += token_chars + 1;
        }
    }
    words
}

fn reading_order_cmp(a: &[i32; 4], b: &[i32; 4]) -> Ordering {
    let a_height = (a[3] - a[1]).max(1);
    let b_height = (b[3] - b[1]).max(1);
    let same_line = (a[1] - b[1]).abs() <= a_height.min(b_height) / 2;
    if same_line {
        a[0].cmp(&b[0])
    } else {
        a[1].cmp(&b[1]).then_with(|| a[0].cmp(&b[0]))
    }
}

fn normalized_probability(value: f32) -> f32 {
    if (0.0..=1.0).contains(&value) {
        value
    } else {
        1.0 / (1.0 + (-value).exp())
    }
}

fn round_to_multiple(value: u32, multiple: u32) -> u32 {
    ((value + multiple / 2) / multiple) * multiple
}

fn rapid_error(detail: String) -> AppError {
    AppError::Internal {
        detail: format!("RapidOCR backend failed: {detail}"),
    }
}

fn read_native_error(buffer: &[c_char]) -> String {
    if buffer.is_empty() || buffer[0] == 0 {
        return "unknown ONNX Runtime error".into();
    }
    unsafe { CStr::from_ptr(buffer.as_ptr()) }
        .to_string_lossy()
        .into_owned()
}

fn wide_path(path: &Path) -> Vec<u16> {
    path.as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_rejects_hash_mismatch() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join(DET_MODEL_FILE);
        std::fs::write(&path, b"tampered").unwrap();
        let error = verify_registry(temp.path()).unwrap_err();
        assert!(error.contains("failed SHA-256 verification"));
        assert!(error.contains("expected"));
        assert!(error.contains("got"));
    }

    #[test]
    fn vendored_registry_hashes_match() {
        verify_registry(&resource_root()).unwrap();
    }

    #[test]
    fn vendored_runtime_and_models_load() {
        let backend = RapidOcrBackend::load().unwrap();
        let capabilities = backend.capabilities();
        assert_eq!(capabilities.id, "rapidocr");
        assert_eq!(capabilities.supported_languages, RAPID_OCR_LANGUAGES);
        assert!(capabilities.supports_multi_language);
    }

    #[test]
    fn smoke_inference_on_generated_image_runs_both_models() {
        let backend = RapidOcrBackend::load().unwrap();
        let mut image = RgbImage::from_pixel(160, 48, image::Rgb([255, 255, 255]));
        let glyphs = [
            [
                "11111", "00100", "00100", "00100", "00100", "00100", "00100",
            ],
            [
                "11111", "10000", "10000", "11110", "10000", "10000", "11111",
            ],
            [
                "01111", "10000", "10000", "01110", "00001", "00001", "11110",
            ],
            [
                "11111", "00100", "00100", "00100", "00100", "00100", "00100",
            ],
        ];
        for (glyph_index, glyph) in glyphs.iter().enumerate() {
            for (row, pattern) in glyph.iter().enumerate() {
                for (column, value) in pattern.bytes().enumerate() {
                    if value == b'1' {
                        for dy in 0..4 {
                            for dx in 0..4 {
                                image.put_pixel(
                                    12 + glyph_index as u32 * 32 + column as u32 * 4 + dx,
                                    10 + row as u32 * 4 + dy,
                                    image::Rgb([0, 0, 0]),
                                );
                            }
                        }
                    }
                }
            }
        }

        let (det_input, det_dims, _) = prepare_detection_input(&image);
        let det_output = backend
            .inner
            .det
            .lock()
            .unwrap()
            .run(det_input, &det_dims)
            .unwrap();
        assert!(!det_output.data.is_empty());

        let (rec_input, rec_dims) =
            prepare_recognition_input(&image, [0, 0, image.width() as i32, image.height() as i32]);
        let rec_output = backend
            .inner
            .rec
            .lock()
            .unwrap()
            .run(rec_input, &rec_dims)
            .unwrap();
        assert!(!rec_output.data.is_empty());
        decode_ctc(&rec_output, &backend.inner.dictionary).unwrap();
    }

    #[test]
    fn ctc_decoder_removes_blanks_and_repeats() {
        let output = TensorOutput {
            data: vec![
                1.0, 0.0, 0.0, 0.0, //
                0.0, 1.0, 0.0, 0.0, //
                0.0, 1.0, 0.0, 0.0, //
                1.0, 0.0, 0.0, 0.0, //
                0.0, 0.0, 1.0, 0.0,
            ],
            dims: vec![1, 5, 4],
        };
        let (text, confidence) =
            decode_ctc(&output, &["a".into(), "b".into(), "c".into()]).unwrap();
        assert_eq!(text, "ab");
        assert_eq!(confidence, 100.0);
    }
}
