"""Vercel Python function: experimental Quantum Insight VQE (user-triggered only)."""

import json
import sys
import traceback
from http.server import BaseHTTPRequestHandler

# Ensure sibling modules resolve when loaded as api/quantum-insight.py
sys.path.insert(0, __file__.rsplit("/", 1)[0])

from quantum_insight_gate import (  # noqa: E402
    DEFAULT_BASIS,
    count_atoms_in_geometry,
    refusal_payload,
    resolve_geometry,
    size_gate_reasons,
)
from quantum_insight_vqe import explain_result, run_vqe  # noqa: E402


def json_response(handler, status, body):
    payload = json.dumps(body).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
    handler.send_header("Content-Length", str(len(payload)))
    handler.end_headers()
    handler.wfile.write(payload)


def handle_quantum_request(payload):
    """Core POST logic (testable without HTTP handler wiring)."""
    geometry, geometry_source = resolve_geometry(payload)
    atom_count, non_h_count = count_atoms_in_geometry(geometry)

    pre_qubit_reasons = size_gate_reasons(atom_count, non_h_count)
    if pre_qubit_reasons:
        return 422, refusal_payload(pre_qubit_reasons, atom_count, non_h_count)

    basis = str(payload.get("basis") or DEFAULT_BASIS).strip().lower() or DEFAULT_BASIS
    charge = int(payload.get("charge") or 0)
    spin = int(payload.get("spin") or 0)

    from quantum_insight_vqe import build_problem

    _, _, qubit_op = build_problem(geometry, basis=basis, charge=charge, spin=spin)
    n_qubits = qubit_op.num_qubits

    post_qubit_reasons = size_gate_reasons(atom_count, non_h_count, n_qubits)
    if post_qubit_reasons:
        return 422, refusal_payload(post_qubit_reasons, atom_count, non_h_count, n_qubits)

    vqe_result = run_vqe(geometry, basis=basis, charge=charge, spin=spin)
    explanation = explain_result(geometry_source, vqe_result)

    return 200, {
        "experimental": True,
        "refused": False,
        **vqe_result,
        "geometry_source": geometry_source,
        "atom_count": atom_count,
        "non_hydrogen_atom_count": non_h_count,
        "explanation": explanation,
    }


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        json_response(self, 204, {})

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length else b"{}"
            payload = json.loads(raw.decode("utf-8") or "{}")
        except (json.JSONDecodeError, UnicodeDecodeError):
            return json_response(self, 400, {"experimental": True, "error": "Invalid JSON body."})

        try:
            status, body = handle_quantum_request(payload)
            return json_response(self, status, body)
        except ValueError as exc:
            return json_response(self, 400, {"experimental": True, "error": str(exc)})
        except Exception as exc:  # pragma: no cover - surfaced as 500 in production
            traceback.print_exc()
            return json_response(
                self,
                500,
                {
                    "experimental": True,
                    "error": "Quantum Insight simulation failed.",
                    "detail": str(exc),
                },
            )
