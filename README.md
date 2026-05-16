# PrismBB Drug — AI-Powered Drug Discovery Platform

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/Babajan-B/PrismBB-Drug/blob/main/colab/PrismBB_Drug.ipynb)
[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.112%2B-009688.svg)](https://fastapi.tiangolo.com/)
[![RDKit](https://img.shields.io/badge/RDKit-2024%2B-orange.svg)](https://www.rdkit.org/)
[![AutoDock Vina](https://img.shields.io/badge/AutoDock-Vina-7c5cff.svg)](https://vina.scripps.edu/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Architecture](https://img.shields.io/badge/Architecture-Multi--Agent-success)](https://github.com/Babajan-B/PrismBB-Drug)
[![OS](https://img.shields.io/badge/OS-Linux%20%7C%20macOS%20%7C%20Windows-informational)](https://github.com/Babajan-B/PrismBB-Drug)

> **PrismBB Drug** is a complete computational-chemistry workbench you can run in your browser — no installation required.
> It combines **SMILES parsing**, **17+ molecular descriptors**, **3D conformer generation**, **104 ADMET predictions**,
> and full **AutoDock Vina protein-ligand docking**, all orchestrated by a four-agent FastAPI backend and served through a modern dark-mode Flask UI.

---

## Try it now — no install needed

**The easiest way to use PrismBB Drug is directly in Google Colab.** No setup, no Python environment, free GPU.

[**👉 Open PrismBB Drug in Google Colab**](https://colab.research.google.com/github/Babajan-B/PrismBB-Drug/blob/main/colab/PrismBB_Drug.ipynb)

1. Click the badge above (or the link)
2. In Colab: `Runtime` → **`Run all`** (or `Ctrl+F9` / `⌘F9`)
3. Wait ~3 minutes while everything installs
4. Click the big **"Open the app"** button that appears
5. Use PrismBB Drug in your browser — share the URL with anyone

> The notebook creates a temporary public URL via Cloudflare Tunnel.
> For a permanent URL, see the [deployment options](#deployment) below.

---

## What you can do

### Molecular Analysis
| Capability | Details |
|---|---|
| **SMILES parsing** | Sanitization, InChI, InChIKey, molecular formula |
| **17+ descriptors** | LogP, TPSA, HBD/HBA, rotatable bonds, Lipinski violations, Bertz CT, … |
| **3D conformer** | UFF and MMFF force-field geometry optimization |
| **104 ADMET predictions** | Absorption, Distribution, Metabolism, Excretion, Toxicity via [admet-ai](https://github.com/swansonk14/admet_ai) |
| **Interactive 3D viewer** | WebGL molecular visualization powered by 3Dmol.js |

### Molecular Docking
| Capability | Details |
|---|---|
| **File conversion** | Receptor PDB / PDBQT and ligand PDB / SDF / MOL / PDBQT preparation using RDKit + Meeko |
| **SDF ligand handling** | 2D SDF/MOL ligands are converted into a 3D conformer before PDBQT generation |
| **AutoDock Vina** | Real protein-ligand docking with configurable grid box, exhaustiveness, scoring function, and pose count |
| **3D previews** | Uploaded ligand, prepared ligand, receptor, grid box, and selected docking pose previews in 3Dmol.js |
| **Pose downloads** | Download converted PDBQT files and selected receptor-ligand complex poses |
| **Stub mode** | Full UI with synthetic results when Vina binary is absent — no broken screens |

### Multi-Agent Backend
Four cooperating [Agno](https://github.com/agno-agi/agno) agents with direct-library fallbacks (works fully offline, no `GROQ_API_KEY` required):

| Agent | Role |
|---|---|
| **ParserAgent** | RDKit-based molecular parsing and descriptor calculation |
| **ConformerAgent** | 3D structure generation |
| **ADMETAgent** | ADMET property predictions |
| **RenderAgent** | Payload aggregation and response formatting |

---

## Quick start

### Option A — Google Colab (zero install, recommended for new users)

See the [Try it now](#try-it-now--no-install-needed) section above.

### Option B — Docker (any OS, one command)

```bash
git clone https://github.com/Babajan-B/PrismBB-Drug.git
cd PrismBB-Drug

# Optional: copy .env.example → .env and add GROQ_API_KEY for real LLM agents
cp .env.example .env

docker compose up --build
```

Open:
- **UI** → <http://localhost:3000>
- **API docs** → <http://localhost:8000/docs>
- **Docking workbench** → <http://localhost:3000/docking>

> First build downloads ~3 GB (PyTorch + admet-ai). Subsequent runs start in seconds.
> Model weights are cached in a Docker volume and persist across restarts.

### Option C — Native install

#### Linux / macOS

```bash
git clone https://github.com/Babajan-B/PrismBB-Drug.git
cd PrismBB-Drug
bash scripts/setup.sh    # creates venv, installs all deps, checks for Vina
bash scripts/run.sh      # starts backend on :8000 + UI on :3000
```

#### Windows (PowerShell)

```powershell
git clone https://github.com/Babajan-B/PrismBB-Drug.git
cd PrismBB-Drug
.\scripts\setup.ps1      # creates venv, installs all deps, checks for Vina
.\scripts\run.ps1        # starts backend on :8000 + UI on :3000
```

The setup script tells you whether AutoDock Vina is on your PATH.
**The full app works without Vina** — docking runs in stub mode with synthetic affinities.

---

## Manual install (step by step)

```bash
# 1. Clone the repo
git clone https://github.com/Babajan-B/PrismBB-Drug.git
cd PrismBB-Drug

# 2. Create and activate a virtual environment
python -m venv venv
source venv/bin/activate          # Linux / macOS
# .\venv\Scripts\Activate.ps1    # Windows PowerShell

# 3. Install all dependencies (~3 GB — PyTorch is large)
pip install --upgrade pip
pip install -r requirements.txt

# 4. Terminal 1 — start the backend
cd backend
uvicorn app.main:app --reload --port 8000

# 5. Terminal 2 — start the UI
cd flask_frontend
python app.py
```

---

## AutoDock Vina (optional — enables real docking)

The app works without Vina — docking uses synthetic scores in stub mode. Install Vina to get real binding affinities and generated docking poses:

| OS | Command | Notes |
|---|---|---|
| **Ubuntu / Debian** | `sudo apt-get install autodock-vina` | Ships Vina 1.1 |
| **Fedora / RHEL** | `sudo dnf install autodock-vina` | |
| **macOS** | `conda install -c conda-forge vina` | Recommended for Apple Silicon and Intel Macs; Homebrew does not currently provide a reliable `autodock-vina` formula |
| **Any OS (manual)** | Download from [vina.scripps.edu/downloads](https://vina.scripps.edu/downloads/), extract, add to `PATH` | For Vina 1.2.x (recommended) |
| **Windows** | Download zip from [vina.scripps.edu/downloads](https://vina.scripps.edu/downloads/), add folder with `vina.exe` to `PATH` | |

Verify installation:
```bash
which vina      # macOS/Linux
vina --version
```

The backend auto-detects a `vina` binary on `PATH` at startup and switches to real docking automatically — **no code change needed**. If the backend was already running when you installed Vina, restart it.

For macOS Conda/Miniforge users, make sure the same terminal that starts the backend can see Vina:

```bash
export PATH="$HOME/miniforge3/bin:$PATH"
which vina
vina --version
```

You can also confirm from the app:

- UI badge on `/docking`: `Engine: real AutoDock Vina binary detected`
- API check: <http://localhost:8000/api/docking/health>

### Docking file notes

- Vina itself docks **PDBQT** ligands, so SDF/MOL ligands are prepared to PDBQT before docking.
- Uploaded 2D SDF/MOL ligands are converted to a 3D conformer with RDKit ETKDG before Meeko generates PDBQT.
- PDBQT atom counts can be lower than SDF atom counts because AutoDock merges nonpolar hydrogens into heavy atoms. This is expected.
- The 3D UI uses viewer-safe SDF/PDB previews where possible so branched PDBQT ligand files do not appear as only a small fragment.

---

## Application URLs

| URL | What |
|---|---|
| <http://localhost:3000/> | Analyze — SMILES → descriptors + 3D + ADMET table |
| <http://localhost:3000/docking> | Molecular docking workbench |
| <http://localhost:3000/examples> | Curated example molecules |
| <http://localhost:3000/about> | Architecture overview |
| <http://localhost:8000/api/health> | Backend health check |
| <http://localhost:8000/api/docking/health> | Docking engine mode (real / stub) |
| <http://localhost:8000/docs> | Auto-generated Swagger UI |

---

## Testing

```bash
cd backend
pip install -r requirements-dev.txt
pytest -v
```

31 smoke tests cover RDKit utilities, agent toolkit, parser/conformer agents, ADMET client, docking conversion, and parametrized molecule examples.

---

## Project layout

```
PrismBB-Drug/
│
├── backend/                         FastAPI + multi-agent backend
│   ├── app/
│   │   ├── agents/                  4 Agno agents + shared toolkit
│   │   ├── routes/                  molecules.py · docking.py
│   │   ├── services/                rdkit_utils · molecular_docking · admet_ai_client
│   │   ├── models/schemas.py        Pydantic request / response models
│   │   └── main.py
│   ├── tests/test_smoke.py          30 integration tests
│   ├── Dockerfile
│   ├── requirements.txt
│   └── requirements-dev.txt
│
├── flask_frontend/                  Jinja2 + vanilla JS web UI
│   ├── app.py                       Flask app + API proxy routes
│   ├── templates/                   base · index · docking · examples · about
│   ├── static/css/style.css         Design system v2 (dark/light theme)
│   ├── static/js/                   main · analysis · docking · file-upload · viewer
│   ├── Dockerfile
│   └── requirements.txt
│
├── scripts/                         Cross-platform setup & run helpers
│   ├── setup.sh    setup.ps1
│   └── run.sh      run.ps1
│
├── colab/
│   └── PrismBB_Drug.ipynb           One-click Google Colab notebook (free GPU)
│
├── docker-compose.yml               Local multi-service orchestration
├── render.yaml                      One-click Render.com Blueprint
├── .env.example                     Environment variable template
├── requirements.txt                 Combined backend + frontend deps
├── DEPLOY.md                        Full deployment guide
└── README.md
```

---

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8000` / `3000` | Listen port (Render / Heroku inject this automatically) |
| `BACKEND_URL` | `http://localhost:8000` | Where Flask proxies API calls |
| `GROQ_API_KEY` | _unset_ | Enables real Agno LLM agents (direct-library fallback used when unset) |
| `AGNO_TELEMETRY` | `false` | Disable Agno usage telemetry |
| `ADMET_AI_CACHE_DIR` | `/data/admet_ai` | Path for cached PyTorch model weights |
| `HF_HOME` | `/data/huggingface` | HuggingFace Transformers cache |
| `WEB_CONCURRENCY` | `1` / `2` | Gunicorn workers (keep backend at 1 to avoid OOM with admet-ai) |
| `SECRET_KEY` | dev value | Flask session signing key |

Copy `.env.example` → `.env` and fill in values as needed.

---

## Deployment

See **[DEPLOY.md](DEPLOY.md)** for step-by-step guides:

| Platform | Notes |
|---|---|
| **Google Colab** | Zero install, free GPU, public URL — best for demos |
| **Docker (local)** | `docker compose up --build` — one command, any OS |
| **Render.com** | One-click Blueprint via `render.yaml` — permanent URL |
| **Fly.io** | `flyctl launch` with persistent volume for model cache |
| **Railway** | Two services pointing at `backend/` and `flask_frontend/` |
| **Google Cloud Run** | Build for `linux/amd64`, mount Cloud Storage for model weights |

---

## License

[MIT](LICENSE) — free to use, modify, and distribute.
