#!/usr/bin/env bash
# create-test-workspace.sh — 在 Docker 容器内创建 E2E 测试用 workspace fixture
#
# 用途：
#   Docker 容器内运行 E2E 测试前，调用此脚本创建一个合法的 workspace 目录。
#   Rust 后端的 open_workspace 会读取此目录中的 workspace.json 和 SUMMARY.md。
#
# 调用方式（在 e2e-docker.sh 中自动调用）：
#   bash scripts/create-test-workspace.sh /tmp/synote-test-workspace

set -euo pipefail

WS_DIR="${1:-/tmp/synote-test-workspace}"

echo "[fixture] Creating test workspace at: $WS_DIR"

# 创建目录结构
mkdir -p "$WS_DIR"
mkdir -p "$WS_DIR/01-getting-started"
mkdir -p "$WS_DIR/02-architecture"
mkdir -p "$WS_DIR/03-api-reference"
mkdir -p "$WS_DIR/appendix"
mkdir -p "$WS_DIR/assets"

# ─── workspace.json ──────────────────────────────────────

cat > "$WS_DIR/workspace.json" << 'EOF'
{
  "title": "E2E测试文档",
  "author": "E2E Tester",
  "language": "zh-CN",
  "version": "1.0.0",
  "created": "2026-06-02"
}
EOF

# ─── SUMMARY.md ──────────────────────────────────────────

cat > "$WS_DIR/SUMMARY.md" << 'EOF'
# Summary

- [入门指南](01-getting-started/index.md)
  - [快速开始](01-getting-started/quickstart.md)
  - [安装说明](01-getting-started/install.md)
- [系统架构](02-architecture/index.md)
  - [架构概览](02-architecture/overview.md)
  - [API 总览](02-architecture/api-overview.md)
- [API 参考](03-api-reference/index.md)
  - [接口文档](03-api-reference/endpoints.md)
  - [数据模型](03-api-reference/data-models.md)
- [附录](appendix/index.md)
  - [更新日志](appendix/changelog.md)
EOF

# ─── 各章节 .md 文件 ────────────────────────────────────

cat > "$WS_DIR/01-getting-started/index.md" << 'EOF'
# 入门指南

欢迎使用书昀笔记电子书。本章节介绍如何快速上手。
EOF

cat > "$WS_DIR/01-getting-started/quickstart.md" << 'EOF'
# 快速开始

## 系统要求

- macOS 12+、Windows 10+ 或 Linux
- 100MB 磁盘空间

## 安装步骤

1. 下载安装包
2. 运行安装程序
3. 启动应用
EOF

cat > "$WS_DIR/01-getting-started/install.md" << 'EOF'
# 安装说明

## macOS

拖拽到 Applications 目录。

## Windows

运行 .exe 安装程序。

## Linux

```bash
sudo dpkg -i synote-books.deb
```
EOF

cat > "$WS_DIR/02-architecture/index.md" << 'EOF'
# 系统架构

应用采用 Tauri 2.x + React 19 架构。

核心组件：
- API 网关 — 请求路由
- 业务服务 — 核心逻辑
- 数据层 — PostgreSQL + Redis
EOF

cat > "$WS_DIR/02-architecture/overview.md" << 'EOF'
# 架构概览

## 前端架构

React 19 + Zustand 状态管理 + Vditor 编辑器。

## 后端架构

Rust + Tauri 2.x IPC 通信。
EOF

cat > "$WS_DIR/02-architecture/api-overview.md" << 'EOF'
# API 总览

所有 IPC 调用通过 `invokeIPC()` 代理。

## 认证接口

- POST /auth/login
- POST /auth/refresh

## 用户接口

- GET /users
- GET /users/:id
EOF

cat > "$WS_DIR/03-api-reference/index.md" << 'EOF'
# API 参考

所有接口使用 JSON 格式通信。

## 请求格式

Content-Type: application/json
EOF

cat > "$WS_DIR/03-api-reference/endpoints.md" << 'EOF'
# 接口文档

## 文件操作

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /files | 列出文件 |
| POST | /files | 创建文件 |
| PUT | /files/:id | 更新文件 |
EOF

cat > "$WS_DIR/03-api-reference/data-models.md" << 'EOF'
# 数据模型

## 用户模型

| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 用户 ID |
| name | string | 用户名 |
| email | string | 邮箱 |
EOF

cat > "$WS_DIR/appendix/index.md" << 'EOF'
# 附录

## 更新日志

详见 changelog.md。
EOF

cat > "$WS_DIR/appendix/changelog.md" << 'EOF'
# 更新日志

## v1.0.0 (2026-06-02)

### 新增
- Workspace 管理
- Markdown 编辑器
- 白板画图
- 全文搜索
- 多格式导出
EOF

# ─── Assets ─────────────────────────────────────────────

# 创建测试用 SVG 文件
cat > "$WS_DIR/assets/index-img-001.svg" << 'EOF'
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <rect width="100" height="100" fill="#4A90D9" rx="8"/>
  <text x="50" y="55" text-anchor="middle" fill="white" font-size="14">Test</text>
</svg>
EOF

echo "[fixture] Test workspace created successfully."
echo "[fixture]   Directory: $WS_DIR"
echo "[fixture]   Files: $(find "$WS_DIR" -type f | wc -l)"
echo "[fixture]   Size: $(du -sh "$WS_DIR" | cut -f1)"
