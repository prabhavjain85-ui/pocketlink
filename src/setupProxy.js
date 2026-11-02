const contactHandler = require("../api/contact");

function vercelOnExpress(handler) {
  return (req, res) => {
    const run = (body) => {
      req.body = body;
      handler(req, res);
    };

    if (req.method !== "POST") return handler(req, res);

    if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
      return run(req.body);
    }

    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        run(JSON.parse(Buffer.concat(chunks).toString() || "{}"));
      } catch {
        run({});
      }
    });
  };
}

module.exports = function setupProxy(app) {
  // Local CRA has no Resend/Formspree keys; accept the form without sending mail.
  if (!process.env.CONTACT_DRY_RUN) process.env.CONTACT_DRY_RUN = "1";

  app.use("/api/contact", vercelOnExpress(contactHandler));

  // Server-side computation (scoring, screening, ADME, evolution, ...).
  const computeHandler = require("../api/compute");
  app.use("/api/compute", vercelOnExpress(computeHandler));

  const rankHandler = require("../api/rank-candidates");
  app.use("/api/rank-candidates", vercelOnExpress(rankHandler));

  const painsHandler = require("../api/pains-check");
  app.use("/api/pains-check", vercelOnExpress(painsHandler));

  const adversarialHandler = require("../api/adversarial-critique");
  app.use("/api/adversarial-critique", vercelOnExpress(adversarialHandler));

  const hypothesisHandler = require("../api/hypothesis-eval");
  app.use("/api/hypothesis-eval", vercelOnExpress(hypothesisHandler));

  const dockingHealthHandler = require("../api/docking/health");
  app.get("/api/docking/health", (req, res) => dockingHealthHandler(req, res));

  const dockingJobsHandler = require("../api/docking/jobs");
  const dockingStatusHandler = require("../api/docking/jobs/[jobId]");
  const dockingResultsHandler = require("../api/docking/jobs/[jobId]/results");
  app.post("/api/docking/jobs", vercelOnExpress(dockingJobsHandler));
  app.get("/api/docking/jobs/:jobId/results", (req, res) => {
    req.query = { ...(req.query || {}), jobId: req.params.jobId };
    dockingResultsHandler(req, res);
  });
  app.get("/api/docking/jobs/:jobId", (req, res) => {
    req.query = { ...(req.query || {}), jobId: req.params.jobId };
    dockingStatusHandler(req, res);
  });
};
