"""Tests for experimental Quantum Insight backend."""

import importlib.util
import os
import sys
import unittest

API_DIR = os.path.dirname(os.path.abspath(__file__))
if API_DIR not in sys.path:
    sys.path.insert(0, API_DIR)

from quantum_insight_gate import (  # noqa: E402
    H2_CANONICAL_GEOMETRY,
    MAX_ATOMS,
    MAX_NON_H_ATOMS,
    MAX_QUBITS,
    atoms_to_geometry,
    count_atoms_in_geometry,
    is_h2_smiles,
    refusal_payload,
    resolve_geometry,
    size_gate_reasons,
)


class TestQuantumInsightGate(unittest.TestCase):
    def test_h2_smiles_resolve_to_canonical_geometry(self):
        geometry, source = resolve_geometry({"smiles": "[H][H]"})
        self.assertEqual(geometry, H2_CANONICAL_GEOMETRY)
        self.assertEqual(source, "h2_canonical")

    def test_atoms_to_geometry(self):
        geometry = atoms_to_geometry(
            [
                {"symbol": "H", "x": 0, "y": 0, "z": 0},
                {"symbol": "H", "x": 0, "y": 0, "z": 0.735},
            ]
        )
        total, non_h = count_atoms_in_geometry(geometry)
        self.assertEqual(total, 2)
        self.assertEqual(non_h, 0)

    def test_size_gate_refuses_drug_like_molecule(self):
        caffeine_atoms = "C" * 8 + "H" * 10 + "N" * 4 + "O" * 2
        reasons = size_gate_reasons(len(caffeine_atoms), 14)
        self.assertTrue(any("atoms" in r for r in reasons))
        self.assertTrue(any("non-hydrogen" in r for r in reasons))

    def test_size_gate_refuses_high_qubit_count(self):
        reasons = size_gate_reasons(2, 0, n_qubits=MAX_QUBITS + 1)
        self.assertEqual(len(reasons), 1)
        self.assertIn("qubit", reasons[0].lower())

    def test_refusal_payload_shape(self):
        payload = refusal_payload(["too big"], atom_count=20, non_h_count=10, n_qubits=12)
        self.assertTrue(payload["experimental"])
        self.assertTrue(payload["refused"])
        self.assertEqual(payload["limits"]["max_atoms"], MAX_ATOMS)
        self.assertEqual(payload["limits"]["max_non_hydrogen_atoms"], MAX_NON_H_ATOMS)
        self.assertEqual(payload["limits"]["max_qubits"], MAX_QUBITS)

    def test_non_h2_smiles_without_geometry_raises(self):
        with self.assertRaises(ValueError):
            resolve_geometry({"smiles": "CCO"})

    def test_count_atoms_in_geometry(self):
        total, non_h = count_atoms_in_geometry(H2_CANONICAL_GEOMETRY)
        self.assertEqual(total, 2)
        self.assertEqual(non_h, 0)

    def test_is_h2_smiles(self):
        self.assertTrue(is_h2_smiles("HH"))
        self.assertFalse(is_h2_smiles("CCO"))


def _load_handler_module():
    path = os.path.join(API_DIR, "quantum-insight.py")
    spec = importlib.util.spec_from_file_location("quantum_insight_handler", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestQuantumInsightHandler(unittest.TestCase):
    def test_post_h2_returns_energy_shape(self):
        handler_mod = _load_handler_module()
        status, body = handler_mod.handle_quantum_request({"smiles": "[H][H]"})
        self.assertEqual(status, 200)
        self.assertTrue(body["experimental"])
        self.assertFalse(body["refused"])
        self.assertIn("total_energy_hartree", body)
        self.assertIn("explanation", body)

    def test_post_large_molecule_refused_before_vqe(self):
        handler_mod = _load_handler_module()
        geometry = "; ".join([f"C {i} 0 0" for i in range(10)])
        status, body = handler_mod.handle_quantum_request({"geometry": geometry})
        self.assertEqual(status, 422)
        self.assertTrue(body["refused"])

    def test_post_fragment_h2_geometry_allowed(self):
        handler_mod = _load_handler_module()
        geometry = "H 0 0 0; H 0 0 0.735"
        status, body = handler_mod.handle_quantum_request(
            {
                "fragment": True,
                "geometry": geometry,
                "parent_smiles": "CC(=O)Oc1ccccc1C(=O)O",
                "fragment_atoms": ["H", "H"],
                "fragment_formula": "H–H",
                "selection_source": "ligand_polar_pair_no_pocket",
            }
        )
        self.assertEqual(status, 200)
        self.assertTrue(body["fragment"])
        self.assertEqual(body["fragment_formula"], "H–H")
        self.assertIn("fragment ground-state energy", body["explanation"].lower())
        self.assertIn("not binding affinity", body["explanation"].lower())

    def test_post_fragment_co_refused_for_qubit_cap(self):
        handler_mod = _load_handler_module()
        geometry = "C 0 0 0; O 0 0 1.23"
        status, body = handler_mod.handle_quantum_request(
            {
                "fragment": True,
                "geometry": geometry,
                "parent_smiles": "CC(=O)Oc1ccccc1C(=O)O",
                "fragment_atoms": ["C", "O"],
                "fragment_formula": "C–O",
                "selection_source": "ligand_polar_pair_no_pocket",
            }
        )
        self.assertEqual(status, 422)
        self.assertTrue(body["refused"])
        self.assertTrue(body["fragment"])
        self.assertIn("fragment", body["error"].lower())
        self.assertTrue(any("qubit" in r.lower() for r in body["reasons"]))

    def test_post_oversized_fragment_refused_with_fragment_message(self):
        handler_mod = _load_handler_module()
        geometry = "; ".join([f"C {i} 0 0" for i in range(6)])
        status, body = handler_mod.handle_quantum_request(
            {
                "fragment": True,
                "geometry": geometry,
                "parent_smiles": "CCO",
                "fragment_atoms": ["C"] * 6,
                "fragment_formula": "too-big",
                "selection_source": "test",
            }
        )
        self.assertEqual(status, 422)
        self.assertTrue(body["refused"])
        self.assertTrue(body["fragment"])
        self.assertIn("fragment", body["error"].lower())


@unittest.skipUnless(
    os.environ.get("RUN_QUANTUM_VQE_TESTS") == "1",
    "Set RUN_QUANTUM_VQE_TESTS=1 to run full Qiskit/PySCF VQE integration test.",
)
class TestH2VqeGolden(unittest.TestCase):
    def test_h2_sto3g_vqe_energy(self):
        from quantum_insight_vqe import run_vqe

        result = run_vqe(H2_CANONICAL_GEOMETRY)
        energy = result["total_energy_hartree"]
        self.assertAlmostEqual(energy, -1.13730604, places=2)
        self.assertEqual(result["n_qubits"], 2)
        self.assertEqual(result["basis"], "sto-3g")


if __name__ == "__main__":
    unittest.main()
