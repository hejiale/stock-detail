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

/** 美股盘前/盘后：盘前 04:00–09:30，盘后 16:00–20:00（America/New_York） */
function getUsExtendedKind(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type)?.value;
    const wd = get("weekday");
    if (wd === "Sat" || wd === "Sun") return false;
    let hour = Number(get("hour"));
    const minute = Number(get("minute"));
    if (Number.isNaN(hour) || Number.isNaN(minute)) return false;
    if (hour === 24) hour = 0;
    const mins = hour * 60 + minute;
    if (mins >= 4 * 60 && mins < 9 * 60 + 30) return "pre";
    if (mins >= 16 * 60 && mins < 20 * 60) return "post";
    return false;
  } catch (_) {
    return false;
  }
}

function classifyExtKind(info, key) {
  const s = String(info.tradeSection || info.tradeSectionCN || "").toUpperCase();
  if (s === "PRETR" || s.includes("PRE") || info.tradeSectionCN === "盘前" || key === "preMarketInfo") {
    return "pre";
  }
  if (s === "POSTR" || s.includes("POST") || info.tradeSectionCN === "盘后" || key === "postMarketInfo") {
    return "post";
  }
  if (s === "NIGHT" || s.includes("NIGHT") || info.tradeSectionCN === "夜盘" || key === "nightMarketInfo") {
    return "night";
  }
  return "";
}

/**
 * 按时段取盘前/盘后：盘前勿回退到昨盘后价。
 * 百度常在盘前仍保留 outMarketInfo=昨 POSTR，实时盘前在 preMarketInfo。
 */
function pickExtInfo(result) {
  if (!result) return null;
  const session = getUsExtendedKind();
  const rows = [];
  for (const key of ["outMarketInfo", "preMarketInfo", "postMarketInfo", "nightMarketInfo"]) {
    const info = result[key];
    if (!info || info.type === "" || info.price == null || info.price === "") continue;
    const price = Number(info.price);
    const preChange = parseSignedPct(info.ratio);
    if (!Number.isFinite(price) || preChange == null) continue;
    rows.push({
      key,
      extKind: classifyExtKind(info, key),
      ts: Number(info.timestamp || info.update_time || 0) || 0,
      name: result.basicinfos?.name || undefined,
      price,
      preChange,
      section: info.tradeSection || info.tradeSectionCN || key
    });
  }
  if (!rows.length) return null;

  const pick = (pred) => rows.find(pred) || null;
  let chosen = null;
  if (session === "pre") {
    // 盘前只取 PRE；不要用仍挂着的昨盘后 outMarketInfo
    chosen = pick((r) => r.extKind === "pre") || pick((r) => r.key === "preMarketInfo");
  } else if (session === "post") {
    chosen =
      pick((r) => r.extKind === "post") ||
      pick((r) => r.key === "postMarketInfo" || r.key === "outMarketInfo");
  } else {
    // 非延长时段：取 outMarketInfo，或时间戳最新的一条
    chosen = pick((r) => r.key === "outMarketInfo");
    if (!chosen) {
      chosen = rows.slice().sort((a, b) => b.ts - a.ts)[0];
    }
  }
  if (!chosen) return null;
  return {
    name: chosen.name,
    price: chosen.price,
    preChange: chosen.preChange,
    section: chosen.section
  };
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
      Referer: "https://gushitong.baidu.com/",
      Origin: "https://gushitong.baidu.com"
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
