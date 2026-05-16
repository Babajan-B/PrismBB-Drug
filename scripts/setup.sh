#!/usr/bin/env bash
# =============================================================================
# PrismBB Drug — bootstrap script (Linux / macOS)
# Usage:   bash scripts/setup.sh        (from repo root)
# =============================================================================
set -euo pipefail

REPO_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$REPO_ROOT"

# ---- 1. find a usable Python ------------------------------------------------
PYTHON="${PYTHON:-python3}"
if ! command -v "$PYTHON" >/dev/null; then
    echo "❌  Python not found. Install Python 3.10+ first." >&2
    exit 1
fi

PYVER=$("$PYTHON" -c 'import sys; print("%d.%d" % sys.version_info[:2])')
echo "→ Using Python $PYVER ($PYTHON)"
"$PYTHON" -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)' || {
    echo "❌  Python 3.10+ required (have $PYVER)." >&2
    exit 1
}

# ---- 2. create / reuse venv -------------------------------------------------
VENV_DIR="${VENV_DIR:-venv}"
if [ ! -d "$VENV_DIR" ]; then
    echo "→ Creating venv at $VENV_DIR"
    "$PYTHON" -m venv "$VENV_DIR"
fi
# shellcheck source=/dev/null
source "$VENV_DIR/bin/activate"

# ---- 3. install requirements ------------------------------------------------
pip install --upgrade pip
echo "→ Installing dependencies (this may take a few minutes — torch is large)"
pip install -r requirements.txt

# ---- 4. detect Vina ---------------------------------------------------------
echo
if command -v vina >/dev/null; then
    echo "✓ AutoDock Vina detected at $(command -v vina)"
    echo "  Real docking is enabled."
else
    OS="$(uname -s)"
    echo "⚠  AutoDock Vina not found on PATH — docking will run in STUB mode."
    case "$OS" in
        Linux)
            echo "  Install on Debian/Ubuntu:   sudo apt-get install autodock-vina"
            echo "  Install on Fedora:          sudo dnf install autodock-vina"
            ;;
        Darwin)
            echo "  Install on macOS:           conda install -c conda-forge vina"
            echo "  Homebrew may not provide an autodock-vina formula."
            echo "  or download:                https://vina.scripps.edu/downloads/"
            ;;
        *)  echo "  Download:                   https://vina.scripps.edu/downloads/" ;;
    esac
fi

# ---- 5. friendly hint -------------------------------------------------------
cat <<EOF

╔════════════════════════════════════════════════════════════════════════╗
║  Setup complete.                                                       ║
║                                                                        ║
║  Activate the env:                                                     ║
║      source $VENV_DIR/bin/activate                                     ║
║                                                                        ║
║  Run the backend:                                                      ║
║      cd backend && uvicorn app.main:app --reload --port 8000           ║
║                                                                        ║
║  Run the Flask UI (in another terminal):                               ║
║      cd flask_frontend && python app.py                                ║
║                                                                        ║
║  Open:  http://localhost:3000                                          ║
╚════════════════════════════════════════════════════════════════════════╝
EOF
