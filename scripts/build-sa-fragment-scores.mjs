#!/usr/bin/env node
/**
 * Export RDKit fpscores.pkl.gz to a compact grouped binary for in-browser SA scoring.
 * Format: repeated [float32 score][uint32 nIds][nIds × uint32 id]
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "data", "evolution");
const OUT_FILE = path.join(OUT_DIR, "sa-fragment-scores.bin.gz");

const py = `
import gzip, pickle, struct, sys, os
from rdkit.Chem import RDConfig
p = os.path.join(RDConfig.RDContribDir, "SA_Score", "fpscores.pkl.gz")
with gzip.open(p, "rb") as f:
    data = pickle.load(f)
buf = bytearray()
for row in data:
    sc = float(row[0])
    ids = [int(x) for x in row[1:]]
    buf += struct.pack("<fI", sc, len(ids))
    for i in ids:
        buf += struct.pack("<I", i)
sys.stdout.buffer.write(bytes(buf))
`;

fs.mkdirSync(OUT_DIR, { recursive: true });
const raw = execFileSync("python3", ["-c", py], { maxBuffer: 64 * 1024 * 1024 });
const gz = zlib.gzipSync(raw, { level: 9 });
fs.writeFileSync(OUT_FILE, gz);
console.log(`Wrote ${OUT_FILE} (${gz.length} bytes gzipped, ${raw.length} raw)`);
