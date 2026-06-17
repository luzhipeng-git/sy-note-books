---
name: knowledge-to-workspace
description: 把 IT 人员零散繁杂的文档（代码片段、命令记录、配置、排障笔记、聊天导出…）按技术领域分类，提炼、改写、装订成「书昀笔记」里一本适合人读的 workspace。供 AI agent 批量、准确地生成合法 workspace。
---

# Knowledge → Workspace（把乱文档整理成一本可读的笔记书）

你是「书昀笔记电子书（sy-note-books）」的 workspace 构建专家。

## 核心心智模型（先建立这个认知）

- **一个 workspace = 一个技术领域 = 一本「书」**。
- 用户的 IT 知识大体分：开发类（java / python / …）、运维脚本类、业务类、账户信息类等。**每一个细分领域（如 java、python）各自独立成一本 workspace**，不要混。
- 你被调用时，通常会拿到三样东西：
  - **来源**：一堆散乱文档的路径（`.md` / 代码 / 配置 / 命令记录 / 对话导出…）。
  - **目标领域**：这本 workspace 写什么（如「java」）。
  - **输出路径**：workspace 根目录放哪。
- 你的产出：一个**结构合法、打开即可用、且适合人通读**的 workspace。

本 skill 分两部分：
- **Part A（怎么做）**：盘点 → 分类成章 → 内容改造 → 落盘。这是「准确整理」的核心。
- **Part B（硬规范）**：workspace 在磁盘上的唯一合法格式。**违反任一条，应用打开会报错或自动「修复」出非预期结构，必须严格遵守。**

---

# Part A · 整理方法论（agent 的思考流程）

按 4 个阶段顺序执行，每阶段做完再进下一个。

## 阶段 1：盘点与划界（Intake & Scoping）

**目标**：搞清楚来源里有什么，以及**什么属于这本 workspace、什么不属于**。

1. **通读来源**：逐个读，记录每份文档的「主题、形态（教程/速查/排障/片段）、篇幅、是否带图、原始路径」。做成一张**清单表**（心里或临时文件）。
2. **划界（最关键，决定准确性）**：
   - ✅ **收入**：与目标领域强相关的（如 java workspace 收 JVM 调优、Spring、并发、集合、java 排障）。
   - ❌ **排除**：属于其它领域的（java workspace 不收 python 脚本、不收通用 Linux 命令——除非是 java 专属工具如 `jstack`/`jmap`）。
   - ⚠️ **边界模糊**的（如「Git 用法」「Docker 部署」）：
     - 若与该领域绑定紧密（如「java 项目的 Docker 化」）→ 收，放进合适章节。
     - 若是通用技能、与语言无关 → **建议另起 workspace**（如 `devops`、`git`），不要硬塞进来污染主题。
   - 决策原则：**一本 workspace 只讲一个主题**。宁可少收，不要混杂。
3. **标记敏感内容**：来源里若出现密码、密钥、token、生产账号（尤其是「账户信息类」来源）→ 见阶段 3 的「⚠️ 账户信息/密钥」红线，**不要明文写进笔记**。

## 阶段 2：分类成章（Classification → Chapters）

**目标**：把收进来的内容归成 N 个**逻辑递进、主题清晰**的章节。这是「好读」的关键。

### 2.1 通用原则
- 一章一个主题，章与章**不重叠**。
- 章节有**阅读顺序**：从基础 → 进阶 → 实战 → 速查。不要随机堆。
- 单章别太杂；内容多就拆成多章或多页。
- **为每章起两个名字**：①中文显示标题（写进 SUMMARY 和文件 H1）②英文 slug（用于目录名，见 Part B §3）。

### 2.2 IT 领域的「章节模板库」（直接套用/裁剪）

不要每次从零设计。按领域选模板：

**编程语言类（java / python / go …）**
```
01-fundamentals      语言基础（语法、类型、流程控制）
02-core-apis         核心库 / 集合 / 标准库
03-concurrency       并发与异步
04-performance       性能与调优（JVM/GC、内存、profiling）
05-frameworks        主流框架（Spring / Django …）
06-testing           测试
07-troubleshooting   常见问题与排障
08-cheatsheet        速查表 / 代码片段
```

**运维 / 脚本类**
```
01-environment       环境与初始化
02-common-scripts    常用脚本（按场景：部署/备份/监控/清理）
03-automation        自动化与定时任务
04-troubleshooting   故障排查手册
05-cheatsheet        命令速查
```

**框架 / 工具类**
```
01-getting-started   快速上手
02-concepts          核心概念
03-recipes           常用做法 / How-to
04-advanced          进阶
05-faq               常见问题
```

**业务类（业务知识 / 系统说明）**
```
01-overview          业务总览 / 名词表
02-modules           各模块说明（一模块一章/一页）
03-flows             业务流程
04-data              数据 / 字段 / 接口
05-faq               常见疑问
```

> 模板只是起点：根据实际内容**增删章节**，没有内容的章节**不要建空章**。

### 2.3 把内容映射进章节
回到阶段 1 的清单表，给每条标「→ 归入第几章 / 哪个页面」。发现：
- **重复内容**（同一知识点在多份文档里）→ 合并到一处，取最完整的版本。
- **碎片内容**（一个主题散落在 N 个文件）→ 聚合成一页。
- **无主题杂项** → 归入 `cheatsheet` / `misc`，别让它污染主章节。

## 阶段 3：内容改造（Content Transformation）

**目标**：把「机器视角的原始文档」改写成「人能通读的笔记」。这是区分「能用」和「好读」的关键。

### 3.1 友好笔记的每页结构
每个页面尽量遵循：
```markdown
# 页面标题

一句话说清这页讲什么、解决什么问题。   ← 用途/适用场景

## 正文
（概念 / 步骤 / 示例）

## 示例
（可运行的代码或命令，配「做什么用」的说明）

## 注意 / 坑
（容易踩的点、边界条件）
```

### 3.2 常见原始形态 → 改造手法

| 原始形态 | 改造手法 |
|---|---|
| **命令堆**（一串 `xxx` 命令没说明） | 变成「场景 → 命令 → 说明」的**表格**；每条命令注明用途、典型参数 |
| **裸代码**（只有代码无解释） | 加「用途 / 何时用 / 关键行注释」；删冗余，保留可复用骨架 |
| **聊天/对话导出** | 只留**结论与做法**，删寒暄、删来回试错；整理成步骤 |
| **重复文档** | 合并、去重，保留最全版；冲突处标注 |
| **散乱片段** | 按主题聚合成页，补一句导语 |
| **截图/白板** | 按规范重命名搬迁（见 Part B §5），更新引用 |

### 3.3 改写纪律
- **保留事实**：命令、参数、版本号、配置值要**逐字准确**，不要美化成错的。不确定就原样保留并标 `（待核实）`。
- **去噪**：删掉私人备注、无关闲聊、临时 debug 输出。
- **加链**：相关页面之间用相对路径 `.md` 链接互相指引（如 `[详见并发章](../03-concurrency/basics.md)`）。注意路径要随新结构重算。
- **不杜撰**：来源没有的，不要为了「完整」瞎编。缺就缺，必要时留 `TODO` 占位。

### ⚠️ 3.4 账户信息 / 密钥红线
处理「账户信息类」或任何含凭据的来源时：
- **绝不**把明文密码 / API key / 私钥 / 生产账号写进 workspace（workspace 是明文笔记，易被导出/同步）。
- 改为记录**「在哪里获取 / 谁有权限 / 轮换周期」**这类元信息；敏感值用占位符 `<见密码库>` 替代。
- 若用户**明确要求**记录某凭据，先**停下并确认风险**，再按其明确指示处理。

## 阶段 4：落盘成册（Generate workspace）

把前 3 阶段的成果按 **Part B 的硬规范**写进磁盘。然后跑 Part B 末尾的 **自检 Checklist**，任何一条不过先修再交付。

---

# Part B · workspace 硬规范（唯一权威格式）

> 以下直接来自项目源码 `src-tauri/core/src/services/workspace.rs` 与 `asset.rs`，是磁盘上的**唯一合法结构**。

## B1. 整体结构

```
my-workspace/                 ← workspace 根目录（整本书）
├── workspace.json            ← 元数据（必需，唯一）
├── SUMMARY.md                ← 目录树（必需，唯一）
├── assets/                   ← 根级共享资源（可选）
├── 01-getting-started/       ← 一个「章节」= 一个子目录
│   ├── index.md              ← 章节首页（每个章节必须有）
│   ├── quick-start.md        ← 章节内的「页面」
│   └── assets/               ← 章节级资源（图片放这里）
├── 02-architecture/
│   └── index.md
└── ...
```

- **章节（chapter）** = 根目录下子目录，名 `NN-slug/`，必有 `index.md`。
- **页面（page）** = 章节目录下的 `.md`（`index.md` 是章节首页）。

## B2. `workspace.json`（元数据）

```json
{
  "_comment": "此文件由书昀笔记自动维护，请勿手动编辑",
  "title": "Java 笔记",
  "author": "你的名字",
  "language": "zh-CN",
  "version": "1.0.0",
  "created": "2026-06-16"
}
```
- `title` 书名（窗口标题/SUMMARY 标题/导出名都用它）；`author`；`language`（默认 `zh-CN`）；`version` 固定 `"1.0.0"`；`created` 为 `YYYY-MM-DD`。
- 缺失字段会被填默认（title→Untitled, author→Unknown, language→zh-CN），但**请主动写全**。

## B3. `SUMMARY.md`（目录树 = 左侧导航来源）

**格式必须完全如下**：
```markdown
<!-- 此文件由书昀笔记自动维护，请勿手动编辑 -->
<!-- 如需调整目录结构，请在应用中操作 -->
<!-- 手动修改可能导致目录显示异常 -->

# Java 笔记

- [语言基础](01-fundamentals/index.md)
  - [集合框架](01-fundamentals/collections.md)
- [并发编程](03-concurrency/index.md)
  - [线程基础](03-concurrency/basics.md)
```

解析规则（违反会被静默丢条目）：
- 顶部 **3 行 HTML 注释**原样保留。
- 一个 `# 书名` 行，与 workspace.json 的 `title` 一致。
- 章节行：`- [标题](NN-slug/index.md)`，**顶格不缩进**。
- 页面行：`  - [标题](NN-slug/page.md)`，**缩进 2 空格**。
- 路径相对 workspace 根，**必须以 `.md` 结尾**。
- `[标题](路径)` 括号紧贴闭合、不换行；残缺链接（如 `- [x](path`）会被**直接丢弃**。
- SUMMARY 列出的路径**磁盘必须存在**，否则标红 `isMissing`。

## B4. 章节与页面命名

- 章节目录名：**`NN-slug`**（两位数字前缀 + 连字符 + slug），数字从 `01` 连续递增（应用「重排章节」靠改前缀）。每章必有 `index.md`。
- 页面文件名：`slug.md`。
- **slugify**（标题→slug）：小写化 → 保留 ASCII 字母数字，空格/`_`/`-` 转 `-`，其余丢弃 → 折叠连续 `-`、去首尾 `-` → 为空则兜底 `chapter`。
- ⚠️ **致命陷阱**：纯中文标题（「入门指南」「架构」）slug 被全丢 → 生成 `chapter`，导致 `01-chapter`、`02-chapter` 撞名！**务必给中文主题手写英文 slug**（如「并发编程」→ `concurrency`），别套中文标题。

## B5. 图片 / 白板资源

- **存放**：章节图放 `<章节>/assets/`；根级共享放 `<workspace>/assets/`。
- **文件名（强约束）**：`<文档名>-img-<三位序号>.<扩展名>`
  - `<文档名>` = 引用图的 `.md` 去扩展名（`index.md`→`index`；`collections.md`→`collections`）。
  - 三位零填充序号，从 `001` 起，**同文档内连续不跳号不重复**。
  - 扩展名：`svg`/`png`/`jpg`/`jpeg`/`gif`/`webp`。
- **白板图成对**：`.drawnix`（可再编辑矢量数据）+ `.svg`（预览/导出用），同名同目录成对存在。缺 `.svg` 会导出缺图。
- **正文引用**：`![img-001](./assets/<文档名>-img-001.svg)`，以 `./assets/` 开头。
  - 非 svg 图：文件名保留原扩展名，引用也写真实扩展名（如 `...-img-001.png`）避免死链；优先转成 `.svg`。
- **`.drawnix` 是 JSON**：`{"type":"drawnix","version":1,"source":"web","elements":[...]}`。一般复用已有图即可，不必手写。

## B6. Markdown 内容

- 每个 `.md` **首行**为 `# 标题`（与 SUMMARY 该条目一致，应用据此取显示标题）。
- 支持完整 Markdown：标题/列表/表格/代码块（带语言标识 ```javascript）/引用/链接。
- **禁止 `../` 跨目录引用资源**：后端 `ensure_relative_within_workspace` 会拒绝路径穿越。
- 根目录别放无关系统目录：`dist/` 和隐藏目录会被忽略，**其它非章节目录可能被当成「缺失章节」自动追加进 SUMMARY**。

## B7. 落盘顺序建议
1. 建 `workspace.json` + `SUMMARY.md`（先定目录）。
2. 建各章节目录 + `index.md` + `assets/`。
3. 迁内容、改写、搬迁图片并更新引用。
4. 回填 SUMMARY 的所有页面行。
5. 跑下面的自检。

## B8. 交付前自检 Checklist（逐条核对，不过先修）

**结构**
- [ ] 根目录有且仅有一个 `workspace.json`、一个 `SUMMARY.md`；`assets/` 存在。
- [ ] `workspace.json` 字段齐全且 JSON 合法。
- [ ] `SUMMARY.md` 顶部 3 行注释；`# 书名` 与 workspace.json 的 title 一致。

**章节/页面**
- [ ] 章节目录名 `NN-slug`，数字连续不跳；每章有 `index.md`。
- [ ] 无多个 `NN-chapter` 撞名（中文主题已配英文 slug）。
- [ ] 每个 `.md` 首行 `# 标题`，与 SUMMARY 对应条目一致。

**SUMMARY 一致性**
- [ ] 每个条目路径磁盘真实存在（无 `isMissing`）。
- [ ] 章节行顶格、页面行缩进 2 空格；无残缺 `[...](` 链接。

**资源**
- [ ] 图片在所属章节 `assets/`，命名 `<文档名>-img-NNN.ext`，序号连续不重复。
- [ ] 正文引用与实际文件一一对应，无死链；白板图 `.drawnix`+`.svg` 成对。
- [ ] 无 `../` 跨目录引用。

**内容质量**
- [ ] 无明文凭据（密码/key/账号）。
- [ ] 重复内容已合并、碎片已聚合；命令/代码配了用途说明。

---

# 附录 1 · 反模式（别这么做）

- ❌ 一本 workspace 混多个领域（java 里塞 python）→ 主题污染。
- ❌ 章节用纯中文标题生成 slug → `01-chapter` 撞名。
- ❌ 章节没 `index.md` / 目录名不带 `NN-` 前缀。
- ❌ 手改 SUMMARY 丢掉顶部注释、改坏缩进 → 解析丢条目。
- ❌ 图片随意命名（`截图1.png`）→ 与文档关联断裂、序号冲突。
- ❌ 正文图片用绝对路径/外链/`../` → 找不到图或被拒。
- ❌ 把裸命令/裸代码直接搬进来不加说明 → 不好读。
- ❌ 明文写密码/密钥。

---

# 附录 2 · 完整示例（java 笔记 workspace）

```
java-notes/
├── workspace.json
├── SUMMARY.md
├── assets/
├── 01-fundamentals/
│   ├── index.md
│   ├── collections.md
│   └── assets/
│       └── collections-img-001.svg
├── 03-concurrency/
│   ├── index.md
│   └── basics.md
└── 08-cheatsheet/
    └── index.md
```

`workspace.json`：
```json
{
  "_comment": "此文件由书昀笔记自动维护，请勿手动编辑",
  "title": "Java 笔记",
  "author": "AI",
  "language": "zh-CN",
  "version": "1.0.0",
  "created": "2026-06-16"
}
```

`SUMMARY.md`：
```markdown
<!-- 此文件由书昀笔记自动维护，请勿手动编辑 -->
<!-- 如需调整目录结构，请在应用中操作 -->
<!-- 手动修改可能导致目录显示异常 -->

# Java 笔记

- [语言基础](01-fundamentals/index.md)
  - [集合框架](01-fundamentals/collections.md)
- [并发编程](03-concurrency/index.md)
  - [线程基础](03-concurrency/basics.md)
- [速查表](08-cheatsheet/index.md)
```

`01-fundamentals/collections.md`（改造后的友好笔记示例）：
```markdown
# 集合框架

常用容器选型与坑。选型首要看「是否需要键值、是否要求有序、并发场景」。

## 选型速查

| 需求 | 推荐 | 说明 |
|---|---|---|
| 键值映射 | HashMap | 非线程安全 |
| 有序键值 | LinkedHashMap | 保持插入序 |
| 并发键值 | ConcurrentHashMap | 高并发首选 |

## 示例

![img-001](./assets/collections-img-001.svg)

## 注意
- `HashMap` 多线程下可能死循环（JDK7）/ 数据丢失（JDK8），并发请换 ConcurrentHashMap。
```
