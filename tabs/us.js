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

    function renderUsSectorList(list) {
      const wrap = document.getElementById("usSectorList");
      if (!wrap) return;
      if (!list.length) {
        wrap.innerHTML = "";
        return;
      }

      wrap.innerHTML = list
        .map((item) => {
          const safeName = String(item.name || "").replace(/"/g, "&quot;");
          const up = item.upCount || 0;
          const down = item.downCount || 0;
          const tone = item.change == null ? "flat" : toneClass(item.change);
          const chgText =
            item.change == null ? "--" : formatPct(item.change);
          const arrow =
            item.change == null ? "" : chgArrowHtml(item.change);
          return `
            <button
              class="board-row board-row-btn region-row us-sector-row"
              type="button"
              data-us-sector="${item.code}"
              data-us-sector-name="${safeName}"
              title="查看 ${safeName} 人气与涨跌榜"
            >
              <div class="board-info">
                <div class="board-name-row">
                  <span class="board-name">${item.name}</span>
                </div>
              </div>
              <div class="region-up">${up}</div>
              <div class="region-down">${down}</div>
              <div class="board-chg ${tone}">${chgText}${arrow}</div>
            </button>`;
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
      document.getElementById("usSectorList").innerHTML = "";
      renderMarketBreadth("usMarketBreadth", null);

      const requestId = (openUsBoardModal._req = (openUsBoardModal._req || 0) + 1);

      try {
        const [indicesResult, breadthResult, sectorsResult] =
          await Promise.allSettled([
            loadUsIndices(),
            loadUsMarketBreadth(),
            loadUsFamousSectorStats()
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
        const sectors =
          sectorsResult.status === "fulfilled" ? sectorsResult.value : [];
        renderUsSectorList(sectors);
        setStatus(
          "usBoardStatus",
          indices.length || sectors.length ? "" : "暂无指数数据"
        );
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
      if (document.getElementById("usBoardStocksModal")?.classList.contains("show")) {
        closeUsBoardStocksModal();
      }
      hideModal("usBoardModal");
      setStatus("usBoardStatus", "");
      renderMarketBreadth("usMarketBreadth", null);
    }

    let usBoardStocksRequestId = 0;
    const usBoardStocksState = {
      code: "",
      name: "",
      rank: "hot"
    };

    function setUsBoardStocksRankTabs(kind) {
      document.querySelectorAll("[data-us-sector-rank]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.usSectorRank === kind);
      });
    }

    function renderUsBoardStocksList(list) {
      const wrap = document.getElementById("usBoardStocksList");
      if (!wrap) return;
      if (!list.length) {
        wrap.innerHTML = "";
        return;
      }

      wrap.innerHTML = list
        .map((item, i) => {
          const chg = item.change;
          const tone = chg == null ? "flat" : toneClass(chg);
          const arrow = chg == null ? "" : chgArrowHtml(chg);
          const chgText = chg == null ? "--" : formatPct(chg);
          const safeName = String(item.name || item.code || "").replace(
            /"/g,
            "&quot;"
          );
          const meta =
            item.hotRank != null
              ? `人气第${item.hotRank} · ${codeWithCopyHtml(item.code, item.name)}`
              : `${i + 1} · ${codeWithCopyHtml(item.code, item.name)}`;
          const priceText =
            item.price == null ? "--" : "$" + formatPrice(item.price);
          return `
            <div class="board-row board-stock-row">
              <div class="board-info">
                <div class="board-name-row">
                  <div
                    class="board-name"
                    role="button"
                    tabindex="0"
                    data-chart-fund="usBoardStocks"
                    data-chart-index="${i}"
                    title="查看 ${safeName} 行情与个股资料"
                  >${item.name}</div>
                </div>
                <div class="board-meta">${meta}</div>
              </div>
              <div class="board-price">${priceText}</div>
              <div class="board-chg ${tone}">${chgText}${arrow}</div>
            </div>`;
        })
        .join("");
    }

    async function loadUsBoardStocksRank(kind) {
      if (!usBoardStocksState.code) return;
      const rank =
        kind === "losers" ? "losers" : kind === "gainers" ? "gainers" : "hot";
      usBoardStocksState.rank = rank;
      setUsBoardStocksRankTabs(rank);

      const reqId = ++usBoardStocksRequestId;
      const rankLabel =
        rank === "losers" ? "跌幅" : rank === "gainers" ? "涨幅" : "人气";
      document.getElementById("usBoardStocksModalSub").textContent =
        `${usBoardStocksState.name} · 加载${rankLabel}榜…`;
      document.getElementById("usBoardStocksList").innerHTML = "";
      setStatus(
        "usBoardStocksStatus",
        rank === "losers"
          ? "加载跌幅榜…"
          : rank === "gainers"
            ? "加载涨幅榜…"
            : "加载人气榜…"
      );

      try {
        const list = await loadUsSectorStocks(usBoardStocksState.code, rank, 20);
        if (reqId !== usBoardStocksRequestId) return;
        document.getElementById("usBoardStocksModalSub").textContent =
          `${usBoardStocksState.name} · ${rankLabel}前 ${list.length} 只`;
        renderUsBoardStocksList(list);
        setStatus(
          "usBoardStocksStatus",
          list.length ? "" : `暂无${rankLabel}数据`
        );
      } catch (err) {
        if (reqId !== usBoardStocksRequestId) return;
        document.getElementById("usBoardStocksModalSub").textContent = "加载失败";
        setStatus("usBoardStocksStatus", err?.message || "榜单加载失败");
      }
    }

    async function openUsBoardStocksModal(sectorCode, sectorName) {
      const code = String(sectorCode || "").trim();
      if (!code) return;

      usBoardStocksState.code = code;
      usBoardStocksState.name = sectorName || code;
      usBoardStocksState.rank = "hot";

      document.getElementById("usBoardStocksModalName").textContent =
        usBoardStocksState.name;
      showModal("usBoardStocksModal");
      await loadUsBoardStocksRank("hot");
    }

    function closeUsBoardStocksModal() {
      usBoardStocksRequestId += 1;
      hideModal("usBoardStocksModal");
      setStatus("usBoardStocksStatus", "");
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
                  placeholder="输入代码或名称查询，如 NVDA、英伟达"
                  autocomplete="off"
                  spellcheck="false"
                />
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
                  </div>
                  <div class="board-meta">${codeWithCopyHtml(item.code, item.name)}</div>
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

    function getUsBoardStocksHolding(index) {
      const wrap = document.getElementById("usBoardStocksList");
      if (!wrap) return null;
      const rows = wrap.querySelectorAll(".board-stock-row");
      const row = rows[index];
      if (!row) return null;
      const nameEl = row.querySelector(".board-name");
      const metaEl = row.querySelector(".board-meta");
      const name = nameEl?.textContent?.trim() || "";
      const codeMatch = metaEl?.textContent?.match(/([A-Z]{1,5})/);
      const code = codeMatch?.[1] || "";
      if (!name && !code) return null;
      return { name, code, market: 105 };
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

