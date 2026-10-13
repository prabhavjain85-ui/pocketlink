#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "data", "evolution", "sa-folded-remap.bin.gz");

const py = `
import gzip, pickle, struct, os, sys
from rdkit.Chem import RDConfig
p = os.path.join(RDConfig.RDContribDir, "SA_Score", "fpscores.pkl.gz")
with gzip.open(p, "rb") as f:
    data = pickle.load(f)
fscores = {}
for row in data:
    for j in range(1, len(row)):
        fscores[int(row[j])] = float(row[0])
FP = 2048
buckets = [[] for _ in range(FP)]
for sid, sc in fscores.items():
    buckets[sid % FP].append(sc)
remap = []
for b in buckets:
    remap.append(sum(b)/len(b) if b else -4.0)
buf = struct.pack("<" + "f"*FP, *remap)
sys.stdout.buffer.write(gzip.compress(buf, 9))
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const gz = execFileSync("python3", ["-c", py]);
fs.writeFileSync(OUT, gz);
console.log(`Wrote ${OUT} (${gz.length} bytes)`);
