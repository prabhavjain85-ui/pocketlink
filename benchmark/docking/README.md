# Docking benchmark & engine config

`engine.config.json` is the **single versioned source of truth** for AutoDock Vina settings (pinned tool versions, fixed seed, pH 7.4 receptor prep, co-crystal box, allowed PDB IDs, and limits).

The parallel validation branch under `benchmark/docking/` should update this file in place when redocking benchmarks pass. The production service (`services/docking/`) and Vercel proxy read the same JSON at deploy time.
