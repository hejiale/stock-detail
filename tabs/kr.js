    function renderKrIndices(list) {
      const wrap = document.getElementById("krIndexGrid");
      if (!wrap) return;
      if (!list.length) {
        wrap.innerHTML = '<div class="board-meta" style="padding:8px">暂无指数数据</div>';
        return;
      }
      wrap.innerHTML = list
        .map((item, i) => {
          const tone = toneClass(item.change);
          return `
            <div class="us-index-card" data-kr-index="${i}">
              <div class="idx-head">
                <div class="idx-name">${item.name}</div>
                <div class="idx-chg ${tone}">${formatPct(item.change)}${chgArrowHtml(item.change)}</div>
              </div>
              <div class="idx-price">${item.price == null ? "--" : formatPrice(item.price)}</div>
              <canvas class="idx-chart" data-kr-idx-spark="${i}" aria-hidden="true"></canvas>
            </div>`;
        })
        .join("");
    }

    async function paintKrIndexSparklines(list) {
      const results = await Promise.allSettled(
        list.map((item) =>
          loadIntradayTrends({ code: item.code, market: item.market, name: item.name })
        )
      );
      const trends = results.map((result) =>
        result.status === "fulfilled" ? result.value : null
      );
      openKrBoardModal._trends = trends;
      trends.forEach((trend, i) => {
        if (!trend) return;
        const canvas = document.querySelector(`[data-kr-idx-spark="${i}"]`);
        if (!canvas) return;
        drawSparkline(canvas, trend.points, trend.preClose);
      });
    }

    function redrawKrIndexSparklines() {
      const trends = openKrBoardModal._trends;
      if (!trends?.length) return;
      trends.forEach((trend, i) => {
        if (!trend) return;
        const canvas = document.querySelector(`[data-kr-idx-spark="${i}"]`);
        if (!canvas) return;
        drawSparkline(canvas, trend.points, trend.preClose);
      });
    }

    async function openKrBoardModal() {
      showModal("krBoardModal");
      setStatus("krBoardModalStatus", "加载中…");
      document.getElementById("krIndexGrid").innerHTML = "";
      renderMarketBreadth("krMarketBreadth", null);

      const requestId = (openKrBoardModal._req = (openKrBoardModal._req || 0) + 1);

      try {
        const [indicesResult, breadthResult] = await Promise.allSettled([
          loadKrIndices(),
          loadKrMarketBreadth()
        ]);
        if (requestId !== openKrBoardModal._req) return;

        const indices =
          indicesResult.status === "fulfilled" ? indicesResult.value : [];
        if (indicesResult.status === "rejected" && !indices.length) {
          throw indicesResult.reason || new Error("韩股数据加载失败");
        }

        openKrBoardModal._indices = indices;
        renderKrIndices(indices);
        if (breadthResult.status === "fulfilled") {
          renderMarketBreadth("krMarketBreadth", breadthResult.value);
        }
        setStatus("krBoardModalStatus", indices.length ? "" : "暂无指数数据");
        requestAnimationFrame(() => {
          if (requestId !== openKrBoardModal._req) return;
          paintKrIndexSparklines(indices).catch(() => {});
        });
      } catch (err) {
        if (requestId !== openKrBoardModal._req) return;
        setStatus(
          "krBoardModalStatus",
          err?.message || "韩股数据加载失败，请稍后重试"
        );
      }
    }

    function closeKrBoardModal() {
      openKrBoardModal._req = (openKrBoardModal._req || 0) + 1;
      hideModal("krBoardModal");
      setStatus("krBoardModalStatus", "");
      renderMarketBreadth("krMarketBreadth", null);
    }

    const krRankState = { kind: "gainers" };

    function buildKrPanelElement(isActive) {
      const panel = document.createElement("section");
      panel.className = "panel" + (isActive ? " active" : "");
      panel.dataset.panel = "krStocks";
      const kind = krRankState.kind || "gainers";
      panel.innerHTML = `
          <div class="fund-card kr-rank-card">
            <div class="fund-meta">
              <div class="fund-meta-text">
                <div class="name">韩股涨跌榜</div>
                <div class="sub" id="krRankSub">KOSPI / KOSDAQ · 涨跌幅前 100</div>
              </div>
              <div class="fund-meta-actions">
                <button class="btn-board" type="button" data-open-board="kr" title="查看韩股市场概况" aria-label="板块">
                  <img src="assets/bankuai.png" alt="板块" />
                </button>
                <button class="btn-sync" type="button" data-kr-refresh title="刷新涨跌榜" aria-label="刷新涨跌榜">
                  <img src="assets/pull.png" alt="刷新" />
                </button>
              </div>
            </div>
            <div class="add-stock">
              <div class="add-stock-field">
                <input
                  type="text"
                  class="add-stock-input"
                  data-add-code="krStocks"
                  placeholder="韩股代码，如 005930"
                  autocomplete="off"
                  spellcheck="false"
                />
                <button class="btn btn-add" type="button" data-add-stock="krStocks" aria-label="添加股票" title="添加">
                  <img src="assets/add_zixuan.png" alt="添加" />
                </button>
              </div>
            </div>
            <div class="board-tabs kr-rank-tabs">
              <button class="board-tab${kind === "gainers" ? " active" : ""}" type="button" data-kr-rank="gainers">涨幅前100</button>
              <button class="board-tab${kind === "losers" ? " active" : ""}" type="button" data-kr-rank="losers">跌幅前100</button>
            </div>
            <div class="board-list-head us-stock-head kr-stock-head">
              <div>股票</div>
              <div style="text-align:center">走势</div>
              <div style="text-align:right">涨跌幅%</div>
            </div>
            <div class="kr-rank-body">
              <div class="us-stock-list kr-stock-list" id="krStockList"></div>
              <div class="board-status show" id="krBoardStatus">加载中…</div>
            </div>
          </div>`;
      return panel;
    }

    function renderKrStockRank(list) {
      const wrap = document.getElementById("krStockList");
      if (!wrap) return;
      if (!list.length) {
        wrap.innerHTML = "";
        return;
      }
      wrap.innerHTML = list
        .map((item, i) => {
          const tone = toneClass(item.change);
          const priceTip =
            item.price == null ? "" : " · ₩" + formatPrice(item.price);
          const safeName = String(item.name || "").replace(/"/g, "&quot;");
          return `
            <div class="board-row kr-stock-row">
              <div class="board-info rank-board-info">
                <div class="rank-board-text">
                  <div class="board-name-row">
                    <div
                      class="board-name"
                      role="button"
                      tabindex="0"
                      data-chart-fund="krStocks"
                      data-chart-index="${i}"
                      title="查看 ${safeName} 行情"
                    >${item.name}</div>
                    <button
                      class="btn-add-watch"
                      type="button"
                      data-add-watch="krStocks"
                      data-watch-code="${item.code}"
                      data-watch-name="${safeName}"
                      data-watch-type="4"
                      title="加入自选"
                      aria-label="加入自选 ${safeName}"
                    ><img src="assets/add_zixuan.png" alt="自选" /></button>
                  </div>
                  <div class="board-meta">${item.code}${priceTip}</div>
                </div>
              </div>
              <div
                class="kr-spark-wrap"
                role="button"
                tabindex="0"
                data-chart-fund="krStocks"
                data-chart-index="${i}"
                title="查看 ${safeName} 行情"
              >
                <canvas class="kr-spark" data-kr-spark="${i}" aria-hidden="true"></canvas>
              </div>
              <div class="board-chg ${tone}">${formatPct(item.change)}${chgArrowHtml(item.change)}</div>
            </div>`;
        })
        .join("");
    }

    function getKrRankHolding(index) {
      const item = krRankState.list?.[index];
      if (!item) return null;
      return {
        name: item.name,
        code: item.code,
        market: item.market != null ? item.market : 177
      };
    }

    async function paintKrSparklines(list, requestId) {
      const results = await Promise.allSettled(
        list.map((item) =>
          loadIntradayTrends({
            code: item.code,
            market: item.market != null ? item.market : 177,
            name: item.name
          })
        )
      );
      if (requestId != null && requestId !== loadKrRankKind._req) return;

      const trends = results.map((result) =>
        result.status === "fulfilled" ? result.value : null
      );
      krRankState.trends = trends;
      redrawKrSparklines();
    }

    function redrawKrSparklines() {
      const trends = krRankState.trends;
      if (!trends?.length) return;
      trends.forEach((trend, i) => {
        const canvas = document.querySelector(`[data-kr-spark="${i}"]`);
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

    async function loadKrRankKind(kind, { force = false } = {}) {
      const next = kind === "losers" ? "losers" : "gainers";
      if (!force && krRankState.kind === next && krRankState.list?.length) {
        document.querySelectorAll("[data-kr-rank]").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.krRank === next);
        });
        renderKrStockRank(krRankState.list);
        setStatus("krBoardStatus", "");
        requestAnimationFrame(() => redrawKrSparklines());
        return;
      }

      krRankState.kind = next;
      krRankState.trends = null;
      document.querySelectorAll("[data-kr-rank]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.krRank === next);
      });

      const requestId = (loadKrRankKind._req = (loadKrRankKind._req || 0) + 1);
      const listEl = document.getElementById("krStockList");
      const subEl = document.getElementById("krRankSub");
      if (listEl) listEl.innerHTML = "";
      setStatus(
        "krBoardStatus",
        next === "losers" ? "加载跌幅前100…" : "加载涨幅前100…"
      );
      if (subEl) {
        subEl.textContent =
          next === "losers"
            ? "KOSPI / KOSDAQ · 跌幅前 100"
            : "KOSPI / KOSDAQ · 涨幅前 100";
      }

      try {
        const list = await loadKrStockRank(next, 100);
        if (requestId !== loadKrRankKind._req) return;
        krRankState.list = list;
        renderKrStockRank(list);
        setStatus("krBoardStatus", list.length ? "" : "暂无韩股数据");
        if (list.length) {
          requestAnimationFrame(() => {
            if (requestId !== loadKrRankKind._req) return;
            paintKrSparklines(list, requestId).catch(() => {});
          });
        }
      } catch (err) {
        if (requestId !== loadKrRankKind._req) return;
        krRankState.list = [];
        krRankState.trends = null;
        if (listEl) listEl.innerHTML = "";
        setStatus("krBoardStatus", err?.message || "韩股涨跌榜加载失败，请稍后重试");
      }
    }

