# Lazy-loading large JSON (`public/data/`)

Static JSON larger than ~100 KB should not be `import`ed into application code (CRA bundles it into `main.*.js`). Use `loadJsonFromPublic` from `src/lazyJsonData.js` instead.

## Pattern

1. Place the file at `public/data/<name>.json` (served as `/data/<name>.json`).
2. Load on demand:

```javascript
import { loadJsonFromPublic } from "./lazyJsonData";

const raw = await loadJsonFromPublic("approvedDrugs.json");
```

3. Cache parsed results in the feature module (see `src/approvedDrugs.js`).

## Current datasets

| File | Loader |
|------|--------|
| `approvedDrugs.json` | `ensureApprovedDrugsLoaded()` in `src/approvedDrugs.js` |

## PR #36 — `targetReferenceFingerprints.json`

When merging the benchmark rebuild branch, keep `targetReferenceFingerprints.json` under `public/data/` (not `src/data/`) and load it with the same helper:

```javascript
import { loadJsonFromPublic } from "./lazyJsonData";

let fingerprintCache = null;

export async function loadTargetReferenceFingerprints() {
  if (fingerprintCache) return fingerprintCache;
  const raw = await loadJsonFromPublic("targetReferenceFingerprints.json");
  fingerprintCache = raw;
  return fingerprintCache;
}
```

Wire the docking/benchmark code to call `loadTargetReferenceFingerprints()` before first use (same lifecycle as `ensureApprovedDrugsLoaded()` on repurposing screens).

## Regenerating `approvedDrugs.json`

Scripts write to `public/data/approvedDrugs.json`:

- `node scripts/writeApprovedDrugs.js`
- `node scripts/fetchChEMBLDrugs.js`
