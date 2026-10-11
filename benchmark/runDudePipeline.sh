#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
python3 verifyDudePairing.py
python3 buildDudeBenchmark.py
python3 evaluateDudeRf.py
node evaluateDudeSplits.mjs
