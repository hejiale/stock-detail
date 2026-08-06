/**
 * 行情 / 分时 / K 线接口封装
 *
 * 引用方式：
 *   <script src="api.js"></script>
 *   之后通过 window.MarketAPI 调用
 *
 * 数据源：
 *   1. 东方财富 push2 / push2delay / push2his（实时报价、分时、日 K；push2 不可达时回退 delay）
 *   2. 新浪财经 hq.sinajs.cn（A 股报价兜底；浏览器侧常因 Referer 校验失败）
 *   3. Yahoo Finance chart（美股盘前/盘后涨跌幅；浏览器经 CORS 中继）
 *
 * holding 约定（与 data.js 一致）：
 *   { name, code, market?, ratio? }
 *   market 为东方财富 secid 前缀：
 *     0=深交所 / 北交所, 1=上交所, 105=纳斯达克, 106=纽交所,
 *     116=港股, 176=日股, 177=韩股
 */
(function (global) {
  "use strict";

  /** 东方财富接口常用 ut 参数（公开行情页同款） */
  const EAST_UT = "fa5fd1943c7b386f172d6893dbfba10b";

  /**
   * 实时/分时主机：push2 部分网络会 TLS 中断，delay 作兜底
   * 日 K 主机：push2his 为主，delay 仅作连通性兜底（可能无 klines）
   */
  const EAST_PUSH_HOSTS = [
    "https://push2.eastmoney.com",
    "https://push2delay.eastmoney.com"
  ];
  const EAST_HIS_HOSTS = [
    "https://push2his.eastmoney.com",
    "https://push2delay.eastmoney.com"
  ];

  /** 涨跌幅等保留两位小数 */
  function round2(n) {
    return Math.round(Number(n) * 100) / 100;
  }

  /**
   * 拼接东财路径+查询串（自动附带 ut、防缓存 _）
   * @param {string} apiPath 如 /api/qt/ulist.np/get
   * @param {Object} params
   */
  function buildEastPath(apiPath, params) {
    const q = Object.keys(params)
      .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(params[k]))
      .join("&");
    return (
      apiPath +
      "?" +
      q +
      (q ? "&" : "") +
      "ut=" +
      EAST_UT +
      "&_=" +
      Date.now()
    );
  }

  /** 统一 data.diff：数组 / 对象字典 → 数组 */
  function normalizeEastDiff(json) {
    const raw = json?.data?.diff;
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === "object") return Object.values(raw);
    return [];
  }

  /**
   * 按主机列表依次请求东财 JSON，直到成功
   * @param {string[]} hosts
   * @param {string} pathWithQuery 以 / 开头的路径+查询串
   * @param {(json: any) => boolean} [isValid] 可选校验；不通过则换下一主机
   */
  async function fetchEastMoneyJson(hosts, pathWithQuery, isValid) {
    let lastError = null;
    for (let i = 0; i < hosts.length; i++) {
      try {
        const resp = await fetch(hosts[i] + pathWithQuery, {
          headers: { Accept: "application/json" }
        });
        if (!resp.ok) {
          lastError = new Error("行情接口请求失败");
          continue;
        }
        const json = await resp.json();
        if (typeof isValid === "function" && !isValid(json)) {
          lastError = new Error("行情接口返回无效数据");
          continue;
        }
        return json;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error("行情接口请求失败");
  }

  /** 东财 ulist 批量报价 / 市值等 */
  async function fetchEastUlist(secids, fields) {
    const path = buildEastPath("/api/qt/ulist.np/get", {
      fltt: 2,
      fields,
      secids
    });
    return fetchEastMoneyJson(EAST_PUSH_HOSTS, path);
  }

  /**
   * 东财 clist（板块 / 成分股 / 排行）
   * @returns {Promise<{ list: Array, total: number, json: any }>}
   */
  async function fetchEastClist({
    fs,
    fields,
    pn = 1,
    pz = 50,
    po = 1,
    fid = "f3"
  }) {
    const path = buildEastPath("/api/qt/clist/get", {
      pn,
      pz,
      po,
      np: 1,
      fltt: 2,
      invt: 2,
      fid,
      fs,
      fields
    });
    const json = await fetchEastMoneyJson(EAST_PUSH_HOSTS, path);
    return {
      list: normalizeEastDiff(json),
      total: Number(json?.data?.total) || 0,
      json
    };
  }

  // ---------------------------------------------------------------------------
  // 代码转换
  // ---------------------------------------------------------------------------

  /** 北交所：920 新代码；以及历史 43/83/87、部分 4/8 开头 */
  function isBjCode(code) {
    return /^(920\d{3}|(43|83|87)\d{4}|[48]\d{5})$/.test(code);
  }

  /**
   * 规范化 A 股代码为 6 位数字
   * 支持：002245 / sz002245 / 002245.SZ / 多余位数（取前 6 位）/ 不足 6 位左侧补 0
   */
  function normalizeCnCode(raw) {
    let s = String(raw || "").trim().toUpperCase();
    if (!s) return "";

    s = s.replace(/\.(SH|SZ|BJ|SS|XSHE|XSHG)$/i, "");
    const pref = s.match(/^(SH|SZ|BJ|SS)(.+)$/);
    if (pref) s = pref[2];

    const digits = s.replace(/\D/g, "");
    if (!digits) return "";

    if (digits.length === 6) return digits;
    if (digits.length < 6) return digits.padStart(6, "0");
    // 多输位数时优先取前 6 位（如 00224512 → 002245）
    return digits.slice(0, 6);
  }

  /**
   * 解析 A 股交易所：bj / sh / sz（北交所优先于沪市 9xxxx）
   */
  function resolveCnExchange(code) {
    if (isBjCode(code)) return "bj";
    if (/^(60|68|90)\d{4}$/.test(code) || /^6\d{5}$/.test(code) || /^9\d{5}$/.test(code)) {
      return "sh";
    }
    if (/^(00|30)\d{4}$/.test(code) || /^(0|2|3)\d{5}$/.test(code)) {
      return "sz";
    }
    return "sh";
  }

  /**
   * 推断 A 股东方财富 market，并给出候选顺序（首选 + 兜底）
   * - 上交所(1)：60/68/90 等
   * - 深交所(0)：00/001/002/003/30 等
   * - 北交所(0)：920 及历史 43/83/87 等（东财与深市同用 0）
   */
  function inferCnMarketCandidates(code) {
    const ex = resolveCnExchange(code);
    if (ex === "bj" || ex === "sz") return [0, 1];
    return [1, 0];
  }

  /**
   * 转为新浪行情代码
   * - 美股：gb_nvda
   * - A 股：sh600519 / sz000001 / bj920001
   */
  function toSinaSymbol(holding) {
    const code = holding.code;
    if (holding.market === 105 || holding.market === 106 || /[A-Za-z]/.test(code)) {
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

  // ---------------------------------------------------------------------------
  // 实时报价
  // ---------------------------------------------------------------------------

  /**
   * 东方财富批量实时报价
   * GET {push2|push2delay}/api/qt/ulist.np/get
   *
   * 请求字段：
   *   f12 代码, f14 名称, f2 最新价, f3 涨跌幅(%), f18 昨收
   *   盘后/delay 常出现 f2=0，此时用 f18 作展示价
   *
   * @param {Array} holdings
   * @returns {Promise<Object>} code(大写) -> { name, price, change }
   */
  async function loadEastMoneyQuotes(holdings) {
    const json = await fetchEastUlist(
      holdings.map(toEastSecId).join(","),
      "f12,f14,f2,f3,f18"
    );
    const map = {};
    normalizeEastDiff(json).forEach((item) => {
      if (!item || item.f12 == null || item.f3 == null || item.f3 === "-") return;
      const live = Number(item.f2);
      const prev = Number(item.f18);
      const price =
        !Number.isNaN(live) && live !== 0
          ? live
          : !Number.isNaN(prev) && prev !== 0
            ? prev
            : NaN;
      if (Number.isNaN(price)) return;
      map[String(item.f12).toUpperCase()] = {
        name: item.f14,
        price,
        change: round2(item.f3)
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
  function loadSinaQuotes(holdings, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const symbols = holdings.map(toSinaSymbol);
      const list = symbols.join(",");
      const script = document.createElement("script");
      script.charset = "gbk";
      script.src = "https://hq.sinajs.cn/list=" + list + "&_=" + Date.now();

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("行情请求超时，请检查网络后重试"));
      }, timeoutMs);

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
            const preChange = Number.isNaN(preRaw) ? null : round2(preRaw);
            map[h.code.toUpperCase()] = {
              name: parts[0],
              price,
              change: round2(change),
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
            change: round2(change)
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
   * 浏览器跨域拉取 JSON：先直连，失败再用 jina 中继（Yahoo 无 CORS；新浪需 Referer）
   */
  async function fetchJsonWithCorsFallback(url) {
    try {
      const resp = await fetch(url, {
        headers: { Accept: "application/json" }
      });
      if (resp.ok) return await resp.json();
    } catch (_) {
      // 走中继
    }

    const relay = "https://r.jina.ai/" + url;
    const resp2 = await fetch(relay, {
      headers: { Accept: "application/json" }
    });
    if (!resp2.ok) throw new Error("行情中继请求失败");
    const wrapped = await resp2.json();
    const content = wrapped?.data?.content;
    if (content == null || content === "") throw new Error("行情中继无数据");
    return typeof content === "string" ? JSON.parse(content) : content;
  }

  /** Yahoo 美股代码：BRK.B → BRK-B */
  function toYahooSymbol(code) {
    return String(code || "")
      .trim()
      .toUpperCase()
      .replace(/\./g, "-");
  }

  /**
   * 从 Yahoo chart 结果解析盘前/盘后涨跌幅（相对最近常规收盘价）
   * @returns {number|null}
   */
  function preChangeFromYahooChart(result) {
    if (!result?.meta || !result.timestamp?.length) return null;
    const meta = result.meta;
    const baseline = Number(meta.regularMarketPrice);
    if (!baseline || Number.isNaN(baseline)) return null;

    const timestamps = result.timestamp;
    const closes = result.indicators?.quote?.[0]?.close || [];
    const periods = meta.currentTradingPeriod || {};
    const pre = periods.pre;
    const post = periods.post;
    const now = Math.floor(Date.now() / 1000);

    function lastCloseInRange(start, end) {
      if (start == null || end == null) return null;
      for (let i = timestamps.length - 1; i >= 0; i--) {
        const t = timestamps[i];
        const px = closes[i];
        if (t >= start && t < end && px != null && !Number.isNaN(Number(px))) {
          return Number(px);
        }
      }
      return null;
    }

    let extPrice = null;
    if (post && now >= post.start) {
      extPrice = lastCloseInRange(post.start, post.end);
    }
    if (extPrice == null && pre) {
      extPrice = lastCloseInRange(pre.start, pre.end);
    }
    // 时段字段缺失时：取序列最新价（含盘前盘后）
    if (extPrice == null) {
      for (let i = closes.length - 1; i >= 0; i--) {
        if (closes[i] != null && !Number.isNaN(Number(closes[i]))) {
          extPrice = Number(closes[i]);
          break;
        }
      }
    }

    if (extPrice == null || Math.abs(extPrice - baseline) < 1e-9) return null;
    return round2(((extPrice - baseline) / baseline) * 100);
  }

  /**
   * 美股盘前/盘后涨跌幅（Yahoo Finance 1m chart + includePrePost）
   * @returns {Promise<Object>} code(大写) -> { name, price?, preChange }
   */
  async function loadUsPreMarketQuotes(holdings, concurrency = 4) {
    const usHoldings = holdings.filter(isUsHolding);
    if (!usHoldings.length) return {};

    const map = {};
    let cursor = 0;

    async function worker() {
      while (cursor < usHoldings.length) {
        const h = usHoldings[cursor++];
        const code = quoteKey(h.code);
        const symbol = toYahooSymbol(h.code);
        if (!symbol) continue;
        try {
          const url =
            "https://query1.finance.yahoo.com/v8/finance/chart/" +
            encodeURIComponent(symbol) +
            "?interval=1m&range=1d&includePrePost=true";
          const json = await fetchJsonWithCorsFallback(url);
          const result = json?.chart?.result?.[0];
          const preChange = preChangeFromYahooChart(result);
          if (preChange == null || Number.isNaN(preChange)) continue;
          map[code] = {
            name: result?.meta?.shortName || h.name || code,
            price: Number(result?.meta?.regularMarketPrice) || undefined,
            preChange
          };
        } catch (_) {
          // 单只失败不影响其余
        }
      }
    }

    const workers = Array.from(
      { length: Math.min(concurrency, usHoldings.length) },
      () => worker()
    );
    await Promise.all(workers);
    return map;
  }

  /**
   * 用美股盘前/盘后数据补齐东方财富报价中的 preChange
   * 失败时不影响原有 change
   * @param {Promise|Object} [preMapOrPromise] 可选：已发起的盘前请求，便于与日涨跌并行
   */
  async function enrichUsPreMarket(holdings, map, preMapOrPromise) {
    const usHoldings = holdings.filter(isUsHolding);
    if (!usHoldings.length) return map;

    try {
      const preMap =
        preMapOrPromise != null
          ? await preMapOrPromise
          : await loadUsPreMarketQuotes(usHoldings);
      usHoldings.forEach((h) => {
        const key = quoteKey(h.code);
        const target = map[key] || map[h.code];
        const src = preMap[key] || preMap[h.code];
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
   * 统一实时报价入口（一次只查传入的持仓，由调用方按页传入，不做多页合并）
   * 优先东方财富；失败/空数据则回退新浪。
   * 美股盘前请另调 loadUsPreMarketQuotes / enrichUsPreMarket，避免串行等待拖慢日涨跌同步。
   *
   * @returns {Promise<Object>} code -> { name, price, change, preChange? }
   */
  async function loadQuotes(holdings) {
    if (!holdings.length) return {};
    try {
      const map = await loadEastMoneyQuotes(holdings);
      if (Object.keys(map).length) return map;
    } catch (_) {
      // 回退新浪
    }
    return loadSinaQuotes(holdings);
  }

  // ---------------------------------------------------------------------------
  // 分时 / 日 K / 市值
  // ---------------------------------------------------------------------------

  /**
   * 东方财富总市值 / 流通市值
   * ulist 字段：f20 总市值、f21 流通市值（单位：元）
   *
   * @returns {Promise<{ total: number|null, float: number|null, name: string|null }>}
   */
  async function loadStockMarketCap(holding) {
    const json = await fetchEastUlist(toEastSecId(holding), "f12,f14,f20,f21");
    const item = normalizeEastDiff(json)[0];
    if (!item) throw new Error("暂无市值数据");

    const total = Number(item.f20);
    const floatCap = Number(item.f21);
    return {
      total: !Number.isNaN(total) && total > 0 ? total : null,
      float: !Number.isNaN(floatCap) && floatCap > 0 ? floatCap : null,
      name: item.f14 ? String(item.f14) : null
    };
  }

  // ---------------------------------------------------------------------------
  // 个股资料（市值 + 财报）
  // ---------------------------------------------------------------------------

  const EAST_DC_WEB = "https://datacenter-web.eastmoney.com/api/data/v1/get";
  const EAST_DC_SEC = "https://datacenter.eastmoney.com/securities/api/data/v1/get";

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

  function normalizeReportDate(d) {
    return String(d || "").slice(0, 10);
  }

  function numOrNull(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  /** 年报 / 季报（含中报） */
  function classifyPeriod(label, reportType) {
    const s = String(label || "") + " " + String(reportType || "");
    if (/年报|年度|\/FY|\bFY\b/.test(s)) return "annual";
    return "quarter";
  }

  async function fetchDatacenterJson(url) {
    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) throw new Error("财务数据请求失败");
    const json = await resp.json();
    if (json && json.success === false) {
      throw new Error(json.message || "财务数据请求失败");
    }
    return json;
  }

  function buildDatacenterUrl(base, params) {
    const q = Object.keys(params)
      .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(params[k]))
      .join("&");
    return base + "?" + q;
  }

  /** 美股 SECUCODE：纳斯达克 .O / 纽交所 .N */
  function toUsSecuCode(holding) {
    const code = String(holding.code || "").toUpperCase();
    const suffix = Number(holding.market) === 106 ? ".N" : ".O";
    return code + suffix;
  }

  /** 港股 SECUCODE：5 位补零 + .HK */
  function toHkSecuCode(holding) {
    const digits = String(holding.code || "").replace(/\D/g, "");
    if (!digits) return "";
    return digits.padStart(5, "0") + ".HK";
  }

  async function loadCnFinancialReports(code) {
    const filter = '(SECURITY_CODE="' + code + '")';
    const [perfJson, balJson] = await Promise.all([
      fetchDatacenterJson(
        buildDatacenterUrl(EAST_DC_WEB, {
          reportName: "RPT_LICO_FN_CPD",
          columns:
            "SECURITY_CODE,SECURITY_NAME_ABBR,REPORTDATE,DATATYPE,TOTAL_OPERATE_INCOME,PARENT_NETPROFIT,YSTZ,SJLTZ",
          filter,
          pageNumber: "1",
          pageSize: "12",
          sortColumns: "REPORTDATE",
          sortTypes: "-1",
          source: "WEB",
          client: "WEB"
        })
      ),
      fetchDatacenterJson(
        buildDatacenterUrl(EAST_DC_WEB, {
          reportName: "RPT_DMSK_FN_BALANCE",
          columns: "REPORT_DATE,TOTAL_LIABILITIES,TOTAL_ASSETS",
          filter,
          pageNumber: "1",
          pageSize: "12",
          sortColumns: "REPORT_DATE",
          sortTypes: "-1",
          source: "WEB",
          client: "WEB"
        })
      )
    ]);

    const debtRatioMap = {};
    (balJson?.result?.data || []).forEach((row) => {
      const d = normalizeReportDate(row.REPORT_DATE);
      const liab = numOrNull(row.TOTAL_LIABILITIES);
      const assets = numOrNull(row.TOTAL_ASSETS);
      if (d && liab != null && assets && assets > 0) {
        debtRatioMap[d] = round2((liab / assets) * 100);
      }
    });

    const reports = (perfJson?.result?.data || []).map((row) => {
      const date = normalizeReportDate(row.REPORTDATE);
      const label = String(row.DATATYPE || date);
      return {
        date,
        label,
        kind: classifyPeriod(label, ""),
        revenue: numOrNull(row.TOTAL_OPERATE_INCOME),
        profit: numOrNull(row.PARENT_NETPROFIT),
        revenueYoy: numOrNull(row.YSTZ),
        profitYoy: numOrNull(row.SJLTZ),
        debtRatio: debtRatioMap[date] ?? null
      };
    });

    const name = perfJson?.result?.data?.[0]?.SECURITY_NAME_ABBR || null;
    return { name, currency: "CNY", currencyLabel: "人民币", reports };
  }

  async function loadOverseasFinancialReports(secucode, marketKind) {
    const isHk = marketKind === "HK";
    const mainReport = isHk
      ? "RPT_HKF10_FN_GMAININDICATOR"
      : "RPT_USF10_FN_GMAININDICATOR";
    const filter = '(SECUCODE="' + secucode + '")';
    const mainColumns = isHk
      ? "SECUCODE,SECURITY_NAME_ABBR,REPORT_DATE,REPORT_TYPE,REPORT_DATA_TYPE,OPERATE_INCOME,HOLDER_PROFIT,OPERATE_INCOME_YOY,HOLDER_PROFIT_YOY,DEBT_ASSET_RATIO,CURRENCY_ABBR"
      : "SECUCODE,SECURITY_NAME_ABBR,REPORT_DATE,REPORT_TYPE,REPORT_DATA_TYPE,OPERATE_INCOME,PARENT_HOLDER_NETPROFIT,OPERATE_INCOME_YOY,PARENT_HOLDER_NETPROFIT_YOY,DEBT_ASSET_RATIO,CURRENCY_ABBR";

    const mainJson = await fetchDatacenterJson(
      buildDatacenterUrl(EAST_DC_SEC, {
        reportName: mainReport,
        columns: mainColumns,
        filter,
        pageNumber: "1",
        pageSize: "12",
        sortColumns: "REPORT_DATE",
        sortTypes: "-1",
        source: "SECURITIES",
        client: "PC"
      })
    );

    const rows = mainJson?.result?.data || [];
    if (!rows.length) throw new Error("暂无财务数据");

    const currency = String(rows[0].CURRENCY_ABBR || (isHk ? "HKD" : "USD"));
    const currencyLabel =
      currency === "HKD" ? "港元" : currency === "CNY" ? "人民币" : "美元";

    const reports = rows.map((row) => {
      const date = normalizeReportDate(row.REPORT_DATE);
      const label = String(row.REPORT_DATA_TYPE || row.REPORT_TYPE || date);
      return {
        date,
        label,
        kind: classifyPeriod(label, row.REPORT_TYPE),
        revenue: numOrNull(row.OPERATE_INCOME),
        profit: numOrNull(
          isHk ? row.HOLDER_PROFIT : row.PARENT_HOLDER_NETPROFIT
        ),
        revenueYoy: numOrNull(row.OPERATE_INCOME_YOY),
        profitYoy: numOrNull(
          isHk ? row.HOLDER_PROFIT_YOY : row.PARENT_HOLDER_NETPROFIT_YOY
        ),
        debtRatio: numOrNull(row.DEBT_ASSET_RATIO)
      };
    });

    return {
      name: rows[0].SECURITY_NAME_ABBR || null,
      currency,
      currencyLabel,
      reports
    };
  }

  /** 规范化股东变动状态：新进 / 增持 / 减持 / 不变 */
  function normalizeHolderAction(row) {
    const state = String(row.HOLDER_STATE_NEW || row.HOLDER_STATE || "").trim();
    const raw = row.HOLD_NUM_CHANGE;
    const changeNum =
      typeof raw === "number" ? raw : numOrNull(String(raw || "").replace(/,/g, ""));

    let action = state;
    if (!action || action === "null") {
      if (raw === "新进") action = "新进";
      else if (raw === "不变") action = "不变";
      else if (changeNum != null && changeNum > 0) action = "增持";
      else if (changeNum != null && changeNum < 0) action = "减持";
      else action = "--";
    } else if (/新/.test(action)) action = "新进";
    else if (/增/.test(action)) action = "增持";
    else if (/减/.test(action)) action = "减持";
    else if (/不|持平|无变化/.test(action)) action = "不变";

    return {
      action,
      changeRatio: numOrNull(row.CHANGE_RATIO),
      changeShares: changeNum
    };
  }

  /**
   * A 股前十大股东（最近报告期）+ 加减仓
   * @returns {Promise<{ date: string, list: Array }>}
   */
  async function loadCnTopHolders(code) {
    const json = await fetchDatacenterJson(
      buildDatacenterUrl(EAST_DC_WEB, {
        reportName: "RPT_F10_EH_HOLDERS",
        columns:
          "END_DATE,HOLDER_RANK,HOLDER_NAME,HOLD_NUM,HOLD_NUM_RATIO,HOLD_NUM_CHANGE,CHANGE_RATIO,HOLDER_STATE_NEW,HOLDER_STATE",
        filter: '(SECURITY_CODE="' + code + '")',
        pageNumber: "1",
        pageSize: "30",
        sortColumns: "END_DATE,HOLDER_RANK",
        sortTypes: "-1,1",
        source: "WEB",
        client: "WEB"
      })
    );

    const rows = json?.result?.data || [];
    if (!rows.length) throw new Error("暂无股东数据");

    const latest = normalizeReportDate(rows[0].END_DATE);
    const list = rows
      .filter((r) => normalizeReportDate(r.END_DATE) === latest)
      .slice(0, 10)
      .map((r) => {
        const chg = normalizeHolderAction(r);
        return {
          rank: Number(r.HOLDER_RANK) || 0,
          name: String(r.HOLDER_NAME || "--"),
          ratio: numOrNull(r.HOLD_NUM_RATIO),
          shares: numOrNull(r.HOLD_NUM),
          action: chg.action,
          changeRatio: chg.changeRatio,
          changeShares: chg.changeShares
        };
      });

    if (!list.length) throw new Error("暂无股东数据");
    return { date: latest, list };
  }

  /**
   * 个股资料：市值 + 近年营收/利润/负债率 + 十大股东
   * @returns {Promise<{
   *   name, code, marketKind, currency, currencyLabel,
   *   marketCap: { total, float },
   *   reports: Array,
   *   holders: { date, list }|null,
   *   holdersError?: string,
   *   financeError?: string
   * }>}
   */
  async function loadStockProfile(holding) {
    const marketKind = getMarketKind(holding);
    const code = String(holding.code || "");

    const mcapPromise = loadStockMarketCap(holding).catch(() => ({
      total: null,
      float: null,
      name: null
    }));

    let financePromise;
    if (marketKind === "CN") {
      financePromise = loadCnFinancialReports(code);
    } else if (marketKind === "US") {
      const primary = toUsSecuCode(holding);
      const fallback =
        Number(holding.market) === 106
          ? String(holding.code || "").toUpperCase() + ".O"
          : String(holding.code || "").toUpperCase() + ".N";
      financePromise = loadOverseasFinancialReports(primary, "US").catch((err) => {
        if (fallback === primary) throw err;
        return loadOverseasFinancialReports(fallback, "US");
      });
    } else if (marketKind === "HK") {
      financePromise = loadOverseasFinancialReports(toHkSecuCode(holding), "HK");
    } else {
      financePromise = Promise.reject(new Error("该市场暂不支持财务数据"));
    }

    const holdersPromise =
      marketKind === "CN"
        ? loadCnTopHolders(code)
        : Promise.reject(new Error("该市场暂无十大股东数据"));

    const [mcapResult, financeResult, holdersResult] = await Promise.allSettled([
      mcapPromise,
      financePromise,
      holdersPromise
    ]);

    const mcap =
      mcapResult.status === "fulfilled"
        ? mcapResult.value
        : { total: null, float: null, name: null };
    const finance =
      financeResult.status === "fulfilled" ? financeResult.value : null;
    const holders =
      holdersResult.status === "fulfilled" ? holdersResult.value : null;

    return {
      name: finance?.name || mcap.name || holding.name || code,
      code,
      marketKind,
      currency: finance?.currency || (marketKind === "CN" ? "CNY" : "USD"),
      currencyLabel:
        finance?.currencyLabel ||
        (marketKind === "CN" ? "人民币" : marketKind === "HK" ? "港元" : "美元"),
      marketCap: {
        total: mcap.total,
        float: mcap.float
      },
      reports: finance?.reports || [],
      holders,
      holdersError:
        holdersResult.status === "rejected"
          ? holdersResult.reason?.message || "暂无股东数据"
          : null,
      financeError:
        financeResult.status === "rejected"
          ? financeResult.reason?.message || "暂无财务数据"
          : null
    };
  }

  /**
   * 东方财富当日分时
   * GET {push2|push2delay}/api/qt/stock/trends2/get
   *
   * trends 每项：时间,开盘,现价,最高,最低,成交量,成交额,均价
   *
   * @returns {Promise<{ name, code, preClose, points }>}
   *   points: [{ datetime, time, price, avg, volume }]
   */
  async function loadIntradayTrends(holding) {
    const path = buildEastPath("/api/qt/stock/trends2/get", {
      fields1: "f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13",
      fields2: "f51,f52,f53,f54,f55,f56,f57,f58",
      ndays: 1,
      iscr: 0,
      secid: toEastSecId(holding)
    });

    let json;
    try {
      json = await fetchEastMoneyJson(EAST_PUSH_HOSTS, path);
    } catch (_) {
      throw new Error("分时数据请求失败");
    }
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
   * GET {push2his|push2delay}/api/qt/stock/kline/get
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
    const path = buildEastPath("/api/qt/stock/kline/get", {
      fields1: "f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13",
      fields2: "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
      klt: 101,
      fqt: 1,
      end: "20500101",
      lmt: 320,
      secid: toEastSecId(holding)
    });

    let json;
    try {
      json = await fetchEastMoneyJson(
        EAST_HIS_HOSTS,
        path,
        (j) => j?.data && Array.isArray(j.data.klines) && j.data.klines.length
      );
    } catch (_) {
      throw new Error("暂无历史行情");
    }

    const data = json.data;
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
    return round2(((last.close - base.close) / base.close) * 100);
  }

  /**
   * 根据日 K 计算区间涨跌幅（%）
   * @returns {{ day, '1m', '3m', '6m', ytd, '1y' }} 值为 number | null
   *   day 需由调用方用分时昨收另行填入
   */
  /** 区间起点日期字符串；无法识别的 range 返回 null */
  function rangeStartDate(lastDateStr, range) {
    if (range === "ytd") return `${String(lastDateStr).slice(0, 4)}-01-01`;
    const months = { "1m": -1, "3m": -3, "6m": -6, "1y": -12 }[range];
    if (months == null) return null;
    return toDateStr(addMonths(parseDate(lastDateStr), months));
  }

  function calcPeriodReturns(klines) {
    const empty = { day: null, "1m": null, "3m": null, "6m": null, ytd: null, "1y": null };
    if (!klines?.length) return empty;

    const last = klines[klines.length - 1];
    const result = { ...empty };

    ["1m", "3m", "6m", "1y"].forEach((key) => {
      const target = rangeStartDate(last.date, key);
      const base = findKlineOnOrBefore(klines, target) || klines[0];
      result[key] = calcReturnFromBase(last, base);
    });

    // 今年以来：优先用上年最后一个交易日收盘
    const ytdStart = rangeStartDate(last.date, "ytd");
    let ytdBase = findKlineOnOrBefore(klines, ytdStart);
    if (!ytdBase) {
      ytdBase = klines.find((k) => k.date >= ytdStart) || klines[0];
    }
    result.ytd = calcReturnFromBase(last, ytdBase);

    return result;
  }

  /**
   * 根据代码解析股票（名称 + 市场），用于添加自选
   * @param {string} rawCode
   * @param {'CN'|'US'} marketType
   * @returns {Promise<{ name, code, market, ratio }>}
   */
  async function resolveStock(rawCode, marketType) {
    if (!String(rawCode || "").trim()) throw new Error("请输入股票代码");

    if (marketType === "CN") {
      const code = normalizeCnCode(rawCode);
      if (!/^\d{6}$/.test(code)) {
        throw new Error("A股代码应为 6 位数字，如 002245、600519、920001");
      }

      const candidates = inferCnMarketCandidates(code);
      for (const market of candidates) {
        const quotes = await loadQuotes([{ code, market }]);
        const quote = quotes[quoteKey(code)] || quotes[code];
        if (quote && quote.name) {
          return { name: quote.name, code, market, ratio: 1 };
        }
      }
      throw new Error("未找到该股票，请确认是上交所 / 深交所 / 北交所代码");
    }

    const code = String(rawCode || "").trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(code)) {
      throw new Error("美股代码格式不正确");
    }

    for (const market of [105, 106]) {
      const holding = { code, market };
      const quotes = await loadQuotes([holding]);
      const quote = quotes[quoteKey(code)] || quotes[code];
      if (quote && quote.name) {
        return { name: quote.name, code, market, ratio: 5 };
      }
    }
    throw new Error("未找到该美股，请检查代码");
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

  /**
   * A 股行业板块涨跌幅列表（东方财富）
   * GET {push2|push2delay}/api/qt/clist/get
   * fs=m:90+t:2+f:!50
   *
   * 注意：东财 fs 分隔符须用 +（空格经 encode 后会匹配错数据）；单页最多约 100 条，需分页。
   *
   * 字段：f12 代码, f14 名称, f3 涨跌幅, f104 上涨家数, f105 下跌家数,
   *       f128 领涨股, f136 领涨股涨跌幅
   *
   * @returns {Promise<Array<{code,name,change,upCount,downCount,leader,leaderChange,childCodes?,childCount?}>>}
   */

  /**
   * 行业板块归类规则（按顺序匹配，越靠前越优先）
   * 把东财三级细分拢成更易扫读的粗板块
   */
  const CN_INDUSTRY_GROUP_RULES = [
    { name: "半导体", test: /半导体|芯片|集成电路|光刻|晶圆|EDA|先进封装|分立器件|被动元件/ },
    { name: "消费电子", test: /消费电子|品牌消费电子|光学光电子|光学元件|LED/ },
    { name: "电子元件", test: /元件|印制电路板|PCB|电子化学品|其他电子/ },
    { name: "计算机", test: /计算机|软件|IT服务|安防设备|工控|自动化设备|机器人/ },
    { name: "通信", test: /通信|电信运营|运营商/ },
    { name: "传媒互联网", test: /游戏|影视|动漫|广告|媒体|出版|数字媒体|营销代理|电商|互联网/ },
    { name: "贵金属", test: /黄金|白银|贵金属/ },
    { name: "能源金属", test: /锂|钴|镍|锡|锑|稀土|钨|钼|小金属|磁性材料|能源金属|金属新材料/ },
    { name: "工业金属", test: /铜|铝|铅锌|钢铁|普钢|特钢|铁矿|工业金属|有色金属|冶钢|焦炭|焦煤/ },
    { name: "电池储能", test: /电池|储能|电解液|隔膜|正极|负极|锂电|燃料电池|蓄电池/ },
    { name: "光伏", test: /光伏|硅料|硅片|逆变器/ },
    { name: "风电", test: /风电/ },
    { name: "电力设备", test: /电网|电力设备|电机|电源设备|火电设备|综合电力/ },
    { name: "电力公用", test: /电力$|火电|水电|核电|热力|燃气|水务|环保|环境治理|固废|大气/ },
    { name: "石油石化", test: /石油|石化|油服|油气|炼化|炼油|油品/ },
    { name: "煤炭", test: /煤炭|动力煤|煤化工/ },
    { name: "汽车整车", test: /乘用车|商用车|摩托车|电动乘用车|综合乘用车|^汽车$/ },
    { name: "汽车零部件", test: /汽车零部件|汽车电子|底盘|发动机|车身|轮胎|汽车服务|汽车经销|汽车综合/ },
    { name: "家电", test: /家电|冰洗|空调|彩电|厨卫|厨电|照明|冰箱|洗衣机/ },
    { name: "白酒", test: /白酒/ },
    { name: "啤酒饮料", test: /啤酒|饮料|软饮料|其他酒/ },
    { name: "食品加工", test: /乳品|肉制品|调味|零食|休闲食品|烘焙|熟食|粮油|果蔬|保健品|宠物食品|饲料|食品/ },
    { name: "农林牧渔", test: /种植|养殖|畜牧|渔业|水产|林业|农业|农用|农药|农化|种子|饲料|动物保健/ },
    { name: "医药生物", test: /医药|医疗|医美|医院|中药|化学制药|化学制剂|原料药|生物制品|血液|疫苗|体外诊断|诊断服务|药店/ },
    { name: "银行", test: /银行|农商行|城商行/ },
    { name: "非银金融", test: /证券|保险|信托|期货|多元金融|资产管理|租赁/ },
    { name: "房地产", test: /房地产|住宅开发|商业地产|产业地产|物业管理|房产租赁/ },
    { name: "建筑建材", test: /建筑|装修|装饰|房屋建设|基建|工程咨询|水泥|玻璃|玻纤|瓷砖|管材|耐火|建材|装修建材/ },
    { name: "基础化工", test: /化学|化工|氯碱|纯碱|氮肥|磷肥|复合肥|氨纶|涤纶|粘胶|有机硅|氟化工|涂料|炭黑|聚氨酯|胶黏|塑料|橡胶|化纤|农药/ },
    { name: "机械设备", test: /工程机械|机床|专用设备|通用设备|轨交|船舶|能源及重型|仪器仪表|磨具|印刷包装机械|纺织服装设备/ },
    { name: "军工航空", test: /军工|航天|航空装备|航海装备|地面兵装|国防/ },
    { name: "交通运输", test: /航运|港口|机场|航空运输|公路|铁路|物流|快递|仓储|公交|交运/ },
    { name: "商贸零售", test: /零售|百货|超市|贸易|跨境|专业连锁|一般零售|多业态/ },
    { name: "纺织服装", test: /纺织|服装|家纺|印染|棉纺|鞋/ },
    { name: "家居轻工", test: /家居|家具|包装|造纸|纸|文娱用品|文化用品|饰品|包装印刷|印刷$/ },
    { name: "美容护理", test: /化妆品|美容|个护|洗护/ },
    { name: "社会服务", test: /酒店|旅游|景区|教育|体育|人力资源|会展|检测|专业服务/ },
    { name: "综合", test: /^综合|综合Ⅱ|综合Ⅲ/ }
  ];

  function stripIndustryLevelSuffix(name) {
    return String(name || "")
      .replace(/[ⅠⅡⅢI]{1,3}$/u, "")
      .replace(/[ⅠⅡⅢ]$/u, "")
      .trim();
  }

  function resolveIndustryGroupName(rawName) {
    const name = String(rawName || "");
    const base = stripIndustryLevelSuffix(name);
    for (let i = 0; i < CN_INDUSTRY_GROUP_RULES.length; i++) {
      const rule = CN_INDUSTRY_GROUP_RULES[i];
      if (rule.test.test(name) || rule.test.test(base)) return rule.name;
    }
    return base || name;
  }

  /**
   * 把细分行业板块归并成粗板块
   * - 涨跌幅：按成分总市值加权
   * - 点击时可拉子板块成分股
   */
  function groupCnIndustryBoards(boards) {
    const map = new Map();

    (boards || []).forEach((b) => {
      const groupName = resolveIndustryGroupName(b.name);
      let g = map.get(groupName);
      if (!g) {
        g = {
          name: groupName,
          code: b.code,
          change: 0,
          upCount: 0,
          downCount: 0,
          leader: "",
          leaderChange: null,
          mcap: 0,
          weightedChange: 0,
          children: [],
          _bestLeaderChange: -Infinity,
          _repMcap: 0
        };
        map.set(groupName, g);
      }

      const mcap = Number(b.mcap) > 0 ? Number(b.mcap) : 0;
      g.children.push({ code: b.code, name: b.name, mcap, change: b.change || 0 });
      g.upCount += b.upCount || 0;
      g.downCount += b.downCount || 0;
      g.mcap += mcap;
      g.weightedChange += (b.change || 0) * (mcap || 1);

      const preferred =
        stripIndustryLevelSuffix(b.name) === groupName ||
        /Ⅱ$/.test(b.name) ||
        b.name === groupName;
      if (preferred || mcap >= g._repMcap) {
        g.code = b.code;
        g._repMcap = mcap;
      }

      if (
        b.leader &&
        b.leaderChange != null &&
        b.leaderChange > g._bestLeaderChange
      ) {
        g.leader = b.leader;
        g.leaderChange = b.leaderChange;
        g._bestLeaderChange = b.leaderChange;
      }
    });

    return Array.from(map.values())
      .map((g) => {
        const weight = g.mcap > 0 ? g.mcap : g.children.length || 1;
        const change = round2(g.weightedChange / weight);
        const children = g.children
          .slice()
          .sort((a, b) => b.mcap - a.mcap || b.change - a.change);
        return {
          code: g.code,
          name: g.name,
          change,
          upCount: g.upCount,
          downCount: g.downCount,
          leader: g.leader,
          leaderChange: g.leaderChange,
          childCodes: children.map((c) => c.code),
          childCount: children.length,
          childNames: children.map((c) => c.name)
        };
      })
      .sort((a, b) => b.change - a.change);
  }

  async function loadCnSectorBoards() {
    const fs = "m:90+t:2+f:!50";
    const fields = "f12,f14,f3,f20,f104,f105,f128,f136";
    const pageSize = 100;
    const maxPages = 10;
    const all = [];
    const seen = new Set();

    for (let pn = 1; pn <= maxPages; pn++) {
      const { list: page, total } = await fetchEastClist({
        fs,
        fields,
        pn,
        pz: pageSize
      });

      if (!page.length) break;

      page.forEach((item) => {
        if (!item || item.f14 == null || item.f3 == null || item.f3 === "-") {
          return;
        }
        const code = String(item.f12 || "");
        if (code && seen.has(code)) return;
        const change = Number(item.f3);
        if (Number.isNaN(change)) return;
        if (code) seen.add(code);
        const leaderChange = Number(item.f136);
        const mcap = Number(item.f20);
        all.push({
          code,
          name: String(item.f14),
          change: round2(change),
          mcap: !Number.isNaN(mcap) && mcap > 0 ? mcap : 0,
          upCount: Number(item.f104) || 0,
          downCount: Number(item.f105) || 0,
          leader: item.f128 && item.f128 !== "-" ? String(item.f128) : "",
          leaderChange: Number.isNaN(leaderChange) ? null : round2(leaderChange)
        });
      });

      if (page.length < pageSize || (total > 0 && all.length >= total)) break;
    }

    return groupCnIndustryBoards(all.sort((a, b) => b.change - a.change));
  }

  /**
   * A 股板块成分股（按涨跌幅降序）
   * GET {push2}/api/qt/clist/get  fs=b:BK1625+f:!50  fid=f3
   *
   * @param {string} boardCode 如 BK1625
   * @param {number} [limit=20]
   * @returns {Promise<Array<{ code, name, price, change, market }>>}
   */
  async function loadCnSectorStocks(boardCodeOrCodes, limit = 20) {
    const codes = (Array.isArray(boardCodeOrCodes)
      ? boardCodeOrCodes
      : String(boardCodeOrCodes || "").split(",")
    )
      .map((c) => String(c || "").trim().toUpperCase())
      .filter(Boolean);

    if (!codes.length) throw new Error("缺少板块代码");

    const take = Math.max(1, Math.min(50, Number(limit) || 20));
    // 多子板块时多取一些再合并去重，避免漏掉强势股
    const perBoard = codes.length === 1 ? take : Math.min(50, Math.max(take, 30));

    const pages = await Promise.all(
      codes.map(async (code) => {
        try {
          const { list } = await fetchEastClist({
            fs: "b:" + code + "+f:!50",
            fields: "f12,f13,f14,f2,f3",
            pz: perBoard
          });
          return list;
        } catch (_) {
          return [];
        }
      })
    );

    const seen = new Set();
    const list = [];
    pages.flat().forEach((item) => {
      if (!item || item.f12 == null || item.f3 == null || item.f3 === "-") return;
      const stockCode = String(item.f12);
      if (seen.has(stockCode)) return;
      const change = Number(item.f3);
      if (Number.isNaN(change)) return;
      seen.add(stockCode);
      const price = Number(item.f2);
      const market = item.f13 != null ? Number(item.f13) : null;
      list.push({
        code: stockCode,
        name: String(item.f14 || stockCode),
        price: Number.isNaN(price) || price === 0 ? null : price,
        change: round2(change),
        market: Number.isNaN(market) ? null : market
      });
    });

    return list.sort((a, b) => b.change - a.change).slice(0, take);
  }

  /**
   * 美股三大指数：道琼斯 / 纳斯达克 / 标普500
   * GET {push2}/api/qt/ulist.np/get  secids=100.DJIA,100.NDX,100.SPX
   */
  async function loadUsIndices() {
    const json = await fetchEastUlist(
      "100.DJIA,100.NDX,100.SPX",
      "f2,f3,f12,f14"
    );
    const order = { DJIA: 0, NDX: 1, SPX: 2 };
    const shortName = { DJIA: "道琼斯", NDX: "纳斯达克", SPX: "标普500" };

    return normalizeEastDiff(json)
      .map((item) => {
        if (!item || item.f12 == null || item.f3 == null || item.f3 === "-") {
          return null;
        }
        const code = String(item.f12).toUpperCase();
        const change = Number(item.f3);
        const price = Number(item.f2);
        if (Number.isNaN(change)) return null;
        return {
          code,
          name: shortName[code] || String(item.f14 || code),
          price: Number.isNaN(price) ? null : price,
          change: round2(change)
        };
      })
      .filter(Boolean)
      .sort((a, b) => (order[a.code] ?? 9) - (order[b.code] ?? 9));
  }

  /**
   * 美股主要行业板块（11 个大类）
   * GET {push2}/api/qt/clist/get  fs=m:202+t:2
   */
  async function loadUsSectorBoards() {
    const { list } = await fetchEastClist({
      fs: "m:202+t:2",
      fields: "f12,f14,f2,f3"
    });

    return list
      .map((item) => {
        if (!item || item.f14 == null || item.f3 == null || item.f3 === "-") {
          return null;
        }
        const change = Number(item.f3);
        if (Number.isNaN(change)) return null;
        return {
          code: String(item.f12 || ""),
          name: String(item.f14),
          change: round2(change)
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.change - a.change);
  }

  /**
   * 美股涨幅榜 / 跌幅榜（知名分类股，取前 limit 只）
   * fs 合并东财「科技/半导体/金融/医药/能源…」等知名美股分类
   *
   * @param {"gainers"|"losers"} kind
   * @param {number} [limit=20]
   */
  async function loadUsStockRank(kind = "gainers", limit = 20) {
    const { list } = await fetchEastClist({
      fs: "b:MK0215,b:MK0216,b:MK0217,b:MK0218,b:MK0219,b:MK0220,b:MK0212,b:MK0214",
      fields: "f12,f14,f2,f3",
      pz: Math.max(limit, 20),
      po: kind === "losers" ? 0 : 1
    });

    return list
      .map((item) => {
        if (!item || item.f12 == null || item.f3 == null || item.f3 === "-") {
          return null;
        }
        const change = Number(item.f3);
        const price = Number(item.f2);
        if (Number.isNaN(change)) return null;
        return {
          code: String(item.f12).toUpperCase(),
          name: String(item.f14 || item.f12),
          price: Number.isNaN(price) ? null : price,
          change: round2(change)
        };
      })
      .filter(Boolean)
      .slice(0, limit);
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
    loadUsPreMarketQuotes,
    loadIntradayTrends,
    loadDailyKlines,
    loadStockMarketCap,
    loadStockProfile,
    getMarketKind,
    loadCnSectorBoards,
    loadCnSectorStocks,
    loadUsIndices,
    loadUsSectorBoards,
    loadUsStockRank,
    resolveStock,
    enrichUsPreMarket,
    // 区间计算
    calcPeriodReturns,
    sliceKlinesForRange
  };
})(window);
