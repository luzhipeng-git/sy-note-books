# 书昀笔记电子书（sy-note-books）

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Version](https://img.shields.io/badge/version-0.3.4-blue.svg)]()

> 面向技术写作者的桌面笔记应用　｜　v0.3.4

一款用 Markdown 写作、以「书本 / 章节」结构组织笔记的桌面应用。你的笔记不是一堆散乱文件，而是有目录、可导航、可导出成 **CHM 帮助文件 / 静态网站 / PDF** 的「电子书」。内置白板（Drawnix），可在笔记里画流程图、示意图并插入正文。

基于 **Tauri 2 + React 19 + Vite + Rust** 构建，跨平台支持 Windows / macOS / Linux。

---

## ✨ 功能特性

- **Workspace 即一本书**：以 workspace（目录）为单位组织知识，章节（子目录）+ 页面（`.md`）两级结构，自动维护 `SUMMARY.md` 目录树。
- **Typora 级 Markdown 编辑**：基于 Vditor 即时渲染（IR）模式，所见即所得；自动保存、浮动目录大纲、代码语法高亮。
- **白板画图（Drawnix）**：内置全屏画板，画完一键插入正文为可再编辑的矢量插图（`.drawnix` + `.svg` 成对保存）。
- **全局搜索**：基于 MiniSearch 的全文索引，支持「全部 / 文件名 / 内容」过滤与纯键盘导航。
- **多格式导出**：
  - **CHM** —— Windows 帮助文件（内置 `hhc`/`chmcmd` 编译器，SVG 自动转 PNG）。
  - **Nginx** —— 静态网站目录，可部署到任意 Web 服务器。
  - **PDF** —— 当前文件导出（矢量白板图嵌入）。
- **亮 / 暗主题**，侧边栏可折叠、宽度可拖拽，设置持久化。
- **自动更新**：内置 Tauri Updater，发布新版后应用内自动检测升级。

---

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Tauri 2 |
| 前端 | React 19、TypeScript、Vite、Tailwind CSS、Zustand |
| 编辑器 | Vditor（Markdown IR）|
| 白板 | Drawnix / Plait 画板引擎 |
| 搜索 | MiniSearch |
| 后端 | Rust（`sy-note-books` + `sy-note-books-core` workspace）|
| 导出 | pulldown-cmark、resvg、image、ironpress（PDF）|

---

## 📦 安装与运行

### 环境要求

- **Node.js** ≥ 18（推荐 20+）+ **pnpm**
- **Rust**（stable 工具链）+ Cargo
- Tauri 2 系统依赖：参见 [Tauri 官方 Prerequisites](https://tauri.app/start/prerequisites/)
  - Windows：WebView2（安装包会自动引导下载）
  - macOS：10.13+
  - Linux：webkit2gtk 等（见 `sys-requirement.md`）

### 开发模式

```bash
pnpm install
pnpm tauri dev
```

### 构建安装包

```bash
pnpm tauri build
```

产物在 `src-tauri/target/release/bundle/` 下（Windows 为 `nsis`/`msi`，macOS 为 `dmg`，Linux 为 `appimage`/`deb`）。

> 项目对部分 Plait / Drawnix 依赖打了补丁（见 `patches/`），`pnpm install` 会自动应用。

---

## 🚀 使用

1. 启动应用 → 欢迎页点 **新建 Workspace** 或 **打开文件夹**。
2. 新建章节 → 写笔记（自动保存）。
3. 需要画图时按 `Ctrl+Shift+D` 进入白板。
4. 用 `Ctrl+Shift+F` 搜索，`Ctrl+P` 导出。

📖 完整使用说明见 [`docs/user-manual/user-manual.md`](docs/user-manual/user-manual.md)。

---

## 📂 项目结构

```
my-note-book/
├── src/                    # 前端（React）
│   ├── components/         #   UI 组件（editor/whiteboard/search/export/sidebar/toolbar…）
│   ├── stores/             #   Zustand 状态管理
│   ├── services/           #   IPC 调用、白板/搜索等服务
│   └── types/              #   类型定义
├── src-tauri/              # Rust 后端
│   ├── src/                #   Tauri commands（IPC 入口）
│   ├── core/               #   核心库 sy-note-books-core（workspace/export/pdf 等纯逻辑）
│   ├── binaries/           #   内置 hhc/chmcmd（CHM 编译）
│   └── vendor/ironpress/   #   本地补丁版 ironpress（修复 PDF 图片丢失）
├── docs/                   # 文档（用户手册、安全审计报告）
├── skills/                 # AI agent 技能（knowledge-to-workspace）
├── e2e-tests/              # E2E 测试（WebDriverIO + tauri-driver，Docker 内运行）
├── patches/                # pnpm 依赖补丁
└── scripts/                # 构建/测试辅助脚本
```

---

## 🧪 测试

### 单元测试（Vitest）

```bash
pnpm test            # 前端
pnpm docker:test     # Rust 后端（在 Docker 内跑 cargo test）
```

### E2E 测试（WebDriverIO + tauri-driver）

在 Docker Fedora 容器内运行完整 Tauri 应用（真实 IPC，非 mock）：

```bash
pnpm docker:build    # 一次性构建镜像
pnpm test:e2e        # 构建应用 + 运行测试
# 或跳过镜像构建：
pnpm test:e2e:nobuild
```

详见 [`e2e-tests/README.md`](e2e-tests/README.md)。

> PDF 导出另有专门测试脚本：`pnpm docker:pdf-test`。

---

## 📖 更多文档

- [用户使用手册](docs/user-manual/user-manual.md)
- [AI 整理知识库成 workspace 的 Skill](skills/knowledge-to-workspace/SKILL.md)
- [系统依赖要求](sys-requirement.md)
- [技术设计](tech-design.md)
- [E2E 测试说明](e2e-tests/README.md)

---

## 📌 版本

当前版本 **0.3.4**。应用内置自动更新，发布新版后会自动检测升级。

---

## 📄 许可证

本项目基于 [MIT License](./LICENSE) 开源。

Copyright (c) 2026 luzhipeng-git
