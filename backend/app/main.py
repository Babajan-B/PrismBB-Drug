from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes.molecules import router as molecules_router
from .routes.docking import router as docking_router

app = FastAPI(title="PrismBB Drug — AI-Powered Drug Discovery API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "message": "PrismBB Drug — AI-Powered Drug Discovery API",
        "version": "0.2.0",
        "services": {
            "admet": "ADMET prediction & molecular descriptors",
            "docking": "AutoDock Vina protein-ligand docking",
        },
        "endpoints": [
            "/api/health", "/api/parse", "/api/conformer", "/api/admet", "/api/analyze",
            "/api/docking/health", "/api/docking/supported-formats",
            "/api/docking/convert-pdbqt", "/api/docking/run-docking",
            "/api/docking/upload-file",
        ],
    }


app.include_router(molecules_router)
app.include_router(docking_router)
