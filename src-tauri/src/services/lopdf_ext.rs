// Compatibility shim for the lopdf 0.34 -> 0.44 upgrade.
//
// The upgrade exists to close RUSTSEC-2026-0187 (unbounded recursion on nested
// PDF objects, aborting the process rather than returning an Err; fixed
// upstream in 0.42.0). Two independent verifications on 2026-08-03 showed the
// byte-level pre-scan in `pdf_guard` cannot close it, so the version bump is
// the only real fix.
//
// Eight minor versions turned out to break exactly ONE thing in this codebase:
// `Object::as_name_str` was removed. `as_name()` now returns `Result<&[u8]>`
// where the old method returned `Result<&str>`.
//
// Restored as an extension trait rather than a free function so the eight call
// sites keep their existing syntax and only gain a `use`. The same reasoning as
// `pdf_guard::load_guarded`: a migration that requires rewriting every call
// site by hand gets applied to some of them.

use lopdf::{Error as LopdfError, Object};

pub trait ObjectExt {
    /// As `Object::as_name_str` behaved in lopdf 0.34.
    ///
    /// 0.34 implemented it as `Ok(str::from_utf8(self.as_name()?)?)`, relying on
    /// a `From<Utf8Error>` conversion that 0.44 no longer provides (verified: no
    /// occurrence of `Utf8Error` anywhere in the 0.44 source). Invalid UTF-8
    /// therefore maps explicitly to `CharacterEncoding`, which is the variant
    /// that conversion resolved to.
    fn as_name_str(&self) -> Result<&str, LopdfError>;
}

impl ObjectExt for Object {
    fn as_name_str(&self) -> Result<&str, LopdfError> {
        std::str::from_utf8(self.as_name()?).map_err(|_| LopdfError::CharacterEncoding)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_name_as_str() {
        assert_eq!(
            Object::Name(b"Type1".to_vec()).as_name_str().unwrap(),
            "Type1"
        );
    }

    #[test]
    fn wrong_object_type_is_an_error_not_a_panic() {
        // Every call site either uses `.ok()` or `?`, so the Err path is the
        // normal path for a dictionary key that holds something else.
        assert!(Object::Integer(7).as_name_str().is_err());
    }

    #[test]
    fn invalid_utf8_is_an_error_rather_than_lossy_text() {
        // 0.34 refused invalid UTF-8 rather than substituting replacement
        // characters. Preserving that matters: these values are compared
        // against font and filter names, and a lossy conversion would produce
        // a name that silently matches nothing.
        assert!(Object::Name(vec![0xff, 0xfe]).as_name_str().is_err());
    }
}
