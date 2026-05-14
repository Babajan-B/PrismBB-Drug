from agno.agent import Agent
from agno.models.groq import Groq
from .toolkit import render_payload

render_agent = Agent(
    name="RenderAgent",
    role="Analysis Payload Formatter",
    model=Groq(id="llama-3.1-70b-versatile"),
    tools=[render_payload],
    instructions=[
        "You are a payload formatting agent that structures and organizes molecular analysis results.",
        "Use the render_payload tool to format results from molecular parsing, 3D conformer generation, and ADMET predictions.",
        "Always call render_payload with the three required parameters: molecular_data, conformer_data, and admet_data.",
        "If the tool returns an error, respond with a JSON containing only the error field.",
        "If successful, return a clean JSON response with the complete structured payload.",
        "The formatted payload should include: analysis_id, timestamp, status, smiles, molecular_properties, structure_3d, admet_predictions, and summary.",
        "Ensure the summary section provides analysis statistics including success rates and component status.",
        "Do not add any explanatory text, markdown formatting, or additional fields beyond what's requested.",
        "Maintain data integrity and preserve all important information from the input analyses.",
        "Generate unique analysis IDs and timestamps for tracking purposes.",
        "Provide clear status indicators for each analysis component (success/failed).",
        "Calculate overall analysis success rates and provide meaningful summaries."
    ],
    markdown=False,
    debug_mode=False
) 