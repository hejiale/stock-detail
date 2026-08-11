    async function loadSemiRankKind(fundId, kind, { force = false, append = false } = {}) {
      if (!isRankFund(fundId)) return;
      const fund = window.FUND_HOLDINGS[fundId];
      if (!fund) return;

      const next = kind === "losers" ? "losers" : "gainers";
      const state =
        semiRankState[fundId] ||
        (semiRankState[fundId] = {
          kind: "gainers",
          list: null,
          page: 0,
          total: 0,
          hasMore: true,
          loadingMore: false
        });

      if (
        !force &&
        !append &&
        state.kind === next &&
        fund._rankHoldings?.length
      ) {
        state.kind = next;
        document
          .querySelectorAll(`[data-semi-rank][data-semi-fund="${fundId}"]`)
          .forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.semiRank === next);
          });
        applyCustomHoldings();
        renderFundPanel(fundId);
        bindSemiRankLoadMore(fundId);
        return;
      }

      if (append) {
        if (state.loadingMore || state.hasMore === false) return;
        if (state.kind !== next) return;
        state.loadingMore = true;
        updateSemiRankLoadMoreUI(fundId);
        const requestId = loadSemiRankKind._req;
        const nextPage = (state.page || 1) + 1;
        try {
          const result =
            fundId === "usSemi"
              ? await loadUsStockRank(next, RANK_PAGE_SIZE, nextPage)
              : await loadCnStockRank(next, RANK_PAGE_SIZE, nextPage);
          if (requestId !== loadSemiRankKind._req) return;
          const list = result.list || [];
          const start = fund._rankHoldings?.length || 0;
          fund._rankHoldings = mergeRankList(fund._rankHoldings, list);
          const added = (fund._rankHoldings?.length || 0) - start;
          state.list = fund._rankHoldings;
          state.page = nextPage;
          state.total = result.total || state.total || 0;
          state.hasMore =
            added > 0 &&
            computeRankHasMore(
              fund._rankHoldings.length,
              list.length,
              state.total
            );
          applyCustomHoldings();
          appendSemiRankRows(fundId, start);
          updateSemiRankSub(fundId);
          await fillSemiRankSlice(fundId, start);
          bindSemiRankLoadMore(fundId);
        } catch (err) {
          if (requestId === loadSemiRankKind._req) {
            showToast(err?.message || "加载更多失败");
          }
        } finally {
          if (requestId === loadSemiRankKind._req) {
            state.loadingMore = false;
            updateSemiRankLoadMoreUI(fundId);
            bindSemiRankLoadMore(fundId);
          }
        }
        return;
      }

      state.kind = next;
      state.page = 0;
      state.hasMore = true;
      state.loadingMore = false;
      document
        .querySelectorAll(`[data-semi-rank][data-semi-fund="${fundId}"]`)
        .forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.semiRank === next);
        });

      const requestId = (loadSemiRankKind._req = (loadSemiRankKind._req || 0) + 1);
      const subEl = document.querySelector(`[data-panel="${fundId}"] .fund-meta .sub`);
      if (subEl) {
        subEl.textContent =
          next === "losers" ? "加载跌幅榜…" : "加载涨幅榜…";
      }

      try {
        const result =
          fundId === "usSemi"
            ? await loadUsStockRank(next, RANK_PAGE_SIZE, 1)
            : await loadCnStockRank(next, RANK_PAGE_SIZE, 1);
        if (requestId !== loadSemiRankKind._req) return;
        const list = result.list || [];
        fund._rankHoldings = list;
        state.list = list;
        state.page = 1;
        state.total = result.total || 0;
        state.hasMore = computeRankHasMore(list.length, list.length, state.total);
        applyCustomHoldings();
        renderFundPanel(fundId);
        bindSemiRankLoadMore(fundId);
      } catch (err) {
        if (requestId !== loadSemiRankKind._req) return;
        fund._rankHoldings = fund._rankHoldings || [];
        state.hasMore = false;
        applyCustomHoldings();
        renderFundPanel(fundId);
        throw err;
      }
    }

    function updateSemiRankSub(fundId) {
      const fund = window.FUND_HOLDINGS[fundId];
      const subEl = document.querySelector(`[data-panel="${fundId}"] .fund-meta .sub`);
      if (!fund || !subEl) return;
      const marketTip = fund.market === "US" ? "美股" : "沪深京 A 股";
      const kind = getSemiRankKind(fundId);
      const tip = kind === "losers" ? "跌幅" : "涨幅";
      const n = fund._rankHoldings?.length || 0;
      subEl.textContent = n
        ? `${marketTip} · ${tip}榜已加载 ${n} 只`
        : `${marketTip} · 加载中…`;
    }

    function updateSemiRankLoadMoreUI(fundId) {
      const state = semiRankState[fundId];
      const fund = window.FUND_HOLDINGS[fundId];
      if (!state || !fund) return;
      updateRankLoadMoreEl(fundId, {
        hasMore: state.hasMore !== false,
        loading: !!state.loadingMore,
        loaded: fund._rankHoldings?.length || 0
      });
    }

    function appendSemiRankRows(fundId, start) {
      const panel = document.querySelector(`[data-panel="${fundId}"]`);
      const body = panel?.querySelector(".list-body");
      const fund = window.FUND_HOLDINGS[fundId];
      if (!body || !fund) return;
      const holdings = fund.holdings.slice(start);
      if (!holdings.length) return;
      const fundSaved = loadInputs()[fundId] || {};
      body.insertAdjacentHTML(
        "beforeend",
        buildRowsHtml(fund, start, holdings, fundSaved)
      );
      updateSemiRankLoadMoreUI(fundId);
    }

    async function fillSemiRankSlice(fundId, start) {
      const fund = window.FUND_HOLDINGS[fundId];
      if (!fund) return;
      const holdings = fund.holdings.slice(start);
      if (!holdings.length) return;

      holdings.forEach((h, offset) => {
        const i = start + offset;
        const item = fund._rankHoldings?.[i];
        const input = document.querySelector(
          `input[data-fund="${fundId}"][data-index="${i}"]`
        );
        const priceEl = document.querySelector(
          `[data-row-price][data-fund="${fundId}"][data-index="${i}"]`
        );
        if (priceEl) {
          priceEl.classList.remove("up", "down");
          if (item?.price != null && !Number.isNaN(Number(item.price))) {
            const px = Number(item.price);
            priceEl.textContent =
              fund.market === "US" ? "$" + formatPrice(px) : formatPrice(px);
            if (item.change > 0) priceEl.classList.add("up");
            else if (item.change < 0) priceEl.classList.add("down");
          } else {
            priceEl.textContent = "--";
          }
        }
        if (input && item && !Number.isNaN(Number(item.change))) {
          input.value = Number(item.change).toFixed(2);
          applyChangeColor(input);
        }
      });
      persistFromDom();

      const results = await Promise.allSettled(
        holdings.map((h) => loadIntradayTrends(h))
      );
      const trends = results.map((result) =>
        result.status === "fulfilled" ? result.value : null
      );
      const cached = fundSparkTrends[fundId] || { start: 0, trends: [] };
      while (cached.trends.length < start) cached.trends.push(null);
      trends.forEach((trend, i) => {
        cached.trends[start + i] = trend;
      });
      fundSparkTrends[fundId] = { start: 0, trends: cached.trends };
      paintFundSparklines(fundId);
    }

    function bindSemiRankLoadMore(fundId) {
      bindRankLoadMore(fundId, () => {
        loadSemiRankKind(fundId, getSemiRankKind(fundId), { append: true }).catch(
          () => {}
        );
      });
    }

    const fundSparkTrends = {};

    async function syncFundQuotes(fundId) {
      if (isWatchTab(fundId)) {
        await loadWatchlist(watchlistState.type || 1, { force: true });
        return;
      }
      if (isKrTab(fundId)) {
        await loadKrRankKind(krRankState.kind || "gainers", { force: true });
        return;
      }
      if (isHkTab(fundId)) {
        await loadHkRankKind(hkRankState.kind || "gainers", { force: true });
        return;
      }

      const btn = document.querySelector(`[data-sync="${fundId}"]`);
      if (!btn && !isRankFund(fundId)) return;

      const requestId = (syncFundQuotes._req = (syncFundQuotes._req || 0) + 1);
      if (btn) {
        btn.disabled = true;
        btn.classList.add("loading");
      }

      try {
        if (isRankFund(fundId)) {
          await loadSemiRankKind(fundId, getSemiRankKind(fundId), { force: true });
          if (requestId !== syncFundQuotes._req) return;
        }

        const syncBtn = document.querySelector(`[data-sync="${fundId}"]`);
        if (syncBtn) {
          syncBtn.disabled = true;
          syncBtn.classList.add("loading");
        }

        const { fund, start, holdings: pageHoldings } = getPageSlice(fundId);
        if (!pageHoldings.length) {
          if (isRankFund(fundId)) {
            showToast("暂无涨跌榜数据");
          }
          return;
        }

        const sparkPromise = Promise.allSettled(
          pageHoldings.map((h) => loadIntradayTrends(h))
        );

        // 涨跌榜行已有涨跌幅，直接用榜单数据填入
        const rankQuoteMap = {};
        if (isRankFund(fundId) && fund._rankHoldings?.length) {
          fund._rankHoldings.forEach((item) => {
            rankQuoteMap[quoteKey(item.code)] = {
              name: item.name,
              price: item.price,
              change: item.change
            };
          });
        }
        const needQuotes = isRankFund(fundId) ? [] : pageHoldings;
        const liveQuotes = needQuotes.length ? await loadQuotes(needQuotes) : {};
        if (requestId !== syncFundQuotes._req) return;

        let ok = 0;
        const failed = [];

        pageHoldings.forEach((h, offset) => {
          const i = start + offset;
          const quote =
            liveQuotes[h.code] ||
            liveQuotes[quoteKey(h.code)] ||
            rankQuoteMap[quoteKey(h.code)];
          const input = document.querySelector(
            `input[data-fund="${fundId}"][data-index="${i}"]`
          );
          const priceEl = document.querySelector(
            `[data-row-price][data-fund="${fundId}"][data-index="${i}"]`
          );
          if (priceEl) {
            priceEl.classList.remove("up", "down");
            if (quote?.price != null && !Number.isNaN(Number(quote.price))) {
              const px = Number(quote.price);
              priceEl.textContent =
                fund.market === "US" ? "$" + formatPrice(px) : formatPrice(px);
              if (quote.change > 0) priceEl.classList.add("up");
              else if (quote.change < 0) priceEl.classList.add("down");
            } else {
              priceEl.textContent = "--";
            }
          }

          if (!quote || !input || Number.isNaN(Number(quote.change))) {
            failed.push(h.name);
            return;
          }
          input.value = Number(quote.change).toFixed(2);
          applyChangeColor(input);
          ok += 1;
        });

        persistFromDom();

        const sparkResults = await sparkPromise;
        if (requestId !== syncFundQuotes._req) return;
        const trends = sparkResults.map((result) =>
          result.status === "fulfilled" ? result.value : null
        );
        fundSparkTrends[fundId] = { start: 0, trends };
        paintFundSparklines(fundId);

        if (isRankFund(fundId)) {
          bindSemiRankLoadMore(fundId);
        }

        if (ok === 0) {
          showToast("未获取到行情，请稍后重试");
          return;
        }

        const page = getCurrentPage(fundId);
        const total = getTotalPages(fund);
        const pageTip = total > 1 ? `（第 ${page}/${total} 页）` : "";
        const msg = failed.length
          ? `已同步 ${ok} 只${pageTip}，失败：${failed.join("、")}`
          : `已同步 ${ok} 只股票实时涨跌幅`;
        showToast(msg);
      } catch (err) {
        showToast(err.message || "同步失败");
      } finally {
        if (requestId === syncFundQuotes._req) {
          const syncBtn = document.querySelector(`[data-sync="${fundId}"]`);
          if (syncBtn) {
            syncBtn.disabled = false;
            syncBtn.classList.remove("loading");
          }
        }
      }
    }

    function paintFundSparklines(fundId) {
      const cached = fundSparkTrends[fundId];
      if (!cached?.trends?.length) return;
      const { start, trends } = cached;
      trends.forEach((trend, offset) => {
        const i = start + offset;
        const canvas = document.querySelector(
          `canvas[data-row-spark][data-fund="${fundId}"][data-index="${i}"]`
        );
        if (!canvas) return;
        if (!trend) {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            const dpr = window.devicePixelRatio || 1;
            const cssW = canvas.clientWidth || 72;
            const cssH = canvas.clientHeight || 28;
            canvas.width = Math.round(cssW * dpr);
            canvas.height = Math.round(cssH * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, cssW, cssH);
          }
          return;
        }
        drawSparkline(canvas, trend.points, trend.preClose);
      });
    }

    function buildRowsHtml(fund, start, holdings, fundSaved) {
      const viewOnly = !!fund.viewOnly;
      const showPrice = viewOnly;
      const gridClass = viewOnly ? "row view-only" : "row";
      const kind = isRankFund(fund.id) ? getSemiRankKind(fund.id) : null;
      const rankSectionLabel = kind ? rankLabel(kind) : "";

      return holdings
        .map((h, offset) => {
          const i = start + offset;
          const prev =
            offset > 0
              ? holdings[offset - 1]
              : start > 0
                ? fund.holdings[start - 1]
                : null;
          const showCustomLabel =
            isRankFund(fund.id) && h.custom && (!prev || !prev.custom);
          const showRankLabel =
            isRankFund(fund.id) && !h.custom && (!prev || prev.custom);
          const sectionHtml = [
            showCustomLabel
              ? `<div class="list-section-label custom-section">我的自选</div>`
              : "",
            showRankLabel
              ? `<div class="list-section-label rank-section">${rankSectionLabel}</div>`
              : ""
          ].join("");

          const canAddWatch = ADDABLE_FUNDS.has(fund.id) && !h.custom;
          const watchType = watchTypeOfFund(fund.id);
          const safeName = String(h.name || "").replace(/"/g, "&quot;");
          const watchBtnHtml = h.custom
            ? `<button
                    class="btn-remove-stock"
                    type="button"
                    data-remove-stock="${fund.id}"
                    data-remove-code="${h.code}"
                    title="移除自选"
                    aria-label="移除 ${safeName}"
                  ><img src="assets/quxiao_zixuan.png" alt="移除" /></button>`
            : canAddWatch && watchType
              ? `<button
                    class="btn-add-watch"
                    type="button"
                    data-add-watch="${fund.id}"
                    data-watch-code="${h.code}"
                    data-watch-name="${safeName}"
                    data-watch-type="${watchType}"
                    title="加入自选"
                    aria-label="加入自选 ${safeName}"
                  ><img src="assets/add_zixuan.png" alt="自选" /></button>`
              : "";

          return `
            ${sectionHtml}
            <div class="${gridClass}${h.custom ? " is-custom" : ""}" data-index="${i}">
              <div class="stock-name-cell">
                <div class="stock-name-main">
                  <div class="stock-name-row">
                    <div
                      class="stock-name"
                      role="button"
                      tabindex="0"
                      data-chart-fund="${fund.id}"
                      data-chart-index="${i}"
                      title="查看 ${safeName} 当日分时"
                    >${h.name}</div>
                    ${watchBtnHtml}
                  </div>
                  <div class="stock-code">${h.code}</div>
                </div>
              </div>
              ${viewOnly ? "" : `<div class="ratio">${h.ratio.toFixed(2)}%</div>`}
              <div
                class="row-spark-wrap"
                role="button"
                tabindex="0"
                data-chart-fund="${fund.id}"
                data-chart-index="${i}"
                title="查看 ${h.name} 当日分时"
              >
                <canvas
                  class="row-spark"
                  data-row-spark
                  data-fund="${fund.id}"
                  data-index="${i}"
                  aria-hidden="true"
                ></canvas>
              </div>
              ${showPrice ? `<div class="row-price" data-row-price data-fund="${fund.id}" data-index="${i}">--</div>` : ""}
              <div class="change-field">
                <input
                  type="number"
                  step="0.01"
                  inputmode="decimal"
                  placeholder="${viewOnly ? "--" : "如 1.25"}"
                  data-fund="${fund.id}"
                  data-index="${i}"
                  value="${fundSaved[i] ?? ""}"
                  ${viewOnly ? "readonly tabindex=\"-1\"" : ""}
                />
                <span class="change-icon up-icon" aria-hidden="true">
                  <img src="assets/aesc.png" alt="" />
                </span>
                <span class="change-icon down-icon" aria-hidden="true">
                  <img src="assets/desc.png" alt="" />
                </span>
              </div>
            </div>`;
        })
        .join("");
    }

    function renderFundRows(fundId) {
      const panel = document.querySelector(`[data-panel="${fundId}"]`);
      const body = panel?.querySelector(".list-body");
      if (!body) return;
      const { fund, start, holdings } = getPageSlice(fundId);
      const fundSaved = loadInputs()[fundId] || {};
      body.innerHTML = buildRowsHtml(fund, start, holdings, fundSaved);
    }

    function buildPanelElement(fund, isActive) {
      const panel = document.createElement("section");
      panel.className = "panel" + (isActive ? " active" : "");
      panel.dataset.panel = fund.id;

      const fundSaved = loadInputs()[fund.id] || {};
      const viewOnly = !!fund.viewOnly;
      const ratioLabel = viewOnly ? "参考权重" : "持仓比例";
      const isRank = isRankFund(fund.id);
      const kind = isRank ? getSemiRankKind(fund.id) : null;
      const rankCount = fund._rankHoldings?.length || 0;
      let metaSub;
      if (isRank) {
        const marketTip = fund.market === "US" ? "美股" : "沪深京 A 股";
        const tip = kind === "losers" ? "跌幅" : "涨幅";
        metaSub = rankCount
          ? `${marketTip} · ${tip}榜已加载 ${rankCount} 只`
          : `${marketTip} · 加载中…`;
      } else if (viewOnly) {
        metaSub = `共 ${fund.holdings.length} 只股票 · 仅查看涨跌`;
      } else {
        metaSub = `代码 ${fund.fundCode} · 前十大合计 ${fund.top10Total.toFixed(2)}%`;
      }
      const headClass = viewOnly ? "list-head view-only" : "list-head";
      const { start, holdings: pageHoldings } = getPageSlice(fund.id);

      const actionsHtml = viewOnly
        ? ""
        : `
          <div class="actions">
            <button class="btn btn-primary" type="button" data-calc="${fund.id}">计算每日基金收益</button>
          </div>

          <div class="result" id="result-${fund.id}">
            <div class="label">估算当日收益</div>
            <div class="value flat" id="value-${fund.id}">--</div>
            <div class="detail" id="detail-${fund.id}"></div>
          </div>`;

      const addStockHtml = CUSTOMIZABLE_FUNDS.has(fund.id)
        ? `
            <div class="add-stock">
              <div class="add-stock-field">
                <input
                  type="text"
                  class="add-stock-input"
                  data-add-code="${fund.id}"
                  placeholder="${fund.market === "US" ? "输入美股代码，如 NVDA" : "沪/深/北交所代码，如 600519、000001、920001"}"
                  autocomplete="off"
                  spellcheck="false"
                />
                <button class="btn btn-add" type="button" data-add-stock="${fund.id}" aria-label="添加股票" title="添加">
                  <img src="assets/add_zixuan.png" alt="添加" />
                </button>
              </div>
              ${fund.id === "cnSemi" || fund.id === "usSemi" ? `
              <button class="btn-board" type="button" data-open-board="${fund.id === "usSemi" ? "us" : "cn"}" title="${fund.id === "usSemi" ? "查看美股市场概况" : "查看A股板块涨幅"}" aria-label="板块">
                <img src="assets/bankuai.png" alt="板块" />
              </button>` : ""}
            </div>`
        : "";

      const rankTabsHtml = isRank
        ? `
            <div class="board-tabs semi-rank-tabs">
              <button class="board-tab${kind === "gainers" ? " active" : ""}" type="button" data-semi-rank="gainers" data-semi-fund="${fund.id}">涨幅前100</button>
              <button class="board-tab${kind === "losers" ? " active" : ""}" type="button" data-semi-rank="losers" data-semi-fund="${fund.id}">跌幅前100</button>
            </div>`
        : "";

      panel.innerHTML = `
          <div class="fund-card${isRank ? " semi-rank-card" : ""}">
            <div class="fund-meta">
              <div class="fund-meta-text">
                <div class="name">${fund.fundName}</div>
                <div class="sub">${metaSub}</div>
              </div>
              <button class="btn-sync" type="button" data-sync="${fund.id}" title="推送实时涨跌幅" aria-label="推送实时涨跌幅">
                <img src="assets/pull.png" alt="推送" />
              </button>
            </div>
            ${addStockHtml}
            ${rankTabsHtml}
            <div class="${headClass}">
              <div>股票名称</div>
              ${viewOnly ? "" : `<div>${ratioLabel}</div>`}
              <div>走势</div>
              ${viewOnly ? "<div>最新价</div>" : ""}
              <div>日涨跌幅%</div>
            </div>
            <div class="list-body">
              ${buildRowsHtml(fund, start, pageHoldings, fundSaved)}
            </div>
            ${
              isRank
                ? buildRankLoadMoreHtml(fund.id, {
                    hasMore: semiRankState[fund.id]?.hasMore !== false,
                    loading: !!semiRankState[fund.id]?.loadingMore,
                    loaded: rankCount
                  })
                : buildPagerHtml(fund)
            }
          </div>

          ${actionsHtml}
        `;
      return panel;
    }

    /** 仅重建某个基金面板（自选增删用） */
    function renderFundPanel(fundId) {
      const fund = window.FUND_HOLDINGS[fundId];
      if (!fund) return;
      const panels = document.getElementById("panels");
      const old = document.querySelector(`[data-panel="${fundId}"]`);
      const isActive = old ? old.classList.contains("active") : false;
      setCurrentPage(fundId, getCurrentPage(fundId));
      const panel = buildPanelElement(fund, isActive);
      if (old) old.replaceWith(panel);
      else panels.appendChild(panel);
      updatePagerUI(fundId);
      applyAllChangeColors(fundId);
    }

    function renderTabs() {
      const tabsEl = document.querySelector(".tabs");
      if (!tabsEl) return;
      tabsEl.innerHTML = MAIN_TABS.map((tab) => {
        const iconClass = ["tab-icon", tab.iconClass].filter(Boolean).join(" ");
        const icon = tab.icon
          ? `<img class="${iconClass}" src="${tab.icon}" alt="" aria-hidden="true" />`
          : "";
        return `<button class="tab${
          tab.id === activeMainTab ? " active" : ""
        }" data-tab="${tab.id}" type="button"><span class="tab-label">${tab.name}</span>${icon}</button>`;
      }).join("");
    }

    function render() {
      renderTabs();
      renderFundPicker();
      const panels = document.getElementById("panels");
      panels.innerHTML = "";
      const funds = Object.values(window.FUND_HOLDINGS);
      const activeFundId = getActiveFundId();
      funds.forEach((fund) => {
        setCurrentPage(fund.id, getCurrentPage(fund.id));
        panels.appendChild(buildPanelElement(fund, fund.id === activeFundId));
        updatePagerUI(fund.id);
      });
      panels.appendChild(buildHkPanelElement(activeFundId === "hkStocks"));
      panels.appendChild(buildKrPanelElement(activeFundId === "krStocks"));
      panels.appendChild(buildWatchPanelElement(activeFundId === "watchStocks"));
      applyAllChangeColors();
    }
