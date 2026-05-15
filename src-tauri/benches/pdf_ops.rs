// Phase 17 Task 85 — criterion benchmarks for the hottest PDF service paths.
//
// `bench_merge_10x50pages` measures merging ten 50-page inputs into a single
// PDF; `bench_render_first_page` measures rendering the first page of a
// large fixture at 150 DPI.
//
// Both benches probe for the fixture file `tests/fixtures/pdfs/large.pdf`
// and silently no-op if it is missing — fixture generation requires the
// sidecars which are not assumed present in every dev environment.  Run
// `pwsh scripts/fetch-sidecars.ps1 && pwsh scripts/generate-fixtures.ps1`
// (Phase 18 Task 90d) to populate the fixtures and get real numbers.

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use std::path::{Path, PathBuf};
use tempfile::TempDir;

use pdf_editor_lib::services::pdf_editor::merge_pdfs;
use pdf_editor_lib::services::pdf_renderer::{render_page_to_png, RenderOptions};

fn fixture(rel: &str) -> Option<PathBuf> {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel);
    if p.exists() {
        Some(p)
    } else {
        None
    }
}

fn bench_merge_10x50pages(c: &mut Criterion) {
    let Some(input) = fixture("tests/fixtures/pdfs/large.pdf") else {
        eprintln!(
            "[bench] skipping bench_merge_10x50pages — fixture missing (run generate-fixtures.ps1)"
        );
        return;
    };
    let tmp = TempDir::new().expect("tempdir");
    let inputs: Vec<PathBuf> = (0..10).map(|_| input.clone()).collect();
    c.bench_function("merge_10x50p", |b| {
        b.iter(|| {
            let out = tmp.path().join(format!("m_{}.pdf", rand::random::<u32>()));
            merge_pdfs(&inputs, &out).expect("merge");
            black_box(out);
        })
    });
}

fn bench_render_first_page(c: &mut Criterion) {
    let Some(input) = fixture("tests/fixtures/pdfs/large.pdf") else {
        eprintln!("[bench] skipping bench_render_first_page — fixture missing");
        return;
    };
    let tmp = TempDir::new().expect("tempdir");
    c.bench_function("render_first_page_150dpi", |b| {
        b.iter(|| {
            let out = tmp.path().join("p.png");
            // NB: in-process render is sidecar-only on this build — this
            // benchmark currently exercises only the error path. When the
            // in-process MuPDF binding lands (Phase 12+ followup), this
            // becomes a real timing.
            let _ = render_page_to_png(Path::new(&input), 0, &out, &RenderOptions { dpi: 150 });
            black_box(out);
        })
    });
}

criterion_group!(benches, bench_merge_10x50pages, bench_render_first_page);
criterion_main!(benches);
