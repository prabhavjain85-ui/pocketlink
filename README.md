# PocketLink

Drug discovery staging bench: search PDB targets, shortlist up to five PubChem compounds, rank the best computational follow-up, and hand off to SwissDock / SwissADME.

## Target selection score

Station 1 ranks matching PDB structures so you can pick the best one for docking.

- **Always on, no AI:** resolution, completeness, co-crystallized ligand (excluding crystallization additives), binding-pocket proximity (~5 Å), and experimental method are combined into a 100-point score.
- Metadata is batched from RCSB (`data.rcsb.org/graphql`, with REST fallback). Missing fields score as 0 and show as N/A.

## AI candidate ranking

Station 3 compares 2–5 staged molecules and recommends one to take forward.

- **Always on:** a local Lipinski / Veber drug-likeness model scores size, lipophilicity, H-bonding, flexibility, and polar surface area. It works with no API key.
- **Optional LLM:** if `OPENAI_API_KEY` is set in the Vercel project, `/api/rank-candidates` asks OpenAI (`gpt-4o-mini` by default) to write the comparison. Invalid or failed LLM output falls back to the local model.
- Binding affinity, toxicity, and clinical efficacy are **not** inferred. The UI states that docking and ADME still have to be run.

### Optional Vercel environment variables

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Enables language-model ranking |
| `OPENAI_MODEL` | Override model (default `gpt-4o-mini`) |

Without the key, ranking still runs and is labeled as PocketLink's drug-likeness model.

## Live data sources

- RCSB PDB search + entry metadata
- PubChem PUG-REST compound properties
- SwissDock and SwissADME are opened in a new tab with the PDB ID / SMILES copied for paste
