    function renderJpIndices(list) {
      const wrap = document.getElementById("jpIndexGrid");
      if (!wrap) return;
      if (!list.length) {
        wrap.innerHTML = '<div class="board-meta" style="padding:8px">暂无指数数据</div>';
        return;
      }
      wrap.innerHTML = list
        .map((item, i) => {
          const tone = toneClass(item.change);
          return `
            <div class="us-index-card" data-jp-index="${i}">
              <div class="idx-head">
                <div class="idx-name">${item.name}</div>
                <div class="idx-chg ${tone}">${formatPct(item.change)}${chgArrowHtml(item.change)}</div>
              </div>
              <div class="idx-price">${item.price == null ? "--" : formatPrice(item.price)}</div>
              <canvas class="idx-chart" data-jp-idx-spark="${i}" aria-hidden="true"></canvas>
            </div>`;
        })
        .join("");
    }

    async function paintJpIndexSparklines(list) {
      const results = await Promise.allSettled(
        list.map((item) =>
          loadIntradayTrends({ code: item.code, market: item.market, name: item.name })
        )
      );
      const trends = results.map((result) =>
        result.status === "fulfilled" ? result.value : null
      );
      openJpBoardModal._trends = trends;
      trends.forEach((trend, i) => {
        if (!trend) return;
        const canvas = document.querySelector(`[data-jp-idx-spark="${i}"]`);
        if (!canvas) return;
        drawSparkline(canvas, trend.points, trend.preClose);
      });
    }

    function redrawJpIndexSparklines() {
      const trends = openJpBoardModal._trends;
      if (!trends?.length) return;
      trends.forEach((trend, i) => {
        if (!trend) return;
        const canvas = document.querySelector(`[data-jp-idx-spark="${i}"]`);
        if (!canvas) return;
        drawSparkline(canvas, trend.points, trend.preClose);
      });
    }

    async function openJpBoardModal() {
      showModal("jpBoardModal");
      setStatus("jpBoardModalStatus", "加载中…");
      document.getElementById("jpIndexGrid").innerHTML = "";
      renderMarketBreadth("jpMarketBreadth", null);

      const requestId = (openJpBoardModal._req = (openJpBoardModal._req || 0) + 1);

      try {
        const [indicesResult, breadthResult] = await Promise.allSettled([
          loadJpIndices(),
          loadJpMarketBreadth()
        ]);
        if (requestId !== openJpBoardModal._req) return;

        const indices =
          indicesResult.status === "fulfilled" ? indicesResult.value : [];
        if (indicesResult.status === "rejected" && !indices.length) {
          throw indicesResult.reason || new Error("日股数据加载失败");
        }

        openJpBoardModal._indices = indices;
        renderJpIndices(indices);
        if (breadthResult.status === "fulfilled") {
          renderMarketBreadth("jpMarketBreadth", breadthResult.value);
        }
        setStatus("jpBoardModalStatus", indices.length ? "" : "暂无指数数据");
        requestAnimationFrame(() => {
          if (requestId !== openJpBoardModal._req) return;
          paintJpIndexSparklines(indices).catch(() => {});
        });
      } catch (err) {
        if (requestId !== openJpBoardModal._req) return;
        setStatus(
          "jpBoardModalStatus",
          err?.message || "日股数据加载失败，请稍后重试"
        );
      }
    }

    function closeJpBoardModal() {
      openJpBoardModal._req = (openJpBoardModal._req || 0) + 1;
      hideModal("jpBoardModal");
      setStatus("jpBoardModalStatus", "");
      renderMarketBreadth("jpMarketBreadth", null);
    }

    const jpRankState = {
      kind: "gainers",
      list: [],
      page: 0,
      total: 0,
      hasMore: true,
      loadingMore: false,
      trends: null
    };

    function buildJpPanelElement(isActive) {
      const panel = document.createElement("section");
      panel.className = "panel" + (isActive ? " active" : "");
      panel.dataset.panel = "jpStocks";
      const kind = jpRankState.kind || "gainers";
      const loaded = jpRankState.list?.length || 0;
      panel.innerHTML = `
          <div class="fund-card kr-rank-card">
            <div class="fund-meta">
              <div class="fund-meta-text">
                <div class="name">日股涨跌榜</div>
                <div class="sub" id="jpRankSub">${jpRankSubText(kind, loaded)}</div>
              </div>
              <div class="fund-meta-actions">
                <button class="btn-board" type="button" data-open-board="jp" title="查看日股市场概况" aria-label="板块">
                  <img src="assets/bankuai.png" alt="板块" />
                </button>
                <button class="btn-sync" type="button" data-jp-refresh title="刷新涨跌榜" aria-label="刷新涨跌榜">
                  <img src="assets/pull.png" alt="刷新" />
                </button>
              </div>
            </div>
            <div class="add-stock">
              <div class="add-stock-field">
                <input
                  type="text"
                  class="add-stock-input"
                  data-add-code="jpStocks"
                  placeholder="日股代码，如 7203、6758"
                  autocomplete="off"
                  spellcheck="false"
                />
                <button class="btn btn-add" type="button" data-add-stock="jpStocks" aria-label="添加股票" title="添加">
                  <img src="assets/add_zixuan.png" alt="添加" />
                </button>
              </div>
            </div>
            <div class="board-tabs kr-rank-tabs">
              <button class="board-tab${kind === "gainers" ? " active" : ""}" type="button" data-jp-rank="gainers">涨幅前100</button>
              <button class="board-tab${kind === "losers" ? " active" : ""}" type="button" data-jp-rank="losers">跌幅前100</button>
            </div>
            <div class="board-list-head us-stock-head kr-stock-head">
              <div>股票</div>
              <div style="text-align:center">走势</div>
              <div style="text-align:center">最新价</div>
              <div style="text-align:center">涨跌幅%</div>
            </div>
            <div class="kr-rank-body">
              <div class="us-stock-list kr-stock-list" id="jpStockList"></div>
              <div class="rank-load-more" data-rank-more="jpStocks" hidden></div>
              <div class="board-status show" id="jpBoardStatus">加载中…</div>
            </div>
          </div>`;
      return panel;
    }

    function jpRankSubText(kind, loaded) {
      const tip = kind === "losers" ? "跌幅" : "涨幅";
      return loaded
        ? `日经225 / 东证 · ${tip}榜已加载 ${loaded} 只`
        : "日经225 / 东证 · 加载中…";
    }

    function updateJpRankSub() {
      const subEl = document.getElementById("jpRankSub");
      if (!subEl) return;
      subEl.textContent = jpRankSubText(
        jpRankState.kind || "gainers",
        jpRankState.list?.length || 0
      );
    }

    function updateJpRankLoadMoreUI() {
      const host = document.querySelector(`[data-rank-more="jpStocks"]`);
      const html = buildRankLoadMoreHtml("jpStocks", {
        hasMore: jpRankState.hasMore !== false,
        loading: !!jpRankState.loadingMore,
        loaded: jpRankState.list?.length || 0
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

    function renderJpStockRankRows(list, start = 0) {
      return list
        .map((item, offset) => {
          const i = start + offset;
          const tone = toneClass(item.change);
          const priceText =
            item.price == null ? "--" : "¥" + formatPrice(item.price);
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
                      data-chart-fund="jpStocks"
                      data-chart-index="${i}"
                      title="查看 ${safeName} 行情"
                    >${item.name}</div>
                    <button
                      class="btn-add-watch"
                      type="button"
                      data-add-watch="jpStocks"
                      data-watch-code="${item.code}"
                      data-watch-name="${safeName}"
                      data-watch-type="5"
                      title="加入自选"
                      aria-label="加入自选 ${safeName}"
                    ><img src="assets/add_zixuan.png" alt="自选" /></button>
                  </div>
                  <div class="board-meta">${codeWithCopyHtml(item.code, item.name)}</div>
                </div>
              </div>
              <div
                class="kr-spark-wrap"
                role="button"
                tabindex="0"
                data-chart-fund="jpStocks"
                data-chart-index="${i}"
                title="查看 ${safeName} 行情"
              >
                <canvas class="kr-spark" data-jp-spark="${i}" aria-hidden="true"></canvas>
              </div>
              <div class="board-price ${tone}">${priceText}</div>
              <div class="board-chg ${tone}">${formatPct(item.change)}${chgArrowHtml(item.change)}</div>
            </div>`;
        })
        .join("");
    }

    function renderJpStockRank(list, { append = false, start = 0 } = {}) {
      const wrap = document.getElementById("jpStockList");
      if (!wrap) return;
      if (!append) {
        wrap.innerHTML = list.length ? renderJpStockRankRows(list, 0) : "";
        return;
      }
      if (!list.length) return;
      wrap.insertAdjacentHTML("beforeend", renderJpStockRankRows(list, start));
    }

    function getJpRankHolding(index) {
      const item = jpRankState.list?.[index];
      if (!item) return null;
      return {
        name: item.name,
        code: item.code,
        market: item.market != null ? item.market : 176
      };
    }

    async function paintJpSparklines(list, requestId, { start = 0 } = {}) {
      const results = await Promise.allSettled(
        list.map((item) =>
          loadIntradayTrends({
            code: item.code,
            market: item.market != null ? item.market : 176,
            name: item.name
          })
        )
      );
      if (requestId != null && requestId !== loadJpRankKind._req) return;

      const trends = results.map((result) =>
        result.status === "fulfilled" ? result.value : null
      );
      if (!Array.isArray(jpRankState.trends) || start === 0) {
        jpRankState.trends = [];
      }
      while (jpRankState.trends.length < start) jpRankState.trends.push(null);
      trends.forEach((trend, i) => {
        jpRankState.trends[start + i] = trend;
      });
      redrawJpSparklines();
    }

    function redrawJpSparklines() {
      const trends = jpRankState.trends;
      if (!trends?.length) return;
      trends.forEach((trend, i) => {
        const canvas = document.querySelector(`[data-jp-spark="${i}"]`);
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

    function bindJpRankLoadMore() {
      bindRankLoadMore("jpStocks", () => {
        loadJpRankKind(jpRankState.kind || "gainers", { append: true }).catch(
          () => {}
        );
      });
    }

    async function loadJpRankKind(kind, { force = false, append = false } = {}) {
      const next = kind === "losers" ? "losers" : "gainers";
      if (!force && !append && jpRankState.kind === next && jpRankState.list?.length) {
        document.querySelectorAll("[data-jp-rank]").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.jpRank === next);
        });
        renderJpStockRank(jpRankState.list);
        updateJpRankSub();
        updateJpRankLoadMoreUI();
        setStatus("jpBoardStatus", "");
        requestAnimationFrame(() => {
          redrawJpSparklines();
          bindJpRankLoadMore();
        });
        return;
      }

      if (append) {
        if (jpRankState.loadingMore || jpRankState.hasMore === false) return;
        if (jpRankState.kind !== next) return;
        jpRankState.loadingMore = true;
        updateJpRankLoadMoreUI();
        const requestId = loadJpRankKind._req;
        const nextPage = (jpRankState.page || 1) + 1;
        try {
          const result = await loadJpStockRank(next, RANK_PAGE_SIZE, nextPage);
          if (requestId !== loadJpRankKind._req) return;
          const list = result.list || [];
          const start = jpRankState.list?.length || 0;
          jpRankState.list = mergeRankList(jpRankState.list, list);
          const added = (jpRankState.list?.length || 0) - start;
          jpRankState.page = nextPage;
          jpRankState.total = result.total || jpRankState.total || 0;
          jpRankState.hasMore =
            added > 0 &&
            computeRankHasMore(
              jpRankState.list.length,
              list.length,
              jpRankState.total
            );
          renderJpStockRank(jpRankState.list.slice(start), { append: true, start });
          updateJpRankSub();
          setStatus("jpBoardStatus", "");
          if (list.length) {
            await paintJpSparklines(jpRankState.list.slice(start), requestId, {
              start
            });
          }
        } catch (err) {
          if (requestId === loadJpRankKind._req) {
            showToast(err?.message || "加载更多失败");
          }
        } finally {
          if (requestId === loadJpRankKind._req) {
            jpRankState.loadingMore = false;
            updateJpRankLoadMoreUI();
            bindJpRankLoadMore();
          }
        }
        return;
      }

      jpRankState.kind = next;
      jpRankState.list = [];
      jpRankState.trends = null;
      jpRankState.page = 0;
      jpRankState.hasMore = true;
      jpRankState.loadingMore = false;
      document.querySelectorAll("[data-jp-rank]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.jpRank === next);
      });

      const requestId = (loadJpRankKind._req = (loadJpRankKind._req || 0) + 1);
      const listEl = document.getElementById("jpStockList");
      if (listEl) listEl.innerHTML = "";
      setStatus(
        "jpBoardStatus",
        next === "losers" ? "加载跌幅榜…" : "加载涨幅榜…"
      );
      updateJpRankSub();
      updateJpRankLoadMoreUI();

      try {
        const result = await loadJpStockRank(next, RANK_PAGE_SIZE, 1);
        if (requestId !== loadJpRankKind._req) return;
        const list = result.list || [];
        jpRankState.list = list;
        jpRankState.page = 1;
        jpRankState.total = result.total || 0;
        jpRankState.hasMore = computeRankHasMore(
          list.length,
          list.length,
          jpRankState.total
        );
        renderJpStockRank(list);
        updateJpRankSub();
        updateJpRankLoadMoreUI();
        setStatus("jpBoardStatus", list.length ? "" : "暂无日股数据");
        if (list.length) {
          requestAnimationFrame(() => {
            if (requestId !== loadJpRankKind._req) return;
            paintJpSparklines(list, requestId, { start: 0 }).catch(() => {});
            bindJpRankLoadMore();
          });
        }
      } catch (err) {
        if (requestId !== loadJpRankKind._req) return;
        jpRankState.list = [];
        jpRankState.trends = null;
        jpRankState.hasMore = false;
        if (listEl) listEl.innerHTML = "";
        updateJpRankLoadMoreUI();
        setStatus("jpBoardStatus", err?.message || "日股涨跌榜加载失败，请稍后重试");
      }
    }
