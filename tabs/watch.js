    function getWatchHolding(index) {
      const item = watchlistState.list?.[index];
      if (!item) return null;
      return {
        name: item.name,
        code: item.code,
        market: item.market
      };
    }

    function buildWatchPanelElement(isActive) {
      const panel = document.createElement("section");
      panel.className = "panel" + (isActive ? " active" : "");
      panel.dataset.panel = "watchStocks";
      const type = normalizeWatchType(watchlistState.type || 1);
      const typeTabs = WATCH_TYPE_META.map(
        (m) => `
          <button
            class="board-tab${m.type === type ? " active" : ""}"
            type="button"
            data-watch-type="${m.type}"
          >${m.label}</button>`
      ).join("");

      panel.innerHTML = `
          <div class="fund-card kr-rank-card watch-rank-card">
            <div class="fund-meta">
              <div class="fund-meta-text">
                <div class="name">自选个股</div>
                <div class="sub" id="watchRankSub">${watchTypeLabel(type)} · 加载中…</div>
              </div>
              <div class="fund-meta-actions">
                <button class="btn-sync" type="button" data-watch-refresh title="刷新自选" aria-label="刷新自选">
                  <img src="assets/pull.png" alt="刷新" />
                </button>
              </div>
            </div>
            <div class="board-tabs kr-rank-tabs watch-type-tabs">
              ${typeTabs}
            </div>
            <div class="board-list-head us-stock-head kr-stock-head watch-stock-head">
              <div>股票</div>
              <div style="text-align:center">走势</div>
              <div style="text-align:right">涨跌幅%</div>
            </div>
            <div class="kr-rank-body">
              <div class="us-stock-list kr-stock-list watch-stock-list" id="watchStockList"></div>
              <div class="board-status show" id="watchBoardStatus">加载中…</div>
            </div>
          </div>`;
      return panel;
    }

    function renderWatchStockList(list) {
      const wrap = document.getElementById("watchStockList");
      if (!wrap) return;
      if (!list.length) {
        wrap.innerHTML = "";
        return;
      }
      const type = normalizeWatchType(watchlistState.type || 1);
      const meta = WATCH_TYPE_META.find((m) => m.type === type);
      const prefix = meta?.pricePrefix || "";
      wrap.innerHTML = list
        .map((item, i) => {
          const tone = item.change == null ? "flat" : toneClass(item.change);
          const chgText =
            item.change == null
              ? "--"
              : formatPct(item.change) + chgArrowHtml(item.change);
          const priceTip =
            item.price == null ? "" : " · " + prefix + formatPrice(item.price);
          const safeName = String(item.name || item.code || "").replace(
            /"/g,
            "&quot;"
          );
          return `
            <div class="board-row kr-stock-row watch-stock-row">
              <div class="board-info watch-board-info">
                <button
                  class="btn-remove-stock"
                  type="button"
                  data-remove-watch="${item.code}"
                  title="移除自选"
                  aria-label="移除 ${safeName}"
                ><img src="assets/quxiao_zixuan.png" alt="移除" /></button>
                <div class="watch-board-text">
                  <div
                    class="board-name"
                    role="button"
                    tabindex="0"
                    data-chart-fund="watchStocks"
                    data-chart-index="${i}"
                    title="查看 ${safeName} 行情"
                  >${item.name || item.code}</div>
                  <div class="board-meta">${item.code}${priceTip}</div>
                </div>
              </div>
              <div
                class="kr-spark-wrap"
                role="button"
                tabindex="0"
                data-chart-fund="watchStocks"
                data-chart-index="${i}"
                title="查看 ${safeName} 行情"
              >
                <canvas class="kr-spark" data-watch-spark="${i}" aria-hidden="true"></canvas>
              </div>
              <div class="board-chg ${tone}">${chgText}</div>
            </div>`;
        })
        .join("");
    }

    async function paintWatchSparklines(list, requestId) {
      const results = await Promise.allSettled(
        list.map((item) =>
          loadIntradayTrends({
            code: item.code,
            market: item.market,
            name: item.name
          })
        )
      );
      if (requestId != null && requestId !== loadWatchlist._req) return;

      const trends = results.map((result) =>
        result.status === "fulfilled" ? result.value : null
      );
      watchlistState.trends = trends;
      redrawWatchSparklines();
    }

    function redrawWatchSparklines() {
      const trends = watchlistState.trends;
      if (!trends?.length) return;
      trends.forEach((trend, i) => {
        const canvas = document.querySelector(`[data-watch-spark="${i}"]`);
        if (!canvas) return;
        if (!trend?.points?.length) {
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          const dpr = window.devicePixelRatio || 1;
          const cssW = canvas.clientWidth || 72;
          const cssH = canvas.clientHeight || 28;
          canvas.width = Math.round(cssW * dpr);
          canvas.height = Math.round(cssH * dpr);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, cssW, cssH);
          return;
        }
        drawSparkline(canvas, trend.points, trend.preClose);
      });
    }

    async function loadWatchlist(type, { force = false } = {}) {
      const next = normalizeWatchType(type != null ? type : watchlistState.type || 1);
      if (!force && watchlistState.type === next && watchlistState.list?.length) {
        document.querySelectorAll("[data-watch-type]").forEach((btn) => {
          btn.classList.toggle("active", Number(btn.dataset.watchType) === next);
        });
        renderWatchStockList(watchlistState.list);
        const subEl = document.getElementById("watchRankSub");
        if (subEl) {
          subEl.textContent = `${watchTypeLabel(next)} · 自选 ${watchlistState.list.length} 只`;
        }
        setStatus("watchBoardStatus", "");
        requestAnimationFrame(() => redrawWatchSparklines());
        return;
      }

      watchlistState.type = next;
      watchlistState.trends = null;
      document.querySelectorAll("[data-watch-type]").forEach((btn) => {
        btn.classList.toggle("active", Number(btn.dataset.watchType) === next);
      });

      const requestId = (loadWatchlist._req = (loadWatchlist._req || 0) + 1);
      const listEl = document.getElementById("watchStockList");
      const subEl = document.getElementById("watchRankSub");
      if (listEl) listEl.innerHTML = "";
      setStatus("watchBoardStatus", "加载自选列表…");
      if (subEl) subEl.textContent = `${watchTypeLabel(next)} · 加载中…`;

      try {
        const rows = await listWatchStocks(next);
        if (requestId !== loadWatchlist._req) return;
        const list = rows.length ? await loadWatchQuotes(rows, next) : [];
        if (requestId !== loadWatchlist._req) return;
        watchlistState.list = list;
        renderWatchStockList(list);
        if (subEl) {
          subEl.textContent = `${watchTypeLabel(next)} · 自选 ${list.length} 只`;
        }
        setStatus(
          "watchBoardStatus",
          list.length ? "" : `暂无${watchTypeLabel(next)}自选，可在各市场页添加`
        );
        if (list.length) {
          requestAnimationFrame(() => {
            if (requestId !== loadWatchlist._req) return;
            paintWatchSparklines(list, requestId).catch(() => {});
          });
        }
      } catch (err) {
        if (requestId !== loadWatchlist._req) return;
        watchlistState.list = [];
        watchlistState.trends = null;
        if (listEl) listEl.innerHTML = "";
        if (subEl) subEl.textContent = `${watchTypeLabel(next)} · 加载失败`;
        setStatus(
          "watchBoardStatus",
          err?.message || "自选列表加载失败，请稍后重试"
        );
      }
    }
