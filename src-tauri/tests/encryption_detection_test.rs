//! Encryption detection across the lopdf 0.34 to 0.44 upgrade.
//!
//! The upgrade closed RUSTSEC-2026-0187 and, unannounced, changed what
//! `is_encrypted()` means. lopdf 0.44 auto-decrypts a document whose USER
//! password is empty, then clears `/Encrypt` from the trailer in memory. A
//! permission-locked file (empty user password, real owner password, the
//! `qpdf --encrypt "" owner 256` shape this project's own fixture generator
//! produces) therefore reports `is_encrypted() == false` where 0.34 reported
//! `true`.
//!
//! Two consequences, both found by an independent verifier and neither covered
//! by any test at the time:
//!
//!   1. `detect_pdf_encryption` and `OpenedDocument.is_encrypted` decide
//!      whether the unlock flow runs. A permission-locked file now looks
//!      unencrypted to both.
//!   2. `Document::save` writes what is in memory, and `/Encrypt` is no longer
//!      in it. Every edit path in this crate that loads and saves therefore
//!      strips the owner password and its permission restrictions.
//!
//! These tests pin the CURRENT behaviour so the next version bump cannot move
//! it again in silence. They assert what lopdf does, not what we wish it did.

use std::path::PathBuf;
use tempfile::TempDir;

fn fixture(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("pdfs")
        .join(name)
}

/// A file with a real USER password stays locked. lopdf cannot open it without
/// the password, so this is the case detection never got wrong.
#[test]
fn a_user_password_file_is_still_detected() {
    let path = fixture("password-open.pdf");
    assert!(path.exists(), "fixture missing: {}", path.display());

    // Either lopdf rejects the missing password, or it loads and reports
    // encryption. Both are "the UI will prompt"; any other error is a broken
    // fixture or parser regression, not evidence for this contract.
    match lopdf::Document::load(&path) {
        Ok(doc) => assert!(
            doc.is_encrypted() || doc.was_encrypted(),
            "a user-password file loaded and claimed to be unencrypted",
        ),
        Err(error) => assert!(
            matches!(
                error,
                lopdf::Error::InvalidPassword | lopdf::Error::Decryption(_)
            ),
            "a user-password file must fail specifically because it is encrypted: {error}",
        ),
    }
}

/// The regression, pinned. A permission-locked file loads clean and
/// `is_encrypted()` says false, while `was_encrypted()` remembers the truth.
#[test]
fn a_permission_locked_file_reads_as_unencrypted_but_remembers() {
    let path = fixture("password-permission.pdf");
    assert!(path.exists(), "fixture missing: {}", path.display());

    let doc = lopdf::Document::load(&path).expect("permission-locked file should load");

    // This is the behaviour change. If a future lopdf restores the 0.34
    // meaning, this assert fires and the union in `is_encrypted_or_was` below
    // can be revisited rather than silently double-counting.
    assert!(
        !doc.is_encrypted(),
        "lopdf now reports permission-locked files as encrypted again — the \
         detection union in pdf_reader.rs was written for the opposite and \
         should be re-examined",
    );
    assert!(
        doc.was_encrypted(),
        "lopdf stopped recording that the document arrived encrypted, which is \
         the only signal detection has left",
    );
}

/// The half the flag does not cover: saving drops the encryption dictionary.
///
/// Recorded rather than fixed here, because preserving an owner password
/// through an edit is a product decision (this crate routes real decryption to
/// qpdf), and a test that silently passed either way would be worse than none.
#[test]
fn saving_a_permission_locked_file_drops_its_encryption() {
    let path = fixture("password-permission.pdf");
    let mut doc = lopdf::Document::load(&path).expect("should load");
    assert!(
        doc.was_encrypted(),
        "fixture is not permission-locked any more"
    );

    let temp = TempDir::new().expect("temporary directory");
    let out = temp.path().join("roundtrip.pdf");
    doc.save(&out).expect("should save");
    let reloaded = lopdf::Document::load(&out).expect("should reload");
    assert!(
        !reloaded.is_encrypted() && !reloaded.was_encrypted(),
        "the roundtrip preserved encryption — if lopdf gained that ability, \
         the warning in pdf_reader.rs is stale and should be removed",
    );
}
