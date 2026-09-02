    function getWatchHolding(index) {
      const item = watchlistState.list?.[index];
      if (!item) return null;
      return {
        name: item.name,
        code: item.code,
        market: item.market
      };
    }

    function setWatchAuthGate(on) {
      const card = document.querySelector('[data-panel="watchStocks"] .watch-rank-card');
      const nameEl = document.querySelector('[data-panel="watchStocks"] .fund-meta .name');
      if (card) card.classList.toggle("is-auth-gate", !!on);
      if (nameEl) nameEl.textContent = on ? "自选" : "自选个股";
    }

    function renderWatchLoginGate() {
      setWatchAuthGate(true);
      const wrap = document.getElementById("watchStockList");
      const subEl = document.getElementById("watchRankSub");
      if (wrap) {
        wrap.innerHTML = `
          <div class="watch-login-gate">
            <div class="watch-login-title">登录后查看自选</div>
            <div class="watch-login-desc">自选个股和自选基金需登录后同步到云端，登录后可在本页切换查看。</div>
            <div class="watch-login-actions">
              <button class="btn btn-primary" type="button" data-open-login>登录</button>
            </div>
          </div>`;
      }
      if (subEl) subEl.textContent = "未登录";
      setStatus("watchBoardStatus", "");
    }

    function buildWatchPanelElement(isActive) {
      const panel = document.createElement("section");
      panel.className = "panel" + (isActive ? " active" : "");
      panel.dataset.panel = "watchStocks";
      panel.style.display = "none";
      return panel;
    }

    function renderWatchStockList(list) {
      const wrap = document.getElementById("watchStockList");
      if (!wrap) return;
      if (!list.length) {
        wrap.innerHTML = "";
        return;
      }
      const type = normalizeWatchType(watchlistState.type || 1);
      const meta = WATCH_TYPE_META.find((m) => m.type === type);
      const prefix = meta?.pricePrefix || "";
      wrap.innerHTML = list
        .map((item, i) => {
          const tone = item.change == null ? "flat" : toneClass(item.change);
          const chgText =
            item.change == null
              ? "--"
              : formatPct(item.change) + chgArrowHtml(item.change);
          const priceText =
            item.price == null ? "--" : prefix + formatPrice(item.price);
          const safeName = String(item.name || item.code || "").replace(
            /"/g,
            "&quot;"
          );
          return `
            <div class="board-row kr-stock-row watch-stock-row">
              <div class="board-info watch-board-info">
                <button
                  class="btn-remove-stock"
                  type="button"
                  data-remove-watch="${item.code}"
                  title="移除自选"
                  aria-label="移除 ${safeName}"
                ><img src="assets/quxiao_zixuan.png" alt="移除" /></button>
                <div class="watch-board-text">
                  <div
                    class="board-name"
                    role="button"
                    tabindex="0"
                    data-chart-fund="watchStocks"
                    data-chart-index="${i}"
                    title="查看 ${safeName} 行情"
                  >${item.name || item.code}</div>
                  <div class="board-meta">${codeWithCopyHtml(item.code, item.name)}</div>
                </div>
              </div>
              <div
                class="kr-spark-wrap"
                role="button"
                tabindex="0"
                data-chart-fund="watchStocks"
                data-chart-index="${i}"
                title="查看 ${safeName} 行情"
              >
                <canvas class="kr-spark" data-watch-spark="${i}" aria-hidden="true"></canvas>
              </div>
              <div class="board-price ${tone}">${priceText}</div>
              <div class="board-chg ${tone}">${chgText}</div>
            </div>`;
        })
        .join("");
    }

    async function paintWatchSparklines(list, requestId) {
      const results = await Promise.allSettled(
        list.map((item) =>
          loadIntradayTrends({
            code: item.code,
            market: item.market,
            name: item.name
          })
        )
      );
      if (requestId != null && requestId !== loadWatchlist._req) return;

      const trends = results.map((result) =>
        result.status === "fulfilled" ? result.value : null
      );
      watchlistState.trends = trends;
      redrawWatchSparklines();
    }

    function redrawWatchSparklines() {
      const trends = watchlistState.trends;
      if (!trends?.length) return;
      trends.forEach((trend, i) => {
        const canvas = document.querySelector(`[data-watch-spark="${i}"]`);
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

    async function loadWatchlist(type, { force = false } = {}) {
      // 个股功能已禁用，直接返回
      return;
    }
