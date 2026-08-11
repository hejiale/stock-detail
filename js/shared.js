    const {
      quoteKey,
      loadQuotes,
      loadIntradayTrends,
      loadDailyKlines,
      loadStockProfile,
      loadCnSectorBoards,
      loadCnSectorStocks,
      loadCnIndices,
      loadUsIndices,
      loadUsStockRank,
      loadUsMarketBreadth,
      loadKrStockRank,
      loadKrIndices,
      loadKrMarketBreadth,
      calcPeriodReturns,
      sliceKlinesForRange,
      resolveStock
    } = window.MarketAPI;

    const STORAGE_KEY = "fund_daily_returns_v1";
    const CUSTOM_STOCKS_KEY = "custom_semi_stocks_v1";
    const CUSTOMIZABLE_FUNDS = new Set(["cnSemi", "usSemi"]);
    const MAIN_TABS = [
      { id: "cnSemi", name: "A股", icon: "assets/gupiao.png" },
      { id: "usSemi", name: "美股", icon: "assets/gupiao.png" },
      { id: "krStocks", name: "韩股", icon: "assets/gupiao.png" },
      { id: "funds", name: "自选基金", icon: "assets/zixuan_jijin.png", iconClass: "tab-icon-sm" }
    ];
    const WATCH_FUND_IDS = ["dongfang", "caitong", "huaxia", "guangfa", "jianxin", "huabao", "fuguo"];
    const PAGE_SIZE = 10;
    const pageState = {};
    let activeMainTab = "cnSemi";
    let activeWatchFundId = "dongfang";
    const MODAL_IDS = [
      "chartModal",
      "profileModal",
      "boardModal",
      "boardStocksModal",
      "usBoardModal",
      "krBoardModal"
    ];

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

    /** 把本地自选插到默认列表前面 */
    function applyCustomHoldings() {
      CUSTOMIZABLE_FUNDS.forEach((fundId) => {
        const fund = window.FUND_HOLDINGS[fundId];
        if (!fund) return;
        if (!fund._defaultHoldings) {
          fund._defaultHoldings = fund.holdings.slice();
        }
        const custom = (loadCustomStocks()[fundId] || []).map((h) => ({
          ...h,
          custom: true
        }));
        fund.holdings = [...custom, ...fund._defaultHoldings];
      });
    }

    function isWatchFund(fundId) {
      return WATCH_FUND_IDS.includes(fundId);
    }

    function getActiveFundId() {
      if (activeMainTab === "funds") return activeWatchFundId;
      if (activeMainTab === "usSemi") return "usSemi";
      if (activeMainTab === "krStocks") return "krStocks";
      return "cnSemi";
    }

    function isKrTab(id) {
      return id === "krStocks";
    }

    function rerender(activeFundId) {
      const keep = activeFundId || getActiveFundId();
      applyCustomHoldings();
      renderFundPanel(keep);
      switchTab(keep, { forceSync: true });
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

    /** 当前页持仓切片（最多 PAGE_SIZE 条） */
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

    /** 翻页：先持久化当前页输入，再只渲染目标页行 */
    function goToPage(fundId, page) {
      persistFromDom();
      setCurrentPage(fundId, page);
      renderFundRows(fundId);
      updatePagerUI(fundId);
      applyAllChangeColors(fundId);
      syncFundQuotes(fundId);
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

    function applyChangeColor(input) {
      const field = input.closest(".change-field") || input;
      input.classList.remove("up", "down");
      field.classList.remove("up", "down");

      const raw = input.value.trim();
      if (raw === "" || Number.isNaN(Number(raw))) return;
      const n = Number(raw);
      if (n > 0) {
        input.classList.add("up");
        field.classList.add("up");
      } else if (n < 0) {
        input.classList.add("down");
        field.classList.add("down");
      }
    }

    function applyAllChangeColors(fundId) {
      const selector = fundId
        ? `input[data-fund="${fundId}"]`
        : "input[data-fund]";
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

    /** 金额/市值（元）格式化为 万 / 亿 / 万亿 */
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

