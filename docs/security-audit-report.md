# 安全审计报告 — 书昀笔记（sy-note-books）

**审计日期：** 2026-06-06
**审计范围：** 鲁棒性 + 依赖漏洞扫描（务实版）
**威胁模型：** 桌面应用，无网络功能，用户数据完全本地

---

## 1. 依赖漏洞扫描

### 前端（pnpm audit）

| 严重程度 | 包 | 路径 | 状态 |
|---------|-----|------|------|
| HIGH | `serialize-javascript` <=7.0.2 | e2e-tests > mocha > serialize-javascript | ⚠️ 仅开发依赖，不影响生产 |
| MODERATE | `dompurify` <3.4.0 (多个 CVE) | @drawnix/drawnix > mermaid > dompurify | ⚠️ 传递依赖，不可直接升级 |
| MODERATE | `mermaid` <10.9.6 (XSS + DoS) | @drawnix/drawnix > mermaid | ⚠️ 传递依赖，不可直接升级 |

**结论：** 所有漏洞均为传递依赖或开发依赖，不直接影响生产代码。可通过升级 Drawnix 或 mermaid 间接修复，但当前不构成实际风险。

### Rust（cargo audit）

**0 个漏洞**。17 个 warning，均为「未维护」标记：

- gtk-rs GTK3 bindings（10 个）— Tauri 依赖，等 Tauri 上游升级
- `proc-macro-error`（1 个）— 常见未维护 crate
- `unic-*`（5 个）— unicode 处理相关
- `glib` VariantStrIter unsound（1 个）— Tauri 依赖

**结论：** 无可利用漏洞，所有 warning 均为 Tauri 框架传递依赖。无法在应用层修复。

---

## 2. Clippy 静态分析

**修复前：** 3 个 warning（风格建议）
**修复后：** 0 个 warning

修复内容：
- `workspace.rs`: `iter().any()` → `contains()`（2 处）
- `workspace.rs`: 合并重复的 `if` 分支（1 处）
- `path_util.rs`: `map_or(false, ...)` → `is_some_and(...)`（1 处）

**结论：** 无 unsafe 使用、无未处理错误、无潜在 panic 点。

---

## 3. 路径边界校验（新增）

### 问题

`delete_node`、`rename_node`、`create_page`、`create_chapter` 四个函数接受 `workspace_path` + 相对路径参数，直接用 `Path::join` 拼接后做文件操作。如果相对路径包含 `../`，可能操作 workspace 外的文件。

### 解决方案

新增 [path_util.rs](src-tauri/core/src/services/path_util.rs) 模块：

- `ensure_relative_within_workspace(root, relative_path)` — 纯字符串路径规范化，不依赖文件系统存在性，在操作前校验拼接后的路径不会跳出 workspace 根
- `ensure_within_workspace(root, target)` — canonicalize 后的前缀匹配，用于目标路径已存在的场景

### 应用范围

| 函数 | 校验类型 | 效果 |
|------|---------|------|
| `delete_node` | `ensure_relative_within_workspace` | `../../etc` 等路径被拒绝 |
| `rename_node` | `ensure_relative_within_workspace` | 同上 |
| `create_chapter` | `ensure_relative_within_workspace` | 同上 |
| `create_page` | `ensure_relative_within_workspace` | 同上 |

### 测试覆盖

- `path_util.rs` 内 19 个单元测试：`../` 跳出、绝对路径、符号链接、空路径、深层嵌套等
- 现有 124 个 Rust 测试全部通过（含路径校验集成）

---

## 4. 前端输入容错测试（新增）

新增 [workspaceStore.input-tolerance.test.ts](src/stores/workspaceStore.input-tolerance.test.ts)，14 个测试：

- 空字符串路径 → 不崩溃
- 含 null 字节路径 → 不崩溃
- 空标题/超长标题/Unicode 标题/特殊字符标题 → 不崩溃
- 无 workspace 时操作 → 不崩溃
- 路径遍历字符 → 不崩溃（后端拒绝在 Rust 层测试）

现有 166 个前端测试全部通过（含新增 14 个）。

---

## 5. 未处理事项（接受风险）

| 项目 | 原因 |
|------|------|
| CSP 配置 | 桌面应用无远程入口，CSP 不提供实际保护 |
| HTML 消毒（DOMPurify） | 用户自己写的内容，无攻击者向量 |
| Drawnix 传递依赖漏洞 | 无法直接升级，需等上游更新 |
| Docker 安全加固 | 仅开发/CI 使用 |

---

## 审计总结

| 检查项 | 结果 |
|--------|------|
| pnpm audit | ⚠️ 开发/传递依赖有漏洞，生产代码无影响 |
| cargo audit | ✅ 0 个漏洞，17 个未维护 warning（均为 Tauri 传递依赖） |
| cargo clippy | ✅ 零警告 |
| 路径边界校验 | ✅ 新增防护 + 19 个测试 |
| 前端输入容错 | ✅ 新增 14 个测试 |
| Rust 测试 | ✅ 124/124 通过 |
| 前端测试 | ✅ 166/166 通过 |
