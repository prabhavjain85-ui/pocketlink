const ALLOWED_ORIGIN = "*";
const DEFAULT_TO = "prabhavjain85@gmail.com";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hitsByIp = new Map();

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.end(JSON.stringify(body));
}

function clean(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

function clientIp(req) {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function rateLimited(ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const max = 8;
  const recent = (hitsByIp.get(ip) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hitsByIp.set(ip, recent);
    return true;
  }
  recent.push(now);
  hitsByIp.set(ip, recent);
  return false;
}

function parseBody(req) {
  const raw = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  return {
    name: clean(raw.name, 120),
    email: clean(raw.email, 160),
    message: clean(raw.message, 4000),
    gotcha: clean(raw._gotcha || raw.gotcha, 80),
  };
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function deliver({ name, email, message }) {
  const to = process.env.CONTACT_TO_EMAIL || DEFAULT_TO;
  const subject = `PocketLink contact from ${name}`;
  const text = `Name: ${name}\nEmail: ${email}\n\n${message}`;

  if (process.env.CONTACT_DRY_RUN === "1") {
    return { delivered: "dry-run" };
  }

  if (process.env.RESEND_API_KEY) {
    const from = process.env.CONTACT_FROM_EMAIL || "PocketLink <onboarding@resend.dev>";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, reply_to: email, subject, text }),
    });
    const data = await readJson(response);
    if (!response.ok) {
      throw new Error(data.message || data.error || "Email service rejected the message.");
    }
    return { delivered: "resend" };
  }

  if (process.env.FORMSPREE_ID) {
    const response = await fetch(`https://formspree.io/f/${encodeURIComponent(process.env.FORMSPREE_ID)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ name, email, message, _replyto: email, _subject: subject }),
    });
    if (!response.ok) throw new Error("Formspree rejected the message.");
    return { delivered: "formspree" };
  }

  const response = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(to)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      name,
      email,
      message,
      _subject: subject,
      _template: "box",
      _captcha: "false",
    }),
  });
  const data = await readJson(response);
  if (!response.ok || data.success === "false" || data.success === false) {
    throw new Error(data.message || "Could not deliver the message.");
  }
  return { delivered: "formsubmit" };
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method !== "POST") return json(res, 405, { error: "POST required" });

  try {
    if (rateLimited(clientIp(req))) {
      return json(res, 429, { error: "Too many messages. Please wait a few minutes and try again." });
    }

    const { name, email, message, gotcha } = parseBody(req);

    if (gotcha) {
      return json(res, 200, { ok: true });
    }

    if (!name) return json(res, 400, { error: "Name is required." });
    if (!email || !EMAIL_RE.test(email)) return json(res, 400, { error: "A valid email is required." });
    if (!message) return json(res, 400, { error: "Message is required." });

    const result = await deliver({ name, email, message });
    return json(res, 200, { ok: true, ...result });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return json(res, 400, { error: "Invalid JSON body." });
    }
    return json(res, 502, { error: error?.message || "Couldn't send your message." });
  }
};
