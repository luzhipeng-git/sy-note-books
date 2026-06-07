# E2E Tests — sy-note-books

基于 **WebDriverIO + tauri-driver** 的 E2E 测试套件，在 Docker Fedora 容器内运行完整 Tauri 应用。

## 架构

```
Docker Fedora Container
├── Xvfb (虚拟显示器 :99)
├── Tauri App (debug build, 通过 tauri-driver 启动)
├── tauri-driver (WebDriver 服务器, localhost:4444)
└── WebDriverIO (测试框架, 连接 tauri-driver)
```

WebDriverIO → tauri-driver → Tauri App Webview

IPC 走真实 Rust 后端（非 mock），测试覆盖前端 + 后端完整链路。

## 文件结构

```
e2e-tests/
├── wdio.conf.ts           ← WebDriverIO 配置（自动构建 + 启动 tauri-driver）
├── package.json            ← 依赖（@wdio/cli, webdriverio 等）
├── tsconfig.json           ← TypeScript 配置
├── helpers/
│   ├── selectors.ts        ← CSS 选择器常量（集中管理）
│   ├── actions.ts          ← 可复用的多步操作（打开文件、搜索等）
│   └── fixtures.ts         ← 测试夹具（ensureWorkspaceOpen 等）
└── specs/
    ├── 01-global.spec.ts   ← 全局布局、主题、快捷键
    ├── 02-workspace.spec.ts ← Workspace 管理、文件树 CRUD
    ├── 03-editor.spec.ts   ← Markdown 编辑器、自动保存
    ├── 04-whiteboard.spec.ts ← 白板画图（Drawnix）
    ├── 05-search.spec.ts   ← 全局搜索、文档搜索
    └── 06-export.spec.ts   ← 导出 CHM/Nginx/PDF
```

## 运行方式

### 1. 构建 Docker 镜像（一次性）

```bash
pnpm docker:build
# 或手动:
# docker build -t synote-tauri:fedora src-tauri/docker/
```

### 2. 运行 E2E 测试

```bash
# 完整运行（构建镜像 + 构建 Tauri + 运行测试）
pnpm test:e2e

# 跳过镜像构建（镜像已存在时）
pnpm test:e2e:nobuild

# 或直接运行脚本
./scripts/e2e-docker.sh
./scripts/e2e-docker.sh --no-build
```

### 3. 手动在 Docker 中调试

```bash
# 进入容器
docker run --rm -it -v $(pwd):/workspace synote-tauri:fedora bash

# 在容器内手动执行:
Xvfb :99 -screen 0 1440x900x24 &
export DISPLAY=:99
cd /workspace && pnpm install
pnpm tauri build --debug --no-bundle
tauri-driver &
cd e2e-tests && pnpm install && pnpm test
```

## 编写新测试

1. 在 `specs/` 下创建新的 `.spec.ts` 文件
2. 从 `helpers/selectors.ts` 导入选择器常量
3. 从 `helpers/fixtures.ts` 导入测试夹具
4. 使用 WebDriverIO API（`browser.$()`, `browser.keys()` 等）

```typescript
import { SELECTORS, TEXTS } from '../helpers/selectors.js';
import { ensureWorkspaceOpen } from '../helpers/fixtures.js';

describe('My Feature', () => {
  it('should do something', async () => {
    await ensureWorkspaceOpen();
    const el = await browser.$(SELECTORS.someElement);
    expect(await el.isExisting()).toBe(true);
  });
});
```

## 与旧 Playwright 测试的区别

| 方面 | 旧 Playwright | 新 WebDriverIO |
|------|--------------|----------------|
| 运行方式 | pnpm dev (mock IPC) | Docker Tauri (真实 IPC) |
| 后端 | Mock 数据 | Rust 真实后端 |
| 测试协议 | Chrome DevTools | WebDriver (tauri-driver) |
| 环境要求 | Node.js 即可 | Docker + Fedora + webkit2gtk |

旧 Playwright 测试文件保留在 `e2e/` 目录，标记为 DEPRECATED，不再维护。
