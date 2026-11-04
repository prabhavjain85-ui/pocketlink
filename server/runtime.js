/**
 * Server runtime shim. Imported once by server/compute.js before any compute module.
 *
 * The computation modules were written for the browser, where `fetch("/api/...")`
 * and `fetch("/data/...")` hit this same site. On the server those relative URLs
 * have no origin, so this shim resolves them in-process:
 *   /api/<route>  -> invoke the matching Vercel handler in api/ directly
 *   /<asset path> -> read the file from public/
 * Absolute URLs (RCSB, PubChem, Open Targets, ...) go to the real fetch.
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
globalThis.__tfRequire = require;

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
const SERVER_DATA_DIR = path.join(PROJECT_ROOT, "server", "data");
const API_DIR = path.join(PROJECT_ROOT, "api");

const realFetch = globalThis.fetch;

const CONTENT_TYPES = {
  ".json": "application/json",
  ".gz": "application/gzip",
  ".js": "text/javascript",
  ".txt": "text/plain",
};

function resolveApiRoute(pathname) {
  const route = pathname.replace(/^\/api\//, "").replace(/\/+$/, "");
  const results = route.match(/^docking\/jobs\/([^/]+)\/results$/);
  if (results) return { file: "docking/jobs/[jobId]/results.js", query: { jobId: decodeURIComponent(results[1]) } };
  const status = route.match(/^docking\/jobs\/([^/]+)$/);
  if (status) return { file: "docking/jobs/[jobId].js", query: { jobId: decodeURIComponent(status[1]) } };
  if (!/^[a-z0-9/_-]+$/i.test(route)) return null;
  return { file: `${route}.js`, query: {} };
}

async function invokeApiHandler(url, init = {}) {
  const resolved = resolveApiRoute(url.pathname);
  const file = resolved && path.join(API_DIR, resolved.file);
  if (!file || !file.startsWith(API_DIR) || !fs.existsSync(file)) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }
  const handler = require(file);
  const method = String(init.method || "GET").toUpperCase();
  let body = init.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      /* leave as string */
    }
  }
  const query = { ...Object.fromEntries(url.searchParams), ...resolved.query };

  return new Promise((resolve, reject) => {
    const headers = {};
    let statusCode = 200;
    const chunks = [];
    const res = {
      get statusCode() {
        return statusCode;
      },
      set statusCode(v) {
        statusCode = v;
      },
      setHeader: (k, v) => {
        headers[String(k).toLowerCase()] = String(v);
      },
      getHeader: (k) => headers[String(k).toLowerCase()],
      status(code) {
        statusCode = code;
        return res;
      },
      json(obj) {
        headers["content-type"] = "application/json";
        res.end(JSON.stringify(obj));
        return res;
      },
      send(data) {
        res.end(typeof data === "string" || Buffer.isBuffer(data) ? data : JSON.stringify(data));
        return res;
      },
      write(chunk) {
        if (chunk != null) chunks.push(Buffer.from(chunk));
        return true;
      },
      end(chunk) {
        if (chunk != null) chunks.push(Buffer.from(chunk));
        const status = statusCode === 204 ? 204 : statusCode;
        resolve(new Response(status === 204 ? null : Buffer.concat(chunks), { status, headers }));
      },
    };
    const req = { method, headers: { "content-type": "application/json", ...(init.headers || {}) }, body, query, url: url.pathname + url.search };
    Promise.resolve()
      .then(() => handler(req, res))
      .catch(reject);
  });
}

function readLocalAsset(url) {
  const decoded = decodeURIComponent(url.pathname);
  if (decoded === "/data" || decoded.startsWith("/data/")) {
    const rel = decoded.replace(/^\/data\/?/, "");
    const serverFile = path.normalize(path.join(SERVER_DATA_DIR, rel));
    if (serverFile.startsWith(SERVER_DATA_DIR) && fs.existsSync(serverFile) && fs.statSync(serverFile).isFile()) {
      const type = CONTENT_TYPES[path.extname(serverFile)] || "application/octet-stream";
      return new Response(fs.readFileSync(serverFile), { status: 200, headers: { "content-type": type } });
    }
  }
  const file = path.normalize(path.join(PUBLIC_DIR, decoded));
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return new Response("Not found", { status: 404 });
  }
  const type = CONTENT_TYPES[path.extname(file)] || "application/octet-stream";
  return new Response(fs.readFileSync(file), { status: 200, headers: { "content-type": type } });
}

globalThis.fetch = async function serverFetch(input, init) {
  const raw = typeof input === "string" ? input : input?.url || String(input);
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    const url = new URL(raw, "http://internal.local");
    if (url.pathname.startsWith("/api/")) return invokeApiHandler(url, init);
    return readLocalAsset(url);
  }
  return realFetch(input, init);
};

export { PROJECT_ROOT, SERVER_DATA_DIR };
