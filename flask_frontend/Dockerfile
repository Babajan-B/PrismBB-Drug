# syntax=docker/dockerfile:1.6
# ============================================================================
# PrismBB Drug — frontend image (Flask + Gunicorn)
# ============================================================================
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=3000 \
    BACKEND_URL=http://backend:8000

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Layer caching: install deps first
COPY requirements.txt /app/requirements.txt
RUN pip install --upgrade pip && pip install -r /app/requirements.txt

# Then the app
COPY . /app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsSL "http://localhost:${PORT}/" >/dev/null || exit 1

CMD ["sh", "-c", "exec gunicorn app:app \
        --bind 0.0.0.0:${PORT} \
        --workers ${WEB_CONCURRENCY:-2} \
        --threads 4 \
        --timeout 300 \
        --access-logfile - \
        --error-logfile -"]
