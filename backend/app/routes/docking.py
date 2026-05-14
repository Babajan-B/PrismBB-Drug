"""AutoDock Vina molecular-docking API routes."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, File, UploadFile

from ..models.schemas import (
    PDBQTConversionRequest, PDBQTConversionResponse,
    DockingRequest, DockingResponse,
)
from ..services.molecular_docking import MolecularDockingService

router = APIRouter(prefix="/api/docking", tags=["molecular-docking"])

# Single service instance for the process lifetime
docking_service = MolecularDockingService()


# ---------------------------------------------------------------- health
@router.get("/health")
def docking_health():
    caps = MolecularDockingService.capabilities()
    return {
        "message": "AutoDock Vina molecular docking service",
        "status": "healthy",
        "capabilities": caps,
        "mode": "vina-binary" if caps["real_docking"] else "stub",
        "features": {
            "conversion": "PDB/SDF → PDBQT (Meeko + RDKit)",
            "docking": "AutoDock Vina (binary)" if caps["real_docking"] else "Stub (synthetic results)",
            "scoring": "vina · ad4 · vinardo",
        },
        "endpoints": [
            "/api/docking/health",
            "/api/docking/supported-formats",
            "/api/docking/convert-pdbqt",
            "/api/docking/run-docking",
            "/api/docking/upload-file",
        ],
    }


# ---------------------------------------------------------------- PDB/SDF → PDBQT
@router.post("/convert-pdbqt", response_model=PDBQTConversionResponse)
def convert_to_pdbqt(request: PDBQTConversionRequest):
    """Convert PDB or SDF content to PDBQT format."""
    if not request.file_content.strip():
        raise HTTPException(400, "File content cannot be empty")
    if request.file_type.lower() not in ("pdb", "sdf"):
        raise HTTPException(400, "File type must be 'pdb' or 'sdf'")
    if request.molecule_type.lower() not in ("protein", "ligand"):
        raise HTTPException(400, "Molecule type must be 'protein' or 'ligand'")
    if request.molecule_type.lower() == "protein" and request.file_type.lower() != "pdb":
        raise HTTPException(400, "Protein molecules must be supplied as PDB")

    try:
        if request.file_type.lower() == "pdb":
            content, fname = docking_service.convert_pdb_to_pdbqt(
                request.file_content, request.molecule_type.lower(), request.filename,
            )
        else:
            if request.molecule_type.lower() == "protein":
                raise HTTPException(400, "SDF format not supported for proteins")
            content, fname = docking_service.convert_sdf_to_pdbqt(
                request.file_content, request.filename,
            )

        return PDBQTConversionResponse(
            pdbqt_content=content,
            filename=fname,
            status="success",
            message=f"Converted {request.file_type.upper()} ({request.molecule_type}) to PDBQT",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Conversion failed: {e}")


# ---------------------------------------------------------------- docking
@router.post("/run-docking", response_model=DockingResponse)
def run_molecular_docking(request: DockingRequest):
    """Run AutoDock Vina docking (or stub when the binary is unavailable)."""
    if not request.protein_pdbqt.strip():
        raise HTTPException(400, "Protein PDBQT content cannot be empty")
    if not request.ligand_pdbqt.strip():
        raise HTTPException(400, "Ligand PDBQT content cannot be empty")

    grid = request.grid_config
    if any(s <= 0 for s in (grid.size_x, grid.size_y, grid.size_z)):
        raise HTTPException(400, "Grid sizes must be positive")
    if any(s > 50 for s in (grid.size_x, grid.size_y, grid.size_z)):
        raise HTTPException(400, "Grid sizes cannot exceed 50 Å")

    params = request.docking_params
    if not 1 <= params.num_modes <= 20:
        raise HTTPException(400, "num_modes must be 1–20")
    if not 1 <= params.exhaustiveness <= 32:
        raise HTTPException(400, "exhaustiveness must be 1–32")
    if not 0.5 <= params.energy_range <= 10:
        raise HTTPException(400, "energy_range must be 0.5–10 kcal/mol")
    if params.forcefield not in ("vina", "ad4", "vinardo"):
        raise HTTPException(400, "forcefield must be 'vina', 'ad4', or 'vinardo'")

    grid_dict = grid.model_dump()
    params_dict = params.model_dump()

    result = docking_service.run_docking(
        request.protein_pdbqt, request.ligand_pdbqt, grid_dict, params_dict,
    )
    if result.get("status") == "error":
        raise HTTPException(500, result.get("message", "Docking failed"))

    msg = "Docking completed successfully"
    if result.get("mode") == "stub":
        msg += " (stub mode — install the `vina` binary for production runs)"

    return DockingResponse(
        poses=[{
            "mode": p["mode"],
            "affinity": p["affinity"],
            "rmsd_lb": p["rmsd_lb"],
            "rmsd_ub": p["rmsd_ub"],
            "rank": p["rank"],
        } for p in result["poses"]],
        best_affinity=result["best_affinity"],
        average_affinity=result["average_affinity"],
        total_modes=result["total_modes"],
        docked_pdbqt=result["docked_pdbqt"],
        vina_log=result["vina_log"],
        status="success",
        message=msg,
    )


# ---------------------------------------------------------------- file upload
@router.post("/upload-file")
async def upload_file(file: UploadFile = File(...)):
    """Upload a molecular file (PDB / SDF / PDBQT) and return its content."""
    if not file.filename:
        raise HTTPException(400, "Filename is required")

    ext = file.filename.lower().rsplit(".", 1)[-1]
    if ext not in ("pdb", "sdf", "pdbqt", "ent", "mol"):
        raise HTTPException(400, f"Unsupported file type: {ext}")

    content = await file.read()
    if len(content) > 100 * 1024 * 1024:
        raise HTTPException(400, "File size exceeds 100 MB")

    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(400, "File must be UTF-8")

    if not text.strip():
        raise HTTPException(400, "File is empty")

    # Heuristic: many ATOM records → likely protein
    molecule_type = "protein" if text.count("\nATOM") > 80 else "ligand"

    return {
        "filename": file.filename,
        "file_type": ext if ext != "ent" else "pdb",
        "molecule_type": molecule_type,
        "file_content": text,
        "file_size": len(content),
        "status": "success",
        "message": f"File uploaded — detected as {molecule_type} ({ext.upper()})",
    }


# ---------------------------------------------------------------- formats
@router.get("/supported-formats")
def get_supported_formats():
    return {
        "input_formats": {
            "pdb": {
                "description": "Protein Data Bank format",
                "supported_molecules": ["protein", "ligand"],
                "file_extensions": [".pdb", ".ent"],
            },
            "sdf": {
                "description": "Structure Data Format",
                "supported_molecules": ["ligand"],
                "file_extensions": [".sdf", ".mol"],
            },
        },
        "output_format": {
            "pdbqt": {
                "description": "AutoDock PDBQT (atom types + partial charges)",
                "usage": "Required for AutoDock Vina",
            },
        },
        "molecule_types": {
            "protein": {"description": "Receptor", "required_format": "PDB only"},
            "ligand":  {"description": "Small-molecule ligand", "supported_formats": ["PDB", "SDF"]},
        },
        "limitations": {
            "max_file_size": "100 MB",
            "grid_size_range": "1–50 Å per dimension",
            "num_modes_range": "1–20",
            "exhaustiveness_range": "1–32",
        },
    }
