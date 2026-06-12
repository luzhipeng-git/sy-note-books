# SelfNote — 需求规格文档

> 版本: 1.0 | 日期: 2026-05-18

## 1. 产品概述

### 1.1 背景

日常使用 Typora 编写 Markdown 技术文档和笔记，Typora 适合单文件编写，但缺乏以下能力：

- 多文件的 workspace 级组织管理
- 一键导出为 CHM 电子书或 nginx 部署包
- 集成白板画图能力

### 1.2 产品定位

一款面向技术写作者的桌面应用，提供：

1. **workspace 级知识管理** — 按目录组织文件夹和文件
2. **Typora 级别的 Markdown 编辑体验** — 所见即所得的即时渲染
3. **集成白板画图** — 类似 Drawnix 的自由绘制能力
4. **一键导出** — CHM 电子书（离线分发）和 nginx 部署包（在线发布）

### 1.3 目标用户

- 技术文档编写者
- 需要编写和整理大量 Markdown 笔记的开发者
- 需要将文档打包为电子书或部署为文档站点的团队

## 2. 功能需求

### 2.1 Workspace 管理

#### 2.1.1 创建与打开

- 支持创建新 workspace（选择目录、填写标题和作者信息）
- 支持打开已有 workspace（选择包含 workspace.json 的目录）
- 记住最近打开的 workspace 列表

#### 2.1.2 视图状态

应用有三种视图状态，通过 `activeEditorType` 和 `rootPath` 组合控制：

| 状态 | rootPath | activeEditorType | 右侧显示 |
|------|----------|-----------------|----------|
| 欢迎页 | null | empty | Workspace 管理界面（新建/打开/最近列表） |
| 空白编辑 | 有值 | empty | 空白提示「从左侧选择一个文件开始编辑」 |
| 编辑中 | 有值 | markdown | Markdown 编辑器 |

状态切换：
- 欢迎页 → 空白编辑：打开 workspace（点击最近列表、打开文件夹、新建 workspace）
- 空白编辑 → 编辑中：点击文件树中的文件
- 编辑中 → 空白编辑：关闭当前文件（点击文件树中的空白区域）
- 空白编辑/编辑中 → 欢迎页：点击 Sidebar 头部的 `←` 返回按钮

#### 2.1.3 关闭 Workspace

- Sidebar 标题前有 `←` 返回按钮，点击关闭当前 workspace
- 关闭后清除所有 workspace 状态（rootPath、fileTree、activeFilePath、编辑器内容）
- 返回欢迎页，可重新选择或创建 workspace

#### 2.1.4 Sidebar 折叠/展开

- Sidebar 头部有 `◀` 折叠按钮，点击后侧边栏收缩为 42px 的图标条
- 折叠状态下显示：
  - `▶` 展开按钮（点击恢复完整侧边栏）
  - `🌐` 返回 Workspace 管理按钮
  - 分隔线
  - 章节文件夹图标（最多 5 个，hover 显示章节名）
- 折叠时隐藏 resize handle 和文件树文字内容
- 展开/折叠有 200ms 平滑过渡动画
- 折叠状态通过 `settingsStore.sidebarCollapsed` 持久化

#### 2.1.5 文件树导航

- 左侧边栏展示文件树，结构由 SUMMARY.md 定义
- 文件树**不展示**系统文件（SUMMARY.md、workspace.json、workspace 级 assets/），用户只看到章节和文档
- 文件树支持折叠/展开
- 点击文件在右侧编辑区打开
- 当前编辑文件在文件树中高亮
- 面包屑显示当前文件路径

#### 2.1.6 章节管理

- 支持新建章节（自动创建文件夹、index.md、assets/ 目录）
- 支持在章节内新建子页面
- 支持拖拽调整章节顺序（重命名文件夹前缀序号）
- 新建/删除章节后自动更新 SUMMARY.md

### 2.2 Markdown 编辑

#### 2.2.1 编辑器体验

- 采用 Vditor 的 IR（Instant Rendering）模式，实现 Typora 级别的即时渲染：
  - 光标所在位置显示原始 Markdown 语法
  - 光标移走后，语法立即被渲染为富文本
  - 单栏编辑，无分栏预览
- 支持完整的 CommonMark + GFM 规范

#### 2.2.2 图表支持

通过 Mermaid 语法支持以下图表（Vditor 内置）：

- 流程图、时序图、甘特图、类图、状态图、ER 图、饼图
- 渲染结果为内联 SVG
- 支持明暗主题切换
- 额外支持：ECharts 数据图表、Graphviz、PlantUML、思维导图（Markmap）

#### 2.2.3 自动保存

- 编辑内容防抖 1 秒后自动保存到磁盘
- 保存时同步更新文件修改时间

### 2.3 白板画图

#### 2.3.1 触发方式

用户在编写 Markdown 时，通过以下任一方式进入白板：

- 快捷键 `Ctrl+Shift+D`
- 输入 `/wb` 后空格（类 Notion slash 命令）
- 点击工具栏画笔图标

#### 2.3.2 全屏画板交互（方案 C）

进入白板时采用全屏模式，具体交互流程：

**步骤 1 — 记录锚点：**
- 记录当前文件路径
- 记录当前光标位置（行号）
- 记录当前段落最近的标题文本

**步骤 2 — 全屏画板：**
- Drawnix 组件全屏渲染，获得完整画布空间
- 顶栏显示：「← 返回」按钮 + 「正在为『{最近标题}』段落绘制插图」提示
- 用户自由绘制（流程图、思维导图、自由画等）

**步骤 3 — 确认插入：**
- 用户点击「保存并插入」
- 画板数据保存为 `.drawnix` 文件 + 导出 `.svg` 缩略图
- 在 Markdown 光标位置自动插入引用：`![img-001](./assets/xxx.svg)`
- 光标恢复到锚点位置，切换回 Markdown 编辑器，继续写作

**步骤 4 — 编辑已有图：**
- Markdown 中已插入的图片悬停显示「双击编辑」提示
- 双击后进入全屏 Drawnix，加载已有 `.drawnix` 数据
- 编辑完成后保存，同步更新 `.svg`，Markdown 引用不变

**设计决策 — 为什么选全屏而非浮板/分栏：**

| 方案 | 画布空间 | 上下文可见 | 适合复杂图 | 实现复杂度 |
|------|---------|-----------|-----------|-----------|
| 浮板 A | 不够 | 部分 | 不适合 | 高 |
| 分栏 B | 拥挤 | 完全 | 勉强 | 高 |
| **全屏 C** | **充分** | **顶栏提示** | **适合** | **低** |

画图本身是模式切换（不同的认知活动），承认这个切换，给它完整的空间，比强行挤在一起体验更好。

#### 2.3.3 白板功能范围

基于 Drawnix 提供：

- 思维导图、流程图
- 画笔自由绘制
- 插入图片
- 撤销、重做、复制、粘贴
- 无限画布：缩放、滚动
- 导出为 SVG / PNG / JSON

### 2.4 Assets 静态资源预览

#### 2.4.1 编辑器内悬停预览

在 Markdown 编辑器中，鼠标悬停在图片引用（如 `![img-001](./assets/xxx.svg)`）上时，弹出预览浮层，无需跳转或切换视图。浮层支持：

- 显示图片内容（png、jpg、svg、gif）
- 缩放查看
- 点击浮层进入全屏预览

#### 2.4.2 文件树资源浏览

文件树的章节节点下提供「资源」入口，展开后可浏览该章节 assets/ 下的所有文件：

```
02-系统架构/
├─ 架构概览.md
├─ API 总览.md
├─ 📁 资源 (6)              ← 点击展开
│  ├─ index-img-001.svg     ← 点击预览大图
│  ├─ index-img-002.png     ← 点击预览大图
│  ├─ api-overview-img-001.drawnix  ← 点击进入白板编辑
│  └─ api-overview-img-002.png
```

支持的预览方式：

| 文件类型 | 预览方式 |
|---------|---------|
| `.png` `.jpg` `.jpeg` `.gif` | 图片预览（缩放、拖拽） |
| `.svg` | SVG 渲染预览 |
| `.drawnix` | 缩略图 + 点击进入白板编辑 |

### 2.5 全文搜索

#### 2.5.1 搜索入口

- 快捷键 `Ctrl+Shift+F` 唤起全局搜索框
- 搜索框位于页面顶部居中，支持即时搜索（输入即出结果）

#### 2.5.2 搜索范围

- 搜索 workspace 内所有 `.md` 文件的内容
- 搜索文件名和章节标题

#### 2.5.3 搜索结果展示

- 按相关度排序
- 显示匹配片段并高亮关键词
- 展示文件路径面包屑（如「系统架构 > API 总览」）
- 点击搜索结果打开对应文件并跳转到匹配位置

#### 2.5.4 中文支持

- 支持中文分词搜索（不要求精确匹配整词）
- 支持模糊搜索

### 2.6 导出

#### 2.6.1 CHM 电子书导出

- 一键导出整个 workspace 为 CHM 文件
- CHM 包含完整的目录树导航和搜索索引
- 编译不依赖 hhc.exe，使用纯 Python ITSF 二进制写入
- 支持单章节导出为独立 CHM

#### 2.6.2 Nginx 部署包导出

- 一键导出整个 workspace 为 nginx 可部署的静态站点
- 使用 docsify 客户端渲染 Markdown
- 所有 CDN 依赖离线化，无需联网
- 自动生成 nginx 配置文件和 docker-compose.yml
- 支持全文本搜索
- 支持单章节导出为独立站点

#### 2.6.3 单文件 PDF 导出

- 用户可选择当前打开的 Markdown 文件，通过菜单或快捷键触发「导出为 PDF」
- 采用半自动模式：弹出系统打印对话框，用户可选择「另存为 PDF」
- PDF 样式与编辑器中看到的渲染效果一致
- 用户可在打印对话框中调整纸张大小、边距、方向等参数

#### 2.6.4 导出配置

用户可在导出对话框中配置：

- 导出类型（CHM / nginx / PDF）
- 导出范围（整个 workspace / 指定章节 / 当前文件）
- 输出路径（用户选择保存目录，app 将产物从默认位置复制到用户指定路径）
- 书名、作者等元信息覆盖

### 2.7 导出文件管理

#### 2.7.1 文件存储位置

导出产生的临时文件和最终产物统一存放在 app 安装目录下：

```
selfnote/                              ← app 安装目录
├── temp/                              ← 导出中间临时文件
│   ├── my-docs-a1b2c3/               ← workspace 名称 + 短 hash
│   │   ├── chm/                      ← CHM 中间文件（HTML、.hhp 等）
│   │   └── nginx/                    ← Nginx 中间文件
│   └── project-x-e5f6g7h/
│       └── ...
│
├── dist/                              ← 导出最终产物（按类型各自保留最近 3 个版本）
│   ├── my-docs-a1b2c3/
│   │   ├── chm-v1/                   ← CHM 第 1 版（最早）
│   │   │   └── output.chm
│   │   ├── chm-v2/                   ← CHM 第 2 版
│   │   │   └── output.chm
│   │   ├── chm-v3/                   ← CHM 第 3 版（最新，下次导出 chm-v4 时 v1 被删）
│   │   │   └── output.chm
│   │   ├── nginx-v1/                 ← Nginx 第 1 版
│   │   │   └── (nginx 部署包文件)
│   │   └── nginx-v2/                 ← Nginx 第 2 版（最新）
│   │       └── (nginx 部署包文件)
│   └── project-x-e5f6g7h/
│       └── ...
│
└── vendor/                            ← 共享依赖缓存（docsify/prism）
    ├── docsify@4/
    └── prism@1/
```

**设计要点：**

- 每个 workspace 在 `temp/` 和 `dist/` 下有独立文件夹，互不冲突
- 文件夹命名规则：`{workspace名称}-{路径短hash}`，兼顾可读性和唯一性
- **版本按导出类型独立管理** — CHM、Nginx 各自维护版本号，互不影响
  - 新导出 `chm-v4` → 删除 `chm-v1`，nginx 版本不受影响
  - 新导出 `nginx-v3` → 删除 `nginx-v1`，chm 版本不受影响
- 每种类型保留最近 3 个版本，超出则删除最早的
- 导出完成后弹出保存对话框，用户选择目标路径，app 将产物复制过去

#### 2.7.2 临时文件清理

采用三层清理机制：

**第 1 层 — 导出开始前预清理：**

- 删除该 workspace 的 `temp/{workspace}/` 目录（清除上次残留）
- 避免新旧中间文件混杂

**第 2 层 — 导出完成后立即清理：**

- 导出成功 → 删除 `temp/{workspace}/` 全部内容
- 导出失败 → 保留 `temp/{workspace}/`（供排查问题），下次导出时由第 1 层清理

**第 3 层 — 应用启动时兜底清理：**

- 扫描 `temp/` 下所有 workspace 目录
- 删除创建时间超过 24 小时的目录
- 扫描 `dist/` 下所有 workspace 目录
- 按导出类型（chm / nginx）独立管理版本，每种类型只保留最近 3 个版本
- 版本滚动：新版本生成时（如 `chm-v4`），自动删除同类型最早的版本（`chm-v1`），其他类型不受影响

#### 2.7.3 vendor 共享依赖缓存

- docsify、prism 等前端依赖存放在 `vendor/` 目录
- 所有 workspace 的 nginx 导出共用，不按 workspace 隔离
- 版本检测：导出时检查版本号，版本一致则跳过下载，版本变化则覆盖更新
- 不主动清理（体积约 500KB，复用价值高）

## 3. 文件结构规范

### 3.1 Workspace 目录结构

```
my-workspace/
│
├── SUMMARY.md                     ← 全局目录结构定义
├── workspace.json                 ← workspace 元数据
│
├── assets/                        ← workspace 级共享资源
│   ├── logo.svg
│   └── style.css
│
├── 01-getting-started/            ← 第 1 章（自包含文件夹）
│   ├── index.md                   ← 章节主文档
│   └── assets/                    ← 本章专属资源
│       └── index-img-001.png
│
├── 02-architecture/               ← 第 2 章
│   ├── index.md
│   ├── api-overview.md            ← 章节内的子页面
│   └── assets/
│       ├── index-img-001.drawnix
│       ├── index-img-001.svg
│       ├── index-img-002.png
│       ├── api-overview-img-001.drawnix
│       └── api-overview-img-001.svg
│
└── appendix/                      ← 附录（无编号）
    ├── index.md
    └── changelog.md
```

**设计决策：**

- **章节文件夹自包含** — 每个章节文件夹可以独立导出、独立分享，不依赖外部资源
- **序号前缀排序** — `01-`、`02-` 前缀让文件系统 `ls` 就是正确顺序，不需要额外解析
- **assets 跟着章节走** — 图片资源放在章节内的 `assets/` 目录，使用相对路径引用
- **子页面共存** — 同一章节的子页面共享同一套 `assets/`，通过命名前缀区分归属
- **Asset Protocol 全路径授权** — `tauri.conf.json` 中 `assetProtocol.scope` 设为 `["**"]`，允许加载任意路径的 workspace 图片资源（桌面应用无远程入口，风险可控）

### 3.2 图片命名规范

**命名公式：`{文档名}-img-{序号}.{扩展名}`**

示例：

```
02-architecture/assets/
├── index-img-001.drawnix          ← index.md 的第 1 张白板图
├── index-img-001.svg              ← 对应的 SVG 导出
├── index-img-002.png              ← index.md 的第 2 张截图
├── api-overview-img-001.drawnix   ← api-overview.md 的第 1 张白板图
├── api-overview-img-001.svg
└── api-overview-img-002.png
```

**规则：**

1. 序号三位数（001-999），按插入顺序递增
2. 用户不需要手动命名，app 自动扫描当前文档已有最大序号并 +1
3. `.drawnix` 和 `.svg` 成对出现，主文件名相同
4. Markdown 中使用 `![img-001](./assets/api-overview-img-001.svg)` 引用，alt text 简洁且与文件名对应

**命名格式选择理由：** 去掉描述后缀，因为文档名称有时候比较长，图片命名也挺麻烦，纯编号更简洁实用。

### 3.3 SUMMARY.md 格式

```markdown
<!-- ⚠️ 此文件由 SelfNote 自动维护，请勿手动编辑 -->
<!-- 如需调整目录结构，请在应用中操作 -->
<!-- 手动修改可能导致目录显示异常 -->

# 我的技术文档

- [入门指南](01-getting-started/index.md)
  - [快速开始](01-getting-started/index.md)
- [系统架构](02-architecture/index.md)
  - [架构概览](02-architecture/index.md)
  - [API 总览](02-architecture/api-overview.md)
- [附录](appendix/index.md)
  - [更新日志](appendix/changelog.md)
```

SUMMARY.md 同时服务三个用途：

1. App 左侧目录树的导航定义
2. CHM 的目录文件（.hhc）的数据来源
3. nginx 部署包中 docsify 的侧边栏

### 3.4 workspace.json 格式

```json
{
  "_comment": "⚠️ 此文件由 SelfNote 自动维护，请勿手动编辑",
  "title": "我的技术文档",
  "author": "张三",
  "language": "zh-CN",
  "version": "1.0.0",
  "created": "2026-05-18",
  "export": {
    "chm": {
      "title": "我的技术文档",
      "language": "0x0804",
      "compiledFile": "index.html"
    },
    "nginx": {
      "baseUrl": "/docs",
      "theme": "default"
    }
  }
}
```

元数据与目录结构分离 — 目录结构用 SUMMARY.md（人可读、可直接编辑），配置信息用 workspace.json。

### 3.5 系统文件保护机制

SUMMARY.md 和 workspace.json 是 workspace 正常显示、导出的关键文件，由程序自动维护，用户不应直接编辑。以下三项保护措施确保文件安全：

#### 3.5.1 应用内文件树隐藏

应用内的文件树**不展示** SUMMARY.md 和 workspace.json，用户只看到章节和文档：

```
文件树显示：                     磁盘实际存在：
├─ 入门指南                      ├── SUMMARY.md          ← 隐藏
│  └─ 概述                       ├── workspace.json      ← 隐藏
├─ 系统架构                      ├── assets/             ← 隐藏（workspace级）
│  ├─ 架构概览                    ├── 01-getting-started/
│  ├─ API 总览                   │   ├── index.md
│  └─ 数据库设计                  │   └── assets/         ← 隐藏
└─ API 参考                      ├── 02-architecture/
                                  │   ├── index.md
                                  │   ├── api-overview.md
                                  │   └── assets/
                                  └── 03-api-reference/
```

用户在文件树里能做的操作只有：新建章节、新建子页面、重命名、删除。这些操作**由 app 自动更新** SUMMARY.md 和 workspace.json，用户无需感知这两个文件的存在。

#### 3.5.2 外部编辑器打开时的保护

用户用 Typora / VS Code 打开 workspace 目录时，这两个文件是可见可编辑的，应用无法阻止。通过以下方式降低误改风险：

- SUMMARY.md 顶部添加 HTML 注释警告
- workspace.json 中添加 `_comment` 字段警告

#### 3.5.3 启动时校验 + 自动修复

每次打开 workspace 时进行校验：

**workspace.json 校验：**

- Schema 是否合法（必填字段是否完整）
- 缺失字段 → 用默认值补全
- 文件损坏 / 不是合法 JSON → 弹窗提示用户，选择修复或放弃打开

**SUMMARY.md 校验：**

- 引用的文件是否都存在于磁盘
- 磁盘上的章节文件夹是否都在 SUMMARY.md 中
- 不一致时的修复策略：
  - 磁盘有但 SUMMARY 没有 → 自动追加到 SUMMARY.md
  - SUMMARY 有但磁盘没有 → 文件树中标记为「缺失」并置灰显示

校验流程：

```
打开 workspace
    │
    ▼
校验 workspace.json
  ├─ 合法 → 继续
  ├─ 缺字段 → 默认值补全 → 继续
  └─ 损坏 → 弹窗提示
    │
    ▼
校验 SUMMARY.md 与磁盘文件一致性
  ├─ 一致 → 进入正常编辑
  ├─ 磁盘多出文件 → 自动追加到 SUMMARY.md
  └─ 引用指向不存在的文件 → 置灰标记
    │
    ▼
进入正常编辑
```

## 4. 非功能需求

### 4.1 性能

- 应用启动时间 < 3 秒
- 文件切换响应 < 500ms
- 大文件（>1MB Markdown）编辑不卡顿
- 白板操作流畅（60fps）

### 4.2 兼容性

- 支持 Windows、macOS、Linux
- 导出的 CHM 可在 Windows HTML Help Viewer 和第三方 CHM 阅读器中打开
- 导出的 nginx 站点兼容主流浏览器（Chrome、Firefox、Safari、Edge）

### 4.3 数据安全

- 所有文件保存在本地，不上传任何云端
- workspace 使用标准文件系统结构，其他工具（Typora、VS Code）可直接打开编辑
- 自动保存防止数据丢失

### 4.4 可扩展性

- 支持未来添加新的导出格式（PDF、EPUB）
- 白板支持通过 Drawnix 插件机制扩展新图形类型
- 支持未来集成更多图表渲染引擎

### 4.5 开发与测试要求

- 所有 IPC 调用必须通过统一的 `invokeIPC()` 代理函数，禁止直接调用 `invoke()`
- 开发阶段支持 mock IPC，前端可脱离 Rust 独立运行和测试（`npm run dev`）
- 正式打包时（`npm run tauri build`），必须走真实 Tauri `invoke()`，mock 代码不能被触发
- Rust 后端每个 command 必须有独立的单元测试（`cargo test`），可脱离前端运行
- 前后端 IPC 类型定义必须通过契约测试确保一致
