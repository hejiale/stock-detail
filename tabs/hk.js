    function renderHkIndices(list) {
      const wrap = document.getElementById("hkIndexGrid");
      if (!wrap) return;
      if (!list.length) {
        wrap.innerHTML = '<div class="board-meta" style="padding:8px">暂无指数数据</div>';
        return;
      }
      wrap.innerHTML = list
        .map((item, i) => {
          const tone = toneClass(item.change);
          return `
            <div class="us-index-card" data-hk-index="${i}">
              <div class="idx-head">
                <div class="idx-name">${item.name}</div>
                <div class="idx-chg ${tone}">${formatPct(item.change)}${chgArrowHtml(item.change)}</div>
              </div>
              <div class="idx-price">${item.price == null ? "--" : formatPrice(item.price)}</div>
              <canvas class="idx-chart" data-hk-idx-spark="${i}" aria-hidden="true"></canvas>
            </div>`;
        })
        .join("");
    }

    async function paintHkIndexSparklines(list) {
      const results = await Promise.allSettled(
        list.map((item) =>
          loadIntradayTrends({ code: item.code, market: item.market, name: item.name })
        )
      );
      const trends = results.map((result) =>
        result.status === "fulfilled" ? result.value : null
      );
      openHkBoardModal._trends = trends;
      trends.forEach((trend, i) => {
        if (!trend) return;
        const canvas = document.querySelector(`[data-hk-idx-spark="${i}"]`);
        if (!canvas) return;
        drawSparkline(canvas, trend.points, trend.preClose);
      });
    }

    function redrawHkIndexSparklines() {
      const trends = openHkBoardModal._trends;
      if (!trends?.length) return;
      trends.forEach((trend, i) => {
        if (!trend) return;
        const canvas = document.querySelector(`[data-hk-idx-spark="${i}"]`);
        if (!canvas) return;
        drawSparkline(canvas, trend.points, trend.preClose);
      });
    }

    async function openHkBoardModal() {
      showModal("hkBoardModal");
      setStatus("hkBoardModalStatus", "加载中…");
      document.getElementById("hkIndexGrid").innerHTML = "";
      renderMarketBreadth("hkMarketBreadth", null);

      const requestId = (openHkBoardModal._req = (openHkBoardModal._req || 0) + 1);

      try {
        const [indicesResult, breadthResult] = await Promise.allSettled([
          loadHkIndices(),
          loadHkMarketBreadth()
        ]);
        if (requestId !== openHkBoardModal._req) return;

        const indices =
          indicesResult.status === "fulfilled" ? indicesResult.value : [];
        if (indicesResult.status === "rejected" && !indices.length) {
          throw indicesResult.reason || new Error("港股数据加载失败");
        }

        openHkBoardModal._indices = indices;
        renderHkIndices(indices);
        if (breadthResult.status === "fulfilled") {
          renderMarketBreadth("hkMarketBreadth", breadthResult.value);
        }
        setStatus("hkBoardModalStatus", indices.length ? "" : "暂无指数数据");
        requestAnimationFrame(() => {
          if (requestId !== openHkBoardModal._req) return;
          paintHkIndexSparklines(indices).catch(() => {});
        });
      } catch (err) {
        if (requestId !== openHkBoardModal._req) return;
        setStatus(
          "hkBoardModalStatus",
          err?.message || "港股数据加载失败，请稍后重试"
        );
      }
    }

    function closeHkBoardModal() {
      openHkBoardModal._req = (openHkBoardModal._req || 0) + 1;
      hideModal("hkBoardModal");
      setStatus("hkBoardModalStatus", "");
      renderMarketBreadth("hkMarketBreadth", null);
    }

    const hkRankState = { kind: "gainers" };

    function buildHkPanelElement(isActive) {
      const panel = document.createElement("section");
      panel.className = "panel" + (isActive ? " active" : "");
      panel.dataset.panel = "hkStocks";
      const kind = hkRankState.kind || "gainers";
      panel.innerHTML = `
          <div class="fund-card kr-rank-card hk-rank-card">
            <div class="fund-meta">
              <div class="fund-meta-text">
                <div class="name">港股涨跌榜</div>
                <div class="sub" id="hkRankSub">主板 / 创业板 · 涨跌幅前 100</div>
              </div>
              <div class="fund-meta-actions">
                <button class="btn-board" type="button" data-open-board="hk" title="查看港股市场概况" aria-label="板块">
                  <img src="assets/bankuai.png" alt="板块" />
                </button>
                <button class="btn-sync" type="button" data-hk-refresh title="刷新涨跌榜" aria-label="刷新涨跌榜">
                  <img src="assets/pull.png" alt="刷新" />
                </button>
              </div>
            </div>
            <div class="add-stock">
              <div class="add-stock-field">
                <input
                  type="text"
                  class="add-stock-input"
                  data-add-code="hkStocks"
                  placeholder="港股代码，如 00700、09988"
                  autocomplete="off"
                  spellcheck="false"
                />
                <button class="btn btn-add" type="button" data-add-stock="hkStocks" aria-label="添加股票" title="添加">
                  <img src="assets/add_zixuan.png" alt="添加" />
                </button>
              </div>
            </div>
            <div class="board-tabs kr-rank-tabs">
              <button class="board-tab${kind === "gainers" ? " active" : ""}" type="button" data-hk-rank="gainers">涨幅前100</button>
              <button class="board-tab${kind === "losers" ? " active" : ""}" type="button" data-hk-rank="losers">跌幅前100</button>
            </div>
            <div class="board-list-head us-stock-head kr-stock-head">
              <div>股票</div>
              <div style="text-align:center">走势</div>
              <div style="text-align:right">涨跌幅%</div>
            </div>
            <div class="kr-rank-body">
              <div class="us-stock-list kr-stock-list" id="hkStockList"></div>
              <div class="board-status show" id="hkBoardStatus">加载中…</div>
            </div>
          </div>`;
      return panel;
    }

    function renderHkStockRank(list) {
      const wrap = document.getElementById("hkStockList");
      if (!wrap) return;
      if (!list.length) {
        wrap.innerHTML = "";
        return;
      }
      wrap.innerHTML = list
        .map((item, i) => {
          const tone = toneClass(item.change);
          const priceTip =
            item.price == null ? "" : " · HK$" + formatPrice(item.price);
          const safeName = String(item.name || "").replace(/"/g, "&quot;");
          return `
            <div class="board-row kr-stock-row">
              <div class="board-info rank-board-info">
                <div class="rank-board-text">
                  <div
                    class="board-name"
                    role="button"
                    tabindex="0"
                    data-chart-fund="hkStocks"
                    data-chart-index="${i}"
                    title="查看 ${safeName} 行情与个股资料"
                  >${item.name}</div>
                  <div class="board-meta">${item.code}${priceTip}</div>
                </div>
                <button
                  class="btn-add-watch"
                  type="button"
                  data-add-watch="hkStocks"
                  data-watch-code="${item.code}"
                  data-watch-name="${safeName}"
                  data-watch-type="3"
                  title="加入自选"
                  aria-label="加入自选 ${safeName}"
                ><img src="assets/add_zixuan.png" alt="自选" /></button>
              </div>
              <div
                class="kr-spark-wrap"
                role="button"
                tabindex="0"
                data-chart-fund="hkStocks"
                data-chart-index="${i}"
                title="查看 ${safeName} 行情与个股资料"
              >
                <canvas class="kr-spark" data-hk-spark="${i}" aria-hidden="true"></canvas>
              </div>
              <div class="board-chg ${tone}">${formatPct(item.change)}${chgArrowHtml(item.change)}</div>
            </div>`;
        })
        .join("");
    }

    function getHkRankHolding(index) {
      const item = hkRankState.list?.[index];
      if (!item) return null;
      return {
        name: item.name,
        code: item.code,
        market: item.market != null ? item.market : 116
      };
    }

    async function paintHkSparklines(list, requestId) {
      const results = await Promise.allSettled(
        list.map((item) =>
          loadIntradayTrends({
            code: item.code,
            market: item.market != null ? item.market : 116,
            name: item.name
          })
        )
      );
      if (requestId != null && requestId !== loadHkRankKind._req) return;

      const trends = results.map((result) =>
        result.status === "fulfilled" ? result.value : null
      );
      hkRankState.trends = trends;
      redrawHkSparklines();
    }

    function redrawHkSparklines() {
      const trends = hkRankState.trends;
      if (!trends?.length) return;
      trends.forEach((trend, i) => {
        const canvas = document.querySelector(`[data-hk-spark="${i}"]`);
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

    async function loadHkRankKind(kind, { force = false } = {}) {
      const next = kind === "losers" ? "losers" : "gainers";
      if (!force && hkRankState.kind === next && hkRankState.list?.length) {
        document.querySelectorAll("[data-hk-rank]").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.hkRank === next);
        });
        renderHkStockRank(hkRankState.list);
        setStatus("hkBoardStatus", "");
        requestAnimationFrame(() => redrawHkSparklines());
        return;
      }

      hkRankState.kind = next;
      hkRankState.trends = null;
      document.querySelectorAll("[data-hk-rank]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.hkRank === next);
      });

      const requestId = (loadHkRankKind._req = (loadHkRankKind._req || 0) + 1);
      const listEl = document.getElementById("hkStockList");
      const subEl = document.getElementById("hkRankSub");
      if (listEl) listEl.innerHTML = "";
      setStatus(
        "hkBoardStatus",
        next === "losers" ? "加载跌幅前100…" : "加载涨幅前100…"
      );
      if (subEl) {
        subEl.textContent =
          next === "losers"
            ? "主板 / 创业板 · 跌幅前 100"
            : "主板 / 创业板 · 涨幅前 100";
      }

      try {
        const list = await loadHkStockRank(next, 100);
        if (requestId !== loadHkRankKind._req) return;
        hkRankState.list = list;
        renderHkStockRank(list);
        setStatus("hkBoardStatus", list.length ? "" : "暂无港股数据");
        if (list.length) {
          requestAnimationFrame(() => {
            if (requestId !== loadHkRankKind._req) return;
            paintHkSparklines(list, requestId).catch(() => {});
          });
        }
      } catch (err) {
        if (requestId !== loadHkRankKind._req) return;
        hkRankState.list = [];
        hkRankState.trends = null;
        if (listEl) listEl.innerHTML = "";
        setStatus("hkBoardStatus", err?.message || "港股涨跌榜加载失败，请稍后重试");
      }
    }
