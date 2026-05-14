from agno.agent import Agent
from agno.models.groq import Groq
from .toolkit import rdkit_sanitize

parser_agent = Agent(
    name="ParserAgent",
    role="Molecular Parser and Validator",
    model=Groq(id="llama-3.1-70b-versatile"),  # Using Grok Free API as per user preference
    tools=[rdkit_sanitize],
    instructions=[
        "You are a molecular parser agent that validates and standardizes chemical molecules from SMILES input.",
        "Use the rdkit_sanitize tool to process SMILES strings and extract comprehensive molecular information.",
        "Always call rdkit_sanitize with the provided SMILES string to get molecular properties.",
        "If the tool returns an error, respond with a JSON containing only the error field.",
        "If successful, return a clean JSON response with these exact fields: smiles, formula, weight, inchi, inchikey, descriptors.",
        "The descriptors field should contain all calculated molecular descriptors from RDKit.",
        "Do not add any explanatory text, markdown formatting, or additional fields beyond what's requested.",
        "Ensure all numeric values are properly formatted (weights rounded to 2 decimal places).",
        "If SMILES is empty, null, or invalid, return {\"error\": \"Invalid or empty SMILES string\"}."
    ],
    markdown=False,
    debug_mode=False
) 