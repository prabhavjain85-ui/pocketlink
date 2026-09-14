"""VQE ground-state energy via Qiskit Nature + Aer (experimental)."""

import time

from quantum_insight_gate import DEFAULT_BASIS, MAX_QUBITS, size_gate_reasons

ACTIVE_SPACE_ELECTRONS = 2
ACTIVE_SPACE_SPATIAL_ORBITALS = 2


def build_problem(geometry, basis=DEFAULT_BASIS, charge=0, spin=0):
    from qiskit_nature.second_q.drivers import PySCFDriver
    from qiskit_nature.second_q.mappers import ParityMapper

    driver = PySCFDriver(atom=geometry, basis=basis, charge=charge, spin=spin)
    problem = driver.run()
    mapper = ParityMapper(num_particles=problem.num_particles)
    qubit_op = mapper.map(problem.hamiltonian.second_q_op())
    return problem, mapper, qubit_op


def apply_active_space(problem, num_electrons=ACTIVE_SPACE_ELECTRONS, num_spatial_orbitals=ACTIVE_SPACE_SPATIAL_ORBITALS):
    from qiskit_nature.second_q.mappers import ParityMapper
    from qiskit_nature.second_q.transformers import ActiveSpaceTransformer

    transformer = ActiveSpaceTransformer(
        num_electrons=num_electrons,
        num_spatial_orbitals=num_spatial_orbitals,
    )
    reduced = transformer.transform(problem)
    mapper = ParityMapper(num_particles=reduced.num_particles)
    qubit_op = mapper.map(reduced.hamiltonian.second_q_op())
    return reduced, mapper, qubit_op


def _fragment_charge_spin_candidates(geometry):
    """Neutral O–H diatomics often fail PySCF; try closed-shell ionic alternatives."""
    symbols = []
    for part in str(geometry or "").split(";"):
        part = part.strip()
        if part:
            symbols.append(part.split()[0].upper())
    if symbols == ["O", "H"] or symbols == ["H", "O"]:
        return [(-1, 0), (1, 0), (0, 1)]
    return [(0, 0)]


def build_problem_for_request(geometry, basis=DEFAULT_BASIS, charge=0, spin=0, allow_active_space=False):
    """Build mapped problem; optionally reduce with a 2e/2o active space for fragments."""
    candidates = [(charge, spin)]
    if allow_active_space:
        for alt_charge, alt_spin in _fragment_charge_spin_candidates(geometry):
            if (alt_charge, alt_spin) not in candidates:
                candidates.append((alt_charge, alt_spin))

    last_error = None
    problem = mapper = qubit_op = None
    for cand_charge, cand_spin in candidates:
        try:
            problem, mapper, qubit_op = build_problem(
                geometry, basis=basis, charge=cand_charge, spin=cand_spin
            )
            charge, spin = cand_charge, cand_spin
            break
        except Exception as exc:  # pragma: no cover - PySCF driver failures
            last_error = exc

    if problem is None:
        raise ValueError(f"Could not build quantum chemistry problem: {last_error}")

    active_space = False
    if allow_active_space and qubit_op.num_qubits > MAX_QUBITS:
        problem, mapper, qubit_op = apply_active_space(problem)
        active_space = True

    return problem, mapper, qubit_op, {
        "active_space": active_space,
        "active_space_electrons": ACTIVE_SPACE_ELECTRONS if active_space else None,
        "active_space_orbitals": ACTIVE_SPACE_SPATIAL_ORBITALS if active_space else None,
        "charge": charge,
        "spin": spin,
    }


def run_vqe(
    geometry,
    basis=DEFAULT_BASIS,
    charge=0,
    spin=0,
    maxiter=100,
    allow_active_space=False,
    problem=None,
    mapper=None,
    qubit_op=None,
    vqe_meta=None,
):
    from qiskit_algorithms import VQE
    from qiskit_algorithms.optimizers import SLSQP
    from qiskit_aer import AerSimulator
    from qiskit_aer.primitives import EstimatorV2
    from qiskit_nature.second_q.circuit.library import HartreeFock, UCCSD
    from qiskit.transpiler.preset_passmanagers import generate_preset_pass_manager

    meta = vqe_meta or {}
    if problem is None or mapper is None or qubit_op is None:
        problem, mapper, qubit_op, meta = build_problem_for_request(
            geometry,
            basis=basis,
            charge=charge,
            spin=spin,
            allow_active_space=allow_active_space,
        )

    n_qubits = qubit_op.num_qubits

    initial_state = HartreeFock(
        problem.num_spatial_orbitals,
        problem.num_particles,
        mapper,
    )
    ansatz = UCCSD(
        problem.num_spatial_orbitals,
        problem.num_particles,
        mapper,
        initial_state=initial_state,
    )

    backend = AerSimulator()
    estimator = EstimatorV2.from_backend(backend)
    pm = generate_preset_pass_manager(optimization_level=1, backend=backend)

    vqe = VQE(
        estimator,
        ansatz,
        SLSQP(maxiter=maxiter),
        transpiler=pm,
    )

    started = time.perf_counter()
    result = vqe.compute_minimum_eigenvalue(qubit_op)
    runtime_seconds = time.perf_counter() - started

    electronic_energy = float(result.eigenvalue.real)
    nuclear_repulsion = float(problem.nuclear_repulsion_energy)
    total_energy_hartree = electronic_energy + nuclear_repulsion

    response = {
        "total_energy_hartree": total_energy_hartree,
        "electronic_energy": electronic_energy,
        "nuclear_repulsion": nuclear_repulsion,
        "n_qubits": n_qubits,
        "basis": basis,
        "mapper": "ParityMapper",
        "ansatz": "UCCSD/HartreeFock",
        "runtime_seconds": runtime_seconds,
        "optimizer": "SLSQP",
        "vqe_iterations": getattr(result, "num_iterations", None),
    }
    if meta.get("active_space"):
        response.update(
            {
                "active_space": True,
                "active_space_electrons": meta.get("active_space_electrons"),
                "active_space_orbitals": meta.get("active_space_orbitals"),
                "ansatz": "UCCSD/HartreeFock (active-space)",
            }
        )
    return response


def explain_result(geometry_source, vqe_result, fragment_meta=None):
    energy = vqe_result["total_energy_hartree"]
    n_qubits = vqe_result["n_qubits"]
    basis = vqe_result["basis"]
    runtime = vqe_result["runtime_seconds"]
    active_space_note = ""
    if vqe_result.get("active_space"):
        electrons = vqe_result.get("active_space_electrons")
        orbitals = vqe_result.get("active_space_orbitals")
        active_space_note = (
            f" Active-space reduction ({electrons}e/{orbitals}o) was applied because the full "
            "fragment exceeded the 8-qubit simulator cap."
        )
    if fragment_meta:
        formula = fragment_meta.get("fragment_formula") or "contact fragment"
        residue = fragment_meta.get("contact_residue")
        residue_note = f" near pocket residue {residue}" if residue else ""
        energy_label = (
            "active-space fragment ground-state energy"
            if vqe_result.get("active_space")
            else "fragment ground-state energy"
        )
        return (
            f"Experimental VQE on a pocket-contact fragment ({formula}){residue_note} estimated an "
            f"{energy_label} of {energy:.6f} Hartree using {basis} and {n_qubits} mapped qubits "
            f"in {runtime:.2f}s.{active_space_note} This is the tiny substructure's quantum energy "
            "only — not the full drug, not binding affinity, not ΔG, and not a docking score. "
            "Research-stage estimate only; not part of PocketLink scoring."
        )
    return (
        f"Experimental VQE simulation (Qiskit Nature + Aer, no hardware) estimated a "
        f"ground-state energy of {energy:.6f} Hartree using {basis} and {n_qubits} mapped qubits "
        f"in {runtime:.2f}s. Geometry source: {geometry_source}. "
        "This is a research-stage quantum-chemistry estimate — not validated for drug-discovery "
        "decisions and not part of PocketLink scoring."
    )
