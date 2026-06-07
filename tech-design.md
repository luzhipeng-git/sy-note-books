# SelfNote — 技术设计文档

> 版本: 1.0 | 日期: 2026-05-18

## 1. 架构总览

### 1.1 分层架构

```
┌─────────────────────────────────────────────────────────┐
│                    Tauri 2.x Shell                       │
│                                                         │
│  ┌──────────── WebView (前端) ────────────┐  ┌────────┐│
│  │                                        │  │Rust 侧 ││
│  │  ┌─── UI 层 ──────────────────────┐   │  │        ││
│  │  │ AppShell                       │   │  │ ┌────┐ ││
│  │  │ ├─ Sidebar (文件树 + 目录)      │   │  │ │文件 │ ││
│  │  │ ├─ MainArea (编辑区)            │   │  │ │服务 │ ││
│  │  │ │   ├─ MarkdownEditor (Vditor)  │   │  │ ├────┤ ││
│  │  │ │   ├─ Whiteboard (Drawnix)     │   │  │ │工作 │ ││
│  │  │ │   └─ EmptyState (欢迎页)      │   │  │ │空间 │ ││
│  │  │ └─ Toolbar (工具栏)             │   │  │ │服务 │ ││
│  │  └─────────────────────────────────┘   │  │ ├────┤ ││
│  │                                        │  │ │导出 │ ││
│  │  ┌─── 状态层 (Zustand) ────────────┐   │  │ │引擎 │ ││
│  │  │ WorkspaceStore                  │   │  │ ├────┤ ││
│  │  │ EditorStore                     │   │  │ │监听 │ ││
│  │  │ SettingsStore                   │   │  │ │服务 │ ││
│  │  └─────────────────────────────────┘   │  │ └────┘ ││
│  │                                        │  │        ││
│  │  ┌─── IPC 桥接层 ──────────────────┐   │  │        ││
│  │  │ Tauri invoke / listen           │←→│  │        ││
│  │  └─────────────────────────────────┘   │  │        ││
│  └────────────────────────────────────────┘  └────────┘│
└─────────────────────────────────────────────────────────┘
```

### 1.2 技术栈

| 层面 | 选择 | 版本 | 决策理由 |
|------|------|------|---------|
| 桌面框架 | Tauri | 2.x | 包体积小（~5-10MB vs Electron ~150MB+），Rust 侧处理文件系统和导出性能好 |
| 前端框架 | React | 19 | Drawnix 深度依赖 React，统一技术栈 |
| 构建工具 | Vite | 8.x | Tauri 官方推荐，与 developer-tools 项目一致 |
| 状态管理 | Zustand | 5.x | 轻量，适合桌面应用单窗口场景 |
| 样式 | Tailwind CSS | 4.x | 快速开发，Drawnix 也使用 Tailwind |
| 全文搜索 | MiniSearch | 7.x | 前端内存索引，百篇级文档 < 50ms 响应，配合 Intl.Segmenter 中文分词 |
| PDF 导出 | WebView printToPDF | — | Tauri 内置 WebView，零额外依赖，弹出打印对话框半自动导出 |
| 路由 | 不使用 | — | 桌面应用单窗口，用状态控制视图切换 |
| Node.js | v25.9.0 | — | 与 developer-tools 项目保持一致（Vite 8 要求 `^20.19.0 \|\| >=22.12.0`） |

## 2. 编辑器技术选型

### 2.1 Markdown 编辑器 — Vditor

**选型决策过程：**

考察了以下候选方案：

| 方案 | Typora 还原度 | 扩展性 | 嵌入难度 | 白板集成友好度 |
|------|-------------|--------|---------|-------------|
| **Vditor (IR)** | **高** | 中 | **低** | 需桥接 |
| Milkdown/Crepe | 中高 | 极高 | 中 | ProseMirror 自定义 Node |
| Cherry Markdown | 中 | 中 | 低 | 需桥接 |
| Slate | — | 极高 | 极高 | 需全部自建 |
| MarkText | 高 | 低 | 无法嵌入 | fork 整个应用 |

**选择 Vditor 的理由：**

1. IR（Instant Rendering）模式开箱即用，直接对标 Typora 体验
2. 零框架依赖（Vanilla JS），可通过 React ref 包装嵌入
3. 内置 Mermaid v11 渲染，输出内联 SVG，导出 HTML/CHM 无损
4. 自带 mermaid、ECharts、flowchart.js、graphviz、markmap 等图表支持
5. 中文社区活跃

**未选其他方案的理由：**

- **Slate** — 定位是"构建编辑器的框架"，不是 Markdown 编辑器。用 Slate 做 Typora 需要自己实现 Markdown 双向解析器、即时渲染 UI 逻辑，工作量巨大
- **Milkdown** — ProseMirror 插件体系扩展性强，但 Crepe 的 Typora-like 体验还在打磨中，成熟度不如 Vditor IR
- **MarkText** — 完整的 Typora 替代品，但不是独立的可嵌入组件，无法集成到自定义应用中

**Vditor IR 模式原理：**

Vditor 有三种编辑模式：

| 模式 | 取值 | 体验 | 类似 |
|------|------|------|------|
| 所见即所得 | `wysiwyg` | 纯富文本，像 Notion | Notion |
| **即时渲染** | **`ir`** | **光标处显示语法，移走即渲染** | **Typora** |
| 分屏预览 | `sv` | 左右分栏 | VS Code |

IR 模式使用自研 Lute 引擎（Go 编译为 WASM），编辑时走增量渲染管线：

```
击键 → SpinVditorIRDOM() → 增量 AST 转换 → 局部 DOM 更新
光标移走 → VditorIRDOM2Md() → 同步回 Markdown 源文件
```

**图表渲染管线：**

```
用户在代码围栏写 ```mermaid 语法
  → Lute 引擎识别语言标记
  → 动态加载 mermaid.min.js (v11.11.0)
  → mermaid.render(uuid, code) 生成 SVG
  → item.innerHTML = svg（内联 SVG 插入 DOM）
```

渲染结果为纯内联 SVG，不是 `<img>` 标签。可直接 CSS 控制样式、JS 操作 DOM。

内置支持的图表：

| 渲染器 | 底层引擎 | 输出格式 |
|--------|---------|---------|
| mermaidRender | Mermaid v11 | 内联 SVG |
| flowchartRender | flowchart.js | 内联 SVG |
| chartRender | ECharts v5.5 | Canvas |
| markmapRender | Markmap | SVG |
| graphvizRender | Graphviz WASM | SVG |
| plantumlRender | PlantUML | 图片 |

注意：ECharts 渲染到 Canvas 而非 SVG，导出静态 HTML 时 Canvas 内容会丢失，需要额外处理（调用 `echarts.getDataURL()` 导出为 base64 图片）。

### 2.2 白板 — Drawnix

**选择理由：**

- MIT 协议，可直接作为 npm 依赖引入（`@drawnix/drawnix` v0.4.0-2）
- 基于 Plait 画图框架，插件架构可扩展
- 支持思维导图、流程图、自由画、画笔
- 支持 mermaid 语法转流程图、markdown 文本转思维导图

**技术栈兼容性分析：**

| 维度 | Vditor | Drawnix |
|------|--------|---------|
| 框架 | Vanilla JS（零依赖） | React 19（深度绑定） |
| 构建 | Webpack | Vite + Nx monorepo |
| 核心引擎 | Lute（Go → WASM） | Plait（Canvas 渲染） |
| UI 渲染 | DOM 操作 | React 组件 |

**集成策略 — 文件类型决定编辑器：**

两者不是嵌入关系，而是并排共存：

- `.md` 文件 → Vditor 编辑（通过 React ref 包装）
- `.drawnix` 文件 → Drawnix 组件直接渲染
- Markdown 中通过 `![img-001](./assets/xxx.svg)` 引用白板导出的 SVG

Drawnix 组件接口：

```typescript
<Drawnix
  value={data}            // PlaitElement[] — 白板 JSON 数据
  onChange={handleChange}
  onValueChange={handleValueChange}
  afterInit={handleInit}
/>
```

**样式隔离：** Vditor 用 `.vditor-*` 前缀，Drawnix 用 `.drawnix-*` 前缀，不互相污染。

## 3. 前端架构

### 3.1 目录结构

```
src/
├── main.tsx                     ← 入口
├── App.tsx                      ← 根组件
│
├── layouts/
│   ├── AppShell.tsx             ← 三栏布局：sidebar + main + optional panel
│   └── FullscreenLayout.tsx     ← 白板全屏模式布局
│
├── components/
│   ├── sidebar/
│   │   ├── WorkspaceTree.tsx    ← 文件树（解析 SUMMARY.md 渲染）
│   │   ├── TreeNode.tsx         ← 单个文件/文件夹节点
│   │   └── SidebarActions.tsx   ← 新建章节、导入等操作
│   │
│   ├── editor/
│   │   ├── EditorHost.tsx       ← 编辑区调度：根据文件类型切换编辑器
│   │   ├── MarkdownEditor.tsx   ← Vditor 的 React 包装
│   │   ├── WhiteboardEditor.tsx ← Drawnix 的 React 包装
│   │   ├── ImageHoverPreview.tsx ← 编辑器内图片悬停预览浮层
│   │   └── EmptyState.tsx       ← 欢迎页
│   │
│   ├── toolbar/
│   │   ├── MainToolbar.tsx      ← 顶部工具栏
│   │   └── Breadcrumb.tsx       ← 当前文件路径面包屑
│   │
│   ├── assets/
│   │   ├── AssetsPanel.tsx      ← 文件树资源浏览面板
│   │   ├── AssetPreview.tsx     ← 资源预览（图片/SVG/白板缩略图）
│   │   └── AssetLightbox.tsx    ← 全屏预览大图
│   │
│   ├── search/
│   │   ├── SearchDialog.tsx     ← 全局搜索对话框（Ctrl+K）
│   │   ├── SearchResults.tsx    ← 搜索结果列表
│   │   └── useSearch.ts         ← 搜索逻辑 hook（封装 MiniSearch）
│   │
│   ├── whiteboard/
│   │   ├── WhiteboardFullscreen.tsx  ← 全屏白板容器
│   │   └── WhiteboardAnchor.tsx      ← 锚点信息栏（返回按钮+段落提示）
│   │
│   ├── export/
│   │   ├── ExportDialog.tsx     ← 导出配置弹窗
│   │   └── ExportProgress.tsx   ← 导出进度
│   │
│   └── common/
│       ├── ConfirmDialog.tsx
│       └── Toast.tsx
│
├── stores/
│   ├── workspaceStore.ts        ← workspace 状态
│   ├── editorStore.ts           ← 编辑器状态
│   └── settingsStore.ts         ← 用户设置
│
├── services/
│   ├── fileService.ts           ← 封装 Tauri invoke，操作文件系统
│   ├── workspaceService.ts      ← workspace 级操作
│   ├── exportService.ts         ← 触发导出
│   └── imageService.ts          ← 图片管理（命名、编号、插入引用）
│
├── hooks/
│   ├── useWorkspace.ts          ← workspace 加载与管理
│   ├── useAutoSave.ts           ← 自动保存
│   └── useFileWatcher.ts        ← 监听外部文件变更
│
└── types/
    ├── workspace.ts
    └── editor.ts
```

### 3.2 状态设计

```typescript
// stores/workspaceStore.ts

interface WorkspaceState {
  // workspace 元信息
  rootPath: string | null;
  workspaceMeta: WorkspaceMeta | null;      // workspace.json 内容
  summary: SummaryNode[] | null;            // SUMMARY.md 解析结果

  // 文件树
  fileTree: FileTreeNode[];

  // 当前编辑状态
  activeFilePath: string | null;
  activeEditorType: 'markdown' | 'whiteboard' | 'empty';

  // 白板锚点（全屏画图时记住来源）
  whiteboardAnchor: {
    sourceFilePath: string;                 // 从哪个 md 文件进入白板
    cursorPosition: number;                 // 光标位置
    nearestHeading: string;                 // 最近的标题文本
  } | null;

  // 操作方法
  openWorkspace: (path: string) => Promise<void>;
  openFile: (path: string) => Promise<void>;
  closeFile: () => void;
  enterWhiteboard: (anchor: WhiteboardAnchor) => void;
  exitWhiteboard: () => void;
  refreshTree: () => Promise<void>;
}
```

### 3.3 EditorHost — 核心调度

```typescript
function EditorHost() {
  const { activeFilePath, activeEditorType, whiteboardAnchor } = useWorkspace();

  if (activeEditorType === 'whiteboard') {
    return (
      <FullscreenLayout>
        <WhiteboardAnchor anchor={whiteboardAnchor} onBack={exitWhiteboard} />
        <WhiteboardEditor />
      </FullscreenLayout>
    );
  }

  if (activeEditorType === 'markdown') {
    return <MarkdownEditor filePath={activeFilePath} />;
  }

  return <EmptyState />;
}

function getEditorType(filePath: string): EditorType {
  if (filePath.endsWith('.md')) return 'markdown';
  if (filePath.endsWith('.drawnix')) return 'whiteboard';
  return 'empty';
}
```

### 3.4 Vditor React 包装

Vditor 是 Vanilla JS，在 React 中通过 ref 包装：

```typescript
function MarkdownEditor({ file }: { file: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const vditorRef = useRef<Vditor | null>(null);

  useEffect(() => {
    vditorRef.current = new Vditor(ref.current!, {
      mode: 'ir',
      value: file,
      // ...
    });
    return () => vditorRef.current?.destroy();
  }, []);

  return <div ref={ref} />;
}
```

### 3.5 Assets 静态资源预览

**两种预览场景：**

**场景 A — 编辑器内悬停预览（ImageHoverPreview）：**

监听 Vditor 渲染区域内的 `mouseover` 事件，当鼠标悬停在 `<img>` 元素上时，读取 `src` 属性解析出文件路径，弹出预览浮层。

```typescript
// Vditor 渲染的 DOM 中，图片已内联显示
// 悬停时额外弹出一个浮动放大预览
function ImageHoverPreview({ target }: { target: HTMLImageElement }) {
  const src = target.getAttribute('src');
  // 解析相对路径 → 绝对路径
  // 渲染预览浮层（支持缩放）
}
```

**场景 B — 文件树资源浏览（AssetsPanel）：**

章节文件夹节点下添加「资源」子节点，展开时调用 Rust 侧读取 assets/ 目录：

```typescript
// components/sidebar/TreeNode.tsx
// 章节节点展开时，额外渲染一个「📁 资源 (N)」子节点
// 点击后展示 AssetsPanel，列出该章节 assets/ 下所有文件
// 点击文件：
//   .png/.jpg/.svg/.gif → AssetLightbox 全屏预览
//   .drawnix → 进入白板编辑模式
```

### 3.6 全文搜索

**技术方案：MiniSearch 前端内存索引 + Intl.Segmenter 中文分词**

**选型决策：**

| 方案 | 延迟 | 内存 | 复杂度 | 适用规模 |
|------|------|------|--------|---------|
| MiniSearch（前端） | < 50ms | ~10MB/100篇 | 低 | < 1000 篇 |
| Tantivy（Rust 侧） | < 10ms | 低（磁盘索引） | 高 | 10 万+ 篇 |
| Grep 扫描（Rust 侧） | 100ms+ | 极低 | 极低 | 不限但无评分 |

桌面应用的文档量通常在几百篇以内，MiniSearch 完全够用，且无需额外服务进程。

**实现：**

```typescript
// services/searchService.ts
import MiniSearch from 'miniseach';

interface SearchDocument {
  id: string;            // 文件路径
  title: string;         // 文件标题（h1）
  content: string;       // 文件内容
  chapterName: string;   // 所属章节名
  breadcrumb: string;    // 面包屑路径
}

// 中文分词：使用浏览器内置 Intl.Segmenter
function tokenize(text: string): string[] {
  const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
  return [...segmenter.segment(text)]
    .filter(s => s.isWordLike)
    .map(s => s.segment);
}

// 初始化索引
const searchIndex = new MiniSearch<SearchDocument>({
  fields: ['title', 'content'],        // 搜索字段
  storeFields: ['title', 'chapterName', 'breadcrumb'],  // 结果返回字段
  tokenize,                             // 中文分词器
  searchOptions: {
    tokenize,
    prefix: true,                       // 前缀匹配
    fuzzy: 0.2,                         // 模糊匹配
  },
});
```

**索引构建时机：**

```
打开 workspace
    │
    ▼
Rust 侧读取所有 .md 文件内容
    → invoke('read_all_md_files', { workspacePath })
    → 返回 Array<{ path, content }>
    │
    ▼
前端构建 MiniSearch 索引
    → 解析每篇文档的标题、章节归属
    → searchIndex.addAll(documents)
    │
    ▼
文件变更时增量更新
    → 保存文件 → 更新对应文档的索引
    → 新建文件 → 添加到索引
    → 删除文件 → 从索引移除
```

**搜索交互组件：**

```typescript
// components/search/SearchDialog.tsx
// Ctrl+K 唤起，ESC 关闭
// 输入即时搜索，结果按相关度排序
// 每条结果显示：标题 + 面包屑 + 匹配片段（高亮关键词）
// 点击结果 → 打开文件并滚动到匹配位置
```

### 3.7 单文件 PDF 导出

**技术方案：Tauri WebView printToPDF（半自动模式）**

**选型决策：**

| 方案 | 做法 | 依赖 | 排版质量 |
|------|------|------|---------|
| **WebView printToPDF** | 弹出打印对话框 | 无（Tauri 内置） | 与编辑器一致 |
| Python WeasyPrint | md→HTML→PDF | cairo/pango 系统 | 强但依赖重 |
| Python pdfkit | md→HTML→PDF | wkhtmltopdf 二进制 | 中等 |
| Chromium headless | Puppeteer 渲染 | 需打包 Chromium | 最好但体积大 |

选择 WebView 方案的理由：
1. Tauri WebView 本身是 Chromium 内核，天然支持打印
2. PDF 样式与编辑器渲染一致，所见即所得
3. 零额外依赖
4. 半自动模式让用户能控制纸张大小、边距等参数

**实现流程：**

```
用户点击「导出为 PDF」（或 Ctrl+P）
    │
    ▼
前端：Vditor.getHTML() 获取渲染后的 HTML
    │
    ▼
前端：创建隐藏的 <iframe>，注入 HTML + 打印样式
    │
    ▼
前端：调用 iframe.contentWindow.print()
    │
    ▼
系统弹出打印对话框
    → 用户选择「另存为 PDF」
    → 调整纸张大小、边距、方向
    → 点击「保存」
    │
    ▼
完成后销毁 iframe
```

关键实现 — 打印样式注入：

```typescript
function exportPdf(htmlContent: string) {
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        /* 打印专用样式 */
        @media print {
          body { font-family: "Noto Sans SC", sans-serif; font-size: 12pt; }
          pre { white-space: pre-wrap; }
          img { max-width: 100%; }
          h1 { page-break-before: always; }
          h1:first-of-type { page-break-before: avoid; }
          table { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>${htmlContent}</body>
    </html>
  `);
  doc.close();

  // 等待图片加载完成后触发打印
  iframe.contentWindow!.focus();
  iframe.contentWindow!.print();

  // 打印完成后清理
  setTimeout(() => document.body.removeChild(iframe), 1000);
}
```

## 4. 白板交互设计（详细）

### 4.1 触发画图的数据流

```
用户在 Markdown 中按 Ctrl+Shift+D（或输入 /wb 空格）
       │
       ▼
记录锚点信息（sourceFilePath, cursorPosition, nearestHeading）
       │
       ▼
workspaceStore.enterWhiteboard(anchor)
       │
       ▼
activeEditorType 切换为 'whiteboard'
       │
       ▼
EditorHost 渲染 FullscreenLayout + WhiteboardEditor
       │
       ▼
Drawnix 组件全屏渲染
顶栏显示「← 返回」+「正在为『{nearestHeading}』段落绘制插图」
```

### 4.2 保存并插入的数据流

```
用户在白板点击「保存并插入」
       │
       ▼
imageService.getNextIndex(assetsDir, docName)
  → 扫描 assets/ 下 {docName}-img-* 文件
  → 返回最大序号 + 1
       │
       ▼
fileService.saveDrawnix(path, data, svg)
  → Rust 写入 {docName}-img-{序号}.drawnix
  → Rust 写入 {docName}-img-{序号}.svg
       │
       ▼
fileService.readFile(anchor.sourceFilePath)
  → 读取原 Markdown 内容
       │
       ▼
在 anchor.cursorPosition 处插入：
  ![img-{序号}](./assets/{docName}-img-{序号}.svg)
       │
       ▼
fileService.saveFile(path, updatedContent)
       │
       ▼
workspaceStore.exitWhiteboard()
  → activeEditorType 切回 'markdown'
  → 光标恢复到 anchor.cursorPosition 位置
```

### 4.3 编辑已有图的数据流

```
用户双击 Markdown 中已插入的图片
       │
       ▼
从 img 标签的 src 解析出 .svg 路径
  → 推导出对应的 .drawnix 路径（同主文件名）
       │
       ▼
fileService.readFile(drawnixPath)
  → 读取 .drawnix JSON 数据
       │
       ▼
记录锚点（同新建流程）
加载 Drawnix 组件，传入已有数据
       │
       ▼
用户编辑完成后保存：
  → 更新 .drawnix 文件
  → 重新导出 .svg
  → Markdown 引用不变（路径和文件名不变）
```

## 5. Rust 后端架构

### 5.1 模块结构

```
src-tauri/
├── src/
│   ├── main.rs
│   ├── lib.rs
│   │
│   ├── commands/
│   │   ├── mod.rs
│   │   ├── workspace.rs       ← workspace 相关命令
│   │   ├── file.rs            ← 文件读写命令
│   │   └── export.rs          ← 导出命令
│   │
│   ├── services/
│   │   ├── mod.rs
│   │   ├── workspace.rs       ← workspace 扫描、验证、SUMMARY.md 解析
│   │   ├── file_watcher.rs    ← 文件系统监听（外部编辑器修改）
│   │   └── export/            ← 导出协调（调用 Python 引擎）
│   │       ├── mod.rs
│   │       └── engine.rs      ← Python 子进程调用
│   │
│   └── models/
│       ├── mod.rs
│       ├── workspace.rs
│       └── file_tree.rs
│
├── Cargo.toml
└── tauri.conf.json
```

### 5.2 系统文件保护机制

SUMMARY.md 和 workspace.json 由程序自动维护，实施三层保护：

**5.2.1 应用内文件树隐藏**

WorkspaceTree 组件渲染时过滤系统文件，只展示用户可操作的章节和文档：

```typescript
// 过滤规则
const SYSTEM_FILES = ['SUMMARY.md', 'workspace.json'];
const SYSTEM_DIRS = ['assets']; // workspace 级 assets

function buildFileTree(workspace: WorkspaceInfo): FileTreeNode[] {
  // 过滤掉 SYSTEM_FILES 和 workspace 根目录下的 SYSTEM_DIRS
  // 只渲染章节文件夹和其中的 .md 文件
}
```

用户的章节管理操作（新建/删除/重命名）通过 Rust 侧自动同步更新 SUMMARY.md 和 workspace.json。

**5.2.2 外部编辑器保护**

在文件内容中嵌入警告信息：

- SUMMARY.md 顶部：`<!-- ⚠️ 此文件由 SelfNote 自动维护，请勿手动编辑 -->`
- workspace.json：`{"_comment": "⚠️ 此文件由 SelfNote 自动维护，请勿手动编辑", ...}`

**5.2.3 启动时校验 + 自动修复**

```rust
// services/workspace.rs

#[tauri::command]
async fn open_workspace(path: String) -> Result<WorkspaceInfo, String> {
    // 1. 校验 workspace.json
    let meta = validate_or_repair_workspace_json(&path)?;

    // 2. 校验 SUMMARY.md 与磁盘一致性
    let (summary, repairs) = validate_or_repair_summary(&path)?;

    // 3. 返回结果（含修复报告）
    Ok(WorkspaceInfo { meta, summary, repairs })
}

fn validate_or_repair_workspace_json(path: &Path) -> Result<WorkspaceMeta, String> {
    let json_path = path.join("workspace.json");
    let content = fs::read_to_string(&json_path).map_err(|e| e.to_string())?;
    let mut meta: WorkspaceMeta = serde_json::from_str(&content)
        .map_err(|_| "workspace.json 格式损坏".to_string())?;

    // 缺失字段用默认值补全
    if meta.language.is_none() { meta.language = Some("zh-CN".into()); }
    if meta.version.is_none() { meta.version = Some("1.0.0".into()); }

    Ok(meta)
}

fn validate_or_repair_summary(path: &Path) -> Result<(Summary, Vec<RepairAction>), String> {
    let summary = parse_summary(path)?;
    let mut repairs = vec![];

    // 磁盘上的章节文件夹
    let disk_chapters = scan_chapter_dirs(path);

    // SUMMARY 引用的路径
    let summary_paths = summary.all_referenced_paths();

    // 磁盘有但 SUMMARY 没有 → 自动追加
    for chapter in &disk_chapters {
        if !summary_paths.contains(&chapter.path) {
            summary.append_entry(&chapter);
            repairs.push(RepairAction::AddedMissingChapter(chapter.path.clone()));
        }
    }

    // SUMMARY 有但磁盘没有 → 标记为缺失
    for path in &summary_paths {
        if !path.exists() {
            repairs.push(RepairAction::MissingFile(path.clone()));
        }
    }

    // 有修复则写回 SUMMARY.md
    if !repairs.is_empty() {
        write_summary(path, &summary)?;
    }

    Ok((summary, repairs))
}
```

### 5.3 IPC 接口设计

```rust
// commands/workspace.rs

#[tauri::command]
async fn open_workspace(path: String) -> Result<WorkspaceInfo, String>
// 内部执行：校验 workspace.json + 校验 SUMMARY.md 与磁盘一致性 + 自动修复

#[tauri::command]
async fn create_chapter(
    workspace_path: String,
    parent_dir: String,
    title: String,
    order: u32,
) -> Result<String, String>
// 内部执行：创建文件夹 + index.md + assets/ + 自动更新 SUMMARY.md
```

```rust
// commands/file.rs

#[tauri::command]
async fn read_file(path: String) -> Result<String, String>

#[tauri::command]
async fn save_file(path: String, content: String) -> Result<(), String>

#[tauri::command]
async fn save_drawnix(
    path: String,
    data: String,
    svg_content: String,
) -> Result<(), String>

#[tauri::command]
async fn get_next_image_index(
    assets_dir: String,
    doc_name: String,
) -> Result<u32, String>

#[tauri::command]
async fn read_all_md_files(
    workspace_path: String,
) -> Result<Vec<MdFileContent>, String>
// 返回 workspace 内所有 .md 文件的路径和内容，供前端构建搜索索引

#[tauri::command]
async fn list_assets(
    chapter_path: String,
) -> Result<Vec<AssetInfo>, String>
// 列出指定章节 assets/ 下的所有文件（文件名、大小、类型、缩略图路径）
```

```rust
// commands/export.rs

#[tauri::command]
async fn export_chm(
    workspace_path: String,
    output_path: String,
    chapter: Option<String>,       // 可选：单章节导出
) -> Result<String, String>

#[tauri::command]
async fn export_nginx(
    workspace_path: String,
    output_path: String,
    chapter: Option<String>,
) -> Result<String, String>
```

### 5.3 文件监听

用户可能在外部用 Typora 编辑同一 workspace，Rust 侧使用 `notify` crate 监听文件变更：

```rust
pub fn start_watcher(app_handle: AppHandle, workspace_path: String) {
    // 监听 .md 和 assets/ 下的变更
    // 过滤临时文件和 .drawnix 源数据
    // 通过 app_handle.emit("file-changed", payload) 通知前端
}
```

### 5.4 导出文件管理

#### 5.4.1 目录结构

导出的临时文件和最终产物存放在 app 安装目录下：

```
selfnote/                              ← app 安装目录
├── temp/                              ← 导出中间临时文件（用完即删）
│   ├── my-docs-a1b2c3/               ← {workspace名称}-{路径短hash}
│   │   ├── chm/
│   │   └── nginx/
│   └── project-x-e5f6g7h/
│
├── dist/                              ← 导出最终产物（按类型各自保留最近 3 个版本）
│   ├── my-docs-a1b2c3/
│   │   ├── chm-v1/
│   │   ├── chm-v2/
│   │   ├── chm-v3/                   ← CHM 最新版
│   │   ├── nginx-v1/
│   │   └── nginx-v2/                 ← Nginx 最新版
│   └── project-x-e5f6g7h/
│
└── vendor/                            ← 共享依赖缓存
```

**版本独立管理规则：**

- 版本按导出类型独立编号：`chm-v1, chm-v2, ...` 和 `nginx-v1, nginx-v2, ...`
- 新版本生成时，只淘汰同类型的最早版本：`chm-v4` 生成 → 删除 `chm-v1`，nginx 版本不受影响
- 每种类型最多保留 3 个版本

**文件夹命名规则：**

```rust
fn workspace_dir_name(workspace_path: &Path) -> String {
    let name = workspace_path.file_name().unwrap().to_str().unwrap();
    let hash = &sha256(workspace_path.to_str().unwrap())[..8]; // 取前 8 位
    format!("{}-{}", name, hash)
}
// 例如: workspace 路径为 /home/user/my-docs
// → my-docs-a1b2c3d4
```

#### 5.4.2 导出流程

```
用户触发导出 → 选择导出类型和范围
    │
    ▼
Rust 侧：
  1. 预清理：删除 temp/{ws}/ 下对应类型的目录
  2. 创建 temp/{ws}/chm/ 或 temp/{ws}/nginx/
  3. 调用 Python 引擎，指定临时目录路径：
     ./export-engine chm --workspace /path/to/ws --temp ./temp/{ws}/chm --output ./dist/{ws}/output.chm
  4. 等待 Python 引擎完成
  5. 导出成功 → 删除 temp/{ws}/ 对应目录
  6. 导出失败 → 保留 temp/（下次预清理时处理）
    │
    ▼
前端：
  7. 弹出保存对话框，用户选择目标路径
  8. Rust 将 dist/{ws}/ 下的产物复制到用户指定路径
  9. 完成通知
```

Python 引擎接口调整：

```bash
# 按类型独立编号版本：chm-v{N}、nginx-v{N}
# Python 引擎接收临时目录和输出目录，版本号由 Rust 侧管理

./export-engine chm \
  --workspace /path/to/workspace \
  --temp ./temp/my-docs-a1b2c3/chm \
  --output ./dist/my-docs-a1b2c3/chm-v3/output.chm

./export-engine nginx \
  --workspace /path/to/workspace \
  --temp ./temp/my-docs-a1b2c3/nginx \
  --output ./dist/my-docs-a1b2c3/nginx-v2/nginx
```

#### 5.4.3 三层清理机制

```rust
// services/cache.rs

use std::time::{SystemTime, Duration};

/// 第 1 层：导出开始前预清理
fn pre_export_cleanup(temp_dir: &Path) {
    if temp_dir.exists() {
        fs::remove_dir_all(temp_dir);
    }
}

/// 第 2 层：导出完成后立即清理
fn post_export_cleanup(temp_dir: &Path, success: bool) {
    if success && temp_dir.exists() {
        fs::remove_dir_all(temp_dir);
    }
    // 失败则保留，下次预清理时处理
}

/// 第 3 层：应用启动时兜底清理
fn startup_cleanup(app_install_dir: &Path) {
    let now = SystemTime::now();

    // 清理 temp/ 下超过 24 小时的目录
    let temp_root = app_install_dir.join("temp");
    if temp_root.exists() {
        for entry in fs::read_dir(&temp_root).unwrap() {
            let dir = entry.unwrap().path();
            if let Ok(modified) = fs::metadata(&dir).and_then(|m| m.modified()) {
                if now.duration_since(modified).unwrap() > Duration::from_secs(24 * 3600) {
                    let _ = fs::remove_dir_all(&dir);
                }
            }
        }
    }

    // 清理 dist/ — 按导出类型独立管理，每种类型保留最近 3 个版本
    let dist_root = app_install_dir.join("dist");
    if dist_root.exists() {
        for entry in fs::read_dir(&dist_root).unwrap() {
            let ws_dir = entry.unwrap().path();

            // 按前缀分组：chm-v*, nginx-v*
            let mut groups: std::collections::HashMap<String, Vec<(PathBuf, SystemTime)>> =
                std::collections::HashMap::new();

            for version_entry in fs::read_dir(&ws_dir).unwrap() {
                let dir = version_entry.unwrap().path();
                if !dir.is_dir() { continue; }
                let name = dir.file_name().unwrap().to_str().unwrap();

                // 解析类型前缀：chm-v3 → "chm", nginx-v2 → "nginx"
                if let Some(idx) = name.find("-v") {
                    let prefix = &name[..idx]; // "chm" 或 "nginx"
                    if let Ok(modified) = fs::metadata(&dir).and_then(|m| m.modified()) {
                        groups.entry(prefix.to_string())
                            .or_default()
                            .push((dir, modified));
                    }
                }
            }

            // 每组按修改时间排序，保留最近 3 个，删除其余
            for (_, mut versions) in groups {
                versions.sort_by_key(|(_, m)| *m); // 旧→新
                if versions.len() > 3 {
                    for (dir, _) in versions.iter().take(versions.len() - 3) {
                        let _ = fs::remove_dir_all(dir);
                    }
                }
            }
        }
    }
}
```

#### 5.4.4 用户保存流程

导出完成后，前端弹出保存对话框：

```typescript
// services/exportService.ts

async function exportAndSave(type: 'chm' | 'nginx', workspacePath: string) {
  // 1. 触发 Rust 侧导出到 dist/{ws}/
  await invoke('export_chm' /* 或 export_nginx */, {
    workspacePath,
    // output 已由 Rust 侧自动设为 dist/{ws}/
  });

  // 2. 弹出保存对话框
  const savePath = await dialog.save({
    title: type === 'chm' ? '保存 CHM 电子书' : '保存 Nginx 部署包',
    defaultPath: type === 'chm'
      ? `${workspaceName}.chm`
      : `${workspaceName}-site`,
  });

  if (savePath) {
    // 3. 复制产物到用户指定路径
    await invoke('copy_export_output', { from: distPath, to: savePath });
  }
  // 用户取消则不复制，产物仍保留在 dist/{ws}/ 下
}
```

### 5.5 导出引擎调用

Rust 通过子进程调用 Python 导出引擎（PyInstaller 编译的独立二进制）：

```rust
let output = Command::new(export_engine_path)
    .args([
        "chm",
        "--workspace", &workspace_path,
        "--temp", &temp_dir_path,         // temp/{ws}/chm
        "--output", &dist_output_path,    // dist/{ws}/output.chm
    ])
    .output()
    .map_err(|e| e.to_string())?;
```

## 6. 导出引擎（Python）

### 6.1 设计决策

**为什么用 Python 而不是 Rust 实现导出：**

1. 已有验证过的 `build-chm.py`（~550 行）可直接复用
2. Python 的 Markdown 渲染生态成熟（markdown-it-py、Pygments）
3. 未来扩展 PDF、EPUB 导出时 Python 生态更丰富
4. 通过 PyInstaller 编译为独立二进制，无需用户安装 Python

**为什么不用 hhc.exe / chmcmd：**

参考实现中已有纯 Python CHM 二进制写入器（ITSF header → ITSP directory → PMGL entries → content DATA），不依赖任何外部编译器。

### 6.2 引擎结构

```
export-engine/
├── engine.py                ← 统一入口
├── chm_writer.py            ← CHM 二进制写入器（改编自 build-chm.py）
├── html_renderer.py         ← Markdown → HTML 渲染（markdown-it-py + pygments）
├── nginx_builder.py         ← nginx 静态站生成（改编自 build-nginx.sh）
├── templates/
│   └── page.html            ← HTML 页面模板
├── requirements.txt         ← markdown-it-py, pygments
└── build.sh                 ← PyInstaller 打包脚本
```

### 6.3 统一入口

```bash
# CHM 导出
./export-engine chm --workspace /path/to/ws --output /path/to/out.chm

# Nginx 部署包导出
./export-engine nginx --workspace /path/to/ws --output /path/to/dist

# 单章节 HTML 导出
./export-engine html --workspace /path/to/ws --chapter 02-architecture --output /path/to/out
```

### 6.4 CHM 导出流程

改编自 `build-chm.py`，主要变更：

| 原版（build-chm.py） | 新版（engine.py --mode chm） |
|---------------------|----------------------------|
| 硬编码 `_sidebar.md` | 从 `SUMMARY.md` 读取（格式兼容） |
| 硬编码 `screenshots/` | 通配 `assets/` 目录，拷贝 `*.png, *.svg, *.jpg` |
| 固定 `PROJECT_NAME` | 从 `workspace.json` 读取 `title` |
| 单层级目录 | 适配多层级章节文件夹（`01-xxx/`） |
| HTML 无导航 | 生成的 HTML 带侧边栏导航 |
| 空的 .hhk 索引 | 从 h2/h3 标题自动提取索引关键词 |
| 不过滤 .drawnix | 导出时跳过 `.drawnix` 源数据文件 |

CHM 二进制写入关键流程（纯 Python，不依赖 hhc）：

```python
def compile_chm_binary(html_dir, output_path):
    # 1. 收集所有 HTML 和资源文件
    # 2. 构建 UTF-16LE 名称表
    # 3. 构建 PMGL 条目（每个文件 16 字节）
    # 4. 写入 ITSF Header（版本 4，中文语言 0x0804）
    # 5. 写入 ITSP Directory Section
    # 6. 写入 PMGL 块（4096 字节对齐）
    # 7. 写入内容数据
```

### 6.5 Nginx 部署包导出流程

改编自 `build-nginx.sh`，主要变更：

| 原版（build-nginx.sh） | 新版（engine.py --mode nginx） |
|----------------------|-------------------------------|
| Bash 脚本 | Python 实现 |
| 硬编码文件夹列表 | 解析 SUMMARY.md 自动发现 |
| `_sidebar.md` | `SUMMARY.md`（docsify 天然兼容） |
| curl 下载 CDN | 启动时预下载 / 使用 bundled vendor |
| 固定项目标题 | 从 `workspace.json` 注入 |
| 不生成配置文件 | 自动生成 `nginx.conf` + `docker-compose.yml` |

导出目录结构：

```
dist/
├── index.html                ← docsify 壳页面
├── SUMMARY.md                ← docsify 侧边栏
├── 01-getting-started/
│   ├── index.md
│   └── assets/
├── 02-architecture/
│   ├── index.md
│   ├── api-overview.md
│   └── assets/
│       └── *.svg, *.png      ← 只拷贝渲染产物，不含 .drawnix
├── assets/                   ← workspace 级共享资源
├── vendor/                   ← 离线化 docsify 依赖
│   ├── css/
│   └── js/
├── nginx.conf                ← 预生成 nginx 配置
└── docker-compose.yml        ← 预生成 Docker 配置
```

SUMMARY.md 的 `# 标题行` 会被 docsify 自动忽略，因此 `SUMMARY.md` 天然兼容 docsify 的 `loadSidebar`。

### 6.6 导出资源过滤规则

```python
# 导出时只拷贝这些扩展名
EXPORT_EXTENSIONS = {'.md', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.css', '.js', '.html'}
# 跳过 .drawnix（白板源数据，仅用于再编辑，不需要分发）
```

## 7. 前后端数据流总览

```
用户操作                    前端                        Rust
─────────────────────────────────────────────────────────────────
打开 workspace        →  invoke('open_workspace', path)
                                                    → 校验 + 自动修复
                                                    → 扫描目录
                                                    → 解析 SUMMARY.md
                                                    ← 返回 WorkspaceInfo
                      ←  更新 workspaceStore
                      →  invoke('read_all_md_files', path)
                                                    → 读取所有 .md 内容
                      ←  构建 MiniSearch 搜索索引

点击文件树节点         →  invoke('read_file', path)
                                                    → 读取文件内容
                                                    ← 返回 content string
                      ←  根据 .md/.drawnix 切换编辑器

编辑 markdown         →  防抖 1s 后
                      →  invoke('save_file', path, content)
                                                    → 写入磁盘
                      →  更新搜索索引中对应文档

触发画图(/wb)          →  记录锚点信息
                      →  切换到白屏全屏模式
                      →  <Drawnix /> 渲染

白板保存并插入         →  invoke('save_drawnix', path, data, svg)
                                                    → 写入 .drawnix + .svg
                      ←  返回保存路径
                      →  invoke('read_file', source_md_path)
                      →  在光标位置插入 ![img-001](./assets/xxx.svg)
                      →  invoke('save_file', path, updated_content)
                      →  切换回 markdown 编辑器

浏览资源              →  invoke('list_assets', chapter_path)
                                                    → 读取 assets/ 目录
                                                    ← 返回 AssetInfo[]
                      ←  渲染 AssetsPanel
                      →  点击 .drawnix → 进入白板编辑
                      →  点击图片 → AssetLightbox 全屏预览

全文搜索 (Ctrl+K)     →  searchIndex.search(query)
                      ←  MiniSearch 内存查询，< 50ms
                      →  点击结果 → invoke('read_file', path)
                      →  跳转到匹配位置

导出 PDF (Ctrl+P)     →  vditor.getHTML()
                      →  注入隐藏 iframe + 打印样式
                      →  iframe.contentWindow.print()
                      →  系统打印对话框 → 用户选择保存 PDF

导出 CHM/nginx        →  invoke('export_chm/nginx', workspace)
                                                    → 预清理 temp/{ws}/
                                                    → 启动 Python 子进程
                                                    → 中间文件 → temp/{ws}/
                                                    → 最终产物 → dist/{ws}/
                                                    → 清理 temp/{ws}/
                      ←  弹出保存对话框
                      →  用户选择路径 → 复制 dist/{ws}/ 到用户路径
```

## 8. 与外部编辑器的兼容性

workspace 使用标准文件系统结构，其他工具可直接使用：

- **Typora** — 直接打开 workspace 目录，`./assets/` 相对路径引用图片正常工作
- **VS Code** — 可作为普通文件夹打开，Markdown 预览正常
- **Git** — 整个 workspace 可纳入版本控制

Rust 侧通过文件监听（`notify` crate）检测外部编辑器的修改，自动同步到前端。

## 9. 测试策略

### 9.1 核心问题

Tauri 前后端是两个进程，IPC 不是 HTTP 请求，DevTools Network 面板看不到。如果每次改动都要 `cargo build` 编译完整 Tauri 应用再测试，效率极低，也无法有效利用 AI coding agent 的快速迭代能力。

解决方案：**在 IPC 边界切一刀，前后端独立开发、独立测试，仅关键路径做全链路验证。**

### 9.2 分层测试金字塔

```
                   ┌──────┐
                   │ E2E  │  ← npm run tauri dev + Playwright
                   │  少量 │     仅验证关键路径，发布前跑
                 ┌─┴──────┴─┐
                 │ 契约测试  │  ← TypeScript 类型 ↔ Rust 返回类型
                 │  确保对齐  │     CI 自动运行
               ┌─┴──────────┴─┐
               │  独立单元测试  │
               │ 前端 mock IPC │  ← Vitest，毫秒级
               │ 后端纯函数    │  ← cargo test，秒级
               └──────────────┘
```

日常开发 95% 的时间在单元测试层，5% 的时间做全链路验证。

### 9.3 IPC 抽象层 — mock 与真实切换的关键

**所有 `invoke()` 调用统一走 `invokeIPC()` 代理函数。** 这是整个测试策略的基石，确保 mock 和真实切换只改一处。

```typescript
// services/ipc.ts

const isTauri = '__TAURI_INTERNALS__' in window;

export async function invokeIPC<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  if (isTauri) {
    // 正式环境：调用真实 Tauri IPC
    return invoke<T>(command, args);
  }
  // 开发/测试环境：走 mock
  return mockIPC<T>(command, args);
}
```

> **重要：正式打包（`npm run tauri build`）时，`__TAURI_INTERNALS__` 一定存在，
> 所有调用走真实 `invoke()`，mock 代码不会被执行。
> 这是 Tauri 运行时注入的全局变量，不存在于普通浏览器环境。**

Mock 实现：

```typescript
// services/mockIPC.ts

const mockData: Record<string, (args: any) => any> = {
  open_workspace: () => ({
    rootPath: '/mock/workspace',
    workspaceMeta: { title: '测试文档', author: 'dev', language: 'zh-CN' },
    summary: [
      { title: '入门指南', path: '01-intro/index.md', level: 1 },
      { title: '系统架构', path: '02-arch/index.md', level: 1 },
    ],
  }),

  read_file: ({ path }) => {
    if (path.includes('index.md'))
      return '# 入门指南\n\n这是模拟的 Markdown 内容。\n\n## 快速开始\n\n一些文字...';
    return '# 测试文档';
  },

  save_file: () => undefined,
  get_next_image_index: () => 3,
  list_assets: () => [
    { name: 'index-img-001.svg', size: 12000, type: 'svg' },
    { name: 'index-img-002.png', size: 45000, type: 'png' },
  ],
  read_all_md_files: () => [
    { path: '01-intro/index.md', content: '# 入门指南\n\n## 快速开始\n\n一些文字...' },
    { path: '02-arch/index.md', content: '# 系统架构\n\n架构说明...' },
  ],
};

function mockIPC<T>(command: string, args?: any): Promise<T> {
  const handler = mockData[command];
  if (!handler) {
    console.warn(`[Mock] 未实现的命令: ${command}`);
    return Promise.resolve(undefined as T);
  }
  return new Promise(resolve =>
    setTimeout(() => resolve(handler(args) as T), 50 + Math.random() * 100)
  );
}
```

### 9.4 前端独立开发

```bash
# 纯前端开发，不需要 Rust，不需要 cargo build
npm run dev          # Vite HMR 热更新，<1s 反馈

# 前端单元测试
npx vitest           # 毫秒级反馈
```

AI agent 修改前端代码时完全不需要 Rust 工具链，mock 层提供逼真的返回数据。

### 9.5 Rust 独立测试

每个 `#[tauri::command]` 本质是普通 async 函数，脱离 Tauri 也能测：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_save_file_creates_file() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("test.md");

        save_file(path.to_str().unwrap().into(), "hello".into())
            .await
            .unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "hello");
    }

    #[tokio::test]
    async fn test_validate_workspace_json_missing_fields() {
        let json = r#"{"title": "test"}"#;
        let meta = validate_workspace_json(json).unwrap();
        assert_eq!(meta.language, Some("zh-CN".into())); // 默认值补全
    }

    #[test]
    fn test_validate_corrupted_json() {
        assert!(validate_workspace_json("not json").is_err());
    }
}
```

```bash
cargo test           # 秒级反馈，不需要前端
```

### 9.6 契约测试

确保前后端的 IPC 类型定义一致（CI 自动运行）：

```typescript
// tests/ipc-contracts.test.ts

describe('IPC Contract Tests', () => {
  it('open_workspace returns correct shape', async () => {
    const result = await invokeIPC<WorkspaceInfo>('open_workspace', {
      path: testWorkspacePath,
    });

    expect(result).toHaveProperty('rootPath');
    expect(result).toHaveProperty('workspaceMeta.title');
    expect(Array.isArray(result.summary)).toBe(true);
  });
});
```

### 9.7 全链路 E2E（仅关键路径）

仅 CI 或发布前运行，不在日常开发中使用：

```bash
npm run tauri dev &
npx playwright test
```

### 9.8 调试工具链

```
开发阶段：
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
前端：
  ├─ invokeIPC() 代理             → IPC 调用自动记录到 Console
  ├─ Chrome DevTools（F12）        → 断点、Network、Elements
  └─ React DevTools               → 组件状态检查

Rust 侧：
  ├─ tracing + #[instrument]      → 终端彩色日志，带命令名/耗时
  └─ RUST_LOG=debug               → 控制日志级别

运行方式：
  npm run tauri dev
  → 终端看 Rust 日志
  → F12 看前端日志
```

### 9.9 AI Agent 工作流

```
前端 Agent（不需要 Rust 工具链）：
  npm run dev          ← 纯 Vite + mock IPC
  修改 React 组件      ← HMR 即时生效
  npx vitest          ← 毫秒级反馈

Rust Agent（不需要前端）：
  cargo test           ← 秒级反馈
  修改 command 逻辑    ← cargo test 验证
  cargo clippy         ← 静态检查

集成 Agent（仅关键节点）：
  npm run tauri dev    ← 完整 Tauri，验证 IPC 联通
```
