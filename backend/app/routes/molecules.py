from fastapi import APIRouter, HTTPException
from ..models.schemas import (
    ParseRequest, MoleculeSummary, ConformerRequest, ConformerResponse,
    AdmetRequest, AdmetResponse, AnalyzeRequest, AdmetPrediction
)
from ..services.rdkit_utils import RDKitUtils
from ..services.admet_ai_client import ADMETClient
from ..agents.parser_agent import parser_agent
from ..agents.conformer_agent import conformer_agent
from ..agents.admet_agent import admet_agent
from ..agents.render_agent import render_agent

router = APIRouter(prefix="/api", tags=["molecules"])

@router.get("/health")
def health():
    return {
        "message": "PrismBB Drug API is running",
        "status": "healthy",
        "agents": {
            "parser": "ParserAgent - RDKit molecular parsing with 17+ descriptors",
            "conformer": "ConformerAgent - 3D structure generation with UFF/MMFF",
            "admet": "ADMETAgent - ADMET property predictions",
            "render": "RenderAgent - Analysis payload formatting"
        },
        "endpoints": [
            "/api/health",
            "/api/parse", 
            "/api/conformer",
            "/api/admet",
            "/api/analyze",
            "/api/render"
        ]
    }

def _try_agent_dict(agent, prompt: str) -> dict:
    """Best-effort: call agent.run and return a dict; otherwise dict with 'error'."""
    try:
        out = agent.run(prompt)
        if isinstance(out, dict):
            return out
        return {"error": "agent returned non-dict output"}
    except Exception as e:
        return {"error": str(e)}


@router.post("/parse", response_model=MoleculeSummary)
def parse(req: ParseRequest):
    """Parse and validate a SMILES string using the ParserAgent or fallback to direct RDKit."""
    if not req.smiles:
        raise HTTPException(400, "SMILES required")

    agent_out = _try_agent_dict(parser_agent, req.smiles)
    if not agent_out.get("error") and "formula" in agent_out:
        return MoleculeSummary(
            smiles=agent_out["smiles"],
            formula=agent_out["formula"],
            weight=agent_out["weight"],
            inchi=agent_out.get("inchi", ""),
            inchikey=agent_out.get("inchikey", ""),
            descriptors=agent_out.get("descriptors", {}),
        )

    # Fallback: direct RDKit
    try:
        sanitized_smiles = RDKitUtils.sanitize_smiles(req.smiles)
        meta = RDKitUtils.mol_summary(sanitized_smiles)
        return MoleculeSummary(
            smiles=sanitized_smiles,
            formula=meta["formula"],
            weight=meta["weight"],
            inchi=meta["inchi"],
            inchikey=meta["inchikey"],
            descriptors=meta["descriptors"],
        )
    except Exception as rdkit_error:
        raise HTTPException(
            400,
            f"Failed to parse SMILES (Agent: {agent_out.get('error','-')}, RDKit: {rdkit_error})"
        )


@router.post("/conformer", response_model=ConformerResponse)
def conformer(req: ConformerRequest):
    """Generate 3D conformer using the ConformerAgent or fallback to direct RDKit."""
    agent_out = _try_agent_dict(
        conformer_agent,
        f"Generate 3D conformer for SMILES: {req.smiles} using {req.forcefield} force field",
    )
    if not agent_out.get("error") and agent_out.get("pdb_block"):
        return ConformerResponse(
            pdb_block=agent_out.get("pdb_block", ""),
            status=agent_out.get("status", "ok"),
        )

    # Fallback: direct RDKit
    try:
        pdb = RDKitUtils.embed_conformer(req.smiles, req.forcefield)
        return ConformerResponse(pdb_block=pdb, status="ok")
    except Exception as rdkit_error:
        raise HTTPException(
            400,
            f"Failed to generate conformer (Agent: {agent_out.get('error','-')}, RDKit: {rdkit_error})"
        )


@router.post("/admet", response_model=AdmetResponse)
def admet(req: AdmetRequest):
    """Predict ADMET properties using the ADMETAgent or fallback to direct ADMET-AI."""
    agent_out = _try_agent_dict(admet_agent, f"Predict ADMET properties for SMILES: {req.smiles}")
    if not agent_out.get("error") and agent_out.get("predictions"):
        predictions = []
        for pred in agent_out["predictions"]:
            predictions.append(AdmetPrediction(
                property=pred["property"],
                value=pred["value"],
                unit=pred.get("unit"),
                probability=pred.get("confidence") or pred.get("probability"),
                description=pred.get("description"),
                confidence=pred.get("confidence"),
            ))
        return AdmetResponse(predictions=predictions)

    # Fallback to direct ADMET-AI operations
    try:
        preds = ADMETClient.predict(req.smiles)
        out = [AdmetPrediction(**p) for p in preds]
        return AdmetResponse(predictions=out)
    except Exception as admet_error:
        raise HTTPException(
            400,
            f"Failed to predict ADMET properties (Agent: {agent_out.get('error','-')}, ADMET-AI: {admet_error})"
        )

def _safe_agent_run(agent, prompt: str) -> dict:
    """Run an agent and always return a dict (with 'error' on failure)."""
    try:
        result = agent.run(prompt)
        if isinstance(result, dict):
            return result
        # agno >=2 returns a RunOutput object; coerce to error so we use fallback
        return {"error": "agent returned non-dict output"}
    except Exception as e:
        return {"error": str(e)}


@router.post("/analyze")
def analyze(req: AnalyzeRequest):
    """Comprehensive molecular analysis: tries agents first, falls back to direct RDKit + ADMET-AI."""

    statuses = {"parser": "failed", "conformer": "failed", "admet": "failed", "render": "failed"}

    # --- Step 1: Parser ---
    molecular_result = _safe_agent_run(parser_agent, req.smiles)
    if molecular_result.get("error") or "formula" not in molecular_result:
        try:
            sanitized = RDKitUtils.sanitize_smiles(req.smiles)
            meta = RDKitUtils.mol_summary(sanitized)
            molecular_result = {
                "smiles": sanitized,
                "formula": meta["formula"],
                "weight": meta["weight"],
                "inchi": meta["inchi"],
                "inchikey": meta["inchikey"],
                "descriptors": meta["descriptors"],
            }
            statuses["parser"] = "fallback"
        except Exception as e:
            molecular_result = {"smiles": req.smiles, "formula": "", "weight": 0.0,
                                "inchi": "", "inchikey": "", "descriptors": {},
                                "error": str(e)}
    else:
        statuses["parser"] = "success"

    # --- Step 2: Conformer ---
    conformer_result = _safe_agent_run(
        conformer_agent,
        f"Generate 3D conformer for SMILES: {req.smiles} using UFF force field"
    )
    if conformer_result.get("error") or not conformer_result.get("pdb_block"):
        try:
            pdb = RDKitUtils.embed_conformer(req.smiles, "UFF")
            conformer_result = {
                "pdb_block": pdb,
                "status": "success",
                "forcefield_used": "UFF",
                "atom_count": pdb.count("HETATM"),
                "has_3d_coords": True,
            }
            statuses["conformer"] = "fallback"
        except Exception as e:
            conformer_result = {"error": str(e), "pdb_block": ""}
    else:
        statuses["conformer"] = "success"

    # --- Step 3: ADMET ---
    admet_result = _safe_agent_run(
        admet_agent,
        f"Predict ADMET properties for SMILES: {req.smiles}"
    )
    if admet_result.get("error") or not admet_result.get("predictions"):
        try:
            preds = ADMETClient.predict(req.smiles)
            admet_result = {"predictions": preds, "status": "success"}
            statuses["admet"] = "fallback"
        except Exception as e:
            admet_result = {"error": str(e), "predictions": []}
    else:
        statuses["admet"] = "success"

    # --- Step 4: Render (optional cosmetic layer) ---
    render_result = _safe_agent_run(
        render_agent,
        f"Format analysis results for molecular_data: {molecular_result}, conformer_data: {conformer_result}, admet_data: {admet_result}"
    )
    if not render_result.get("error"):
        statuses["render"] = "success"

    # Always return a useful payload — the frontend reads `.molecule`, `.pdb_block`, `.admet`
    return {
        "molecule": molecular_result,
        "pdb_block": conformer_result.get("pdb_block", ""),
        "conformer": conformer_result,
        "admet": admet_result.get("predictions", []),
        "render": render_result if not render_result.get("error") else None,
        "analysis_status": statuses,
    }

@router.post("/render")
def render_analysis(molecular_data: dict, conformer_data: dict, admet_data: dict):
    """Format analysis results using the RenderAgent."""
    try:
        result = render_agent.run(f"Format analysis results for molecular_data: {molecular_data}, conformer_data: {conformer_data}, admet_data: {admet_data}")
        
        if "error" in result:
            raise HTTPException(400, result["error"])
        
        return result
    except Exception as e:
        raise HTTPException(400, f"Failed to render analysis: {str(e)}") 