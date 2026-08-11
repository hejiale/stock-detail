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
          return `
            <div class="board-row board-stock-row">
              <div class="board-info">
                <div class="board-name">${item.name}</div>
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

