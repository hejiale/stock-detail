    const OIL_KIND_TABS = [
      { id: "intl", label: "国际原油" },
      { id: "ine", label: "上期能源" }
    ];

    const oilState = {
      kind: "intl",
      list: [],
      sub: "NYMEX WTI / ICE 布伦特 · 美元/桶"
    };

    function oilKindLabel(kind) {
      return OIL_KIND_TABS.find((t) => t.id === kind)?.label || "国际原油";
    }

    function oilSubText(kind, loaded, sub) {
      const tip = oilKindLabel(kind);
      if (loaded) {
        return sub ? `${sub} · 已加载 ${loaded} 条` : `${tip} · 已加载 ${loaded} 条`;
      }
      return sub || `${tip} · 加载中…`;
    }

    function updateOilSub() {
      const subEl = document.getElementById("oilSub");
      if (!subEl) return;
      subEl.textContent = oilSubText(
        oilState.kind || "intl",
        oilState.list?.length || 0,
        oilState.sub
      );
    }

    function buildOilPanelElement(isActive) {
      const panel = document.createElement("section");
      panel.className = "panel" + (isActive ? " active" : "");
      panel.dataset.panel = "oil";
      const kind = oilState.kind || "intl";
      const loaded = oilState.list?.length || 0;
      const kindTabs = OIL_KIND_TABS.map(
        (t) => `
          <button
            class="board-tab${t.id === kind ? " active" : ""}"
            type="button"
            data-oil-kind="${t.id}"
          >${t.label}</button>`
      ).join("");

      panel.innerHTML = `
          <div class="fund-card kr-rank-card metals-card">
            <div class="fund-meta">
              <div class="fund-meta-text">
                <div class="name">原油行情</div>
                <div class="sub" id="oilSub">${oilSubText(
                  kind,
                  loaded,
                  oilState.sub
                )}</div>
              </div>
              <div class="fund-meta-actions">
                <button class="btn-sync" type="button" data-oil-refresh title="刷新原油行情" aria-label="刷新原油行情">
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
              <div class="us-stock-list kr-stock-list metals-list" id="oilList"></div>
              <div class="board-status show" id="oilStatus">加载中…</div>
            </div>
          </div>`;
      return panel;
    }

    function formatOilPrice(n) {
      return formatPrecisePrice(n);
    }

    function formatOilSigned(n) {
      if (n == null || Number.isNaN(Number(n))) return "--";
      const x = Number(n);
      const abs = Math.abs(x);
      const sign = x > 0 ? "+" : "";
      const body = abs >= 1 ? Math.abs(x).toFixed(2) : Math.abs(x).toFixed(3);
      return (x < 0 ? "-" : sign) + body;
    }

    function formatOilPct(n) {
      if (n == null || Number.isNaN(Number(n))) return "--";
      return formatPct(n);
    }

    function oilStat(label, value, formatter) {
      if (value == null) return "";
      const text = formatter ? formatter(value) : formatOilPrice(value);
      if (text === "--") return "";
      return `<span><em>${label}</em>${text}</span>`;
    }

    function oilExtraStats(item) {
      const parts = [
        oilStat("今开", item.open),
        oilStat("最高", item.high),
        oilStat("最低", item.low),
        oilStat("昨结", item.preClose),
        oilStat("成交量", item.volume, formatVolume),
        oilStat("持仓", item.openInterest, formatVolume),
        oilStat("买入", item.bid),
        oilStat("卖出", item.ask)
      ];
      return parts.filter(Boolean).join("");
    }

    function renderOilList(list) {
      const wrap = document.getElementById("oilList");
      if (!wrap) return;
      if (!list.length) {
        wrap.innerHTML = "";
        return;
      }

      wrap.innerHTML = list
        .map((item, i) => {
          const tone = toneClass(item.change);
          const priceText = formatOilPrice(item.price);
          const amtText = formatOilSigned(item.changeAmt);
          const chgText =
            item.change == null
              ? "--"
              : formatOilPct(item.change) + chgArrowHtml(item.change);
          const safeName = String(item.name || item.code || "").replace(
            /"/g,
            "&quot;"
          );
          const extra = oilExtraStats(item);
          return `
            <button
              class="board-row kr-stock-row metals-row metals-row-btn"
              type="button"
              data-chart-fund="oil"
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

    function getOilHolding(index) {
      const item = oilState.list?.[index];
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

    async function loadOilKind(kind, { force = false } = {}) {
      const next = OIL_KIND_TABS.some((t) => t.id === kind) ? kind : "intl";

      if (!force && oilState.kind === next && oilState.list?.length) {
        document.querySelectorAll("[data-oil-kind]").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.oilKind === next);
        });
        updateOilSub();
        renderOilList(oilState.list);
        setStatus("oilStatus", "");
        return;
      }

      oilState.kind = next;
      document.querySelectorAll("[data-oil-kind]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.oilKind === next);
      });

      const requestId = (loadOilKind._req = (loadOilKind._req || 0) + 1);
      const listEl = document.getElementById("oilList");
      if (listEl) listEl.innerHTML = "";
      setStatus("oilStatus", "加载原油行情…");
      updateOilSub();

      try {
        const result = await loadOilQuotes(next);
        if (requestId !== loadOilKind._req) return;
        const list = result.list || [];
        oilState.list = list;
        oilState.sub = result.sub || "";
        renderOilList(list);
        updateOilSub();
        setStatus("oilStatus", list.length ? "" : "暂无原油行情");
      } catch (err) {
        if (requestId !== loadOilKind._req) return;
        oilState.list = [];
        if (listEl) listEl.innerHTML = "";
        updateOilSub();
        setStatus(
          "oilStatus",
          err?.message || "原油行情加载失败，请稍后重试"
        );
      }
    }
