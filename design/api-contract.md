# IPC 接口契约

> 版本: 1.0 | 日期: 2026-05-24
>
> 前后端 IPC 类型定义的单一事实来源。前后端必须以此文档为准。

## 通用约定

1. **命名映射**：Rust struct 统一标注 `#[serde(rename_all = "camelCase")]`，serde 自动将 `snake_case` 字段转为 `camelCase`，与 TypeScript 约定一致
2. **命令参数**：Tauri `#[tauri::command]` 使用扁平参数（非嵌套 request 对象）
3. **错误处理**：所有命令返回 `Result<T, String>`，错误信息为用户可读的中文描述
4. **路径参数**：workspace 内的相对路径（如 `02-architecture/api-overview.md`），workspace 根目录使用绝对路径

---

## 1. Workspace Commands

### 1.1 open_workspace

打开已有 workspace，执行校验和自动修复。

| 端 | 定义 |
|----|------|
| TS Request | `{ path: string }` |
| TS Response | `WorkspaceInfo` |
| Rust 签名 | `fn open_workspace(path: String) -> Result<WorkspaceInfo, String>` |

**行为**：
1. 读取 workspace.json → 校验 + 缺字段补默认值
2. 读取 SUMMARY.md → 解析目录结构
3. 扫描磁盘章节目录 → 与 SUMMARY 对比 → 自动修复
4. 返回 WorkspaceInfo（含 repairs 列表）

---

### 1.2 create_workspace

创建新 workspace 目录结构。

| 端 | 定义 |
|----|------|
| TS Request | `{ path: string; title: string; author: string; language?: string }` |
| TS Response | `WorkspaceInfo` |
| Rust 签名 | `fn create_workspace(path: String, title: String, author: String, language: Option<String>) -> Result<WorkspaceInfo, String>` |

**行为**：
1. 创建目录（如不存在）
2. 写入 workspace.json（含 `_comment` 警告）
3. 写入 SUMMARY.md（含头部注释 + `# {title}`）
4. 创建 workspace 级 assets/ 目录
5. 返回 WorkspaceInfo（summary 为空，repairs 为空）

---

### 1.3 get_recent_workspaces

获取最近打开的 workspace 列表。

| 端 | 定义 |
|----|------|
| TS Request | 无 |
| TS Response | `RecentWorkspace[]` |
| Rust 签名 | `fn get_recent_workspaces(app: AppHandle) -> Result<Vec<RecentWorkspace>, String>` |

---

## 2. Chapter Commands

### 2.1 create_chapter

新建章节（创建文件夹 + index.md + assets/ + 更新 SUMMARY.md）。

| 端 | 定义 |
|----|------|
| TS Request | `{ workspacePath: string; title: string }` |
| TS Response | `ChapterInfo` |
| Rust 签名 | `fn create_chapter(workspace_path: String, title: String) -> Result<ChapterInfo, String>` |

**行为**：
1. 扫描已有章节目录，确定下一个序号（如 03-）
2. 生成目录名：`{序号}-{slug}`
3. 创建目录 + index.md（`# {title}`）+ assets/
4. 更新 SUMMARY.md（追加章节条目）
5. 返回 ChapterInfo

---

### 2.2 create_page

在章节内新建子页面。

| 端 | 定义 |
|----|------|
| TS Request | `{ chapterPath: string; title: string }` |
| TS Response | `PageInfo` |
| Rust 签名 | `fn create_page(chapter_path: String, title: String) -> Result<PageInfo, String>` |

**行为**：
1. 在章节目录创建 `{slug}.md`（`# {title}`）
2. 更新 SUMMARY.md（在对应章节下添加子页面条目）
3. 返回 PageInfo

---

### 2.3 rename_node

重命名章节或页面（更新文件名/目录名 + SUMMARY.md + md 内标题）。

| 端 | 定义 |
|----|------|
| TS Request | `{ path: string; newTitle: string }` |
| TS Response | `void` |
| Rust 签名 | `fn rename_node(workspace_path: String, path: String, new_title: String) -> Result<(), String>` |

---

### 2.4 delete_node

删除章节（递删文件夹）或页面（删文件）+ 更新 SUMMARY.md。

| 端 | 定义 |
|----|------|
| TS Request | `{ workspacePath: string; path: string }` |
| TS Response | `void` |
| Rust 签名 | `fn delete_node(workspace_path: String, path: String) -> Result<(), String>` |

---

### 2.5 reorder_chapters

拖拽调整章节顺序（重命名文件夹前缀 + 更新 SUMMARY.md）。

| 端 | 定义 |
|----|------|
| TS Request | `{ workspacePath: string; chapterOrders: ChapterOrder[] }` |
| TS Response | `void` |
| Rust 签名 | `fn reorder_chapters(workspace_path: String, chapter_orders: Vec<ChapterOrder>) -> Result<(), String>` |

---

## 3. File Commands

### 3.1 read_file

读取文件文本内容。

| 端 | 定义 |
|----|------|
| TS Request | `{ path: string }` |
| TS Response | `string` |
| Rust 签名 | `fn read_file(path: String) -> Result<String, String>` |

---

### 3.2 save_file

保存文件文本内容。

| 端 | 定义 |
|----|------|
| TS Request | `{ path: string; content: string }` |
| TS Response | `void` |
| Rust 签名 | `fn save_file(path: String, content: String) -> Result<(), String>` |

---

### 3.3 read_all_md_files

读取 workspace 内所有 .md 文件（用于前端搜索索引构建）。

| 端 | 定义 |
|----|------|
| TS Request | `{ workspacePath: string }` |
| TS Response | `MdFileContent[]` |
| Rust 签名 | `fn read_all_md_files(workspace_path: String) -> Result<Vec<MdFileContent>, String>` |

---

### 3.4 list_assets

列出章节 assets/ 目录下所有文件。

| 端 | 定义 |
|----|------|
| TS Request | `{ chapterPath: string }` |
| TS Response | `AssetInfo[]` |
| Rust 签名 | `fn list_assets(chapter_path: String) -> Result<Vec<AssetInfo>, String>` |

---

### 3.5 get_next_image_index

获取文档的下一个图片序号。

| 端 | 定义 |
|----|------|
| TS Request | `{ assetsDir: string; docName: string }` |
| TS Response | `number` |
| Rust 签名 | `fn get_next_image_index(assets_dir: String, doc_name: String) -> Result<u32, String>` |

---

## 4. Whiteboard Commands

### 4.1 save_drawnix

保存白板数据（.drawnix JSON + .svg 导出）。

| 端 | 定义 |
|----|------|
| TS Request | `{ path: string; data: string; svgContent: string }` |
| TS Response | `void` |
| Rust 签名 | `fn save_drawnix(path: String, data: String, svg_content: String) -> Result<(), String>` |

**行为**：写入 `{path}.drawnix` 和 `{path}.svg`（path 不含扩展名）。

---

## 5. Export Commands

### 5.1 export_chm

导出为 CHM 电子书。

| 端 | 定义 |
|----|------|
| TS Request | `{ workspacePath: string; outputPath: string; chapter?: string }` |
| TS Response | `string`（输出文件路径） |
| Rust 签名 | `fn export_chm(workspace_path: String, output_path: String, chapter: Option<String>) -> Result<String, String>` |

---

### 5.2 export_nginx

导出为 nginx 静态站点。

| 端 | 定义 |
|----|------|
| TS Request | `{ workspacePath: string; outputPath: string; chapter?: string }` |
| TS Response | `string`（输出目录路径） |
| Rust 签名 | `fn export_nginx(workspace_path: String, output_path: String, chapter: Option<String>) -> Result<String, String>` |

---

### 5.3 export_pdf

单文件 PDF 导出（触发 WebView 打印对话框）。

| 端 | 定义 |
|----|------|
| TS Request | `{ filePath: string }` |
| TS Response | `void` |
| Rust 签名 | `fn export_pdf(file_path: String) -> Result<(), String>` |

---

## 6. Settings Commands

### 6.1 get_settings

读取应用设置。

| 端 | 定义 |
|----|------|
| TS Request | 无 |
| TS Response | `Settings` |
| Rust 签名 | `fn get_settings(app: AppHandle) -> Result<Settings, String>` |

---

### 6.2 save_settings

保存应用设置。

| 端 | 定义 |
|----|------|
| TS Request | `{ settings: Settings }` |
| TS Response | `void` |
| Rust 签名 | `fn save_settings(app: AppHandle, settings: Settings) -> Result<(), String>` |

---

## 7. 共享类型定义

### 7.1 TypeScript 类型

```typescript
// === Workspace ===

interface WorkspaceMeta {
  title: string;
  author: string;
  language: string;
  version: string;
  created: string;
}

interface SummaryNode {
  title: string;
  path: string;
  level: number;
  isMissing?: boolean;
  children?: SummaryNode[];
}

interface RepairAction {
  kind: 'added_missing_chapter' | 'missing_file' | 'field_defaulted';
  detail: string;
}

interface WorkspaceInfo {
  rootPath: string;
  workspaceMeta: WorkspaceMeta;
  summary: SummaryNode[];
  repairs: RepairAction[];
}

// === Chapter ===

interface ChapterInfo {
  name: string;
  path: string;
  indexPath: string;
}

interface PageInfo {
  name: string;
  path: string;
}

interface ChapterOrder {
  path: string;
  newOrder: number;
}

// === File ===

interface MdFileContent {
  path: string;
  content: string;
}

interface AssetInfo {
  name: string;
  size: number;
  type: string;
  path: string;
}

// === Settings ===

interface RecentWorkspace {
  path: string;
  title: string;
  lastOpened: string;
}

interface Settings {
  recentWorkspaces: RecentWorkspace[];
  theme: 'light' | 'dark';
  sidebarWidth: number;
}

// === Frontend-only ===

interface FileTreeNode {
  name: string;
  path: string;
  type: 'folder' | 'file';
  children?: FileTreeNode[];
  isMissing?: boolean;
}

interface WhiteboardAnchor {
  sourceFilePath: string;
  cursorPosition: number;
  nearestHeading: string;
}

type EditorType = 'empty' | 'markdown' | 'whiteboard';
```

### 7.2 Rust 结构体

```rust
// === models/workspace.rs ===

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMeta {
    pub title: String,
    pub author: String,
    pub language: String,
    pub version: String,
    pub created: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryEntry {
    pub title: String,
    pub path: String,
    pub level: u32,
    #[serde(default)]
    pub is_missing: bool,
    #[serde(default)]
    pub children: Vec<SummaryEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairAction {
    pub kind: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    pub root_path: String,
    pub workspace_meta: WorkspaceMeta,
    pub summary: Vec<SummaryEntry>,
    #[serde(default)]
    pub repairs: Vec<RepairAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterInfo {
    pub name: String,
    pub path: String,
    pub index_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageInfo {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterOrder {
    pub path: String,
    pub new_order: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MdFileContent {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetInfo {
    pub name: String,
    pub size: u64,
    pub file_type: String,
    pub path: String,
}

// === models/settings.rs ===

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentWorkspace {
    pub path: String,
    pub title: String,
    pub last_opened: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)]
    pub recent_workspaces: Vec<RecentWorkspace>,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_sidebar_width")]
    pub sidebar_width: u32,
}

fn default_theme() -> String { "light".to_string() }
fn default_sidebar_width() -> u32 { 260 }
```

---

## 8. 命令索引

| # | Command | Phase | 分组 |
|---|---------|-------|------|
| 1 | open_workspace | 1 | Workspace |
| 2 | create_workspace | 1 | Workspace |
| 3 | get_recent_workspaces | 1 | Workspace |
| 4 | create_chapter | 1 | Chapter |
| 5 | create_page | 1 | Chapter |
| 6 | rename_node | 1 | Chapter |
| 7 | delete_node | 1 | Chapter |
| 8 | reorder_chapters | 1 | Chapter |
| 9 | read_file | 1 | File |
| 10 | save_file | 1 | File |
| 11 | read_all_md_files | 4 | File |
| 12 | list_assets | 2 | File |
| 13 | get_next_image_index | 3 | File |
| 14 | save_drawnix | 3 | Whiteboard |
| 15 | export_chm | 5 | Export |
| 16 | export_nginx | 5 | Export |
| 17 | export_pdf | 5 | Export |
| 18 | get_settings | 1 | Settings |
| 19 | save_settings | 1 | Settings |
