/**
 * Serves dist/ with a stub /api/docking/health that reports offline (preview-like).
 */
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, "..", "dist");
const port = Number(process.env.PORT || 3462);

const healthBody = JSON.stringify({
  prototype: true,
  validationStatus: "unvalidated",
  status: "unavailable",
  serviceConfigured: false,
  serviceReachable: false,
  serviceUnavailable: true,
  message: "Docking service is not configured (DOCKING_SERVICE_URL).",
});

function sendFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = req.url?.split("?")[0] || "/";
  if (url === "/api/docking/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(healthBody);
    return;
  }
  let file = path.join(dist, url === "/" ? "index.html" : url);
  if (url.startsWith("/docking")) {
    file = path.join(dist, "docking", "index.html");
  }
  if (!file.startsWith(dist)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.stat(file, (err, st) => {
    if (!err && st.isFile()) {
      const ext = path.extname(file);
      const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css" };
      sendFile(res, file, types[ext] || "application/octet-stream");
      return;
    }
    sendFile(res, path.join(dist, "index.html"), "text/html");
  });
});

server.listen(port, () => {
  console.log(`offline-test server http://localhost:${port}/docking`);
});
