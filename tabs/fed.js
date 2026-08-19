    const FED_KIND_TABS = [
      { id: "overview", label: "利率概览" },
      { id: "treasury", label: "美债收益率" },
      { id: "history", label: "EFFR 历史" }
    ];

    const fedState = {
      kind: "overview",
      list: [],
      sub: "纽约联储 · 联邦基金目标区间 / EFFR / SOFR",
      targetFrom: null,
      targetTo: null,
      asOf: ""
    };

    function fedKindLabel(kind) {
      return FED_KIND_TABS.find((t) => t.id === kind)?.label || "利率概览";
    }

    function fedSubText(kind, loaded, sub) {
      const tip = fedKindLabel(kind);
      if (loaded) {
        return sub ? `${sub} · 已加载 ${loaded} 条` : `${tip} · 已加载 ${loaded} 条`;
      }
      return sub || `${tip} · 加载中…`;
    }

    function updateFedSub() {
      const subEl = document.getElementById("fedSub");
      if (!subEl) return;
      subEl.textContent = fedSubText(
        fedState.kind || "overview",
        fedState.list?.length || 0,
        fedState.sub
      );
    }

    function buildFedPanelElement(isActive) {
      const panel = document.createElement("section");
      panel.className = "panel" + (isActive ? " active" : "");
      panel.dataset.panel = "fed";
      const kind = fedState.kind || "overview";
      const loaded = fedState.list?.length || 0;
      const kindTabs = FED_KIND_TABS.map(
        (t) => `
          <button
            class="board-tab${t.id === kind ? " active" : ""}"
            type="button"
            data-fed-kind="${t.id}"
          >${t.label}</button>`
      ).join("");

      panel.innerHTML = `
          <div class="fund-card kr-rank-card metals-card fed-card">
            <div class="fund-meta">
              <div class="fund-meta-text">
                <div class="name">美联储利率</div>
                <div class="sub" id="fedSub">${fedSubText(
                  kind,
                  loaded,
                  fedState.sub
                )}</div>
              </div>
              <div class="fund-meta-actions">
                <button class="btn-sync" type="button" data-fed-refresh title="刷新美联储利率" aria-label="刷新美联储利率">
                  <img src="assets/pull.png" alt="刷新" />
                </button>
              </div>
            </div>
            <div class="board-tabs kr-rank-tabs fund-rank-tabs metals-tabs">
              ${kindTabs}
            </div>
            <div id="fedHero" class="fed-hero" hidden></div>
            <div class="board-list-head us-stock-head kr-stock-head metals-list-head" id="fedListHead"></div>
            <div class="kr-rank-body">
              <div class="us-stock-list kr-stock-list metals-list" id="fedList"></div>
              <div class="board-status show" id="fedStatus">加载中…</div>
            </div>
          </div>`;
      return panel;
    }

    function formatFedPct(n, digits = 2) {
      if (n == null || Number.isNaN(Number(n))) return "--";
      return Number(n).toFixed(digits) + "%";
    }

    function formatFedSignedBp(n) {
      if (n == null || Number.isNaN(Number(n))) return "--";
      const x = Number(n);
      const bp = Math.round(x * 100);
      const sign = bp > 0 ? "+" : "";
      return sign + bp + " BP";
    }

    function fedStat(label, value) {
      if (value == null || value === "" || value === "--") return "";
      return `<span><em>${label}</em>${value}</span>`;
    }

    function renderFedHero() {
      const hero = document.getElementById("fedHero");
      if (!hero) return;
      const kind = fedState.kind || "overview";
      if (kind !== "overview") {
        hero.hidden = true;
        hero.innerHTML = "";
        return;
      }
      const from = fedState.targetFrom;
      const to = fedState.targetTo;
      if (from == null && to == null) {
        hero.hidden = true;
        hero.innerHTML = "";
        return;
      }
      const range =
        from != null && to != null
          ? `${Number(from).toFixed(2)}–${Number(to).toFixed(2)}%`
          : formatFedPct(from != null ? from : to);
      const asOf = fedState.asOf ? `数据日期 ${fedState.asOf}` : "纽约联储";
      hero.hidden = false;
      hero.innerHTML = `
        <div class="fed-hero-label">联邦基金目标利率</div>
        <div class="fed-hero-value">${range}</div>
        <div class="fed-hero-sub">${asOf}</div>`;
    }

    function renderFedListHead(kind) {
      const head = document.getElementById("fedListHead");
      if (!head) return;
      if (kind === "treasury") {
        head.className =
          "board-list-head us-stock-head kr-stock-head metals-list-head fed-treasury-head";
        head.innerHTML = `
          <div>日期</div>
          <div style="text-align:center">2Y</div>
          <div style="text-align:center">5Y</div>
          <div style="text-align:center">10Y</div>
          <div style="text-align:center">30Y</div>`;
        return;
      }
      if (kind === "history") {
        head.className =
          "board-list-head us-stock-head kr-stock-head metals-list-head fed-history-head";
        head.innerHTML = `
          <div>日期</div>
          <div style="text-align:center">EFFR</div>
          <div style="text-align:center">目标区间</div>
          <div style="text-align:center">成交量(十亿)</div>`;
        return;
      }
      head.className =
        "board-list-head us-stock-head kr-stock-head metals-list-head fed-overview-head";
      head.innerHTML = `
        <div>指标</div>
        <div style="text-align:center">最新值</div>
        <div style="text-align:center">日期</div>
        <div style="text-align:center">备注</div>`;
    }

    function renderFedOverviewList(list) {
      return list
        .map((item) => {
          const valueText = item.valueText
            ? item.valueText + (item.unit || "")
            : "--";
          const note =
            item.kind === "target"
              ? "FOMC"
              : item.volume != null
                ? `量 ${item.volume}`
                : item.tip || "";
          const extras = [
            fedStat("说明", item.tip),
            item.volume != null ? fedStat("成交量", item.volume + " 十亿") : "",
            item.p1 != null ? fedStat("1%", formatFedPct(item.p1)) : "",
            item.p99 != null ? fedStat("99%", formatFedPct(item.p99)) : ""
          ]
            .filter(Boolean)
            .join("");
          return `
            <div class="board-row kr-stock-row metals-row fed-row${
              item.highlight ? " fed-row-highlight" : ""
            }">
              <div class="metals-main fed-overview-main">
                <div class="board-info rank-board-info">
                  <div class="rank-board-text">
                    <div class="board-name-row">
                      <div class="board-name">${item.name}</div>
                    </div>
                    <div class="board-meta">${item.code || ""}</div>
                  </div>
                </div>
                <div class="board-price">${valueText}</div>
                <div class="board-price flat">${item.date || "--"}</div>
                <div class="board-chg flat">${note || "--"}</div>
              </div>
              ${extras ? `<div class="metals-stats">${extras}</div>` : ""}
            </div>`;
        })
        .join("");
    }

    function renderFedTreasuryList(list) {
      return list
        .map((item, i) => {
          const prev = list[i + 1];
          const chg10 =
            item["10Y"] != null && prev?.["10Y"] != null
              ? item["10Y"] - prev["10Y"]
              : null;
          const tone = toneClass(chg10);
          const extras = [
            fedStat("2s10s", formatFedPct(item.spread2s10s)),
            chg10 != null ? fedStat("10Y变动", formatFedSignedBp(chg10)) : ""
          ]
            .filter(Boolean)
            .join("");
          return `
            <div class="board-row kr-stock-row metals-row fed-row">
              <div class="metals-main fed-treasury-main">
                <div class="board-info rank-board-info">
                  <div class="rank-board-text">
                    <div class="board-name-row">
                      <div class="board-name">${item.date || "--"}</div>
                    </div>
                    <div class="board-meta">美国国债</div>
                  </div>
                </div>
                <div class="board-price ${tone}">${formatFedPct(item["2Y"])}</div>
                <div class="board-price ${tone}">${formatFedPct(item["5Y"])}</div>
                <div class="board-price ${tone}">${formatFedPct(item["10Y"])}</div>
                <div class="board-price ${tone}">${formatFedPct(item["30Y"])}</div>
              </div>
              ${extras ? `<div class="metals-stats">${extras}</div>` : ""}
            </div>`;
        })
        .join("");
    }

    function renderFedHistoryList(list) {
      return list
        .map((item) => {
          const extras = [
            item.p1 != null ? fedStat("1%分位", formatFedPct(item.p1)) : "",
            item.p99 != null ? fedStat("99%分位", formatFedPct(item.p99)) : ""
          ]
            .filter(Boolean)
            .join("");
          return `
            <div class="board-row kr-stock-row metals-row fed-row">
              <div class="metals-main fed-history-main">
                <div class="board-info rank-board-info">
                  <div class="rank-board-text">
                    <div class="board-name-row">
                      <div class="board-name">${item.date || "--"}</div>
                    </div>
                    <div class="board-meta">EFFR</div>
                  </div>
                </div>
                <div class="board-price">${formatFedPct(item.value)}</div>
                <div class="board-price flat">${
                  item.targetText ? item.targetText + "%" : "--"
                }</div>
                <div class="board-chg flat">${
                  item.volume != null ? item.volume : "--"
                }</div>
              </div>
              ${extras ? `<div class="metals-stats">${extras}</div>` : ""}
            </div>`;
        })
        .join("");
    }

    function renderFedList(list) {
      const wrap = document.getElementById("fedList");
      if (!wrap) return;
      const kind = fedState.kind || "overview";
      renderFedListHead(kind);
      renderFedHero();
      if (!list.length) {
        wrap.innerHTML = "";
        return;
      }
      if (kind === "treasury") {
        wrap.innerHTML = renderFedTreasuryList(list);
        return;
      }
      if (kind === "history") {
        wrap.innerHTML = renderFedHistoryList(list);
        return;
      }
      wrap.innerHTML = renderFedOverviewList(list);
    }

    async function loadFedKind(kind, { force = false } = {}) {
      const next = FED_KIND_TABS.some((t) => t.id === kind) ? kind : "overview";

      if (!force && fedState.kind === next && fedState.list?.length) {
        document.querySelectorAll("[data-fed-kind]").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.fedKind === next);
        });
        updateFedSub();
        renderFedList(fedState.list);
        setStatus("fedStatus", "");
        return;
      }

      fedState.kind = next;
      document.querySelectorAll("[data-fed-kind]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.fedKind === next);
      });

      const requestId = (loadFedKind._req = (loadFedKind._req || 0) + 1);
      const listEl = document.getElementById("fedList");
      if (listEl) listEl.innerHTML = "";
      const hero = document.getElementById("fedHero");
      if (hero) {
        hero.hidden = true;
        hero.innerHTML = "";
      }
      setStatus("fedStatus", "加载美联储利率…");
      updateFedSub();

      try {
        const result = await loadFedRates(next);
        if (requestId !== loadFedKind._req) return;
        const list = result.list || [];
        fedState.list = list;
        fedState.sub = result.sub || "";
        fedState.targetFrom = result.targetFrom ?? null;
        fedState.targetTo = result.targetTo ?? null;
        fedState.asOf = result.asOf || list[0]?.date || "";
        renderFedList(list);
        updateFedSub();
        setStatus("fedStatus", list.length ? "" : "暂无美联储利率数据");
      } catch (err) {
        if (requestId !== loadFedKind._req) return;
        fedState.list = [];
        if (listEl) listEl.innerHTML = "";
        updateFedSub();
        setStatus(
          "fedStatus",
          err?.message || "美联储利率加载失败，请稍后重试"
        );
      }
    }
