    function renderCnIndices(list) {
      const wrap = document.getElementById("cnIndexGrid");
      if (!wrap) return;
      if (!list.length) {
        wrap.innerHTML = '<div class="board-meta" style="padding:8px">暂无指数数据</div>';
        return;
      }

      wrap.innerHTML = list
        .map((item, i) => {
          const tone = toneClass(item.change);
          const breadth =
            item.upCount || item.downCount
              ? `<div class="idx-breadth"><span class="up">涨${item.upCount || 0}</span><span class="sep">/</span><span class="down">跌${item.downCount || 0}</span></div>`
              : "";
          return `
            <div class="cn-index-card" data-cn-index="${i}">
              <div class="idx-head">
                <div class="idx-name">${item.label || item.name}</div>
                <div class="idx-chg ${tone}">${formatPct(item.change)}${chgArrowHtml(item.change)}</div>
              </div>
              <div class="idx-price">${item.price == null ? "--" : formatPrice(item.price)}</div>
              ${breadth}
              <canvas class="idx-chart" data-cn-spark="${i}" aria-hidden="true"></canvas>
            </div>`;
        })
        .join("");
    }

    async function paintCnIndexSparklines(list) {
      const results = await Promise.allSettled(
        list.map((item) =>
          loadIntradayTrends({ code: item.code, market: item.market, name: item.name })
        )
      );
      const trends = results.map((result) =>
        result.status === "fulfilled" ? result.value : null
      );
      openBoardModal._trends = trends;
      trends.forEach((trend, i) => {
        if (!trend) return;
        const canvas = document.querySelector(`[data-cn-spark="${i}"]`);
        if (!canvas) return;
        drawSparkline(canvas, trend.points, trend.preClose);
      });
    }

    function redrawCnIndexSparklines() {
      const trends = openBoardModal._trends;
      if (!trends?.length) return;
      trends.forEach((trend, i) => {
        if (!trend) return;
        const canvas = document.querySelector(`[data-cn-spark="${i}"]`);
        if (!canvas) return;
        drawSparkline(canvas, trend.points, trend.preClose);
      });
    }

    function renderBoardList(list) {
      const wrap = document.getElementById("boardList");
      if (!wrap) return;

      if (!list.length) {
        wrap.innerHTML = "";
        return;
      }

      wrap.innerHTML = list
        .map((item, i) => {
          const tone = toneClass(item.change);
          const arrow = chgArrowHtml(item.change);
          const metaParts = [];
          if (item.childCount > 1) {
            metaParts.push(`含${item.childCount}个细分`);
          }
          if (item.upCount || item.downCount) {
            metaParts.push(`涨${item.upCount} / 跌${item.downCount}`);
          }
          if (item.leader) {
            const leaderChg =
              item.leaderChange == null ? "" : " " + formatPct(item.leaderChange);
            metaParts.push(`领涨 ${item.leader}${leaderChg}`);
          }
          const codes = (item.childCodes && item.childCodes.length
            ? item.childCodes
            : [item.code]
          ).join(",");
          const safeName = String(item.name).replace(/"/g, "&quot;");
          return `
            <button class="board-row board-row-btn" type="button" data-board-code="${item.code}" data-board-codes="${codes}" data-board-name="${safeName}" title="查看 ${safeName} 成分股涨跌榜">
              <div class="board-rank${i < 3 ? " top" : ""}">${i + 1}</div>
              <div class="board-info">
                <div class="board-name-row">
                  <span class="board-name">${item.name}</span>
                  <svg class="board-name-arrow" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M5.8 2.6 4.6 3.8 8.8 8l-4.2 4.2 1.2 1.2L11.2 8 5.8 2.6z"/>
                  </svg>
                </div>
                ${metaParts.length ? `<div class="board-meta">${metaParts.join(" · ")}</div>` : ""}
              </div>
              <div class="board-chg ${tone}">${formatPct(item.change)}${arrow}</div>
            </button>`;
        })
        .join("");
    }

    function renderBoardStocksList(list) {
      const wrap = document.getElementById("boardStocksList");
      if (!wrap) return;
      if (!list.length) {
        wrap.innerHTML = "";
        return;
      }

      wrap.innerHTML = list
        .map((item, i) => {
          const tone = toneClass(item.change);
          const arrow = chgArrowHtml(item.change);
          const safeName = String(item.name || item.code || "").replace(
            /"/g,
            "&quot;"
          );
          return `
            <div class="board-row board-stock-row">
              <div class="board-info">
                <div class="board-name-row">
                  <div class="board-name">${item.name}</div>
                  <button
                    class="btn-add-watch"
                    type="button"
                    data-add-watch="cnSemi"
                    data-watch-code="${item.code}"
                    data-watch-name="${safeName}"
                    data-watch-type="1"
                    title="加入自选"
                    aria-label="加入自选 ${safeName}"
                  ><img src="assets/add_zixuan.png" alt="自选" /></button>
                </div>
                <div class="board-meta">${i + 1} · ${item.code}</div>
              </div>
              <div class="board-price">${item.price == null ? "--" : formatPrice(item.price)}</div>
              <div class="board-chg ${tone}">${formatPct(item.change)}${arrow}</div>
            </div>`;
        })
        .join("");
    }

    let boardStocksRequestId = 0;
    const boardStocksState = {
      codes: [],
      allCodesCount: 0,
      name: "",
      rank: "gainers"
    };

    function setBoardStocksRankTabs(kind) {
      document.querySelectorAll("[data-cn-stock-rank]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.cnStockRank === kind);
      });
    }

    function boardStocksSubTip(phase, listLen) {
      const rankLabel = boardStocksState.rank === "losers" ? "跌幅" : "涨幅";
      const prefix =
        boardStocksState.allCodesCount > 1
          ? `含${boardStocksState.allCodesCount}个细分`
          : boardStocksState.codes[0] || "";
      if (phase === "loading") return `${prefix} · 加载${rankLabel}榜…`;
      if (phase === "done") return `${prefix} · ${rankLabel}前 ${listLen} 只`;
      return phase;
    }

    async function loadBoardStocksRank(kind) {
      if (!boardStocksState.codes.length) return;
      const rank = kind === "losers" ? "losers" : "gainers";
      boardStocksState.rank = rank;
      setBoardStocksRankTabs(rank);

      const reqId = ++boardStocksRequestId;
      document.getElementById("boardStocksModalSub").textContent =
        boardStocksSubTip("loading");
      document.getElementById("boardStocksList").innerHTML = "";
      setStatus(
        "boardStocksStatus",
        rank === "losers" ? "加载成分股跌幅…" : "加载成分股涨幅…"
      );

      try {
        const list = await loadCnSectorStocks(boardStocksState.codes, 20, rank);
        if (reqId !== boardStocksRequestId) return;
        document.getElementById("boardStocksModalSub").textContent =
          boardStocksSubTip("done", list.length);
        renderBoardStocksList(list);
        setStatus("boardStocksStatus", list.length ? "" : "暂无成分股数据");
      } catch (err) {
        if (reqId !== boardStocksRequestId) return;
        document.getElementById("boardStocksModalSub").textContent = "加载失败";
        setStatus("boardStocksStatus", err?.message || "成分股加载失败");
      }
    }

    async function openBoardStocksModal(boardCode, boardName, boardCodes) {
      const codes = (Array.isArray(boardCodes)
        ? boardCodes
        : String(boardCodes || boardCode || "").split(",")
      )
        .map((c) => String(c || "").trim())
        .filter(Boolean);
      // 子板块过多时取市值靠前的若干个，避免请求过多
      const fetchCodes = codes.slice(0, 10);
      if (!fetchCodes.length) return;

      boardStocksState.codes = fetchCodes;
      boardStocksState.allCodesCount = codes.length;
      boardStocksState.name = boardName || fetchCodes[0];
      boardStocksState.rank = "gainers";

      document.getElementById("boardStocksModalName").textContent =
        boardStocksState.name;
      showModal("boardStocksModal");
      await loadBoardStocksRank("gainers");
    }

    function closeBoardStocksModal() {
      boardStocksRequestId += 1;
      hideModal("boardStocksModal");
      setStatus("boardStocksStatus", "");
    }

    async function loadBoardList() {
      const requestId = (loadBoardList._req = (loadBoardList._req || 0) + 1);
      document.getElementById("boardModalSub").textContent = "加载市场指数与行业板块…";
      setStatus("boardStatus", "加载中…");
      document.getElementById("cnIndexGrid").innerHTML = "";
      document.getElementById("boardList").innerHTML = "";
      renderMarketBreadth("cnMarketBreadth", null);

      try {
        const [indicesResult, boardsResult] = await Promise.allSettled([
          loadCnIndices(),
          loadCnSectorBoards()
        ]);
        if (requestId !== loadBoardList._req) return;

        const indices =
          indicesResult.status === "fulfilled" ? indicesResult.value : [];
        const list =
          boardsResult.status === "fulfilled" ? boardsResult.value : [];

        openBoardModal._indices = indices;
        openBoardModal._list = list;
        renderCnIndices(indices);

        const sh = indices.find((x) => x.code === "000001");
        const sz = indices.find((x) => x.code === "399001");
        if (sh || sz) {
          renderMarketBreadth("cnMarketBreadth", {
            up: (sh?.upCount || 0) + (sz?.upCount || 0),
            down: (sh?.downCount || 0) + (sz?.downCount || 0),
            flat: (sh?.flatCount || 0) + (sz?.flatCount || 0),
            total:
              (sh?.upCount || 0) +
              (sh?.downCount || 0) +
              (sh?.flatCount || 0) +
              (sz?.upCount || 0) +
              (sz?.downCount || 0) +
              (sz?.flatCount || 0)
          });
        } else {
          renderMarketBreadth("cnMarketBreadth", null);
        }

        if (boardsResult.status === "rejected" && !indices.length) {
          throw boardsResult.reason || new Error("板块数据加载失败");
        }

        document.getElementById("boardModalSub").textContent =
          list.length
            ? `共 ${list.length} 个行业板块（相近已归类）· 按涨跌幅排序`
            : indices.length
              ? "行业板块加载失败"
              : "暂无数据";
        renderBoardList(list);
        setStatus(
          "boardStatus",
          list.length || indices.length
            ? ""
            : "暂无板块数据"
        );

        if (indices.length) {
          const sparkReq = requestId;
          requestAnimationFrame(() => {
            if (sparkReq !== loadBoardList._req) return;
            paintCnIndexSparklines(indices).catch(() => {});
          });
        }
      } catch (err) {
        if (requestId !== loadBoardList._req) return;
        document.getElementById("boardModalSub").textContent = "加载失败";
        setStatus("boardStatus", err?.message || "板块数据加载失败，请稍后重试");
      }
    }

    async function openBoardModal() {
      showModal("boardModal");
      await loadBoardList();
    }

    function closeBoardModal() {
      loadBoardList._req = (loadBoardList._req || 0) + 1;
      if (document.getElementById("boardStocksModal")?.classList.contains("show")) {
        closeBoardStocksModal();
      }
      hideModal("boardModal");
      setStatus("boardStatus", "");
      renderMarketBreadth("cnMarketBreadth", null);
    }

    const cnRankState = {
      kind: "gainers",
      list: [],
      page: 0,
      total: 0,
      hasMore: true,
      loadingMore: false,
      trends: null
    };

    function buildCnPanelElement(isActive) {
      const panel = document.createElement("section");
      panel.className = "panel" + (isActive ? " active" : "");
      panel.dataset.panel = "cnSemi";
      const kind = cnRankState.kind || "gainers";
      const loaded = cnRankState.list?.length || 0;
      panel.innerHTML = `
          <div class="fund-card kr-rank-card cn-rank-card">
            <div class="fund-meta">
              <div class="fund-meta-text">
                <div class="name">A股涨跌榜</div>
                <div class="sub" id="cnRankSub">${cnRankSubText(kind, loaded)}</div>
              </div>
              <div class="fund-meta-actions">
                <button class="btn-board" type="button" data-open-board="cn" title="查看A股板块涨幅" aria-label="板块">
                  <img src="assets/bankuai.png" alt="板块" />
                </button>
                <button class="btn-sync" type="button" data-cn-refresh title="刷新涨跌榜" aria-label="刷新涨跌榜">
                  <img src="assets/pull.png" alt="刷新" />
                </button>
              </div>
            </div>
            <div class="add-stock">
              <div class="add-stock-field">
                <input
                  type="text"
                  class="add-stock-input"
                  data-add-code="cnSemi"
                  placeholder="沪/深/北交所代码，如 600519、000001、920001"
                  autocomplete="off"
                  spellcheck="false"
                />
                <button class="btn btn-add" type="button" data-add-stock="cnSemi" aria-label="添加股票" title="添加">
                  <img src="assets/add_zixuan.png" alt="添加" />
                </button>
              </div>
            </div>
            <div class="board-tabs kr-rank-tabs">
              <button class="board-tab${kind === "gainers" ? " active" : ""}" type="button" data-cn-rank="gainers">涨幅前100</button>
              <button class="board-tab${kind === "losers" ? " active" : ""}" type="button" data-cn-rank="losers">跌幅前100</button>
            </div>
            <div class="board-list-head us-stock-head kr-stock-head">
              <div>股票</div>
              <div style="text-align:center">走势</div>
              <div style="text-align:right">涨跌幅%</div>
            </div>
            <div class="kr-rank-body">
              <div class="us-stock-list kr-stock-list" id="cnStockList"></div>
              <div class="rank-load-more" data-rank-more="cnSemi" hidden></div>
              <div class="board-status show" id="cnRankStatus">加载中…</div>
            </div>
          </div>`;
      return panel;
    }

    function cnRankSubText(kind, loaded) {
      const tip = kind === "losers" ? "跌幅" : "涨幅";
      return loaded
        ? `沪深京 A 股 · ${tip}榜已加载 ${loaded} 只`
        : "沪深京 A 股 · 加载中…";
    }

    function updateCnRankSub() {
      const subEl = document.getElementById("cnRankSub");
      if (!subEl) return;
      subEl.textContent = cnRankSubText(
        cnRankState.kind || "gainers",
        cnRankState.list?.length || 0
      );
    }

    function updateCnRankLoadMoreUI() {
      const host = document.querySelector(`[data-rank-more="cnSemi"]`);
      const html = buildRankLoadMoreHtml("cnSemi", {
        hasMore: cnRankState.hasMore !== false,
        loading: !!cnRankState.loadingMore,
        loaded: cnRankState.list?.length || 0
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

    function renderCnStockRankRows(list, start = 0) {
      return list
        .map((item, offset) => {
          const i = start + offset;
          const tone = toneClass(item.change);
          const priceTip =
            item.price == null ? "" : " · " + formatPrice(item.price);
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
                      data-chart-fund="cnSemi"
                      data-chart-index="${i}"
                      title="查看 ${safeName} 行情与个股资料"
                    >${item.name}</div>
                    <button
                      class="btn-add-watch"
                      type="button"
                      data-add-watch="cnSemi"
                      data-watch-code="${item.code}"
                      data-watch-name="${safeName}"
                      data-watch-type="1"
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
                data-chart-fund="cnSemi"
                data-chart-index="${i}"
                title="查看 ${safeName} 行情与个股资料"
              >
                <canvas class="kr-spark" data-cn-rank-spark="${i}" aria-hidden="true"></canvas>
              </div>
              <div class="board-chg ${tone}">${formatPct(item.change)}${chgArrowHtml(item.change)}</div>
            </div>`;
        })
        .join("");
    }

    function renderCnStockRank(list, { append = false, start = 0 } = {}) {
      const wrap = document.getElementById("cnStockList");
      if (!wrap) return;
      if (!append) {
        wrap.innerHTML = list.length ? renderCnStockRankRows(list, 0) : "";
        return;
      }
      if (!list.length) return;
      wrap.insertAdjacentHTML("beforeend", renderCnStockRankRows(list, start));
    }

    function getCnRankHolding(index) {
      const item = cnRankState.list?.[index];
      if (!item) return null;
      return {
        name: item.name,
        code: item.code,
        market: item.market != null ? item.market : 1
      };
    }

    async function paintCnSparklines(list, requestId, { start = 0 } = {}) {
      const results = await Promise.allSettled(
        list.map((item) =>
          loadIntradayTrends({
            code: item.code,
            market: item.market != null ? item.market : 1,
            name: item.name
          })
        )
      );
      if (requestId != null && requestId !== loadCnRankKind._req) return;

      const trends = results.map((result) =>
        result.status === "fulfilled" ? result.value : null
      );
      if (!Array.isArray(cnRankState.trends) || start === 0) {
        cnRankState.trends = [];
      }
      while (cnRankState.trends.length < start) cnRankState.trends.push(null);
      trends.forEach((trend, i) => {
        cnRankState.trends[start + i] = trend;
      });
      redrawCnSparklines();
    }

    function redrawCnSparklines() {
      const trends = cnRankState.trends;
      if (!trends?.length) return;
      trends.forEach((trend, i) => {
        const canvas = document.querySelector(`[data-cn-rank-spark="${i}"]`);
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

    function bindCnRankLoadMore() {
      bindRankLoadMore("cnSemi", () => {
        loadCnRankKind(cnRankState.kind || "gainers", { append: true }).catch(
          () => {}
        );
      });
    }

    async function loadCnRankKind(kind, { force = false, append = false } = {}) {
      const next = kind === "losers" ? "losers" : "gainers";
      if (!force && !append && cnRankState.kind === next && cnRankState.list?.length) {
        document.querySelectorAll("[data-cn-rank]").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.cnRank === next);
        });
        renderCnStockRank(cnRankState.list);
        updateCnRankSub();
        updateCnRankLoadMoreUI();
        setStatus("cnRankStatus", "");
        requestAnimationFrame(() => {
          redrawCnSparklines();
          bindCnRankLoadMore();
        });
        return;
      }

      if (append) {
        if (cnRankState.loadingMore || cnRankState.hasMore === false) return;
        if (cnRankState.kind !== next) return;
        cnRankState.loadingMore = true;
        updateCnRankLoadMoreUI();
        const requestId = loadCnRankKind._req;
        const nextPage = (cnRankState.page || 1) + 1;
        try {
          const result = await loadCnStockRank(next, RANK_PAGE_SIZE, nextPage);
          if (requestId !== loadCnRankKind._req) return;
          const list = result.list || [];
          const start = cnRankState.list?.length || 0;
          cnRankState.list = mergeRankList(cnRankState.list, list);
          const added = (cnRankState.list?.length || 0) - start;
          cnRankState.page = nextPage;
          cnRankState.total = result.total || cnRankState.total || 0;
          cnRankState.hasMore =
            added > 0 &&
            computeRankHasMore(
              cnRankState.list.length,
              list.length,
              cnRankState.total
            );
          renderCnStockRank(cnRankState.list.slice(start), { append: true, start });
          updateCnRankSub();
          setStatus("cnRankStatus", "");
          if (list.length) {
            await paintCnSparklines(cnRankState.list.slice(start), requestId, {
              start
            });
          }
        } catch (err) {
          if (requestId === loadCnRankKind._req) {
            showToast(err?.message || "加载更多失败");
          }
        } finally {
          if (requestId === loadCnRankKind._req) {
            cnRankState.loadingMore = false;
            updateCnRankLoadMoreUI();
            bindCnRankLoadMore();
          }
        }
        return;
      }

      cnRankState.kind = next;
      cnRankState.list = [];
      cnRankState.trends = null;
      cnRankState.page = 0;
      cnRankState.hasMore = true;
      cnRankState.loadingMore = false;
      document.querySelectorAll("[data-cn-rank]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.cnRank === next);
      });

      const requestId = (loadCnRankKind._req = (loadCnRankKind._req || 0) + 1);
      const listEl = document.getElementById("cnStockList");
      if (listEl) listEl.innerHTML = "";
      setStatus(
        "cnRankStatus",
        next === "losers" ? "加载跌幅榜…" : "加载涨幅榜…"
      );
      updateCnRankSub();
      updateCnRankLoadMoreUI();

      try {
        const result = await loadCnStockRank(next, RANK_PAGE_SIZE, 1);
        if (requestId !== loadCnRankKind._req) return;
        const list = result.list || [];
        cnRankState.list = list;
        cnRankState.page = 1;
        cnRankState.total = result.total || 0;
        cnRankState.hasMore = computeRankHasMore(
          list.length,
          list.length,
          cnRankState.total
        );
        renderCnStockRank(list);
        updateCnRankSub();
        updateCnRankLoadMoreUI();
        setStatus("cnRankStatus", list.length ? "" : "暂无A股数据");
        if (list.length) {
          requestAnimationFrame(() => {
            if (requestId !== loadCnRankKind._req) return;
            paintCnSparklines(list, requestId, { start: 0 }).catch(() => {});
            bindCnRankLoadMore();
          });
        }
      } catch (err) {
        if (requestId !== loadCnRankKind._req) return;
        cnRankState.list = [];
        cnRankState.trends = null;
        cnRankState.hasMore = false;
        if (listEl) listEl.innerHTML = "";
        updateCnRankLoadMoreUI();
        setStatus("cnRankStatus", err?.message || "A股涨跌榜加载失败，请稍后重试");
      }
    }

