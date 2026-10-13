#!/usr/bin/env python3
from rdkit import Chem
from rdkit.Chem import rdFingerprintGenerator

gen = rdFingerprintGenerator.GetMorganGenerator(radius=2)
for smi in ["CCO", "c1ccccc1", "Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1"]:
    m = Chem.MolFromSmiles(smi)
    sfp = gen.GetSparseCountFingerprint(m)
    print(smi, dict(sfp.GetNonzeroElements()))
