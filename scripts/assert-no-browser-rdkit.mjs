#!/usr/bin/env node
/**
 * Guard against accidentally shipping the RDKit runtime to browser clients.
 * The server imports RDKit from node_modules; browser code may only use the
 * disabled compatibility adapter in src/rdkitLoader.js.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(ROOT, "src");
const forbidden = [
  /initRDKitModule/,
  /RDKit_minimal\.(?:js|wasm)/,
  /@rdkit\/rdkit/,
  /window\.RDKit/,
];
const failures = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (/\.(?:js|jsx|ts|tsx)$/.test(entry.name)) {
      const text = fs.readFileSync(fullPath, "utf8");
      for (const pattern of forbidden) {
        if (pattern.test(text)) failures.push(`${path.relative(ROOT, fullPath)} matches ${pattern}`);
      }
    }
  }
}

walk(SRC);

for (const asset of ["public/RDKit_minimal.js", "public/RDKit_minimal.wasm"]) {
  const fullPath = path.join(ROOT, asset);
  if (!fs.existsSync(fullPath)) continue;
  const text = fs.readFileSync(fullPath, "utf8");
  if (/initRDKitModule|WebAssembly\.instantiate|RDKit_minimal/.test(text)) {
    failures.push(`${asset} appears to contain a browser RDKit runtime`);
  }
}

if (failures.length) {
  console.error("Browser RDKit guard failed:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("[browser-rdkit-guard] No RDKit runtime found in browser source/assets.");
