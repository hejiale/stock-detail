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
