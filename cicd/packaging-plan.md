# sy-note-books 完整打包方案

## Context

sy-note-books（书昀笔记电子书）是一个基于 Tauri 2 + React 19 的桌面笔记应用。当前 `tauri.conf.json` 缺少 `bundle` 配置段，无 CI/CD 流水线，图标为占位符，Python 导出引擎尚未集成。本方案参照同仓库 DevToolkit 项目的成熟实践，规划三平台（Windows/macOS/Linux）的完整打包、分发与自动更新方案。

## 用户决策

| 决策项 | 结论 |
|--------|------|
| 目标平台 | Windows + macOS + Linux |
| 自动更新 | 需要（tauri-plugin-updater） |
| macOS 签名公证 | 暂无 Apple Developer 账号，先跳过 |
| Python 导出引擎 | 纳入规划，作为 sidecar 嵌入安装包 |

---

## 方案总览

```
                              ┌─────────────────────────────────┐
                              │        GitHub Actions CI        │
                              │   (tag v* 或手动触发)            │
                              └──────────┬──────────────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
             Windows runner      macOS runner          Ubuntu runner
             ┌──────────┐       ┌──────────┐         ┌──────────┐
             │ pnpm build│       │ pnpm build│         │ pnpm build│
             │ NSIS exe  │       │ DMG (ARM) │         │ AppImage  │
             │           │       │ DMG (x64) │         │ deb       │
             └─────┬─────┘       └─────┬─────┘         └─────┬─────┘
                   │                   │                     │
                   └───────────────────┼─────────────────────┘
                                       ▼
                              ┌─────────────────────┐
                              │   GitHub Release    │
                              │  + 更新签名文件      │
                              │  + latest.json      │
                              └─────────────────────┘
                                       │
                              ┌────────┴────────┐
                              │  用户端自动更新   │
                              │ tauri-plugin-    │
                              │   updater        │
                              └─────────────────┘
```

---

## Part 1: tauri.conf.json Bundle 配置

**文件**: `src-tauri/tauri.conf.json`

需要添加完整的 `bundle` 和 `plugins` 段：

```jsonc
{
  "bundle": {
    "active": true,
    "targets": ["nsis", "dmg", "appimage", "deb"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "createUpdaterArtifacts": true,
    "externalBin": ["binaries/synote-export"],
    "resources": [],
    "copyright": "",
    "category": "Productivity",
    "shortDescription": "书昀笔记电子书 — 面向技术写作者的桌面笔记应用",
    "longDescription": "书昀笔记电子书提供 workspace 级知识管理、Typora 级 Markdown 编辑、白板画图、一键导出。",
    "windows": {
      "webviewInstallMode": {
        "type": "downloadBootstrapper"
      },
      "nsis": {
        "displayLanguageSelector": true,
        "languages": ["SimpChinese", "English"],
        "installMode": "both"
      }
    },
    "macOS": {
      "minimumSystemVersion": "10.13",
      "signingIdentity": null
    },
    "linux": {
      "appimage": {
        "bundleMediaFramework": false
      },
      "deb": {
        "depends": []
      }
    }
  },
  "plugins": {
    "updater": {
      "pubkey": "<待生成>",
      "endpoints": [
        "https://github.com/<user>/sy-note-books/releases/latest/download/{{target}}-{{arch}}.json"
      ]
    }
  }
}
```

### Sidecar 二进制命名约定

Tauri 要求 sidecar 二进制按 target triple 命名，放在 `src-tauri/binaries/` 下：

```
src-tauri/binaries/
  synote-export-x86_64-pc-windows-msvc.exe    # Windows x64
  synote-export-x86_64-apple-darwin            # macOS Intel
  synote-export-aarch64-apple-darwin           # macOS Apple Silicon
  synote-export-x86_64-unknown-linux-gnu       # Linux x64
```

构建时 Tauri 自动选择匹配当前 target 的二进制。

---

## Part 2: Python 导出引擎打包集成

### 2.1 导出引擎项目结构

```
export-engine/
├── pyproject.toml          # 项目元数据 + 依赖
├── requirements.txt        # PyInstaller 等构建依赖
├── synote_export/
│   ├── __init__.py
│   ├── __main__.py         # CLI 入口：python -m synote_export <command> <args>
│   ├── chm.py              # CHM 导出（纯 Python ITSF 二进制写入）
│   ├── nginx.py            # Nginx 静态站导出（docsify 模板）
│   └── templates/          # docsify 离线资源、CHM 模板
├── build.py                # PyInstaller 构建脚本
└── README.md
```

### 2.2 CLI 接口设计

```
synote-export chm --workspace <path> --output <path> [--chapter <name>]
synote-export nginx --workspace <path> --output <path> [--chapter <name>]
synote-export --version
```

返回 JSON 到 stdout：
```json
{"status": "ok", "output": "/path/to/output.chm"}
```
或
```json
{"status": "error", "message": "描述性错误信息"}
```

### 2.3 PyInstaller 构建

`build.py` 脚本为四个 target 交叉编译：

```python
# 在对应平台的 CI 步骤中运行
PyInstaller --onefile \
  --name synote-export \
  --add-data "synote_export/templates:templates" \
  synote_export/__main__.py
```

**关键约束**：PyInstaller 不支持交叉编译，每个平台的二进制必须在对应平台上构建。因此 CI 流水线中每个 matrix job 都要先构建 Python sidecar，再构建 Tauri。

### 2.4 Rust 端调用方式

修改 `src-tauri/core/src/services/export.rs`：

```rust
use std::process::Command;

fn get_export_engine_path(app: &tauri::AppHandle) -> PathBuf {
    // sidecar 路径解析
    app.path().resource_dir()
        .expect("failed to resolve resource dir")
        .join("binaries/synote-export")
}

pub fn export_chm(
    app: &tauri::AppHandle,
    workspace_path: &Path,
    output_path: &str,
    chapter: Option<&str>,
) -> Result<String, String> {
    let engine = get_export_engine_path(app);
    let mut cmd = Command::new(&engine);
    cmd.arg("chm")
       .arg("--workspace").arg(workspace_path)
       .arg("--output").arg(output_path);
    if let Some(ch) = chapter {
        cmd.arg("--chapter").arg(ch);
    }
    let output = cmd.output()
        .map_err(|e| format!("导出引擎启动失败：{}", e))?;
    // 解析 JSON stdout
    let result: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("导出引擎返回解析失败：{}", e))?;
    if result["status"] == "ok" {
        Ok(result["output"].as_str().unwrap_or(output_path).to_string())
    } else {
        Err(result["message"].as_str().unwrap_or("未知错误").to_string())
    }
}
```

> 注意：当前 `export_chm` 的签名不含 `AppHandle`，Tauri command 层需要透传 `app: tauri::AppHandle`（Tauri 2 的 command 函数可自动注入 `AppHandle` 参数）。

### 2.5 capabilities 权限

由于 sidecar 通过 Rust 端 `std::process::Command` 调用，**不需要** shell 插件权限。但如果前端 JS 也需要直接调用，则需在 `capabilities/default.json` 添加 shell 权限。

---

## Part 3: Tauri Updater 自动更新

### 3.1 生成签名密钥

```bash
pnpm tauri signer generate -w ~/.tauri/synote.key
```

生成：
- 私钥：`~/.tauri/synote.key`（CI 中配置为 Secret）
- 公钥：写入 `tauri.conf.json` 的 `plugins.updater.pubkey`

### 3.2 前端集成

安装依赖：
```bash
pnpm add @tauri-apps/plugin-updater @tauri-apps/plugin-process
```

Rust 端注册插件（`lib.rs`）：
```rust
.plugin(tauri_plugin_updater::Builder::new().build())
.plugin(tauri_plugin_process::init())
```

前端更新检查（建议放在设置页面或应用启动时）：
```typescript
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

async function checkForUpdate() {
  const update = await check();
  if (update) {
    await update.downloadAndInstall();
    await relaunch();
  }
}
```

### 3.3 更新流程

```
应用启动/用户手动检查
    ↓
tauri-plugin-updater 请求 endpoint
    ↓
GitHub Releases 下载 <target>-<arch>.json
    ↓
对比版本号 → 有新版本？
    ↓ 是
下载 .tar.gz 更新包 + .sig 签名
    ↓
验证签名 → 安装 → relaunch
```

---

## Part 4: GitHub Actions CI/CD

**文件**: `.github/workflows/build.yml`

### 4.1 流水线结构

```yaml
name: Build & Release

on:
  push:
    tags: ['v*']
  workflow_dispatch:

jobs:
  build:
    permissions:
      contents: write
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: windows-latest
            target: x86_64-pc-windows-msvc
            args: ''
          - platform: macos-latest
            target: aarch64-apple-darwin
            args: '--target aarch64-apple-darwin'
          - platform: macos-latest
            target: x86_64-apple-darwin
            args: '--target x86_64-apple-darwin'
          - platform: ubuntu-22.04
            target: x86_64-unknown-linux-gnu
            args: ''

    runs-on: ${{ matrix.platform }}
    steps:
      # 1. Checkout
      - uses: actions/checkout@v4

      # 2. 版本注入（从 tag 提取版本号）
      - name: Set version from tag
        shell: bash
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          cd src-tauri
          sed -i.bak "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" tauri.conf.json
          sed -i.bak "s/^version = \".*\"/version = \"$VERSION\"/" Cargo.toml
          sed -i.bak "s/^version = \".*\"/version = \"$VERSION\"/" core/Cargo.toml
          rm -f tauri.conf.json.bak Cargo.toml.bak core/Cargo.toml.bak

      # 3. 环境准备
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.platform == 'macos-latest' && 'aarch64-apple-darwin,x86_64-apple-darwin' || '' }}
      - uses: swatinem/rust-cache@v2
        with: { workspaces: './src-tauri -> target' }

      # 4. Linux 系统依赖
      - name: Install dependencies (ubuntu only)
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf

      # 5. Python 导出引擎构建
      - name: Build export engine
        shell: bash
        run: |
          cd export-engine
          pip install -r requirements.txt
          pyinstaller --onefile --name synote-export \
            --add-data "synote_export/templates:templates" \
            synote_export/__main__.py
          # 复制到 Tauri sidecar 目录并重命名
          mkdir -p ../src-tauri/binaries
          cp dist/synote-export* ../src-tauri/binaries/synote-export-${{ matrix.target }}${{ matrix.platform == 'windows-latest' && '.exe' || '' }}

      # 6. 前端依赖
      - run: pnpm install

      # 7. 构建 Tauri + 发布
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: '书昀笔记电子书 ${{ github.ref_name }}'
          releaseBody: |
            ## 书昀笔记电子书 ${{ github.ref_name }}

            ### 下载
            - **Windows**: NSIS 安装包 (`.exe`)
            - **macOS (Apple Silicon)**: DMG
            - **macOS (Intel)**: DMG
            - **Linux**: AppImage + deb

            > Windows 首次安装会自动下载 WebView2 运行时。
            > macOS 未签名，安装时需右键 → 打开。
          releaseDraft: false
          prerelease: false
          args: ${{ matrix.args }}
```

### 4.2 必需的 GitHub Secrets

| Secret | 用途 | 获取方式 |
|--------|------|----------|
| `GITHUB_TOKEN` | 创建 Release | 自动提供 |
| `TAURI_SIGNING_PRIVATE_KEY` | 更新包签名私钥 | `pnpm tauri signer generate` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 私钥密码 | 生成时设定 |

macOS 签名相关（暂不配置，预留）：
| Secret | 用途 |
|--------|------|
| `APPLE_CERTIFICATE` | base64 编码的 .p12 证书 |
| `APPLE_CERTIFICATE_PASSWORD` | .p12 密码 |
| `APPLE_ID` | Apple ID 邮箱 |
| `APPLE_PASSWORD` | 应用专用密码 |
| `APPLE_TEAM_ID` | 团队 ID |

### 4.3 发布流程

```bash
# 1. 本地测试
pnpm tauri build          # 本机构建验证

# 2. 发版
git tag v1.0.0
git push origin v1.0.0

# 3. CI 自动完成
# → 4 个 matrix job 并行构建
# → 创建 GitHub Release
# → 上传安装包 + 更新签名文件
```

---

## Part 5: 图标资源

### 5.1 需要的图标规格

| 文件 | 尺寸 | 用途 |
|------|------|------|
| `icons/32x32.png` | 32×32 | Windows 任务栏 / Linux |
| `icons/128x128.png` | 128×128 | macOS Spotlight |
| `icons/128x128@2x.png` | 256×256 | macOS Retina |
| `icons/icon.icns` | 多尺寸 | macOS 应用图标 |
| `icons/icon.ico` | 多尺寸 | Windows 应用图标 |
| `icons/icon.png` | 1024×1024 | 源图 / Linux |

### 5.2 生产流程

1. 设计 1024×1024 源图（PNG，透明背景）
2. 用 `pnpm tauri icon <source-icon.png>` 自动生成所有平台图标
3. 检查生成文件替换 `src-tauri/icons/` 下的占位符

---

## Part 6: 实施步骤（按执行顺序）

### Step 1: 图标资源 [预估 1h]
- 设计或获取 1024×1024 应用图标
- 运行 `pnpm tauri icon` 生成多平台图标
- 替换 `src-tauri/icons/` 下的占位符

### Step 2: tauri.conf.json Bundle 配置 [预估 0.5h]
- 添加 `bundle` 段（targets、icon、platform 配置）
- 添加 `plugins.updater` 段（pubkey 占位）
- 设置 `externalBin` 为 `["binaries/synote-export"]`

### Step 3: Updater 签名密钥 [预估 15min]
- 运行 `pnpm tauri signer generate` 生成密钥对
- 公钥写入 `tauri.conf.json`
- 私钥配置到 GitHub Secrets

### Step 4: Python 导出引擎脚手架 [预估 2-3h]
- 创建 `export-engine/` 项目结构
- 实现 CLI 入口（`__main__.py`）
- 编写 `build.py` PyInstaller 构建脚本
- 创建 `src-tauri/binaries/` 目录 + `.gitkeep`
- 在 CI 中添加 PyInstaller 构建步骤

### Step 5: Rust 端 Sidecar 集成 [预估 1-2h]
- 修改 `export.rs` 签名，接受 `AppHandle` 参数
- 实现 sidecar 路径解析 + 子进程调用
- 修改 `lib.rs` 中的 command 函数透传 `app`
- 注册 updater 和 process 插件

### Step 6: 前端 Updater 集成 [预估 1h]
- 安装 `@tauri-apps/plugin-updater` + `@tauri-apps/plugin-process`
- 实现更新检查 UI（设置页面或菜单栏）

### Step 7: GitHub Actions CI/CD [预估 1h]
- 创建 `.github/workflows/build.yml`
- 配置 matrix（Windows + macOS ARM/Intel + Linux）
- 配置 Secrets（签名密钥、GITHUB_TOKEN）
- 测试触发构建

### Step 8: 端到端验证 [预估 2h]
- 推送 tag 触发 CI
- 验证四个平台产物生成
- 下载安装包，本地安装测试
- 验证自动更新流程

---

## 产出文件清单

| 文件 | 操作 |
|------|------|
| `src-tauri/tauri.conf.json` | 修改 — 添加 bundle + plugins 段 |
| `src-tauri/Cargo.toml` | 修改 — 添加 tauri-plugin-updater 依赖 |
| `src-tauri/src/lib.rs` | 修改 — 注册插件 + command 签名调整 |
| `src-tauri/core/src/services/export.rs` | 修改 — sidecar 调用实现 |
| `src-tauri/build.rs` | 可能修改 — Windows icon 配置 |
| `src-tauri/capabilities/default.json` | 可能修改 — shell 权限（如需 JS 调用 sidecar） |
| `src-tauri/icons/*` | 替换 — 真实图标资源 |
| `src-tauri/binaries/.gitkeep` | 新建 — sidecar 二进制目录 |
| `.github/workflows/build.yml` | 新建 — CI/CD 流水线 |
| `export-engine/*` | 新建 — Python 导出引擎（脚手架） |
| `package.json` | 修改 — 添加 updater 前端依赖 |
| `src/services/exportService.ts` | 可能修改 — 更新调用方式 |

## 验证方式

1. **本机构建**: `pnpm tauri build` → 检查生成安装包（至少本平台可用）
2. **CI 构建**: 推送 tag → 检查 GitHub Actions 四个 matrix job 全部成功
3. **安装测试**: 下载各平台安装包 → 安装 → 启动 → 验证基本功能
4. **自动更新**: 安装旧版本 → 推送新 tag → 应用内检测到更新 → 安装并重启
5. **导出引擎**: 应用内触发 CHM/Nginx 导出 → 验证 sidecar 被正确调用
