/**
 * 行情 / 分时 / K 线接口封装
 *
 * 引用方式：
 *   <script src="api.js"></script>
 *   之后通过 window.MarketAPI 调用
 *
 * 数据源：
 *   1. 东方财富 push2 / push2his（实时报价、分时、日 K）
 *   2. 新浪财经 hq.sinajs.cn（报价兜底；美股盘前/盘后涨跌幅）
 *
 * holding 约定（与 data.js 一致）：
 *   { name, code, market?, ratio? }
 *   market 为东方财富 secid 前缀：
 *     0=深交所, 1=上交所, 105=纳斯达克, 106=纽交所,
 *     116=港股, 176=日股, 177=韩股
 */
(function (global) {
  "use strict";

  /** 东方财富接口常用 ut 参数（公开行情页同款） */
  const EAST_UT = "fa5fd1943c7b386f172d6893dbfba10b";

  // ---------------------------------------------------------------------------
  // 代码转换
  // ---------------------------------------------------------------------------

  /**
   * 转为新浪行情代码
   * - 美股：gb_nvda
   * - A 股：sh600519 / sz000001 / bj430047
   */
  function toSinaSymbol(holding) {
    const code = holding.code;
    if (holding.market === 105 || holding.market === 106 || /[A-Za-z]/.test(code)) {
      return "gb_" + code.toLowerCase();
    }
    if (/^(6|9)\d{5}$/.test(code)) return "sh" + code;
    if (/^(0|2|3)\d{5}$/.test(code)) return "sz" + code;
    if (/^(4|8)\d{5}$/.test(code)) return "bj" + code;
    return "sh" + code;
  }

  /**
   * 转为东方财富 secid：`{市场}.{代码}`
   * 优先用 holding.market；否则按 A 股代码规则推断
   */
  function toEastSecId(holding) {
    if (holding.market != null) return holding.market + "." + holding.code;
    const code = holding.code;
    if (/^(6|9)\d{5}$/.test(code)) return "1." + code;
    if (/^(0|2|3)\d{5}$/.test(code)) return "0." + code;
    if (/^(4|8)\d{5}$/.test(code)) return "0." + code;
    return "1." + code;
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

  // ---------------------------------------------------------------------------
  // 实时报价
  // ---------------------------------------------------------------------------

  /**
   * 东方财富批量实时报价
   * GET https://push2.eastmoney.com/api/qt/ulist.np/get
   *
   * 请求字段：
   *   f12 代码, f14 名称, f2 最新价, f3 涨跌幅(%)
   *
   * @param {Array} holdings
   * @returns {Promise<Object>} code(大写) -> { name, price, change }
   */
  async function loadEastMoneyQuotes(holdings) {
    const secids = holdings.map(toEastSecId).join(",");
    const url =
      "https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f12,f14,f2,f3&secids=" +
      encodeURIComponent(secids) +
      "&_=" +
      Date.now();

    const resp = await fetch(url);
    if (!resp.ok) throw new Error("行情接口请求失败");
    const json = await resp.json();
    const list = json?.data?.diff || [];
    const map = {};
    list.forEach((item) => {
      if (!item || item.f12 == null || item.f3 == null || item.f3 === "-") return;
      map[String(item.f12).toUpperCase()] = {
        name: item.f14,
        price: Number(item.f2),
        change: Math.round(Number(item.f3) * 100) / 100
      };
    });
    return map;
  }

  /**
   * 新浪财经实时报价（script JSONP 风格）
   * GET https://hq.sinajs.cn/list={symbols}
   *
   * 会在全局写入 hq_str_{symbol}，加载完成后解析并清理 script。
   *
   * A 股字段：0名称, 1开盘, 2昨收, 3现价, ...
   * 美股 gb_ 字段：1现价, 2涨跌幅%, 21盘前/盘后价, 22盘前/盘后涨跌幅%
   *
   * @param {Array} holdings
   * @returns {Promise<Object>} code -> { name, price, change, preChange? }
   */
  function loadSinaQuotes(holdings) {
    return new Promise((resolve, reject) => {
      const symbols = holdings.map(toSinaSymbol);
      const list = symbols.join(",");
      const script = document.createElement("script");
      script.charset = "gbk";
      script.src = "https://hq.sinajs.cn/list=" + list + "&_=" + Date.now();

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("行情请求超时，请检查网络后重试"));
      }, 10000);

      function cleanup() {
        clearTimeout(timer);
        script.onload = null;
        script.onerror = null;
        script.remove();
      }

      script.onload = () => {
        cleanup();
        const map = {};
        holdings.forEach((h, idx) => {
          const symbol = symbols[idx];
          const raw = global["hq_str_" + symbol];
          if (!raw) return;
          const parts = raw.split(",");
          let change;

          if (symbol.startsWith("gb_")) {
            const price = Number(parts[1]);
            const pct = Number(parts[2]);
            if (Number.isNaN(pct)) return;
            change = pct;
            // 盘前/盘后涨跌幅：相对常规时段收盘价
            const preRaw = Number(parts[22]);
            const preChange = Number.isNaN(preRaw)
              ? null
              : Math.round(preRaw * 100) / 100;
            map[h.code.toUpperCase()] = {
              name: parts[0],
              price,
              change: Math.round(change * 100) / 100,
              preChange
            };
            return;
          }

          const name = parts[0];
          const prev = Number(parts[2]);
          const price = Number(parts[3]);
          if (!prev || Number.isNaN(prev) || Number.isNaN(price)) return;
          change = ((price - prev) / prev) * 100;
          map[h.code] = {
            name,
            price,
            prev,
            change: Math.round(change * 100) / 100
          };
        });
        resolve(map);
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("行情接口加载失败"));
      };

      document.head.appendChild(script);
    });
  }

  /**
   * 用新浪美股数据补齐东方财富报价中的盘前/盘后涨跌幅（preChange）
   * 失败时不影响原有 change
   */
  async function enrichUsPreMarket(holdings, map) {
    const usHoldings = holdings.filter(isUsHolding);
    if (!usHoldings.length) return map;

    try {
      const sina = await loadSinaQuotes(usHoldings);
      usHoldings.forEach((h) => {
        const key = quoteKey(h.code);
        const target = map[key] || map[h.code];
        const src = sina[key] || sina[h.code];
        if (!target || !src || src.preChange == null || Number.isNaN(src.preChange)) {
          return;
        }
        target.preChange = src.preChange;
      });
    } catch (_) {
      // 盘前增强失败时保留已有实时涨跌幅
    }
    return map;
  }

  /**
   * 统一实时报价入口
   * 优先东方财富；成功后再补美股盘前；东方财富失败/空数据则回退新浪
   *
   * @returns {Promise<Object>} code -> { name, price, change, preChange? }
   */
  async function loadQuotes(holdings) {
    try {
      const map = await loadEastMoneyQuotes(holdings);
      if (Object.keys(map).length) {
        return enrichUsPreMarket(holdings, map);
      }
    } catch (_) {
      // 回退新浪
    }
    return loadSinaQuotes(holdings);
  }

  // ---------------------------------------------------------------------------
  // 分时 / 日 K
  // ---------------------------------------------------------------------------

  /**
   * 东方财富当日分时
   * GET https://push2.eastmoney.com/api/qt/stock/trends2/get
   *
   * trends 每项：时间,开盘,现价,最高,最低,成交量,成交额,均价
   *
   * @returns {Promise<{ name, code, preClose, points }>}
   *   points: [{ datetime, time, price, avg, volume }]
   */
  async function loadIntradayTrends(holding) {
    const secid = toEastSecId(holding);
    const url =
      "https://push2.eastmoney.com/api/qt/stock/trends2/get" +
      "?fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13" +
      "&fields2=f51,f52,f53,f54,f55,f56,f57,f58" +
      "&ut=" +
      EAST_UT +
      "&ndays=1&iscr=0&secid=" +
      encodeURIComponent(secid) +
      "&_=" +
      Date.now();

    const resp = await fetch(url);
    if (!resp.ok) throw new Error("分时数据请求失败");
    const json = await resp.json();
    const data = json?.data;
    if (!data || !Array.isArray(data.trends) || !data.trends.length) {
      throw new Error("暂无当日分时数据");
    }

    const points = data.trends
      .map((row) => {
        const parts = String(row).split(",");
        const price = Number(parts[2]);
        const avg = Number(parts[7]);
        const volume = Number(parts[5]);
        if (Number.isNaN(price)) return null;
        const datetime = parts[0] || "";
        const time = datetime.includes(" ")
          ? datetime.split(" ")[1].slice(0, 5)
          : datetime.slice(-5);
        return {
          datetime,
          time,
          price,
          avg: Number.isNaN(avg) ? null : avg,
          volume: Number.isNaN(volume) ? 0 : volume
        };
      })
      .filter(Boolean);

    if (!points.length) throw new Error("暂无当日分时数据");

    const preClose = Number(data.preClose);
    return {
      name: data.name || holding.name,
      code: data.code || holding.code,
      preClose: Number.isNaN(preClose) ? null : preClose,
      points
    };
  }

  /**
   * 东方财富日 K 线（前复权）
   * GET https://push2his.eastmoney.com/api/qt/stock/kline/get
   *
   * 参数：
   *   klt=101 日线
   *   fqt=1   前复权
   *   lmt=320 最近约 1.2 年交易日（够算近 1 年 / 今年以来）
   *
   * klines 每项：日期,开,收,高,低,成交量,成交额,振幅,涨跌幅,涨跌额,换手率
   *
   * @returns {Promise<{ name, code, klines }>}
   *   klines: [{ date, close, volume }] 升序
   */
  async function loadDailyKlines(holding) {
    const secid = toEastSecId(holding);
    const url =
      "https://push2his.eastmoney.com/api/qt/stock/kline/get" +
      "?fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13" +
      "&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61" +
      "&ut=" +
      EAST_UT +
      "&klt=101&fqt=1&end=20500101&lmt=320&secid=" +
      encodeURIComponent(secid) +
      "&_=" +
      Date.now();

    const resp = await fetch(url);
    if (!resp.ok) throw new Error("历史行情请求失败");
    const json = await resp.json();
    const data = json?.data;
    if (!data || !Array.isArray(data.klines) || !data.klines.length) {
      throw new Error("暂无历史行情");
    }

    const klines = data.klines
      .map((row) => {
        const parts = String(row).split(",");
        const close = Number(parts[2]);
        const volume = Number(parts[5]);
        if (!parts[0] || Number.isNaN(close)) return null;
        return {
          date: parts[0],
          close,
          volume: Number.isNaN(volume) ? 0 : volume
        };
      })
      .filter(Boolean);

    return {
      name: data.name || holding.name,
      code: data.code || holding.code,
      klines
    };
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
    return Math.round(((last.close - base.close) / base.close) * 10000) / 100;
  }

  /**
   * 根据日 K 计算区间涨跌幅（%）
   * @returns {{ day, '1m', '3m', '6m', ytd, '1y' }} 值为 number | null
   *   day 需由调用方用分时昨收另行填入
   */
  function calcPeriodReturns(klines) {
    const empty = { day: null, "1m": null, "3m": null, "6m": null, ytd: null, "1y": null };
    if (!klines?.length) return empty;

    const last = klines[klines.length - 1];
    const lastDate = parseDate(last.date);
    const result = { ...empty };

    const monthTargets = { "1m": -1, "3m": -3, "6m": -6, "1y": -12 };
    Object.entries(monthTargets).forEach(([key, months]) => {
      const target = toDateStr(addMonths(lastDate, months));
      const base = findKlineOnOrBefore(klines, target) || klines[0];
      result[key] = calcReturnFromBase(last, base);
    });

    // 今年以来：优先用上年最后一个交易日收盘
    const ytdStart = `${last.date.slice(0, 4)}-01-01`;
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
    const lastDate = parseDate(last.date);
    let targetStr;

    if (range === "ytd") {
      targetStr = `${last.date.slice(0, 4)}-01-01`;
    } else {
      const months = { "1m": -1, "3m": -3, "6m": -6, "1y": -12 }[range];
      if (months == null) return klines.slice();
      targetStr = toDateStr(addMonths(lastDate, months));
    }

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
    // 请求
    loadQuotes,
    loadEastMoneyQuotes,
    loadSinaQuotes,
    loadIntradayTrends,
    loadDailyKlines,
    // 区间计算
    calcPeriodReturns,
    sliceKlinesForRange
  };
})(window);
