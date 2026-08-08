/**
 * 拉取美股盘前/盘后快照（百度股市通），供手机端等同域/raw 读取。
 * 用法：node scripts/fetch-us-premarket.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "us-premarket.json");

function collectUsCodes() {
  const raw = fs.readFileSync(path.join(ROOT, "data.js"), "utf8");
  const codes = new Set();
  const re =
    /code:\s*"([A-Za-z][A-Za-z0-9.-]*)"\s*,\s*market:\s*(105|106)/g;
  let m;
  while ((m = re.exec(raw))) codes.add(m[1].toUpperCase());
  return [...codes].sort();
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
function pickExt(result) {
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
      price,
      preChange,
      section: info.tradeSection || key
    });
  }
  if (!rows.length) return null;

  const pick = (pred) => rows.find(pred) || null;
  let chosen = null;
  if (session === "pre") {
    chosen = pick((r) => r.extKind === "pre") || pick((r) => r.key === "preMarketInfo");
  } else if (session === "post") {
    chosen =
      pick((r) => r.extKind === "post") ||
      pick((r) => r.key === "postMarketInfo" || r.key === "outMarketInfo");
  } else {
    chosen = pick((r) => r.key === "outMarketInfo");
    if (!chosen) chosen = rows.slice().sort((a, b) => b.ts - a.ts)[0];
  }
  if (!chosen) return null;
  return {
    price: chosen.price,
    preChange: chosen.preChange,
    section: chosen.section
  };
}

async function fetchOne(code) {
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
  if (!resp.ok) throw new Error("HTTP " + resp.status);
  const json = await resp.json();
  return pickExt(json?.Result);
}

async function main() {
  const codes = collectUsCodes();
  const quotes = {};
  const concurrency = 4;
  let cursor = 0;

  async function worker() {
    while (cursor < codes.length) {
      const code = codes[cursor++];
      try {
        const row = await fetchOne(code);
        if (row) quotes[code] = row;
      } catch (_) {
        // skip
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const payload = {
    updatedAt: new Date().toISOString(),
    count: Object.keys(quotes).length,
    quotes
  };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(
    `Wrote ${OUT} (${payload.count}/${codes.length} quotes) @ ${payload.updatedAt}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
