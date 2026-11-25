/**
 * 行情数据适配层
 * 复用仓库中已有的 api.js / watchlist-api.js（window.MarketAPI / window.WatchlistAPI），
 * 对外提供 React 侧使用的类型化封装与格式化函数。
 */

export const MARKET_CONFIG = {
  cn: {
    id: "cn",
    key: "market:cn",
    label: "A股",
    short: "CN",
    name: "A股 CN",
    marketKind: "CN",
    marketCode: 1,
    watchType: 1,
    pricePrefix: "",
    currency: "CNY",
    rank: "cn",
    color: "#ff6b6b"
  },
  us: {
    id: "us",
    key: "market:us",
    label: "美股",
    short: "US",
    name: "美股 US",
    marketKind: "US",
    marketCode: 105,
    watchType: 2,
    pricePrefix: "$",
    currency: "USD",
    rank: "us",
    color: "#4c9dff"
  },
  hk: {
    id: "hk",
    key: "market:hk",
    label: "港股",
    short: "HK",
    name: "港股 HK",
    marketKind: "HK",
    marketCode: 116,
    watchType: 3,
    pricePrefix: "HK$",
    currency: "HKD",
    rank: "hk",
    color: "#f59e0b"
  },
  jp: {
    id: "jp",
    key: "market:jp",
    label: "日股",
    short: "JP",
    name: "日股 JP",
    marketKind: "JP",
    marketCode: 176,
    watchType: 5,
    pricePrefix: "¥",
    currency: "JPY",
    rank: "jp",
    color: "#a78bfa"
  },
  kr: {
    id: "kr",
    key: "market:kr",
    label: "韩股",
    short: "KR",
    name: "韩股 KR",
    marketKind: "KR",
    marketCode: 177,
    watchType: 4,
    pricePrefix: "₩",
    currency: "KRW",
    rank: "kr",
    color: "#22c55e"
  }
};

export const MARKET_LIST = Object.values(MARKET_CONFIG);

export const WATCH_TYPES = [
  { type: 1, label: "A股", market: "cn", pricePrefix: "" },
  { type: 2, label: "美股", market: "us", pricePrefix: "$" },
  { type: 3, label: "港股", market: "hk", pricePrefix: "HK$" },
  { type: 5, label: "日股", market: "jp", pricePrefix: "¥" },
  { type: 4, label: "韩股", market: "kr", pricePrefix: "₩" }
];

export const BOND_KINDS = [
  { id: "treasury", label: "国债" },
  { id: "local", label: "地方债" },
  { id: "credit", label: "企业债" },
  { id: "convertible", label: "可转债" }
];

export const METAL_KINDS = [
  { id: "spotIntl", label: "国际现货" },
  { id: "futuresIntl", label: "国际期货" },
  { id: "sge", label: "上金所" },
  { id: "shfe", label: "沪金沪银" }
];

export const OIL_KINDS = [
  { id: "intl", label: "国际原油" },
  { id: "ine", label: "上期能源" }
];

export const FED_KINDS = [
  { id: "overview", label: "利率概览" },
  { id: "treasury", label: "美债收益率" },
  { id: "history", label: "EFFR 历史" }
];

export const FUND_PERIODS = [
  { id: "month", label: "近1月" },
  { id: "3m", label: "近3月" },
  { id: "6m", label: "近半年" },
  { id: "1y", label: "近1年" }
];

export function marketApi() {
  const api = window.MarketAPI;
  if (!api) throw new Error("行情接口尚未加载");
  return api;
}

export function watchApi() {
  const api = window.WatchlistAPI;
  if (!api) throw new Error("自选接口尚未加载");
  return api;
}

export function user() {
  return watchApi().getAuthUser();
}

export function isLoggedIn() {
  return !!watchApi().getUserId();
}

/* ------------------------------------------------------------------ */
/* 格式化                                                              */
/* ------------------------------------------------------------------ */

export function isNum(v) {
  return v != null && v !== "" && !Number.isNaN(Number(v));
}

export function formatPct(n, digits = 2) {
  if (!isNum(n)) return "--";
  const x = Number(n);
  return (x > 0 ? "+" : "") + x.toFixed(digits) + "%";
}

export function formatPrice(n, prefix = "") {
  if (!isNum(n)) return "--";
  const x = Number(n);
  const abs = Math.abs(x);
  let text;
  if (abs >= 10000) text = x.toFixed(0);
  else if (abs >= 1000) text = x.toFixed(1);
  else if (abs >= 100) text = x.toFixed(2);
  else text = x.toFixed(2);
  return prefix + text;
}

export function formatPrecisePrice(n, digits = 3) {
  if (!isNum(n)) return "--";
  const x = Number(n);
  const abs = Math.abs(x);
  if (abs >= 100000) return x.toFixed(0);
  if (abs >= 10000) return x.toFixed(2);
  if (abs >= 1000) return x.toFixed(1);
  if (abs >= 100) return x.toFixed(2);
  if (abs >= 1) return x.toFixed(digits);
  return x.toFixed(4);
}

export function formatSigned(n, digits = 2) {
  if (!isNum(n)) return "--";
  const x = Number(n);
  return (x > 0 ? "+" : "") + x.toFixed(digits);
}

export function formatVolume(n) {
  if (!isNum(n)) return "--";
  const x = Number(n);
  const abs = Math.abs(x);
  const sign = x < 0 ? "-" : "";
  if (abs >= 1e8) return sign + (abs / 1e8).toFixed(2) + "亿";
  if (abs >= 1e4) return sign + (abs / 1e4).toFixed(2) + "万";
  return sign + Math.round(abs);
}

export function formatMarketCap(n) {
  if (!isNum(n)) return "--";
  const x = Number(n);
  const abs = Math.abs(x);
  const sign = x < 0 ? "-" : "";
  if (abs >= 1e12) return sign + (abs / 1e12).toFixed(2) + "万亿";
  if (abs >= 1e8) return sign + (abs / 1e8).toFixed(2) + "亿";
  if (abs >= 1e4) return sign + (abs / 1e4).toFixed(2) + "万";
  return sign + abs.toFixed(0);
}

export function formatCryptoPrice(n) {
  if (!isNum(n)) return "--";
  const x = Number(n);
  const abs = Math.abs(x);
  if (abs >= 1000) return x.toFixed(2);
  if (abs >= 1) return x.toFixed(2);
  if (abs >= 0.1) return x.toFixed(4);
  if (abs >= 0.01) return x.toFixed(4);
  if (abs >= 0.0001) return x.toFixed(6);
  return Number(x).toPrecision(4);
}

export function formatCryptoSigned(n) {
  if (!isNum(n)) return "--";
  const x = Number(n);
  return (x > 0 ? "+" : x < 0 ? "-" : "") + formatCryptoPrice(Math.abs(x));
}

export function toneOf(n) {
  if (!isNum(n)) return "flat";
  const x = Number(n);
  if (x > 0) return "up";
  if (x < 0) return "down";
  return "flat";
}

export function toneColor(n) {
  const tone = toneOf(n);
  if (tone === "up") return "var(--up)";
  if (tone === "down") return "var(--down)";
  return "var(--flat)";
}

export function formatDateTime(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/* ------------------------------------------------------------------ */
/* 行情                                                                */
/* ------------------------------------------------------------------ */

const RANK_LOADERS = {
  cn: (kind, limit, page) => marketApi().loadCnStockRank(kind, limit, page),
  us: (kind, limit, page) => marketApi().loadUsStockRank(kind, limit, page),
  hk: (kind, limit, page) => marketApi().loadHkStockRank(kind, limit, page),
  jp: (kind, limit, page) => marketApi().loadJpStockRank(kind, limit, page),
  kr: (kind, limit, page) => marketApi().loadKrStockRank(kind, limit, page)
};

export async function fetchRank(marketId, kind = "gainers", limit = 20, page = 1) {
  const loader = RANK_LOADERS[marketId];
  if (!loader) throw new Error("未知市场");
  const cfg = MARKET_CONFIG[marketId] || MARKET_CONFIG.cn;
  const result = await loader(kind, limit, page);
  const rows = (result?.list || []).map((item) => ({
    ...item,
    changeAmt:
      item.changeAmt != null
        ? item.changeAmt
        : item.price != null && item.change != null
          ? (item.price * item.change) / (100 + item.change)
          : null
  }));

  // 批量补全成交额 / 换手 / 市值等富字段（东财 ulist 一次请求）
  let details = {};
  try {
    details = await marketApi().loadQuoteDetails(
      rows.map((row) => ({ code: row.code, market: row.market ?? cfg.marketCode }))
    );
  } catch {
    details = {};
  }

  const list = rows.map((row) => {
    const d = details[String(row.code).toUpperCase()] || {};
    const merged = { ...row };
    Object.keys(d).forEach((key) => {
      if (d[key] != null && merged[key] == null) merged[key] = d[key];
    });
    return merged;
  });

  return {
    list,
    total: Number(result?.total) || (result?.list || []).length
  };
}

const intradayCache = new Map();
const intradayInflight = new Map();

export function intradayKey(holding) {
  return `${holding?.market ?? ""}:${String(holding?.code || "").toUpperCase()}`;
}

export function clearIntradayCache() {
  intradayCache.clear();
  intradayInflight.clear();
}

/**
 * 分时走势：同一代码只请求一次，失败也缓存避免列表内反复重试。
 */
export function loadIntradayCached(holding) {
  const key = intradayKey(holding);
  if (!key || key === ":") return Promise.resolve(null);
  if (intradayCache.has(key)) return intradayCache.get(key);
  if (intradayInflight.has(key)) return intradayInflight.get(key);

  const task = marketApi()
    .loadIntradayTrends(holding)
    .catch(() => null)
    .then((data) => {
      intradayCache.set(key, data);
      intradayInflight.delete(key);
      return data;
    });
  intradayInflight.set(key, task);
  return task;
}

export async function loadWatchlistQuotes(type) {
  const rows = await watchApi().listWatchStocks(type);
  if (!rows.length) return [];
  return watchApi().loadWatchQuotes(rows, type);
}

export async function addWatch(code, type, name) {
  return watchApi().addWatchStock(code, type, name);
}

export async function removeWatch(code) {
  return watchApi().removeWatchStock(code);
}

export async function loadFocusFunds() {
  const rows = await watchApi().listFocusFunds();
  if (!rows.length) return [];
  const quotes = await marketApi().loadFundQuotes(rows.map((r) => r.code));
  return rows.map((row) => {
    const q = quotes[row.code] || {};
    return {
      code: row.code,
      name: q.name || row.code,
      nav: q.nav ?? null,
      dayChange: q.dayChange ?? null,
      date: q.date || "",
      createdAt: row.createdAt
    };
  });
}

export async function removeFocusFund(code) {
  return watchApi().removeFocusFund(code);
}

export async function addFocusFund(code) {
  return watchApi().addFocusFund(code);
}

export async function searchStocks(keyword, marketId = "cn") {
  const cfg = MARKET_CONFIG[marketId] || MARKET_CONFIG.cn;
  return marketApi().searchStockList(keyword, cfg.marketKind);
}

export async function searchFunds(keyword) {
  return marketApi().searchFundList(keyword);
}

export function watchMetaOfType(type) {
  return WATCH_TYPES.find((m) => m.type === Number(type)) || WATCH_TYPES[0];
}

export function watchMetaOfMarket(marketId) {
  const cfg = MARKET_CONFIG[marketId];
  return WATCH_TYPES.find((m) => m.type === cfg?.watchType) || WATCH_TYPES[0];
}

/** 将表格行转换为行情接口需要的 holding */
export function holdingOfRow(row, marketId, extra = {}) {
  const cfg = MARKET_CONFIG[marketId] || {};
  return {
    name: row?.name || row?.code || "",
    code: row?.code || "",
    market: row?.market != null ? row.market : cfg.marketCode,
    ...extra
  };
}