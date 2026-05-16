#!/usr/bin/env bash
# Launches backend (port 8000) + Flask UI (port 3000) locally.
# Linux / macOS — for Windows use scripts/run.ps1
set -euo pipefail
REPO_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$REPO_ROOT"

VENV_DIR="${VENV_DIR:-venv}"
if [ ! -d "$VENV_DIR" ]; then
    echo "❌  venv not found. Run: bash scripts/setup.sh" >&2
    exit 1
fi
# shellcheck source=/dev/null
source "$VENV_DIR/bin/activate"

# AutoDock Vina is often installed through Conda/Miniforge on macOS. Make sure
# locally launched backend processes can discover a `vina` binary even when the
# shell that starts this script did not initialize Conda.
for dir in "$HOME/miniforge3/bin" "$HOME/miniconda3/bin" "$HOME/anaconda3/bin"; do
    if [ -x "$dir/vina" ]; then
        export PATH="$dir:$PATH"
        break
    fi
done

cleanup() { kill "${BACKEND_PID:-}" "${FRONTEND_PID:-}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "→ Starting FastAPI backend on http://localhost:8000"
( cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --log-level info ) &
BACKEND_PID=$!

# wait a moment for the backend to bind
sleep 3

echo "→ Starting Flask UI on http://localhost:3000"
( cd flask_frontend && BACKEND_URL=http://localhost:8000 python app.py ) &
FRONTEND_PID=$!

echo
echo "════════════════════════════════════════════════════════════"
echo "  UI:       http://localhost:3000"
echo "  API:      http://localhost:8000/api/health"
echo "  Docking:  http://localhost:3000/docking"
echo "  Ctrl-C to stop both servers"
echo "════════════════════════════════════════════════════════════"
wait
