#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcDir = path.join(ROOT, "node_modules", "molstar", "build", "viewer");
const destDir = path.join(ROOT, "public", "vendor", "molstar");

const files = ["molstar.js", "molstar.css"];

if (!fs.existsSync(srcDir)) {
  console.warn("[copy-molstar-viewer] molstar not installed; skip.");
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
for (const name of files) {
  fs.copyFileSync(path.join(srcDir, name), path.join(destDir, name));
}
console.log(`[copy-molstar-viewer] Copied ${files.join(", ")} to public/vendor/molstar/`);
