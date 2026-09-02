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
          const label = item.label || item.name || item.code;
          const safeLabel = String(label).replace(/"/g, "&quot;");
          return `
            <button
              class="cn-index-card"
              type="button"
              data-cn-index="${i}"
              data-cn-index-code="${item.code}"
              data-cn-index-label="${safeLabel}"
              title="查看 ${safeLabel} 人气股与涨跌榜"
            >
              <div class="idx-head">
                <div class="idx-name">${label}</div>
                <div class="idx-chg ${tone}">${formatPct(item.change)}${chgArrowHtml(item.change)}</div>
              </div>
              <div class="idx-price">${item.price == null ? "--" : formatPrice(item.price)}</div>
              <canvas class="idx-chart" data-cn-spark="${i}" aria-hidden="true"></canvas>
            </button>`;
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

    function renderRegionBoardList(list) {
      const wrap = document.getElementById("regionBoardList");
      if (!wrap) return;
      if (!list.length) {
        wrap.innerHTML = "";
        return;
      }

      wrap.innerHTML = list
        .map((item) => {
          const displayName = /板块$/u.test(item.name)
            ? item.name
            : `${item.name}板块`;
          const safeName = String(displayName).replace(/"/g, "&quot;");
          const up = item.upCount || 0;
          const down = item.downCount || 0;
          return `
            <button
              class="board-row board-row-btn region-row"
              type="button"
              data-board-code="${item.code}"
              data-board-codes="${item.code}"
              data-board-name="${safeName}"
              title="查看 ${safeName} 成分股涨跌榜"
            >
              <div class="board-info">
                <div class="board-name-row">
                  <span class="board-name">${displayName}</span>
                </div>
              </div>
              <div class="region-up">${up}</div>
              <div class="region-down">${down}</div>
              <div class="region-mcap">${formatMarketCap(item.mcap)}</div>
            </button>`;
        })
        .join("");
    }

    function setCnSectionExpanded(key, expanded) {
      const section = document.querySelector(`[data-cn-collapsible="${key}"]`);
      const btn = document.querySelector(`[data-cn-section-toggle="${key}"]`);
      if (!section || !btn) return;
      section.classList.toggle("is-collapsed", !expanded);
      btn.setAttribute("aria-expanded", expanded ? "true" : "false");
    }

    function toggleCnSection(key) {
      const btn = document.querySelector(`[data-cn-section-toggle="${key}"]`);
      if (!btn) return;
      const expanded = btn.getAttribute("aria-expanded") !== "false";
      setCnSectionExpanded(key, !expanded);
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
                </div>
                <div class="board-meta">${i + 1} · ${codeWithCopyHtml(item.code, item.name)}</div>
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

    let indexStocksRequestId = 0;
    const indexStocksState = {
      code: "",
      label: "",
      rank: "hot"
    };

    function resolveIndexStocksRank(kind) {
      const k = String(kind || "").trim().toLowerCase();
      if (k === "gainers" || k === "day" || k === "month") return "gainers";
      if (k === "losers") return "losers";
      if (k === "mcap" || k === "market" || k === "cap") return "mcap";
      return "hot";
    }

    function setIndexStocksRankTabs(kind) {
      document.querySelectorAll("[data-cn-index-rank]").forEach((btn) => {
        const value =
          btn.getAttribute("data-cn-index-rank") || btn.dataset.cnIndexRank;
        btn.classList.toggle("active", resolveIndexStocksRank(value) === kind);
      });
      const head = document.getElementById("indexStocksChgHead");
      if (head) {
        head.textContent = kind === "mcap" ? "总市值" : "涨跌幅%";
      }
    }

    function renderIndexStocksList(list) {
      const wrap = document.getElementById("indexStocksList");
      if (!wrap) return;
      if (!list.length) {
        wrap.innerHTML = "";
        return;
      }

      const isMcap = indexStocksState.rank === "mcap";
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
          const rightCol = isMcap
            ? `<div class="board-mcap">${formatMarketCap(item.marketCap)}</div>`
            : `<div class="board-chg ${tone}">${chgText}${arrow}</div>`;
          return `
            <div class="board-row board-stock-row">
              <div class="board-info">
                <div class="board-name-row">
                  <div class="board-name">${item.name}</div>
                </div>
                <div class="board-meta">${meta}</div>
              </div>
              <div class="board-price">${item.price == null ? "--" : formatPrice(item.price)}</div>
              ${rightCol}
            </div>`;
        })
        .join("");
    }

    function getIndexStocksRankLoader(rank) {
      const api = window.MarketAPI || {};
      const fn =
        rank === "gainers" || rank === "losers"
          ? api.loadCnIndexDayRank
          : rank === "mcap"
            ? api.loadCnIndexMarketCapRank
            : api.loadCnIndexHotStocks;
      if (typeof fn !== "function") {
        throw new Error(rank === "mcap" ? "市值榜接口未加载" : "榜单接口未加载");
      }
      return fn;
    }

    function indexStocksRankLabel(rank) {
      if (rank === "gainers") return "涨幅";
      if (rank === "losers") return "跌幅";
      if (rank === "mcap") return "市值";
      return "人气";
    }

    async function loadIndexStocksRank(kind) {
      const rank = resolveIndexStocksRank(kind);
      indexStocksState.rank = rank;
      setIndexStocksRankTabs(rank);
      if (!indexStocksState.code) return;

      const reqId = ++indexStocksRequestId;
      const rankLabel = indexStocksRankLabel(rank);
      document.getElementById("indexStocksModalSub").textContent =
        `${indexStocksState.label} · 加载${rankLabel}榜…`;
      document.getElementById("indexStocksList").innerHTML = "";
      setStatus("indexStocksStatus", `加载${rankLabel}榜…`);

      try {
        const list = await getIndexStocksRankLoader(rank)(
          indexStocksState.code,
          20,
          rank
        );
        if (reqId !== indexStocksRequestId) return;
        document.getElementById("indexStocksModalSub").textContent =
          `${indexStocksState.label} · ${rankLabel}前 ${list.length} 只`;
        renderIndexStocksList(list);
        setStatus(
          "indexStocksStatus",
          list.length ? "" : `暂无${rankLabel}数据`
        );
      } catch (err) {
        if (reqId !== indexStocksRequestId) return;
        document.getElementById("indexStocksModalSub").textContent = "加载失败";
        setStatus("indexStocksStatus", err?.message || "榜单加载失败");
      }
    }

    async function openIndexStocksModal(indexCode, indexLabel) {
      const board =
        typeof resolveCnIndexBoard === "function"
          ? resolveCnIndexBoard(indexCode)
          : null;
      if (!board && !indexCode) return;

      indexStocksState.code = board?.code || indexCode;
      indexStocksState.label =
        indexLabel || board?.label || indexStocksState.code;
      indexStocksState.rank = "hot";

      document.getElementById("indexStocksModalName").textContent =
        indexStocksState.label;
      showModal("indexStocksModal");
      await loadIndexStocksRank("hot");
    }

    function closeIndexStocksModal() {
      indexStocksRequestId += 1;
      hideModal("indexStocksModal");
      setStatus("indexStocksStatus", "");
    }

    async function loadBoardList() {
      const requestId = (loadBoardList._req = (loadBoardList._req || 0) + 1);
      document.getElementById("boardModalSub").textContent =
        "加载市场指数、行业与地域板块…";
      setStatus("boardStatus", "加载中…");
      document.getElementById("cnIndexGrid").innerHTML = "";
      document.getElementById("boardList").innerHTML = "";
      const regionWrap = document.getElementById("regionBoardList");
      if (regionWrap) regionWrap.innerHTML = "";
      renderMarketBreadth("cnMarketBreadth", null);
      setCnSectionExpanded("industry", true);
      setCnSectionExpanded("region", true);

      try {
        const [indicesResult, boardsResult, regionsResult] = await Promise.allSettled([
          loadCnIndices(),
          loadCnSectorBoards(),
          loadCnRegionBoards()
        ]);
        if (requestId !== loadBoardList._req) return;

        const indices =
          indicesResult.status === "fulfilled" ? indicesResult.value : [];
        const list =
          boardsResult.status === "fulfilled" ? boardsResult.value : [];
        const regions =
          regionsResult.status === "fulfilled" ? regionsResult.value : [];

        openBoardModal._indices = indices;
        openBoardModal._list = list;
        openBoardModal._regions = regions;
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

        if (
          boardsResult.status === "rejected" &&
          regionsResult.status === "rejected" &&
          !indices.length
        ) {
          throw boardsResult.reason || regionsResult.reason || new Error("板块数据加载失败");
        }

        const parts = [];
        if (list.length) parts.push(`行业 ${list.length}`);
        if (regions.length) parts.push(`地域 ${regions.length}`);
        document.getElementById("boardModalSub").textContent = parts.length
          ? `共 ${parts.join(" · ")}（行业已归类）· 按涨跌幅排序`
          : indices.length
            ? "板块列表加载失败"
            : "暂无数据";
        renderBoardList(list);
        renderRegionBoardList(regions);
        setStatus(
          "boardStatus",
          list.length || regions.length || indices.length
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
      if (document.getElementById("indexStocksModal")?.classList.contains("show")) {
        closeIndexStocksModal();
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
      const loading = loaded === 0 && !(cnRankState.page > 0);
      panel.innerHTML = `
          <div class="fund-card kr-rank-card cn-rank-card">
            <div class="fund-meta">
              <div class="fund-meta-text">
                <div class="name">A股涨跌榜</div>
                <div class="sub" id="cnRankSub">${cnRankSubText(kind, loaded, { loading })}</div>
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
                  placeholder="输入代码或名称查询，如 600519、贵州茅台"
                  autocomplete="off"
                  spellcheck="false"
                />
              </div>
            </div>
            <div class="board-tabs kr-rank-tabs">
              <button class="board-tab${kind === "gainers" ? " active" : ""}" type="button" data-cn-rank="gainers">涨幅前100</button>
              <button class="board-tab${kind === "losers" ? " active" : ""}" type="button" data-cn-rank="losers">跌幅前100</button>
            </div>
            <div class="board-list-head us-stock-head kr-stock-head">
              <div>股票</div>
              <div style="text-align:center">走势</div>
              <div style="text-align:center">最新价</div>
              <div style="text-align:center">涨跌幅%</div>
            </div>
            <div class="kr-rank-body">
              <div class="us-stock-list kr-stock-list" id="cnStockList"></div>
              <div class="rank-load-more" data-rank-more="cnSemi" hidden></div>
              <div class="board-status show" id="cnRankStatus">加载中…</div>
            </div>
          </div>`;
      return panel;
    }

    function cnRankSubText(kind, loaded, { loading = false } = {}) {
      const tip = kind === "losers" ? "跌幅" : "涨幅";
      if (loading) return "沪深京 A 股 · 加载中…";
      if (loaded) return `沪深京 A 股 · ${tip}榜已加载 ${loaded} 只`;
      return `沪深京 A 股 · 暂无${tip}数据`;
    }

    function updateCnRankSub({ loading = false } = {}) {
      const subEl = document.getElementById("cnRankSub");
      if (!subEl) return;
      subEl.textContent = cnRankSubText(
        cnRankState.kind || "gainers",
        cnRankState.list?.length || 0,
        { loading }
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
          const priceText =
            item.price == null ? "--" : formatPrice(item.price);
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
                  </div>
                  <div class="board-meta">${codeWithCopyHtml(item.code, item.name)}</div>
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
              <div class="board-price ${tone}">${priceText}</div>
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
      updateCnRankSub({ loading: true });
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
        cnRankState.page = 1;
        cnRankState.hasMore = false;
        if (listEl) listEl.innerHTML = "";
        updateCnRankSub();
        updateCnRankLoadMoreUI();
        setStatus("cnRankStatus", err?.message || "A股涨跌榜加载失败，请稍后重试");
      }
    }

