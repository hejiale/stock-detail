/**
 * 自选个股 / 自选基金（本地存储）
 *
 * 引用方式：
 *   <script src="api.js"></script>
 *   <script src="watchlist-api.js"></script>
 *   之后通过 window.WatchlistAPI 调用
 *
 * 依赖：window.MarketAPI（代码规范化、报价）
 *
 * 数据源：
 *   自选个股 / 自选基金：localStorage（参考 go-stock-dev 的本地数据查询）
 *   type：1 A股 / 2 美股 / 3 港股 / 4 韩股 / 5 日股
 */
(function (global) {
  "use strict";

  const LOCAL_WATCH_STOCKS_KEY = "local_watch_stocks_v1";
  const LOCAL_FOCUS_FUNDS_KEY = "local_focus_funds_v1";
  const VALID_WATCH_TYPES = [1, 2, 3, 4, 5];

  function market() {
    const api = global.MarketAPI;
    if (!api) throw new Error("MarketAPI 未加载，请先引入 api.js");
    return api;
  }

  function normalizeWatchType(type) {
    const n = Number(type);
    return VALID_WATCH_TYPES.includes(n) ? n : 1;
  }

  /**
   * 自选 type → 行情 holding 骨架（name 可后续用报价补齐）
   * @param {string} code
   * @param {number} type
   */
  function holdingFromWatchType(code, type) {
    const m = market();
    const t = normalizeWatchType(type);
    if (t === 1) {
      const c = m.normalizeCnCode(code);
      return {
        code: c,
        market: m.inferCnMarketCandidates(c)[0],
        name: c,
        watchType: t,
      };
    }
    if (t === 2) {
      const c = String(code || "")
        .trim()
        .toUpperCase();
      return { code: c, market: 105, name: c, watchType: t };
    }
    if (t === 3) {
      const c = m.normalizeHkCode(code);
      return { code: c, market: 116, name: c, watchType: t };
    }
    if (t === 4) {
      const c = m.normalizeKrCode(code);
      return { code: c, market: 177, name: c, watchType: t };
    }
    const c = m.normalizeJpCode(code);
    return { code: c, market: 176, name: c, watchType: t };
  }

  /** 本地自选股票原始记录 */
  function getLocalWatchStocks() {
    try {
      const raw = localStorage.getItem(LOCAL_WATCH_STOCKS_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function saveLocalWatchStocks(list) {
    localStorage.setItem(LOCAL_WATCH_STOCKS_KEY, JSON.stringify(list));
  }

  /** 本地自选股票代码比较 key（与列表去重保持一致） */
  function watchStockCodeKey(code) {
    return String(code || "").trim().toUpperCase();
  }

  /** 新增自选股票（本地存储） */
  async function addWatchStock(code, type, name) {
    const t = normalizeWatchType(type);
    const holding = holdingFromWatchType(code, t);
    if (!holding.code) throw new Error("股票代码无效");
    const displayName = String(name || "").trim() || holding.name;

    const rows = getLocalWatchStocks();
    const key = watchStockCodeKey(holding.code);
    const exists = rows.find(
      (row) =>
        watchStockCodeKey(row?.code) === key &&
        normalizeWatchType(row?.type) === t,
    );
    if (exists) {
      return {
        code: exists.code,
        name: exists.name || displayName,
        tag: exists.tag || null,
        type: t,
        created_at: exists.created_at || exists.createdAt || null,
      };
    }

    const row = {
      code: holding.code,
      name: displayName,
      tag: null,
      type: t,
      created_at: new Date().toISOString(),
    };
    rows.push(row);
    saveLocalWatchStocks(rows);
    return { ...row };
  }

  /** 自选股票列表（本地存储，按 type 过滤） */
  async function listWatchStocks(type) {
    const t = normalizeWatchType(type);
    const { quoteKey } = market();
    const seen = new Set();
    return getLocalWatchStocks()
      .map((row) => {
        const code = String(row?.code || "").trim();
        if (!code) return null;
        const rowType = normalizeWatchType(row.type != null ? row.type : t);
        if (rowType !== t) return null;
        const key = quoteKey(code);
        if (seen.has(key)) return null;
        seen.add(key);
        return {
          code,
          name: row.name || null,
          tag: row.tag || null,
          type: rowType,
        };
      })
      .filter(Boolean);
  }

  function normalizeFocusFundCode(code) {
    const raw = String(code || "")
      .trim()
      .replace(/\D/g, "");
    if (!raw) return "";
    return raw.padStart(6, "0").slice(-6);
  }

  /** 从本地存储获取自选基金列表 */
  function getLocalFocusFunds() {
    try {
      const raw = localStorage.getItem(LOCAL_FOCUS_FUNDS_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  /** 保存自选基金列表到本地存储 */
  function saveLocalFocusFunds(funds) {
    localStorage.setItem(LOCAL_FOCUS_FUNDS_KEY, JSON.stringify(funds));
  }

  /** 初始化本地自选基金数据 */
  function initLocalFocusFunds() {
    const existing = getLocalFocusFunds();
    if (existing.length > 0) return;

    const defaultFunds = [
      { code: "022184", created_at: "2026-08-13T02:21:47.000Z" },
      { code: "008254", created_at: "2026-08-13T02:21:40.000Z" },
      { code: "018147", created_at: "2026-08-13T02:21:32.000Z" },
      { code: "021277", created_at: "2026-08-13T02:21:24.000Z" },
      { code: "024239", created_at: "2026-08-13T02:21:15.000Z" },
      { code: "017811", created_at: "2026-08-13T02:19:50.000Z" },
      { code: "006962", created_at: "2026-08-13T02:19:50.000Z" },
    ];
    saveLocalFocusFunds(defaultFunds);
  }

  /** 获取自选基金列表（本地存储） */
  async function listFocusFunds() {
    initLocalFocusFunds();
    const rows = getLocalFocusFunds();
    const seen = new Set();
    return rows
      .map((row) => {
        const code = normalizeFocusFundCode(row?.code);
        if (!code || seen.has(code)) return null;
        seen.add(code);
        return {
          code,
          createdAt: row.created_at || row.createdAt || null,
        };
      })
      .filter(Boolean);
  }

  /** 新增自选基金（本地存储） */
  async function addFocusFund(code) {
    const fundCode = normalizeFocusFundCode(code);
    if (!fundCode) throw new Error("基金代码无效");

    const funds = getLocalFocusFunds();
    const exists = funds.some(
      (f) => normalizeFocusFundCode(f.code) === fundCode,
    );
    if (exists) {
      throw new Error("已在关注");
    }

    const newFund = {
      code: fundCode,
      created_at: new Date().toISOString(),
    };
    funds.push(newFund);
    saveLocalFocusFunds(funds);

    return { code: fundCode, created_at: newFund.created_at };
  }

  /** 删除自选基金（本地存储） */
  async function removeFocusFund(code) {
    const fundCode = normalizeFocusFundCode(code);
    if (!fundCode) throw new Error("缺少基金代码");

    const funds = getLocalFocusFunds();
    const filtered = funds.filter(
      (f) => normalizeFocusFundCode(f.code) !== fundCode,
    );
    saveLocalFocusFunds(filtered);

    return true;
  }

  /** 删除自选股票（本地存储） */
  async function removeWatchStock(code) {
    const raw = String(code || "").trim();
    if (!raw) throw new Error("缺少股票代码");

    const key = watchStockCodeKey(raw);
    const filtered = getLocalWatchStocks().filter(
      (row) => watchStockCodeKey(row?.code) !== key,
    );
    saveLocalWatchStocks(filtered);

    return true;
  }

  /**
   * 自选列表 → 带行情的 holdings（按 code 拉三方报价）
   * @param {Array<{code,name?,type?}>} items
   * @param {number} type
   */
  async function loadWatchQuotes(items, type) {
    const m = market();
    const t = normalizeWatchType(type);
    const stubs = (items || []).map((item) =>
      holdingFromWatchType(item.code, item.type != null ? item.type : t),
    );
    if (!stubs.length) return [];

    let quotes = await m.loadQuotes(stubs);

    if (t === 2) {
      const missing = stubs.filter((h) => {
        const q = quotes[m.quoteKey(h.code)] || quotes[h.code];
        return !q || !q.name;
      });
      if (missing.length) {
        const alt = missing.map((h) => ({ ...h, market: 106 }));
        const more = await m.loadQuotes(alt);
        quotes = { ...quotes, ...more };
        alt.forEach((h) => {
          const q = more[m.quoteKey(h.code)] || more[h.code];
          if (q) {
            const stub = stubs.find(
              (s) => m.quoteKey(s.code) === m.quoteKey(h.code),
            );
            if (stub) stub.market = 106;
          }
        });
      }
    }

    if (t === 1) {
      const missing = stubs.filter((h) => {
        const q = quotes[m.quoteKey(h.code)] || quotes[h.code];
        return !q || !q.name;
      });
      if (missing.length) {
        const alt = missing.map((h) => {
          const cands = m.inferCnMarketCandidates(h.code);
          const other = cands.find((x) => x !== h.market) ?? cands[0];
          return { ...h, market: other };
        });
        const more = await m.loadQuotes(alt);
        quotes = { ...quotes, ...more };
        alt.forEach((h) => {
          const q = more[m.quoteKey(h.code)] || more[h.code];
          if (q) {
            const stub = stubs.find(
              (s) => m.quoteKey(s.code) === m.quoteKey(h.code),
            );
            if (stub) stub.market = h.market;
          }
        });
      }
    }

    return stubs.map((h, i) => {
      const src = items[i] || {};
      const q = quotes[m.quoteKey(h.code)] || quotes[h.code];
      return {
        ...h,
        name: (q && q.name) || src.name || h.name || h.code,
        price: q && q.price != null ? q.price : null,
        change:
          q && q.change != null && !Number.isNaN(Number(q.change))
            ? Number(q.change)
            : null,
      };
    });
  }

  global.WatchlistAPI = {
    LOCAL_WATCH_STOCKS_KEY,
    LOCAL_FOCUS_FUNDS_KEY,
    VALID_WATCH_TYPES,
    normalizeWatchType,
    holdingFromWatchType,
    addWatchStock,
    listWatchStocks,
    removeWatchStock,
    getLocalWatchStocks,
    saveLocalWatchStocks,
    loadWatchQuotes,
    listFocusFunds,
    addFocusFund,
    removeFocusFund,
    getLocalFocusFunds,
    saveLocalFocusFunds,
    initLocalFocusFunds,
  };
})(window);
