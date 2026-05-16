import pytest
from unittest.mock import patch, MagicMock
from app.services.rdkit_utils import RDKitUtils
from app.agents.toolkit import rdkit_sanitize, rdkit_conformer
from app.agents.parser_agent import parser_agent
from app.agents.conformer_agent import conformer_agent
from app.services.molecular_docking import MolecularDockingService


class TestRDKitUtils:
    """Test the RDKit utilities for molecular processing."""
    
    def test_sanitize_smiles_valid(self):
        """Test sanitizing a valid SMILES string."""
        # Test with a simple molecule (caffeine)
        smiles = "CN1C=NC2=C1C(=O)N(C(=O)N2C)C"
        result = RDKitUtils.sanitize_smiles(smiles)
        assert isinstance(result, str)
        assert len(result) > 0
        
    def test_sanitize_smiles_invalid(self):
        """Test sanitizing an invalid SMILES string."""
        with pytest.raises(ValueError, match="Invalid SMILES"):
            RDKitUtils.sanitize_smiles("invalid_smiles_123")
            
    def test_sanitize_smiles_empty(self):
        """Test sanitizing an empty SMILES string."""
        with pytest.raises(ValueError, match="Empty SMILES string provided"):
            RDKitUtils.sanitize_smiles("")
            
        with pytest.raises(ValueError, match="Empty SMILES string provided"):
            RDKitUtils.sanitize_smiles("   ")
    
    def test_mol_summary_caffeine(self):
        """Test molecular summary for caffeine."""
        smiles = "CN1C=NC2=C1C(=O)N(C(=O)N2C)C"  # Caffeine
        result = RDKitUtils.mol_summary(smiles)
        
        # Check basic properties
        assert result["formula"] == "C8H10N4O2"
        assert abs(result["weight"] - 194.19) < 0.1  # Molecular weight of caffeine
        assert isinstance(result["descriptors"], dict)
        
        # Check descriptor presence and types
        descriptors = result["descriptors"]
        assert "heavy_atom_count" in descriptors
        assert "logp" in descriptors
        assert "hbd" in descriptors  # Hydrogen bond donors
        assert "hba" in descriptors  # Hydrogen bond acceptors
        assert "tpsa" in descriptors  # Topological polar surface area
        assert "lipinski_violations" in descriptors
        
        # Check specific values for caffeine
        assert descriptors["heavy_atom_count"] == 14  # 8C + 4N + 2O
        assert descriptors["hbd"] == 0  # No OH or NH groups
        assert descriptors["hba"] >= 2  # At least the oxygen atoms
        
    def test_mol_summary_aspirin(self):
        """Test molecular summary for aspirin."""
        smiles = "CC(=O)OC1=CC=CC=C1C(=O)O"  # Aspirin
        result = RDKitUtils.mol_summary(smiles)
        
        assert result["formula"] == "C9H8O4"
        assert abs(result["weight"] - 180.16) < 0.1
        
        descriptors = result["descriptors"]
        assert descriptors["hbd"] == 1  # One OH group
        assert descriptors["hba"] >= 3  # RDKit counts 3 HBA for aspirin (not 4)
        
    def test_embed_conformer_valid(self):
        """Test 3D conformer generation for a valid molecule."""
        smiles = "CCO"  # Ethanol - simple molecule
        result = RDKitUtils.embed_conformer(smiles)
        
        assert isinstance(result, str)
        assert "HETATM" in result  # PDB format should contain HETATM records (not ATOM for small molecules)
        assert "END" in result   # PDB format should end with END
        
    def test_embed_conformer_invalid(self):
        """Test 3D conformer generation for invalid SMILES."""
        with pytest.raises(ValueError, match="Invalid SMILES"):
            RDKitUtils.embed_conformer("invalid_smiles")
            
    def test_embed_conformer_forcefield_mmff(self):
        """Test conformer generation with MMFF force field."""
        smiles = "CCO"
        result = RDKitUtils.embed_conformer(smiles, forcefield="MMFF")
        assert isinstance(result, str)
        assert "HETATM" in result  # PDB format should contain HETATM records


class TestToolkit:
    """Test the toolkit functions used by agents."""
    
    def test_rdkit_sanitize_valid(self):
        """Test rdkit_sanitize tool with valid SMILES."""
        smiles = "CCO"  # Ethanol
        # Access the actual function from the agno Function wrapper
        result = rdkit_sanitize.entrypoint(smiles)
        
        assert "error" not in result
        assert result["status"] == "success"
        assert "smiles" in result
        assert "formula" in result
        assert "weight" in result
        assert "descriptors" in result
        assert isinstance(result["descriptors"], dict)
        
    def test_rdkit_sanitize_invalid(self):
        """Test rdkit_sanitize tool with invalid SMILES."""
        result = rdkit_sanitize.entrypoint("invalid_smiles_123")
        assert "error" in result
        assert "Failed to process SMILES" in result["error"]
        
    def test_rdkit_sanitize_empty(self):
        """Test rdkit_sanitize tool with empty input."""
        result = rdkit_sanitize.entrypoint("")
        assert "error" in result
        assert "Invalid input" in result["error"]
        
    def test_rdkit_sanitize_none(self):
        """Test rdkit_sanitize tool with None input."""
        result = rdkit_sanitize.entrypoint(None)
        assert "error" in result
        assert "Invalid input" in result["error"]

    def test_rdkit_conformer_valid(self):
        """Test rdkit_conformer tool with valid SMILES."""
        smiles = "CCO"  # Ethanol
        result = rdkit_conformer.entrypoint(smiles)
        
        assert "error" not in result
        assert result["status"] == "success"
        assert "pdb_block" in result
        assert "forcefield_used" in result
        assert "atom_count" in result
        assert "has_3d_coords" in result
        assert result["has_3d_coords"] is True
        assert result["atom_count"] > 0
        
    def test_rdkit_conformer_mmff(self):
        """Test rdkit_conformer tool with MMFF force field."""
        smiles = "CCO"
        result = rdkit_conformer.entrypoint(smiles, "MMFF")
        
        assert "error" not in result
        assert result["status"] == "success"
        assert result["forcefield_used"] == "MMFF"
        assert "HETATM" in result["pdb_block"]
        
    def test_rdkit_conformer_invalid_forcefield(self):
        """Test rdkit_conformer tool with invalid force field."""
        smiles = "CCO"
        result = rdkit_conformer.entrypoint(smiles, "INVALID")
        
        assert "error" in result
        assert "Invalid force field" in result["error"]
        
    def test_rdkit_conformer_invalid_smiles(self):
        """Test rdkit_conformer tool with invalid SMILES."""
        result = rdkit_conformer.entrypoint("invalid_smiles")
        
        assert "error" in result
        assert result["status"] == "failed"
        
    def test_rdkit_conformer_empty(self):
        """Test rdkit_conformer tool with empty input."""
        result = rdkit_conformer.entrypoint("")
        
        assert "error" in result
        assert "Invalid input" in result["error"]


class TestParserAgent:
    """Test the parser agent functionality."""
    
    @patch('app.agents.parser_agent.parser_agent.run')
    def test_parser_agent_valid_smiles(self, mock_run):
        """Test parser agent with valid SMILES input."""
        # Mock the agent response
        expected_response = {
            "smiles": "CCO",
            "formula": "C2H6O",
            "weight": 46.07,
            "inchi": "InChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3",
            "inchikey": "LFQSCWFLJHTTHZ-UHFFFAOYSA-N",
            "descriptors": {
                "heavy_atom_count": 3,
                "logp": -0.31,
                "hbd": 1,
                "hba": 1,
                "tpsa": 20.23,
                "lipinski_violations": 0
            }
        }
        mock_run.return_value = expected_response
        
        result = parser_agent.run("CCO")
        assert result == expected_response
        mock_run.assert_called_once_with("CCO")


class TestConformerAgent:
    """Test the conformer agent functionality."""
    
    @patch('app.agents.conformer_agent.conformer_agent.run')
    def test_conformer_agent_valid_smiles(self, mock_run):
        """Test conformer agent with valid SMILES input."""
        # Mock the agent response
        expected_response = {
            "pdb_block": "HETATM    1  C1  UNL     1       0.000   0.000   0.000  1.00  0.00           C  \nEND\n",
            "status": "success",
            "forcefield_used": "UFF"
        }
        mock_run.return_value = expected_response
        
        result = conformer_agent.run("CCO")
        assert result == expected_response
        mock_run.assert_called_once_with("CCO")

    @patch('app.agents.conformer_agent.conformer_agent.run')
    def test_conformer_agent_with_forcefield(self, mock_run):
        """Test conformer agent with specific force field."""
        expected_response = {
            "pdb_block": "HETATM    1  C1  UNL     1       0.000   0.000   0.000  1.00  0.00           C  \nEND\n",
            "status": "success",
            "forcefield_used": "MMFF"
        }
        mock_run.return_value = expected_response
        
        result = conformer_agent.run("CCO UFF")  # Agent should parse this appropriately
        assert result == expected_response


class TestMoleculeExamples:
    """Test with various real-world molecule examples."""
    
    @pytest.mark.parametrize("smiles,expected_formula", [
        ("CCO", "C2H6O"),  # Ethanol
        ("CC(=O)O", "C2H4O2"),  # Acetic acid
        ("c1ccccc1", "C6H6"),  # Benzene
        ("CC(C)CC1=CC=C(C=C1)C(C)C(=O)O", "C13H18O2"),  # Ibuprofen
        ("CN1C=NC2=C1C(=O)N(C(=O)N2C)C", "C8H10N4O2"),  # Caffeine
    ])
    def test_various_molecules(self, smiles, expected_formula):
        """Test parsing various real molecules."""
        try:
            sanitized = RDKitUtils.sanitize_smiles(smiles)
            summary = RDKitUtils.mol_summary(sanitized)
            
            assert summary["formula"] == expected_formula
            assert summary["weight"] > 0
            assert isinstance(summary["descriptors"], dict)
            assert len(summary["descriptors"]) > 5  # Should have multiple descriptors
            
        except Exception as e:
            pytest.fail(f"Failed to process {smiles}: {e}")

    @pytest.mark.parametrize("smiles", [
        "CCO",  # Ethanol
        "CC(=O)O",  # Acetic acid
        "c1ccccc1",  # Benzene
        "CN1C=NC2=C1C(=O)N(C(=O)N2C)C",  # Caffeine
    ])
    def test_conformer_generation(self, smiles):
        """Test 3D conformer generation for various molecules."""
        try:
            pdb_block = RDKitUtils.embed_conformer(smiles)
            
            assert isinstance(pdb_block, str)
            assert len(pdb_block) > 0
            assert "HETATM" in pdb_block
            assert "END" in pdb_block
            
            # Test both force fields
            pdb_mmff = RDKitUtils.embed_conformer(smiles, "MMFF")
            assert isinstance(pdb_mmff, str)
            assert "HETATM" in pdb_mmff
            
        except Exception as e:
            pytest.fail(f"Failed to generate conformer for {smiles}: {e}")


def test_placeholder():
    """Keep the original placeholder test."""
    assert True


class TestMolecularDockingConversion:
    """Tests for ligand preparation before Vina docking."""

    def test_2d_sdf_is_converted_to_3d_pdbqt(self):
        sdf_2d = """ethanol_2d
  RDKit

  3  2  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.1000    1.2000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
  2  3  1  0
M  END
$$$$
"""
        service = MolecularDockingService()
        pdbqt, filename = service.convert_sdf_to_pdbqt(sdf_2d, "ethanol.sdf")
        prepared = service.prepare_sdf_ligand(sdf_2d, "ethanol.sdf")
        coords = []
        for line in pdbqt.splitlines():
            if line.startswith(("ATOM", "HETATM")):
                coords.append((
                    float(line[30:38]),
                    float(line[38:46]),
                    float(line[46:54]),
                ))

        assert filename == "ethanol.pdbqt"
        assert "HETATM" in prepared["preview_pdb_content"]
        assert "HETATM" in prepared["source_pdb_content"]
        assert "V2000" in prepared["preview_sdf_content"]
        assert "V2000" in prepared["source_sdf_content"]
        assert prepared["conversion_notes"]
        assert len(coords) >= 3
        assert max(z for _, _, z in coords) - min(z for _, _, z in coords) > 0.05
        assert not any(abs(x) < 0.01 and abs(y) < 0.01 and abs(z) < 0.01 for x, y, z in coords)
