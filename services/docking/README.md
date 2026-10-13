# TargetForge production docking service

Containerized **AutoDock Vina 1.2.x** docking with **RDKit**, **Meeko** ligand preparation, **Open Babel** receptor conversion, and receptor protonation at **pH 7.4** via `reduce`. Search boxes are derived from the **co-crystal ligand** in the PDB entry.

Engine parameters live in a single versioned file shared with the benchmark pipeline:

`benchmark/docking/engine.config.json`

When the parallel `benchmark/docking/` validation branch lands, drop its validated config over that file — no service code changes required beyond redeploying the image.

## Why Fly.io

| Option | Fit for Vina |
|--------|----------------|
| **Fly.io (chosen)** | Long-running CPU jobs, native Docker, persistent volume for cache, simple `fly deploy`, no hard 60s ceiling like serverless |
| Vercel Functions | Cannot run Vina binaries; suitable only as a proxy |
| Render | Viable; free tier sleeps and cold-starts hurt queue latency |
| Cloud Run | Viable with min instances; more IAM/build steps for a small team |
| Railway | Viable; Fly’s volume + Dockerfile workflow is slightly simpler for stateful job cache |

The site stays on Vercel; this service runs on Fly and is reached through `/api/docking/*` proxy routes.

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness + engine config version |
| `POST` | `/v1/jobs` | Submit `{ "pdbId": "1IEP", "smiles": "..." }` |
| `GET` | `/v1/jobs/{id}` | Poll status / progress |
| `GET` | `/v1/jobs/{id}/results` | Poses + scores (409 until complete) |

Optional header: `X-API-Key: <DOCKING_API_KEY>` when the service secret is set.

## Local development

From repository root:

```bash
docker build -f services/docking/Dockerfile -t targetforge-docking .
docker run --rm -p 8080:8080 \
  -e DOCKING_SKIP_VINA=1 \
  -v "$(pwd)/benchmark/docking/engine.config.json:/app/benchmark/docking/engine.config.json:ro" \
  targetforge-docking
```

`DOCKING_SKIP_VINA=1` returns deterministic stub poses (used in unit/smoke tests). Omit it to run real Vina inside the container.

Python tests (stub mode):

```bash
pip install fastapi uvicorn httpx pytest
DOCKING_SKIP_VINA=1 pytest services/docking/tests -q
```

## Deploy to Fly.io (manual — not run by CI)

Prerequisites: [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/), billing account, `fly auth login`.

```bash
# 1. Create app (once)
fly apps create targetforge-docking

# 2. Create persistent volume for job/cache data (once, in primary region)
fly volumes create docking_data --region bom --size 10

# 3. Set secrets
fly secrets set \
  DOCKING_API_KEY="$(openssl rand -hex 32)" \
  --app targetforge-docking

# 4. Deploy from repo root
fly deploy --config services/docking/fly.toml

# 5. Verify
fly curl -s https://targetforge-docking.fly.dev/health
```

Copy the public HTTPS URL into Vercel as `DOCKING_SERVICE_URL` (no trailing slash).

## Environment variables

| Variable | Where | Purpose |
|----------|--------|---------|
| `DOCKING_SERVICE_URL` | Vercel | Base URL for proxy (e.g. `https://targetforge-docking.fly.dev`) |
| `DOCKING_SERVICE_API_KEY` | Vercel | Sent as `X-API-Key` to the Fly service (must match `DOCKING_API_KEY` on Fly) |
| `DOCKING_API_KEY` | Fly | Service-side auth |
| `ENGINE_CONFIG_PATH` | Fly | Defaults to `/app/benchmark/docking/engine.config.json` |
| `DOCKING_WORK_DIR` | Fly | Job scratch space (default `/data/jobs` with volume mount) |
| `DOCKING_CACHE_DIR` | Fly | Result cache (default `/data/cache`) |
| `DOCKING_SKIP_VINA` | Local/test | `1` skips Vina for smoke tests |

## Vercel wiring

1. Set `DOCKING_SERVICE_URL` and `DOCKING_SERVICE_API_KEY` in the Vercel project.
2. Deploy the site; the frontend uses `/api/docking/jobs` (proxied).
3. Keep `DOCKING_ENABLED` in `src/featureFlags.js` **false** until benchmark sign-off.
