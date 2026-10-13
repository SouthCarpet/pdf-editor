//! Test seam for the link checks of the uninstall cleanup and the update
//! download (plan 119). The code calls `at(point, path)` between the moment
//! a folder is pinned or listed and the moment it is used. Unit tests set a
//! callback there that tries to swap a folder or a file, so a race becomes a
//! deterministic test. Outside `cfg(test)` the call does nothing.

/// Uninstall: every folder of the part is pinned; `path` is the folder
/// that is cleaned next.
pub const PINNED: &str = "pinned";
/// Uninstall: the entries of `path` are listed and not yet used.
pub const LISTED: &str = "listed";
/// Update: the new download folder `path` is pinned; no `.part` yet.
pub const DOWNLOAD_DIR: &str = "download-dir";
/// Update: the setup is verified; `path` is the final name, not yet used.
pub const PLACE: &str = "place";

#[cfg(not(test))]
#[inline(always)]
pub fn at(_point: &str, _path: &std::path::Path) {}

#[cfg(test)]
pub use seam::{at, set, Guard};

#[cfg(test)]
mod seam {
    use std::cell::RefCell;
    use std::path::Path;

    type Hook = Box<dyn FnMut(&str, &Path)>;

    thread_local! {
        static HOOK: RefCell<Option<Hook>> = const { RefCell::new(None) };
    }

    /// Runs the hook of this thread, if a test set one.
    pub fn at(point: &str, path: &Path) {
        let Some(mut hook) = HOOK.with(|slot| slot.borrow_mut().take()) else {
            return;
        };
        hook(point, path);
        HOOK.with(|slot| *slot.borrow_mut() = Some(hook));
    }

    /// Removes the hook when the test ends.
    pub struct Guard;

    impl Drop for Guard {
        fn drop(&mut self) {
            HOOK.with(|slot| slot.borrow_mut().take());
        }
    }

    /// Sets the hook for this thread until the returned guard drops.
    pub fn set(hook: impl FnMut(&str, &Path) + 'static) -> Guard {
        HOOK.with(|slot| *slot.borrow_mut() = Some(Box::new(hook)));
        Guard
    }
}
