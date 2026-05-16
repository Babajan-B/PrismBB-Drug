# Deployment Guide — PrismBB Drug

Three ways to ship this app:

0. **Google Colab** (no-code-knowledge users) — click the [Open in Colab badge](README.md) in the README. A free, temporary URL with GPU-accelerated ADMET predictions and real AutoDock Vina docking. Best for demos or low-friction sharing.
1. **Local Docker** — `docker compose up`, single command.
2. **Render.com** — connect the GitHub repo, the `render.yaml` Blueprint provisions both services automatically.

The same backend image works on Fly.io, Railway, DigitalOcean App Platform, Google Cloud Run, etc. — `render.yaml` is a translation, not a lock-in.

The same backend image works on Fly.io, Railway, DigitalOcean App Platform, Google Cloud Run, etc. — `render.yaml` is a translation, not a lock-in.

---

## Option 0 — Google Colab (zero-install demo)

Best for: non-technical users, sharing with collaborators, quick demos.

The notebook at [`colab/PrismBB_Drug.ipynb`](colab/PrismBB_Drug.ipynb) handles everything:

1. Open it in Colab via the README badge — or directly:
   <https://colab.research.google.com/github/Babajan-B/PrismBB-Drug/blob/main/colab/PrismBB_Drug.ipynb>
2. (Optional) `Runtime` → `Change runtime type` → **T4 GPU**
3. `Runtime` → **`Run all`**
4. After ~3 minutes a clickable "Open the app" button appears.

How it works:
- `apt-get install autodock-vina` puts the real Vina binary on PATH.
- `pip install` brings in RDKit + admet-ai + meeko + agno.
- Backend starts on `:8000`, Flask UI on `:3000` inside the Colab VM.
- `cloudflared tunnel --url http://localhost:3000` (no signup) gives the user a public `https://*.trycloudflare.com` URL.
- ADMET predictions run on the free Colab T4 GPU.

Limitations:
- URL changes every Colab session.
- Colab disconnects after 90 min idle (12 h max on Pro).
- For a permanent URL, use one of the persistent hosts below.

---

## Architecture

```
┌──────────────────────────────┐         ┌───────────────────────────────────────┐
│   prismbb-frontend         │         │   prismbb-backend                   │
│   • Flask + Gunicorn         │         │   • FastAPI + Uvicorn workers         │
│   • /, /docking, /examples   │  HTTP   │   • RDKit · admet-ai · Meeko · Agno   │
│   • /api/* → proxy           │ ──────► │   • AutoDock Vina (apt-installed)     │
│   • port 3000                │         │   • port 8000                          │
└──────────────────────────────┘         └───────────────────────────────────────┘
              ▲                                              │
              │ public                                       │
              │                                              ▼
       end-user browser                               /data (persistent disk)
                                                     - admet-ai model weights
                                                     - huggingface cache
```

---

## Local: `docker compose up`

```bash
cp .env.example .env          # optional — only needed if you want GROQ_API_KEY

# First build pulls torch/admet-ai (~3 GB). Subsequent builds are cached.
docker compose up --build
```

Open:

- **UI**: <http://localhost:3000>
- **API**: <http://localhost:8000/api/health>
- **Docking workbench**: <http://localhost:3000/docking>

Tear down (volumes preserved): `docker compose down`
Remove model cache too: `docker compose down -v`

> **First `/api/admet` call downloads ~2 GB of model weights** into the
> `admet-cache` Docker volume. Subsequent calls are fast.

---

## Render.com — one-click Blueprint

1. **Push** this repo to GitHub (must be public, or grant Render access to the private repo).
2. **Edit** `render.yaml` at the lines marked `repo:` and replace with your own GitHub URL.
3. Go to <https://dashboard.render.com/blueprints> → **New Blueprint Instance** → pick the repo → Render reads `render.yaml` and provisions:
   - `prismbb-backend`  (Standard plan, 2 GB RAM, 5 GB disk at `/data`)
   - `prismbb-frontend` (Starter plan)
4. In the backend service's **Environment** tab, optionally add `GROQ_API_KEY` for real LLM agents (everything works without it via fallbacks).
5. First deploy takes ~10 min (large image). After that, redeploys are minutes.

The frontend's `BACKEND_URL` is wired automatically through Render's internal DNS (`fromService` directive).

### Plan sizing

| Service | Free | Starter ($7) | Standard ($25) | Pro ($85) |
|---|---|---|---|---|
| Backend | ❌ OOM on admet-ai | ⚠️ Sometimes OOMs | ✅ Recommended | ✅ For concurrent docking |
| Frontend | ✅ Fine | ✅ Fine | overkill | overkill |

> **Real docking caveat**: `apt-get install autodock-vina` on Debian Slim
> may produce an older Vina (≤1.1) depending on the Debian release. For
> Vina 1.2.x (recommended), build from source in a multi-stage Dockerfile
> pull a prebuilt image like `ccsbk/autodock-vina:1.2.5`, or install
> `conda-forge::vina` in a Conda-based image.

---

## Other hosts

### Fly.io

```bash
flyctl launch --dockerfile backend/Dockerfile  # for the backend
flyctl launch --dockerfile flask_frontend/Dockerfile  # for the frontend
flyctl volumes create admet_cache --size 5    # for the backend app
```

Mount the volume at `/data` and set the same env vars as `render.yaml`.

### Railway

Same Dockerfiles. Create two services pointing at `backend/` and `flask_frontend/`.
Set `BACKEND_URL` on the frontend service to `${{prismbb-backend.RAILWAY_PRIVATE_DOMAIN}}:8000`.

### Google Cloud Run

`docker buildx build --platform linux/amd64` first (Cloud Run does not run arm64 images). Then `gcloud run deploy`. No persistent disk — mount Cloud Storage instead, or let admet-ai re-download on cold start (slow).

---

## Environment variables

| Variable | Service | Default | Meaning |
|---|---|---|---|
| `PORT` | both | 8000 / 3000 | Listen port (Render/Heroku inject this) |
| `WEB_CONCURRENCY` | both | 1 / 2 | Gunicorn workers (backend = 1 to avoid OOM) |
| `BACKEND_URL` | frontend | `http://localhost:8000` | Where the proxy points |
| `GROQ_API_KEY` | backend | — | Enables real Agno LLM agents |
| `AGNO_TELEMETRY` | backend | `false` | Disables Agno telemetry |
| `ADMET_AI_CACHE_DIR` | backend | `/data/admet_ai` | Where torch weights are cached |
| `HF_HOME` | backend | `/data/huggingface` | HF transformers cache |
| `SECRET_KEY` | frontend | dev value | Flask session signing |

---

## Verification after deploy

```bash
# Should return the four-agent banner
curl https://<backend-host>/api/health

# Docking capabilities — `vina_binary: true` means real docking is live
curl https://<backend-host>/api/docking/health

# End-to-end smoke test on aspirin
curl -X POST https://<backend-host>/api/analyze \
     -H "Content-Type: application/json" \
     -d '{"smiles":"CC(=O)Oc1ccccc1C(=O)O"}'
```

The frontend's footer shows the backend status indicator (green = online).
