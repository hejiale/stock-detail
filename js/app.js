    function persistFromDom() {
      const saved = loadInputs();
      document.querySelectorAll(".change-value[data-fund]").forEach((el) => {
        const fundId = el.dataset.fund;
        const index = el.dataset.index;
        if (!saved[fundId]) saved[fundId] = {};
        const raw = String(el.dataset.raw ?? "").trim();
        saved[fundId][index] = raw;
      });
      saveInputs(saved);
    }

    function calcFund(fundId) {
      const fund = window.FUND_HOLDINGS?.[fundId];
      if (!fund) return;
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
        `已同步 ${filledCount}/${fund.holdings.length} 只，覆盖权重 ${filledWeight.toFixed(2)}%（${coverLabel} ${fund.top10Total.toFixed(2)}%）。`
      ];
      if (missing.length) {
        parts.push(`未同步：${missing.join("、")}（按 0 处理）。`);
      }
      detailEl.textContent = parts.join(" ");
    }

    async function addFundToFocusList(rawCode, { refreshList = false, btn = null } = {}) {
      if (!ensureLoggedIn()) return null;
      const raw = String(rawCode || "").trim();
      if (!raw) {
        showToast("请输入基金代码");
        return null;
      }
      const fund = await resolveFund(raw);
      await addFocusFund(fund.code);
      showToast(`加入成功：${fund.name}（${fund.code}）`);
      if (refreshList || activeMainTab === "funds") {
        await loadFocusFunds({ force: true });
      }
      if (btn) {
        btn.classList.add("is-added");
        btn.title = "已加入自选";
        btn.setAttribute("aria-label", `已加入自选 ${fund.name || fund.code}`);
      }
      document
        .querySelectorAll(
          `[data-add-watch="fundRank"][data-watch-code="${fund.code}"]`
        )
        .forEach((el) => {
          if (el === btn) return;
          el.classList.add("is-added");
          el.title = "已加入自选";
          el.setAttribute("aria-label", `已加入自选 ${fund.name || fund.code}`);
        });
      return fund;
    }

    async function addStockToWatchlist(rawCode, type, { refreshWatch = false } = {}) {
      if (!ensureLoggedIn()) return null;
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
      if (fundId === "watchStocks") return;
      if (fundId === "fundRank" || fundId === "funds") {
        const input = document.querySelector(`[data-add-code="${fundId}"]`);
        const btn = document.querySelector(`[data-add-stock="${fundId}"]`);
        const raw = (input?.value || "").trim();
        if (!raw) {
          showToast("请输入基金代码");
          input?.focus();
          return;
        }
        if (btn) {
          btn.classList.add("is-loading");
          btn.disabled = true;
        }
        try {
          const fund = await addFundToFocusList(raw, {
            refreshList: activeMainTab === "funds"
          });
          if (!fund) return;
          if (input) input.value = "";
        } catch (err) {
          const msg = String(err?.message || "添加失败");
          showToast(
            /已在关注|已在自选|409/.test(msg) ? "该基金已在自选中" : msg
          );
        } finally {
          if (btn) {
            btn.classList.remove("is-loading");
            btn.disabled = false;
          }
        }
        return;
      }

      const type = watchTypeOfFund(fundId);
      if (!type || !ADDABLE_FUNDS.has(fundId)) return;

      const input = document.querySelector(`[data-add-code="${fundId}"]`);
      const btn = document.querySelector(`[data-add-stock="${fundId}"]`);
      const raw = (input?.value || "").trim();
      if (!raw) {
        showToast(addEmptyTipOfFund(fundId));
        input?.focus();
        return;
      }

      if (btn) {
        btn.classList.add("is-loading");
        btn.disabled = true;
      }
      try {
        const stock = await addStockToWatchlist(raw, type, {
          refreshWatch: activeMainTab === "watchStocks"
        });
        if (!stock) return;
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

    async function removeWatchlistStock(code) {
      const raw = String(code || "").trim();
      if (!raw) return;
      if (!ensureLoggedIn()) return;
      try {
        await removeWatchStock(raw);
        purgeLocalCustomStock(raw);
        showToast("已移除自选股票");
        await loadWatchlist(watchlistState.type || 1, { force: true });
      } catch (err) {
        showToast(err.message || "删除失败");
      }
    }

    async function removeFocusListFund(code) {
      const raw = String(code || "").trim();
      if (!raw) return;
      if (!ensureLoggedIn()) return;
      try {
        await removeFocusFund(raw);
        showToast("已移除自选基金");
        await loadFocusFunds({ force: true });
      } catch (err) {
        showToast(err.message || "删除失败");
      }
    }

    async function addWatchFromRow(triggerBtn) {
      const btn = triggerBtn;
      const fundId = btn?.getAttribute("data-add-watch") || "";
      const code = String(
        btn?.getAttribute("data-watch-code") || btn?.dataset?.watchCode || ""
      ).trim();

      if (fundId === "fundRank") {
        if (!code) {
          showToast("缺少基金代码，无法加入自选");
          return;
        }
        if (btn?.classList.contains("is-added") || btn?.disabled) return;
        if (btn) btn.disabled = true;
        try {
          const fund = await addFundToFocusList(code, { btn });
          if (!fund && btn) btn.disabled = false;
        } catch (err) {
          const msg = String(err?.message || "添加失败");
          const dup = /已在关注|已在自选|409/.test(msg);
          showToast(dup ? "该基金已在自选中" : msg);
          if (btn) {
            if (dup) {
              btn.classList.add("is-added");
              btn.title = "已加入自选";
            } else {
              btn.disabled = false;
            }
          }
        }
        return;
      }

      const type =
        Number(btn?.getAttribute("data-watch-type") || btn?.dataset?.watchType) ||
        watchTypeOfFund(fundId);

      if (!code) {
        showToast("缺少股票代码，无法加入自选");
        return;
      }
      if (!type || !ADDABLE_FUNDS.has(fundId)) {
        showToast("无法识别市场类型");
        return;
      }

      if (btn?.classList.contains("is-added") || btn?.disabled) return;

      if (btn) btn.disabled = true;
      try {
        // 与搜索框添加走同一条链路：addStockToWatchlist
        const stock = await addStockToWatchlist(code, type);
        if (!stock) {
          if (btn) btn.disabled = false;
          return;
        }
        if (btn) {
          btn.classList.add("is-added");
          const labelName = stock?.name || code;
          btn.title = "已加入自选";
          btn.setAttribute("aria-label", `已加入自选 ${labelName}`);
        }
      } catch (err) {
        showToast(err.message || "添加失败");
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
      const fundId = resolvePanelId(tabOrFundId);
      activeMainTab = fundId;
      if (isMarketTab(fundId)) lastMarketTab = fundId;
      if (WATCH_TAB_IDS.includes(fundId) && isLoggedIn()) lastWatchTab = fundId;

      const alreadyActive = prevFundId === fundId && !forceSync;

      renderTabs();
      renderFundPicker();
      applyActivePanel(fundId);

      const tab = getTabButtons().find((t) => t.classList.contains("active"));
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

    // 捕获阶段优先处理列表自选，避免冒泡到名称/走势去打开行情弹框
    document.addEventListener(
      "click",
      (e) => {
        const addWatchBtn = e.target.closest("[data-add-watch], .btn-add-watch");
        if (!addWatchBtn) return;
        e.preventDefault();
        e.stopPropagation();
        addWatchFromRow(addWatchBtn);
      },
      true
    );

    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-login-close]")) {
        closeLoginModal();
        return;
      }

      if (e.target.closest("[data-register-close]")) {
        closeRegisterModal();
        return;
      }

      if (e.target.closest("[data-open-login]")) {
        openLoginModal();
        return;
      }

      if (e.target.closest("[data-open-register]")) {
        openRegisterModal();
        return;
      }

      if (e.target.closest("[data-us-board-close]")) {
        closeUsBoardModal();
        return;
      }

      if (e.target.closest("[data-us-board-stocks-close]")) {
        closeUsBoardStocksModal();
        return;
      }

      const usSectorRankBtn = e.target.closest("[data-us-sector-rank]");
      if (usSectorRankBtn) {
        loadUsBoardStocksRank(usSectorRankBtn.dataset.usSectorRank);
        return;
      }

      const usSectorLink = e.target.closest("[data-us-sector]");
      if (usSectorLink) {
        openUsBoardStocksModal(
          usSectorLink.dataset.usSector,
          usSectorLink.dataset.usSectorName
        );
        return;
      }

      if (e.target.closest("[data-hk-board-close]")) {
        closeHkBoardModal();
        return;
      }

      if (e.target.closest("[data-jp-board-close]")) {
        closeJpBoardModal();
        return;
      }

      if (e.target.closest("[data-kr-board-close]")) {
        closeKrBoardModal();
        return;
      }

      const cnRankBtn = e.target.closest("[data-cn-rank]");
      if (cnRankBtn) {
        loadCnRankKind(cnRankBtn.dataset.cnRank, { force: true });
        return;
      }

      if (e.target.closest("[data-cn-refresh]")) {
        loadCnRankKind(cnRankState.kind || "gainers", { force: true });
        return;
      }

      const usRankBtn = e.target.closest("[data-us-rank]");
      if (usRankBtn) {
        loadUsRankKind(usRankBtn.dataset.usRank, { force: true });
        return;
      }

      if (e.target.closest("[data-us-refresh]")) {
        loadUsRankKind(usRankState.kind || "gainers", { force: true });
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

      const metalsKindBtn = e.target.closest("[data-metals-kind]");
      if (metalsKindBtn) {
        loadMetalsKind(metalsKindBtn.dataset.metalsKind, { force: true });
        return;
      }

      if (e.target.closest("[data-metals-refresh]")) {
        loadMetalsKind(metalsState.kind || "spotIntl", { force: true });
        return;
      }

      const bondsKindBtn = e.target.closest("[data-bonds-kind]");
      if (bondsKindBtn) {
        loadBondsKind(bondsKindBtn.dataset.bondsKind, { force: true });
        return;
      }

      if (e.target.closest("[data-bonds-refresh]")) {
        loadBondsKind(bondsState.kind || "treasury", { force: true });
        return;
      }

      if (e.target.closest("[data-crypto-refresh]")) {
        loadCryptoList({ force: true });
        return;
      }

      if (e.target.closest("[data-crypto-detail-close]")) {
        closeCryptoDetailModal();
        return;
      }

      const cryptoRangeBtn = e.target.closest("[data-crypto-range]");
      if (cryptoRangeBtn) {
        setCryptoChartRange(cryptoRangeBtn.dataset.cryptoRange);
        return;
      }

      const cryptoRow = e.target.closest("[data-crypto-code]");
      if (cryptoRow) {
        openCryptoDetailModal(
          cryptoRow.dataset.cryptoCode,
          cryptoRow.querySelector(".board-name")?.textContent
        );
        return;
      }

      const jpRankBtn = e.target.closest("[data-jp-rank]");
      if (jpRankBtn) {
        loadJpRankKind(jpRankBtn.dataset.jpRank, { force: true });
        return;
      }

      if (e.target.closest("[data-jp-refresh]")) {
        loadJpRankKind(jpRankState.kind || "gainers", { force: true });
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

      const fundRankBtn = e.target.closest("[data-fund-rank]");
      if (fundRankBtn) {
        loadFundRankPeriod(fundRankBtn.dataset.fundRank, { force: true });
        return;
      }

      if (e.target.closest("[data-fund-rank-refresh]")) {
        loadFundRankPeriod(fundRankState.period || "month", { force: true });
        return;
      }

      if (e.target.closest("[data-fund-detail-close]")) {
        closeFundDetailModal();
        return;
      }

      const fundDetailTab = e.target.closest("[data-fund-detail-tab]");
      if (fundDetailTab) {
        setFundDetailTab(fundDetailTab.dataset.fundDetailTab);
        return;
      }

      const fundDetailBtn = e.target.closest("[data-fund-detail]");
      if (
        fundDetailBtn &&
        !e.target.closest("[data-add-watch], .btn-add-watch, [data-remove-focus-fund]")
      ) {
        openFundDetailModal(
          fundDetailBtn.dataset.fundDetail,
          fundDetailBtn.dataset.fundDetailName
        );
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

      if (e.target.closest("[data-focus-fund-refresh]")) {
        loadFocusFunds({ force: true });
        return;
      }

      const removeFocusFundBtn = e.target.closest("[data-remove-focus-fund]");
      if (removeFocusFundBtn) {
        removeFocusListFund(removeFocusFundBtn.dataset.removeFocusFund);
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

      if (e.target.closest("[data-index-stocks-close]")) {
        closeIndexStocksModal();
        return;
      }

      const cnStockRankBtn = e.target.closest("[data-cn-stock-rank]");
      if (cnStockRankBtn) {
        loadBoardStocksRank(cnStockRankBtn.dataset.cnStockRank);
        return;
      }

      const cnIndexRankBtn = e.target.closest("[data-cn-index-rank]");
      if (cnIndexRankBtn) {
        loadIndexStocksRank(cnIndexRankBtn.dataset.cnIndexRank);
        return;
      }

      const cnIndexCard = e.target.closest("[data-cn-index-code]");
      if (cnIndexCard) {
        openIndexStocksModal(
          cnIndexCard.dataset.cnIndexCode,
          cnIndexCard.dataset.cnIndexLabel
        );
        return;
      }

      if (e.target.closest("[data-board-close]")) {
        closeBoardModal();
        return;
      }

      const sectionToggle = e.target.closest("[data-cn-section-toggle]");
      if (sectionToggle) {
        toggleCnSection(sectionToggle.dataset.cnSectionToggle);
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
        else if (openBoardBtn.dataset.openBoard === "jp") openJpBoardModal();
        else if (openBoardBtn.dataset.openBoard === "kr") openKrBoardModal();
        else openBoardModal();
        return;
      }

      if (e.target.closest("[data-profile-close]")) {
        closeProfileModal();
        return;
      }

      const profileSectionBtn = e.target.closest("[data-profile-section-toggle]");
      if (profileSectionBtn) {
        toggleProfileSection(profileSectionBtn.dataset.profileSectionToggle);
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

      if (e.target.closest("[data-chart-quote-toggle]")) {
        toggleChartQuoteFloat();
        return;
      }

      if (e.target.closest("[data-chart-quote-collapse]")) {
        setChartQuoteExpanded(false);
        return;
      }

      const rangeBtn = e.target.closest("[data-chart-range]");
      if (rangeBtn) {
        setChartRange(rangeBtn.dataset.chartRange);
        return;
      }

      const chartName = e.target.closest("[data-chart-fund]");
      if (chartName && !e.target.closest("[data-add-watch], .btn-add-watch")) {
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

    document.addEventListener("submit", (e) => {
      if (e.target?.id === "loginForm") {
        handleLoginSubmit(e);
        return;
      }
      if (e.target?.id === "registerForm") {
        handleRegisterSubmit(e);
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const loginModal = document.getElementById("loginModal");
        if (loginModal?.classList.contains("show")) {
          closeLoginModal();
          return;
        }
        const registerModal = document.getElementById("registerModal");
        if (registerModal?.classList.contains("show")) {
          closeRegisterModal();
          return;
        }
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
        const indexStocksModal = document.getElementById("indexStocksModal");
        if (indexStocksModal?.classList.contains("show")) {
          closeIndexStocksModal();
          return;
        }
        const usBoardStocksModal = document.getElementById("usBoardStocksModal");
        if (usBoardStocksModal?.classList.contains("show")) {
          closeUsBoardStocksModal();
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
        const jpBoardModal = document.getElementById("jpBoardModal");
        if (jpBoardModal?.classList.contains("show")) {
          closeJpBoardModal();
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
        const cryptoDetailModal = document.getElementById("cryptoDetailModal");
        if (cryptoDetailModal?.classList.contains("show")) {
          closeCryptoDetailModal();
          return;
        }
        const modal = document.getElementById("chartModal");
        if (modal.classList.contains("show")) {
          if (isChartQuoteExpanded()) {
            setChartQuoteExpanded(false);
            return;
          }
          closeChartModal();
        }
        return;
      }

      if (e.key === "Enter" && e.target.matches?.("[data-add-code]")) {
        e.preventDefault();
        addCustomStock(e.target.dataset.addCode);
        return;
      }

      const fundDetailName = e.target.closest?.("[data-fund-detail]");
      if (fundDetailName && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        openFundDetailModal(
          fundDetailName.dataset.fundDetail,
          fundDetailName.dataset.fundDetailName
        );
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
        drawIntradayChart(
          document.getElementById("chartCanvas"),
          openChartModal._lastSeries,
          typeof chartScrub !== "undefined" ? chartScrub.index : null
        );
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
      const jpBoardModal = document.getElementById("jpBoardModal");
      if (jpBoardModal?.classList.contains("show")) {
        redrawJpIndexSparklines();
      }
      const krBoardModal = document.getElementById("krBoardModal");
      if (krBoardModal?.classList.contains("show")) {
        redrawKrIndexSparklines();
      }
      const activeFundId = getActiveFundId();
      if (activeFundId === "cnSemi") redrawCnSparklines();
      else if (activeFundId === "usSemi") redrawUsSparklines();
      else if (activeFundId === "hkStocks") redrawHkSparklines();
      else if (activeFundId === "jpStocks") redrawJpSparklines();
      else if (activeFundId === "krStocks") redrawKrSparklines();
      else if (activeFundId === "watchStocks") redrawWatchSparklines();
      else if (activeFundId) paintFundSparklines(activeFundId);
      const cryptoDetailModal = document.getElementById("cryptoDetailModal");
      if (cryptoDetailModal?.classList.contains("show")) {
        drawCryptoDetailChart(
          openCryptoDetailModal._chart || [],
          openCryptoDetailModal._range
        );
      }
    });

