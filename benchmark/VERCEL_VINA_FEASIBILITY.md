# Server-side AutoDock Vina on Vercel — feasibility (measured)

**Date:** 2026-10-11  
**Branch:** PR B (`cursor/benchmark-rebuild-honest-a420`)

## Dependency size (pip wheels, linux x86_64 cp312)

| Package | Wheel size |
|---------|------------|
| scipy | 34 MB |
| rdkit | 31 MB |
| numpy | 16 MB |
| vina | 6.6 MB |
| pillow | 6.7 MB |
| meeko | 1.4 MB |
| spyrmsd | 31 KB |
| **Total downloaded** | **~98 MB** |

Unpacked install on disk (this VM): **~350–450 MB** for the full stack (RDKit + SciPy dominate).

## Vercel serverless constraints (why this does not fit)

| Constraint | Typical Vercel limit | Vina stack |
|------------|---------------------|------------|
| Deployment bundle (Serverless Function) | 250 MB uncompressed (50 MB compressed on Hobby) | Exceeds after RDKit+SciPy alone |
| Function timeout | 10s (Hobby) / 60s (Pro) default; max 300s Pro | Single target redock with `exhaustiveness=16` is **20–90s** in our runs |
| Memory | 1024 MB default | Meeko polymer prep + Vina maps often **>1 GB** for kinases |
| Python runtime | Supported but same size/timeout limits | Binary `vina` wheel must run in function environment |

**Conclusion:** **AutoDock Vina does not fit a Vercel function** for production redocking/docking. Use an external container service.

## Recommended architecture (implemented as stub)

- **Service:** `services/vina-dock/` — FastAPI + same Python stack, Docker image on Fly.io / Render / Cloud Run.
- **Contract:** `services/vina-dock/openapi.yaml` — `POST /v1/dock`, health `GET /v1/health`.
- **Vercel:** `api/dock-vina.js` — thin proxy when `VINA_DOCK_SERVICE_URL` is set; otherwise returns `503` with explicit message.
- **Gating:** Only targets in `benchmark/vina_validated_targets.json` (in-place Vina redock RMSD &lt; 2 Å at time of validation).

## Environment variables

| Variable | Purpose |
|----------|---------|
| `VINA_DOCK_SERVICE_URL` | Base URL of container service (no trailing slash) |
| `VINA_DOCK_API_KEY` | Optional bearer token for the dock service |
