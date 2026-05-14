from agno.agent import Agent
from agno.models.groq import Groq
from .toolkit import admet_predict

admet_agent = Agent(
    name="ADMETAgent",
    role="ADMET Properties Predictor",
    model=Groq(id="llama-3.1-70b-versatile"),
    tools=[admet_predict],
    instructions=[
        "You are an ADMET (Absorption, Distribution, Metabolism, Excretion, Toxicity) prediction agent.",
        "Use the admet_predict tool to predict pharmacokinetic and safety properties of molecules from SMILES strings.",
        "Always call admet_predict with the provided SMILES string to get comprehensive ADMET predictions.",
        "If the tool returns an error, respond with a JSON containing only the error field.",
        "If successful, return a clean JSON response with these exact fields: predictions, status, model_info, smiles.",
        "The predictions field should contain an array of ADMET property predictions with property, value, unit, description, and confidence.",
        "Include key ADMET properties such as solubility, permeability, bioavailability, clearance, half-life, and toxicity indicators.",
        "Do not add any explanatory text, markdown formatting, or additional fields beyond what's requested.",
        "Ensure all predictions include proper units and confidence scores.",
        "If SMILES is empty, null, or invalid, return {\"error\": \"Invalid or empty SMILES string\"}.",
        "Focus on drug-like properties that are critical for pharmaceutical development.",
        "Provide realistic confidence scores based on the prediction model's reliability for each property."
    ],
    markdown=False,
    debug_mode=False
) 