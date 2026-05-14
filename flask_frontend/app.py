"""Flask front-end + proxy for PrismBB Drug."""
from __future__ import annotations

import os

from flask import Flask, render_template, request, jsonify, Response
import requests

app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "prismbb-drug-2026")

# Backend (FastAPI) location — override at runtime with the BACKEND_URL env var
# (e.g. internal service URL on Render: http://molecular-backend:8000)
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")


# ============================================================== Pages
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/examples")
def examples():
    examples = [
        {"name": "Aspirin",     "smiles": "CC(=O)OC1=CC=CC=C1C(=O)O",         "description": "Pain reliever / anti-inflammatory"},
        {"name": "Caffeine",    "smiles": "CN1C=NC2=C1C(=O)N(C(=O)N2C)C",     "description": "CNS stimulant"},
        {"name": "Ibuprofen",   "smiles": "CC(C)CC1=CC=C(C=C1)C(C)C(=O)O",    "description": "NSAID"},
        {"name": "Ethanol",     "smiles": "CCO",                              "description": "Simple alcohol"},
        {"name": "Benzene",     "smiles": "c1ccccc1",                         "description": "Aromatic hydrocarbon"},
        {"name": "Glucose",     "smiles": "C([C@@H]1[C@H]([C@@H]([C@H]([C@H](O1)O)O)O)O)O", "description": "Primary energy source"},
        {"name": "Paracetamol", "smiles": "CC(=O)NC1=CC=C(C=C1)O",            "description": "Acetaminophen"},
        {"name": "Morphine",    "smiles": "CN1CC[C@]23C4=C5C=CC(O)=C4O[C@H]2[C@@H](O)C=C[C@H]3[C@H]1C5", "description": "Opioid analgesic"},
    ]
    return render_template("examples.html", examples=examples)


@app.route("/about")
def about():
    return render_template("about.html")


@app.route("/docking")
def docking_page():
    """Molecular docking workbench."""
    return render_template("docking.html")


# ============================================================== Molecule proxies
def _proxy_post(path: str, timeout: int = 60):
    try:
        r = requests.post(f"{BACKEND_URL}{path}", json=request.get_json(silent=True) or {}, timeout=timeout)
        return jsonify(r.json()), r.status_code
    except requests.RequestException as e:
        return jsonify({"error": f"Backend connection failed: {e}"}), 502


def _proxy_get(path: str, timeout: int = 30):
    try:
        r = requests.get(f"{BACKEND_URL}{path}", timeout=timeout)
        return jsonify(r.json()), r.status_code
    except requests.RequestException as e:
        return jsonify({"error": f"Backend unavailable: {e}"}), 502


@app.route("/api/parse",     methods=["POST"])
def parse_molecule():      return _proxy_post("/api/parse")

@app.route("/api/conformer", methods=["POST"])
def generate_conformer():  return _proxy_post("/api/conformer")

@app.route("/api/admet",     methods=["POST"])
def admet_predict():       return _proxy_post("/api/admet", timeout=120)

@app.route("/api/analyze",   methods=["POST"])
def analyze_molecule():    return _proxy_post("/api/analyze", timeout=180)

@app.route("/api/health")
def health_check():        return _proxy_get("/api/health")


# ============================================================== Docking proxies
@app.route("/api/docking/health")
def docking_health():               return _proxy_get("/api/docking/health")

@app.route("/api/docking/supported-formats")
def docking_formats():              return _proxy_get("/api/docking/supported-formats")

@app.route("/api/docking/convert-pdbqt", methods=["POST"])
def docking_convert():              return _proxy_post("/api/docking/convert-pdbqt", timeout=120)

@app.route("/api/docking/run-docking", methods=["POST"])
def docking_run():                  return _proxy_post("/api/docking/run-docking", timeout=300)


@app.route("/api/docking/upload-file", methods=["POST"])
def docking_upload():
    """Pass through a multipart file upload to the backend."""
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    f = request.files["file"]
    try:
        r = requests.post(
            f"{BACKEND_URL}/api/docking/upload-file",
            files={"file": (f.filename, f.stream, f.mimetype or "application/octet-stream")},
            timeout=120,
        )
        return Response(r.content, status=r.status_code, mimetype=r.headers.get("content-type", "application/json"))
    except requests.RequestException as e:
        return jsonify({"error": f"Backend unavailable: {e}"}), 502


if __name__ == "__main__":
    debug = os.getenv("FLASK_DEBUG", "0").lower() in ("1", "true", "yes")
    port = int(os.getenv("PORT", "3000"))
    app.run(debug=debug, host="0.0.0.0", port=port)
