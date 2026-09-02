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

    const hkRankState = {
      kind: "gainers",
      list: [],
      page: 0,
      total: 0,
      hasMore: true,
      loadingMore: false,
      trends: null
    };

    function buildHkPanelElement(isActive) {
      const panel = document.createElement("section");
      panel.className = "panel" + (isActive ? " active" : "");
      panel.dataset.panel = "hkStocks";
      const kind = hkRankState.kind || "gainers";
      const loaded = hkRankState.list?.length || 0;
      panel.innerHTML = `
          <div class="fund-card kr-rank-card hk-rank-card">
            <div class="fund-meta">
              <div class="fund-meta-text">
                <div class="name">港股涨跌榜</div>
                <div class="sub" id="hkRankSub">${hkRankSubText(kind, loaded)}</div>
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
                  placeholder="输入代码或名称查询，如 00700、腾讯"
                  autocomplete="off"
                  spellcheck="false"
                />
              </div>
            </div>
            <div class="board-tabs kr-rank-tabs">
              <button class="board-tab${kind === "gainers" ? " active" : ""}" type="button" data-hk-rank="gainers">涨幅前100</button>
              <button class="board-tab${kind === "losers" ? " active" : ""}" type="button" data-hk-rank="losers">跌幅前100</button>
            </div>
            <div class="board-list-head us-stock-head kr-stock-head">
              <div>股票</div>
              <div style="text-align:center">走势</div>
              <div style="text-align:center">最新价</div>
              <div style="text-align:center">涨跌幅%</div>
            </div>
            <div class="kr-rank-body">
              <div class="us-stock-list kr-stock-list" id="hkStockList"></div>
              <div class="rank-load-more" data-rank-more="hkStocks" hidden></div>
              <div class="board-status show" id="hkBoardStatus">加载中…</div>
            </div>
          </div>`;
      return panel;
    }

    function hkRankSubText(kind, loaded) {
      const tip = kind === "losers" ? "跌幅" : "涨幅";
      return loaded
        ? `主板 / 创业板 · ${tip}榜已加载 ${loaded} 只`
        : "主板 / 创业板 · 加载中…";
    }

    function updateHkRankSub() {
      const subEl = document.getElementById("hkRankSub");
      if (!subEl) return;
      subEl.textContent = hkRankSubText(
        hkRankState.kind || "gainers",
        hkRankState.list?.length || 0
      );
    }

    function updateHkRankLoadMoreUI() {
      const host = document.querySelector(`[data-rank-more="hkStocks"]`);
      const html = buildRankLoadMoreHtml("hkStocks", {
        hasMore: hkRankState.hasMore !== false,
        loading: !!hkRankState.loadingMore,
        loaded: hkRankState.list?.length || 0
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

    function renderHkStockRankRows(list, start = 0) {
      return list
        .map((item, offset) => {
          const i = start + offset;
          const tone = toneClass(item.change);
          const priceText =
            item.price == null ? "--" : "HK$" + formatPrice(item.price);
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
                      data-chart-fund="hkStocks"
                      data-chart-index="${i}"
                      title="查看 ${safeName} 行情与个股资料"
                    >${item.name}</div>
                  </div>
                  <div class="board-meta">${codeWithCopyHtml(item.code, item.name)}</div>
                </div>
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
              <div class="board-price ${tone}">${priceText}</div>
              <div class="board-chg ${tone}">${formatPct(item.change)}${chgArrowHtml(item.change)}</div>
            </div>`;
        })
        .join("");
    }

    function renderHkStockRank(list, { append = false, start = 0 } = {}) {
      const wrap = document.getElementById("hkStockList");
      if (!wrap) return;
      if (!append) {
        wrap.innerHTML = list.length ? renderHkStockRankRows(list, 0) : "";
        return;
      }
      if (!list.length) return;
      wrap.insertAdjacentHTML("beforeend", renderHkStockRankRows(list, start));
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

    async function paintHkSparklines(list, requestId, { start = 0 } = {}) {
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
      if (!Array.isArray(hkRankState.trends) || start === 0) {
        hkRankState.trends = [];
      }
      while (hkRankState.trends.length < start) hkRankState.trends.push(null);
      trends.forEach((trend, i) => {
        hkRankState.trends[start + i] = trend;
      });
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

    function bindHkRankLoadMore() {
      bindRankLoadMore("hkStocks", () => {
        loadHkRankKind(hkRankState.kind || "gainers", { append: true }).catch(
          () => {}
        );
      });
    }

    async function loadHkRankKind(kind, { force = false, append = false } = {}) {
      const next = kind === "losers" ? "losers" : "gainers";
      if (!force && !append && hkRankState.kind === next && hkRankState.list?.length) {
        document.querySelectorAll("[data-hk-rank]").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.hkRank === next);
        });
        renderHkStockRank(hkRankState.list);
        updateHkRankSub();
        updateHkRankLoadMoreUI();
        setStatus("hkBoardStatus", "");
        requestAnimationFrame(() => {
          redrawHkSparklines();
          bindHkRankLoadMore();
        });
        return;
      }

      if (append) {
        if (hkRankState.loadingMore || hkRankState.hasMore === false) return;
        if (hkRankState.kind !== next) return;
        hkRankState.loadingMore = true;
        updateHkRankLoadMoreUI();
        const requestId = loadHkRankKind._req;
        const nextPage = (hkRankState.page || 1) + 1;
        try {
          const result = await loadHkStockRank(next, RANK_PAGE_SIZE, nextPage);
          if (requestId !== loadHkRankKind._req) return;
          const list = result.list || [];
          const start = hkRankState.list?.length || 0;
          hkRankState.list = mergeRankList(hkRankState.list, list);
          const added = (hkRankState.list?.length || 0) - start;
          hkRankState.page = nextPage;
          hkRankState.total = result.total || hkRankState.total || 0;
          hkRankState.hasMore =
            added > 0 &&
            computeRankHasMore(
              hkRankState.list.length,
              list.length,
              hkRankState.total
            );
          renderHkStockRank(hkRankState.list.slice(start), { append: true, start });
          updateHkRankSub();
          setStatus("hkBoardStatus", "");
          if (list.length) {
            await paintHkSparklines(hkRankState.list.slice(start), requestId, {
              start
            });
          }
        } catch (err) {
          if (requestId === loadHkRankKind._req) {
            showToast(err?.message || "加载更多失败");
          }
        } finally {
          if (requestId === loadHkRankKind._req) {
            hkRankState.loadingMore = false;
            updateHkRankLoadMoreUI();
            bindHkRankLoadMore();
          }
        }
        return;
      }

      hkRankState.kind = next;
      hkRankState.list = [];
      hkRankState.trends = null;
      hkRankState.page = 0;
      hkRankState.hasMore = true;
      hkRankState.loadingMore = false;
      document.querySelectorAll("[data-hk-rank]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.hkRank === next);
      });

      const requestId = (loadHkRankKind._req = (loadHkRankKind._req || 0) + 1);
      const listEl = document.getElementById("hkStockList");
      if (listEl) listEl.innerHTML = "";
      setStatus(
        "hkBoardStatus",
        next === "losers" ? "加载跌幅榜…" : "加载涨幅榜…"
      );
      updateHkRankSub();
      updateHkRankLoadMoreUI();

      try {
        const result = await loadHkStockRank(next, RANK_PAGE_SIZE, 1);
        if (requestId !== loadHkRankKind._req) return;
        const list = result.list || [];
        hkRankState.list = list;
        hkRankState.page = 1;
        hkRankState.total = result.total || 0;
        hkRankState.hasMore = computeRankHasMore(
          list.length,
          list.length,
          hkRankState.total
        );
        renderHkStockRank(list);
        updateHkRankSub();
        updateHkRankLoadMoreUI();
        setStatus("hkBoardStatus", list.length ? "" : "暂无港股数据");
        if (list.length) {
          requestAnimationFrame(() => {
            if (requestId !== loadHkRankKind._req) return;
            paintHkSparklines(list, requestId, { start: 0 }).catch(() => {});
            bindHkRankLoadMore();
          });
        }
      } catch (err) {
        if (requestId !== loadHkRankKind._req) return;
        hkRankState.list = [];
        hkRankState.trends = null;
        hkRankState.hasMore = false;
        if (listEl) listEl.innerHTML = "";
        updateHkRankLoadMoreUI();
        setStatus("hkBoardStatus", err?.message || "港股涨跌榜加载失败，请稍后重试");
      }
    }
