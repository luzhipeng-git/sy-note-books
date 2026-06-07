# ═══════════════════════════════════════════════════════════════
# Multi-stage Docker image for Tauri 2.x compilation and E2E testing
#
# Build targets:
#   base  — System deps + Rust + Node + pnpm + tauri-driver (rarely changes)
#   deps  — Extends base with pre-warmed pnpm store + cargo registry
#
# Build:
#   docker build -t synote-tauri:base --target base -f src-tauri/docker/Dockerfile .
#   docker build -t synote-tauri:deps -f src-tauri/docker/Dockerfile .
#
# Run E2E tests (with persistent cache volumes):
#   ./scripts/e2e-docker.sh
#
# Run full Tauri build:
#   docker run --rm -v $(pwd):/workspace synote-tauri:deps \
#     sh -c "cd /workspace && pnpm install && pnpm tauri build"

# ── Stage 1: base ────────────────────────────────────────────
# System deps + toolchains. Rebuild only when system packages
# or Rust/Node versions change.
FROM fedora:41 AS base

# System dependencies for Tauri 2.x on Linux
RUN dnf install -y \
    webkit2gtk4.1-devel \
    webkitgtk6.0 \
    openssl-devel \
    curl \
    wget \
    file \
    libxkbcommon-devel \
    gtk3-devel \
    libappindicator-gtk3-devel \
    libayatana-appindicator-gtk3-devel \
    xorg-x11-server-Xvfb \
    dbus-x11 \
    atk-devel \
    at-spi2-atk-devel \
    cups-libs \
    pango-devel \
    cairo-devel \
    cairo-gobject-devel \
    gdk-pixbuf2-devel \
    libsoup3-devel \
    perl \
    gcc \
    gcc-c++ \
    make \
    cmake \
    && dnf clean all

# Install Rust (stable toolchain)
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"
RUN rustup default stable

# Install Node.js + pnpm
RUN dnf install -y nodejs npm && dnf clean all
RUN npm install -g pnpm@latest

# Install tauri-driver (WebDriver server for Tauri apps)
RUN cargo install tauri-driver --locked

WORKDIR /workspace
CMD ["bash"]

# ── Stage 2: deps ────────────────────────────────────────────
# Pre-warm dependency caches. Rebuild when package.json,
# pnpm-lock.yaml, Cargo.toml, or patches change.
FROM base AS deps

WORKDIR /opt/deps-prewarm

# --- pnpm dependency cache ---
# Copy only dependency manifests and patches (not source code)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches/ patches/
COPY e2e-tests/package.json e2e-tests/

# Pre-warm pnpm content-addressable store
# After install, /root/.local/share/pnpm/store contains all tarballs
RUN pnpm config set minimum-release-age 0 --location=global \
    && pnpm install --no-frozen-lockfile --config.minimum-release-age=0 \
    && pnpm approve-builds esbuild edgedriver geckodriver 2>/dev/null || true \
    && pnpm install --no-frozen-lockfile --config.minimum-release-age=0

# --- cargo dependency cache ---
# Copy Rust workspace manifests + lockfile
COPY src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/
COPY src-tauri/build.rs src-tauri/
COPY src-tauri/core/Cargo.toml src-tauri/core/

# Create dummy source files so cargo can resolve the workspace
RUN mkdir -p src-tauri/src \
    && echo "" > src-tauri/src/lib.rs \
    && echo "fn main(){}" > src-tauri/src/main.rs \
    && mkdir -p src-tauri/core/src \
    && echo "" > src-tauri/core/src/lib.rs

# Pre-fetch all Rust crate sources into cargo registry
RUN cd src-tauri && cargo fetch --locked 2>/dev/null || cargo fetch

# Discard node_modules and target — we only keep the caches:
#   /root/.local/share/pnpm/store  (pnpm tarball cache)
#   /root/.cargo/registry          (cargo crate sources)
RUN rm -rf /opt/deps-prewarm/node_modules \
    && rm -rf /opt/deps-prewarm/e2e-tests/node_modules \
    && rm -rf /opt/deps-prewarm/src-tauri/target

WORKDIR /workspace
CMD ["bash"]
