"""VQE ground-state energy via Qiskit Nature + Aer (experimental)."""

import time

from quantum_insight_gate import DEFAULT_BASIS, size_gate_reasons


def build_problem(geometry, basis=DEFAULT_BASIS, charge=0, spin=0):
    from qiskit_nature.second_q.drivers import PySCFDriver
    from qiskit_nature.second_q.mappers import ParityMapper

    driver = PySCFDriver(atom=geometry, basis=basis, charge=charge, spin=spin)
    problem = driver.run()
    mapper = ParityMapper()
    qubit_op = mapper.map(problem.hamiltonian.second_q_op())
    return problem, mapper, qubit_op


def run_vqe(geometry, basis=DEFAULT_BASIS, charge=0, spin=0, maxiter=100):
    from qiskit_algorithms import VQE
    from qiskit_algorithms.optimizers import SLSQP
    from qiskit_aer import AerSimulator
    from qiskit_aer.primitives import EstimatorV2
    from qiskit_nature.second_q.circuit.library import HartreeFock, UCCSD
    from qiskit.transpiler.preset_passmanagers import generate_preset_pass_manager

    problem, mapper, qubit_op = build_problem(geometry, basis=basis, charge=charge, spin=spin)
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

    return {
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


def explain_result(geometry_source, vqe_result):
    energy = vqe_result["total_energy_hartree"]
    n_qubits = vqe_result["n_qubits"]
    basis = vqe_result["basis"]
    runtime = vqe_result["runtime_seconds"]
    return (
        f"Experimental VQE simulation (Qiskit Nature + Aer, no hardware) estimated a "
        f"ground-state energy of {energy:.6f} Hartree using {basis} and {n_qubits} mapped qubits "
        f"in {runtime:.2f}s. Geometry source: {geometry_source}. "
        "This is a research-stage quantum-chemistry estimate — not validated for drug-discovery "
        "decisions and not part of PocketLink scoring."
    )
