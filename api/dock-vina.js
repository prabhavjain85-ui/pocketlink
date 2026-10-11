/**
 * Vercel proxy to external Vina dock service (see benchmark/VERCEL_VINA_FEASIBILITY.md).
 * Does NOT bundle Vina/RDKit on Vercel.
 */
const VALIDATED_IDS = new Set([
  "abl1",
  "dpp4",
  "erbb2",
  "esr1",
  "pde5a",
  "ptgs2",
]);

const NOT_VALIDATED_MSG =
  "Docking not validated for this target. Server-side Vina is only enabled where co-crystal redocking in-place RMSD < 2 Å.";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }

  const targetId = (body?.target_id || body?.targetId || "").toLowerCase();
  const smiles = (body?.smiles || "").trim();
  if (!targetId || !smiles) {
    return res.status(400).json({ error: "target_id and smiles are required" });
  }
  if (!VALIDATED_IDS.has(targetId)) {
    return res.status(400).json({ error: NOT_VALIDATED_MSG, target_id: targetId });
  }

  const base = process.env.VINA_DOCK_SERVICE_URL;
  if (!base) {
    return res.status(503).json({
      error:
        "Server-side Vina is not configured. Set VINA_DOCK_SERVICE_URL to the container service (see services/vina-dock/).",
      feasibility: "benchmark/VERCEL_VINA_FEASIBILITY.md",
    });
  }

  const url = `${base.replace(/\/$/, "")}/v1/dock`;
  const headers = { "Content-Type": "application/json" };
  if (process.env.VINA_DOCK_API_KEY) {
    headers.Authorization = `Bearer ${process.env.VINA_DOCK_API_KEY}`;
  }

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        target_id: targetId,
        smiles,
        exhaustiveness: body.exhaustiveness ?? 8,
      }),
    });
    const text = await upstream.text();
    res.status(upstream.status);
    try {
      return res.json(JSON.parse(text));
    } catch {
      return res.send(text);
    }
  } catch (err) {
    return res.status(502).json({
      error: "Vina dock service unreachable",
      detail: err?.message || String(err),
    });
  }
}
