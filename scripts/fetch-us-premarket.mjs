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

function pickExt(result) {
  if (!result) return null;
  for (const key of ["outMarketInfo", "preMarketInfo", "postMarketInfo"]) {
    const info = result[key];
    if (!info || info.type === "" || info.price == null || info.price === "") continue;
    const price = Number(info.price);
    const preChange = parseSignedPct(info.ratio);
    if (!Number.isFinite(price) || preChange == null) continue;
    return {
      price,
      preChange,
      section: info.tradeSection || key
    };
  }
  return null;
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
      Referer: "https://gushitong.baidu.com/"
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
