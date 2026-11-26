/**
 * 本地静态页服务
 * 用法：
 *   npm run build    # 生成 dist/
 *   node serve.mjs   # 若有 dist/index.html 则直接服务构建产物
 * 然后打开 http://127.0.0.1:8787/
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleFundHoldingsRequest } from "./server/fund-holdings.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const DIST_ROOT = path.join(__dirname, "dist");
const ROOT = fs.existsSync(path.join(DIST_ROOT, "index.html"))
  ? DIST_ROOT
  : __dirname;

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
  const payload =
    typeof body === "string" || Buffer.isBuffer(body)
      ? body
      : JSON.stringify(body);
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

    if (url.pathname === "/api/fund-holdings") {
      await handleFundHoldingsRequest(url, res);
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
  if (ROOT === __dirname) {
    console.log("提示：尚未检测到 dist/，当前服务的是源码目录。");
    console.log("     开发请用 npm run dev；生产请先 npm run build 再运行 node serve.mjs。");
  }
  console.log(`Local  http://127.0.0.1:${PORT}/`);
  console.log(`LAN    http://<本机局域网IP>:${PORT}/  （手机需连同一 WiFi）`);
});
