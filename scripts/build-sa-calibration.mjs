#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "server", "data", "evolution", "sa-calibration.json");

const py = `
import json, random, sys, os
from rdkit import Chem
from rdkit.Chem import RDConfig
sys.path.insert(0, os.path.join(RDConfig.RDContribDir, "SA_Score"))
import sascorer
from rdkit.Chem import rdFingerprintGenerator
import gzip, struct

random.seed(42)
smiles = ["CCO","c1ccccc1","CC(=O)Oc1ccccc1C(=O)O","CN1C=NC2=C1C(=O)N(C(=O)N2C)C",
          "CC(C)Cc1ccc(C(C)C(=O)O)cc1","C1CCCCC1","CCN(CC)CC","c1ccncc1"]
with gzip.open(os.path.join("${ROOT}", "server/data/evolution/sa-folded-remap.bin.gz"), "rb") as f:
    remap = struct.unpack("<2048f", f.read())

def folded_raw(mol):
    gen = rdFingerprintGenerator.GetMorganGenerator(radius=2, fpSize=2048)
    cfp = gen.GetCountFingerprint(mol)
    score1=0; nf=0
    for bit,cnt in cfp.GetNonzeroElements().items():
        nf += cnt
        score1 += remap[bit % 2048]*cnt
    score1 /= max(1,nf)
    nAtoms = mol.GetNumAtoms()
    import math
    from rdkit.Chem import rdMolDescriptors
    nChiral=len(Chem.FindMolChiralCenters(mol, includeUnassigned=True))
    nSpiro=rdMolDescriptors.CalcNumSpiroAtoms(mol)
    nBridge=rdMolDescriptors.CalcNumBridgeheadAtoms(mol)
    sizePenalty = nAtoms**1.005 - nAtoms
    score2 = 0. - sizePenalty - math.log10(nChiral+1) - math.log10(nSpiro+1) - math.log10(nBridge+1)
    numBits = len(cfp.GetNonzeroElements())
    score3 = math.log(float(nAtoms)/numBits)*0.5 if nAtoms>numBits else 0
    return score1+score2+score3

xs=[]; ys=[]
for smi in smiles:
    m=Chem.MolFromSmiles(smi)
    xs.append(folded_raw(m))
    ys.append(sascorer.calculateScore(m))
# affine fit sa = a*raw + b on inverted scale - fit raw to sa via linear
import statistics as st
mx=st.mean(xs); my=st.mean(ys)
num=sum((x-mx)*(y-my) for x,y in zip(xs,ys))
den=sum((x-mx)**2 for x in xs) or 1
a=num/den
b=my-a*mx
print(json.dumps({"rawToSa": {"a": a, "b": b}, "n": len(xs)}))
`;

const out = execFileSync("python3", ["-c", py], { encoding: "utf8" });
fs.writeFileSync(OUT, out.trim());
console.log("Wrote", OUT, out.trim());
