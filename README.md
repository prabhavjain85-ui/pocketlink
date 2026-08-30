# PocketLink

Drug discovery staging bench: search PDB targets, shortlist up to five PubChem compounds, rank the best computational follow-up, and hand off to SwissDock / SwissADME.

## Target selection score

Station 1 ranks matching PDB structures so you can pick the best one for docking.

- **Always on, no AI:** resolution, completeness, co-crystallized ligand (excluding crystallization additives), binding-pocket proximity (~5 Å), and experimental method are combined into a 100-point score.
- Metadata is batched from RCSB (`data.rcsb.org/graphql`, with REST fallback). Missing fields score as 0 and show as N/A.

## PAINS and toxicophore flags

Station 2 screens each shortlisted PubChem compound with a **rules-based** substructure check before (and alongside) AI ranking. This is not an LLM call.

- **PAINS:** RDKit `FilterCatalog` families `PAINS_A`, `PAINS_B`, and `PAINS_C` (Baell & Holloway).
- **Toxicophores:** a small extra SMARTS list for reactive groups PAINS does not cover well — Michael acceptors, aldehydes, epoxides, and alkyl halides.
- Each match returns a plain-language name (e.g. rhodanine, quinone) and a one-line liability explanation.
- Missing or invalid SMILES is marked **unable to check**, not treated as clean.
- Flags are warnings only. Flagged compounds stay on the shortlist and remain selectable.
- Results are cached per CID/SMILES in memory and `sessionStorage`.
- Alert details are passed into `/api/rank-candidates` so the recommendation can cite them (e.g. “deprioritized due to PAINS alert: rhodanine”).

The checker is a Python Vercel function at `POST /api/pains-check` (`rdkit` in `requirements.txt`). For local CRA development run `npm run pains-api` in a second terminal so `/api/pains-check` can be proxied.

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
