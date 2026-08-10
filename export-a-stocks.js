/**
 * 导出全部 A 股列表为 CSV（东方财富 clist）
 * 用法: node export-a-stocks.js
 */
const https = require("https");
const fs = require("fs");
const path = require("path");

const UT = "fa5fd1943c7b386f172d6893dbfba10b";
// 深市主板 + 创业板 + 沪市主板 + 科创板 + 北交所
const FS = "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048";
const FIELDS = "f12,f13,f14";
const HOSTS = ["push2.eastmoney.com", "push2delay.eastmoney.com"];
const PAGE_SIZE = 100;

function fetchJson(host, urlPath) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        hostname: host,
        path: urlPath,
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
        timeout: 20000
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

async function fetchPage(pn) {
  const q = new URLSearchParams({
    pn: String(pn),
    pz: String(PAGE_SIZE),
    po: "1",
    np: "1",
    fltt: "2",
    invt: "2",
    fid: "f12",
    fs: FS,
    fields: FIELDS,
    ut: UT,
    _: String(Date.now())
  });
  const urlPath = "/api/qt/clist/get?" + q.toString();
  let lastErr;
  for (const host of HOSTS) {
    try {
      const json = await fetchJson(host, urlPath);
      if (json && json.data) return json;
      lastErr = new Error("invalid response from " + host);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function marketLabel(f13, code) {
  const m = Number(f13);
  const c = String(code || "");
  if (/^(920|43|83|87)/.test(c) || /^[48]\d{5}$/.test(c)) return "北交所";
  if (m === 1) {
    if (c.startsWith("68")) return "科创板";
    return "上交所";
  }
  if (c.startsWith("30")) return "创业板";
  return "深交所";
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  const all = [];
  const seen = new Set();
  let total = 0;

  for (let pn = 1; pn <= 100; pn++) {
    process.stdout.write("page " + pn + "... ");
    const json = await fetchPage(pn);
    total = Number(json.data.total) || total;
    const raw = json.data.diff;
    const page = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object"
        ? Object.values(raw)
        : [];
    console.log(page.length + " / total~" + total);
    if (!page.length) break;

    for (const item of page) {
      const code = String(item.f12 || "");
      if (!code || seen.has(code)) continue;
      seen.add(code);
      all.push({
        code,
        name: String(item.f14 || ""),
        market: Number(item.f13),
        exchange: marketLabel(item.f13, code)
      });
    }

    if (page.length < PAGE_SIZE || (total > 0 && all.length >= total)) break;
    await sleep(200);
  }

  all.sort((a, b) => a.code.localeCompare(b.code));

  const header = ["代码", "名称", "市场代码", "交易所"];
  const lines = [header.join(",")];
  for (const s of all) {
    lines.push(
      [
        csvEscape(s.code),
        csvEscape(s.name),
        csvEscape(s.market),
        csvEscape(s.exchange)
      ].join(",")
    );
  }

  const out = path.join(__dirname, "a股股票列表.csv");
  fs.writeFileSync(out, "\uFEFF" + lines.join("\n"), "utf8");
  console.log("Done:", all.length, "stocks ->", out);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
