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

    const krRankState = {
      kind: "gainers",
      list: [],
      page: 0,
      total: 0,
      hasMore: true,
      loadingMore: false,
      trends: null
    };

    function buildKrPanelElement(isActive) {
      const panel = document.createElement("section");
      panel.className = "panel" + (isActive ? " active" : "");
      panel.dataset.panel = "krStocks";
      const kind = krRankState.kind || "gainers";
      const loaded = krRankState.list?.length || 0;
      panel.innerHTML = `
          <div class="fund-card kr-rank-card">
            <div class="fund-meta">
              <div class="fund-meta-text">
                <div class="name">韩股涨跌榜</div>
                <div class="sub" id="krRankSub">${krRankSubText(kind, loaded)}</div>
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
              <div style="text-align:right">最新价</div>
              <div style="text-align:right">涨跌幅%</div>
            </div>
            <div class="kr-rank-body">
              <div class="us-stock-list kr-stock-list" id="krStockList"></div>
              <div class="rank-load-more" data-rank-more="krStocks" hidden></div>
              <div class="board-status show" id="krBoardStatus">加载中…</div>
            </div>
          </div>`;
      return panel;
    }

    function krRankSubText(kind, loaded) {
      const tip = kind === "losers" ? "跌幅" : "涨幅";
      return loaded
        ? `KOSPI / KOSDAQ · ${tip}榜已加载 ${loaded} 只`
        : "KOSPI / KOSDAQ · 加载中…";
    }

    function updateKrRankSub() {
      const subEl = document.getElementById("krRankSub");
      if (!subEl) return;
      subEl.textContent = krRankSubText(
        krRankState.kind || "gainers",
        krRankState.list?.length || 0
      );
    }

    function updateKrRankLoadMoreUI() {
      const host = document.querySelector(`[data-rank-more="krStocks"]`);
      const html = buildRankLoadMoreHtml("krStocks", {
        hasMore: krRankState.hasMore !== false,
        loading: !!krRankState.loadingMore,
        loaded: krRankState.list?.length || 0
      });
      if (!host) return;
      if (!html) {
        host.hidden = true;
        host.innerHTML = "";
        host.removeAttribute("data-rank-sentinel");
        return;
      }
      host.outerHTML = html;
    }

    function renderKrStockRankRows(list, start = 0) {
      return list
        .map((item, offset) => {
          const i = start + offset;
          const tone = toneClass(item.change);
          const priceText =
            item.price == null ? "--" : "₩" + formatPrice(item.price);
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
                  <div class="board-meta">${item.code}</div>
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
              <div class="board-price ${tone}">${priceText}</div>
              <div class="board-chg ${tone}">${formatPct(item.change)}${chgArrowHtml(item.change)}</div>
            </div>`;
        })
        .join("");
    }

    function renderKrStockRank(list, { append = false, start = 0 } = {}) {
      const wrap = document.getElementById("krStockList");
      if (!wrap) return;
      if (!append) {
        wrap.innerHTML = list.length ? renderKrStockRankRows(list, 0) : "";
        return;
      }
      if (!list.length) return;
      wrap.insertAdjacentHTML("beforeend", renderKrStockRankRows(list, start));
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

    async function paintKrSparklines(list, requestId, { start = 0 } = {}) {
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
      if (!Array.isArray(krRankState.trends) || start === 0) {
        krRankState.trends = [];
      }
      while (krRankState.trends.length < start) krRankState.trends.push(null);
      trends.forEach((trend, i) => {
        krRankState.trends[start + i] = trend;
      });
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

    function bindKrRankLoadMore() {
      bindRankLoadMore("krStocks", () => {
        loadKrRankKind(krRankState.kind || "gainers", { append: true }).catch(
          () => {}
        );
      });
    }

    async function loadKrRankKind(kind, { force = false, append = false } = {}) {
      const next = kind === "losers" ? "losers" : "gainers";
      if (!force && !append && krRankState.kind === next && krRankState.list?.length) {
        document.querySelectorAll("[data-kr-rank]").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.krRank === next);
        });
        renderKrStockRank(krRankState.list);
        updateKrRankSub();
        updateKrRankLoadMoreUI();
        setStatus("krBoardStatus", "");
        requestAnimationFrame(() => {
          redrawKrSparklines();
          bindKrRankLoadMore();
        });
        return;
      }

      if (append) {
        if (krRankState.loadingMore || krRankState.hasMore === false) return;
        if (krRankState.kind !== next) return;
        krRankState.loadingMore = true;
        updateKrRankLoadMoreUI();
        const requestId = loadKrRankKind._req;
        const nextPage = (krRankState.page || 1) + 1;
        try {
          const result = await loadKrStockRank(next, RANK_PAGE_SIZE, nextPage);
          if (requestId !== loadKrRankKind._req) return;
          const list = result.list || [];
          const start = krRankState.list?.length || 0;
          krRankState.list = mergeRankList(krRankState.list, list);
          const added = (krRankState.list?.length || 0) - start;
          krRankState.page = nextPage;
          krRankState.total = result.total || krRankState.total || 0;
          krRankState.hasMore =
            added > 0 &&
            computeRankHasMore(
              krRankState.list.length,
              list.length,
              krRankState.total
            );
          renderKrStockRank(krRankState.list.slice(start), { append: true, start });
          updateKrRankSub();
          setStatus("krBoardStatus", "");
          if (list.length) {
            await paintKrSparklines(krRankState.list.slice(start), requestId, {
              start
            });
          }
        } catch (err) {
          if (requestId === loadKrRankKind._req) {
            showToast(err?.message || "加载更多失败");
          }
        } finally {
          if (requestId === loadKrRankKind._req) {
            krRankState.loadingMore = false;
            updateKrRankLoadMoreUI();
            bindKrRankLoadMore();
          }
        }
        return;
      }

      krRankState.kind = next;
      krRankState.list = [];
      krRankState.trends = null;
      krRankState.page = 0;
      krRankState.hasMore = true;
      krRankState.loadingMore = false;
      document.querySelectorAll("[data-kr-rank]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.krRank === next);
      });

      const requestId = (loadKrRankKind._req = (loadKrRankKind._req || 0) + 1);
      const listEl = document.getElementById("krStockList");
      if (listEl) listEl.innerHTML = "";
      setStatus(
        "krBoardStatus",
        next === "losers" ? "加载跌幅榜…" : "加载涨幅榜…"
      );
      updateKrRankSub();
      updateKrRankLoadMoreUI();

      try {
        const result = await loadKrStockRank(next, RANK_PAGE_SIZE, 1);
        if (requestId !== loadKrRankKind._req) return;
        const list = result.list || [];
        krRankState.list = list;
        krRankState.page = 1;
        krRankState.total = result.total || 0;
        krRankState.hasMore = computeRankHasMore(
          list.length,
          list.length,
          krRankState.total
        );
        renderKrStockRank(list);
        updateKrRankSub();
        updateKrRankLoadMoreUI();
        setStatus("krBoardStatus", list.length ? "" : "暂无韩股数据");
        if (list.length) {
          requestAnimationFrame(() => {
            if (requestId !== loadKrRankKind._req) return;
            paintKrSparklines(list, requestId, { start: 0 }).catch(() => {});
            bindKrRankLoadMore();
          });
        }
      } catch (err) {
        if (requestId !== loadKrRankKind._req) return;
        krRankState.list = [];
        krRankState.trends = null;
        krRankState.hasMore = false;
        if (listEl) listEl.innerHTML = "";
        updateKrRankLoadMoreUI();
        setStatus("krBoardStatus", err?.message || "韩股涨跌榜加载失败，请稍后重试");
      }
    }
