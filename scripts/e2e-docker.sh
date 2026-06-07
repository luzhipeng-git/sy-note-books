#!/usr/bin/env bash
# e2e-docker.sh — Run E2E tests inside Docker Fedora container
#
# Uses a two-stage Docker image + named volumes for fast iterative testing:
#   synote-tauri:base   — System deps + Rust + Node + pnpm + tauri-driver
#   synote-tauri:deps   — Extends base with pre-warmed pnpm store + cargo registry
#   Named volumes        — Persist pnpm store and cargo target across runs
#
# Usage:
#   ./scripts/e2e-docker.sh              # Run all E2E tests (smart deps image rebuild)
#   ./scripts/e2e-docker.sh --no-build   # Skip Docker image build entirely
#   ./scripts/e2e-docker.sh --base       # Force rebuild base image only
#   ./scripts/e2e-docker.sh --spec 07    # Run only spec file matching "07"
#   ./scripts/e2e-docker.sh --clean      # Remove cache volumes and deps image
#
# Output:
#   - Console: WDIO spec reporter (✅/❌ per test)
#   - e2e-tests/screenshots/   : Failure screenshots (PNG)
#   - e2e-tests/reports/       : JSON test report

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Image tags
BASE_IMAGE="synote-tauri:base"
DEPS_IMAGE="synote-tauri:deps"

# Named volumes for persistent caches
PNPM_STORE_VOL="synote-pnpm-store"
CARGO_TARGET_VOL="synote-cargo-target"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }

# ── Compute dependency hash for smart rebuild ────────────────
deps_hash() {
  # Hash all files that affect the deps image
  cat \
    "$PROJECT_DIR/package.json" \
    "$PROJECT_DIR/pnpm-lock.yaml" \
    "$PROJECT_DIR/pnpm-workspace.yaml" \
    "$PROJECT_DIR/.npmrc" \
    "$PROJECT_DIR/e2e-tests/package.json" \
    "$PROJECT_DIR/src-tauri/Cargo.toml" \
    "$PROJECT_DIR/src-tauri/Cargo.lock" \
    "$PROJECT_DIR/src-tauri/core/Cargo.toml" \
    2>/dev/null | md5sum | cut -d' ' -f1

  # Include patch files if they exist
  if [ -d "$PROJECT_DIR/patches" ]; then
    find "$PROJECT_DIR/patches" -type f -exec cat {} + 2>/dev/null | md5sum | cut -d' ' -f1
  fi
}

HASH_FILE="$PROJECT_DIR/.docker-deps-hash"

needs_deps_rebuild() {
  # No deps image → must build
  if ! docker image inspect "$DEPS_IMAGE" &>/dev/null; then
    return 0
  fi

  # No hash file → must build
  if [ ! -f "$HASH_FILE" ]; then
    return 0
  fi

  local current_hash
  current_hash=$(deps_hash)
  local saved_hash
  saved_hash=$(cat "$HASH_FILE")

  [ "$current_hash" != "$saved_hash" ]
}

# ── Parse arguments ──────────────────────────────────────────
SKIP_BUILD=false
FORCE_BASE=false
SPEC_FILTER=""
CLEAN=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --no-build) SKIP_BUILD=true; shift ;;
    --base) FORCE_BASE=true; shift ;;
    --spec) SPEC_FILTER="$2"; shift 2 ;;
    --clean) CLEAN=true; shift ;;
    *) log_warn "Unknown argument: $1"; shift ;;
  esac
done

# ── Clean mode ───────────────────────────────────────────────
if [ "$CLEAN" = true ]; then
  log_step "Cleaning Docker caches..."
  docker volume rm "$PNPM_STORE_VOL" 2>/dev/null && log_info "Removed $PNPM_STORE_VOL" || true
  docker volume rm "$CARGO_TARGET_VOL" 2>/dev/null && log_info "Removed $CARGO_TARGET_VOL" || true
  docker rmi "$DEPS_IMAGE" 2>/dev/null && log_info "Removed $DEPS_IMAGE" || true
  rm -f "$HASH_FILE"
  log_info "Clean complete."
  exit 0
fi

# ── Step 1: Build Docker image(s) ────────────────────────────
if [ "$SKIP_BUILD" = false ]; then
  # Build base image if needed
  if [ "$FORCE_BASE" = true ] || ! docker image inspect "$BASE_IMAGE" &>/dev/null; then
    log_step "Building base image: $BASE_IMAGE"
    if ! docker build -t "$BASE_IMAGE" --target base -f "$PROJECT_DIR/src-tauri/docker/Dockerfile" "$PROJECT_DIR"; then
      log_error "Base image build failed."
      exit 1
    fi
    log_info "Base image built successfully."
  else
    log_info "Base image $BASE_IMAGE up to date."
  fi

  # Build deps image if dependency files changed
  if needs_deps_rebuild; then
    log_step "Building deps image: $DEPS_IMAGE (dependencies changed)"
    if ! docker build -t "$DEPS_IMAGE" -f "$PROJECT_DIR/src-tauri/docker/Dockerfile" "$PROJECT_DIR"; then
      log_error "Deps image build failed."
      exit 1
    fi
    deps_hash > "$HASH_FILE"
    log_info "Deps image built successfully."
  else
    log_info "Deps image $DEPS_IMAGE up to date (dependencies unchanged)."
  fi
else
  log_info "Skipping Docker image build (--no-build)."
  # Ensure at least base image exists for backward compat
  if docker image inspect "$DEPS_IMAGE" &>/dev/null; then
    : # deps image exists, use it
  elif docker image inspect "synote-tauri:fedora" &>/dev/null; then
    # Legacy image name fallback
    DEPS_IMAGE="synote-tauri:fedora"
    log_warn "Using legacy image synote-tauri:fedora. Run without --no-build to build new images."
  else
    log_error "No Docker image found. Run without --no-build first."
    exit 1
  fi
fi

# ── Step 2: Clean old reports ────────────────────────────────
rm -rf "$PROJECT_DIR/e2e-tests/screenshots/FAIL_"*.png 2>/dev/null || true
rm -rf "$PROJECT_DIR/e2e-tests/reports/"*.json 2>/dev/null || true

# ── Step 3: Ensure named volumes exist ───────────────────────
docker volume create "$PNPM_STORE_VOL" &>/dev/null || true
docker volume create "$CARGO_TARGET_VOL" &>/dev/null || true

# ── Step 4: Run E2E tests inside container ───────────────────
log_step "Running E2E tests in Docker container..."

# Build spec filter argument for WDIO
WDIO_SPEC_ARG=""
if [ -n "$SPEC_FILTER" ]; then
  WDIO_SPEC_ARG="--spec ./specs/${SPEC_FILTER}*.spec.ts"
  log_info "Running only specs matching: ${SPEC_FILTER}*.spec.ts"
fi

docker run --rm \
  -v "$PROJECT_DIR:/workspace" \
  -v "$PNPM_STORE_VOL:/root/.local/share/pnpm/store" \
  -v "$CARGO_TARGET_VOL:/opt/cargo-target" \
  -e DISPLAY=:99 \
  -e CI=true \
  -e CARGO_TARGET_DIR=/opt/cargo-target \
  "$DEPS_IMAGE" \
  bash -c '
    set -euo pipefail

    # Set up PATH for Rust, pnpm, and system binaries
    source /root/.cargo/env 2>/dev/null || true
    export PATH="/root/.local/share/pnpm:/usr/bin:/usr/sbin:/usr/local/bin:$PATH"

    # Disable pnpm supply-chain policy checks for CI
    pnpm config set minimum-release-age 0 --location=global 2>/dev/null || true

    # Initialize PID variables for cleanup
    TAURI_DRIVER_PID=""
    XVFB_PID=""

    cleanup() {
      echo ""
      echo "[container] Cleaning up..."
      [ -n "$TAURI_DRIVER_PID" ] && kill $TAURI_DRIVER_PID 2>/dev/null || true
      [ -n "$XVFB_PID" ] && kill $XVFB_PID 2>/dev/null || true
      echo "[container] Done."
    }
    trap cleanup EXIT

    echo "═══════════════════════════════════════════════"
    echo "  sy-note-books E2E Test Suite"
    echo "  Environment: Docker Fedora + Tauri + Xvfb"
    echo "  Cache: pnpm-store=$(ls /root/.local/share/pnpm/store 2>/dev/null | wc -l) pkgs, cargo-target=$(du -sh /opt/cargo-target 2>/dev/null | cut -f1 || echo empty)"
    echo "═══════════════════════════════════════════════"
    echo ""

    # ─── Step 1: Start virtual display ──────────────
    echo "[1/5] Starting Xvfb on :99..."
    Xvfb :99 -screen 0 1440x900x24 &
    XVFB_PID=$!
    sleep 1

    # ─── Step 2: Install dependencies ───────────────
    echo "[2/5] Installing dependencies (from cache)..."
    cd /workspace

    # Remove host node_modules to avoid arch/node-version incompatibility
    rm -rf node_modules e2e-tests/node_modules

    # pnpm install uses the warm store (hardlinks, no downloads)
    START_TS=$(date +%s)
    pnpm install --no-frozen-lockfile --config.minimum-release-age=0 2>&1 || true

    # Approve required build scripts for CI
    pnpm approve-builds esbuild edgedriver geckodriver 2>/dev/null || true
    pnpm install --no-frozen-lockfile --config.minimum-release-age=0 2>&1 || true
    END_TS=$(date +%s)
    echo "  pnpm install (root): $((END_TS - START_TS))s"

    # Add node_modules/.bin to PATH so vite/tauri are available
    export PATH="/workspace/node_modules/.bin:$PATH"

    cd /workspace/e2e-tests
    START_TS=$(date +%s)
    pnpm install --no-frozen-lockfile --config.minimum-release-age=0 2>&1 || true
    END_TS=$(date +%s)
    echo "  pnpm install (e2e): $((END_TS - START_TS))s"

    # ─── Step 3: Create test workspace fixture ──────
    echo "[3/5] Creating test workspace fixture..."
    bash /workspace/scripts/create-test-workspace.sh /tmp/synote-test-workspace

    # ─── Step 4: Build Tauri app ────────────────────
    echo "[4/5] Building Tauri app in debug mode..."
    cd /workspace
    START_TS=$(date +%s)
    pnpm tauri build --debug --no-bundle 2>&1
    END_TS=$(date +%s)
    echo "  cargo build: $((END_TS - START_TS))s"

    # Symlink so wdio.conf.ts finds the binary at the expected path
    # (when CARGO_TARGET_DIR is set, binary is at /opt/cargo-target/debug/...)
    mkdir -p /workspace/src-tauri/target
    ln -sf /opt/cargo-target/debug /workspace/src-tauri/target/debug 2>/dev/null || true

    # ─── Step 5: Run tests ─────────────────────────
    # NOTE: tauri-driver is managed by wdio.conf.ts beforeSession/afterSession
    echo "[5/5] Running WebDriverIO E2E tests..."
    echo "─────────────────────────────────────────────────"
    cd /workspace/e2e-tests
    npx wdio run wdio.conf.ts --no-build '"$WDIO_SPEC_ARG"' 2>&1
    TEST_EXIT=$?
    echo "─────────────────────────────────────────────────"

    if [ $TEST_EXIT -eq 0 ]; then
      echo ""
      echo "  ✅ All E2E tests passed!"
    else
      echo ""
      echo "  ❌ Some tests failed. Check screenshots and reports."
      echo "     Screenshots: /workspace/e2e-tests/screenshots/"
      echo "     Reports:     /workspace/e2e-tests/reports/"
    fi

    exit $TEST_EXIT
  '

TEST_EXIT=$?

echo ""
if [ $TEST_EXIT -eq 0 ]; then
  log_info "All E2E tests passed! ✅"
else
  log_error "E2E tests failed with exit code $TEST_EXIT ❌"

  # Show failure screenshots if any
  FAIL_COUNT=$(ls -1 "$PROJECT_DIR/e2e-tests/screenshots/FAIL_"*.png 2>/dev/null | wc -l)
  if [ "$FAIL_COUNT" -gt 0 ]; then
    log_warn "Failure screenshots ($FAIL_COUNT):"
    ls -1 "$PROJECT_DIR/e2e-tests/screenshots/FAIL_"*.png | while read f; do
      echo "  📸 $(basename "$f")"
    done
  fi

  # Show report location
  if [ -f "$PROJECT_DIR/e2e-tests/reports/wdio-report-0.json" ]; then
    log_info "JSON report: e2e-tests/reports/wdio-report-0.json"
  fi

  exit $TEST_EXIT
fi
