from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Union

class ParseRequest(BaseModel):
    smiles: Optional[str] = None
    filename: Optional[str] = None

class MoleculeSummary(BaseModel):
    smiles: str
    formula: str
    weight: float
    inchi: str = ""
    inchikey: str = ""
    descriptors: Dict[str, float] = {}

class ConformerRequest(BaseModel):
    smiles: str
    forcefield: str = Field(default="UFF")

class ConformerResponse(BaseModel):
    pdb_block: str
    status: str = "ok"

class AdmetRequest(BaseModel):
    smiles: str

class AdmetPrediction(BaseModel):
    property: str
    value: Union[float, str]
    unit: Optional[str] = None
    probability: Optional[float] = None
    description: Optional[str] = None
    confidence: Optional[float] = None

class AdmetResponse(BaseModel):
    predictions: List[AdmetPrediction]

class AnalyzeRequest(BaseModel):
    smiles: str


# ============================================================================
# Molecular Docking (AutoDock Vina)
# ============================================================================

class PDBQTConversionRequest(BaseModel):
    file_content: str = Field(..., description="Content of the PDB or SDF file")
    file_type: str = Field(..., description="Type of input file: 'pdb' or 'sdf'")
    molecule_type: str = Field(..., description="Type of molecule: 'protein' or 'ligand'")
    filename: Optional[str] = Field(None, description="Original filename")


class PDBQTConversionResponse(BaseModel):
    pdbqt_content: str = Field(..., description="Converted PDBQT file content")
    filename: str = Field(..., description="Generated PDBQT filename")
    status: str = Field(default="success", description="Conversion status")
    message: Optional[str] = Field(None, description="Status message")
    preview_pdb_content: Optional[str] = Field(None, description="Prepared 3D PDB preview content for visualization")
    source_pdb_content: Optional[str] = Field(None, description="Uploaded molecule converted to PDB for source visualization")
    preview_sdf_content: Optional[str] = Field(None, description="Prepared 3D SDF/MOL preview content for visualization")
    source_sdf_content: Optional[str] = Field(None, description="Uploaded SDF/MOL content normalized for source visualization")
    conversion_notes: List[str] = Field(default_factory=list, description="Notes about preparation changes")


class GridConfiguration(BaseModel):
    center_x: float = Field(..., description="X coordinate of grid center")
    center_y: float = Field(..., description="Y coordinate of grid center")
    center_z: float = Field(..., description="Z coordinate of grid center")
    size_x: float = Field(..., description="Grid size in X dimension")
    size_y: float = Field(..., description="Grid size in Y dimension")
    size_z: float = Field(..., description="Grid size in Z dimension")


class DockingParameters(BaseModel):
    forcefield: str = Field(default="vina", description="Scoring function: vina, ad4, or vinardo")
    num_modes: int = Field(default=9, description="Number of binding modes to generate")
    exhaustiveness: int = Field(default=8, description="Exhaustiveness of global search")
    energy_range: float = Field(default=3.0, description="Maximum energy difference (kcal/mol)")


class DockingRequest(BaseModel):
    protein_pdbqt: str = Field(..., description="Protein PDBQT file content")
    ligand_pdbqt: str = Field(..., description="Ligand PDBQT file content")
    grid_config: GridConfiguration = Field(..., description="Grid box configuration")
    docking_params: DockingParameters = Field(default_factory=DockingParameters, description="Docking parameters")


class DockingPose(BaseModel):
    mode: int = Field(..., description="Binding mode number")
    affinity: float = Field(..., description="Binding affinity (kcal/mol)")
    rmsd_lb: float = Field(..., description="RMSD lower bound")
    rmsd_ub: float = Field(..., description="RMSD upper bound")
    rank: int = Field(..., description="Rank by affinity")


class DockingResponse(BaseModel):
    poses: List[DockingPose] = Field(..., description="List of binding poses")
    best_affinity: float = Field(..., description="Best binding affinity")
    average_affinity: float = Field(..., description="Average binding affinity")
    total_modes: int = Field(..., description="Total number of modes generated")
    docked_pdbqt: str = Field(..., description="Docked poses in PDBQT format")
    vina_log: str = Field(..., description="AutoDock Vina output log")
    status: str = Field(default="success", description="Docking status")
    message: Optional[str] = Field(None, description="Status message") 
