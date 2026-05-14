from typing import List, Dict, Any

try:
    from admet_ai import ADMETModel
except Exception:
    ADMETModel = None


# Optional human-friendly metadata for known ADMET properties returned by admet-ai.
PROPERTY_META: Dict[str, Dict[str, str]] = {
    "molecular_weight": {"unit": "g/mol", "description": "Molecular weight"},
    "logP":             {"unit": "log P",  "description": "Octanol-water partition coefficient"},
    "hydrogen_bond_acceptors": {"unit": "count", "description": "H-bond acceptors"},
    "hydrogen_bond_donors":    {"unit": "count", "description": "H-bond donors"},
    "Lipinski":         {"unit": "violations", "description": "Lipinski rule violations"},
    "QED":              {"unit": "score",   "description": "Quantitative drug-likeness"},
    "stereo_centers":   {"unit": "count",   "description": "Stereocenters"},
    "tpsa":             {"unit": "Å²",      "description": "Topological polar surface"},
    "HIA_Hou":          {"unit": "prob",    "description": "Human intestinal absorption"},
    "Pgp_Broccatelli":  {"unit": "prob",    "description": "P-glycoprotein inhibitor"},
    "Bioavailability_Ma": {"unit": "prob",  "description": "Oral bioavailability"},
    "BBB_Martins":      {"unit": "prob",    "description": "Blood-brain barrier permeability"},
    "PPBR_AZ":          {"unit": "%",       "description": "Plasma protein binding"},
    "VDss_Lombardo":    {"unit": "L/kg",    "description": "Volume of distribution"},
    "CYP3A4_Veith":     {"unit": "prob",    "description": "CYP3A4 inhibition"},
    "CYP2D6_Veith":     {"unit": "prob",    "description": "CYP2D6 inhibition"},
    "CYP1A2_Veith":     {"unit": "prob",    "description": "CYP1A2 inhibition"},
    "Half_Life_Obach":  {"unit": "hr",      "description": "Elimination half-life"},
    "Clearance_Hepatocyte_AZ": {"unit": "mL/min/kg", "description": "Hepatic clearance"},
    "hERG":             {"unit": "prob",    "description": "hERG channel inhibition"},
    "AMES":             {"unit": "prob",    "description": "Mutagenicity (Ames test)"},
    "LD50_Zhu":         {"unit": "log mg/kg","description": "Acute oral toxicity (LD50)"},
    "DILI":             {"unit": "prob",    "description": "Drug-induced liver injury"},
    "Carcinogens_Lagunin": {"unit": "prob", "description": "Carcinogenicity"},
}


class ADMETClient:
    _model = None

    @classmethod
    def load(cls):
        if ADMETModel and cls._model is None:
            cls._model = ADMETModel()
        return cls._model

    @classmethod
    def predict(cls, smiles: str) -> List[Dict[str, Any]]:
        """Return ADMET predictions as a list of {property,value,unit,probability} dicts."""
        if ADMETModel is None:
            # Fallback stub
            return [
                {"property": "HIA",        "value": 0.82, "probability": 0.82, "unit": "prob"},
                {"property": "hERG",       "value": "low-risk", "probability": 0.73, "unit": "prob"},
                {"property": "Bioavailability", "value": 0.75, "probability": 0.75, "unit": "prob"},
                {"property": "BBB",        "value": 0.45, "probability": 0.45, "unit": "prob"},
                {"property": "Toxicity",   "value": 0.25, "probability": 0.25, "unit": "prob"},
            ]

        model = cls.load()
        df = model.predict([smiles])  # pandas.DataFrame, one row per SMILES

        # Flatten the first row into per-property entries
        out: List[Dict[str, Any]] = []
        try:
            row = df.iloc[0].to_dict()
        except Exception:
            return [{"property": "raw", "value": str(df), "probability": None, "unit": None}]

        for prop_name, value in row.items():
            meta = PROPERTY_META.get(prop_name, {})
            # Pydantic schema accepts Union[float, str]
            try:
                v = float(value)
            except (TypeError, ValueError):
                v = str(value)
            out.append({
                "property": prop_name,
                "value": v,
                "unit": meta.get("unit"),
                "description": meta.get("description", prop_name),
                "probability": v if isinstance(v, float) and 0.0 <= v <= 1.0 else None,
            })
        return out
