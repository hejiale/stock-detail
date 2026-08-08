/**
 * 本地静态页服务
 * 用法：node serve.mjs
 * 然后打开 http://127.0.0.1:8787/
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff2": "font/woff2"
};

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(payload);
}

function safeJoin(root, reqPath) {
  const decoded = decodeURIComponent((reqPath || "/").split("?")[0]);
  const rel = decoded === "/" ? "/index.html" : decoded;
  const full = path.normalize(path.join(root, rel));
  if (!full.startsWith(root)) return null;
  return full;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);

    if (req.method === "OPTIONS") {
      send(res, 204, "", {
        "Access-Control-Allow-Methods": "GET,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      });
      return;
    }

    const filePath = safeJoin(ROOT, url.pathname);
    if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      send(res, 404, "Not Found", { "Content-Type": "text/plain; charset=utf-8" });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, fs.readFileSync(filePath), {
      "Content-Type": MIME[ext] || "application/octet-stream"
    });
  } catch (err) {
    send(res, 500, { error: String(err && err.message ? err.message : err) }, {
      "Content-Type": "application/json; charset=utf-8"
    });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Serving ${ROOT}`);
  console.log(`Local  http://127.0.0.1:${PORT}/`);
  console.log(`LAN    http://<本机局域网IP>:${PORT}/  （手机需连同一 WiFi）`);
});
