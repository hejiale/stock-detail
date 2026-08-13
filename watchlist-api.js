/**
 * 自选个股 / 自选基金 / 用户登录（自有后端）
 *
 * 引用方式：
 *   <script src="api.js"></script>
 *   <script src="watchlist-api.js"></script>
 *   之后通过 window.WatchlistAPI 调用
 *
 * 依赖：window.MarketAPI（代码规范化、报价）
 *
 * 数据源：stock-backdev-production.up.railway.app
 *   type：1 A股 / 2 美股 / 3 港股 / 4 韩股 / 5 日股
 */
(function (global) {
  "use strict";

  const WATCHLIST_BASE =
    "https://stock-backdev-production.up.railway.app";
  const AUTH_USER_KEY = "watch_user_v1";
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

  /** @returns {{ userId: number, name: string } | null} */
  function getAuthUser() {
    try {
      const raw = localStorage.getItem(AUTH_USER_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      const userId = Number(data?.userId ?? data?.id);
      const name = String(data?.name || "").trim();
      if (!Number.isInteger(userId) || userId <= 0) return null;
      return { userId, name };
    } catch {
      return null;
    }
  }

  function getUserId() {
    return getAuthUser()?.userId || null;
  }

  function saveAuthUser(user) {
    const userId = Number(user?.userId ?? user?.id);
    const name = String(user?.name || "").trim();
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new Error("无效的用户信息");
    }
    localStorage.setItem(
      AUTH_USER_KEY,
      JSON.stringify({ userId, name: name || String(userId) })
    );
    return { userId, name: name || String(userId) };
  }

  function clearAuthUser() {
    localStorage.removeItem(AUTH_USER_KEY);
  }

  function requireUserId() {
    const userId = getUserId();
    if (!userId) throw new Error("请先登录");
    return userId;
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
        watchType: t
      };
    }
    if (t === 2) {
      const c = String(code || "").trim().toUpperCase();
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

  async function watchlistFetch(path, options = {}) {
    const resp = await fetch(WATCHLIST_BASE + path, {
      headers: { Accept: "application/json", ...(options.headers || {}) },
      ...options
    });
    let json = null;
    try {
      json = await resp.json();
    } catch {
      json = null;
    }
    const apiCode = json && json.code != null ? Number(json.code) : null;
    const okHttp = resp.ok;
    const okApi = apiCode == null || (apiCode >= 200 && apiCode < 300);
    if (!okHttp || !okApi) {
      throw new Error(
        (json && json.message) || "自选接口请求失败（" + resp.status + "）"
      );
    }
    return json || {};
  }

  /** POST /api/users/login  { name, password } */
  async function loginUser(name, password) {
    const username = String(name || "").trim();
    if (!username) throw new Error("请输入用户名");
    if (!password) throw new Error("请输入密码");
    const json = await watchlistFetch("/api/users/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: username, password: String(password) })
    });
    const user = json.data || {};
    return saveAuthUser(user);
  }

  /** POST /api/users/register  { name, password } */
  async function registerUser(name, password) {
    const username = String(name || "").trim();
    if (!username) throw new Error("请输入用户名");
    if (!password) throw new Error("请输入密码");
    const json = await watchlistFetch("/api/users/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: username, password: String(password) })
    });
    return json.data || { name: username };
  }

  /** POST /api/stock/addStock  { code, type, userId } */
  async function addWatchStock(code, type) {
    const t = normalizeWatchType(type);
    const userId = requireUserId();
    const holding = holdingFromWatchType(code, t);
    if (!holding.code) throw new Error("股票代码无效");
    const json = await watchlistFetch("/api/stock/addStock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: holding.code, type: t, userId })
    });
    return { ...(json.data || {}), code: holding.code, type: t, userId };
  }

  /** GET /api/stock?type=&userId= */
  async function listWatchStocks(type) {
    const t = normalizeWatchType(type);
    const userId = requireUserId();
    const { quoteKey } = market();
    const json = await watchlistFetch(
      "/api/stock?type=" +
        encodeURIComponent(t) +
        "&userId=" +
        encodeURIComponent(userId)
    );
    const rows = Array.isArray(json.data) ? json.data : [];
    const seen = new Set();
    return rows
      .map((row) => {
        const code = String(row?.code || "").trim();
        if (!code) return null;
        const key = quoteKey(code);
        if (seen.has(key)) return null;
        seen.add(key);
        return {
          code,
          name: row.name || null,
          tag: row.tag || null,
          type: normalizeWatchType(row.type != null ? row.type : t)
        };
      })
      .filter(Boolean);
  }

  function normalizeFocusFundCode(code) {
    const raw = String(code || "").trim().replace(/\D/g, "");
    if (!raw) return "";
    return raw.padStart(6, "0").slice(-6);
  }

  /** GET /api/focus-list?userId= */
  async function listFocusFunds() {
    const userId = requireUserId();
    const json = await watchlistFetch(
      "/api/focus-list?userId=" + encodeURIComponent(userId)
    );
    const rows = Array.isArray(json.data) ? json.data : [];
    const seen = new Set();
    return rows
      .map((row) => {
        const code = normalizeFocusFundCode(row?.code);
        if (!code || seen.has(code)) return null;
        seen.add(code);
        return {
          code,
          createdAt: row.created_at || row.createdAt || null
        };
      })
      .filter(Boolean);
  }

  /** POST /api/focus-list  { code, userId } */
  async function addFocusFund(code) {
    const fundCode = normalizeFocusFundCode(code);
    if (!fundCode) throw new Error("基金代码无效");
    const userId = requireUserId();
    const json = await watchlistFetch("/api/focus-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: fundCode, userId })
    });
    return { ...(json.data || {}), code: fundCode, userId };
  }

  /** DELETE /api/focus-list/:code?userId= */
  async function removeFocusFund(code) {
    const fundCode = normalizeFocusFundCode(code);
    if (!fundCode) throw new Error("缺少基金代码");
    const userId = requireUserId();
    await watchlistFetch(
      "/api/focus-list/" +
        encodeURIComponent(fundCode) +
        "?userId=" +
        encodeURIComponent(userId),
      { method: "DELETE" }
    );
    return true;
  }

  /** DELETE /api/stock/deleteStock/:code?userId= */
  async function removeWatchStock(code) {
    const raw = String(code || "").trim();
    if (!raw) throw new Error("缺少股票代码");
    const userId = requireUserId();
    await watchlistFetch(
      "/api/stock/deleteStock/" +
        encodeURIComponent(raw) +
        "?userId=" +
        encodeURIComponent(userId),
      { method: "DELETE" }
    );
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
      holdingFromWatchType(item.code, item.type != null ? item.type : t)
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
              (s) => m.quoteKey(s.code) === m.quoteKey(h.code)
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
              (s) => m.quoteKey(s.code) === m.quoteKey(h.code)
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
            : null
      };
    });
  }

  global.WatchlistAPI = {
    AUTH_USER_KEY,
    getAuthUser,
    getUserId,
    saveAuthUser,
    clearAuthUser,
    loginUser,
    registerUser,
    VALID_WATCH_TYPES,
    normalizeWatchType,
    holdingFromWatchType,
    addWatchStock,
    listWatchStocks,
    removeWatchStock,
    loadWatchQuotes,
    listFocusFunds,
    addFocusFund,
    removeFocusFund
  };
})(window);
