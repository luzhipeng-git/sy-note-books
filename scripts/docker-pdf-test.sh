#!/usr/bin/env bash
# docker-pdf-test.sh — Run PDF export tests inside Docker containers
#
# Simulates different OS environments to verify Rust PDF export works
# correctly across platforms (font loading, image handling, CJK text).
#
# Usage:
#   ./scripts/docker-pdf-test.sh              # Run all PDF tests in Fedora Docker
#   ./scripts/docker-pdf-test.sh --rebuild    # Force rebuild base image (after Dockerfile change)
#   ./scripts/docker-pdf-test.sh --verbose    # Show full test output
#
# Prerequisites:
#   - Docker CE installed and running
#   - synote-tauri:base image built (auto-built if missing)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

BASE_IMAGE="synote-tauri:base"
CARGO_TARGET_VOL="synote-cargo-target"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }

# ── Parse arguments ──────────────────────────────────────────
REBUILD=false
VERBOSE=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --rebuild) REBUILD=true; shift ;;
    --verbose) VERBOSE=true; shift ;;
    *) log_error "Unknown argument: $1"; exit 1 ;;
  esac
done

# ── Step 1: Build base image if needed ───────────────────────
if [ "$REBUILD" = true ] || ! docker image inspect "$BASE_IMAGE" &>/dev/null; then
  log_step "Building base image: $BASE_IMAGE (with CJK + mono fonts)"
  if ! docker build -t "$BASE_IMAGE" --target base -f "$PROJECT_DIR/src-tauri/docker/Dockerfile" "$PROJECT_DIR"; then
    log_error "Base image build failed."
    exit 1
  fi
  log_info "Base image built successfully."
else
  log_info "Base image $BASE_IMAGE up to date."
fi

# ── Step 2: Ensure cargo cache volume exists ─────────────────
docker volume create "$CARGO_TARGET_VOL" &>/dev/null || true

# ── Step 3: Run PDF export tests in Docker ───────────────────
log_step "Running PDF export tests in Docker container (Fedora 41)..."

CARGO_VERBOSE=""
if [ "$VERBOSE" = true ]; then
  CARGO_VERBOSE="-- --nocapture"
fi

docker run --rm \
  -v "$PROJECT_DIR:/workspace" \
  -v "$CARGO_TARGET_VOL:/opt/cargo-target" \
  -e CARGO_TARGET_DIR=/opt/cargo-target \
  "$BASE_IMAGE" \
  bash -c '
    set -euo pipefail
    source /root/.cargo/env 2>/dev/null || true

    echo "═══════════════════════════════════════════════"
    echo "  PDF Export Cross-Platform Test"
    echo "  Environment: Docker Fedora 41"
    echo "═══════════════════════════════════════════════"
    echo ""

    # ─── Verify font availability ─────────────────
    echo "[1/3] Checking font availability..."
    FONT_OK=true

    # CJK fonts
    CJK_FONT=""
    for f in \
      /usr/share/fonts/google-noto-sans-cjk-fonts/NotoSansCJK-Regular.ttc \
      /usr/share/fonts/google-noto-cjk/NotoSansCJK-Regular.ttc \
      /usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc \
      /usr/share/fonts/google-droid-sans-fonts/DroidSansFallbackFull.ttf
    do
      if [ -f "$f" ]; then
        CJK_FONT="$f"
        echo "  ✅ CJK font: $f"
        break
      fi
    done
    if [ -z "$CJK_FONT" ]; then
      echo "  ❌ No CJK font found!"
      FONT_OK=false
    fi

    # Mono fonts
    MONO_FONT=""
    for f in \
      /usr/share/fonts/dejavu-sans-mono-fonts/DejaVuSansMono.ttf \
      /usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf \
      /usr/share/fonts/liberation-mono/LiberationMono-Regular.ttf
    do
      if [ -f "$f" ]; then
        MONO_FONT="$f"
        echo "  ✅ Mono font: $f"
        break
      fi
    done
    if [ -z "$MONO_FONT" ]; then
      echo "  ❌ No mono font found!"
      FONT_OK=false
    fi

    if [ "$FONT_OK" = false ]; then
      echo "ERROR: Required fonts not available. PDF export tests will fail."
      exit 1
    fi
    echo ""

    # ─── Build and test core crate ────────────────
    echo "[2/3] Building core crate..."
    cd /workspace/src-tauri/core
    cargo build 2>&1 | tail -3
    echo ""

    # ─── Run PDF export tests ─────────────────────
    echo "[3/3] Running PDF export tests..."
    echo "─────────────────────────────────────────────────"
    cargo test pdf_export '"$CARGO_VERBOSE"' 2>&1
    TEST_EXIT=$?
    echo "─────────────────────────────────────────────────"
    echo ""

    if [ $TEST_EXIT -eq 0 ]; then
      echo "  ✅ All PDF export tests passed in Docker Fedora!"
    else
      echo "  ❌ PDF export tests failed in Docker Fedora."
    fi

    exit $TEST_EXIT
  '

TEST_EXIT=$?

echo ""
if [ $TEST_EXIT -eq 0 ]; then
  log_info "PDF export tests passed in Docker Fedora 41 ✅"
else
  log_error "PDF export tests failed in Docker Fedora 41 ❌"
  exit $TEST_EXIT
fi
