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

  return json(res, 200, {
    status: "coming_soon",
    message:
      "Quantum Insight (VQE via Qiskit/PySCF) is a planned future feature on dedicated external compute. It is not available in this deployment yet.",
  });
};
