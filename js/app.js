    function persistFromDom() {
      const saved = loadInputs();
      document.querySelectorAll("input[data-fund]").forEach((input) => {
        const fundId = input.dataset.fund;
        const index = input.dataset.index;
        if (!saved[fundId]) saved[fundId] = {};
        saved[fundId][index] = input.value === "" ? "" : input.value;
      });
      saveInputs(saved);
    }

    function calcFund(fundId) {
      const fund = window.FUND_HOLDINGS[fundId];
      if (fund.viewOnly) return;
      persistFromDom();
      const saved = loadInputs()[fundId] || {};
      let weighted = 0;
      let filledWeight = 0;
      let filledCount = 0;
      let missing = [];

      fund.holdings.forEach((h, i) => {
        const raw = String(saved[i] ?? "").trim();
        if (raw === "" || Number.isNaN(Number(raw))) {
          missing.push(h.name);
          return;
        }
        const change = Number(raw);
        weighted += h.ratio * change;
        filledWeight += h.ratio;
        filledCount += 1;
      });

      const estimate = weighted / 100;
      const resultEl = document.getElementById(`result-${fundId}`);
      const valueEl = document.getElementById(`value-${fundId}`);
      const detailEl = document.getElementById(`detail-${fundId}`);

      resultEl.classList.add("show");
      valueEl.textContent = formatPct(estimate);
      valueEl.className = "value " + (estimate > 0 ? "up" : estimate < 0 ? "down" : "flat");

      const coverLabel = fund.market === "US" ? "等权合计" : "前十大合计";
      const parts = [
        `已填写 ${filledCount}/${fund.holdings.length} 只，覆盖权重 ${filledWeight.toFixed(2)}%（${coverLabel} ${fund.top10Total.toFixed(2)}%）。`
      ];
      if (missing.length) {
        parts.push(`未填写：${missing.join("、")}（按 0 处理）。`);
      }
      detailEl.textContent = parts.join(" ");
    }

    async function addCustomStock(fundId) {
      if (!CUSTOMIZABLE_FUNDS.has(fundId)) return;
      const fund = window.FUND_HOLDINGS[fundId];
      const input = document.querySelector(`[data-add-code="${fundId}"]`);
      const btn = document.querySelector(`[data-add-stock="${fundId}"]`);
      const raw = (input?.value || "").trim();
      if (!raw) {
        showToast(fund.market === "US" ? "请输入美股代码" : "请输入 A 股代码");
        input?.focus();
        return;
      }

      if (btn) btn.disabled = true;
      try {
        const stock = await resolveStock(raw, fund.market === "US" ? "US" : "CN");
        const all = loadCustomStocks();
        const list = all[fundId] || [];
        const existsCustom = list.some(
          (h) => quoteKey(h.code) === quoteKey(stock.code)
        );
        const existsDefault = (fund._defaultHoldings || fund.holdings).some(
          (h) => quoteKey(h.code) === quoteKey(stock.code)
        );
        if (existsCustom || existsDefault) {
          showToast(`${stock.name}（${stock.code}）已在列表中`);
          return;
        }

        all[fundId] = [
          { name: stock.name, code: stock.code, market: stock.market, ratio: stock.ratio },
          ...list
        ];
        saveCustomStocks(all);

        // 新增后回到第 1 页，并清掉该页签按 index 缓存的涨跌幅（避免错位）
        pageState[fundId] = 1;
        const saved = loadInputs();
        delete saved[fundId];
        saveInputs(saved);

        if (input) input.value = "";
        showToast(`已添加 ${stock.name}（${stock.code}）`);
        rerender(fundId);
      } catch (err) {
        showToast(err.message || "添加失败");
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    function removeCustomStock(fundId, code) {
      if (!CUSTOMIZABLE_FUNDS.has(fundId)) return;
      const all = loadCustomStocks();
      const list = all[fundId] || [];
      const next = list.filter((h) => quoteKey(h.code) !== quoteKey(code));
      if (next.length === list.length) return;
      all[fundId] = next;
      saveCustomStocks(all);

      pageState[fundId] = 1;
      const saved = loadInputs();
      delete saved[fundId];
      saveInputs(saved);

      showToast("已移除自选股票");
      rerender(fundId);
    }

    function getTabButtons() {
      return Array.from(document.querySelectorAll(".tabs .tab"));
    }

    function updateTabArrows() {
      const tabs = getTabButtons();
      const index = tabs.findIndex((t) => t.classList.contains("active"));
      const prevBtn = document.querySelector("[data-tab-prev]");
      const nextBtn = document.querySelector("[data-tab-next]");
      if (prevBtn) prevBtn.disabled = index <= 0;
      if (nextBtn) nextBtn.disabled = index < 0 || index >= tabs.length - 1;
    }

    function applyActivePanel(fundId) {
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
      const panel = document.querySelector(`[data-panel="${fundId}"]`);
      if (panel) panel.classList.add("active");
    }

    function switchTab(tabOrFundId, { forceSync = false } = {}) {
      const prevFundId = getActiveFundId();

      if (isWatchFund(tabOrFundId)) {
        activeMainTab = "funds";
        activeWatchFundId = tabOrFundId;
      } else if (tabOrFundId === "funds") {
        activeMainTab = "funds";
        if (!isWatchFund(activeWatchFundId)) {
          activeWatchFundId = WATCH_FUND_IDS[0];
        }
      } else if (tabOrFundId === "usSemi") {
        activeMainTab = "usSemi";
      } else if (tabOrFundId === "krStocks") {
        activeMainTab = "krStocks";
      } else {
        activeMainTab = "cnSemi";
      }

      const fundId = getActiveFundId();
      const alreadyActive = prevFundId === fundId && !forceSync;

      renderTabs();
      renderFundPicker();
      applyActivePanel(fundId);

      const tab = getTabButtons().find((t) => t.dataset.tab === activeMainTab);
      tab?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      updateTabArrows();

      if (!alreadyActive || forceSync) {
        syncFundQuotes(fundId);
      }
    }

    function shiftTab(step) {
      const tabs = getTabButtons();
      const index = tabs.findIndex((t) => t.classList.contains("active"));
      const next = tabs[index + step];
      if (next) switchTab(next.dataset.tab);
    }

    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-us-board-close]")) {
        closeUsBoardModal();
        return;
      }

      if (e.target.closest("[data-kr-board-close]")) {
        closeKrBoardModal();
        return;
      }

      const usRankBtn = e.target.closest("[data-us-rank]");
      if (usRankBtn) {
        loadUsRankKind(usRankBtn.dataset.usRank);
        return;
      }

      const krRankBtn = e.target.closest("[data-kr-rank]");
      if (krRankBtn) {
        loadKrRankKind(krRankBtn.dataset.krRank, { force: true });
        return;
      }

      if (e.target.closest("[data-kr-refresh]")) {
        loadKrRankKind(krRankState.kind || "gainers", { force: true });
        return;
      }

      if (e.target.closest("[data-board-stocks-close]")) {
        closeBoardStocksModal();
        return;
      }

      const cnStockRankBtn = e.target.closest("[data-cn-stock-rank]");
      if (cnStockRankBtn) {
        loadBoardStocksRank(cnStockRankBtn.dataset.cnStockRank);
        return;
      }

      if (e.target.closest("[data-board-close]")) {
        closeBoardModal();
        return;
      }

      const boardRowBtn = e.target.closest("[data-board-code]");
      if (boardRowBtn) {
        openBoardStocksModal(
          boardRowBtn.dataset.boardCode,
          boardRowBtn.dataset.boardName,
          boardRowBtn.dataset.boardCodes
        );
        return;
      }

      const openBoardBtn = e.target.closest("[data-open-board]");
      if (openBoardBtn) {
        if (openBoardBtn.dataset.openBoard === "us") openUsBoardModal();
        else if (openBoardBtn.dataset.openBoard === "kr") openKrBoardModal();
        else openBoardModal();
        return;
      }

      if (e.target.closest("[data-profile-close]")) {
        closeProfileModal();
        return;
      }

      const profileKindBtn = e.target.closest("[data-profile-kind]");
      if (profileKindBtn) {
        setProfileKind(profileKindBtn.dataset.profileKind);
        return;
      }

      if (e.target.closest("[data-open-profile]")) {
        openProfileModal();
        return;
      }

      if (e.target.closest("[data-chart-close]")) {
        closeChartModal();
        return;
      }

      const rangeBtn = e.target.closest("[data-chart-range]");
      if (rangeBtn) {
        setChartRange(rangeBtn.dataset.chartRange);
        return;
      }

      const removeBtn = e.target.closest("[data-remove-stock]");
      if (removeBtn) {
        removeCustomStock(removeBtn.dataset.removeStock, removeBtn.dataset.removeCode);
        return;
      }

      const chartName = e.target.closest("[data-chart-fund]");
      if (chartName) {
        openChartModal(chartName.dataset.chartFund, Number(chartName.dataset.chartIndex));
        return;
      }

      const pageNum = e.target.closest("[data-page-num]");
      if (pageNum) {
        const fundId = pageNum.dataset.fundPage;
        const nextPage = Number(pageNum.dataset.pageNum);
        if (nextPage === getCurrentPage(fundId)) return;
        goToPage(fundId, nextPage);
        return;
      }

      if (e.target.closest("[data-tab-prev]")) {
        shiftTab(-1);
        return;
      }

      if (e.target.closest("[data-tab-next]")) {
        shiftTab(1);
        return;
      }

      const tab = e.target.closest(".tab");
      if (tab) {
        switchTab(tab.dataset.tab);
        return;
      }

      const fundPick = e.target.closest("[data-fund-pick]");
      if (fundPick) {
        switchTab(fundPick.dataset.fundPick);
        return;
      }

      const syncBtn = e.target.closest("[data-sync]");
      if (syncBtn) {
        syncFundQuotes(syncBtn.dataset.sync);
        return;
      }

      const calcBtn = e.target.closest("[data-calc]");
      if (calcBtn) {
        calcFund(calcBtn.dataset.calc);
        return;
      }

      const addBtn = e.target.closest("[data-add-stock]");
      if (addBtn) {
        addCustomStock(addBtn.dataset.addStock);
        return;
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const profileModal = document.getElementById("profileModal");
        if (profileModal?.classList.contains("show")) {
          closeProfileModal();
          return;
        }
        const boardStocksModal = document.getElementById("boardStocksModal");
        if (boardStocksModal?.classList.contains("show")) {
          closeBoardStocksModal();
          return;
        }
        const usBoardModal = document.getElementById("usBoardModal");
        if (usBoardModal.classList.contains("show")) {
          closeUsBoardModal();
          return;
        }
        const krBoardModal = document.getElementById("krBoardModal");
        if (krBoardModal?.classList.contains("show")) {
          closeKrBoardModal();
          return;
        }
        const boardModal = document.getElementById("boardModal");
        if (boardModal.classList.contains("show")) {
          closeBoardModal();
          return;
        }
        const modal = document.getElementById("chartModal");
        if (modal.classList.contains("show")) closeChartModal();
        return;
      }

      if (e.key === "Enter" && e.target.matches?.("[data-add-code]")) {
        e.preventDefault();
        addCustomStock(e.target.dataset.addCode);
        return;
      }

      const chartName = e.target.closest?.("[data-chart-fund]");
      if (chartName && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        openChartModal(chartName.dataset.chartFund, Number(chartName.dataset.chartIndex));
      }
    });

    window.addEventListener("resize", () => {
      const chartModal = document.getElementById("chartModal");
      if (chartModal.classList.contains("show") && openChartModal._lastSeries) {
        drawIntradayChart(document.getElementById("chartCanvas"), openChartModal._lastSeries);
      }
      const boardModal = document.getElementById("boardModal");
      if (boardModal?.classList.contains("show")) {
        redrawCnIndexSparklines();
      }
      const usBoardModal = document.getElementById("usBoardModal");
      if (usBoardModal?.classList.contains("show")) {
        redrawUsIndexSparklines();
      }
      const krBoardModal = document.getElementById("krBoardModal");
      if (krBoardModal?.classList.contains("show")) {
        redrawKrIndexSparklines();
      }
      const activeFundId = getActiveFundId();
      if (activeFundId === "krStocks") redrawKrSparklines();
      else if (activeFundId) paintFundSparklines(activeFundId);
    });

    document.addEventListener("input", (e) => {
      if (e.target.matches("input[data-fund]")) {
        applyChangeColor(e.target);
        persistFromDom();
      }
    });

