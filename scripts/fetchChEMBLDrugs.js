/**
 * Data pipeline to fetch approved drugs (max_phase=4) from ChEMBL REST API,
 * deduplicate against the existing curated library, filter salt variants and
 * invalid structures, and generate the expanded approvedDrugs.json dataset.
 */

const fs = require("fs");
const path = require("path");

const BASE_URL = "https://www.ebi.ac.uk/chembl/api/data";
const OUTPUT_FILE = path.join(__dirname, "../public/data/approvedDrugs.json");

function toTitleCase(str) {
  if (!str) return "";
  // If already mixed case, preserve it (e.g. "Abemaciclib", "COX-2")
  if (/[a-z]/.test(str) && /[A-Z]/.test(str)) return str.trim();
  return str
    .toLowerCase()
    .split(/([ -/()])/g)
    .map((seg) => (seg.length > 0 ? seg.charAt(0).toUpperCase() + seg.slice(1) : seg))
    .join("")
    .trim();
}

function normalizeDrugName(name) {
  return String(name || "")
    .toUpperCase()
    .replace(/\b(HYDROCHLORIDE|MESYLATE|SODIUM|POTASSIUM|TARTRATE|MALEATE|SULFATE|ACETATE|BROMIDE|CITRATE|FUMARATE|PHOSPHATE|BESYLATE|SUCCINATE|CALCIUM|HYDROBROMIDE|DIHYDROCHLORIDE|TRIHYDRATE|HYDRATE|MONOHYDRATE|CHLORIDE)\b/g, "")
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

function isValidSmiles(smiles) {
  if (!smiles || typeof smiles !== "string") return false;
  const s = smiles.trim();
  if (s.length < 2) return false;
  // Small organic molecules must contain carbon
  if (!/[Cc]/.test(s)) return false;
  // Balanced parentheses & brackets
  let parens = 0;
  let brackets = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") parens++;
    else if (ch === ")") parens--;
    else if (ch === "[") brackets++;
    else if (ch === "]") brackets--;
    if (parens < 0 || brackets < 0) return false;
  }
  return parens === 0 && brackets === 0;
}

async function fetchWithRetry(url, maxRetries = 4, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "TargetForge-DrugDiscovery/1.0" },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return await res.json();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      console.warn(`[chembl] Retry ${attempt}/${maxRetries} for ${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }
}

async function fetchAllPaged(endpoint, label, itemKey) {
  let url = `${BASE_URL}/${endpoint}`;
  const allItems = [];
  let page = 1;
  while (url) {
    console.log(`[chembl] Fetching ${label} page ${page}...`);
    const data = await fetchWithRetry(url);
    const items = data[itemKey] || [];
    allItems.push(...items);
    if (data.page_meta?.next) {
      // The API next field can be a relative or absolute URL
      url = data.page_meta.next.startsWith("http")
        ? data.page_meta.next
        : `https://www.ebi.ac.uk${data.page_meta.next}`;
      page++;
    } else {
      url = null;
    }
  }
  console.log(`[chembl] Finished ${label}: fetched ${allItems.length} records in ${page} pages.`);
  return allItems;
}

function inferClass(mol, mechanisms = []) {
  const stem = String(mol.usan_stem || "").toLowerCase();
  const stemDef = String(mol.usan_stem_definition || "").toLowerCase();
  const mecs = mechanisms.map((m) => String(m.mechanism_of_action || "").toLowerCase()).join(" ");

  // Kinase inhibitor
  if (stem === "-tinib" || /kinase inhibitor|tyrosine-protein kinase|serine\/threonine-protein kinase|egfr|bcr-abl|alk inhibitor|btk inhibitor/i.test(mecs)) {
    return "kinase inhibitor";
  }
  // Protease inhibitor
  if (stem === "-navir" || /protease inhibitor|peptidase inhibitor|hiv-1 protease/i.test(mecs)) {
    return "protease inhibitor";
  }
  // Beta-blocker
  if (stem === "-olol" || /beta-adrenergic receptor blocker|beta-1 adrenergic receptor antagonist|beta-2 adrenergic receptor antagonist/i.test(mecs)) {
    return "beta-blocker";
  }
  // Statin
  if (stem === "-statin" || /hmg-coa reductase inhibitor/i.test(mecs)) {
    return "statin";
  }
  // NSAID / COX inhibitor
  if (stem === "-coxib" || /cyclooxygenase inhibitor|cox-1 inhibitor|cox-2 inhibitor/i.test(mecs)) {
    return "NSAID";
  }
  // ACE inhibitor
  if (stem === "-pril" || /angiotensin-converting enzyme inhibitor/i.test(mecs)) {
    return "ACE inhibitor";
  }
  // ARB (Angiotensin Receptor Blocker)
  if (stem === "-sartan" || /angiotensin ii type 1 receptor antagonist|angiotensin receptor antagonist/i.test(mecs)) {
    return "ARB";
  }
  // Calcium channel blocker
  if (stem === "-dipine" || /voltage-gated calcium channel blocker|calcium channel blocker/i.test(mecs)) {
    return "calcium channel blocker";
  }
  // PPI
  if (stem === "-prazole" || /potassium-transporting atpase inhibitor|proton pump inhibitor/i.test(mecs)) {
    return "PPI";
  }
  // Antihistamine
  if (stem === "-tadine" || stem === "-astine" || /histamine h1 receptor antagonist/i.test(mecs)) {
    return "antihistamine";
  }
  // Opioid analgesic / antagonist
  if (/mu-type opioid receptor agonist/i.test(mecs)) {
    return "opioid analgesic";
  }
  if (/mu-type opioid receptor antagonist/i.test(mecs)) {
    return "opioid antagonist";
  }
  // Benzodiazepine / GABA
  if (stem === "-azepam" || stem === "-azolam" || /gaba-a receptor positive allosteric modulator/i.test(mecs)) {
    return "benzodiazepine";
  }
  // SERM / nuclear receptor
  if (/estrogen receptor antagonist|selective estrogen receptor modulator|aromatase inhibitor/i.test(mecs)) {
    return "SERM";
  }
  // SGLT2 inhibitor
  if (stem === "-gliflozin" || /sodium\/glucose cotransporter 2 inhibitor/i.test(mecs)) {
    return "SGLT2 inhibitor";
  }
  // DPP-4 inhibitor
  if (stem === "-gliptin" || /dipeptidyl peptidase 4 inhibitor/i.test(mecs)) {
    return "DPP-4 inhibitor";
  }

  // Fallback to mechanism summary or USAN stem definition if concise
  if (stemDef && stemDef.length < 40) {
    return stemDef;
  }
  if (mechanisms[0]?.action_type) {
    const act = mechanisms[0].action_type.toLowerCase();
    return `${act} agent`;
  }
  return "";
}

async function runPipeline() {
  console.log("=== TargetForge ChEMBL Approved Drug Pipeline ===");
  const startTime = Date.now();

  // 1. Load existing curated dataset to ensure 100% backward compatibility
  let existingDrugs = [];
  try {
    if (fs.existsSync(OUTPUT_FILE)) {
      const raw = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8"));
      existingDrugs = Array.isArray(raw?.drugs) ? raw.drugs : [];
    }
  } catch (err) {
    console.warn("Could not load existing approvedDrugs.json:", err.message);
  }
  console.log(`Loaded ${existingDrugs.length} existing curated drugs from ${OUTPUT_FILE}`);

  // Index existing drugs by normalized name and smiles
  const existingByName = new Map();
  const existingBySmiles = new Map();
  const existingByCid = new Map();
  for (const drug of existingDrugs) {
    if (drug.name) existingByName.set(normalizeDrugName(drug.name), drug);
    if (drug.smiles) existingBySmiles.set(drug.smiles.trim(), drug);
    if (drug.cid) existingByCid.set(String(drug.cid), drug);
  }

  // 2. Fetch data in parallel or sequence
  console.log("\n--- Step 1: Fetching approved molecules from ChEMBL ---");
  const molecules = await fetchAllPaged("molecule.json?max_phase=4&limit=1000", "molecules", "molecules");

  console.log("\n--- Step 2: Fetching approved mechanisms ---");
  const rawMechanisms = await fetchAllPaged("mechanism.json?max_phase=4&limit=1000", "mechanisms", "mechanisms");
  const mechanismsByChemblId = new Map();
  for (const m of rawMechanisms) {
    const id = m.molecule_chembl_id;
    if (!id) continue;
    if (!mechanismsByChemblId.has(id)) mechanismsByChemblId.set(id, []);
    mechanismsByChemblId.get(id).push(m);
  }

  console.log("\n--- Step 3: Fetching approved indications ---");
  const rawIndications = await fetchAllPaged("drug_indication.json?max_phase_for_ind=4&limit=1000", "indications", "drug_indications");
  const indicationsByChemblId = new Map();
  for (const ind of rawIndications) {
    const id = ind.molecule_chembl_id || ind.parent_molecule_chembl_id;
    if (!id) continue;
    const term = ind.mesh_heading || ind.efo_term;
    if (!term) continue;
    if (!indicationsByChemblId.has(id)) indicationsByChemblId.set(id, new Set());
    indicationsByChemblId.get(id).add(term);
  }

  console.log("\n--- Step 4: Filtering, Quality Control & Deduplication ---");
  let skippedNoSmiles = 0;
  let skippedInvalidSmiles = 0;
  let skippedNonSmallMol = 0;
  let skippedExtremeMw = 0;
  let skippedSaltOrDuplicate = 0;
  let mergedCurated = 0;

  // Track unique compound clusters by InChIKey skeleton (first 14 chars) or normalized name
  const candidatesByCluster = new Map();

  for (const mol of molecules) {
    const chemblId = mol.molecule_chembl_id;
    const smiles = mol.molecule_structures?.canonical_smiles;
    const inchiKey = mol.molecule_structures?.standard_inchi_key;

    // Check SMILES
    if (!smiles) {
      skippedNoSmiles++;
      continue;
    }
    if (!isValidSmiles(smiles)) {
      skippedInvalidSmiles++;
      continue;
    }

    // Check small-molecule and polymer flags
    if (mol.molecule_type && mol.molecule_type !== "Small molecule") {
      skippedNonSmallMol++;
      continue;
    }
    if (mol.inorganic_flag === 1 || mol.polymer_flag) {
      skippedNonSmallMol++;
      continue;
    }

    const props = mol.molecule_properties || {};
    const mw = parseFloat(props.full_mwt || props.mw_freebase);
    if (!isNaN(mw) && (mw < 60 || mw > 1200)) {
      skippedExtremeMw++;
      continue;
    }

    // Derive cluster key: InChIKey skeleton (first 14 chars) or normalized name
    const inchiSkeleton = inchiKey ? inchiKey.slice(0, 14) : null;
    const normName = normalizeDrugName(mol.pref_name);
    const clusterKey = inchiSkeleton || normName || chemblId;

    // Determine if this molecule is a salt form (e.g. SMILES has "." counter-ion or parent_chembl_id != chembl_id)
    const isMultiPartSmiles = smiles.includes(".");
    const isSaltByHierarchy = mol.molecule_hierarchy?.parent_chembl_id && mol.molecule_hierarchy.parent_chembl_id !== chemblId;
    const isSalt = isMultiPartSmiles || Boolean(isSaltByHierarchy);

    // Existing match check
    const existingMatch = existingBySmiles.get(smiles) || existingByName.get(normName);

    const entry = {
      mol,
      chemblId,
      smiles,
      inchiKey,
      clusterKey,
      isSalt,
      existingMatch,
      mw,
      props,
    };

    if (candidatesByCluster.has(clusterKey)) {
      const existingCandidate = candidatesByCluster.get(clusterKey);
      // Prefer existing curated drug over non-curated
      if (!existingCandidate.existingMatch && entry.existingMatch) {
        candidatesByCluster.set(clusterKey, entry);
        skippedSaltOrDuplicate++;
      } else if (existingCandidate.isSalt && !entry.isSalt) {
        // Prefer non-salt (free base)
        candidatesByCluster.set(clusterKey, entry);
        skippedSaltOrDuplicate++;
      } else {
        skippedSaltOrDuplicate++;
      }
    } else {
      candidatesByCluster.set(clusterKey, entry);
    }
  }

  // 5. Construct final approved drug dataset
  const finalDrugs = [];
  const processedCids = new Set();

  for (const { mol, chemblId, smiles, existingMatch, props } of candidatesByCluster.values()) {
    const mecs = mechanismsByChemblId.get(chemblId) || [];
    const indSet = indicationsByChemblId.get(chemblId) || new Set();
    const indList = Array.from(indSet);

    let id, cid, name, indication, klass, mw, xlogp, hbd, hba, rot, tpsa;

    if (existingMatch) {
      mergedCurated++;
      id = String(existingMatch.id || existingMatch.cid);
      cid = String(existingMatch.cid);
      name = existingMatch.name;
      indication = existingMatch.indication;
      klass = existingMatch.class;
      mw = existingMatch.mw;
      xlogp = existingMatch.xlogp;
      hbd = existingMatch.hbd;
      hba = existingMatch.hba;
      rot = existingMatch.rot;
      tpsa = existingMatch.tpsa;
    } else {
      id = chemblId;
      cid = chemblId;
      name = toTitleCase(mol.pref_name || chemblId);
      indication = indList.length > 0 ? indList.slice(0, 3).join(", ") : "Approved small-molecule drug";
      klass = inferClass(mol, mecs);
      mw = props.full_mwt ? Math.round(parseFloat(props.full_mwt) * 10) / 10 : null;
      xlogp = props.alogp ? Math.round(parseFloat(props.alogp) * 10) / 10 : 0;
      hbd = props.hbd != null ? parseInt(props.hbd, 10) : 0;
      hba = props.hba != null ? parseInt(props.hba, 10) : 0;
      rot = props.rtb != null ? parseInt(props.rtb, 10) : 0;
      tpsa = props.psa ? Math.round(parseFloat(props.psa) * 10) / 10 : 0;
    }

    if (processedCids.has(cid)) continue;
    processedCids.add(cid);

    finalDrugs.push({
      id,
      name,
      cid,
      chemblId,
      smiles,
      indication,
      class: klass,
      mw,
      xlogp,
      hbd,
      hba,
      rot,
      tpsa,
    });
  }

  // Also include any existing curated drugs that weren't in ChEMBL or clustered
  for (const existing of existingDrugs) {
    const existingCid = String(existing.cid);
    if (!processedCids.has(existingCid)) {
      processedCids.add(existingCid);
      finalDrugs.push({
        id: String(existing.id || existing.cid),
        name: existing.name,
        cid: existingCid,
        chemblId: existing.chemblId || null,
        smiles: existing.smiles,
        indication: existing.indication,
        class: existing.class,
        mw: existing.mw,
        xlogp: existing.xlogp,
        hbd: existing.hbd,
        hba: existing.hba,
        rot: existing.rot,
        tpsa: existing.tpsa,
      });
      mergedCurated++;
    }
  }

  // Sort alphabetically by name
  finalDrugs.sort((a, b) => a.name.localeCompare(b.name));

  const outputData = {
    source: "ChEMBL v34 (max_phase=4) + Curated TargetForge Approved Library",
    count: finalDrugs.length,
    generatedAt: new Date().toISOString(),
    qualityNotes: {
      skippedNoSmiles,
      skippedInvalidSmiles,
      skippedNonSmallMol,
      skippedExtremeMw,
      skippedSaltOrDuplicate,
      mergedCurated,
      knownLimitation: "Near-duplicate salt forms deduplicated via InChIKey skeleton (first 14 chars) and ChEMBL hierarchy parent IDs. Complex stereoisomeric mixtures or multi-component prodrugs without parent mappings may have residual representation.",
    },
    drugs: finalDrugs,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2), "utf-8");

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n=== Pipeline Complete ===");
  console.log(`Total approved molecules queried from ChEMBL: ${molecules.length}`);
  console.log(`Skipped missing SMILES: ${skippedNoSmiles}`);
  console.log(`Skipped invalid SMILES: ${skippedInvalidSmiles}`);
  console.log(`Skipped non-small-molecules (biologics/inorganics): ${skippedNonSmallMol}`);
  console.log(`Skipped extreme MW (<60 or >1200): ${skippedExtremeMw}`);
  console.log(`Skipped salt forms / duplicate compound skeletons: ${skippedSaltOrDuplicate}`);
  console.log(`Preserved/merged from existing curated library: ${mergedCurated}`);
  console.log(`Final approved drug library size: ${finalDrugs.length} drugs`);
  console.log(`Written to: ${OUTPUT_FILE}`);
  console.log(`Total pipeline run time: ${elapsedSec}s`);
}

if (require.main === module) {
  runPipeline().catch((err) => {
    console.error("Pipeline failed:", err);
    process.exit(1);
  });
}

module.exports = { runPipeline };
