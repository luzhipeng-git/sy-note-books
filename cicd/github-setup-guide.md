# GitHub CI/CD 提交操作指引

本文档指导你从零开始，将 sy-note-books（书昀笔记电子书）项目接入 GitHub Actions 自动构建。

**前置阅读**：先通读 [packaging-plan.md](./packaging-plan.md) 了解整体方案。

---

## 第一步：前置条件检查

在终端确认以下工具已安装：

```bash
git --version          # 需要 git 2.x
node -v                # 需要 Node.js 22+（当前项目用 v25.9.0）
pnpm -v                # 需要 pnpm 9+
```

如果缺少任何工具，先安装再继续。

---

## 第二步：创建 GitHub 仓库

### 网页操作（推荐）

1. 登录 [github.com](https://github.com)
2. 点击右上角 **`+`** → **`New repository`**
3. 填写信息：
   - **Repository name**：`sy-note-books`
   - **Description**：`书昀笔记电子书 — 面向技术写作者的桌面笔记应用`
   - **可见性**：选 Public（公开仓库 Actions 分钟数无限）或 Private（私有仓库每月 2000 分钟免费额度）
   - **不要**勾选 "Add a README file"、"Add .gitignore"、"Choose a license"（项目已有这些文件）
4. 点击 **`Create repository`**
5. 创建后页面会显示仓库 URL，形如：
   ```
   https://github.com/luzhipeng-git/sy-note-books.git
   ```
   记下这个 URL，下一步要用。

### 本地初始化并推送

```bash
cd /home/zhipeng/workspace/desktop-soft/my-note-book

# 初始化 git 仓库
git init

# 添加所有文件
git add .

# 首次提交
git commit -m "feat: initial commit"

# 添加远程仓库（替换 <你的用户名>）
git remote add origin https://github.com/luzhipeng-git/sy-note-books.git

# 推送到 GitHub
git branch -M main
git push -u origin main
```

推送完成后，刷新 GitHub 仓库页面，应该能看到所有项目文件。

---

## 第三步：生成 Tauri 更新签名密钥

这一步生成一对密钥：**私钥**用于 CI 签名更新包，**公钥**写入应用配置用于验证签名。

```bash
cd /home/zhipeng/workspace/desktop-soft/my-note-book

# 生成密钥对 （密码lzp2006new）
pnpm tauri signer generate -w ~/.tauri/synote.key
```

运行后交互过程：

```

Your keypair was generated successfully:
Private: /home/zhipeng/.tauri/synote.key (Keep it secret!)
Public: /home/zhipeng/.tauri/synote.key.pub
---------------------------

Environment variables used to sign:
- `TAURI_SIGNING_PRIVATE_KEY`: String of your private key
- `TAURI_SIGNING_PRIVATE_KEY_PATH`: Path to your private key file
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`:  Your private key password (optional if key has no password)

ATTENTION: If you lose your private key OR password, you'll not be able to sign your update package and updates will not work

```

**⚠️ 重要：保存好以下三项信息**

| 产出物 | 位置 | 用途 |
|--------|------|------|
| 公钥字符串 | 终端输出 | 写入 `tauri.conf.json` 的 `plugins.updater.pubkey` |
| 私钥文件 | `~/.tauri/synote.key` | 配置到 GitHub Secrets |
| 私钥密码 | 你输入的密码 | 配置到 GitHub Secrets |

### 写入公钥

复制终端输出的公钥字符串（`dW50cnVzdGVk...` 开头的整行），后续修改 `tauri.conf.json` 时填入 `plugins.updater.pubkey` 字段。

> 注意：公钥配置是代码修改的一部分，在实际打包配置阶段（参考 [packaging-plan.md Step 3](./packaging-plan.md)）统一执行。这里先生成密钥备用。

---

## 第四步：配置 GitHub Secrets

GitHub Secrets 是加密存储的敏感信息，CI 流水线运行时可以读取，但不会在日志中泄露。

### 操作路径（⚠️ 是仓库的 Settings，不是账号的 Settings）

1. 打开你的 GitHub **仓库页面**（`https://github.com/luzhipeng-git/sy-note-books`）
2. 点击仓库页面中的 **`Settings`** 标签页（注意：不是右上角头像里的 Settings，那是账号级的）
3. 左侧菜单找到 **`Secrets and variables`** → **`Actions`**
4. 点击 **`New repository secret`**

> **区分方法**：账号 Settings 的 URL 是 `github.com/settings/...`，仓库 Settings 的 URL 是 `github.com/<用户名>/<仓库名>/settings/...`

### 需要配置的 Secrets

#### ✅ 必须配置（首次构建前必须完成）

| Secret 名称 | 填什么值 | 从哪获取 |
|-------------|---------|---------|
| `TAURI_SIGNING_PRIVATE_KEY` | 私钥文件的**完整内容** | 打开 `~/.tauri/synote.key`，复制全部内容粘贴 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 你在第三步设定的密码 | 你自己设定的密码 |

> `GITHUB_TOKEN` **不需要手动配置**——GitHub Actions 自动提供，无需添加。

#### 配置方法（每个 Secret 重复以下步骤）

1. 在 **Name** 输入框填入 Secret 名称（如 `TAURI_SIGNING_PRIVATE_KEY`，**必须完全一致，区分大小写**）
2. 在 **Secret** 输入框填入对应的值
3. 点击 **`Add secret`**
4. 添加后列表中会出现该 Secret（值被隐藏，只显示最后更新时间）

**查看私钥内容的方法**：

```bash
cat ~/.tauri/synote.key
# 复制输出的全部内容（包括 -----BEGIN 和 -----END 行）
```

#### ⏳ 暂不需要配置（备忘，后续有 Apple Developer 账号时添加）

| Secret 名称 | 用途 |
|-------------|------|
| `APPLE_CERTIFICATE` | base64 编码的 .p12 开发者证书 |
| `APPLE_CERTIFICATE_PASSWORD` | .p12 证书密码 |
| `APPLE_ID` | Apple ID 邮箱 |
| `APPLE_PASSWORD` | App 专用密码 |
| `APPLE_TEAM_ID` | 开发者团队 ID |

---

## 第五步：创建 CI/CD 工作流文件

在项目中创建 `.github/workflows/build.yml`，内容直接使用 [packaging-plan.md Part 4](./packaging-plan.md) 中的完整 workflow YAML。

```bash
# 创建目录
mkdir -p .github/workflows

# 创建工作流文件（内容见 packaging-plan.md 4.1 节）
```

将 `packaging-plan.md` 中 **4.1 流水线结构** 的 YAML 代码完整复制到 `.github/workflows/build.yml`，然后提交推送：

```bash
git add .github/workflows/build.yml
git commit -m "ci: add GitHub Actions build workflow"
git push
```

---

## 第六步：触发首次构建

CI 流水线的触发条件是 **推送 `v*` 格式的 tag**。

```bash
# 打 tag
git tag v0.1.0

# 推送 tag 到 GitHub
git push origin v0.1.0
```

### 观察构建进度

1. 打开 GitHub 仓库页面
2. 点击顶部 **`Actions`** 标签页
3. 左侧可以看到 **`Build & Release`** 工作流
4. 点击最新的运行记录，查看四个 matrix job 的实时状态：
   - `build (windows-latest)`
   - `build (macos-latest, aarch64)` — Apple Silicon
   - `build (macos-latest, x86_64)` — Intel
   - `build (ubuntu-22.04)`

### 构建完成后

1. 点击仓库的 **`Releases`** 页面
2. 应该能看到 `v0.1.0` 版本，附带四个平台的安装包：
   - Windows: `.exe`（NSIS 安装包）
   - macOS ARM: `.dmg`
   - macOS Intel: `.dmg`
   - Linux: `.AppImage` + `.deb`

---

## 手动触发构建（可选）

如果不想打 tag，也可以手动触发：

1. GitHub 仓库 → **`Actions`** → 左侧选 **`Build & Release`**
2. 点击右侧 **`Run workflow`** 按钮
3. 选择分支（`main`），点击 **`Run workflow`**

> 手动触发的构建**不会**创建 Release，只验证构建流程是否通畅。

---

## 常见问题排查

### 构建失败：`TAURI_SIGNING_PRIVATE_KEY` 未配置

**表现**：Actions 日志中报签名相关错误。

**解决**：回到第四步，确认 Secret 名称拼写正确（区分大小写），值是私钥文件的完整内容。

### 构建失败：版本号注入失败

**表现**：`Set version from tag` 步骤报错。

**解决**：
- 确认 tag 格式是 `v` 开头，如 `v0.1.0`（不是 `0.1.0`）
- 确认 `src-tauri/tauri.conf.json` 和 `src-tauri/Cargo.toml` 中有 `version` 字段

### macOS：无法打开应用（未签名）

**现象**：双击 DMG 安装后打开应用，提示"无法验证开发者"。

**解决**：
1. 右键点击应用 → **`打开`**
2. 弹窗中再次点击 **`打开`**
3. 或在 **系统偏好设置 → 隐私与安全性** 中点击 **`仍要打开`**

> 这是正常的——当前未配置 Apple Developer 签名公证。

### Windows：安装时下载 WebView2

**现象**：NSIS 安装包安装过程中会下载 WebView2 运行时。

**说明**：这是正常行为。Tauri 2 依赖 WebView2，`tauri.conf.json` 配置了 `webviewInstallMode: downloadBootstrapper`，会自动处理。Windows 10/11 通常已预装 WebView2，安装会自动跳过。

### Linux：AppImage 无法运行

**解决**：
```bash
chmod +x synote-note-books_0.1.0_amd64.AppImage
./synote-note-books_0.1.0_amd64.AppImage
```

如果仍报 FUSE 错误，用 `--appimage-extract` 解压后运行：
```bash
./synote-note-books_0.1.0_amd64.AppImage --appimage-extract
./squashfs-root/synote-note-books
```

---

## 操作清单（Checklist）

按顺序打勾，全部完成后即可触发构建：

- [ ] 安装 git / Node.js / pnpm
- [ ] 在 GitHub 创建仓库 `sy-note-books`
- [ ] 本地 `git init` + `git remote add` + 首次推送
- [ ] 运行 `pnpm tauri signer generate` 生成密钥对
- [ ] 复制公钥备用（后续写入 `tauri.conf.json`）
- [ ] 在 GitHub 仓库 Settings → Secrets 中配置 `TAURI_SIGNING_PRIVATE_KEY`
- [ ] 在 GitHub 仓库 Settings → Secrets 中配置 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- [ ] 创建 `.github/workflows/build.yml` 并推送
- [ ] 完成 `tauri.conf.json` 的 bundle 和 plugins.updater 配置（见 packaging-plan.md Part 1）
- [ ] 推送 tag `v0.1.0` 触发首次构建
- [ ] 在 Actions 页面确认四个 job 全部通过
- [ ] 在 Releases 页面确认安装包已上传
