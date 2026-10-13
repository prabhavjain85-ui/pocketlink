#!/usr/bin/env python3
import sys
from rdkit import Chem
from rdkit.Chem import AllChem

smi = sys.argv[1]
mol = Chem.MolFromSmiles(smi)
if mol is None:
    sys.exit(1)
fp = AllChem.GetMorganFingerprintAsBitVect(mol, 2, nBits=2048)
print(fp.ToBitString())
