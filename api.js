/**
 * 行情 / 分时 / K 线接口封装
 *
 * 引用方式：
 *   <script src="api.js"></script>
 *   之后通过 window.MarketAPI 调用
 *
 * 数据源：后端第三方行情服务（东财优先，失败回退新浪等由服务端处理）
 *
 * holding 约定（与 data.js 一致）：
 *   { name, code, market?, ratio? }
 *   market 为东方财富 secid 前缀：
 *     0=深交所 / 北交所, 1=上交所, 105=纳斯达克, 106=纽交所,
 *     116=港股, 176=日股, 177=韩股
 */
(function (global) {
  "use strict";

  /** 后端服务基址 */
  const API_BASE = "https://stock-backdev-production.up.railway.app";

  /** 涨跌幅等保留两位小数 */
  function round2(n) {
    return Math.round(Number(n) * 100) / 100;
  }

  function buildQuery(params) {
    const parts = [];
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v == null || v === "") return;
      parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(v)));
    });
    return parts.length ? "?" + parts.join("&") : "";
  }

  /**
   * 统一请求后端；成功时返回 body.data（若无 data 则返回整包 JSON）
   * @param {string} path 如 /api/third-party/quotes
   * @param {{ method?: string, params?: Object, body?: any }} [opts]
   */
  async function apiRequest(path, opts) {
    const method = (opts && opts.method) || "GET";
    const params = (opts && opts.params) || null;
    const body = opts && opts.body;
    const url = API_BASE + path + buildQuery(params);
    const headers = { Accept: "application/json" };
    const init = { method, headers };

    if (body != null) {
      headers["Content-Type"] = "application/json";
      init.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    let resp;
    try {
      resp = await fetch(url, init);
    } catch (err) {
      throw new Error(err && err.message ? err.message : "网络请求失败");
    }

    let json = null;
    const text = await resp.text();
    try {
      json = text ? JSON.parse(text) : null;
    } catch (_) {
      json = null;
    }

    if (!resp.ok) {
      throw new Error(
        (json && json.message) || "请求失败（" + resp.status + "）"
      );
    }
    if (json && typeof json === "object" && json.code != null && json.code !== 200) {
      throw new Error(json.message || "请求失败");
    }
    if (json && typeof json === "object" && "data" in json) return json.data;
    return json;
  }

  function holdingParams(holding) {
    const params = { code: holding.code };
    if (holding.market != null && holding.market !== "") {
      params.market = holding.market;
    }
    if (holding.name) params.name = holding.name;
    return params;
  }

  // ---------------------------------------------------------------------------
  // 代码转换（构建 holdings / 前端判断用）
  // ---------------------------------------------------------------------------

  /** 北交所：920 新代码；以及历史 43/83/87、部分 4/8 开头 */
  function isBjCode(code) {
    return /^(920\d{3}|(43|83|87)\d{4}|[48]\d{5})$/.test(code);
  }

  /**
   * 解析 A 股交易所：bj / sh / sz（北交所优先于沪市 9xxxx）
   */
  function resolveCnExchange(code) {
    if (isBjCode(code)) return "bj";
    if (
      /^(60|68|90)\d{4}$/.test(code) ||
      /^6\d{5}$/.test(code) ||
      /^9\d{5}$/.test(code)
    ) {
      return "sh";
    }
    if (/^(00|30)\d{4}$/.test(code) || /^(0|2|3)\d{5}$/.test(code)) {
      return "sz";
    }
    return "sh";
  }

  /**
   * 转为新浪行情代码
   * - 美股：gb_nvda
   * - A 股：sh600519 / sz000001 / bj920001
   */
  function toSinaSymbol(holding) {
    const code = holding.code;
    if (
      holding.market === 105 ||
      holding.market === 106 ||
      /[A-Za-z]/.test(code)
    ) {
      return "gb_" + code.toLowerCase();
    }
    return resolveCnExchange(code) + code;
  }

  /**
   * 转为东方财富 secid：`{市场}.{代码}`
   * 优先用 holding.market；否则按 A 股代码规则推断
   */
  function toEastSecId(holding) {
    if (holding.market != null) return holding.market + "." + holding.code;
    const ex = resolveCnExchange(holding.code);
    return (ex === "sh" ? "1" : "0") + "." + holding.code;
  }

  /** 是否按美股逻辑处理（含字母代码） */
  function isUsHolding(holding) {
    return (
      holding.market === 105 ||
      holding.market === 106 ||
      /[A-Za-z]/.test(holding.code)
    );
  }

  /** 报价 map 的统一 key（美股代码大小写不一致时用） */
  function quoteKey(code) {
    return String(code).toUpperCase();
  }

  /** 市场归类：CN / US / HK / JP / KR */
  function getMarketKind(holding) {
    const m = Number(holding.market);
    if (m === 105 || m === 106) return "US";
    if (m === 116) return "HK";
    if (m === 176) return "JP";
    if (m === 177) return "KR";
    if (m === 0 || m === 1) return "CN";
    if (/[A-Za-z]/.test(String(holding.code || ""))) return "US";
    return "CN";
  }

  // ---------------------------------------------------------------------------
  // 连通性探测
  // ---------------------------------------------------------------------------

  /**
   * 探测后端连通性：GET /api/users
   */
  async function fetchUsers() {
    const url = `${API_BASE}/api/users`;
    console.log("[API] fetchUsers 请求:", url);
    try {
      const resp = await fetch(url, {
        headers: { Accept: "application/json" }
      });
      console.log("[API] fetchUsers 状态:", resp.status, resp.statusText);
      const text = await resp.text();
      let data = text;
      try {
        data = JSON.parse(text);
      } catch (_) {
        /* 非 JSON 时保留原文 */
      }
      console.log("[API] fetchUsers 响应:", data);
      return data;
    } catch (err) {
      console.error("[API] fetchUsers 失败（可能跨域或服务不可达）:", err);
      throw err;
    }
  }

  // 页面加载时探测一次后端连通性，便于在控制台查看
  fetchUsers().catch(() => {});

  // ---------------------------------------------------------------------------
  // 行情请求（走后端 /api/third-party/*）
  // ---------------------------------------------------------------------------

  /**
   * 统一实时报价
   * GET/POST /api/third-party/quotes
   *
   * @param {Array} holdings
   * @returns {Promise<Object>} code -> { name, price, change }
   */
  async function loadQuotes(holdings) {
    if (!holdings.length) return {};
    const data = await apiRequest("/api/third-party/quotes", {
      method: "POST",
      body: { holdings }
    });
    return data && typeof data === "object" ? data : {};
  }

  /**
   * 总市值 / 流通市值
   * GET /api/third-party/market-cap?code=&market=
   *
   * @returns {Promise<{ total: number|null, float: number|null, name: string|null }>}
   */
  async function loadStockMarketCap(holding) {
    return apiRequest("/api/third-party/market-cap", {
      params: holdingParams(holding)
    });
  }

  /**
   * 个股资料：市值 + 近年营收/利润/负债率 + 十大股东
   * GET /api/third-party/profile?code=&market=
   */
  async function loadStockProfile(holding) {
    return apiRequest("/api/third-party/profile", {
      params: holdingParams(holding)
    });
  }

  /**
   * 当日分时
   * GET /api/third-party/intraday?code=&market=
   *
   * @returns {Promise<{ name, code, preClose, points }>}
   *   points: [{ datetime, time, price, avg, volume }]
   */
  async function loadIntradayTrends(holding) {
    return apiRequest("/api/third-party/intraday", {
      params: holdingParams(holding)
    });
  }

  /**
   * 日 K 线（前复权）
   * GET /api/third-party/klines?code=&market=&withReturns=1&range=1y
   *
   * @param {Object} holding
   * @param {{ withReturns?: boolean, range?: string }} [opts]
   * @returns {Promise<{ name, code, klines, returns? }>}
   *   klines: [{ date, close, volume }] 升序
   */
  async function loadDailyKlines(holding, opts) {
    const params = holdingParams(holding);
    if (opts && opts.withReturns) params.withReturns = 1;
    if (opts && opts.range) params.range = opts.range;
    return apiRequest("/api/third-party/klines", { params });
  }

  /**
   * 根据代码解析股票（名称 + 市场），用于添加自选
   * GET /api/third-party/resolve?code=&marketType=CN|US
   *
   * @param {string} rawCode
   * @param {'CN'|'US'} marketType
   * @returns {Promise<{ name, code, market, ratio }>}
   */
  async function resolveStock(rawCode, marketType) {
    if (!String(rawCode || "").trim()) throw new Error("请输入股票代码");
    return apiRequest("/api/third-party/resolve", {
      params: {
        code: String(rawCode).trim(),
        marketType: marketType === "US" ? "US" : "CN"
      }
    });
  }

  /**
   * A 股行业板块涨跌幅列表（后端已归并）
   * GET /api/third-party/cn/sectors
   */
  async function loadCnSectorBoards() {
    const data = await apiRequest("/api/third-party/cn/sectors");
    return Array.isArray(data) ? data : [];
  }

  /**
   * A 股板块成分股涨幅 / 跌幅榜
   * GET /api/third-party/cn/sector-stocks?board=&limit=&kind=
   *
   * @param {string|string[]} boardCodeOrCodes 如 BK1625
   * @param {number} [limit=20]
   * @param {"gainers"|"losers"} [kind="gainers"]
   */
  async function loadCnSectorStocks(boardCodeOrCodes, limit = 20, kind = "gainers") {
    const board = (Array.isArray(boardCodeOrCodes)
      ? boardCodeOrCodes
      : String(boardCodeOrCodes || "").split(",")
    )
      .map((c) => String(c || "").trim().toUpperCase())
      .filter(Boolean)
      .join(",");

    if (!board) throw new Error("缺少板块代码");

    const data = await apiRequest("/api/third-party/cn/sector-stocks", {
      params: {
        board,
        limit: Math.max(1, Math.min(50, Number(limit) || 20)),
        kind: kind === "losers" ? "losers" : "gainers"
      }
    });
    return Array.isArray(data) ? data : [];
  }

  /**
   * A 股主要市场指数
   * GET /api/third-party/cn/indices
   */
  async function loadCnIndices() {
    const data = await apiRequest("/api/third-party/cn/indices");
    return Array.isArray(data) ? data : [];
  }

  /**
   * 美股三大指数：道琼斯 / 纳斯达克 / 标普500
   * GET /api/third-party/us/indices
   */
  async function loadUsIndices() {
    const data = await apiRequest("/api/third-party/us/indices");
    return Array.isArray(data) ? data : [];
  }

  /**
   * 美股主要行业板块
   * GET /api/third-party/us/sectors
   */
  async function loadUsSectorBoards() {
    const data = await apiRequest("/api/third-party/us/sectors");
    return Array.isArray(data) ? data : [];
  }

  /**
   * 美股涨幅榜 / 跌幅榜
   * GET /api/third-party/us/rank?kind=&limit=
   *
   * @param {"gainers"|"losers"} kind
   * @param {number} [limit=20]
   */
  async function loadUsStockRank(kind = "gainers", limit = 20) {
    const data = await apiRequest("/api/third-party/us/rank", {
      params: {
        kind: kind === "losers" ? "losers" : "gainers",
        limit: Number(limit) || 20
      }
    });
    return Array.isArray(data) ? data : [];
  }

  // ---------------------------------------------------------------------------
  // 基于日 K 的区间涨跌幅工具（非 HTTP，供弹窗区间展示使用）
  // ---------------------------------------------------------------------------

  function parseDate(str) {
    const parts = String(str).split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function toDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function addMonths(date, months) {
    const d = new Date(date.getTime());
    d.setMonth(d.getMonth() + months);
    return d;
  }

  /** 在升序 klines 中取 date <= targetStr 的最后一根 */
  function findKlineOnOrBefore(klines, targetStr) {
    let best = null;
    for (let i = 0; i < klines.length; i++) {
      if (klines[i].date <= targetStr) best = klines[i];
      else break;
    }
    return best;
  }

  function calcReturnFromBase(last, base) {
    if (!last || !base || !base.close) return null;
    return round2(((last.close - base.close) / base.close) * 100);
  }

  /** 区间起点日期字符串；无法识别的 range 返回 null */
  function rangeStartDate(lastDateStr, range) {
    if (range === "ytd") return `${String(lastDateStr).slice(0, 4)}-01-01`;
    const months = { "1m": -1, "3m": -3, "6m": -6, "1y": -12 }[range];
    if (months == null) return null;
    return toDateStr(addMonths(parseDate(lastDateStr), months));
  }

  /**
   * 根据日 K 计算区间涨跌幅（%）
   * @returns {{ day, '1m', '3m', '6m', ytd, '1y' }} 值为 number | null
   *   day 需由调用方用分时昨收另行填入
   */
  function calcPeriodReturns(klines) {
    const empty = {
      day: null,
      "1m": null,
      "3m": null,
      "6m": null,
      ytd: null,
      "1y": null
    };
    if (!klines?.length) return empty;

    const last = klines[klines.length - 1];
    const result = { ...empty };

    ["1m", "3m", "6m", "1y"].forEach((key) => {
      const target = rangeStartDate(last.date, key);
      const base = findKlineOnOrBefore(klines, target) || klines[0];
      result[key] = calcReturnFromBase(last, base);
    });

    const ytdStart = rangeStartDate(last.date, "ytd");
    let ytdBase = findKlineOnOrBefore(klines, ytdStart);
    if (!ytdBase) {
      ytdBase = klines.find((k) => k.date >= ytdStart) || klines[0];
    }
    result.ytd = calcReturnFromBase(last, ytdBase);

    return result;
  }

  /**
   * 截取某区间的日 K（含起点那根）
   * @param {'1m'|'3m'|'6m'|'ytd'|'1y'} range
   */
  function sliceKlinesForRange(klines, range) {
    if (!klines?.length) return [];
    const last = klines[klines.length - 1];
    const targetStr = rangeStartDate(last.date, range);
    if (!targetStr) return klines.slice();

    let startIdx = 0;
    for (let i = 0; i < klines.length; i++) {
      if (klines[i].date <= targetStr) startIdx = i;
      else break;
    }
    return klines.slice(startIdx);
  }

  global.MarketAPI = {
    // 工具
    quoteKey,
    toEastSecId,
    toSinaSymbol,
    isUsHolding,
    getMarketKind,
    API_BASE,
    // 请求
    fetchUsers,
    loadQuotes,
    loadIntradayTrends,
    loadDailyKlines,
    loadStockMarketCap,
    loadStockProfile,
    loadCnSectorBoards,
    loadCnSectorStocks,
    loadCnIndices,
    loadUsIndices,
    loadUsSectorBoards,
    loadUsStockRank,
    resolveStock,
    // 区间计算
    calcPeriodReturns,
    sliceKlinesForRange
  };
})(window);
