# sy-note-books (书昀笔记电子书)

桌面笔记应用，面向技术写作者，提供 workspace 级知识管理、Typora 级 Markdown 编辑、白板画图、一键导出。

## 技术栈

- Tauri 2.x + React 19 + Vite 8.x
- Zustand 5.x 状态管理
- Tailwind CSS 4.x
- Vditor（IR 模式）Markdown 编辑器
- Drawnix 白板画图
- MiniSearch 7.x 全文搜索
- Node.js v25.9.0

## 开发环境

- **OS**: RHEL 9.7（webkit2gtk-4.1 不可用，Tauri 2 无法在本机编译运行）
- **容器**: Docker CE 已安装，用于 Tauri 全量编译/集成测试
- **包管理**: pnpm

## 开发命令

```bash
# 前端（本机直接运行，不需要 Rust）
pnpm dev              # 纯前端开发（mock IPC）
pnpm test             # 前端 Vitest 测试
pnpm run test:watch   # 前端测试 watch 模式

# Rust 业务逻辑（本机直接运行，不依赖 Tauri/webkit）
cd src-tauri/core && cargo test    # core crate 单元测试
cd src-tauri/core && cargo check   # core crate 类型检查

# Tauri 全量编译/测试（需要 Docker Fedora 容器）
pnpm docker:test           # cargo test --workspace（Docker 容器内）

# E2E 测试（需要 Docker Fedora 容器）
pnpm test:e2e              # 智能构建 Docker 镜像 + 编译 + 运行 E2E 测试
pnpm test:e2e:nobuild      # 跳过镜像构建，直接运行 E2E 测试
./scripts/e2e-docker.sh --spec 07   # 仅运行匹配 07 的 spec 文件
./scripts/e2e-docker.sh --clean     # 清理缓存卷，下次从头安装

# Docker 镜像管理
pnpm docker:build          # 构建 deps 镜像（含依赖缓存预热）
pnpm docker:build:base     # 仅构建 base 镜像（系统包 + 工具链）
pnpm docker:clean          # 清理缓存卷 + 删除 deps 镜像
```

## 项目结构

```
src/                    ← 前端代码
├── components/         ← UI 组件（sidebar, editor, search, whiteboard, export）
├── stores/             ← Zustand stores（workspace, editor, settings）
├── services/           ← IPC 封装（fileService, workspaceService, exportService）
├── hooks/              ← 自定义 hooks
└── types/              ← TypeScript 类型定义

src-tauri/              ← Rust 后端（Cargo workspace）
├── core/               ← 业务逻辑 crate（不依赖 Tauri，本机可测）
│   └── src/
│       ├── models/     ← 数据模型（workspace, file_tree）
│       └── services/   ← 业务逻辑（SUMMARY 解析、workspace 校验、图片编号）
├── src/                ← Tauri 壳层（command 函数，调用 core）
│   ├── lib.rs          ← Tauri command 注册
│   └── main.rs         ← 入口
├── Cargo.toml          ← workspace 根（依赖 Tauri）
└── core/Cargo.toml     ← core crate（仅依赖 serde，本机可编译）

design/                 ← 全局设计产出物（开发前一次性完成）
├── design-system.md    ← 静态设计系统（配色/字体/间距/组件风格）
├── interaction/        ← 交互设计（Mermaid 图表渲染为 HTML）
│   ├── global.html     ← 视图状态机 + 快捷键体系 + 主题切换
│   ├── workspace.html  ← 打开/校验/修复流程 + 文件树状态机 + 章节 CRUD
│   ├── editor.html     ← IR 渲染交互 + 自动保存时序 + 图片预览
│   ├── whiteboard.html ← 模式切换状态机 + 保存插入 + 双击编辑
│   ├── search.html     ← 搜索全链路 + 索引更新 + 结果展示规则
│   └── export.html     ← 导出流程 + 版本管理 + 错误处理
├── prototypes/         ← 可点击 HTML 原型（Tailwind 渲染）
│   ├── shared.css      ← 共享设计系统 CSS
│   ├── 00-overview.html
│   ├── 01-welcome.html
│   ├── 02-file-tree.html
│   ├── 03-editor.html
│   ├── 04-whiteboard.html
│   ├── 05-search.html
│   └── 06-export.html
└── api-contract.md     ← IPC 接口契约（TS 类型 + Rust 签名）

e2e-tests/              ← E2E 测试（WebDriverIO + tauri-driver）
├── wdio.conf.ts        ← WebDriverIO 配置
├── helpers/            ← 选择器、操作、夹具
└── specs/              ← 9 个功能域的测试用例
    ├── 01-welcome      ← 欢迎页 UI
    ├── 02-sidebar      ← 侧边栏交互
    ├── 03-file-tree    ← 文件树 CRUD
    ├── 04-whiteboard   ← 白板画图
    ├── 05-search       ← 全局搜索
    ├── 06-export       ← 导出
    ├── 07-ipc          ← IPC 直连（真实 Rust 后端）
    ├── 08-integration  ← 跨功能联动
    └── 09-performance  ← 性能基准

scripts/                ← 构建和测试脚本
└── e2e-docker.sh       ← Docker 内运行 E2E 测试（含智能重建 + 缓存卷）
```

## 开发流程

```
A. 全局设计（一次性）   →  UI 设计 + 交互设计 + 接口契约
B. 分功能开发（逐 Phase）→  Phase 0→1→2→3→4→5 各自：代码开发 + 单元测试
C. 集成测试（统一）     →  全链路联通验证
D. 编译打包（最后）     →  跨平台构建
```

### A. 全局设计阶段使用的工具

| 步骤 | 工具 | 产出 |
|------|------|------|
| 静态 UI 设计 | ui-ux-pro-max-skill（全局 skill） | design/prototypes/*.html（视觉外观参考） |
| 交互设计 | /design-interaction, /map-states, /error-flow + 22 个项目 skills | design/interaction/*.html（状态机 + 流程 + 快捷键 + 错误处理） |
| 接口契约 | 参照 tech-design.md | design/api-contract.md |

### B. 逐功能开发流程（每个 Phase 内部）

每个 Phase 严格按以下循环执行，不允许跳过测试直接进入下一功能：

```
1. 从 interaction/*.html 提取本功能的所有交互点 → 生成功能测试用例 checklist
2. 开发单个功能
3. 编写并运行功能测试（必须通过）
4. 下一功能 → 回到步骤 1
5. 本 Phase 全部功能完成 → 进入下一个 Phase
```

### C. 测试分层策略

**环境约束：** RHEL 9 缺少 webkit2gtk-4.1，Tauri 无法在本机运行。采用三层测试策略：

#### Layer 1: 本机日常测试（AI 每次改动后自动跑，覆盖 ~80% 业务逻辑）

```bash
pnpm test                             # 前端 Vitest（组件、Store、工具函数）
cd src-tauri/core && cargo test       # Rust core crate（业务逻辑，不依赖 Tauri）
pnpm dev                              # 浏览器验证 UI 交互
```

速度：秒级。无外部依赖。**AI 开发过程中主要使用此层。**

#### Layer 2: Docker Fedora 容器（Phase 结束时跑一次，验证 IPC 打通）

```bash
# 首次需构建镜像（一次性，约 10-15 分钟）
pnpm docker:build:base     # base 镜像（系统包 + Rust + Node + tauri-driver）
pnpm docker:build          # deps 镜像（base + pnpm store + cargo registry 预热）

# 全量测试
pnpm docker:test
```

速度：首次分钟级（构建镜像），后续秒级（镜像缓存）。

#### Layer 3: E2E 测试（Phase 0-5 全部完成后）

- **WebDriverIO + tauri-driver** 跑关键用户流程（非 Playwright）
- 需 Tauri 运行时（Docker Fedora 容器内执行）
- IPC 走真实 Rust 后端，非 mock
- 测试套件在 `e2e-tests/` 目录，9 个 spec 文件，173 个测试用例
- 运行命令：`pnpm test:e2e`（智能构建镜像 + 编译 Tauri + 运行测试）

**E2E 测试分层结构：**
- **UI 层**（01–06 spec）：验证用户交互、视图状态机、DOM 结构
- **IPC 层**（07 spec）：通过 `browser.execute()` 直连 Rust 后端，验证文件系统操作、数据解析、CRUD 持久化、导出输出路径
- **集成层**（08 spec）：跨功能联动验证（Workspace→Editor→Search、Editor→Whiteboard→Editor 等）
- **性能层**（09 spec）：大文件编辑（5k/10k 行）和复杂搜索（50/100 文件）性能基准
- IPC 层的核心价值：前端单元测试用 mock IPC，E2E 的 IPC 层验证真实 Rust 后端返回值

**Docker 镜像体系：**

| 镜像 | 大小 | 内容 | 重建时机 |
|------|------|------|----------|
| `synote-tauri:base` | 3.12GB | Fedora 41 + 系统包 + Rust + Node + pnpm + tauri-driver + WebKitWebDriver | 系统包/Rust/Node 版本变更 |
| `synote-tauri:deps` | 4.59GB | base + 预热 pnpm store + cargo registry | package.json/Cargo.toml/patches 变更 |

**缓存加速机制：**

通过 Docker 命名卷持久化依赖缓存，warm 状态下总耗时从 ~8.5 分钟降至 ~4 分钟：

| 步骤 | 冷启动 | warm（命中缓存） |
|------|--------|-----------------|
| pnpm install (root) | 86s | **5s** |
| pnpm install (e2e) | 20s | **0s** |
| cargo build | 156s | **21s** |
| 测试执行 | 240s | 240s |

| 命名卷 | 挂载路径 | 用途 |
|--------|---------|------|
| `synote-pnpm-store` | `/root/.local/share/pnpm/store` | pnpm 包缓存（硬链接，免下载） |
| `synote-cargo-target` | `/opt/cargo-target` | Rust 编译产物（增量编译） |

**智能重建：** `e2e-docker.sh` 自动对比 `package.json`/`pnpm-lock.yaml`/`Cargo.toml`/`patches/` 的 hash，仅在依赖变更时重建 deps 镜像，源码变更不触发重建。

**Rust 代码组织原则：**
- 所有业务逻辑（解析、校验、计算、文件操作）放 `src-tauri/core/` crate，**禁止依赖 Tauri**
- `src-tauri/src/lib.rs` 的 command 函数只做参数透传，调用 core 的 service 函数
- 新增 Rust 功能必须先在 core crate 写测试并通过，再写 command 层

**开发阶段测试范围：**
- 测试用例来源：`design/interaction/*.html` 中的状态转换、操作流程、UI 表现
- 只做功能测试，不做性能测试、压力测试、安全测试、鲁棒性测试

**集成测试阶段（Phase 0-5 全部完成后）：**
- 跨功能联动验证
- 性能测试
- 错误恢复 / 鲁棒性测试
- 安全审计

### D. 各 Phase 重点使用的 Skills

| Phase | 重点 Skills | 状态 |
|-------|------------|------|
| Phase 0（骨架） | layout-grid, spacing-system, typography-scale, visual-hierarchy | ✅ 已完成 |
| Phase 1（Workspace） | navigation-patterns, state-machine, feedback-patterns | 待开始 |
| Phase 2（编辑器） | doherty-threshold, loading-states | 待开始 |
| Phase 3（白板） | state-machine, gesture-patterns, micro-interaction-spec | 待开始 |
| Phase 4（搜索） | search-ux, millers-law, hicks-law | 待开始 |
| Phase 5（导出） | loading-states, error-handling-ux, feedback-patterns | 待开始 |

## 关键约定

- **IPC 代理**：所有 `invoke()` 调用必须通过 `invokeIPC()` 代理函数，禁止直接调用
- **Mock IPC**：前端可脱离 Rust 独立运行，mock 层提供逼真数据
- **Rust core crate 隔离**：所有 Rust 业务逻辑放 `src-tauri/core/`，该 crate 不依赖 Tauri，确保 `cd src-tauri/core && cargo test` 在 RHEL 9 本机可运行
- **名称约定**：英文品牌名 `sy-note-books`，中文品牌名 `书昀笔记电子书`，所有 UI 文案、窗口标题、配置文件使用对应名称
- **测试要求**：Rust 后端每个 service 函数必须有独立单元测试（`cargo test`），前端使用 Vitest（单元测试）+ WebDriverIO（E2E 测试）
- **逐功能开发**：每个 Phase 内逐功能开发，单个功能测试通过后才进入下一功能，禁止跳过测试
- **测试聚焦**：开发阶段只做功能测试（基于交互设计），性能/鲁棒性/安全测试留到集成测试阶段
- **不可变数据**：遵循不可变数据模式，不直接修改状态对象
- **设计先行**：先完成全局设计（UI + 交互 + 接口契约），再分 Phase 开发
- **代码质量**：遵循 Karpathy Guidelines（项目 rule，自动生效）

## Vditor IR 模式：光标行号定位方案

在白板「保存并插入」流程中，需要将 Vditor IR 模式的光标位置映射到 Markdown 源码行号。以下是踩坑总结，避免重蹈覆辙。

### 正确方案（当前实现）

**原理**：Vditor IR 模式为每个块元素添加 `data-block` 属性。通过计数光标所在 block 的前驱 `data-block` 兄弟数得到 `blockIndex`，再映射到 `fileContent` 的非空行序号，得到精确行号。

```
data-block 计数 (blockIndex) → fileContent 非空行映射 → 1-based 行号
```

**关键**：行号映射必须使用 `editorStore.fileContent`（与插入逻辑同一数据源），不能用 `vditor.getValue()`。两者尾部换行等细节可能不一致，导致行号偏差。

**插入逻辑**：
- 非最后行文本 → 插入该行之后（`cursorIdx + 1`）
- 最后行文本 → 追加到文档末尾（`lines.length`），避免行号映射偏差
- 空行 → 直接插入该空行位置（`cursorIdx`）

### 已验证的错误方案（禁止使用）

1. **DOM TreeWalker 计数换行符**：IR 模式文本节点间无 `\n`，永远返回 1
2. **editorRoot 直接子元素计数**：IR DOM 有中间 wrapper（如 `.vditor-reset`），wrapper 无兄弟元素，永远返回 1
3. **文本内容匹配（向上遍历 DOM）**：从 focusEl 向上遍历，用 `textContent` 匹配 markdown 行。当上溯到包含多行文本的父元素时，`includes()` 会错误匹配第一行。限制遍历层级和长度约束均不可靠
4. **`vditor.getValue()` 做行号映射**：与 `editorStore.fileContent` 行数可能不一致（尾部换行差异），导致空行场景下 cursorPosition 指向错误位置
5. **off-by-one 错误**：非空行计数映射时，必须在确认当前行非空后才检查 `contentIdx === blockIndex`（先计数再检查会跳过目标行）

## Drawnix 白板画图：集成踩坑总结

Drawnix 基于 Plait 框架（`@plait/core`、`@plait/draw`、`@plait/mind`、`@plait/common`），通过 WeakMap 维护 Board 实例与 DOM/工具对象的映射。集成时遇到三类问题，均通过 `pnpm patch` 修复（补丁在 `patches/` 目录，由 `pnpm-lock.yaml` 管理，其他开发者 `pnpm install` 自动应用）。

### 1. Vite 预构建 WeakMap 重复实例（根因）

**现象**：绘制时报 `Cannot read properties of null (reading 'curve')`（`getRoughSVG`）和 `can not resolve element map`（`KEY_TO_ELEMENT_MAP`）。

**原因**：Vite 预构建为不同入口创建独立的 `@plait/core` 副本，每个副本有自己的 WeakMap 实例。Board 组件在一个副本中设置 WeakMap（`BOARD_TO_HOST` 等），插件从另一个副本读取，读不到。

**修复**（`vite.config.ts`）：
```ts
resolve: {
  dedupe: ['@plait/core', '@plait/common'],
},
optimizeDeps: {
  include: [
    '@plait/core', '@plait/common', '@plait/draw', '@plait/mind',
    '@plait/text-plugins', '@plait/layouts',
    '@plait-board/react-board', '@plait-board/react-text',
    '@drawnix/drawnix',
  ],
},
```

**验证方法**：检查 `.vite/deps/` 中的预构建产物，`react-board-*.js` 应有 0 个 WeakMap 声明，全部从共享的 `plait-core-*.js` 导入。

### 2. Board WeakMap 未初始化时的空指针崩溃

**现象**：进入白板立即报 `Cannot read properties of null/undefined (reading 'classList')`。

**原因**：Board 组件在 `useEffect` 中设置 WeakMap（`BOARD_TO_HOST`、`BOARD_TO_ROUGH_SVG` 等），但事件监听器在渲染时已注册。React effect 执行顺序：child `useLayoutEffect` → parent `useLayoutEffect` → child `useEffect`（Board 设置 WeakMap）→ parent `useEffect`。`useEffect` 之前的事件触发时 WeakMap 尚未设置。

**修复**（两层防护）：

1. **事件阻断**（`WhiteboardFullscreen.tsx`）：用 `useLayoutEffect` + `useRef`（非 `useState`）在 Board `useEffect` 之前拦截所有 pointer/keyboard 事件。`useRef` 保证同步读取 ready 状态，`useLayoutEffect` 保证在 child `useEffect` 之前注册。
2. **空指针防护**（`pnpm patch` 四个包）：对 `PlaitBoard.getBoardContainer(board)?.classList?.add()` 等调用添加可选链，`getRoughSVG`/`getHost` 返回 null 时提前 return。覆盖 `@plait/core`、`@plait/draw`、`@plait/mind`、`@plait/common` 四个包。

### 3. Slate ReactEditor 退出文本编辑时的 DOM 节点错误

**现象**：退出 Drawnix 文本编辑后报 `Cannot resolve a DOM node from Slate node`。

**原因**：退出文本编辑时 `readonly` 从 false 变为 true，触发 `ReactEditor.blur()`。此时文本组件的 React root 已卸载，DOM 节点不存在。

**修复**（`pnpm patch @plait-board/react-board`）：在 `update` 函数中用 try-catch 包裹 `S.blur()` 和 `S.deselect()` 调用。

### 已验证的错误修复方式（禁止使用）

1. **代理对象（Proxy）替代 null 返回值**：为 `getHost()`/`getRoughSVG()` 返回 no-op Proxy 对象。看似安全但 Proxy 被存入 Drawnix 内部状态，导致后续 `appendChild` 等真实操作失败，引发更严重的连锁崩溃。正确做法是返回 `null` + 调用方 optional chaining
2. **`useEffect` 注册事件阻断**：parent `useEffect` 在 child `useEffect` 之后执行，无法在 Board 设置 WeakMap 之前拦截事件。必须用 `useLayoutEffect`
3. **`useState` 标记 ready 状态**：`useState` 更新是异步的，阻断器无法同步读取 ready 值。必须用 `useRef`

## 设计文档

- `sys-requirement.md` — 需求规格文档
- `tech-design.md` — 技术设计文档
- `design/` — 各阶段设计产出物
