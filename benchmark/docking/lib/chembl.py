"""ChEMBL REST helpers for experimental pKi / pIC50."""
from __future__ import annotations

import json
import math
import urllib.parse
import urllib.request


def _get_json(url: str) -> dict | list:
    with urllib.request.urlopen(url, timeout=90) as resp:
        return json.loads(resp.read().decode())


def chembl_id_for_target(gene_symbol: str) -> str | None:
    gene = gene_symbol.upper()
    queries = [
        {"target_synonym__iexact": gene, "limit": 10},
        {"pref_name__icontains": gene, "target_type": "SINGLE PROTEIN", "limit": 15},
    ]
    for params in queries:
        q = urllib.parse.urlencode(params)
        url = f"https://www.ebi.ac.uk/chembl/api/data/target.json?{q}"
        data = _get_json(url)
        targets = data.get("targets") or []
        for t in targets:
            pref = (t.get("pref_name") or "").upper()
            if gene in pref.split() or gene in pref:
                return t.get("target_chembl_id")
        if targets:
            return targets[0].get("target_chembl_id")
    return None


def activity_pchembl_for_molecule(chembl_molecule_id: str, target_chembl_id: str) -> list[float]:
    q = urllib.parse.urlencode(
        {
            "molecule_chembl_id": chembl_molecule_id,
            "target_chembl_id": target_chembl_id,
            "standard_type__in": "Ki,IC50,EC50",
            "standard_relation": "=",
            "pchembl_value__isnull": "false",
            "limit": 50,
        }
    )
    url = f"https://www.ebi.ac.uk/chembl/api/data/activity.json?{q}"
    data = _get_json(url)
    vals = []
    for act in data.get("activities") or []:
        v = act.get("pchembl_value")
        if v is not None:
            try:
                vals.append(float(v))
            except (TypeError, ValueError):
                pass
    return vals


def lookup_molecule_chembl_id(drug_name: str) -> str | None:
    q = urllib.parse.urlencode({"pref_name__iexact": drug_name, "limit": 3})
    url = f"https://www.ebi.ac.uk/chembl/api/data/molecule.json?{q}"
    data = _get_json(url)
    mols = data.get("molecules") or []
    if mols:
        return mols[0].get("molecule_chembl_id")
    q2 = urllib.parse.urlencode({"molecule_synonyms__molecule_synonym__iexact": drug_name, "limit": 3})
    url2 = f"https://www.ebi.ac.uk/chembl/api/data/molecule.json?{q2}"
    data2 = _get_json(url2)
    mols2 = data2.get("molecules") or []
    return mols2[0].get("molecule_chembl_id") if mols2 else None


def median_pchembl(values: list[float]) -> float | None:
    if not values:
        return None
    s = sorted(values)
    mid = len(s) // 2
    if len(s) % 2:
        return s[mid]
    return (s[mid - 1] + s[mid]) / 2.0


def spearman_rho(x: list[float], y: list[float]) -> float | None:
    if len(x) != len(y) or len(x) < 3:
        return None
    n = len(x)
    rx = _rank(x)
    ry = _rank(y)
    d2 = sum((rx[i] - ry[i]) ** 2 for i in range(n))
    return 1.0 - (6.0 * d2) / (n * (n * n - 1))


def _rank(vals: list[float]) -> list[float]:
    order = sorted(range(len(vals)), key=lambda i: vals[i])
    ranks = [0.0] * len(vals)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and vals[order[j + 1]] == vals[order[i]]:
            j += 1
        avg = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            ranks[order[k]] = avg
        i = j + 1
    return ranks


def bootstrap_spearman_ci(
    x: list[float], y: list[float], n_boot: int = 800, seed: int = 42
) -> dict:
    import random

    rho = spearman_rho(x, y)
    if rho is None:
        return {"rho": None, "ci_low": None, "ci_high": None}
    rng = random.Random(seed)
    n = len(x)
    samples = []
    for _ in range(n_boot):
        idx = [rng.randrange(n) for _ in range(n)]
        xb = [x[i] for i in idx]
        yb = [y[i] for i in idx]
        r = spearman_rho(xb, yb)
        if r is not None and not math.isnan(r):
            samples.append(r)
    if not samples:
        return {"rho": rho, "ci_low": None, "ci_high": None}
    samples.sort()
    lo = samples[int(0.025 * len(samples))]
    hi = samples[int(0.975 * len(samples))]
    return {"rho": rho, "ci_low": lo, "ci_high": hi}
