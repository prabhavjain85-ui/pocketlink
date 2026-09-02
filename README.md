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

Station 3 scores 2–5 staged molecules **for the selected PDB structure**, not as a universal drug-likeness league table.

- **Target-aware:** the selected protein name, PDB ID, Target Selection Score, resolution, method, co-crystallized ligand (MW and inferred functional groups), and pocket size/hydrophobicity already computed in Station 1 are passed into the prompt. PocketLink does not re-fetch RCSB for this step.
- **Weighted score (0–100) per (compound, target) pair:** target/pocket fit including known pharmacology, Lipinski/Veber drug-likeness, and a PAINS/toxicophore penalty (deduct, never hard-zero). The same compound is expected to score differently against different targets (e.g. imatinib high vs a tyrosine kinase, lower vs a GPCR).
- **Always on:** a local target-aware model runs with no API key.
- **Optional LLM:** if `OPENAI_API_KEY` is set, `/api/rank-candidates` asks OpenAI (`gpt-4o-mini` by default) for structured JSON. Invalid or failed LLM output falls back to the local model.
- **Cache:** scores are stored as `${pdb_id}_${compound_cid}` in memory and `sessionStorage`. A score computed against one structure is never reused for another.
- Binding affinity, toxicity, and clinical efficacy are **not** inferred. If pocket/ligand data are missing, the UI reasoning states that target-fit assessment is limited. Docking and ADME still have to be run.

### Optional Vercel environment variables

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Enables language-model ranking |
| `OPENAI_MODEL` | Override model (default `gpt-4o-mini`) |

Without the key, ranking still runs and is labeled as PocketLink's drug-likeness model.

## Drug repurposing screen

`/repurposing` is a dedicated page (not a toggle on the staging bench). Search a PDB target with the same Target Selection Score step, and PocketLink scores it against a bundled library of already-approved small-molecule drugs.

- **Library:** `src/data/approvedDrugs.json` — ~300 curated marketed drugs (name, SMILES, PubChem CID, original indication, and PubChem-style physicochemical properties). It is a representative set across kinase inhibitors, beta-blockers, analgesics, antihistamines, statins, and other classes, not a complete pharmacopeia. It is shipped in the repo and is not fetched from an external API at request time.
- **Batch scoring:** the same target-aware model used for the 5-compound shortlist (`scoreOne` / `/api/rank-candidates`) runs across the library. Compounds are **not** stuffed into one prompt. A cheap Lipinski/MW pre-filter drops missing SMILES, MW &gt; 900 g/mol, and ≥5 Rule-of-Five/Veber failures; the rest are scored in chunks of 25. If a language-model batch is unavailable, remaining chunks use the local target-aware model.
- **Cache:** per-drug scores still use `${pdb_id}_${cid}` (same store as Station 3). A full screen of the same PDB ID is reused for 24 hours so repeat searches do not burn AI credits.
- **Timeouts:** Vercel caps `/api/rank-candidates` at 30s. Scoring hundreds of drugs in a **single** serverless invocation would miss that window (especially with OpenAI). The page therefore drives batches from the browser. A background job/queue (Inngest, Vercel Workflows, or a worker + KV) is the fit if this screen must run entirely on the server.

## Target discovery

`/target-discovery` is a dedicated page for finding **genetically validated but underexplored** protein targets — not a dump of every gene associated with a disease.

- **Data:** live queries to the [Open Targets Platform GraphQL API](https://api.platform.opentargets.org/api/v4/graphql). Free-text disease search (`search`, `entityNames: ["disease"]`) resolves to an EFO/MONDO ID; `disease.associatedTargets` returns association scores plus a per-datatype breakdown (`genetic_association`, `somatic_mutation`, `literature`, `affected_pathway`, etc.).
- **Known-drug count:** Open Targets removed `knownDrugs`. PocketLink uses `target.drugAndClinicalCandidates.count` (approved and investigational molecules that list the gene as a target).
- **Novelty score:** biology signal (genetic association weighted most heavily) × `1 / (1 + drug count)`. Targets with many existing drugs score low even when overall association is high. Rows with essentially no genetic/somatic/pathway evidence are dropped so novelty is not a random-gene list.
- **Cache:** disease ID → result payload in memory and `localStorage` for 24 hours.
- **Handoff:** “Find PDB structures for this target” opens the staging bench with the gene pre-filled. If RCSB has no experimental structure, the bench shows a clear AlphaFold-future-support message instead of failing silently.

## Contact page

`/contact` is a static page with address, phone, email, and a message form. `POST /api/contact` validates the fields and delivers the note.

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Send mail with [Resend](https://resend.com) (free tier; recommended in production) |
| `CONTACT_TO_EMAIL` | Destination address (default `prabhavjain85@gmail.com`) |
| `CONTACT_FROM_EMAIL` | Resend From header (must be a verified domain/sender) |
| `FORMSPREE_ID` | Alternative: a Formspree form id, used when no Resend key is set |
| `CONTACT_DRY_RUN` | Accept the payload without sending (`1`). Set automatically for local `npm start`. |

With none of those mail keys set, the API falls back to [FormSubmit](https://formsubmit.co) (free, no extra infrastructure). The first FormSubmit delivery sends a one-time confirmation email to the destination address.

## Live data sources

- RCSB PDB search + entry metadata
- Open Targets Platform GraphQL API for `/target-discovery` (disease search, association scores, known-drug counts)
- PubChem PUG-REST compound properties
- Bundled approved-drug library (`src/data/approvedDrugs.json`) for `/repurposing`
- SwissDock and SwissADME are opened in a new tab with the PDB ID / SMILES copied for paste
