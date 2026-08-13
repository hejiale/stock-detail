    const {
      quoteKey,
      loadQuotes,
      loadIntradayTrends,
      loadDailyKlines,
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
      listUsFamousSectors,
      loadUsFamousSectorStats,
      loadUsSectorStocks,
      loadUsStockRank,
      loadUsMarketBreadth,
      loadJpStockRank,
      loadJpIndices,
      loadJpMarketBreadth,
      loadKrStockRank,
      loadKrIndices,
      loadKrMarketBreadth,
      loadHkStockRank,
      loadHkIndices,
      loadHkMarketBreadth,
      loadMetalsQuotes,
      loadCryptoQuotes,
      loadCryptoDetail,
      loadOpenFundRank,
      loadFundDetail,
      normalizeFundCode,
      loadFundQuotes,
      resolveFund,
      calcPeriodReturns,
      sliceKlinesForRange,
      resolveStock
    } = window.MarketAPI;

    const {
      addWatchStock,
      listWatchStocks,
      removeWatchStock,
      loadWatchQuotes,
      listFocusFunds,
      addFocusFund,
      removeFocusFund,
      normalizeWatchType,
      holdingFromWatchType,
      VALID_WATCH_TYPES,
      getAuthUser,
      getUserId,
      saveAuthUser,
      clearAuthUser,
      loginUser,
      registerUser
    } = window.WatchlistAPI;

    const STORAGE_KEY = "fund_daily_returns_v1";
    const CUSTOM_STOCKS_KEY = "custom_semi_stocks_v1";
    const ADDABLE_FUNDS = new Set([
      "cnSemi",
      "usSemi",
      "hkStocks",
      "jpStocks",
      "krStocks"
    ]);
    const FUND_WATCH_TYPE = {
      cnSemi: 1,
      usSemi: 2,
      hkStocks: 3,
      krStocks: 4,
      jpStocks: 5
    };
    const WATCH_TYPE_META = [
      { type: 1, label: "A股", market: "CN", pricePrefix: "" },
      { type: 2, label: "美股", market: "US", pricePrefix: "$" },
      { type: 3, label: "港股", market: "HK", pricePrefix: "HK$" },
      { type: 5, label: "日股", market: "JP", pricePrefix: "¥" },
      { type: 4, label: "韩股", market: "KR", pricePrefix: "₩" }
    ];
    const watchlistState = { type: 1, list: [], trends: null };
    const focusFundsState = { list: [] };
    const MARKET_SUB_TABS = [
      { id: "cnSemi", name: "A股" },
      { id: "usSemi", name: "美股" },
      { id: "hkStocks", name: "港股" },
      { id: "jpStocks", name: "日股" },
      { id: "krStocks", name: "韩股" }
    ];
    const WATCH_SUB_TABS = [
      { id: "watchStocks", name: "个股", icon: "assets/add_zixuan.png" },
      { id: "funds", name: "基金", icon: "assets/zixuan_jijin.png" }
    ];
    const MAIN_TABS = [
      { id: "markets", name: "全球股市", icon: "assets/gupiao.png", children: MARKET_SUB_TABS },
      { id: "fundRank", name: "基金", icon: "assets/jijin.png", iconClass: "tab-icon-sm" },
      { id: "metals", name: "贵金属", icon: "assets/gupiao.png" },
      { id: "crypto", name: "虚拟币", icon: "assets/gupiao.png" },
      { id: "watch", name: "自选", icon: "assets/add_zixuan.png", iconClass: "tab-icon-sm", children: WATCH_SUB_TABS }
    ];
    const MARKET_TAB_IDS = MARKET_SUB_TABS.map((t) => t.id);
    const WATCH_TAB_IDS = WATCH_SUB_TABS.map((t) => t.id);
    const PANEL_IDS = new Set([
      ...MARKET_TAB_IDS,
      "fundRank",
      "metals",
      "crypto",
      ...WATCH_TAB_IDS
    ]);
    const PAGE_SIZE = 10;
    /** 涨跌榜：默认 10 条，上拉再加载 10，最多 100 */
    const RANK_PAGE_SIZE = 10;
    const RANK_MAX = 100;
    const rankLoadMoreObservers = new Map();
    const pageState = {};
    let activeMainTab = "cnSemi";
    let lastMarketTab = "cnSemi";
    let lastWatchTab = "watchStocks";
    const MODAL_IDS = [
      "chartModal",
      "profileModal",
      "fundDetailModal",
      "cryptoDetailModal",
      "boardModal",
      "boardStocksModal",
      "indexStocksModal",
      "usBoardModal",
      "usBoardStocksModal",
      "hkBoardModal",
      "jpBoardModal",
      "krBoardModal",
      "loginModal",
      "registerModal"
    ];

    function isLoggedIn() {
      return !!getUserId();
    }

    function loadJson(key, fallback) {
      try {
        return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
      } catch {
        return fallback;
      }
    }

    function saveJson(key, val) {
      localStorage.setItem(key, JSON.stringify(val));
    }

    function loadCustomStocks() {
      return loadJson(CUSTOM_STOCKS_KEY, {});
    }

    function saveCustomStocks(all) {
      saveJson(CUSTOM_STOCKS_KEY, all);
    }

    function computeRankHasMore(loadedCount, fetchedCount, total) {
      if (loadedCount >= RANK_MAX) return false;
      if (fetchedCount < RANK_PAGE_SIZE) return false;
      const cap = total > 0 ? Math.min(total, RANK_MAX) : RANK_MAX;
      return loadedCount < cap;
    }

    function mergeRankList(prev, next) {
      const base = Array.isArray(prev) ? prev.slice() : [];
      if (!next?.length) return base;
      const seen = new Set(base.map((item) => quoteKey(item.code)));
      next.forEach((item) => {
        const key = quoteKey(item.code);
        if (seen.has(key)) return;
        seen.add(key);
        base.push(item);
      });
      return base.slice(0, RANK_MAX);
    }

    function buildRankLoadMoreHtml(id, { hasMore = true, loading = false, loaded = 0 } = {}) {
      if (!loaded && !loading) return "";
      if (loading) {
        return `<div class="rank-load-more loading" data-rank-more="${id}">加载中…</div>`;
      }
      if (!hasMore) {
        return `<div class="rank-load-more done" data-rank-more="${id}">已加载全部（${loaded}）</div>`;
      }
      return `<div class="rank-load-more" data-rank-more="${id}" data-rank-sentinel="${id}">上拉加载更多</div>`;
    }

    function updateRankLoadMoreEl(id, state) {
      const el = document.querySelector(`[data-rank-more="${id}"]`);
      if (!el) return;
      const html = buildRankLoadMoreHtml(id, state);
      if (!html) {
        el.remove();
        return;
      }
      el.outerHTML = html;
    }

    function unbindRankLoadMore(id) {
      const prev = rankLoadMoreObservers.get(id);
      if (!prev) return;
      prev.disconnect();
      rankLoadMoreObservers.delete(id);
    }

    /** 列表底部进入视口时触发加载更多（页面上拉） */
    function bindRankLoadMore(id, onLoadMore) {
      unbindRankLoadMore(id);
      const sentinel = document.querySelector(`[data-rank-sentinel="${id}"]`);
      if (!sentinel || typeof onLoadMore !== "function") return;
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry?.isIntersecting) return;
          onLoadMore();
        },
        { root: null, rootMargin: "160px 0px", threshold: 0 }
      );
      observer.observe(sentinel);
      rankLoadMoreObservers.set(id, observer);
    }

    function getActiveFundId() {
      return PANEL_IDS.has(activeMainTab) ? activeMainTab : "cnSemi";
    }

    function isMarketTab(id) {
      return MARKET_TAB_IDS.includes(id);
    }

    function isWatchGroupTab(id) {
      return id === "watch" || WATCH_TAB_IDS.includes(id);
    }

    function getMainGroupId(panelId = activeMainTab) {
      if (panelId === "markets" || isMarketTab(panelId)) return "markets";
      if (isWatchGroupTab(panelId)) return "watch";
      return panelId;
    }

    function resolvePanelId(tabOrFundId) {
      if (tabOrFundId === "markets") return lastMarketTab || "cnSemi";
      if (tabOrFundId === "watch") {
        return isLoggedIn() ? lastWatchTab || "watchStocks" : "watchStocks";
      }
      if (PANEL_IDS.has(tabOrFundId)) return tabOrFundId;
      return "cnSemi";
    }

    function isCnTab(id) {
      return id === "cnSemi";
    }

    function isUsTab(id) {
      return id === "usSemi";
    }

    function isJpTab(id) {
      return id === "jpStocks";
    }

    function isKrTab(id) {
      return id === "krStocks";
    }

    function isHkTab(id) {
      return id === "hkStocks";
    }

    function isMetalsTab(id) {
      return id === "metals";
    }

    function isCryptoTab(id) {
      return id === "crypto";
    }

    function isFundRankTab(id) {
      return id === "fundRank";
    }

    function isWatchTab(id) {
      return id === "watchStocks";
    }

    function isFocusFundsTab(id) {
      return id === "funds";
    }

    function watchTypeOfFund(fundId) {
      return FUND_WATCH_TYPE[fundId] || null;
    }

    function watchTypeFromHolding(holding, fundId) {
      const fromFund = watchTypeOfFund(fundId);
      if (fromFund) return fromFund;
      const m = Number(holding?.market);
      if (m === 105) return 2;
      if (m === 116) return 3;
      if (m === 177) return 4;
      if (m === 176) return 5;
      if (holding?.code) return 1;
      return null;
    }

    function watchMarketOfType(type) {
      const meta = WATCH_TYPE_META.find((m) => m.type === normalizeWatchType(type));
      return meta?.market || "CN";
    }

    function watchTypeLabel(type) {
      const meta = WATCH_TYPE_META.find((m) => m.type === normalizeWatchType(type));
      return meta?.label || "A股";
    }

    function addPlaceholderOfFund(fundId) {
      if (fundId === "usSemi") return "输入美股代码，如 NVDA";
      if (fundId === "hkStocks") return "港股代码，如 00700、09988";
      if (fundId === "jpStocks") return "日股代码，如 7203、6758";
      if (fundId === "krStocks") return "韩股代码，如 005930";
      return "沪/深/北交所代码，如 600519、000001、920001";
    }

    function addEmptyTipOfFund(fundId) {
      if (fundId === "usSemi") return "请输入美股代码";
      if (fundId === "hkStocks") return "请输入港股代码";
      if (fundId === "jpStocks") return "请输入日股代码";
      if (fundId === "krStocks") return "请输入韩股代码";
      return "请输入 A 股代码";
    }

    function getTotalPages(fund) {
      return Math.max(1, Math.ceil(fund.holdings.length / PAGE_SIZE));
    }

    function getCurrentPage(fundId) {
      return pageState[fundId] || 1;
    }

    function setCurrentPage(fundId, page) {
      const fund = window.FUND_HOLDINGS[fundId];
      const total = getTotalPages(fund);
      pageState[fundId] = Math.min(Math.max(1, page), total);
    }

    /** 当前页持仓切片 */
    function getPageSlice(fundId) {
      const fund = window.FUND_HOLDINGS[fundId];
      const page = getCurrentPage(fundId);
      const start = (page - 1) * PAGE_SIZE;
      const holdings = fund.holdings.slice(start, start + PAGE_SIZE);
      return { fund, page, start, holdings };
    }

    function updatePagerUI(fundId) {
      const page = getCurrentPage(fundId);
      const panel = document.querySelector(`[data-panel="${fundId}"]`);
      if (!panel) return;

      panel.querySelectorAll("[data-page-num]").forEach((btn) => {
        btn.classList.toggle("active", Number(btn.dataset.pageNum) === page);
      });
    }

    /** 翻页：先持久化当前页涨跌幅，再只渲染目标页行 */
    function goToPage(fundId, page) {
      persistFromDom();
      setCurrentPage(fundId, page);
      renderFundRows(fundId);
      updatePagerUI(fundId);
      applyAllChangeColors(fundId);
      syncFundQuotes(fundId);
    }

    function formatChangeDisplay(raw) {
      const s = String(raw ?? "").trim();
      if (s === "" || Number.isNaN(Number(s))) return "--";
      return Number(s).toFixed(2);
    }

    function buildPagerHtml(fund) {
      if (fund.holdings.length <= PAGE_SIZE) return "";

      const total = getTotalPages(fund);
      const pageBtns = Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        return `<button class="pager-btn" type="button" data-page-num="${n}" data-fund-page="${fund.id}">${n}</button>`;
      }).join("");

      return `
        <div class="pager">
          <div class="pager-btns">
            ${pageBtns}
          </div>
        </div>
      `;
    }

    function loadInputs() {
      return loadJson(STORAGE_KEY, {});
    }

    function saveInputs(all) {
      saveJson(STORAGE_KEY, all);
    }

    function formatPct(n) {
      const sign = n > 0 ? "+" : "";
      return sign + n.toFixed(2) + "%";
    }

    function applyChangeColor(el) {
      const field = el.closest(".change-field") || el;
      el.classList.remove("up", "down");
      field.classList.remove("up", "down");

      const raw = String(el.dataset.raw ?? "").trim();
      if (raw === "" || Number.isNaN(Number(raw))) return;
      const n = Number(raw);
      if (n > 0) {
        el.classList.add("up");
        field.classList.add("up");
      } else if (n < 0) {
        el.classList.add("down");
        field.classList.add("down");
      }
    }

    function applyAllChangeColors(fundId) {
      const selector = fundId
        ? `.change-value[data-fund="${fundId}"]`
        : ".change-value[data-fund]";
      document.querySelectorAll(selector).forEach(applyChangeColor);
    }

    function showToast(msg) {
      const el = document.getElementById("toast");
      el.textContent = msg;
      el.classList.add("show");
      clearTimeout(showToast._timer);
      showToast._timer = setTimeout(() => el.classList.remove("show"), 2600);
    }

    function toneClass(n) {
      if (n > 0) return "up";
      if (n < 0) return "down";
      return "flat";
    }

    function formatPrice(n) {
      if (n == null || Number.isNaN(n)) return "--";
      const abs = Math.abs(n);
      if (abs >= 1000) return n.toFixed(0);
      if (abs >= 100) return n.toFixed(1);
      return n.toFixed(2);
    }

    /** 虚拟币价格：大额保留 2 位，极小币种保留有效数字 */
    function formatCryptoPrice(n) {
      if (n == null || Number.isNaN(Number(n))) return "--";
      const x = Number(n);
      const abs = Math.abs(x);
      if (abs >= 1000) return x.toFixed(2);
      if (abs >= 1) return x.toFixed(2);
      if (abs >= 0.1) return x.toFixed(4);
      if (abs >= 0.01) return x.toFixed(4);
      if (abs >= 0.0001) return x.toFixed(6);
      return x.toPrecision(4);
    }

    function formatCryptoSigned(n) {
      if (n == null || Number.isNaN(Number(n))) return "--";
      const x = Number(n);
      const sign = x > 0 ? "+" : x < 0 ? "-" : "";
      const body = formatCryptoPrice(Math.abs(x));
      if (body === "--") return "--";
      return sign + body;
    }

    /** 贵金属等需要更多小数位的价格 */
    function formatPrecisePrice(n) {
      if (n == null || Number.isNaN(Number(n))) return "--";
      const x = Number(n);
      const abs = Math.abs(x);
      if (abs >= 100000) return x.toFixed(0);
      if (abs >= 10000) return x.toFixed(2);
      if (abs >= 1000) return x.toFixed(1);
      if (abs >= 100) return x.toFixed(2);
      if (abs >= 1) return x.toFixed(3);
      return x.toFixed(4);
    }

    /** 成交量（手）格式化为 万 / 亿 */
    function formatVolume(n) {
      if (n == null || Number.isNaN(n)) return "--";
      const abs = Math.abs(n);
      const sign = n < 0 ? "-" : "";
      if (abs >= 1e8) return sign + (abs / 1e8).toFixed(2) + "亿";
      if (abs >= 1e4) return sign + (abs / 1e4).toFixed(1) + "万";
      return sign + String(Math.round(abs));
    }

    function formatMarketCap(n) {
      if (n == null || Number.isNaN(n)) return "--";
      const abs = Math.abs(n);
      const sign = n < 0 ? "-" : "";
      if (abs >= 1e12) return sign + (abs / 1e12).toFixed(2) + "万亿";
      if (abs >= 1e8) return sign + (abs / 1e8).toFixed(2) + "亿";
      if (abs >= 1e4) return sign + (abs / 1e4).toFixed(2) + "万";
      return sign + abs.toFixed(0);
    }

    function formatYoy(n) {
      if (n == null || Number.isNaN(n)) return "";
      return `<span class="profile-yoy ${toneClass(n)}">${formatPct(n)}</span>`;
    }

    function setStatus(elOrId, msg) {
      const el = typeof elOrId === "string" ? document.getElementById(elOrId) : elOrId;
      if (!el) return;
      if (!msg) {
        el.classList.remove("show");
        el.textContent = "";
        return;
      }
      el.textContent = msg;
      el.classList.add("show");
    }

    function syncBodyScroll() {
      const anyOpen = MODAL_IDS.some((id) =>
        document.getElementById(id)?.classList.contains("show")
      );
      document.body.style.overflow = anyOpen ? "hidden" : "";
    }

    function showModal(id) {
      const modal = document.getElementById(id);
      if (!modal) return;
      modal.classList.add("show");
      modal.setAttribute("aria-hidden", "false");
      syncBodyScroll();
    }

    function hideModal(id) {
      const modal = document.getElementById(id);
      if (!modal) return;
      modal.classList.remove("show");
      modal.setAttribute("aria-hidden", "true");
      syncBodyScroll();
    }
