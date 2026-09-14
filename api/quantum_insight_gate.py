"""Size gates and geometry helpers for Quantum Insight (no Qiskit import)."""

MAX_QUBITS = 8
MAX_ATOMS = 4
MAX_NON_H_ATOMS = 2
DEFAULT_BASIS = "sto-3g"
H2_CANONICAL_GEOMETRY = "H 0 0 0; H 0 0 0.735"
H2_SMILES_CANONICAL = frozenset({"[H][H]", "HH", "[HH]", "[H]H", "H[H]"})


def normalize_smiles(smiles):
    return str(smiles or "").strip()


def is_h2_smiles(smiles):
    return normalize_smiles(smiles) in H2_SMILES_CANONICAL


def atoms_to_geometry(atoms):
    if not atoms:
        raise ValueError("Atom list is empty.")
    parts = []
    for atom in atoms:
        symbol = str(atom.get("symbol", "")).strip()
        if not symbol:
            raise ValueError("Each atom must include a chemical symbol.")
        try:
            x = float(atom["x"])
            y = float(atom["y"])
            z = float(atom["z"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("Each atom must include numeric x, y, z coordinates.") from exc
        parts.append(f"{symbol} {x} {y} {z}")
    return "; ".join(parts)


def count_atoms_in_geometry(geometry):
    symbols = []
    for part in str(geometry or "").split(";"):
        part = part.strip()
        if not part:
            continue
        tokens = part.split()
        if len(tokens) < 4:
            raise ValueError(f"Invalid atom specification: {part!r}")
        symbols.append(tokens[0])
    if not symbols:
        raise ValueError("Geometry string contains no atoms.")
    non_h = sum(1 for symbol in symbols if symbol.upper() != "H")
    return len(symbols), non_h


def resolve_geometry(payload):
    """Return (geometry_string, source_label) from API payload."""
    smiles = normalize_smiles(payload.get("smiles"))
    geometry = str(payload.get("geometry") or "").strip()
    atoms = payload.get("atoms")

    if geometry:
        return geometry, "explicit_geometry"

    if atoms:
        return atoms_to_geometry(atoms), "atom_coordinates"

    if is_h2_smiles(smiles):
        return H2_CANONICAL_GEOMETRY, "h2_canonical"

    if smiles:
        raise ValueError(
            "3D geometry is required for molecules other than H₂. "
            "Provide atom coordinates or a geometry string derived from RDKit."
        )

    raise ValueError("Provide SMILES and/or explicit 3D geometry (atoms or geometry string).")


def size_gate_reasons(atom_count, non_h_count, n_qubits=None):
    reasons = []
    if atom_count > MAX_ATOMS:
        reasons.append(
            f"Molecule has {atom_count} atoms (limit: {MAX_ATOMS}). "
            "Drug-like structures are outside this experimental scope."
        )
    if non_h_count > MAX_NON_H_ATOMS:
        reasons.append(
            f"Molecule has {non_h_count} non-hydrogen atoms (limit: {MAX_NON_H_ATOMS}). "
            "Larger heteroatom counts are refused to keep simulation time practical."
        )
    if n_qubits is not None and n_qubits > MAX_QUBITS:
        reasons.append(
            f"Mapped qubit count is {n_qubits} (limit: {MAX_QUBITS}). "
            "This experimental simulator is capped at 8 qubits."
        )
    return reasons


def refusal_payload(reasons, atom_count=None, non_h_count=None, n_qubits=None):
    return {
        "experimental": True,
        "refused": True,
        "error": "Molecule too large for experimental quantum simulation.",
        "reasons": reasons,
        "limits": {
            "max_atoms": MAX_ATOMS,
            "max_non_hydrogen_atoms": MAX_NON_H_ATOMS,
            "max_qubits": MAX_QUBITS,
        },
        "atom_count": atom_count,
        "non_hydrogen_atom_count": non_h_count,
        "n_qubits": n_qubits,
    }
