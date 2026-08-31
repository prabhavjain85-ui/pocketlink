const handler = require("../api/contact");

function mockRes() {
  return {
    headers: {},
    statusCode: 0,
    body: null,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    end(payload) {
      this.body = payload ? JSON.parse(payload) : {};
    },
  };
}

function req(method, body, ip = "test-ip") {
  return {
    method,
    body,
    headers: { "x-forwarded-for": ip },
  };
}

const valid = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  message: "I would like to collaborate on a kinase shortlist workflow.",
};

beforeEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.FORMSPREE_ID;
  delete process.env.CONTACT_FROM_EMAIL;
  process.env.CONTACT_DRY_RUN = "1";
  process.env.CONTACT_TO_EMAIL = "prabhavjain85@gmail.com";
});

afterEach(() => {
  delete process.env.CONTACT_DRY_RUN;
  delete process.env.CONTACT_TO_EMAIL;
});

test("API rejects non-POST methods", async () => {
  const res = mockRes();
  await handler(req("GET"), res);
  expect(res.statusCode).toBe(405);
});

test("API requires a name", async () => {
  const res = mockRes();
  await handler(req("POST", { ...valid, name: "  " }, "ip-name"), res);
  expect(res.statusCode).toBe(400);
  expect(res.body.error).toMatch(/name/i);
});

test("API requires a valid email", async () => {
  const res = mockRes();
  await handler(req("POST", { ...valid, email: "not-an-email" }, "ip-email"), res);
  expect(res.statusCode).toBe(400);
  expect(res.body.error).toMatch(/email/i);
});

test("API requires a message", async () => {
  const res = mockRes();
  await handler(req("POST", { ...valid, message: "" }, "ip-msg"), res);
  expect(res.statusCode).toBe(400);
  expect(res.body.error).toMatch(/message/i);
});

test("API accepts a valid message in dry-run mode", async () => {
  const res = mockRes();
  await handler(req("POST", valid, "ip-ok"), res);
  expect(res.statusCode).toBe(200);
  expect(res.body.ok).toBe(true);
  expect(res.body.delivered).toBe("dry-run");
});

test("API silently accepts honeypot spam", async () => {
  const res = mockRes();
  await handler(req("POST", { ...valid, _gotcha: "bot" }, "ip-hp"), res);
  expect(res.statusCode).toBe(200);
  expect(res.body.ok).toBe(true);
  expect(res.body.delivered).toBeUndefined();
});

test("API sends via Resend when a key is configured", async () => {
  delete process.env.CONTACT_DRY_RUN;
  process.env.RESEND_API_KEY = "re_test";
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ id: "email_1" }),
  });
  const previous = global.fetch;
  global.fetch = fetchMock;

  const res = mockRes();
  await handler(req("POST", valid, "ip-resend"), res);

  global.fetch = previous;
  expect(res.statusCode).toBe(200);
  expect(res.body.delivered).toBe("resend");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("https://api.resend.com/emails");
  const payload = JSON.parse(options.body);
  expect(payload.to).toBe("prabhavjain85@gmail.com");
  expect(payload.reply_to).toBe(valid.email);
  expect(payload.text).toContain(valid.message);
});

test("API falls back to FormSubmit when no email key is set", async () => {
  delete process.env.CONTACT_DRY_RUN;
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true }),
  });
  const previous = global.fetch;
  global.fetch = fetchMock;

  const res = mockRes();
  await handler(req("POST", valid, "ip-formsubmit"), res);

  global.fetch = previous;
  expect(res.statusCode).toBe(200);
  expect(res.body.delivered).toBe("formsubmit");
  const [url] = fetchMock.mock.calls[0];
  expect(url).toContain("formsubmit.co/ajax/prabhavjain85%40gmail.com");
});
