from agno.agent import Agent
from agno.models.groq import Groq
from .toolkit import rdkit_conformer

conformer_agent = Agent(
    name="ConformerAgent",
    role="3D Molecular Structure Generator",
    model=Groq(id="llama-3.1-70b-versatile"),  # Using Grok Free API as per user preference
    tools=[rdkit_conformer],
    instructions=[
        "You are a 3D molecular structure generation agent that creates optimized conformers from SMILES strings.",
        "Use the rdkit_conformer tool to generate 3D molecular structures with proper geometry optimization.",
        "Always call rdkit_conformer with the provided SMILES string and optional force field parameter.",
        "Support both UFF (Universal Force Field) and MMFF (Merck Molecular Force Field) optimization methods.",
        "If the tool returns an error, respond with a JSON containing only the error field.",
        "If successful, return a clean JSON response with these exact fields: pdb_block, status, forcefield_used, atom_count, has_3d_coords.",
        "The pdb_block field should contain the complete PDB format structure data.",
        "Do not add any explanatory text, markdown formatting, or additional fields beyond what's requested.",
        "Ensure the generated conformer has proper 3D coordinates and optimized geometry.",
        "If SMILES is empty, null, or invalid, return {\"error\": \"Invalid or empty SMILES string\"}.",
        "Include information about the force field used for optimization in the response."
    ],
    markdown=False,
    debug_mode=False
) 