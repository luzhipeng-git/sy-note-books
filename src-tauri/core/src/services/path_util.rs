//! Path boundary validation utilities for workspace operations.
//!
//! These functions ensure that file operations stay within the intended
//! workspace directory, preventing accidental operations outside the workspace.

use std::path::{Path, PathBuf};

/// Validate that a target path resolves to a location within the workspace root.
///
/// Both paths are canonicalized (resolving symlinks and `..` components) before
/// comparison. Returns the canonicalized target path on success.
///
/// # Errors
///
/// Returns a descriptive error string if:
/// - The root path does not exist or cannot be resolved
/// - The target path does not exist or cannot be resolved
/// - The resolved target is outside the workspace root
pub fn ensure_within_workspace(root: &Path, target: &Path) -> Result<PathBuf, String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|e| format!("工作区路径无效: {}", e))?;
    let canonical_target = target
        .canonicalize()
        .map_err(|e| format!("目标路径无效: {}", e))?;
    if canonical_target.starts_with(&canonical_root) {
        Ok(canonical_target)
    } else {
        Err(format!(
            "路径超出工作区范围: {}（工作区: {}）",
            target.display(),
            canonical_root.display()
        ))
    }
}

/// Validate that a relative path joined to a workspace root stays within the workspace.
///
/// Use this for functions that receive a workspace root and a relative `node_path`.
/// The joined path does not need to exist yet (unlike `ensure_within_workspace` which
/// requires the target to exist for canonicalization). Instead, this canonicalizes the
/// root and checks that the joined path's components do not escape it.
///
/// # How it works
///
/// 1. Canonicalize the root (must exist).
/// 2. Join the relative path to the canonical root.
/// 3. Normalize the result (resolve `..` and `.` components) without requiring the target to exist.
/// 4. Verify the normalized path starts with the canonical root.
///
/// # Errors
///
/// Returns a descriptive error string if the root is invalid or the joined path escapes it.
pub fn ensure_relative_within_workspace(
    root: &Path,
    relative_path: &str,
) -> Result<PathBuf, String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|e| format!("工作区路径无效: {}", e))?;

    let joined = canonical_root.join(relative_path);
    let normalized = normalize_path(&joined);

    if normalized.starts_with(&canonical_root) {
        Ok(normalized)
    } else {
        Err(format!(
            "路径超出工作区范围: {}（工作区: {}）",
            relative_path,
            canonical_root.display()
        ))
    }
}

/// Normalize a path by resolving `.` and `..` components without touching the filesystem.
///
/// This is a pure string-based operation — it does not resolve symlinks or check existence.
fn normalize_path(path: &Path) -> PathBuf {
    let mut components = Vec::new();
    for component in path.components() {
        match component {
            std::path::Component::CurDir => { /* skip `.` */ }
            std::path::Component::ParentDir => {
                if components.last().is_some_and(|c| {
                    !matches!(c, std::path::Component::ParentDir)
                        && !matches!(c, std::path::Component::RootDir | std::path::Component::Prefix(_))
                }) {
                    components.pop();
                } else {
                    components.push(component);
                }
            }
            c => components.push(c),
        }
    }
    components.iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    // --- ensure_within_workspace tests ---

    #[test]
    fn test_normal_path_passes() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        let file_path = root.join("chapter").join("note.md");
        fs::create_dir_all(file_path.parent().unwrap()).unwrap();
        fs::write(&file_path, "hello").unwrap();

        let result = ensure_within_workspace(root, &file_path);
        assert!(result.is_ok());
        assert!(result.unwrap().starts_with(root.canonicalize().unwrap()));
    }

    #[test]
    fn test_path_traversal_rejected() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        // Create a sibling directory outside workspace
        let sibling = root.parent().unwrap().join("sibling-dir");
        fs::create_dir_all(&sibling).unwrap();

        let result = ensure_within_workspace(root, &sibling);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("超出工作区范围"));
    }

    #[test]
    fn test_absolute_path_outside_workspace_rejected() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        // /tmp always exists
        let outside = Path::new("/tmp");

        let result = ensure_within_workspace(root, outside);
        // /tmp is a parent or same level, depends on where TempDir is
        // This should fail because /tmp is not inside the workspace
        assert!(result.is_err() || result.unwrap().starts_with(root.canonicalize().unwrap()));
    }

    #[test]
    fn test_nonexistent_target_returns_error() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        let nonexistent = root.join("no-such-file.md");

        let result = ensure_within_workspace(root, &nonexistent);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("目标路径无效"));
    }

    #[test]
    fn test_nonexistent_root_returns_error() {
        let result = ensure_within_workspace(Path::new("/no/such/root"), Path::new("/tmp"));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("工作区路径无效"));
    }

    #[test]
    fn test_symlink_escape_rejected() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();

        // Create a directory inside workspace
        let inner = root.join("inner");
        fs::create_dir_all(&inner).unwrap();

        // Create a symlink pointing outside workspace
        let link = root.join("escape-link");
        #[cfg(unix)]
        std::os::unix::fs::symlink("/tmp", &link).unwrap();

        let result = ensure_within_workspace(root, &link);
        // /tmp is not inside the workspace, so should be rejected
        assert!(result.is_err());
    }

    // --- ensure_relative_within_workspace tests ---

    #[test]
    fn test_normal_relative_path_passes() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();

        let result = ensure_relative_within_workspace(root, "01-intro/index.md");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), root.canonicalize().unwrap().join("01-intro/index.md"));
    }

    #[test]
    fn test_dotdot_traversal_rejected() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();

        let result = ensure_relative_within_workspace(root, "../../etc/passwd");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("超出工作区范围"));
    }

    #[test]
    fn test_dotdot_to_root_rejected() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();

        let result = ensure_relative_within_workspace(root, "../../../");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("超出工作区范围"));
    }

    #[test]
    fn test_single_dotdot_rejected() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();

        let result = ensure_relative_within_workspace(root, "../sibling");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("超出工作区范围"));
    }

    #[test]
    fn test_dot_components_ignored() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();

        let result = ensure_relative_within_workspace(root, "./chapter/./note.md");
        assert!(result.is_ok());
        assert_eq!(
            result.unwrap(),
            root.canonicalize().unwrap().join("chapter/note.md")
        );
    }

    #[test]
    fn test_deep_nested_normal_path() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();

        let result = ensure_relative_within_workspace(root, "a/b/c/d/e.md");
        assert!(result.is_ok());
    }

    #[test]
    fn test_dotdot_then_back_in_rejected() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();

        // ../etc is still escaping even if you come back
        let result = ensure_relative_within_workspace(root, "../tmp/workspace");
        assert!(result.is_err());
    }

    #[test]
    fn test_empty_relative_path_passes() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();

        let result = ensure_relative_within_workspace(root, "");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), root.canonicalize().unwrap());
    }

    // --- normalize_path tests ---

    #[test]
    fn test_normalize_basic() {
        assert_eq!(
            normalize_path(Path::new("/a/b/c")),
            PathBuf::from("/a/b/c")
        );
    }

    #[test]
    fn test_normalize_dot() {
        assert_eq!(
            normalize_path(Path::new("/a/./b")),
            PathBuf::from("/a/b")
        );
    }

    #[test]
    fn test_normalize_dotdot() {
        assert_eq!(
            normalize_path(Path::new("/a/b/../c")),
            PathBuf::from("/a/c")
        );
    }

    #[test]
    fn test_normalize_multiple_dotdot() {
        assert_eq!(
            normalize_path(Path::new("/a/b/c/../../d")),
            PathBuf::from("/a/d")
        );
    }

    #[test]
    fn test_normalize_dotdot_at_root() {
        // /a/.. normalizes to /, then .. cannot go higher
        assert_eq!(
            normalize_path(Path::new("/a/../..")),
            PathBuf::from("/..")
        );
        // This is still "outside" any workspace root — ensure_relative_within_workspace
        // will catch it because it won't start with the canonical root
    }
}
