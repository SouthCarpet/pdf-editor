// Plan 119 p1b: a fresh checkout's dev build refused an existing database.
//
// sqlx stores a SHA-384 of each migration file in `_sqlx_migrations` and
// refuses a database whose stored value differs from the build's ("migration
// ... was previously applied but has been modified"). The hash covers the raw
// bytes. The released app was built from a checkout with LF line endings, so
// its databases hold the LF hashes below (both found in the shipped
// `pdf-editor.exe`). A Windows checkout with `core.autocrlf=true` and no
// `.gitattributes` rule for `*.sql` turned the files into CRLF, and its build
// refused every database the release had created.
// See .vault/process/debug/debug_054_2026-10-12.md.
use pdf_editor_lib::persistence::db::{create_pool, run_migrations};
use sha2::{Digest, Sha384};
use std::path::Path;
use tempfile::TempDir;

const RELEASED_CHECKSUMS: &[(&str, &str)] = &[
    (
        "20260510000001_initial.sql",
        "77c5e8caaed12b6de051e4e3d68e33e87fd1a04d26452808b72d20666313b33d109aaecee56dbcff906bdd1dc25d62d4",
    ),
    (
        "20260726000002_ocr_hocr_cache.sql",
        "392c62311544500c62534de0ca53d285663350becf0149634e5f7c56c465197fa29048c68ade280ae339dd3fcddd32fa",
    ),
];

fn migrations_dir() -> &'static Path {
    Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/migrations"))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// The bytes the release build embedded: the file with LF line endings.
fn released_bytes(file: &str) -> Vec<u8> {
    let raw = std::fs::read(migrations_dir().join(file)).expect("read migration");
    String::from_utf8(raw)
        .expect("migration is UTF-8")
        .replace("\r\n", "\n")
        .into_bytes()
}

#[test]
fn the_build_embeds_the_released_migration_checksums() {
    let migrator = sqlx::migrate!("./migrations");
    for (file, expected) in RELEASED_CHECKSUMS {
        assert_eq!(hex(&Sha384::digest(released_bytes(file))), *expected, "{file}");
        let version: i64 = file[..14].parse().expect("version prefix");
        let embedded = migrator
            .iter()
            .find(|migration| migration.version == version)
            .unwrap_or_else(|| panic!("{file} is not embedded"));
        assert_eq!(
            hex(&embedded.checksum),
            *expected,
            "{file} changed bytes (line endings?); existing databases would be refused"
        );
    }
}

#[tokio::test]
async fn a_database_created_by_the_release_is_accepted() {
    let released = TempDir::new().unwrap();
    for (file, _) in RELEASED_CHECKSUMS {
        std::fs::write(released.path().join(file), released_bytes(file)).unwrap();
    }
    let data = TempDir::new().unwrap();
    let db_path = data.path().join("app.db");
    let release_pool = create_pool(&db_path).await.expect("pool");
    sqlx::migrate::Migrator::new(released.path())
        .await
        .expect("released migrations")
        .run(&release_pool)
        .await
        .expect("release migrates a new database");
    release_pool.close().await;

    let dev_pool = create_pool(&db_path).await.expect("pool");
    run_migrations(&dev_pool)
        .await
        .expect("this build accepts a database the release created");
}
