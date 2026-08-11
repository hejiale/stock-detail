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

    async function addStockToWatchlist(rawCode, type, { refreshWatch = false } = {}) {
      const t = normalizeWatchType(type);
      const marketType = watchMarketOfType(t);
      const stock = await resolveStock(rawCode, marketType);
      await addWatchStock(stock.code, t);
      showToast(`加入成功：${stock.name}（${stock.code}）`);
      if (refreshWatch || activeMainTab === "watchStocks") {
        await loadWatchlist(t, { force: true });
      }
      return stock;
    }

    async function addCustomStock(fundId) {
      const isWatchPanel = fundId === "watchStocks";
      const type = isWatchPanel
        ? normalizeWatchType(watchlistState.type || 1)
        : watchTypeOfFund(fundId);
      if (!type || (!isWatchPanel && !ADDABLE_FUNDS.has(fundId))) return;

      const input = document.querySelector(`[data-add-code="${fundId}"]`);
      const btn = document.querySelector(`[data-add-stock="${fundId}"]`);
      const raw = (input?.value || "").trim();
      if (!raw) {
        showToast(
          isWatchPanel
            ? `请输入${watchTypeLabel(type)}代码`
            : addEmptyTipOfFund(fundId)
        );
        input?.focus();
        return;
      }

      if (btn) {
        btn.classList.add("is-loading");
        btn.disabled = true;
      }
      try {
        await addStockToWatchlist(raw, type, {
          refreshWatch: isWatchPanel
        });
        if (input) input.value = "";
      } catch (err) {
        showToast(err.message || "添加失败");
      } finally {
        if (btn) {
          btn.classList.remove("is-loading");
          btn.disabled = false;
        }
      }
    }

    function purgeLocalCustomStock(code) {
      const all = loadCustomStocks();
      let changed = false;
      Object.keys(all).forEach((fundId) => {
        const list = all[fundId] || [];
        const next = list.filter((h) => quoteKey(h.code) !== quoteKey(code));
        if (next.length !== list.length) {
          all[fundId] = next;
          changed = true;
          pageState[fundId] = 1;
          const saved = loadInputs();
          delete saved[fundId];
          saveInputs(saved);
        }
      });
      if (changed) saveCustomStocks(all);
      return changed;
    }

    async function removeCustomStock(fundId, code) {
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

      try {
        await removeWatchStock(code);
      } catch {
        /* 远端可能本无此代码，本地仍移除 */
      }

      showToast("已移除自选股票");
      rerender(fundId);
      if (activeMainTab === "watchStocks") {
        loadWatchlist(watchlistState.type || 1, { force: true }).catch(() => {});
      }
    }

    async function removeWatchlistStock(code) {
      const raw = String(code || "").trim();
      if (!raw) return;
      try {
        await removeWatchStock(raw);
        purgeLocalCustomStock(raw);
        showToast("已移除自选股票");
        await loadWatchlist(watchlistState.type || 1, { force: true });
      } catch (err) {
        showToast(err.message || "删除失败");
      }
    }

    async function addWatchFromChart(triggerBtn) {
      const btn = triggerBtn || document.getElementById("chartWatchBtn");
      const state = openChartModal._state;
      const holding = state?.holding;
      const fundId = state?.fundId || btn?.dataset?.watchFund || "";
      const code = String(
        btn?.dataset?.watchCode || holding?.code || ""
      ).trim();
      const type = Number(btn?.dataset?.watchType) || watchTypeFromHolding(holding, fundId);

      if (!code || !type) {
        showToast("无法加入自选，请稍后重试");
        return;
      }

      if (btn?.classList.contains("is-added") || btn?.disabled) return;

      if (btn) btn.disabled = true;
      try {
        // 与搜索框添加同一流程：先 resolveStock，再 POST /api/stock（成功提示在共用方法内）
        await addStockToWatchlist(code, type);
        if (btn) {
          btn.classList.add("is-added");
          const label = btn.querySelector("span");
          if (label) label.textContent = "已加入";
        }
      } catch (err) {
        showToast(err.message || "加入自选失败");
        if (btn) btn.disabled = false;
      }
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
      } else if (tabOrFundId === "hkStocks") {
        activeMainTab = "hkStocks";
      } else if (tabOrFundId === "krStocks") {
        activeMainTab = "krStocks";
      } else if (tabOrFundId === "watchStocks") {
        activeMainTab = "watchStocks";
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

      if (e.target.closest("[data-hk-board-close]")) {
        closeHkBoardModal();
        return;
      }

      if (e.target.closest("[data-kr-board-close]")) {
        closeKrBoardModal();
        return;
      }

      const semiRankBtn = e.target.closest("[data-semi-rank]");
      if (semiRankBtn) {
        const fundId = semiRankBtn.dataset.semiFund;
        if (isRankFund(fundId)) {
          if (!semiRankState[fundId]) {
            semiRankState[fundId] = { kind: "gainers" };
          }
          semiRankState[fundId].kind =
            semiRankBtn.dataset.semiRank === "losers" ? "losers" : "gainers";
          syncFundQuotes(fundId);
        }
        return;
      }

      const hkRankBtn = e.target.closest("[data-hk-rank]");
      if (hkRankBtn) {
        loadHkRankKind(hkRankBtn.dataset.hkRank, { force: true });
        return;
      }

      if (e.target.closest("[data-hk-refresh]")) {
        loadHkRankKind(hkRankState.kind || "gainers", { force: true });
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

      const watchTypeBtn = e.target.closest("[data-watch-type]");
      if (watchTypeBtn) {
        loadWatchlist(Number(watchTypeBtn.dataset.watchType), { force: true });
        return;
      }

      if (e.target.closest("[data-watch-refresh]")) {
        loadWatchlist(watchlistState.type || 1, { force: true });
        return;
      }

      const removeWatchBtn = e.target.closest("[data-remove-watch]");
      if (removeWatchBtn) {
        removeWatchlistStock(removeWatchBtn.dataset.removeWatch);
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
        else if (openBoardBtn.dataset.openBoard === "hk") openHkBoardModal();
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

      if (e.target.closest("[data-chart-add-watch]")) {
        addWatchFromChart(e.target.closest("[data-chart-add-watch]"));
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
        const hkBoardModal = document.getElementById("hkBoardModal");
        if (hkBoardModal?.classList.contains("show")) {
          closeHkBoardModal();
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
      const hkBoardModal = document.getElementById("hkBoardModal");
      if (hkBoardModal?.classList.contains("show")) {
        redrawHkIndexSparklines();
      }
      const krBoardModal = document.getElementById("krBoardModal");
      if (krBoardModal?.classList.contains("show")) {
        redrawKrIndexSparklines();
      }
      const activeFundId = getActiveFundId();
      if (activeFundId === "hkStocks") redrawHkSparklines();
      else if (activeFundId === "krStocks") redrawKrSparklines();
      else if (activeFundId === "watchStocks") redrawWatchSparklines();
      else if (activeFundId) paintFundSparklines(activeFundId);
    });

    document.addEventListener("input", (e) => {
      if (e.target.matches("input[data-fund]")) {
        applyChangeColor(e.target);
        persistFromDom();
      }
    });

