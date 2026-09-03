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

  const rankHandler = require("../api/rank-candidates");
  app.use("/api/rank-candidates", vercelOnExpress(rankHandler));

  const painsHandler = require("../api/pains-check");
  app.use("/api/pains-check", vercelOnExpress(painsHandler));
};
