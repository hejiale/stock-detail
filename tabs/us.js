    function renderUsIndices(list) {
      const wrap = document.getElementById("usIndexGrid");
      if (!wrap) return;
      if (!list.length) {
        wrap.innerHTML = '<div class="board-meta" style="padding:8px">暂无指数数据</div>';
        return;
      }
      wrap.innerHTML = list
        .map((item, i) => {
          const tone = toneClass(item.change);
          return `
            <div class="us-index-card" data-us-index="${i}">
              <div class="idx-head">
                <div class="idx-name">${item.name}</div>
                <div class="idx-chg ${tone}">${formatPct(item.change)}${chgArrowHtml(item.change)}</div>
              </div>
              <div class="idx-price">${item.price == null ? "--" : formatPrice(item.price)}</div>
              <canvas class="idx-chart" data-us-spark="${i}" aria-hidden="true"></canvas>
            </div>`;
        })
        .join("");
    }

    async function paintUsIndexSparklines(list) {
      const results = await Promise.allSettled(
        list.map((item) =>
          loadIntradayTrends({ code: item.code, market: item.market, name: item.name })
        )
      );
      const trends = results.map((result) =>
        result.status === "fulfilled" ? result.value : null
      );
      openUsBoardModal._trends = trends;
      trends.forEach((trend, i) => {
        if (!trend) return;
        const canvas = document.querySelector(`[data-us-spark="${i}"]`);
        if (!canvas) return;
        drawSparkline(canvas, trend.points, trend.preClose);
      });
    }

    function redrawUsIndexSparklines() {
      const trends = openUsBoardModal._trends;
      if (!trends?.length) return;
      trends.forEach((trend, i) => {
        if (!trend) return;
        const canvas = document.querySelector(`[data-us-spark="${i}"]`);
        if (!canvas) return;
        drawSparkline(canvas, trend.points, trend.preClose);
      });
    }

    async function openUsBoardModal() {
      showModal("usBoardModal");
      setStatus("usBoardStatus", "加载中…");
      document.getElementById("usIndexGrid").innerHTML = "";
      renderMarketBreadth("usMarketBreadth", null);

      const requestId = (openUsBoardModal._req = (openUsBoardModal._req || 0) + 1);

      try {
        const [indicesResult, breadthResult] = await Promise.allSettled([
          loadUsIndices(),
          loadUsMarketBreadth()
        ]);
        if (requestId !== openUsBoardModal._req) return;

        const indices =
          indicesResult.status === "fulfilled" ? indicesResult.value : [];
        if (indicesResult.status === "rejected" && !indices.length) {
          throw indicesResult.reason || new Error("美股数据加载失败");
        }

        openUsBoardModal._indices = indices;
        renderUsIndices(indices);
        if (breadthResult.status === "fulfilled") {
          renderMarketBreadth("usMarketBreadth", breadthResult.value);
        }
        setStatus("usBoardStatus", indices.length ? "" : "暂无指数数据");
        requestAnimationFrame(() => {
          if (requestId !== openUsBoardModal._req) return;
          paintUsIndexSparklines(indices).catch(() => {});
        });
      } catch (err) {
        if (requestId !== openUsBoardModal._req) return;
        setStatus("usBoardStatus", err?.message || "美股数据加载失败，请稍后重试");
      }
    }

    function closeUsBoardModal() {
      openUsBoardModal._req = (openUsBoardModal._req || 0) + 1;
      hideModal("usBoardModal");
      setStatus("usBoardStatus", "");
      renderMarketBreadth("usMarketBreadth", null);
    }

    const usRankState = {
      kind: "gainers",
      list: [],
      page: 0,
      total: 0,
      hasMore: true,
      loadingMore: false,
      trends: null
    };

    function buildUsPanelElement(isActive) {
      const panel = document.createElement("section");
      panel.className = "panel" + (isActive ? " active" : "");
      panel.dataset.panel = "usSemi";
      const kind = usRankState.kind || "gainers";
      const loaded = usRankState.list?.length || 0;
      panel.innerHTML = `
          <div class="fund-card kr-rank-card us-rank-card">
            <div class="fund-meta">
              <div class="fund-meta-text">
                <div class="name">美股涨跌榜</div>
                <div class="sub" id="usRankSub">${usRankSubText(kind, loaded)}</div>
              </div>
              <div class="fund-meta-actions">
                <button class="btn-board" type="button" data-open-board="us" title="查看美股市场概况" aria-label="板块">
                  <img src="assets/bankuai.png" alt="板块" />
                </button>
                <button class="btn-sync" type="button" data-us-refresh title="刷新涨跌榜" aria-label="刷新涨跌榜">
                  <img src="assets/pull.png" alt="刷新" />
                </button>
              </div>
            </div>
            <div class="add-stock">
              <div class="add-stock-field">
                <input
                  type="text"
                  class="add-stock-input"
                  data-add-code="usSemi"
                  placeholder="输入美股代码，如 NVDA"
                  autocomplete="off"
                  spellcheck="false"
                />
                <button class="btn btn-add" type="button" data-add-stock="usSemi" aria-label="添加股票" title="添加">
                  <img src="assets/add_zixuan.png" alt="添加" />
                </button>
              </div>
            </div>
            <div class="board-tabs kr-rank-tabs">
              <button class="board-tab${kind === "gainers" ? " active" : ""}" type="button" data-us-rank="gainers">涨幅前100</button>
              <button class="board-tab${kind === "losers" ? " active" : ""}" type="button" data-us-rank="losers">跌幅前100</button>
            </div>
            <div class="board-list-head us-stock-head kr-stock-head">
              <div>股票</div>
              <div style="text-align:center">走势</div>
              <div style="text-align:center">最新价</div>
              <div style="text-align:center">涨跌幅%</div>
            </div>
            <div class="kr-rank-body">
              <div class="us-stock-list kr-stock-list" id="usStockList"></div>
              <div class="rank-load-more" data-rank-more="usSemi" hidden></div>
              <div class="board-status show" id="usRankStatus">加载中…</div>
            </div>
          </div>`;
      return panel;
    }

    function usRankSubText(kind, loaded) {
      const tip = kind === "losers" ? "跌幅" : "涨幅";
      return loaded
        ? `美股 · ${tip}榜已加载 ${loaded} 只`
        : "美股 · 加载中…";
    }

    function updateUsRankSub() {
      const subEl = document.getElementById("usRankSub");
      if (!subEl) return;
      subEl.textContent = usRankSubText(
        usRankState.kind || "gainers",
        usRankState.list?.length || 0
      );
    }

    function updateUsRankLoadMoreUI() {
      const host = document.querySelector(`[data-rank-more="usSemi"]`);
      const html = buildRankLoadMoreHtml("usSemi", {
        hasMore: usRankState.hasMore !== false,
        loading: !!usRankState.loadingMore,
        loaded: usRankState.list?.length || 0
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

    function renderUsStockRankRows(list, start = 0) {
      return list
        .map((item, offset) => {
          const i = start + offset;
          const tone = toneClass(item.change);
          const priceText =
            item.price == null ? "--" : "$" + formatPrice(item.price);
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
                      data-chart-fund="usSemi"
                      data-chart-index="${i}"
                      title="查看 ${safeName} 行情与个股资料"
                    >${item.name}</div>
                    <button
                      class="btn-add-watch"
                      type="button"
                      data-add-watch="usSemi"
                      data-watch-code="${item.code}"
                      data-watch-name="${safeName}"
                      data-watch-type="2"
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
                data-chart-fund="usSemi"
                data-chart-index="${i}"
                title="查看 ${safeName} 行情与个股资料"
              >
                <canvas class="kr-spark" data-us-rank-spark="${i}" aria-hidden="true"></canvas>
              </div>
              <div class="board-price ${tone}">${priceText}</div>
              <div class="board-chg ${tone}">${formatPct(item.change)}${chgArrowHtml(item.change)}</div>
            </div>`;
        })
        .join("");
    }

    function renderUsStockRank(list, { append = false, start = 0 } = {}) {
      const wrap = document.getElementById("usStockList");
      if (!wrap) return;
      if (!append) {
        wrap.innerHTML = list.length ? renderUsStockRankRows(list, 0) : "";
        return;
      }
      if (!list.length) return;
      wrap.insertAdjacentHTML("beforeend", renderUsStockRankRows(list, start));
    }

    function getUsRankHolding(index) {
      const item = usRankState.list?.[index];
      if (!item) return null;
      return {
        name: item.name,
        code: item.code,
        market: item.market != null ? item.market : 105
      };
    }

    async function paintUsSparklines(list, requestId, { start = 0 } = {}) {
      const results = await Promise.allSettled(
        list.map((item) =>
          loadIntradayTrends({
            code: item.code,
            market: item.market != null ? item.market : 105,
            name: item.name
          })
        )
      );
      if (requestId != null && requestId !== loadUsRankKind._req) return;

      const trends = results.map((result) =>
        result.status === "fulfilled" ? result.value : null
      );
      if (!Array.isArray(usRankState.trends) || start === 0) {
        usRankState.trends = [];
      }
      while (usRankState.trends.length < start) usRankState.trends.push(null);
      trends.forEach((trend, i) => {
        usRankState.trends[start + i] = trend;
      });
      redrawUsSparklines();
    }

    function redrawUsSparklines() {
      const trends = usRankState.trends;
      if (!trends?.length) return;
      trends.forEach((trend, i) => {
        const canvas = document.querySelector(`[data-us-rank-spark="${i}"]`);
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

    function bindUsRankLoadMore() {
      bindRankLoadMore("usSemi", () => {
        loadUsRankKind(usRankState.kind || "gainers", { append: true }).catch(
          () => {}
        );
      });
    }

    async function loadUsRankKind(kind, { force = false, append = false } = {}) {
      const next = kind === "losers" ? "losers" : "gainers";
      if (!force && !append && usRankState.kind === next && usRankState.list?.length) {
        document.querySelectorAll("[data-us-rank]").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.usRank === next);
        });
        renderUsStockRank(usRankState.list);
        updateUsRankSub();
        updateUsRankLoadMoreUI();
        setStatus("usRankStatus", "");
        requestAnimationFrame(() => {
          redrawUsSparklines();
          bindUsRankLoadMore();
        });
        return;
      }

      if (append) {
        if (usRankState.loadingMore || usRankState.hasMore === false) return;
        if (usRankState.kind !== next) return;
        usRankState.loadingMore = true;
        updateUsRankLoadMoreUI();
        const requestId = loadUsRankKind._req;
        const nextPage = (usRankState.page || 1) + 1;
        try {
          const result = await loadUsStockRank(next, RANK_PAGE_SIZE, nextPage);
          if (requestId !== loadUsRankKind._req) return;
          const list = result.list || [];
          const start = usRankState.list?.length || 0;
          usRankState.list = mergeRankList(usRankState.list, list);
          const added = (usRankState.list?.length || 0) - start;
          usRankState.page = nextPage;
          usRankState.total = result.total || usRankState.total || 0;
          usRankState.hasMore =
            added > 0 &&
            computeRankHasMore(
              usRankState.list.length,
              list.length,
              usRankState.total
            );
          renderUsStockRank(usRankState.list.slice(start), { append: true, start });
          updateUsRankSub();
          setStatus("usRankStatus", "");
          if (list.length) {
            await paintUsSparklines(usRankState.list.slice(start), requestId, {
              start
            });
          }
        } catch (err) {
          if (requestId === loadUsRankKind._req) {
            showToast(err?.message || "加载更多失败");
          }
        } finally {
          if (requestId === loadUsRankKind._req) {
            usRankState.loadingMore = false;
            updateUsRankLoadMoreUI();
            bindUsRankLoadMore();
          }
        }
        return;
      }

      usRankState.kind = next;
      usRankState.list = [];
      usRankState.trends = null;
      usRankState.page = 0;
      usRankState.hasMore = true;
      usRankState.loadingMore = false;
      document.querySelectorAll("[data-us-rank]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.usRank === next);
      });

      const requestId = (loadUsRankKind._req = (loadUsRankKind._req || 0) + 1);
      const listEl = document.getElementById("usStockList");
      if (listEl) listEl.innerHTML = "";
      setStatus(
        "usRankStatus",
        next === "losers" ? "加载跌幅榜…" : "加载涨幅榜…"
      );
      updateUsRankSub();
      updateUsRankLoadMoreUI();

      try {
        const result = await loadUsStockRank(next, RANK_PAGE_SIZE, 1);
        if (requestId !== loadUsRankKind._req) return;
        const list = result.list || [];
        usRankState.list = list;
        usRankState.page = 1;
        usRankState.total = result.total || 0;
        usRankState.hasMore = computeRankHasMore(
          list.length,
          list.length,
          usRankState.total
        );
        renderUsStockRank(list);
        updateUsRankSub();
        updateUsRankLoadMoreUI();
        setStatus("usRankStatus", list.length ? "" : "暂无美股数据");
        if (list.length) {
          requestAnimationFrame(() => {
            if (requestId !== loadUsRankKind._req) return;
            paintUsSparklines(list, requestId, { start: 0 }).catch(() => {});
            bindUsRankLoadMore();
          });
        }
      } catch (err) {
        if (requestId !== loadUsRankKind._req) return;
        usRankState.list = [];
        usRankState.trends = null;
        usRankState.hasMore = false;
        if (listEl) listEl.innerHTML = "";
        updateUsRankLoadMoreUI();
        setStatus("usRankStatus", err?.message || "美股涨跌榜加载失败，请稍后重试");
      }
    }

