"""Vercel Python function: POST /api/pains-check

Accepts `{ "smiles": "..." }` or `{ "compounds": [{ "cid", "smiles" }] }`
and returns deterministic RDKit PAINS + toxicophore matches.
"""

from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

try:
    from _pains import check_compounds, check_smiles, engine_info
    IMPORT_ERROR = None
except Exception as exc:  # pragma: no cover - import environment only
    check_compounds = None
    check_smiles = None
    engine_info = lambda: {"engine": "unavailable"}  # noqa: E731
    IMPORT_ERROR = str(exc)

ALLOWED_ORIGIN = "*"


def _json_bytes(payload):
    return json.dumps(payload).encode("utf-8")


def _read_body(handler):
    length = int(handler.headers.get("Content-Length") or 0)
    raw = handler.rfile.read(length) if length else b"{}"
    if not raw:
        return {}
    try:
        data = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _cors_headers(handler):
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")


def _respond(handler, status, payload):
    handler.send_response(status)
    _cors_headers(handler)
    body = _json_bytes(payload)
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _run_check(body):
    if IMPORT_ERROR or check_compounds is None:
        return 503, {"error": f"RDKit PAINS checker unavailable ({IMPORT_ERROR})."}

    compounds = body.get("compounds")
    if isinstance(compounds, list):
        results = check_compounds(compounds)
    elif "smiles" in body:
        results = [check_smiles(body.get("smiles"), body.get("cid") or "")]
    else:
        return 400, {"error": "Provide smiles or compounds: [{ cid, smiles }]."}

    return 200, {**engine_info(), "results": results}


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        _respond(self, 204, {})

    def do_GET(self):
        payload = {
            **engine_info(),
            "ok": IMPORT_ERROR is None,
            "usage": 'POST {"smiles":"..."} or {"compounds":[{"cid":"...","smiles":"..."}]}',
        }
        if IMPORT_ERROR:
            payload["error"] = IMPORT_ERROR
        _respond(self, 200 if IMPORT_ERROR is None else 503, payload)

    def do_POST(self):
        body = _read_body(self)
        if body is None:
            return _respond(self, 400, {"error": "Invalid JSON body."})
        status, payload = _run_check(body)
        return _respond(self, status, payload)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    port = int(os.environ.get("PORT") or 8787)
    server = HTTPServer(("127.0.0.1", port), handler)
    print(f"PAINS checker listening on http://127.0.0.1:{port}/api/pains-check", flush=True)
    server.serve_forever()
