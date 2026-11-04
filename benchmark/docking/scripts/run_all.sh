#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="${ROOT}/.venv/bin:${PATH}"
python "${ROOT}/scripts/run_redock_multiseed.py"
python "${ROOT}/scripts/run_25_drug_benchmark.py"
python "${ROOT}/scripts/run_enrichment.py"
python "${ROOT}/scripts/generate_results_md.py"
