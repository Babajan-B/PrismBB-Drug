# syntax=docker/dockerfile:1.6
# ============================================================================
# PrismBB Drug — backend image
#   FastAPI · Agno agents · RDKit · ADMET-AI · Meeko · AutoDock Vina
# ============================================================================
FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # admet-ai stores its model weights here — mount a persistent disk here.
    ADMET_AI_CACHE_DIR=/data/admet_ai \
    HF_HOME=/data/huggingface \
    PORT=8000

# ----- System dependencies ----------------------------------------------------
# - autodock-vina   : real docking binary (no Boost-build pain on Debian)
# - libxrender1, libxext6, libsm6 : runtime libs RDKit can pull in
# - build-essential : fallback for any wheel that needs compiling
RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        autodock-vina \
        build-essential \
        libxrender1 libxext6 libsm6 \
        ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

# ----- Python dependencies ----------------------------------------------------
# Install requirements FIRST so this layer caches between code-only edits.
COPY requirements.txt /tmp/requirements.txt
RUN pip install --upgrade pip \
 && pip install -r /tmp/requirements.txt

# ----- App code ---------------------------------------------------------------
WORKDIR /app
COPY . /app

ENV PYTHONPATH=/app

# Pre-create cache dirs (a Render persistent disk should be mounted at /data)
RUN mkdir -p "$ADMET_AI_CACHE_DIR" "$HF_HOME"

EXPOSE 8000

# Healthcheck for orchestration platforms
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -fsSL "http://localhost:${PORT}/api/health" || exit 1

# Use a shell so $PORT (Render injects it) is expanded.
# 1 worker by default — admet-ai loads ~2 GB of model weights; more workers = OOM.
CMD ["sh", "-c", "exec gunicorn app.main:app \
        --worker-class uvicorn.workers.UvicornWorker \
        --workers ${WEB_CONCURRENCY:-1} \
        --bind 0.0.0.0:${PORT} \
        --timeout 600 \
        --keep-alive 30 \
        --access-logfile - \
        --error-logfile -"]
