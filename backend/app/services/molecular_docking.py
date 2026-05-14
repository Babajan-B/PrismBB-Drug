"""
Molecular Docking Service for AutoDock Vina integration.

Falls back to a deterministic stub when the Vina binary or Python bindings
are unavailable, so the rest of the API (and UI) remain runnable.
"""
from __future__ import annotations

import os
import random
import shutil
import subprocess
import tempfile
from typing import Dict, List, Optional, Tuple


# ------------------------------------------------------------------ Optional deps
try:
    from rdkit import Chem
    from rdkit.Chem import AllChem
    HAS_RDKIT = True
except Exception:  # pragma: no cover
    HAS_RDKIT = False

try:
    from meeko import MoleculePreparation, PDBQTWriterLegacy
    HAS_MEEKO = True
except Exception:  # pragma: no cover
    HAS_MEEKO = False

# vina Python bindings (needs Boost on macOS — often unavailable)
try:  # pragma: no cover
    import vina as _vina_py  # noqa: F401
    HAS_VINA_PY = True
except Exception:
    HAS_VINA_PY = False

VINA_BINARY = shutil.which("vina")
HAS_VINA_BINARY = VINA_BINARY is not None


class MolecularDockingService:
    """Service for converting PDB/SDF → PDBQT and running Vina docking (or stubbing it)."""

    def __init__(self) -> None:
        self.temp_dir = tempfile.mkdtemp(prefix="vina_docking_")

    # ============================================================== Capabilities
    @staticmethod
    def capabilities() -> Dict[str, bool | Optional[str]]:
        return {
            "rdkit": HAS_RDKIT,
            "meeko": HAS_MEEKO,
            "vina_python": HAS_VINA_PY,
            "vina_binary": HAS_VINA_BINARY,
            "vina_binary_path": VINA_BINARY,
            "real_docking": HAS_VINA_BINARY or HAS_VINA_PY,
        }

    # ================================================================ Conversion
    def convert_pdb_to_pdbqt(
        self, pdb_content: str, molecule_type: str, filename: Optional[str] = None
    ) -> Tuple[str, str]:
        """Convert PDB content to PDBQT (protein or ligand)."""
        try:
            if molecule_type == "protein":
                pdbqt_content = self._convert_protein_pdb_to_pdbqt(pdb_content)
            else:  # ligand
                pdbqt_content = self._convert_ligand_pdb_to_pdbqt(pdb_content)

            base_name = (filename.replace(".pdb", "") if filename else molecule_type)
            return pdbqt_content, f"{base_name}.pdbqt"
        except Exception as e:
            raise Exception(f"Failed to convert PDB to PDBQT: {e}") from e

    def convert_sdf_to_pdbqt(
        self, sdf_content: str, filename: Optional[str] = None
    ) -> Tuple[str, str]:
        """Convert SDF content to PDBQT (ligand only)."""
        if not HAS_RDKIT:
            raise Exception("RDKit not installed — cannot parse SDF")
        try:
            mol = Chem.MolFromMolBlock(sdf_content)
            if mol is None:
                raise ValueError("Invalid SDF content")
            mol = Chem.AddHs(mol)
            if mol.GetNumConformers() == 0:
                AllChem.EmbedMolecule(mol, randomSeed=42)
                AllChem.UFFOptimizeMolecule(mol)

            pdbqt_content = self._mol_to_pdbqt(mol)
            base_name = filename.replace(".sdf", "") if filename else "ligand"
            return pdbqt_content, f"{base_name}.pdbqt"
        except Exception as e:
            raise Exception(f"Failed to convert SDF to PDBQT: {e}") from e

    # ------------------------------------------------------ private converters
    def _mol_to_pdbqt(self, mol) -> str:
        """Use Meeko if available, otherwise fall back to a simple per-atom writer."""
        if HAS_MEEKO:
            try:
                preparator = MoleculePreparation()
                mol_setups = preparator.prepare(mol)
                # meeko >=0.5 returns list of MoleculeSetup objects
                if isinstance(mol_setups, list) and mol_setups:
                    setup = mol_setups[0]
                    pdbqt_string, _, _ = PDBQTWriterLegacy.write_string(setup)
                    return pdbqt_string
                # fallback to legacy API
                if hasattr(preparator, "write_pdbqt_string"):
                    return preparator.write_pdbqt_string()
            except Exception:
                pass  # fall through to simple writer

        # --- simple writer ---
        pdb = Chem.MolToPDBBlock(mol)
        return self._simple_pdb_to_pdbqt(pdb)

    def _convert_protein_pdb_to_pdbqt(self, pdb_content: str) -> str:
        """Convert protein PDB → PDBQT with simplified atom-type assignment."""
        pdbqt_lines: List[str] = []
        for line in pdb_content.strip().splitlines():
            if line.startswith(("ATOM", "HETATM")):
                atom_name = line[12:16].strip()
                atype = atom_name[:1].upper() if atom_name else "C"
                if atype not in ("N", "O", "S", "C", "H", "P", "F"):
                    atype = "C"
                charge = 0.000
                # PDBQT extends PDB with charge + atom type after column 70
                pdbqt_line = f"{line[:70]}{charge:8.3f} {atype:>2}"
                pdbqt_lines.append(pdbqt_line)
            elif line.startswith(("MODEL", "ENDMDL", "TER", "END")):
                pdbqt_lines.append(line)
        return "\n".join(pdbqt_lines) + "\n"

    def _convert_ligand_pdb_to_pdbqt(self, pdb_content: str) -> str:
        if HAS_RDKIT:
            try:
                mol = Chem.MolFromPDBBlock(pdb_content, removeHs=False)
                if mol is not None:
                    mol = Chem.AddHs(mol, addCoords=True)
                    return self._mol_to_pdbqt(mol)
            except Exception:
                pass
        return self._simple_pdb_to_pdbqt(pdb_content)

    @staticmethod
    def _simple_pdb_to_pdbqt(pdb_content: str) -> str:
        out: List[str] = ["ROOT"]
        atom_count = 0
        for line in pdb_content.strip().splitlines():
            if line.startswith(("ATOM", "HETATM")):
                atom_count += 1
                atom_name = line[12:16].strip()
                atype = atom_name[:1].upper() if atom_name else "C"
                if atype not in ("N", "O", "S", "C", "H", "P", "F"):
                    atype = "C"
                out.append(f"{line[:70]}{0.000:8.3f} {atype:>2}")
        out.append("ENDROOT")
        out.append(f"TORSDOF {max(0, atom_count - 4)}")
        return "\n".join(out) + "\n"

    # ==================================================================== Docking
    def run_docking(
        self,
        protein_pdbqt: str,
        ligand_pdbqt: str,
        grid_config: Dict,
        docking_params: Dict,
    ) -> Dict:
        """Run AutoDock Vina docking — real if Vina is available, otherwise stub."""
        if HAS_VINA_BINARY:
            return self._run_vina_binary(protein_pdbqt, ligand_pdbqt, grid_config, docking_params)
        return self._run_vina_stub(protein_pdbqt, ligand_pdbqt, grid_config, docking_params)

    # ----------------------------------------------------- real binary path
    def _run_vina_binary(
        self,
        protein_pdbqt: str,
        ligand_pdbqt: str,
        grid_config: Dict,
        docking_params: Dict,
    ) -> Dict:
        try:
            protein_file = os.path.join(self.temp_dir, "receptor.pdbqt")
            ligand_file = os.path.join(self.temp_dir, "ligand.pdbqt")
            output_file = os.path.join(self.temp_dir, "output.pdbqt")

            with open(protein_file, "w") as f:
                f.write(protein_pdbqt)
            with open(ligand_file, "w") as f:
                f.write(ligand_pdbqt)

            cmd = [
                VINA_BINARY,
                "--receptor", protein_file,
                "--ligand", ligand_file,
                "--center_x", str(grid_config["center_x"]),
                "--center_y", str(grid_config["center_y"]),
                "--center_z", str(grid_config["center_z"]),
                "--size_x", str(grid_config["size_x"]),
                "--size_y", str(grid_config["size_y"]),
                "--size_z", str(grid_config["size_z"]),
                "--out", output_file,
                "--num_modes", str(docking_params["num_modes"]),
                "--exhaustiveness", str(docking_params["exhaustiveness"]),
                "--energy_range", str(docking_params["energy_range"]),
                "--scoring", docking_params["forcefield"],
            ]
            proc = subprocess.run(cmd, capture_output=True, text=True, cwd=self.temp_dir)
            if proc.returncode != 0:
                raise Exception(f"Vina exited {proc.returncode}: {proc.stderr}")

            poses = self._parse_vina_output(proc.stdout)
            docked_pdbqt = ""
            if os.path.exists(output_file):
                with open(output_file) as f:
                    docked_pdbqt = f.read()

            affinities = [p["affinity"] for p in poses]
            return {
                "poses": poses,
                "best_affinity": min(affinities) if affinities else 0.0,
                "average_affinity": sum(affinities) / len(affinities) if affinities else 0.0,
                "total_modes": len(poses),
                "docked_pdbqt": docked_pdbqt,
                "vina_log": proc.stdout,
                "status": "success",
                "mode": "vina-binary",
            }
        except Exception as e:
            # Don't crash — fall back to stub so the UI keeps working
            stub = self._run_vina_stub(protein_pdbqt, ligand_pdbqt, grid_config, docking_params)
            stub["vina_log"] = f"[vina binary failed: {e}]\n\n{stub['vina_log']}"
            return stub

    # ----------------------------------------------------- stub fallback path
    @staticmethod
    def _run_vina_stub(
        protein_pdbqt: str,
        ligand_pdbqt: str,
        grid_config: Dict,
        docking_params: Dict,
    ) -> Dict:
        """Deterministic synthetic docking result for environments without Vina."""
        num_modes = int(docking_params.get("num_modes", 9))
        ff = docking_params.get("forcefield", "vina")

        rng = random.Random(hash((len(protein_pdbqt), len(ligand_pdbqt), num_modes, ff)) & 0xFFFFFFFF)
        # generate descending affinities (more negative = better)
        base = -9.5 + rng.uniform(-0.5, 0.5)
        poses: List[Dict] = []
        for i in range(1, num_modes + 1):
            aff = round(base + (i - 1) * (0.25 + rng.uniform(0, 0.2)), 3)
            rmsd_lb = 0.0 if i == 1 else round(rng.uniform(1.0, 4.5), 3)
            rmsd_ub = 0.0 if i == 1 else round(rmsd_lb + rng.uniform(0.5, 2.0), 3)
            poses.append({
                "mode": i,
                "affinity": aff,
                "rmsd_lb": rmsd_lb,
                "rmsd_ub": rmsd_ub,
                "rank": i,
            })

        affinities = [p["affinity"] for p in poses]
        log = (
            "AutoDock Vina (stub — install the `vina` binary for real docking)\n"
            f"Center: ({grid_config['center_x']}, {grid_config['center_y']}, {grid_config['center_z']})\n"
            f"Size  : ({grid_config['size_x']} × {grid_config['size_y']} × {grid_config['size_z']}) Å\n"
            f"Scoring function: {ff}\n"
            f"Exhaustiveness  : {docking_params.get('exhaustiveness', 8)}\n\n"
            "mode |   affinity | dist from best mode\n"
            "     | (kcal/mol) | rmsd l.b.|  rmsd u.b.\n"
            "-----+------------+----------+----------\n"
            + "\n".join(
                f"{p['mode']:>4} | {p['affinity']:>10.3f} | {p['rmsd_lb']:>8.3f} | {p['rmsd_ub']:>8.3f}"
                for p in poses
            )
        )

        return {
            "poses": poses,
            "best_affinity": min(affinities),
            "average_affinity": sum(affinities) / len(affinities),
            "total_modes": len(poses),
            "docked_pdbqt": ligand_pdbqt,  # echo input so 3D viewer still has something
            "vina_log": log,
            "status": "success",
            "mode": "stub",
        }

    # --------------------------------------------------- log parsing
    @staticmethod
    def _parse_vina_output(vina_output: str) -> List[Dict]:
        poses: List[Dict] = []
        in_results = False
        for line in vina_output.splitlines():
            if "mode |" in line and "affinity" in line:
                in_results = True
                continue
            if "-----+" in line and in_results:
                continue
            if in_results:
                parts = line.strip().split()
                if len(parts) >= 4 and parts[0].isdigit():
                    try:
                        poses.append({
                            "mode": int(parts[0]),
                            "affinity": float(parts[1]),
                            "rmsd_lb": float(parts[2]),
                            "rmsd_ub": float(parts[3]),
                            "rank": int(parts[0]),
                        })
                    except (ValueError, IndexError):
                        continue
                elif not line.strip():
                    break
        return poses

    # --------------------------------------------------- cleanup
    def cleanup(self) -> None:
        try:
            if os.path.exists(self.temp_dir):
                shutil.rmtree(self.temp_dir)
        except Exception:
            pass

    def __del__(self) -> None:  # noqa: D401
        self.cleanup()
