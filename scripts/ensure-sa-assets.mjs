#!/usr/bin/env node
/**
 * Use committed SA assets in CI/Vercel (no Python/RDKit). Regenerate locally via `npm run build:sa-assets`.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const REMAP = path.join(ROOT, "server", "data", "evolution", "sa-folded-remap.bin.gz");
const CALIB = path.join(ROOT, "server", "data", "evolution", "sa-calibration.json");

function assetsPresent() {
  try {
    const r = fs.statSync(REMAP);
    const c = fs.statSync(CALIB);
    return r.size > 500 && c.size > 10;
  } catch {
    return false;
  }
}

if (process.env.FORCE_SA_REBUILD === "1") {
  execFileSync("npm", ["run", "build:sa-assets"], { cwd: ROOT, stdio: "inherit" });
  process.exit(0);
}

if (assetsPresent()) {
  console.log("[ensure-sa-assets] Using committed SA assets (skip Python/RDKit rebuild).");
  process.exit(0);
}

console.log("[ensure-sa-assets] Missing SA assets; attempting local rebuild (requires Python + RDKit)…");
try {
  execFileSync("npm", ["run", "build:sa-assets"], { cwd: ROOT, stdio: "inherit" });
} catch (err) {
  console.error(
    "[ensure-sa-assets] Rebuild failed. Commit server/data/evolution/sa-*.json|.bin.gz or run `npm run build:sa-assets` locally."
  );
  process.exit(1);
}
