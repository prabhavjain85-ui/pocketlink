"""Extract a single protein chain and renumber residues contiguously for Meeko."""
from __future__ import annotations

_BACKBONE = {"N", "CA", "C", "O"}


def _residue_backbone_complete(lines: list[str]) -> bool:
    names = {ln[12:16].strip() for ln in lines}
    return all(atom in names for atom in _BACKBONE)


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

    # Drop terminal residues with incomplete backbone (common in crystal structures).
    by_res: dict[tuple[str, int, str], list[str]] = {}
    for ln in atoms:
        resname = ln[17:20].strip()
        resseq = int(ln[22:26].strip())
        icode = ln[26:27].strip()
        by_res.setdefault((resname, resseq, icode), []).append(ln)
    ordered_keys = list(by_res.keys())
    while ordered_keys and not _residue_backbone_complete(by_res[ordered_keys[0]]):
        ordered_keys.pop(0)
    while ordered_keys and not _residue_backbone_complete(by_res[ordered_keys[-1]]):
        ordered_keys.pop()
    atoms = [ln for key in ordered_keys for ln in by_res[key]]

    old_to_new = {key: i + 1 for i, key in enumerate(ordered_keys)}

    def remap(line: str) -> str:
        resname = line[17:20].strip()
        resseq = int(line[22:26].strip())
        icode = line[26:27].strip()
        new_seq = old_to_new[(resname, resseq, icode)]
        return line[:22] + f"{new_seq:>4}" + line[26:]

    out = [remap(ln) for ln in atoms] + [remap(ln) for ln in het]
    out.append("END")
    return "\n".join(out)
