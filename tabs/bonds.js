    const BONDS_KIND_TABS = [
      { id: "treasury", label: "国债" },
      { id: "local", label: "地方债" },
      { id: "credit", label: "企业债" },
      { id: "convertible", label: "可转债" }
    ];

    const bondsState = {
      kind: "treasury",
      list: [],
      sub: "国债及政策性金融债 · 利率债"
    };

    function bondsKindLabel(kind) {
      return BONDS_KIND_TABS.find((t) => t.id === kind)?.label || "国债";
    }

    function bondsSubText(kind, loaded, sub) {
      const tip = bondsKindLabel(kind);
      if (loaded) {
        return sub ? `${sub} · 已加载 ${loaded} 只` : `${tip} · 已加载 ${loaded} 只`;
      }
      return sub || `${tip} · 加载中…`;
    }

    function updateBondsSub() {
      const subEl = document.getElementById("bondsSub");
      if (!subEl) return;
      subEl.textContent = bondsSubText(
        bondsState.kind || "treasury",
        bondsState.list?.length || 0,
        bondsState.sub
      );
    }

    function buildBondsPanelElement(isActive) {
      const panel = document.createElement("section");
      panel.className = "panel" + (isActive ? " active" : "");
      panel.dataset.panel = "bonds";
      const kind = bondsState.kind || "treasury";
      const loaded = bondsState.list?.length || 0;
      const kindTabs = BONDS_KIND_TABS.map(
        (t) => `
          <button
            class="board-tab${t.id === kind ? " active" : ""}"
            type="button"
            data-bonds-kind="${t.id}"
          >${t.label}</button>`
      ).join("");

      panel.innerHTML = `
          <div class="fund-card kr-rank-card metals-card">
            <div class="fund-meta">
              <div class="fund-meta-text">
                <div class="name">债券行情</div>
                <div class="sub" id="bondsSub">${bondsSubText(
                  kind,
                  loaded,
                  bondsState.sub
                )}</div>
              </div>
              <div class="fund-meta-actions">
                <button class="btn-sync" type="button" data-bonds-refresh title="刷新债券行情" aria-label="刷新债券行情">
                  <img src="assets/pull.png" alt="刷新" />
                </button>
              </div>
            </div>
            <div class="board-tabs kr-rank-tabs fund-rank-tabs metals-tabs">
              ${kindTabs}
            </div>
            <div class="board-list-head us-stock-head kr-stock-head metals-list-head">
              <div>债券</div>
              <div style="text-align:center">最新价</div>
              <div style="text-align:center">涨跌额</div>
              <div style="text-align:center">涨跌幅%</div>
            </div>
            <div class="kr-rank-body">
              <div class="us-stock-list kr-stock-list metals-list" id="bondsList"></div>
              <div class="board-status show" id="bondsStatus">加载中…</div>
            </div>
          </div>`;
      return panel;
    }

    function bondStat(label, value, extraClass) {
      if (value == null || value === "" || value === "--") return "";
      const cls = extraClass ? ` class="${extraClass}"` : "";
      return `<span${cls}><em>${label}</em>${value}</span>`;
    }

    function formatBondPx(n) {
      return formatPrecisePrice(n);
    }

    function formatBondSigned(n) {
      if (n == null || Number.isNaN(Number(n))) return "--";
      const x = Number(n);
      const sign = x > 0 ? "+" : x < 0 ? "-" : "";
      return sign + formatBondPx(Math.abs(x));
    }

    function formatBondYi(n) {
      if (n == null || Number.isNaN(Number(n))) return "--";
      const x = Number(n);
      const abs = Math.abs(x);
      const sign = x < 0 ? "-" : "";
      if (abs >= 100) return sign + abs.toFixed(0) + "亿";
      if (abs >= 1) return sign + abs.toFixed(2) + "亿";
      return sign + (abs * 10000).toFixed(0) + "万";
    }

    function bondsExtraStats(item, kind) {
      if (kind === "convertible") {
        const stockChg =
          item.stockChange == null
            ? ""
            : ` ${formatPctWithArrow(item.stockChange)}`;
        const stockText = item.stockName
          ? `${item.stockName}${
              item.stockPrice != null ? " " + formatBondPx(item.stockPrice) : ""
            }${stockChg}`
          : item.stockCode || "";
        return [
          bondStat("正股", stockText, item.stockChange != null ? toneClass(item.stockChange) : ""),
          bondStat("转股价", item.convertPrice != null ? formatBondPx(item.convertPrice) : null),
          bondStat("转股价值", item.convertValue != null ? formatBondPx(item.convertValue) : null),
          bondStat(
            "溢价率",
            item.premium == null ? null : formatPct(item.premium),
            item.premium != null ? toneClass(item.premium) : ""
          ),
          bondStat("剩余规模", item.remainSize != null ? formatBondYi(item.remainSize) : null),
          bondStat("成交额", item.amount != null ? formatMarketCap(item.amount) : null)
        ]
          .filter(Boolean)
          .join("");
      }
      return [
        bondStat("今开", item.open != null ? formatBondPx(item.open) : null),
        bondStat("最高", item.high != null ? formatBondPx(item.high) : null),
        bondStat("最低", item.low != null ? formatBondPx(item.low) : null),
        bondStat("昨收", item.preClose != null ? formatBondPx(item.preClose) : null),
        bondStat("成交额", item.amount != null ? formatMarketCap(item.amount) : null),
        bondStat("成交量", item.volume > 0 ? formatVolume(item.volume) : null)
      ]
        .filter(Boolean)
        .join("");
    }

    function renderBondsList(list) {
      const wrap = document.getElementById("bondsList");
      if (!wrap) return;
      const kind = bondsState.kind || "treasury";
      if (!list.length) {
        wrap.innerHTML = "";
        return;
      }

      wrap.innerHTML = list
        .map((item, i) => {
          const tone = toneClass(item.change);
          const priceText = formatBondPx(item.price);
          const amtText = formatBondSigned(item.changeAmt);
          const chgText =
            item.change == null
              ? "--"
              : formatPct(item.change) + chgArrowHtml(item.change);
          const safeName = String(item.name || item.code || "").replace(
            /"/g,
            "&quot;"
          );
          const extra = bondsExtraStats(item, kind);
          const marketTag = item.market === 1 ? "SH" : item.market === 0 ? "SZ" : "";
          return `
            <button
              class="board-row kr-stock-row metals-row metals-row-btn"
              type="button"
              data-chart-fund="bonds"
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
                    <div class="board-meta">${codeWithCopyHtml(item.code, item.name)}${
                      marketTag ? " · " + marketTag : ""
                    }</div>
                  </div>
                </div>
                <div class="board-price ${tone}">${priceText}</div>
                <div class="board-price ${tone}">${amtText}</div>
                <div class="board-chg ${tone}">${chgText}</div>
              </div>
              ${extra ? `<div class="metals-stats">${extra}</div>` : ""}
            </button>`;
        })
        .join("");
    }

    function getBondsHolding(index) {
      const item = bondsState.list?.[index];
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
          amount: item.amount
        }
      };
    }

    async function loadBondsKind(kind, { force = false } = {}) {
      const next = BONDS_KIND_TABS.some((t) => t.id === kind) ? kind : "treasury";

      if (!force && bondsState.kind === next && bondsState.list?.length) {
        document.querySelectorAll("[data-bonds-kind]").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.bondsKind === next);
        });
        updateBondsSub();
        renderBondsList(bondsState.list);
        setStatus("bondsStatus", "");
        return;
      }

      bondsState.kind = next;
      document.querySelectorAll("[data-bonds-kind]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.bondsKind === next);
      });

      const requestId = (loadBondsKind._req = (loadBondsKind._req || 0) + 1);
      const listEl = document.getElementById("bondsList");
      if (listEl) listEl.innerHTML = "";
      setStatus("bondsStatus", `加载${bondsKindLabel(next)}行情…`);
      updateBondsSub();

      try {
        const result = await loadBondsQuotes(next);
        if (requestId !== loadBondsKind._req) return;
        const list = result.list || [];
        bondsState.list = list;
        bondsState.sub = result.sub || "";
        renderBondsList(list);
        updateBondsSub();
        setStatus("bondsStatus", list.length ? "" : `暂无${bondsKindLabel(next)}行情`);
      } catch (err) {
        if (requestId !== loadBondsKind._req) return;
        bondsState.list = [];
        if (listEl) listEl.innerHTML = "";
        updateBondsSub();
        setStatus("bondsStatus", err?.message || "债券行情加载失败，请稍后重试");
      }
    }
