const { handleHealth, json } = require("../_lib/dockingProxy");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    return res.end();
  }
  if (req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed" });
  }
  return handleHealth(req, res);
};
