/**
 * 本地静态页 + 美股盘前代理
 * 用法：node serve.mjs
 * 然后打开 http://127.0.0.1:8787/
 *
 * 盘前走百度股市通（东财/腾讯在盘前仍返回昨收盘后价；新浪有 Referer 限制）
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

function parseSignedPct(s) {
  if (s == null || s === "") return null;
  const n = Number(String(s).replace(/[+%\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function pickExtInfo(result) {
  if (!result) return null;
  for (const key of ["outMarketInfo", "preMarketInfo", "postMarketInfo"]) {
    const info = result[key];
    if (!info || info.type === "" || info.price == null || info.price === "") continue;
    const price = Number(info.price);
    const preChange = parseSignedPct(info.ratio);
    if (!Number.isFinite(price) || preChange == null) continue;
    return {
      name: result.basicinfos?.name || undefined,
      price,
      preChange,
      section: info.tradeSectionCN || info.tradeSection || key
    };
  }
  return null;
}

async function fetchBaiduUsExt(code) {
  const url =
    "https://finance.pae.baidu.com/vapi/v1/getquotation?srcid=5353&group=quotation_minute_us&code=" +
    encodeURIComponent(code) +
    "&market_type=us&newFormat=1";
  const resp = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
      Referer: "https://gushitong.baidu.com/"
    }
  });
  if (!resp.ok) throw new Error("baidu " + resp.status);
  const json = await resp.json();
  return pickExtInfo(json?.Result);
}

async function loadUsPremarketMap(codes) {
  const map = {};
  const uniq = [...new Set(codes.map((c) => String(c || "").trim().toUpperCase()).filter(Boolean))];
  const concurrency = Math.min(4, uniq.length || 1);
  let cursor = 0;

  async function worker() {
    while (cursor < uniq.length) {
      const code = uniq[cursor++];
      try {
        const row = await fetchBaiduUsExt(code);
        if (row) map[code] = row;
      } catch (_) {
        // 单只失败不影响其余
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return map;
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

    if (url.pathname === "/api/us-premarket") {
      const codes = (url.searchParams.get("codes") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!codes.length) {
        send(res, 400, { error: "codes required" }, { "Content-Type": "application/json; charset=utf-8" });
        return;
      }
      const map = await loadUsPremarketMap(codes);
      send(res, 200, map, { "Content-Type": "application/json; charset=utf-8" });
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
