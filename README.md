# PrismBB Drug — AI-Powered Drug Discovery Platform

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/Babajan-B/PrismBB-Drug/blob/main/colab/PrismBB_Drug.ipynb)
[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.112%2B-009688.svg)](https://fastapi.tiangolo.com/)
[![RDKit](https://img.shields.io/badge/RDKit-2024%2B-orange.svg)](https://www.rdkit.org/)
[![AutoDock Vina](https://img.shields.io/badge/AutoDock-Vina-7c5cff.svg)](https://vina.scripps.edu/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **PrismBB Drug** is a complete computational-chemistry workbench: SMILES
> parsing, 17+ molecular descriptors, 3D conformer generation, **104 ADMET
> predictions**, and full **AutoDock Vina protein-ligand docking** — all
> behind a multi-agent FastAPI backend and a modern Flask UI.

![architecture](https://img.shields.io/badge/Architecture-Multi--Agent-success)
![cross-platform](https://img.shields.io/badge/OS-Linux%20%7C%20macOS%20%7C%20Windows-informational)

---

## 🚀 Try it in your browser — no install (recommended for new users)

[**👉 Open PrismBB Drug in Google Colab**](https://colab.research.google.com/github/Babajan-B/PrismBB-Drug/blob/main/colab/PrismBB_Drug.ipynb)

Zero installation. Free GPU. Real AutoDock Vina docking.

1. Click the badge above
2. In Colab, click **`Runtime` → `Run all`** (`Ctrl+F9` / `⌘F9`)
3. After ~3 minutes a big purple **"Open the app"** button appears — click it
4. Use PrismBB Drug in your browser

> The notebook gives you a temporary public URL you can share with others.
> For a permanent URL or production use, see the [installation options](#quick-start) below or [`DEPLOY.md`](DEPLOY.md).

---

## Features

### Molecular analysis
- **SMILES parser** — sanitization, InChI, InChIKey, formula
- **17+ descriptors** — LogP, TPSA, HBD/HBA, rotatable bonds, Lipinski, …
- **3D conformer generation** — UFF / MMFF force fields
- **104 ADMET predictions** — absorption, distribution, metabolism, excretion, toxicity (via [admet-ai](https://github.com/swansonk14/admet_ai))
- **Interactive 3D viewer** — powered by 3Dmol.js (WebGL)

### Molecular docking
- **PDBQT conversion** — PDB / SDF → PDBQT using Meeko + RDKit
- **AutoDock Vina docking** — protein-ligand with grid box, exhaustiveness, scoring function
- **Pose visualization** — receptor cartoon + docked ligand sticks
- **Stub fallback** — full UI still works if the Vina binary isn't installed (synthetic results)

### Multi-agent backend
Four cooperating Agno agents — each falls back to direct library calls
when no `GROQ_API_KEY` is set, so everything runs offline:
- **ParserAgent** — RDKit-based molecular parsing
- **ConformerAgent** — 3D structure generation
- **ADMETAgent** — ADMET predictions
- **RenderAgent** — payload aggregation

---

## Quick start

### Option 1 — Docker (any OS, one command)

```bash
git clone https://github.com/Babajan-B/PrismBB-Drug.git
cd PrismBB-Drug
docker compose up --build
```

Open **<http://localhost:3000>** — the UI; backend API is on `:8000`.

> First build takes ~10 min (PyTorch + admet-ai). Subsequent runs are seconds.
> Model weights persist in a Docker volume across restarts.

### Option 2 — Native install

#### Linux / macOS

```bash
git clone https://github.com/Babajan-B/PrismBB-Drug.git
cd PrismBB-Drug
bash scripts/setup.sh           # creates venv + installs all deps
bash scripts/run.sh             # starts backend + UI
```

#### Windows (PowerShell)

```powershell
git clone https://github.com/Babajan-B/PrismBB-Drug.git
cd PrismBB-Drug
.\scripts\setup.ps1             # creates venv + installs all deps
.\scripts\run.ps1               # starts backend + UI
```

The setup script will tell you whether AutoDock Vina is on your PATH.
**The full app works without Vina** — docking just runs in stub mode.

---

## Manual install (no scripts)

If you'd rather run the pip commands yourself:

```bash
# 1. Python 3.10+
python --version

# 2. Create venv
python -m venv venv
source venv/bin/activate                # Linux/macOS
# .\venv\Scripts\Activate.ps1           # Windows PowerShell

# 3. Install everything (~3 GB; PyTorch + admet-ai are large)
pip install --upgrade pip
pip install -r requirements.txt

# 4. Run backend (terminal #1)
cd backend
uvicorn app.main:app --reload --port 8000

# 5. Run UI (terminal #2)
cd flask_frontend
python app.py
```

---

## Installing AutoDock Vina (optional — for real docking)

Without Vina the docking workbench works but produces synthetic affinities.
The backend auto-detects the binary on startup — **no code change needed**.

| OS | Install command | Notes |
|---|---|---|
| **Ubuntu / Debian** | `sudo apt-get install autodock-vina` | Ships Vina 1.1 |
| **Fedora / RHEL** | `sudo dnf install autodock-vina` | |
| **macOS (Homebrew)** | `brew install autodock-vina` | |
| **macOS / Linux (manual)** | Download from <https://vina.scripps.edu/downloads/>, extract, add to `PATH` | |
| **Windows** | Download zip from <https://vina.scripps.edu/downloads/>, extract, add the folder containing `vina.exe` to `PATH` | |

Verify with:
```bash
vina --version
```

For Vina 1.2.x (recommended over 1.1), build from source or use a prebuilt
Docker image such as `ccsbk/autodock-vina:1.2.5`.

---

## Application URLs

| URL | What |
|---|---|
| <http://localhost:3000/> | Analyze (SMILES → descriptors + 3D + ADMET) |
| <http://localhost:3000/docking> | Molecular docking workbench |
| <http://localhost:3000/examples> | Curated example molecules |
| <http://localhost:3000/about> | Architecture overview |
| <http://localhost:8000/api/health> | Backend health |
| <http://localhost:8000/api/docking/health> | Docking capabilities + engine mode |
| <http://localhost:8000/docs> | Auto-generated Swagger UI |

---

## Testing

```bash
cd backend
pip install -r requirements-dev.txt
pytest -v
```

30 smoke tests cover RDKit utilities, agent toolkit, parser/conformer agents, and parametrized molecule examples.

---

## Project layout

```
.
├── backend/                      FastAPI + agents + services
│   ├── app/
│   │   ├── agents/               4 Agno agents + toolkit
│   │   ├── routes/               molecules.py, docking.py
│   │   ├── services/             rdkit_utils.py, molecular_docking.py, admet_ai_client.py
│   │   ├── models/schemas.py     pydantic models
│   │   └── main.py
│   ├── tests/test_smoke.py       30 tests
│   ├── Dockerfile
│   ├── requirements.txt
│   └── requirements-dev.txt
│
├── flask_frontend/               Jinja templates + vanilla JS UI
│   ├── app.py                    Flask app + proxy routes
│   ├── templates/                base, index, docking, examples, about
│   ├── static/css/style.css      v2 design system
│   ├── static/js/                main, analysis, docking, file-upload, viewer
│   ├── Dockerfile
│   └── requirements.txt
│
├── scripts/                      Cross-platform helpers
│   ├── setup.sh   setup.ps1      install dependencies
│   └── run.sh     run.ps1        launch backend + UI
│
├── colab/                        Zero-install cloud demo
│   └── PrismBB_Drug.ipynb        One-click Colab notebook (free GPU)
│
├── docker-compose.yml
├── render.yaml                   One-click Render Blueprint
├── requirements.txt              Combined backend + frontend
├── DEPLOY.md                     Deployment guide (Docker / Render / Fly / etc.)
└── README.md
```

---

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8000` / `3000` | Listen port (Render/Heroku inject this) |
| `BACKEND_URL` | `http://localhost:8000` | Where Flask proxies API calls |
| `GROQ_API_KEY` | _unset_ | Enable real Agno LLM agents (otherwise direct-library fallback) |
| `AGNO_TELEMETRY` | `false` | Disable Agno telemetry |
| `ADMET_AI_CACHE_DIR` | `/data/admet_ai` | Where torch model weights are cached |
| `HF_HOME` | `/data/huggingface` | HuggingFace transformers cache |
| `WEB_CONCURRENCY` | `1` (backend) / `2` (frontend) | Gunicorn worker count |
| `SECRET_KEY` | dev value | Flask session signing |

Copy `.env.example` → `.env` and edit as needed (picked up by Docker Compose).

---

## Deployment

See **[DEPLOY.md](DEPLOY.md)** for full guides for:
- Local Docker
- **Render.com** (one-click Blueprint via `render.yaml`)
- Fly.io
- Railway
- Google Cloud Run

---

## License

[MIT](LICENSE) — see file for details.
