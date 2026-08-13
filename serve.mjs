/**
 * 本地静态页服务 + 基金排行代理
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

const FUND_RANK_SC = {
  month: { sc: "1yzf", field: 8, label: "近1月" },
  "3m": { sc: "3yzf", field: 9, label: "近3月" },
  "6m": { sc: "6yzf", field: 10, label: "近6月" },
  "1y": { sc: "1nzf", field: 11, label: "近1年" }
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

function parseFundPct(raw) {
  if (raw == null || raw === "" || raw === "-" || raw === "--") return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : Math.round(n * 100) / 100;
}

const FUND_PERIOD_TITLES = {
  Z: "近1周",
  Y: "近1月",
  "3Y": "近3月",
  "6Y": "近6月",
  "1N": "近1年",
  "2Y": "近2年",
  "3N": "近3年",
  "5N": "近5年",
  JN: "今年来",
  LN: "成立来"
};

const MOB_DEVICE = "3EA024C2-7F22-408B-95E4-383D38160FB3";

function mobHeaders() {
  return {
    Referer: "https://fund.eastmoney.com/",
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 14_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    Accept: "application/json"
  };
}

function mobQuery(extra = {}) {
  return new URLSearchParams({
    plat: "Iphone",
    product: "EFund",
    version: "6.5.5",
    AppVersion: "6.5.5",
    deviceid: MOB_DEVICE,
    MobileKey: MOB_DEVICE,
    passportid: "0",
    OSVersion: "14.3",
    appType: "ttjj",
    userId: "",
    ...extra
  });
}

async function fetchMobJson(apiPath, extra = {}) {
  const url =
    "https://fundmobapi.eastmoney.com/FundMNewApi/" +
    apiPath +
    "?" +
    mobQuery(extra).toString();
  const resp = await fetch(url, { headers: mobHeaders() });
  if (!resp.ok) throw new Error(apiPath + " 请求失败（" + resp.status + "）");
  const json = await resp.json();
  if (json?.Success === false || (json?.ErrCode && Number(json.ErrCode) !== 0)) {
    throw new Error(json?.ErrMsg || json?.ErrorMessage || apiPath + " 暂不可用");
  }
  return json;
}

function mapBasic(data) {
  if (!data) return null;
  const nav = Number(data.DWJZ);
  const accNav = Number(data.LJJZ);
  const endNav = Number(data.ENDNAV);
  return {
    code: String(data.FCODE || ""),
    name: String(data.SHORTNAME || data.FCODE || ""),
    type: data.FTYPE || "",
    company: data.JJGS || "",
    theme: data.TTYPENAME || data.FBKINDEXNAME || "",
    establishDate: data.ESTABDATE || "",
    navDate: data.FSRQ || "",
    nav: Number.isNaN(nav) ? null : nav,
    accNav: Number.isNaN(accNav) ? null : accNav,
    dayChange: parseFundPct(data.RZDF),
    buyStatus: data.SGZT || "",
    redeemStatus: data.SHZT || "",
    riskLevel: data.RISKLEVEL || data.RLEVEL_SZ || "",
    bench: data.BENCH || "",
    scale:
      Number.isNaN(endNav) || endNav <= 0
        ? null
        : Math.round((endNav / 1e8) * 100) / 100,
    scaleDate: data.FEGMRQ || "",
    comment: data.COMMENTS || ""
  };
}

function mapPeriods(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const title = FUND_PERIOD_TITLES[row.title] || row.title || "";
      return {
        key: row.title || "",
        title,
        change: parseFundPct(row.syl),
        avg: parseFundPct(row.avg),
        hs300: parseFundPct(row.hs300),
        rank: row.rank && row.sc ? `${row.rank}/${row.sc}` : ""
      };
    })
    .filter((x) => x.title);
}

function mapNavHistory(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const nav = Number(row.DWJZ);
      const accNav = Number(row.LJJZ);
      return {
        date: row.FSRQ || "",
        nav: Number.isNaN(nav) ? null : nav,
        accNav: Number.isNaN(accNav) ? null : accNav,
        dayChange: parseFundPct(row.JZZZL)
      };
    })
    .filter((x) => x.date && x.nav != null);
}

async function handleFundDetail(url, res) {
  const code = String(url.searchParams.get("code") || "")
    .trim()
    .replace(/\D/g, "")
    .padStart(6, "0")
    .slice(-6);
  if (!/^\d{6}$/.test(code)) {
    send(
      res,
      400,
      { error: "无效的基金代码" },
      { "Content-Type": "application/json; charset=utf-8" }
    );
    return;
  }

  const navPages = Math.max(
    1,
    Math.min(5, Number(url.searchParams.get("navPages")) || 3)
  );
  const pageSize = 40;

  const [basicSettled, periodSettled, ...navSettled] =
    await Promise.allSettled([
      fetchMobJson("FundMNNBasicInformation", { FCODE: code }),
      fetchMobJson("FundMNPeriodIncrease", { FCODE: code }),
      ...Array.from({ length: navPages }, (_, i) =>
        fetchMobJson("FundMNHisNetList", {
          FCODE: code,
          pageIndex: String(i + 1),
          pageSize: String(pageSize)
        })
      )
    ]);

  if (basicSettled.status !== "fulfilled") {
    send(
      res,
      502,
      {
        error:
          basicSettled.reason?.message ||
          "基金详情加载失败，请稍后重试"
      },
      { "Content-Type": "application/json; charset=utf-8" }
    );
    return;
  }

  const basic = mapBasic(basicSettled.value?.Datas);
  const periods =
    periodSettled.status === "fulfilled"
      ? mapPeriods(periodSettled.value?.Datas)
      : [];

  const navRows = [];
  for (const settled of navSettled) {
    if (settled.status !== "fulfilled") continue;
    navRows.push(...(settled.value?.Datas || []));
  }
  const history = mapNavHistory(navRows);
  // 接口通常按日期倒序；图表需要正序
  const chart = history.slice().reverse();

  send(
    res,
    200,
    {
      code,
      basic,
      periods,
      history: history.slice(0, 30),
      chart,
      warnings: [
        periodSettled.status === "rejected"
          ? periodSettled.reason?.message
          : "",
        navSettled.every((s) => s.status === "rejected")
          ? "历史净值加载失败"
          : ""
      ].filter(Boolean)
    },
    { "Content-Type": "application/json; charset=utf-8" }
  );
}

async function handleFundRank(url, res) {
  const periodRaw = String(url.searchParams.get("period") || "month");
  const meta = FUND_RANK_SC[periodRaw] || FUND_RANK_SC.month;
  const period = FUND_RANK_SC[periodRaw] ? periodRaw : "month";
  const take = Math.max(
    1,
    Math.min(50, Number(url.searchParams.get("limit")) || 20)
  );

  const qs = new URLSearchParams({
    op: "ph",
    dt: "kf",
    ft: "all",
    rs: "",
    gs: "0",
    sc: meta.sc,
    st: "desc",
    sd: "",
    ed: "",
    qdii: "",
    tabSubtype: ",,,,,",
    pi: "1",
    pn: String(take),
    dx: "1",
    v: String(Math.random())
  });

  const upstream =
    "https://fund.eastmoney.com/data/rankhandler.aspx?" + qs.toString();
  const resp = await fetch(upstream, {
    headers: {
      Referer: "https://fund.eastmoney.com/data/fundranking.html",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "*/*"
    }
  });
  if (!resp.ok) {
    send(
      res,
      502,
      { error: "上游基金排行请求失败（" + resp.status + "）" },
      { "Content-Type": "application/json; charset=utf-8" }
    );
    return;
  }

  const text = await resp.text();
  const match = text.match(/var\s+rankData\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
  if (!match) {
    send(
      res,
      502,
      { error: "基金排行数据解析失败" },
      { "Content-Type": "application/json; charset=utf-8" }
    );
    return;
  }

  let pack;
  try {
    pack = Function('"use strict"; return (' + match[1] + ")")();
  } catch {
    send(
      res,
      502,
      { error: "基金排行数据格式异常" },
      { "Content-Type": "application/json; charset=utf-8" }
    );
    return;
  }

  const rows = Array.isArray(pack?.datas) ? pack.datas : [];
  const list = rows
    .map((row) => {
      const parts = String(row || "").split(",");
      if (parts.length < 9 || !parts[0]) return null;
      const change = parseFundPct(parts[meta.field]);
      if (change == null) return null;
      const nav = Number(parts[4]);
      return {
        code: String(parts[0]),
        name: String(parts[1] || parts[0]),
        date: parts[3] || "",
        nav: Number.isNaN(nav) ? null : nav,
        dayChange: parseFundPct(parts[6]),
        change,
        period,
        periodLabel: meta.label
      };
    })
    .filter(Boolean)
    .slice(0, take);

  send(
    res,
    200,
    {
      list,
      total: Number(pack.allRecords) || list.length,
      period,
      periodLabel: meta.label
    },
    { "Content-Type": "application/json; charset=utf-8" }
  );
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

    if (url.pathname === "/api/fund-rank") {
      if (req.method !== "GET") {
        send(res, 405, { error: "Method Not Allowed" }, {
          "Content-Type": "application/json; charset=utf-8"
        });
        return;
      }
      await handleFundRank(url, res);
      return;
    }

    if (url.pathname === "/api/fund-detail") {
      if (req.method !== "GET") {
        send(res, 405, { error: "Method Not Allowed" }, {
          "Content-Type": "application/json; charset=utf-8"
        });
        return;
      }
      await handleFundDetail(url, res);
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
