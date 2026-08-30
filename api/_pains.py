"""Deterministic PAINS + toxicophore substructure checks (RDKit).

Uses RDKit's built-in FilterCatalog PAINS_A/B/C catalogs plus a small
curated SMARTS list for reactive groups PAINS does not cover well.
"""

from __future__ import annotations

import re
from functools import lru_cache

from rdkit import Chem, RDLogger
from rdkit.Chem import rdBase
from rdkit.Chem.FilterCatalog import FilterCatalog, FilterCatalogParams

RDLogger.DisableLog("rdApp.error")
RDLogger.DisableLog("rdApp.warning")

GENERIC_PAINS_WHY = (
    "This PAINS substructure is linked to frequent false positives in high-throughput "
    "screens, typically via nonspecific reactivity, redox cycling, or assay interference."
)

# Stem (RDKit description with _A(370)-style suffix stripped) → display name.
PAINS_NAMES = {
    "quinone": "Quinone",
    "hydroquin": "Hydroquinone",
    "catechol": "Catechol",
    "ene_rhod": "Rhodanine",
    "rhod_sat": "Rhodanine",
    "rhod_sat_imine": "Rhodanine imine",
    "azo": "Azo compound",
    "anil_di_alk": "Dialkylaniline",
    "anil_di_alk_ene": "Dialkylaniline alkene",
    "anil_di_alk_furan": "Furyl dialkylaniline",
    "anil_di_alk_indol": "Indolyl dialkylaniline",
    "anil_di_alk_dhp": "Dihydropyridine dialkylaniline",
    "anil_di_alk_coum": "Coumarin dialkylaniline",
    "anil_alk": "Alkylaniline",
    "anil_alk_ene": "Alkylaniline alkene",
    "anil_alk_bim": "Alkylaniline",
    "anil_alk_thio": "Thio alkylaniline",
    "anil_alk_indane": "Indane alkylaniline",
    "anil_no_alk": "Aniline",
    "anil_no_alk_indol": "Indolyl aniline",
    "anil_OC_alk": "Alkoxyaniline",
    "anil_OC_no_alk": "Alkoxyaniline",
    "anil_NH_alk": "Aminoaniline",
    "anil_NH_no_alk": "Aminoaniline",
    "anil_OH_alk": "Hydroxyaniline",
    "anil_OH_no_alk": "Hydroxyaniline",
    "hzone_phenol": "Phenolic hydrazone",
    "hzone_furan": "Furan hydrazone",
    "hzone_thiophene": "Thiophene hydrazone",
    "hzone_pyrrol": "Pyrrole hydrazone",
    "hzone_anil": "Aniline hydrazone",
    "hzone_anil_di_alk": "Dialkylaniline hydrazone",
    "hzone_acid": "Acyl hydrazone",
    "hzone_phenone": "Phenone hydrazone",
    "hzone_naphth": "Naphthyl hydrazone",
    "hzone_enamin": "Enamine hydrazone",
    "hzone_pipzn": "Piperazine hydrazone",
    "hzone_acyl_misc": "Acyl hydrazone",
    "hzone_acyl_naphthol": "Naphthol hydrazone",
    "hzone_anthran": "Anthranilate hydrazone",
    "mannich": "Mannich base",
    "mannich_catechol": "Catechol Mannich base",
    "imine_one": "Imine",
    "imine_one_isatin": "Isatin",
    "imine_one_fives": "Cyclic imine",
    "imine_one_sixes": "Cyclic imine",
    "imine_imine": "Diimine",
    "imine_ene": "Ene-imine",
    "imine_ene_one": "Enone imine",
    "imine_phenol": "Phenolic imine",
    "imine_naphthol": "Naphthol imine",
    "ene_six_het": "Heterocyclic alkene",
    "ene_five_het": "Five-membered heterocyclic alkene",
    "ene_five_one": "Cyclopentenone",
    "ene_one": "Enone",
    "ene_one_ene": "Dienone",
    "ene_one_one": "Dienone",
    "ene_one_amide": "Enone amide",
    "ene_one_ester": "Enone ester",
    "ene_one_hal": "Halo-enone",
    "ene_one_yne": "Enynone",
    "ene_misc": "Activated alkene",
    "ene_quin_methide": "Quinone methide",
    "ene_cyano": "Cyanoalkene",
    "thio_urea": "Thiourea",
    "thio_amide": "Thioamide",
    "thio_ester": "Thioester",
    "thio_ketone": "Thioketone",
    "thio_carbonate": "Thiocarbonate",
    "thio_aldehyd": "Thioaldehyde",
    "thio_imide": "Thioimide",
    "thio_carbam": "Thiocarbamate",
    "pyrrole": "Pyrrole",
    "thiazole_amine": "Aminothiazole",
    "thiaz_ene": "Thiazole alkene",
    "sulfonamide": "Sulfonamide",
    "coumarin": "Coumarin",
    "anthranil_acid": "Anthranilic acid",
    "anthranil_one": "Anthranilone",
    "anthranil_amide": "Anthranilamide",
    "keto_keto_beta": "β-Diketone",
    "keto_keto_gamma": "γ-Diketone",
    "keto_phenone": "Phenone",
    "cyano_pyridone": "Cyanopyridone",
    "cyano_imine": "Cyanoimine",
    "cyano_ene_amine": "Cyanoenamine",
    "cyano_cyano": "Dinitrile",
    "thiophene": "Thiophene",
    "thiophene_amino": "Aminothiophene",
    "thiophene_hydroxy": "Hydroxythiophene",
    "indol_3yl_alk": "3-Alkylindole",
    "indole_3yl_alk": "3-Alkylindole",
    "naphth_amino": "Aminonaphthalene",
    "styrene": "Styrene",
    "styrene_anil": "Styryl aniline",
    "melamine": "Melamine",
    "colchicine": "Colchicine-like tropone",
    "imidazole": "Imidazole",
    "furan": "Furan",
    "tetrazole": "Tetrazole",
    "steroid": "Steroid scaffold",
    "phthalimide_misc": "Phthalimide",
    "cyanamide": "Cyanamide",
    "dhp_amino_CN": "Aminocyanodihydropyridine",
    "het_65": "Fused heterocycle",
    "het_66": "Fused heterocycle",
    "het_5": "Five-membered heterocycle",
    "het_thio_65": "Sulfur heterocycle",
    "het_thio_5": "Sulfur heterocycle",
}

# Family-level explanations keyed by display-name slug or stem keywords.
PAINS_WHY = {
    "quinone": "Quinones are frequent false positives in high-throughput screens due to redox cycling and nonspecific reactivity.",
    "hydroquinone": "Hydroquinones oxidize to quinones and can redox-cycle, a common source of pan-assay interference.",
    "catechol": "Catechols can oxidize to reactive quinones and interfere across many assay formats.",
    "rhodanine": "Rhodanines are frequent false positives in high-throughput screens due to nonspecific reactivity.",
    "azo": "Azo dyes can interfere photometrically and via redox chemistry in biochemical screens.",
    "aniline": "Electron-rich anilines are associated with promiscuous assay activity and metabolic liabilities.",
    "hydrazone": "Hydrazones can hydrolyze or chelate metals and are a recurring PAINS class.",
    "mannich": "Mannich bases can release reactive methylene species and are frequent HTS false positives.",
    "imine": "Imines can hydrolyze or covalently engage protein amines, producing nonspecific assay readouts.",
    "isatin": "Isatins are a well-known PAINS chemotype associated with promiscuous binding and assay interference.",
    "enone": "Enones behave as Michael acceptors and can covalently modify nucleophilic residues.",
    "thiourea": "Thioureas can chelate metals and interfere in a wide range of biochemical assays.",
    "thioamide": "Thioamides are reactive and metal-binding groups often flagged as screening liabilities.",
    "pyrrole": "Certain pyrroles are associated with promiscuous screening activity and photometric interference.",
    "aminothiazole": "Aminothiazoles are a frequent PAINS class linked to nonspecific protein binding.",
    "coumarin": "Coumarins can fluoresce and quench, producing optical interference in many HTS formats.",
    "diketone": "β-Diketones chelate metals and can generate false positives in metal-dependent assays.",
    "thiophene": "Substituted thiophenes appear in several PAINS families associated with promiscuous reactivity.",
}

TOXICOPHORES = [
    {
        "id": "michael_acceptor",
        "name": "Michael acceptor",
        "smarts": "[C;H1,H2]=[C;H1][C,S,N]=O",
        "explanation": (
            "α,β-unsaturated carbonyls can covalently modify nucleophilic residues "
            "and produce nonspecific assay activity."
        ),
    },
    {
        "id": "aldehyde",
        "name": "Aldehyde",
        "smarts": "[CX3H1](=O)[#6]",
        "explanation": (
            "Aldehydes form Schiff bases with protein amines and are a common source "
            "of assay interference and metabolic liability."
        ),
    },
    {
        "id": "epoxide",
        "name": "Epoxide",
        "smarts": "C1OC1",
        "explanation": (
            "Epoxides are electrophilic and can covalently bind proteins — a frequent "
            "toxicology and false-positive flag."
        ),
    },
    {
        "id": "alkyl_halide",
        "name": "Alkyl halide",
        "smarts": "[CX4;!$(C~[a])][Cl,Br,I]",
        "explanation": (
            "Reactive alkyl chlorides, bromides, and iodides can alkylate nucleophilic "
            "residues and are treated as structural liabilities."
        ),
    },
]


def engine_info():
    return {"engine": "rdkit", "rdkitVersion": rdBase.rdkitVersion}


def pains_stem(description: str) -> str:
    raw = str(description or "").strip()
    stem = re.sub(r"(_[A-Za-z])?\(\d+\)$", "", raw)
    return stem or raw or "unknown"


def _title_from_stem(stem: str) -> str:
    if stem in PAINS_NAMES:
        return PAINS_NAMES[stem]
    return re.sub(r"[_-]+", " ", stem).strip().title() or "PAINS match"


def _why_for_pains(stem: str, name: str) -> str:
    blob = f"{stem} {name}".lower()
    for key, text in PAINS_WHY.items():
        if key in blob:
            return text
    return GENERIC_PAINS_WHY


@lru_cache(maxsize=1)
def _pains_catalog() -> FilterCatalog:
    params = FilterCatalogParams()
    params.AddCatalog(FilterCatalogParams.FilterCatalogs.PAINS_A)
    params.AddCatalog(FilterCatalogParams.FilterCatalogs.PAINS_B)
    params.AddCatalog(FilterCatalogParams.FilterCatalogs.PAINS_C)
    return FilterCatalog(params)


@lru_cache(maxsize=1)
def _toxicophore_patterns():
    compiled = []
    for row in TOXICOPHORES:
        qmol = Chem.MolFromSmarts(row["smarts"])
        if qmol is None:
            continue
        compiled.append({**row, "qmol": qmol})
    return compiled


def _unique_alerts(alerts):
    seen = set()
    out = []
    for alert in alerts:
        key = (alert.get("family"), alert.get("name"))
        if key in seen:
            continue
        seen.add(key)
        out.append(alert)
    return out


def check_smiles(smiles, cid=""):
    """Return a single-compound check result."""
    raw = "" if smiles is None else str(smiles).strip()
    result = {
        "cid": "" if cid is None else str(cid).strip(),
        "smiles": raw,
        "status": "unable",
        "hasAlerts": False,
        "checked": False,
        "alerts": [],
        "reason": None,
    }
    if not raw:
        result["reason"] = "Missing SMILES"
        return result

    mol = Chem.MolFromSmiles(raw)
    if mol is None:
        result["reason"] = "Invalid SMILES"
        return result

    alerts = []
    catalog = _pains_catalog()
    for entry in catalog.GetMatches(mol):
        description = entry.GetDescription() if hasattr(entry, "GetDescription") else ""
        stem = pains_stem(description)
        name = _title_from_stem(stem)
        catalog_name = ""
        if hasattr(entry, "GetProp"):
            try:
                catalog_name = entry.GetProp("FilterSet") or ""
            except Exception:
                catalog_name = ""
        alerts.append(
            {
                "family": "pains",
                "catalog": catalog_name or "PAINS",
                "id": stem,
                "name": name,
                "pattern": description,
                "explanation": _why_for_pains(stem, name),
            }
        )

    for row in _toxicophore_patterns():
        if mol.HasSubstructMatch(row["qmol"]):
            alerts.append(
                {
                    "family": "toxicophore",
                    "catalog": "toxicophore",
                    "id": row["id"],
                    "name": row["name"],
                    "pattern": row["smarts"],
                    "explanation": row["explanation"],
                }
            )

    alerts = _unique_alerts(alerts)
    result["checked"] = True
    result["alerts"] = alerts
    result["hasAlerts"] = bool(alerts)
    result["status"] = "alert" if alerts else "clean"
    result["reason"] = None
    return result


@lru_cache(maxsize=256)
def _check_smiles_cached(smiles: str, cid: str):
    return check_smiles(smiles, cid)


def check_compounds(compounds):
    """Check up to five {cid, smiles} dicts. Results are cached by SMILES."""
    rows = list(compounds or [])[:5]
    results = []
    for item in rows:
        if not isinstance(item, dict):
            results.append(check_smiles("", ""))
            continue
        cid = item.get("cid") or item.get("CID") or ""
        smiles = item.get("smiles") or item.get("SMILES") or item.get("IsomericSMILES") or ""
        smiles = str(smiles).strip()
        cid = str(cid).strip()
        if not smiles:
            results.append(check_smiles("", cid))
            continue
        results.append(_check_smiles_cached(smiles, cid))
    return results
