#!/usr/bin/env python3
"""Reference SA score + sparse Morgan counts for parity tests."""
import json
import os
import sys

from rdkit import Chem
from rdkit.Chem import RDConfig, rdFingerprintGenerator

sys.path.insert(0, os.path.join(RDConfig.RDContribDir, "SA_Score"))
import sascorer  # noqa: E402

mfpgen = rdFingerprintGenerator.GetMorganGenerator(radius=2)


def sparse_counts(mol):
    sfp = mfpgen.GetSparseCountFingerprint(mol)
    return {int(k): int(v) for k, v in sfp.GetNonzeroElements().items()}


def main():
    payload = json.load(sys.stdin)
    mode = payload.get("mode", "score")
    smiles = payload.get("smiles", "")
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        print(json.dumps({"ok": False, "error": "invalid smiles"}))
        return
    if mode == "sparse":
        print(json.dumps({"ok": True, "counts": sparse_counts(mol)}))
        return
    score = sascorer.calculateScore(mol)
    print(json.dumps({"ok": True, "score": float(score), "counts": sparse_counts(mol)}))


if __name__ == "__main__":
    main()
