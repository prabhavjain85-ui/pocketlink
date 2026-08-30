"""Unit tests for the RDKit PAINS / toxicophore checker."""

import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from _pains import check_compounds, check_smiles, pains_stem


CAFFEINE = "CN1C=NC2=C1C(=O)N(C(=O)N2C)C"
BENZOQUINONE = "O=C1C=CC(=O)C=C1"
RHODANINE = "O=C1CSC(=S)N1"
BENZALDEHYDE = "O=Cc1ccccc1"
EPOXIDE = "C1CO1"
CHLOROETHANE = "CCCl"
ACROLEIN = "C=CC=O"


class PainsStemTests(unittest.TestCase):
    def test_strips_catalog_suffix(self):
        self.assertEqual(pains_stem("quinone_A(370)"), "quinone")
        self.assertEqual(pains_stem("ene_rhod_A(235)"), "ene_rhod")
        self.assertEqual(pains_stem("indol_3yl_alk(461)"), "indol_3yl_alk")


class CheckSmilesTests(unittest.TestCase):
    def test_caffeine_is_clean(self):
        result = check_smiles(CAFFEINE, "2519")
        self.assertEqual(result["status"], "clean")
        self.assertFalse(result["hasAlerts"])
        self.assertTrue(result["checked"])
        self.assertEqual(result["alerts"], [])
        self.assertEqual(result["cid"], "2519")

    def test_benzoquinone_flags_pains_quinone(self):
        result = check_smiles(BENZOQUINONE, "10680")
        self.assertEqual(result["status"], "alert")
        self.assertTrue(result["hasAlerts"])
        names = [a["name"] for a in result["alerts"]]
        self.assertIn("Quinone", names)
        quinone = next(a for a in result["alerts"] if a["name"] == "Quinone")
        self.assertEqual(quinone["family"], "pains")
        self.assertIn("PAINS", quinone["catalog"])
        self.assertIn("false positive", quinone["explanation"].lower())

    def test_rhodanine_uses_plain_language_name(self):
        result = check_smiles(RHODANINE)
        self.assertEqual(result["status"], "alert")
        names = [a["name"] for a in result["alerts"]]
        self.assertIn("Rhodanine", names)
        rhod = next(a for a in result["alerts"] if a["name"] == "Rhodanine")
        self.assertIn("Rhodanine", rhod["explanation"])

    def test_toxicophores_not_covered_by_pains(self):
        aldehyde = check_smiles(BENZALDEHYDE)
        self.assertTrue(aldehyde["hasAlerts"])
        self.assertIn("Aldehyde", [a["name"] for a in aldehyde["alerts"]])

        epoxide = check_smiles(EPOXIDE)
        self.assertIn("Epoxide", [a["name"] for a in epoxide["alerts"]])

        halide = check_smiles(CHLOROETHANE)
        self.assertIn("Alkyl halide", [a["name"] for a in halide["alerts"]])

        acrolein = check_smiles(ACROLEIN)
        names = [a["name"] for a in acrolein["alerts"]]
        self.assertIn("Michael acceptor", names)
        self.assertIn("Aldehyde", names)

    def test_missing_and_invalid_smiles_are_unable(self):
        missing = check_smiles("", "1")
        self.assertEqual(missing["status"], "unable")
        self.assertFalse(missing["checked"])
        self.assertEqual(missing["reason"], "Missing SMILES")

        invalid = check_smiles("not-a-smiles", "2")
        self.assertEqual(invalid["status"], "unable")
        self.assertEqual(invalid["reason"], "Invalid SMILES")
        self.assertFalse(invalid["hasAlerts"])

    def test_batch_caps_at_five_and_preserves_order(self):
        rows = [
            {"cid": "2519", "smiles": CAFFEINE},
            {"cid": "10680", "smiles": BENZOQUINONE},
            {"cid": "x", "smiles": ""},
            {"cid": "y", "smiles": "%%%"},
            {"cid": "100", "smiles": EPOXIDE},
            {"cid": "extra", "smiles": CHLOROETHANE},
        ]
        results = check_compounds(rows)
        self.assertEqual(len(results), 5)
        self.assertEqual([r["cid"] for r in results], ["2519", "10680", "x", "y", "100"])
        self.assertEqual(results[0]["status"], "clean")
        self.assertEqual(results[1]["status"], "alert")
        self.assertEqual(results[2]["status"], "unable")
        self.assertEqual(results[3]["status"], "unable")
        self.assertEqual(results[4]["status"], "alert")


if __name__ == "__main__":
    unittest.main()
