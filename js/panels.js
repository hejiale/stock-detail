    const fundSparkTrends = {};

    async function syncFundQuotes(fundId) {
      if (isWatchTab(fundId)) {
        await loadWatchlist(watchlistState.type || 1, { force: true });
        return;
      }
      if (isFundRankTab(fundId)) {
        await loadFundRankPeriod(fundRankState.period || "month", { force: true });
        return;
      }
      if (isFocusFundsTab(fundId)) {
        await loadFocusFunds({ force: true });
        return;
      }
      if (isCnTab(fundId)) {
        await loadCnRankKind(cnRankState.kind || "gainers", { force: true });
        return;
      }
      if (isUsTab(fundId)) {
        await loadUsRankKind(usRankState.kind || "gainers", { force: true });
        return;
      }
      if (isJpTab(fundId)) {
        await loadJpRankKind(jpRankState.kind || "gainers", { force: true });
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
      if (isBondsTab(fundId)) {
        await loadBondsKind(bondsState.kind || "treasury", { force: true });
        return;
      }
      if (isMetalsTab(fundId)) {
        await loadMetalsKind(metalsState.kind || "spotIntl", { force: true });
        return;
      }
      if (isOilTab(fundId)) {
        await loadOilKind(oilState.kind || "intl", { force: true });
        return;
      }
      if (isCryptoTab(fundId)) {
        await loadCryptoList({ force: true });
        return;
      }

      const btn = document.querySelector(`[data-sync="${fundId}"]`);
      if (!btn) return;

      const requestId = (syncFundQuotes._req = (syncFundQuotes._req || 0) + 1);
      if (btn) {
        btn.disabled = true;
        btn.classList.add("loading");
      }

      try {
        const syncBtn = document.querySelector(`[data-sync="${fundId}"]`);
        if (syncBtn) {
          syncBtn.disabled = true;
          syncBtn.classList.add("loading");
        }

        const { fund, start, holdings: pageHoldings } = getPageSlice(fundId);
        if (!pageHoldings.length) {
          return;
        }

        const sparkPromise = Promise.allSettled(
          pageHoldings.map((h) => loadIntradayTrends(h))
        );

        const liveQuotes = await loadQuotes(pageHoldings);
        if (requestId !== syncFundQuotes._req) return;

        let ok = 0;
        const failed = [];

        pageHoldings.forEach((h, offset) => {
          const i = start + offset;
          const quote =
            liveQuotes[h.code] || liveQuotes[quoteKey(h.code)];
          const input = document.querySelector(
            `.change-value[data-fund="${fundId}"][data-index="${i}"]`
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
          const raw = Number(quote.change).toFixed(2);
          input.dataset.raw = raw;
          input.textContent = raw;
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
      return holdings
        .map((h, offset) => {
          const i = start + offset;
          const safeName = String(h.name || "").replace(/"/g, "&quot;");

          return `
            <div class="row" data-index="${i}">
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
                  </div>
                  <div class="stock-code">${codeWithCopyHtml(h.code, h.name)}</div>
                </div>
              </div>
              <div class="ratio">${h.ratio.toFixed(2)}%</div>
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
              <div class="change-field">
                <span
                  class="change-value"
                  data-fund="${fund.id}"
                  data-index="${i}"
                  data-raw="${fundSaved[i] ?? ""}"
                >${formatChangeDisplay(fundSaved[i])}</span>
                <span class="change-icon up-icon" aria-hidden="true">${chgArrowHtml(1)}</span>
                <span class="change-icon down-icon" aria-hidden="true">${chgArrowHtml(-1)}</span>
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
      const metaSub = `代码 ${fund.fundCode} · 前十大合计 ${fund.top10Total.toFixed(2)}%`;
      const { start, holdings: pageHoldings } = getPageSlice(fund.id);

      panel.innerHTML = `
          <div class="fund-card">
            <div class="fund-meta">
              <div class="fund-meta-text">
                <div class="name">${fund.fundName}</div>
                <div class="sub">${metaSub}</div>
              </div>
              <button class="btn-sync" type="button" data-sync="${fund.id}" title="推送实时涨跌幅" aria-label="推送实时涨跌幅">
                <img src="assets/pull.png" alt="推送" />
              </button>
            </div>
            <div class="list-head">
              <div>股票名称</div>
              <div>持仓比例</div>
              <div>走势</div>
              <div>日涨跌幅%</div>
            </div>
            <div class="list-body">
              ${buildRowsHtml(fund, start, pageHoldings, fundSaved)}
            </div>
            ${buildPagerHtml(fund)}
          </div>

          <div class="actions">
            <button class="btn btn-primary" type="button" data-calc="${fund.id}">计算每日基金收益</button>
          </div>

          <div class="result" id="result-${fund.id}">
            <div class="label">估算当日收益</div>
            <div class="value flat" id="value-${fund.id}">--</div>
            <div class="detail" id="detail-${fund.id}"></div>
          </div>
        `;
      return panel;
    }

    /** 仅重建某个基金面板（自选增删用） */
    function renderFundPanel(fundId) {
      const fund = window.FUND_HOLDINGS?.[fundId];
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
      const activeGroup = getMainGroupId(activeMainTab);
      tabsEl.innerHTML = MAIN_TABS.map((tab) => {
        const icon = tab.icon
          ? `<img class="tab-icon" src="${tab.icon}" alt="" aria-hidden="true" />`
          : "";
        return `<button class="tab${
          tab.id === activeGroup ? " active" : ""
        }" data-tab="${tab.id}" type="button"><span class="tab-label">${tab.name}</span>${icon}</button>`;
      }).join("");
    }

    function render() {
      renderTabs();
      renderFundPicker();
      const panels = document.getElementById("panels");
      panels.innerHTML = "";
      const activeFundId = getActiveFundId();
      panels.appendChild(buildCnPanelElement(activeFundId === "cnSemi"));
      panels.appendChild(buildUsPanelElement(activeFundId === "usSemi"));
      panels.appendChild(buildHkPanelElement(activeFundId === "hkStocks"));
      panels.appendChild(buildJpPanelElement(activeFundId === "jpStocks"));
      panels.appendChild(buildKrPanelElement(activeFundId === "krStocks"));
      panels.appendChild(buildBondsPanelElement(activeFundId === "bonds"));
      panels.appendChild(buildMetalsPanelElement(activeFundId === "metals"));
      panels.appendChild(buildOilPanelElement(activeFundId === "oil"));
      panels.appendChild(buildCryptoPanelElement(activeFundId === "crypto"));
      panels.appendChild(buildFundRankPanelElement(activeFundId === "fundRank"));
      panels.appendChild(buildWatchPanelElement(activeFundId === "watchStocks"));
      panels.appendChild(buildFocusFundsPanelElement(activeFundId === "funds"));
      applyAllChangeColors();
    }
