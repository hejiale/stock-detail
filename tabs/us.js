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

    function renderUsStockRank(list) {
      const wrap = document.getElementById("usStockList");
      if (!wrap) return;
      if (!list.length) {
        wrap.innerHTML = "";
        return;
      }
      wrap.innerHTML = list
        .map((item, i) => {
          const tone = toneClass(item.change);
          return `
            <div class="board-row">
              <div class="board-rank${i < 3 ? " top" : ""}">${i + 1}</div>
              <div class="board-info">
                <div class="board-name">${item.name}</div>
                <div class="board-meta">${item.code}${item.price == null ? "" : " · $" + formatPrice(item.price)}</div>
              </div>
              <div class="board-chg ${tone}">${formatPct(item.change)}${chgArrowHtml(item.change)}</div>
            </div>`;
        })
        .join("");
    }

    async function loadUsRankKind(kind) {
      const requestId = (loadUsRankKind._req = (loadUsRankKind._req || 0) + 1);
      document.querySelectorAll("[data-us-rank]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.usRank === kind);
      });
      openUsBoardModal._rank = kind;

      try {
        const list = await loadUsStockRank(kind, 100);
        if (requestId !== loadUsRankKind._req) return;
        openUsBoardModal._stocks = list;
        renderUsStockRank(list);
      } catch (err) {
        if (requestId !== loadUsRankKind._req) return;
        document.getElementById("usStockList").innerHTML = "";
        showToast(err?.message || "涨跌榜加载失败");
      }
    }

    async function openUsBoardModal() {
      showModal("usBoardModal");
      setStatus("usBoardStatus", "加载中…");
      document.getElementById("usIndexGrid").innerHTML = "";
      document.getElementById("usStockList").innerHTML = "";
      renderMarketBreadth("usMarketBreadth", null);

      const requestId = (openUsBoardModal._req = (openUsBoardModal._req || 0) + 1);
      const rank = openUsBoardModal._rank || "gainers";

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
        setStatus("usBoardStatus", "");
        requestAnimationFrame(() => {
          if (requestId !== openUsBoardModal._req) return;
          paintUsIndexSparklines(indices).catch(() => {});
        });
        await loadUsRankKind(rank);
      } catch (err) {
        if (requestId !== openUsBoardModal._req) return;
        setStatus("usBoardStatus", err?.message || "美股数据加载失败，请稍后重试");
      }
    }

    function closeUsBoardModal() {
      openUsBoardModal._req = (openUsBoardModal._req || 0) + 1;
      loadUsRankKind._req = (loadUsRankKind._req || 0) + 1;
      hideModal("usBoardModal");
      setStatus("usBoardStatus", "");
      renderMarketBreadth("usMarketBreadth", null);
    }

