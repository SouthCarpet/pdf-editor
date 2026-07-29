fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        cc::Build::new()
            .file("native/rapidocr_ort.c")
            .include("resources/ocr/include")
            .warnings(true)
            .compile("rapidocr_ort");
        println!("cargo:rerun-if-changed=native/rapidocr_ort.c");
        println!("cargo:rerun-if-changed=resources/ocr/include/onnxruntime_c_api.h");
    }
    tauri_build::build()
}
