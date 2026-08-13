/**
 * 三方行情 / 分时 / K 线接口封装（东方财富、新浪）
 *
 * 引用方式：
 *   <script src="api.js"></script>
 *   之后通过 window.MarketAPI 调用
 *
 * 自选 / 登录见 watchlist-api.js → window.WatchlistAPI
 *
 * 数据源：
 *   1. 东方财富 push2 / push2delay / push2his（实时报价、分时、日 K；push2 不可达时回退 delay）
 *   2. 新浪财经 hq.sinajs.cn（A 股报价兜底；浏览器常因 Referer 被拒）
 *      及 Market_Center 涨跌榜（东财 delay 对 A 股 f3 常为 "-" 时的榜单兜底）
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

  /** 拼接 query：k=encode(v)&... */
  function buildQuery(params) {
    return Object.keys(params)
      .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(params[k]))
      .join("&");
  }

  /**
   * 拼接东财路径+查询串（自动附带 ut、防缓存 _）
   * @param {string} apiPath 如 /api/qt/ulist.np/get
   * @param {Object} params
   */
  function buildEastPath(apiPath, params) {
    const q = buildQuery(params);
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

  /** clist 是否含可用涨跌幅（push2delay 对 A 股常返回 f3="-"） */
  function eastClistHasValidChange(json) {
    return normalizeEastDiff(json).some(
      (item) =>
        item &&
        item.f3 != null &&
        item.f3 !== "-" &&
        !Number.isNaN(Number(item.f3))
    );
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
    fid = "f3",
    requireValidChange = false
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
    const json = await fetchEastMoneyJson(
      EAST_PUSH_HOSTS,
      path,
      requireValidChange ? eastClistHasValidChange : undefined
    );
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
    if (isUsHolding(holding)) {
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
   *   delay 常出现 f2=0，此时用 f18 作展示价
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
   * 美股 gb_ 字段：1现价, 2涨跌幅%
   *
   * @param {Array} holdings
   * @returns {Promise<Object>} code -> { name, price, change }
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
            map[h.code.toUpperCase()] = {
              name: parts[0],
              price,
              change: round2(change)
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
   * 统一实时报价入口（一次只查传入的持仓，由调用方按页传入，不做多页合并）
   * 优先东方财富；失败/空数据则回退新浪。
   *
   * @returns {Promise<Object>} code -> { name, price, change }
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

  /** 东财数值字段：有效数字则返回，否则 null */
  function eastNum(v) {
    if (v == null || v === "-" || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  /** A 股涨跌停幅度：ST 5%、创业/科创/北交 20%、主板 10% */
  function cnLimitRatio(code, name) {
    const c = String(code || "");
    const n = String(name || "");
    if (/\*?ST|退/.test(n)) return 0.05;
    if (/^(300|301|688|689|8|4|92)/.test(c)) return 0.2;
    return 0.1;
  }

  function calcCnLimitPrice(preClose, ratio, up) {
    if (preClose == null || !(preClose > 0)) return null;
    const raw = up ? preClose * (1 + ratio) : preClose * (1 - ratio);
    return Math.round(raw * 100) / 100;
  }

  /** 涨跌停价合理性校验（过滤误把代码等字段当价格） */
  function saneLimitPrice(v, preClose) {
    if (v == null || !(v > 0)) return null;
    if (preClose > 0 && (v > preClose * 2.5 || v < preClose * 0.4)) return null;
    return v;
  }

  /**
   * 个股盘口行情（今开/高低/涨跌停/换手/量比/市盈市净/市值等）
   * ulist：f2最新 f3涨跌幅 f4涨跌额 f5成交量(手) f6成交额 f8换手 f9市盈动
   *        f10量比 f15最高 f16最低 f17今开 f18昨收 f20总市值 f21流通市值 f23市净
   * stock/get：f57涨停 f58跌停（异常时按板幅推算）
   *
   * @returns {Promise<Object>}
   */
  async function loadStockQuoteDetail(holding) {
    const secid = toEastSecId(holding);
    const fields =
      "f2,f3,f4,f5,f6,f8,f9,f10,f12,f14,f15,f16,f17,f18,f20,f21,f23";

    const [ulistResult, limitResult] = await Promise.allSettled([
      fetchEastUlist(secid, fields),
      fetchEastMoneyJson(
        EAST_PUSH_HOSTS,
        buildEastPath("/api/qt/stock/get", {
          fltt: 2,
          invt: 2,
          secid,
          fields: "f57,f58"
        })
      )
    ]);

    if (ulistResult.status !== "fulfilled") {
      throw ulistResult.reason || new Error("暂无行情数据");
    }
    const item = normalizeEastDiff(ulistResult.value)[0];
    if (!item) throw new Error("暂无行情数据");

    const limitData =
      limitResult.status === "fulfilled" ? limitResult.value?.data : null;

    const price = eastNum(item.f2);
    const prev = eastNum(item.f18);
    const live =
      price != null && price !== 0
        ? price
        : prev != null && prev !== 0
          ? prev
          : null;

    const code = item.f12 != null ? String(item.f12) : holding.code;
    const name = item.f14 ? String(item.f14) : holding.name || null;
    const kind = getMarketKind({ code, market: holding.market });

    let limitUp = saneLimitPrice(eastNum(limitData?.f57), prev);
    let limitDown = saneLimitPrice(eastNum(limitData?.f58), prev);
    if (kind === "CN" && prev != null && (limitUp == null || limitDown == null)) {
      const ratio = cnLimitRatio(code, name);
      if (limitUp == null) limitUp = calcCnLimitPrice(prev, ratio, true);
      if (limitDown == null) limitDown = calcCnLimitPrice(prev, ratio, false);
    }

    return {
      name,
      code,
      price: live,
      change: eastNum(item.f3),
      changeAmt: eastNum(item.f4),
      open: eastNum(item.f17),
      high: eastNum(item.f15),
      low: eastNum(item.f16),
      preClose: prev,
      limitUp,
      limitDown,
      turnoverRate: eastNum(item.f8),
      volumeRatio: eastNum(item.f10),
      volume: eastNum(item.f5),
      amount: eastNum(item.f6),
      pe: eastNum(item.f9),
      pb: eastNum(item.f23),
      marketCap: eastNum(item.f20),
      floatCap: eastNum(item.f21)
    };
  }

  // ---------------------------------------------------------------------------
  // 个股资料（市值 + 财报）
  // ---------------------------------------------------------------------------

  const EAST_DC_WEB = "https://datacenter-web.eastmoney.com/api/data/v1/get";
  const EAST_DC_SEC = "https://datacenter.eastmoney.com/securities/api/data/v1/get";

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
    return base + "?" + buildQuery(params);
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

  /** 纯数字代码：去非数字后 pad / 截断至固定长度 */
  function normalizeDigitCode(raw, len, { stripSuffix, fromEnd = false } = {}) {
    let s = String(raw || "").trim();
    if (stripSuffix) s = s.toUpperCase().replace(stripSuffix, "");
    const digits = s.replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length <= len) return digits.padStart(len, "0");
    return fromEnd ? digits.slice(-len) : digits.slice(0, len);
  }

  /** 港股代码：纯数字，左侧补零至 5 位 */
  function normalizeHkCode(raw) {
    return normalizeDigitCode(raw, 5, { stripSuffix: /\.HK$/i, fromEnd: true });
  }

  /** 韩股代码：纯数字，左侧补零至 6 位 */
  function normalizeKrCode(raw) {
    return normalizeDigitCode(raw, 6);
  }

  /**
   * 日股代码：常见 4 位数字（如 7203），亦有字母后缀（如 285A）
   * 去掉 .T / .JP / TYO: 后缀后规范大小写；纯数字左侧补零至 4 位
   */
  function normalizeJpCode(raw) {
    let s = String(raw || "")
      .trim()
      .toUpperCase()
      .replace(/^TYO:/i, "")
      .replace(/\.T$/i, "")
      .replace(/\.JP$/i, "")
      .replace(/\s+/g, "");
    if (!s) return "";
    if (/^\d+$/.test(s)) {
      if (s.length <= 4) return s.padStart(4, "0");
      return s.slice(-4);
    }
    return s;
  }

  /** 用报价接口解析名称；按 markets 顺序尝试 */
  async function resolveFromQuotes(code, markets, ratio, notFoundMsg) {
    for (const market of markets) {
      const quotes = await loadQuotes([{ code, market }]);
      const quote = quotes[quoteKey(code)] || quotes[code];
      if (quote && quote.name) {
        return { name: quote.name, code, market, ratio };
      }
    }
    throw new Error(notFoundMsg);
  }

  /**
   * 根据代码解析股票（名称 + 市场），用于添加自选
   * @param {string} rawCode
   * @param {'CN'|'US'|'HK'|'JP'|'KR'} marketType
   * @returns {Promise<{ name, code, market, ratio }>}
   */
  async function resolveStock(rawCode, marketType) {
    if (!String(rawCode || "").trim()) throw new Error("请输入股票代码");

    if (marketType === "CN") {
      const code = normalizeCnCode(rawCode);
      if (!/^\d{6}$/.test(code)) {
        throw new Error("A股代码应为 6 位数字，如 002245、600519、920001");
      }
      return resolveFromQuotes(
        code,
        inferCnMarketCandidates(code),
        1,
        "未找到该股票，请确认是上交所 / 深交所 / 北交所代码"
      );
    }

    if (marketType === "HK") {
      const code = normalizeHkCode(rawCode);
      if (!/^\d{5}$/.test(code)) {
        throw new Error("港股代码应为数字，如 00700、9988");
      }
      return resolveFromQuotes(code, [116], 1, "未找到该港股，请检查代码");
    }

    if (marketType === "JP") {
      const code = normalizeJpCode(rawCode);
      if (!/^[0-9A-Z]{3,5}$/.test(code)) {
        throw new Error("日股代码如 7203、6758、285A");
      }
      return resolveFromQuotes(code, [176], 1, "未找到该日股，请检查代码");
    }

    if (marketType === "KR") {
      const code = normalizeKrCode(rawCode);
      if (!/^\d{6}$/.test(code)) {
        throw new Error("韩股代码应为 6 位数字，如 005930");
      }
      return resolveFromQuotes(code, [177], 1, "未找到该韩股，请检查代码");
    }

    const code = String(rawCode || "").trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9._\-]{0,9}$/.test(code)) {
      throw new Error("美股代码格式不正确");
    }
    return resolveFromQuotes(code, [105, 106], 5, "未找到该美股，请检查代码");
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

  /**
   * A 股行业板块涨跌幅列表（东方财富）
   * GET {push2|push2delay}/api/qt/clist/get  fs=m:90+t:2+f:!50
   * 注意：东财 fs 分隔符须用 +；单页最多约 100 条，需分页。
   *
   * @returns {Promise<Array<{code,name,change,upCount,downCount,leader,leaderChange,childCodes?,childCount?}>>}
   */
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
   * A 股地域（省）板块列表
   * GET {push2}/api/qt/clist/get  fs=m:90+t:1+f:!50
   * f104 上涨家数, f105 下跌家数, f20 总市值
   *
   * @returns {Promise<Array<{code,name,change,upCount,downCount,mcap}>>}
   */
  async function loadCnRegionBoards() {
    const { list } = await fetchEastClist({
      fs: "m:90+t:1+f:!50",
      fields: "f12,f14,f3,f20,f104,f105",
      pn: 1,
      pz: 50,
      po: 1,
      fid: "f3"
    });

    return list
      .map((item) => {
        if (!item || item.f12 == null || item.f14 == null) return null;
        const changeRaw = item.f3;
        const change =
          changeRaw == null || changeRaw === "-"
            ? null
            : Number(changeRaw);
        const mcap = Number(item.f20);
        const name = String(item.f14).replace(/板块$/u, "");
        return {
          code: String(item.f12),
          name,
          change: change == null || Number.isNaN(change) ? null : round2(change),
          upCount: Number(item.f104) || 0,
          downCount: Number(item.f105) || 0,
          mcap: !Number.isNaN(mcap) && mcap > 0 ? mcap : 0
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity));
  }

  /**
   * A 股板块成分股涨幅 / 跌幅榜
   * GET {push2}/api/qt/clist/get  fs=b:BK1625+f:!50  fid=f3
   *
   * @param {string|string[]} boardCodeOrCodes 如 BK1625
   * @param {number} [limit=20]
   * @param {"gainers"|"losers"} [kind="gainers"]
   * @returns {Promise<Array<{ code, name, price, change, market }>>}
   */
  async function loadCnSectorStocks(boardCodeOrCodes, limit = 20, kind = "gainers") {
    const codes = (Array.isArray(boardCodeOrCodes)
      ? boardCodeOrCodes
      : String(boardCodeOrCodes || "").split(",")
    )
      .map((c) => String(c || "").trim().toUpperCase())
      .filter(Boolean);

    if (!codes.length) throw new Error("缺少板块代码");

    const take = Math.max(1, Math.min(50, Number(limit) || 20));
    const isLosers = kind === "losers";
    // 多子板块时多取一些再合并去重，避免漏掉强弱股
    const perBoard = codes.length === 1 ? take : Math.min(50, Math.max(take, 30));

    const pages = await Promise.all(
      codes.map(async (code) => {
        try {
          const { list } = await fetchEastClist({
            fs: "b:" + code + "+f:!50",
            fields: "f12,f13,f14,f2,f3",
            pz: perBoard,
            po: isLosers ? 0 : 1
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

    return list
      .sort((a, b) => (isLosers ? a.change - b.change : b.change - a.change))
      .slice(0, take);
  }

  /**
   * 按 defs 批量拉指数报价（ulist）
   * @param {Array<{code:string, market:number, name?:string, label?:string}>} defs
   * @param {{ fields?: string, upperCode?: boolean, withBreadth?: boolean }} [opts]
   */
  async function loadIndicesByDefs(defs, opts = {}) {
    const {
      fields = "f2,f3,f12,f14",
      upperCode = false,
      withBreadth = false
    } = opts;
    const json = await fetchEastUlist(
      defs.map((d) => d.market + "." + d.code).join(","),
      fields
    );
    const byCode = new Map();
    normalizeEastDiff(json).forEach((item) => {
      if (!item || item.f12 == null || item.f3 == null || item.f3 === "-") return;
      const change = Number(item.f3);
      const price = Number(item.f2);
      if (Number.isNaN(change)) return;
      let code = String(item.f12);
      if (upperCode) code = code.toUpperCase();
      const entry = {
        code,
        price: Number.isNaN(price) ? null : price,
        change: round2(change)
      };
      if (withBreadth) {
        entry.name = String(item.f14 || item.f12);
        entry.upCount = Number(item.f104) || 0;
        entry.downCount = Number(item.f105) || 0;
        entry.flatCount = Number(item.f106) || 0;
      }
      byCode.set(code, entry);
    });

    return defs
      .map((d) => {
        const key = upperCode ? String(d.code).toUpperCase() : d.code;
        const q = byCode.get(key);
        if (!q) return null;
        const out = { ...q, market: d.market };
        if (d.name != null) out.name = d.name;
        if (d.label != null) out.label = d.label;
        return out;
      })
      .filter(Boolean);
  }

  /**
   * A 股主要市场指数（上交所 / 深交所 / 创业板 / 科创板 / 北交所）
   * GET {push2}/api/qt/ulist.np/get
   * f104 上涨家数, f105 下跌家数, f106 平盘家数
   *
   * @returns {Promise<Array<{code,name,label,market,price,change,upCount,downCount,flatCount}>>}
   */
  async function loadCnIndices() {
    return loadIndicesByDefs(
      [
        { code: "000001", market: 1, label: "上交所" },
        { code: "399001", market: 0, label: "深交所" },
        { code: "399006", market: 0, label: "创业板" },
        { code: "000688", market: 1, label: "科创板" },
        { code: "899050", market: 0, label: "北交所" }
      ],
      {
        fields: "f2,f3,f12,f14,f104,f105,f106",
        withBreadth: true
      }
    );
  }

  /**
   * 市场市场指数 → 成分范围（与指数卡片一一对应）
   * fs 为东财 clist 市场过滤；key 用于人气榜代码筛选
   */
  const CN_INDEX_BOARDS = {
    "000001": { key: "sh", label: "上交所", fs: "m:1+t:2" },
    "399001": { key: "sz", label: "深交所", fs: "m:0+t:6" },
    "399006": { key: "cyb", label: "创业板", fs: "m:0+t:80" },
    "000688": { key: "kcb", label: "科创板", fs: "m:1+t:23" },
    // s:2048：北交所正式挂牌；仅 m:0+t:81 会混入大量新三板，月涨幅常是虚假极端值
    "899050": { key: "bj", label: "北交所", fs: "m:0+t:81+s:2048" }
  };

  function resolveCnIndexBoard(indexCodeOrKey) {
    const raw = String(indexCodeOrKey || "").trim();
    if (!raw) return null;
    if (CN_INDEX_BOARDS[raw]) return { code: raw, ...CN_INDEX_BOARDS[raw] };
    const byKey = Object.entries(CN_INDEX_BOARDS).find(
      ([, v]) => v.key === raw || v.label === raw
    );
    if (byKey) return { code: byKey[0], ...byKey[1] };
    return null;
  }

  /** 人气榜 sc（如 SH600519）或纯代码是否属于某指数范围 */
  function matchesCnIndexBoard(scOrCode, boardKey) {
    const raw = String(scOrCode || "").trim().toUpperCase();
    const code = normalizeCnCode(/^(SH|SZ|BJ)/.test(raw) ? raw.slice(2) : raw);
    if (!code) return false;
    switch (boardKey) {
      case "sh":
        return /^60\d{4}$/.test(code) && !code.startsWith("688");
      case "sz":
        return /^(000|001|002|003)\d{3}$/.test(code);
      case "cyb":
        return /^(300|301)\d{3}$/.test(code);
      case "kcb":
        return code.startsWith("688");
      case "bj":
        return isBjCode(code);
      default:
        return false;
    }
  }

  function hotScToSecId(sc) {
    const s = String(sc || "").trim().toUpperCase();
    if (s.startsWith("SH")) return "1." + s.slice(2);
    if (s.startsWith("SZ") || s.startsWith("BJ")) return "0." + s.slice(2);
    const code = normalizeCnCode(s);
    if (!code) return "";
    const ex = resolveCnExchange(code);
    return (ex === "sh" ? "1." : "0.") + code;
  }

  /** 东财股吧人气榜一页 */
  async function fetchCnHotRankPage(pageNo = 1, pageSize = 100) {
    const resp = await fetch(
      "https://emappdata.eastmoney.com/stockrank/getAllCurrentList",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          appId: "appId01",
          globalId: "786e4c21-70dc-435a-93bb-38",
          marketType: "",
          pageNo: Math.max(1, Number(pageNo) || 1),
          pageSize: Math.max(1, Math.min(100, Number(pageSize) || 100))
        })
      }
    );
    if (!resp.ok) throw new Error("人气榜请求失败");
    const json = await resp.json();
    const rows = Array.isArray(json?.data) ? json.data : [];
    return rows
      .map((row) => {
        const sc = String(row?.sc || "").toUpperCase();
        if (!sc) return null;
        return {
          sc,
          rank: Number(row.rk) || 0,
          code: normalizeCnCode(sc.replace(/^(SH|SZ|BJ)/, ""))
        };
      })
      .filter((x) => x?.code);
  }

  /**
   * 指数范围内人气股（东财人气榜筛选 + ulist 补行情）
   * @param {string} indexCodeOrKey 指数代码如 000001 / key 如 sh
   * @param {number} [limit=20]
   */
  async function loadCnIndexHotStocks(indexCodeOrKey, limit = 20) {
    const board = resolveCnIndexBoard(indexCodeOrKey);
    if (!board) throw new Error("未知市场指数");
    const take = Math.max(1, Math.min(50, Number(limit) || 20));

    const picked = [];
    const seen = new Set();
    for (let page = 1; page <= 5 && picked.length < take; page++) {
      const rows = await fetchCnHotRankPage(page, 100);
      if (!rows.length) break;
      for (const row of rows) {
        if (!matchesCnIndexBoard(row.sc, board.key)) continue;
        if (seen.has(row.code)) continue;
        seen.add(row.code);
        picked.push(row);
        if (picked.length >= take) break;
      }
      if (rows.length < 100) break;
    }
    if (!picked.length) return [];

    const secids = picked
      .map((r) => hotScToSecId(r.sc))
      .filter(Boolean)
      .join(",");
    const json = await fetchEastUlist(secids, "f2,f3,f12,f13,f14");
    const byCode = new Map();
    normalizeEastDiff(json).forEach((item) => {
      if (!item?.f12) return;
      byCode.set(String(item.f12), item);
    });

    return picked
      .map((row) => {
        const q = byCode.get(row.code);
        const price = q ? Number(q.f2) : NaN;
        const changeRaw = q?.f3;
        const change =
          changeRaw == null || changeRaw === "-"
            ? null
            : Number(changeRaw);
        const market = q?.f13 != null ? Number(q.f13) : null;
        return {
          code: row.code,
          name: String(q?.f14 || row.code),
          price: Number.isNaN(price) || price === 0 ? null : price,
          change:
            change == null || Number.isNaN(change) ? null : round2(change),
          market: Number.isNaN(market) ? null : market,
          hotRank: row.rank
        };
      });
  }

  /**
   * 指数范围内近1月涨幅榜（clist fid=f110，约 20 个交易日）
   * @param {string} indexCodeOrKey
   * @param {number} [limit=20]
   */
  async function loadCnIndexMonthGainers(indexCodeOrKey, limit = 20) {
    const board = resolveCnIndexBoard(indexCodeOrKey);
    if (!board) throw new Error("未知市场指数");
    const take = Math.max(1, Math.min(50, Number(limit) || 20));
    // 多取一些，过滤无行情 / 极端异常后再截断
    const { list } = await fetchEastClist({
      fs: board.fs,
      fields: "f12,f13,f14,f2,f3,f110",
      pn: 1,
      pz: Math.min(100, Math.max(take * 4, 40)),
      po: 1,
      fid: "f110"
    });

    return list
      .map((item) => {
        if (!item || item.f12 == null || item.f110 == null || item.f110 === "-") {
          return null;
        }
        // 无最新价/当日涨跌的多为停牌或非挂牌脏数据，月涨幅不可信
        if (item.f2 == null || item.f2 === "-" || item.f3 == null || item.f3 === "-") {
          return null;
        }
        const monthChange = Number(item.f110);
        if (Number.isNaN(monthChange)) return null;
        // 极端值多为计算基期异常（如新三板残留）
        if (Math.abs(monthChange) > 500) return null;
        const price = Number(item.f2);
        const dayChange = Number(item.f3);
        const market = item.f13 != null ? Number(item.f13) : null;
        if (Number.isNaN(price) || price === 0) return null;
        return {
          code: String(item.f12),
          name: String(item.f14 || item.f12),
          price,
          change: round2(monthChange),
          dayChange: Number.isNaN(dayChange) ? null : round2(dayChange),
          market: Number.isNaN(market) ? null : market
        };
      })
      .filter(Boolean)
      .slice(0, take);
  }

  /**
   * 按涨跌幅排序的 clist，统计涨 / 跌家数（二分定位分界页）
   * @param {string} fs
   * @param {0|1} po 1=降序统计上涨，0=升序统计下跌
   */
  async function countMarketSide(fs, po) {
    const pz = 100;
    const wantUp = po === 1;
    const first = await fetchEastClist({
      fs,
      fields: "f3",
      pn: 1,
      pz,
      po,
      fid: "f3"
    });
    const total = first.total || 0;
    if (!total || !first.list.length) return { count: 0, total };

    function sideMatch(raw) {
      if (raw == null || raw === "-") return false;
      const c = Number(raw);
      if (Number.isNaN(c)) return false;
      return wantUp ? c > 0 : c < 0;
    }

    if (!sideMatch(first.list[0].f3)) return { count: 0, total };

    const pages = Math.ceil(total / pz);
    let left = 1;
    let right = pages;
    let lastMatchPage = 1;

    while (left <= right) {
      const mid = (left + right) >> 1;
      const pack =
        mid === 1
          ? first
          : await fetchEastClist({
              fs,
              fields: "f3",
              pn: mid,
              pz,
              po,
              fid: "f3"
            });
      const head = pack.list[0]?.f3;
      if (sideMatch(head)) {
        lastMatchPage = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    let count = (lastMatchPage - 1) * pz;
    const boundary =
      lastMatchPage === 1
        ? first
        : await fetchEastClist({
            fs,
            fields: "f3",
            pn: lastMatchPage,
            pz,
            po,
            fid: "f3"
          });
    for (let i = 0; i < boundary.list.length; i++) {
      if (sideMatch(boundary.list[i].f3)) count += 1;
      else break;
    }
    return { count, total };
  }

  /**
   * 全市场实时涨跌家数
   * @param {string} fs 如 m:177 / m:105,m:106,m:107
   * @returns {Promise<{up:number,down:number,flat:number,total:number}>}
   */
  async function loadMarketBreadth(fs) {
    const [upSide, downSide] = await Promise.all([
      countMarketSide(fs, 1),
      countMarketSide(fs, 0)
    ]);
    const total = Math.max(upSide.total || 0, downSide.total || 0);
    const up = upSide.count || 0;
    const down = downSide.count || 0;
    const flat = Math.max(0, total - up - down);
    return { up, down, flat, total };
  }

  /** 美股三大指数：道琼斯 / 纳斯达克 / 标普500 */
  async function loadUsIndices() {
    return loadIndicesByDefs(
      [
        { code: "DJIA", market: 100, name: "道琼斯" },
        { code: "NDX", market: 100, name: "纳斯达克" },
        { code: "SPX", market: 100, name: "标普500" }
      ],
      { upperCode: true }
    );
  }

  /** 美股全市场涨跌家数（纳斯达克 + 纽交所 + 美交所） */
  async function loadUsMarketBreadth() {
    return loadMarketBreadth("m:105,m:106,m:107");
  }

  /** 韩股主要指数：KOSPI / KOSPI200 */
  async function loadKrIndices() {
    return loadIndicesByDefs(
      [
        { code: "KS11", market: 100, name: "韩国KOSPI" },
        { code: "KOSPI200", market: 100, name: "韩国KOSPI200" }
      ],
      { upperCode: true }
    );
  }

  /** 韩股全市场涨跌家数 */
  async function loadKrMarketBreadth() {
    return loadMarketBreadth("m:177");
  }

  /** 日股主要指数：日经225 */
  async function loadJpIndices() {
    return loadIndicesByDefs(
      [{ code: "N225", market: 100, name: "日经225" }],
      { upperCode: true }
    );
  }

  /** 日股全市场涨跌家数 */
  async function loadJpMarketBreadth() {
    return loadMarketBreadth("m:176");
  }

  /** 港股主要指数：恒生 / 国企 / 恒生科技 */
  async function loadHkIndices() {
    return loadIndicesByDefs(
      [
        { code: "HSI", market: 100, name: "恒生指数" },
        { code: "HSCEI", market: 100, name: "恒生国企" },
        { code: "HSTECH", market: 124, name: "恒生科技" }
      ],
      { upperCode: true }
    );
  }

  /** 港股主板 + 创业板涨跌家数（排除涡轮等） */
  async function loadHkMarketBreadth() {
    return loadMarketBreadth("m:116+t:3,m:116+t:4");
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
   * 美股行业板块
   * - boards：全市场 GICS，用于外层涨跌家数 / 涨跌幅
   * - stockBoards：东财「知名美股」分类，用于弹框成分股榜（GICS 的 b:USx 无成分列表）
   */
  const US_FAMOUS_SECTORS = [
    {
      code: "tech",
      name: "科技类",
      boards: ["US8"],
      stockBoards: ["MK0215"]
    },
    {
      code: "finance",
      name: "金融类",
      boards: ["US7"],
      stockBoards: ["MK0217"]
    },
    {
      code: "medfood",
      name: "医药食品类",
      boards: ["US6", "US5"],
      stockBoards: ["MK0218"]
    },
    {
      code: "media",
      name: "媒体类",
      boards: ["US9"],
      stockBoards: ["MK0220"]
    },
    {
      code: "autoene",
      name: "汽车能源类",
      boards: ["US1", "US4"],
      stockBoards: ["MK0219"]
    }
  ];

  function listUsFamousSectors() {
    return US_FAMOUS_SECTORS.map((s) => ({
      code: s.code,
      name: s.name,
      boards: s.boards.slice(),
      stockBoards: (s.stockBoards || s.boards).slice()
    }));
  }

  function resolveUsFamousSector(codeOrName) {
    const raw = String(codeOrName || "").trim();
    if (!raw) return null;
    const upper = raw.toUpperCase();
    return (
      US_FAMOUS_SECTORS.find(
        (s) =>
          s.code === raw ||
          s.code.toUpperCase() === upper ||
          s.name === raw ||
          s.boards.some((b) => b.toUpperCase() === upper) ||
          (s.stockBoards || []).some((b) => b.toUpperCase() === upper)
      ) || null
    );
  }

  function usSectorFs(sector, { forStocks = false } = {}) {
    const codes = forStocks
      ? sector.stockBoards || sector.boards || [sector.code]
      : sector.boards || [sector.code];
    return codes.map((b) => "b:" + b).join(",");
  }

  /**
   * 美股行业列表（涨/跌家数 + 涨跌幅）
   * 用 m:202 板块指数自带 f104/f105/f3/f20；多子板块按市值加权涨跌幅
   * @returns {Promise<Array<{code,name,upCount,downCount,flatCount,change,mcap,total}>>}
   */
  async function loadUsFamousSectorStats() {
    const { list } = await fetchEastClist({
      fs: "m:202+t:2",
      fields: "f12,f14,f3,f20,f104,f105,f106",
      pn: 1,
      pz: 20,
      po: 1,
      fid: "f3"
    });
    const byCode = new Map();
    list.forEach((item) => {
      if (!item?.f12) return;
      const mcap = Number(item.f20);
      const changeRaw = item.f3;
      const change =
        changeRaw == null || changeRaw === "-"
          ? null
          : Number(changeRaw);
      byCode.set(String(item.f12).toUpperCase(), {
        upCount: Number(item.f104) || 0,
        downCount: Number(item.f105) || 0,
        flatCount: Number(item.f106) || 0,
        mcap: !Number.isNaN(mcap) && mcap > 0 ? mcap : 0,
        change: change == null || Number.isNaN(change) ? null : change
      });
    });

    return US_FAMOUS_SECTORS.map((sector) => {
      let upCount = 0;
      let downCount = 0;
      let flatCount = 0;
      let mcap = 0;
      let weighted = 0;
      let weight = 0;
      for (const board of sector.boards) {
        const row = byCode.get(String(board).toUpperCase());
        if (!row) continue;
        upCount += row.upCount;
        downCount += row.downCount;
        flatCount += row.flatCount;
        mcap += row.mcap;
        if (row.change != null && row.mcap > 0) {
          weighted += row.change * row.mcap;
          weight += row.mcap;
        } else if (row.change != null && weight === 0) {
          weighted += row.change;
          weight += 1;
        }
      }
      return {
        code: sector.code,
        name: sector.name,
        upCount,
        downCount,
        flatCount,
        change: weight > 0 ? round2(weighted / weight) : null,
        mcap,
        total: upCount + downCount + flatCount
      };
    });
  }

  /**
   * 美股行业成分股榜（知名美股分类池，弹框人气 / 涨跌幅）
   * - hot：按成交额（人气）
   * - gainers / losers：按涨跌幅
   *
   * @param {string} boardCodeOrName tech / 科技类 / MK0215
   * @param {"hot"|"gainers"|"losers"} [kind=hot]
   * @param {number} [limit=20]
   */
  async function loadUsSectorStocks(
    boardCodeOrName,
    kind = "hot",
    limit = 20
  ) {
    const sector = resolveUsFamousSector(boardCodeOrName);
    if (!sector) throw new Error("未知美股行业板块");
    const take = Math.max(1, Math.min(50, Number(limit) || 20));
    const rank =
      kind === "losers" ? "losers" : kind === "gainers" ? "gainers" : "hot";
    const fid = rank === "hot" ? "f6" : "f3";
    const po = rank === "losers" ? 0 : 1;

    const { list } = await fetchEastClist({
      fs: usSectorFs(sector, { forStocks: true }),
      fields: "f12,f13,f14,f2,f3,f6",
      pn: 1,
      pz: take,
      po,
      fid
    });

    return mapEastRankItems(list, take, {
      upperCode: true,
      zeroPriceNull: false,
      defaultMarket: 105
    }).map((item, i) =>
      rank === "hot" ? { ...item, hotRank: i + 1 } : item
    );
  }

  /**
   * 映射东财涨跌榜行；f3 为 "-" / 无效时丢弃
   * （push2delay 对 A 股常返回 f2/f3="-"，海外市场正常）
   * @param {{ upperCode?: boolean, zeroPriceNull?: boolean, defaultMarket?: number|null }} [opts]
   */
  function mapEastRankItems(list, take, opts = {}) {
    const {
      upperCode = false,
      zeroPriceNull = true,
      defaultMarket = null
    } = opts;
    return (list || [])
      .map((item) => {
        if (!item || item.f12 == null || item.f3 == null || item.f3 === "-") {
          return null;
        }
        const change = Number(item.f3);
        const price = Number(item.f2);
        if (Number.isNaN(change)) return null;
        const market = item.f13 != null ? Number(item.f13) : defaultMarket;
        let code = String(item.f12);
        if (upperCode) code = code.toUpperCase();
        return {
          code,
          name: String(item.f14 || item.f12),
          price:
            Number.isNaN(price) || (zeroPriceNull && price === 0)
              ? null
              : price,
          change: round2(change),
          market: Number.isNaN(market) ? defaultMarket : market
        };
      })
      .filter(Boolean)
      .slice(0, take);
  }

  /**
   * 通用东财涨跌榜（clist + fid=f3）
   * @param {string} fs
   * @param {"gainers"|"losers"} kind
   * @param {number} [limit]
   * @param {number} [page]
   * @param {Parameters<typeof mapEastRankItems>[2]} [mapOpts]
   */
  async function loadStockRankByFs(
    fs,
    kind = "gainers",
    limit = 10,
    page = 1,
    mapOpts = {}
  ) {
    const take = Math.max(1, Math.min(100, Number(limit) || 10));
    const pn = Math.max(1, Number(page) || 1);
    const { list, total } = await fetchEastClist({
      fs,
      fields: "f12,f13,f14,f2,f3",
      pn,
      pz: take,
      po: kind === "losers" ? 0 : 1
    });
    return {
      list: mapEastRankItems(list, take, mapOpts),
      total: Number(total) || 0
    };
  }

  /**
   * 新浪 A 股涨跌榜兜底（东财 delay 无 A 股涨跌幅时使用）
   * GET .../Market_Center.getHQNodeDataSimple  node=hs_a
   */
  async function loadCnStockRankFromSina(kind = "gainers", limit = 10, page = 1) {
    const take = Math.max(1, Math.min(100, Number(limit) || 10));
    const pn = Math.max(1, Number(page) || 1);
    // 多取一些，过滤停牌/无行情占位后再截断
    const fetchNum = Math.min(100, Math.max(take * 5, 40));
    const asc = kind === "losers" ? "1" : "0";
    const url =
      "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeDataSimple" +
      "?page=" +
      pn +
      "&num=" +
      fetchNum +
      "&sort=changepercent&asc=" +
      asc +
      "&node=hs_a&_=" +
      Date.now();

    const resp = await fetch(url, {
      headers: { Accept: "application/json" }
    });
    if (!resp.ok) throw new Error("新浪 A 股涨跌榜请求失败");
    const rows = await resp.json();
    if (!Array.isArray(rows)) throw new Error("新浪 A 股涨跌榜返回无效");

    const list = rows
      .map((item) => {
        if (!item || item.code == null) return null;
        const change = Number(item.changepercent);
        if (Number.isNaN(change)) return null;
        const trade = Number(item.trade);
        const settle = Number(item.settlement);
        // 无最新价且涨跌为 0：多为未开盘/停牌占位
        if ((Number.isNaN(trade) || trade === 0) && change === 0) return null;
        const code = normalizeCnCode(item.code);
        if (!code) return null;
        const ex = resolveCnExchange(code);
        const price =
          !Number.isNaN(trade) && trade !== 0
            ? trade
            : !Number.isNaN(settle) && settle !== 0
              ? settle
              : null;
        return {
          code,
          name: String(item.name || code),
          price,
          change: round2(change),
          market: ex === "sh" ? 1 : 0
        };
      })
      .filter(Boolean)
      .slice(0, take);

    let total = 0;
    try {
      const countResp = await fetch(
        "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeStockCount?node=hs_a&_=" +
          Date.now(),
        { headers: { Accept: "application/json" } }
      );
      if (countResp.ok) {
        total = Number(await countResp.json()) || 0;
      }
    } catch {
      /* ignore */
    }

    return { list, total: total || list.length };
  }

  /**
   * A 股涨幅榜 / 跌幅榜（沪深京 A 股，分页）
   * 优先东财 clist；push2 不可达或 delay 涨跌幅全为 "-" 时回退新浪
   *
   * @param {"gainers"|"losers"} kind
   * @param {number} [limit=10]
   * @param {number} [page=1]
   * @returns {Promise<{ list: Array<{ code, name, price, change, market }>, total: number }>}
   */
  async function loadCnStockRank(kind = "gainers", limit = 10, page = 1) {
    const take = Math.max(1, Math.min(100, Number(limit) || 10));
    const pn = Math.max(1, Number(page) || 1);

    try {
      const { list, total } = await fetchEastClist({
        fs: "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048",
        fields: "f12,f13,f14,f2,f3",
        pn,
        pz: take,
        po: kind === "losers" ? 0 : 1,
        requireValidChange: true
      });
      const mapped = mapEastRankItems(list, take);
      if (mapped.length) {
        return { list: mapped, total: Number(total) || 0 };
      }
    } catch {
      /* 东财失败或 delay 无有效涨跌幅 → 新浪 */
    }

    return loadCnStockRankFromSina(kind, take, pn);
  }

  /**
   * 美股涨幅榜 / 跌幅榜（知名分类股，分页）
   * fs 合并东财「科技/半导体/金融/医药/能源…」等知名美股分类
   */
  async function loadUsStockRank(kind = "gainers", limit = 10, page = 1) {
    return loadStockRankByFs(
      "b:MK0215,b:MK0216,b:MK0217,b:MK0218,b:MK0219,b:MK0220,b:MK0212,b:MK0214",
      kind,
      limit,
      page,
      { upperCode: true, zeroPriceNull: false, defaultMarket: 105 }
    );
  }

  /** 韩股涨幅榜 / 跌幅榜（东财 market=177，分页） */
  async function loadKrStockRank(kind = "gainers", limit = 10, page = 1) {
    return loadStockRankByFs("m:177", kind, limit, page, {
      defaultMarket: 177
    });
  }

  /** 日股涨幅榜 / 跌幅榜（东财 market=176，分页） */
  async function loadJpStockRank(kind = "gainers", limit = 10, page = 1) {
    return loadStockRankByFs("m:176", kind, limit, page, {
      defaultMarket: 176
    });
  }

  /** 港股涨幅榜 / 跌幅榜（主板 + 创业板，分页） */
  async function loadHkStockRank(kind = "gainers", limit = 10, page = 1) {
    return loadStockRankByFs("m:116+t:3,m:116+t:4", kind, limit, page, {
      defaultMarket: 116
    });
  }

  /**
   * 开放式基金阶段涨幅排行
   * period: month=近1月, 3m=近3月, 6m=近6月, 1y=近1年
   *
   * 浏览器直连东财数据中心 RPT_FUND_RANK（CORS *，不走天天基金 App 风控）。
   */
  const FUND_RANK_PERIOD = {
    month: { sort: "CHANGE_MONTH", field: "CHANGE_MONTH", label: "近1月" },
    "3m": { sort: "CHANGE_3MONTHS", field: "CHANGE_3MONTHS", label: "近3月" },
    "6m": { sort: "CHANGE_6MONTHS", field: "CHANGE_6MONTHS", label: "近6月" },
    "1y": { sort: "CHANGE_YEAR", field: "CHANGE_YEAR", label: "近1年" }
  };

  const FUND_RANK_DC_HOSTS = [
    "https://datacenter.eastmoney.com/securities/api/data/v1/get",
    "https://datacenter-web.eastmoney.com/api/data/v1/get"
  ];

  function parseFundRankPct(raw) {
    if (raw == null || raw === "" || raw === "-" || raw === "--") return null;
    const n = Number(raw);
    return Number.isNaN(n) ? null : round2(n);
  }

  function mapFundDcRankRows(rows, meta, period, take) {
    const seen = new Set();
    return (Array.isArray(rows) ? rows : [])
      .map((row) => {
        const code = String(row?.SECURITY_CODE || "").trim();
        if (!code || seen.has(code)) return null;
        const change = parseFundRankPct(row[meta.field]);
        if (change == null) return null;
        seen.add(code);
        const nav = Number(row.PER_NAV);
        const dateRaw = String(row.NAV_DATE || "");
        return {
          code,
          name: String(row.FUND_NAME || code),
          date: dateRaw.slice(0, 10),
          nav: Number.isNaN(nav) ? null : nav,
          dayChange: parseFundRankPct(row.CHANGE),
          change,
          period,
          periodLabel: meta.label
        };
      })
      .filter(Boolean)
      .slice(0, take);
  }

  async function loadOpenFundRankFromDataCenter(period, take, meta) {
    const params = {
      reportName: "RPT_FUND_RANK",
      columns:
        "SECURITY_CODE,FUND_NAME,PER_NAV,CHANGE,CHANGE_MONTH,CHANGE_3MONTHS,CHANGE_6MONTHS,CHANGE_YEAR,NAV_DATE,FUND_TYPE,OPERATE_MODE",
      filter: '(FUND_TYPE<>"全部")',
      pageNumber: "1",
      // 多取一些，去重「全部/分类」重复行后仍够 take
      pageSize: String(Math.min(100, Math.max(take * 3, take))),
      sortTypes: "-1",
      sortColumns: meta.sort,
      source: "WEB",
      client: "WEB",
      _: String(Date.now())
    };
    const qs = buildQuery(params);
    let lastError = null;

    for (let i = 0; i < FUND_RANK_DC_HOSTS.length; i++) {
      try {
        const resp = await fetch(FUND_RANK_DC_HOSTS[i] + "?" + qs, {
          headers: { Accept: "application/json" }
        });
        if (!resp.ok) {
          lastError = new Error("基金排行请求失败（" + resp.status + "）");
          continue;
        }
        const json = await resp.json();
        if (!json?.success) {
          lastError = new Error(json?.message || "基金排行暂不可用");
          continue;
        }
        const list = mapFundDcRankRows(json?.result?.data, meta, period, take);
        if (!list.length) {
          lastError = new Error("暂无基金排行数据");
          continue;
        }
        return {
          list,
          total: Number(json?.result?.count) || list.length,
          period,
          periodLabel: meta.label
        };
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error("基金排行加载失败");
  }

  async function loadOpenFundRank(period = "month", limit = 20) {
    const meta = FUND_RANK_PERIOD[period] || FUND_RANK_PERIOD.month;
    const take = Math.max(1, Math.min(50, Number(limit) || 20));
    const resolvedPeriod = period in FUND_RANK_PERIOD ? period : "month";
    return loadOpenFundRankFromDataCenter(resolvedPeriod, take, meta);
  }

  /**
   * 基金详情（概况 / 阶段涨幅 / 持仓 / 历史净值）
   * 浏览器直连：
   *   1) 东财数据中心 RPT_FUND_RANK + pingzhongdata.js（稳，不依赖本地代理）
   *   2) 可选增强：fundmobapi 持仓 / 历史净值（有 CORS，偶发风控则跳过）
   */
  const FUND_DETAIL_PERIODS = [
    { key: "Z", title: "近1周", field: "CHANGE_7DAYS" },
    { key: "Y", title: "近1月", field: "CHANGE_MONTH" },
    { key: "3Y", title: "近3月", field: "CHANGE_3MONTHS" },
    { key: "6Y", title: "近6月", field: "CHANGE_6MONTHS" },
    { key: "1N", title: "近1年", field: "CHANGE_YEAR" },
    { key: "2Y", title: "近2年", field: "CHANGE_2YEARS" },
    { key: "3N", title: "近3年", field: "CHANGE_3YEARS" },
    { key: "5N", title: "近5年", field: "CHANGE_5YEARS" },
    { key: "JN", title: "今年来", field: "CHANGE_YIELD" },
    { key: "LN", title: "成立来", field: "CHANGE_FOUNDLD" }
  ];

  function fmtFundDateMs(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n)) return "";
    // 东财净值点多为北京时间零点的 UTC 毫秒
    return new Date(n + 8 * 3600 * 1000).toISOString().slice(0, 10);
  }

  function fundDetailDeviceId() {
    const key = "fund_detail_device_v1";
    try {
      const saved = localStorage.getItem(key);
      if (saved && saved.length >= 8) return saved;
    } catch {
      /* ignore */
    }
    const id =
      "web-" +
      Math.random().toString(16).slice(2) +
      Date.now().toString(16);
    try {
      localStorage.setItem(key, id);
    } catch {
      /* ignore */
    }
    return id;
  }

  async function fetchFundDcDetailRow(fundCode) {
    const params = {
      reportName: "RPT_FUND_RANK",
      columns: "ALL",
      filter: `(SECURITY_CODE="${fundCode}")(FUND_TYPE<>"全部")`,
      pageNumber: "1",
      pageSize: "5",
      source: "WEB",
      client: "WEB",
      _: String(Date.now())
    };
    const qs = buildQuery(params);
    let lastError = null;
    for (let i = 0; i < FUND_RANK_DC_HOSTS.length; i++) {
      try {
        const resp = await fetch(FUND_RANK_DC_HOSTS[i] + "?" + qs, {
          headers: { Accept: "application/json" }
        });
        if (!resp.ok) {
          lastError = new Error("基金概况请求失败（" + resp.status + "）");
          continue;
        }
        const json = await resp.json();
        if (!json?.success) {
          lastError = new Error(json?.message || "基金概况暂不可用");
          continue;
        }
        const rows = Array.isArray(json?.result?.data) ? json.result.data : [];
        const row =
          rows.find((x) => x && x.OPERATE_MODE) ||
          rows.find((x) => x && x.SECURITY_CODE) ||
          null;
        if (!row) {
          lastError = new Error("暂无该基金概况");
          continue;
        }
        return row;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error("基金概况加载失败");
  }

  let pingzhongChain = Promise.resolve();

  function loadFundPingzhongPack(fundCode, timeoutMs = 12000) {
    const run = () =>
      new Promise((resolve, reject) => {
        const keys = [
          "fS_name",
          "fS_code",
          "syl_1y",
          "syl_3y",
          "syl_6y",
          "syl_1n",
          "Data_netWorthTrend",
          "stockCodesNew",
          "Data_currentFundManager"
        ];
        const saved = {};
        keys.forEach((k) => {
          saved[k] = global[k];
          try {
            delete global[k];
          } catch {
            global[k] = undefined;
          }
        });

        const script = document.createElement("script");
        script.charset = "utf-8";
        script.src =
          "https://fund.eastmoney.com/pingzhongdata/" +
          fundCode +
          ".js?_=" +
          Date.now();

        const timer = setTimeout(() => {
          cleanup(true);
          reject(new Error("净值走势加载超时"));
        }, timeoutMs);

        function restore() {
          keys.forEach((k) => {
            if (saved[k] === undefined) {
              try {
                delete global[k];
              } catch {
                global[k] = undefined;
              }
            } else {
              global[k] = saved[k];
            }
          });
        }

        function cleanup(failed) {
          clearTimeout(timer);
          script.onload = null;
          script.onerror = null;
          script.remove();
          if (failed) restore();
        }

        script.onload = () => {
          try {
            const pack = {
              name: global.fS_name != null ? String(global.fS_name) : "",
              code: global.fS_code != null ? String(global.fS_code) : fundCode,
              syl_1y: global.syl_1y,
              syl_3y: global.syl_3y,
              syl_6y: global.syl_6y,
              syl_1n: global.syl_1n,
              trend: Array.isArray(global.Data_netWorthTrend)
                ? global.Data_netWorthTrend.slice()
                : [],
              stockCodesNew: Array.isArray(global.stockCodesNew)
                ? global.stockCodesNew.slice()
                : [],
              managers: Array.isArray(global.Data_currentFundManager)
                ? global.Data_currentFundManager.slice()
                : []
            };
            restore();
            cleanup(false);
            resolve(pack);
          } catch (err) {
            cleanup(true);
            reject(err);
          }
        };

        script.onerror = () => {
          cleanup(true);
          reject(new Error("净值走势脚本加载失败"));
        };

        document.head.appendChild(script);
      });

    const next = pingzhongChain.then(run, run);
    pingzhongChain = next.then(
      () => {},
      () => {}
    );
    return next;
  }

  function mapFundDetailFromDcRow(row, fundCode) {
    const nav = Number(row?.PER_NAV);
    const scaleRaw = Number(row?.FUND_SCALE);
    return {
      code: String(row?.SECURITY_CODE || fundCode),
      name: String(row?.FUND_NAME || fundCode),
      type: row?.FUND_TYPE || "",
      company: row?.ORG_NAME || "",
      theme: "",
      establishDate: String(row?.START_DATE || "").slice(0, 10),
      navDate: String(row?.NAV_DATE || "").slice(0, 10),
      nav: Number.isNaN(nav) ? null : nav,
      accNav: null,
      dayChange: parseFundRankPct(row?.CHANGE),
      buyStatus: "",
      redeemStatus: "",
      riskLevel: row?.RISK_LEVE || "",
      bench: "",
      scale:
        Number.isNaN(scaleRaw) || scaleRaw <= 0
          ? null
          : round2(scaleRaw / 1e8),
      scaleDate: "",
      comment: ""
    };
  }

  function mapFundDetailPeriodsFromDc(row) {
    return FUND_DETAIL_PERIODS.map((meta) => ({
      key: meta.key,
      title: meta.title,
      change: parseFundRankPct(row?.[meta.field]),
      avg: null,
      hs300: null,
      rank: ""
    })).filter((x) => x.change != null);
  }

  function mapFundDetailFromPingzhong(pack, fundCode) {
    const last = pack?.trend?.length
      ? pack.trend[pack.trend.length - 1]
      : null;
    const nav = last != null ? Number(last.y) : null;
    return {
      code: String(pack?.code || fundCode),
      name: String(pack?.name || fundCode),
      type: "",
      company: "",
      theme: "",
      establishDate: "",
      navDate: last ? fmtFundDateMs(last.x) : "",
      nav: Number.isNaN(nav) ? null : nav,
      accNav: null,
      dayChange: parseFundRankPct(last?.equityReturn),
      buyStatus: "",
      redeemStatus: "",
      riskLevel: "",
      bench: "",
      scale: null,
      scaleDate: "",
      comment: ""
    };
  }

  function mapFundDetailPeriodsFromPingzhong(pack) {
    const pairs = [
      { key: "Y", title: "近1月", raw: pack?.syl_1y },
      { key: "3Y", title: "近3月", raw: pack?.syl_3y },
      { key: "6Y", title: "近6月", raw: pack?.syl_6y },
      { key: "1N", title: "近1年", raw: pack?.syl_1n }
    ];
    return pairs
      .map((x) => ({
        key: x.key,
        title: x.title,
        change: parseFundRankPct(x.raw),
        avg: null,
        hs300: null,
        rank: ""
      }))
      .filter((x) => x.change != null);
  }

  function mapFundNavFromPingzhong(trend) {
    return (Array.isArray(trend) ? trend : [])
      .map((row) => {
        const nav = Number(row?.y);
        return {
          date: fmtFundDateMs(row?.x),
          nav: Number.isNaN(nav) ? null : nav,
          accNav: null,
          dayChange: parseFundRankPct(row?.equityReturn)
        };
      })
      .filter((x) => x.date && x.nav != null);
  }

  function mapFundHoldingsFromPingzhong(stockCodesNew) {
    const list = (Array.isArray(stockCodesNew) ? stockCodesNew : [])
      .map((sec, i) => {
        const raw = String(sec || "").trim();
        const m = raw.match(/^(\d+)\.(\d{1,6})$/);
        if (!m) return null;
        const market = Number(m[1]);
        let code = m[2];
        // A 股补齐 6 位；港股等保持原位数（如 03939）
        if ((market === 0 || market === 1) && code.length < 6) {
          code = code.padStart(6, "0");
        }
        return {
          rank: i + 1,
          code,
          name: code,
          ratio: null,
          changeType: "",
          change: null,
          market,
          sector: ""
        };
      })
      .filter(Boolean);
    return { asOf: "", list };
  }

  function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error((label || "请求") + "超时")),
        ms
      );
      Promise.resolve(promise).then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  function mapFundMobHoldings(pack) {
    const stocks = pack?.Datas?.fundStocks || pack?.fundStocks || [];
    const asOf = pack?.Expansion || "";
    const list = (Array.isArray(stocks) ? stocks : [])
      .map((row, i) => {
        const ratio = Number(row.JZBL);
        const mkt = Number(row.NEWTEXCH);
        return {
          rank: i + 1,
          code: String(row.GPDM || ""),
          name: String(row.GPJC || row.GPDM || ""),
          ratio: Number.isNaN(ratio) ? null : round2(ratio),
          changeType: row.PCTNVCHGTYPE || "",
          change: parseFundRankPct(row.PCTNVCHG),
          market: Number.isNaN(mkt) ? null : mkt,
          sector: row.INDEXNAME || ""
        };
      })
      .filter((x) => x.code);
    return { asOf: typeof asOf === "string" ? asOf : "", list };
  }

  function mapFundMobNavHistory(rows) {
    return (Array.isArray(rows) ? rows : [])
      .map((row) => {
        const nav = Number(row.DWJZ);
        const accNav = Number(row.LJJZ);
        return {
          date: row.FSRQ || "",
          nav: Number.isNaN(nav) ? null : nav,
          accNav: Number.isNaN(accNav) ? null : accNav,
          dayChange: parseFundRankPct(row.JZZZL)
        };
      })
      .filter((x) => x.date && x.nav != null);
  }

  async function fetchFundMobJson(apiPath, extra) {
    const deviceid = fundDetailDeviceId();
    const url =
      "https://fundmobapi.eastmoney.com/FundMNewApi/" +
      apiPath +
      "?" +
      buildQuery({
        plat: "Iphone",
        product: "EFund",
        version: "6.5.5",
        AppVersion: "6.5.5",
        deviceid,
        MobileKey: deviceid,
        passportid: "0",
        OSVersion: "14.3",
        appType: "ttjj",
        userId: "",
        ...extra,
        _: String(Date.now())
      });
    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) throw new Error(apiPath + " 请求失败（" + resp.status + "）");
    const json = await resp.json();
    if (
      json?.Success === false ||
      (json?.ErrCode && Number(json.ErrCode) !== 0)
    ) {
      throw new Error(
        json?.ErrMsg || json?.ErrorMessage || apiPath + " 暂不可用"
      );
    }
    return json;
  }

  async function loadFundDetail(code) {
    const raw = String(code || "").trim().replace(/\D/g, "");
    if (!raw) throw new Error("缺少基金代码");
    const fundCode = raw.padStart(6, "0").slice(-6);
    const warnings = [];

    // 1) 先直连稳妥源：数据中心概况 + pingzhong 净值/持仓代码
    const [dcSettled, pzSettled] = await Promise.allSettled([
      fetchFundDcDetailRow(fundCode),
      loadFundPingzhongPack(fundCode)
    ]);

    if (dcSettled.status !== "fulfilled" && pzSettled.status !== "fulfilled") {
      throw new Error(
        dcSettled.reason?.message ||
          pzSettled.reason?.message ||
          "基金详情加载失败"
      );
    }

    const dcRow =
      dcSettled.status === "fulfilled" ? dcSettled.value : null;
    const pz =
      pzSettled.status === "fulfilled" ? pzSettled.value : null;

    const basic = dcRow
      ? mapFundDetailFromDcRow(dcRow, fundCode)
      : mapFundDetailFromPingzhong(pz, fundCode);
    if (pz?.name && (!basic.name || basic.name === fundCode)) {
      basic.name = pz.name;
    }

    let periods = dcRow
      ? mapFundDetailPeriodsFromDc(dcRow)
      : mapFundDetailPeriodsFromPingzhong(pz);
    if (!periods.length && pz) {
      periods = mapFundDetailPeriodsFromPingzhong(pz);
    }

    // 净值优先用 pingzhong（不走 App 风控）
    let chart = [];
    let history = [];
    if (pz?.trend?.length) {
      const fromPz = mapFundNavFromPingzhong(pz.trend);
      chart = fromPz;
      history = fromPz.slice().reverse().slice(0, 30);
    }

    let holdings = mapFundHoldingsFromPingzhong(pz?.stockCodesNew);

    // 2) 短超时尝试 App 接口增强持仓比例 / 累计净值（失败不影响主流程）
    const mobBoost = await Promise.allSettled([
      withTimeout(
        fetchFundMobJson("FundMNInverstPosition", { FCODE: fundCode }),
        4500,
        "持仓"
      ),
      withTimeout(
        fetchFundMobJson("FundMNHisNetList", {
          FCODE: fundCode,
          pageIndex: "1",
          pageSize: "40"
        }),
        4500,
        "净值"
      ),
      withTimeout(
        fetchFundMobJson("FundMNPeriodIncrease", { FCODE: fundCode }),
        4500,
        "阶段涨幅"
      )
    ]);

    if (mobBoost[0].status === "fulfilled") {
      const rich = mapFundMobHoldings(mobBoost[0].value);
      if (rich.list.length) holdings = rich;
    } else if (!holdings.list.length) {
      warnings.push("持仓暂不可用");
    }

    if (mobBoost[1].status === "fulfilled") {
      const mobHist = mapFundMobNavHistory(mobBoost[1].value?.Datas || []);
      if (mobHist.length) {
        // App 净值含累计净值，列表优先用它；走势图仍用 pingzhong 全量更平滑
        history = mobHist.slice(0, 30);
        if (!chart.length) chart = mobHist.slice().reverse();
      }
    }

    if (mobBoost[2].status === "fulfilled") {
      const rows = Array.isArray(mobBoost[2].value?.Datas)
        ? mobBoost[2].value.Datas
        : [];
      const titles = {
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
      const richPeriods = rows
        .map((row) => {
          const key = row.title || "";
          const title = titles[key] || key;
          if (!title) return null;
          return {
            key,
            title,
            change: parseFundRankPct(row.syl),
            avg: parseFundRankPct(row.avg),
            hs300: parseFundRankPct(row.hs300),
            rank: row.rank && row.sc ? `${row.rank}/${row.sc}` : ""
          };
        })
        .filter((x) => x && x.change != null);
      if (richPeriods.length) periods = richPeriods;
    }

    if (!history.length) warnings.push("历史净值加载失败");
    if (pzSettled.status !== "fulfilled" && !chart.length) {
      warnings.push("净值走势加载失败");
    }

    if (!basic?.name && basic?.nav == null) {
      throw new Error("暂无该基金详情");
    }

    return {
      code: fundCode,
      basic,
      periods,
      holdings,
      history: history.slice(0, 30),
      chart,
      warnings: warnings.filter(Boolean)
    };
  }

  global.MarketAPI = {
    // 工具
    quoteKey,
    toEastSecId,
    toSinaSymbol,
    isUsHolding,
    normalizeCnCode,
    inferCnMarketCandidates,
    normalizeHkCode,
    normalizeJpCode,
    normalizeKrCode,
    // 请求（东方财富 / 新浪等三方）
    loadQuotes,
    loadEastMoneyQuotes,
    loadSinaQuotes,
    loadIntradayTrends,
    loadDailyKlines,
    loadStockMarketCap,
    loadStockQuoteDetail,
    loadStockProfile,
    getMarketKind,
    loadCnSectorBoards,
    loadCnRegionBoards,
    loadCnSectorStocks,
    loadCnStockRank,
    loadCnIndices,
    loadCnIndexHotStocks,
    loadCnIndexMonthGainers,
    resolveCnIndexBoard,
    loadUsIndices,
    loadUsSectorBoards,
    listUsFamousSectors,
    resolveUsFamousSector,
    loadUsFamousSectorStats,
    loadUsSectorStocks,
    loadUsStockRank,
    loadUsMarketBreadth,
    loadJpIndices,
    loadJpStockRank,
    loadJpMarketBreadth,
    loadKrIndices,
    loadKrStockRank,
    loadKrMarketBreadth,
    loadHkIndices,
    loadHkStockRank,
    loadHkMarketBreadth,
    loadOpenFundRank,
    loadFundDetail,
    resolveStock,
    // 区间计算
    calcPeriodReturns,
    sliceKlinesForRange
  };
})(window);
