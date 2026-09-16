const ALLOWED_ORIGIN = "*";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return json(res, 204, {});
  }

  return json(res, 503, {
    unavailable: true,
    message:
      "Quantum Insight VQE backend is temporarily unavailable. The Python Qiskit/PySCF stack was removed from Vercel to reduce Functions Storage. Planned for future external compute.",
  });
};
