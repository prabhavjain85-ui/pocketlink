#!/usr/bin/env node
/** Sync VALIDATED_IDS in api/dock-vina.js and src/vinaDockClient.js from vina_validated_targets.json */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const validated = JSON.parse(
  readFileSync(join(root, "benchmark/vina_validated_targets.json"), "utf8")
);
const ids = validated.validated.map((t) => t.target_id).sort();

const dockVinaPath = join(root, "api/dock-vina.js");
let dock = readFileSync(dockVinaPath, "utf8");
dock = dock.replace(
  /const VALIDATED_IDS = new Set\(\[[\s\S]*?\]\);/,
  `const VALIDATED_IDS = new Set([\n${ids.map((id) => `  "${id}",`).join("\n")}\n]);`
);
writeFileSync(dockVinaPath, dock);

const clientPath = join(root, "src/vinaDockClient.js");
const entries = validated.validated
  .map(
    (t) =>
      `  { targetId: "${t.target_id}", pdbId: "${t.pdb_id.toUpperCase()}", label: "${t.display_name || t.target_id}" },`
  )
  .join("\n");
let client = readFileSync(clientPath, "utf8");
client = client.replace(
  /const VALIDATED = \[[\s\S]*?\];/,
  `const VALIDATED = [\n${entries}\n];`
);
writeFileSync(clientPath, client);
console.log("Synced allowlist:", ids.join(", "));
