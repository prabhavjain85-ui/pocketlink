"""Extract a single protein chain and renumber residues contiguously for Meeko."""
from __future__ import annotations


def extract_chain_renumbered(pdb_text: str, chain_id: str, keep_het: set[str] | None = None) -> str:
    keep_het = {h.upper() for h in (keep_het or set())}
    atoms: list[str] = []
    het: list[str] = []
    for line in pdb_text.splitlines():
        if line.startswith("ATOM  "):
            ch = line[21:22].strip() or "A"
            if ch != chain_id:
                continue
            alt = line[16:17].strip()
            if alt and alt not in ("A", "1", ""):
                continue
            atoms.append(line)
        elif line.startswith("HETATM"):
            ch = line[21:22].strip() or "A"
            rn = line[17:20].strip().upper()
            if ch != chain_id or rn not in keep_het:
                continue
            alt = line[16:17].strip()
            if alt and alt not in ("A", "1", ""):
                continue
            het.append(line)

    if not atoms:
        raise ValueError(f"No ATOM records for chain {chain_id}")

    res_keys: list[tuple[str, int, str]] = []
    seen = set()
    for line in atoms:
        resname = line[17:20].strip()
        resseq = int(line[22:26].strip())
        icode = line[26:27].strip()
        key = (resname, resseq, icode)
        if key not in seen:
            seen.add(key)
            res_keys.append(key)

    old_to_new = {key: i + 1 for i, key in enumerate(res_keys)}

    def remap(line: str) -> str:
        resname = line[17:20].strip()
        resseq = int(line[22:26].strip())
        icode = line[26:27].strip()
        new_seq = old_to_new[(resname, resseq, icode)]
        return line[:22] + f"{new_seq:>4}" + line[26:]

    out = [remap(ln) for ln in atoms] + [remap(ln) for ln in het]
    out.append("END")
    return "\n".join(out)
