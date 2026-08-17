    const METALS_KIND_TABS = [
      { id: "spotIntl", label: "国际现货" },
      { id: "futuresIntl", label: "国际期货" },
      { id: "sge", label: "上金所" },
      { id: "shfe", label: "沪金沪银" }
    ];

    const metalsState = {
      kind: "spotIntl",
      list: [],
      sub: "伦敦金/银及货币贵金属 · 盎司计价"
    };

    function metalsKindLabel(kind) {
      return METALS_KIND_TABS.find((t) => t.id === kind)?.label || "国际现货";
    }

    function metalsSubText(kind, loaded, sub) {
      const tip = metalsKindLabel(kind);
      if (loaded) {
        return sub ? `${sub} · 已加载 ${loaded} 条` : `${tip} · 已加载 ${loaded} 条`;
      }
      return sub || `${tip} · 加载中…`;
    }

    function updateMetalsSub() {
      const subEl = document.getElementById("metalsSub");
      if (!subEl) return;
      subEl.textContent = metalsSubText(
        metalsState.kind || "spotIntl",
        metalsState.list?.length || 0,
        metalsState.sub
      );
    }

    function buildMetalsPanelElement(isActive) {
      const panel = document.createElement("section");
      panel.className = "panel" + (isActive ? " active" : "");
      panel.dataset.panel = "metals";
      const kind = metalsState.kind || "spotIntl";
      const loaded = metalsState.list?.length || 0;
      const kindTabs = METALS_KIND_TABS.map(
        (t) => `
          <button
            class="board-tab${t.id === kind ? " active" : ""}"
            type="button"
            data-metals-kind="${t.id}"
          >${t.label}</button>`
      ).join("");

      panel.innerHTML = `
          <div class="fund-card kr-rank-card metals-card">
            <div class="fund-meta">
              <div class="fund-meta-text">
                <div class="name">贵金属行情</div>
                <div class="sub" id="metalsSub">${metalsSubText(
                  kind,
                  loaded,
                  metalsState.sub
                )}</div>
              </div>
              <div class="fund-meta-actions">
                <button class="btn-sync" type="button" data-metals-refresh title="刷新贵金属行情" aria-label="刷新贵金属行情">
                  <img src="assets/pull.png" alt="刷新" />
                </button>
              </div>
            </div>
            <div class="board-tabs kr-rank-tabs fund-rank-tabs metals-tabs">
              ${kindTabs}
            </div>
            <div class="board-list-head us-stock-head kr-stock-head metals-list-head">
              <div>品种</div>
              <div style="text-align:center">最新价</div>
              <div style="text-align:center">涨跌额</div>
              <div style="text-align:center">涨跌幅%</div>
            </div>
            <div class="kr-rank-body">
              <div class="us-stock-list kr-stock-list metals-list" id="metalsList"></div>
              <div class="board-status show" id="metalsStatus">加载中…</div>
            </div>
          </div>`;
      return panel;
    }

    function formatMetalPrice(n) {
      return formatPrecisePrice(n);
    }

    function formatMetalSigned(n) {
      if (n == null || Number.isNaN(Number(n))) return "--";
      const x = Number(n);
      const abs = Math.abs(x);
      const sign = x > 0 ? "+" : "";
      const body = abs >= 1 ? Math.abs(x).toFixed(2) : Math.abs(x).toFixed(3);
      return (x < 0 ? "-" : sign) + body;
    }

    function formatMetalPct(n) {
      if (n == null || Number.isNaN(Number(n))) return "--";
      return formatPct(n);
    }

    function metalStat(label, value, formatter) {
      if (value == null) return "";
      const text = formatter ? formatter(value) : formatMetalPrice(value);
      if (text === "--") return "";
      return `<span><em>${label}</em>${text}</span>`;
    }

    function metalsExtraStats(item, kind) {
      const parts = [
        metalStat("今开", item.open),
        metalStat("最高", item.high),
        metalStat("最低", item.low),
        metalStat(kind === "sge" ? "昨收" : "昨结", item.preClose)
      ];
      if (kind === "futuresIntl" || kind === "shfe") {
        parts.push(metalStat("成交量", item.volume, formatVolume));
        parts.push(metalStat("持仓", item.openInterest, formatVolume));
      } else {
        if (item.volume > 0) {
          parts.push(metalStat("成交量", item.volume, formatVolume));
        }
        parts.push(metalStat("买入", item.bid));
        parts.push(metalStat("卖出", item.ask));
      }
      return parts.filter(Boolean).join("");
    }

    function renderMetalsList(list) {
      const wrap = document.getElementById("metalsList");
      if (!wrap) return;
      const kind = metalsState.kind || "spotIntl";
      if (!list.length) {
        wrap.innerHTML = "";
        return;
      }

      wrap.innerHTML = list
        .map((item, i) => {
          const tone = toneClass(item.change);
          const priceText = formatMetalPrice(item.price);
          const amtText = formatMetalSigned(item.changeAmt);
          const chgText =
            item.change == null
              ? "--"
              : formatMetalPct(item.change) + chgArrowHtml(item.change);
          const safeName = String(item.name || item.code || "").replace(
            /"/g,
            "&quot;"
          );
          const extra = metalsExtraStats(item, kind);
          return `
            <button
              class="board-row kr-stock-row metals-row metals-row-btn"
              type="button"
              data-chart-fund="metals"
              data-chart-index="${i}"
              title="查看 ${safeName} 趋势图"
            >
              <div class="metals-main">
                <div class="board-info rank-board-info">
                  <div class="rank-board-text">
                    <div class="board-name-row">
                      <div class="board-name">${item.name}</div>
                      <svg class="board-name-arrow" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                        <path d="M5.8 2.6 4.6 3.8 8.8 8l-4.2 4.2 1.2 1.2L11.2 8 5.8 2.6z"/>
                      </svg>
                    </div>
                    <div class="board-meta">${codeWithCopyHtml(item.code, item.name)}</div>
                  </div>
                </div>
                <div class="board-price ${tone}">${priceText}</div>
                <div class="board-price ${tone}">${amtText}</div>
                <div class="board-chg ${tone}">${chgText}</div>
              </div>
              ${
                extra
                  ? `<div class="metals-stats">${extra}</div>`
                  : ""
              }
            </button>`;
        })
        .join("");
    }

    function getMetalsHolding(index) {
      const item = metalsState.list?.[index];
      if (!item) return null;
      return {
        name: item.name,
        code: item.code,
        market: item.market,
        quote: {
          name: item.name,
          code: item.code,
          price: item.price,
          change: item.change,
          changeAmt: item.changeAmt,
          open: item.open,
          high: item.high,
          low: item.low,
          preClose: item.preClose,
          volume: item.volume,
          amount: item.amount,
          bid: item.bid,
          ask: item.ask,
          openInterest: item.openInterest
        }
      };
    }

    async function loadMetalsKind(kind, { force = false } = {}) {
      const next = METALS_KIND_TABS.some((t) => t.id === kind)
        ? kind
        : "spotIntl";

      if (!force && metalsState.kind === next && metalsState.list?.length) {
        document.querySelectorAll("[data-metals-kind]").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.metalsKind === next);
        });
        updateMetalsSub();
        renderMetalsList(metalsState.list);
        setStatus("metalsStatus", "");
        return;
      }

      metalsState.kind = next;
      document.querySelectorAll("[data-metals-kind]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.metalsKind === next);
      });

      const requestId = (loadMetalsKind._req = (loadMetalsKind._req || 0) + 1);
      const listEl = document.getElementById("metalsList");
      if (listEl) listEl.innerHTML = "";
      setStatus("metalsStatus", "加载贵金属行情…");
      updateMetalsSub();

      try {
        const result = await loadMetalsQuotes(next);
        if (requestId !== loadMetalsKind._req) return;
        const list = result.list || [];
        metalsState.list = list;
        metalsState.sub = result.sub || "";
        renderMetalsList(list);
        updateMetalsSub();
        setStatus("metalsStatus", list.length ? "" : "暂无贵金属行情");
      } catch (err) {
        if (requestId !== loadMetalsKind._req) return;
        metalsState.list = [];
        if (listEl) listEl.innerHTML = "";
        updateMetalsSub();
        setStatus(
          "metalsStatus",
          err?.message || "贵金属行情加载失败，请稍后重试"
        );
      }
    }
