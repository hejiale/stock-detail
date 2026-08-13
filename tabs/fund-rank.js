    const FUND_RANK_PERIOD_TABS = [
      { id: "month", label: "月涨幅" },
      { id: "3m", label: "近3月" },
      { id: "6m", label: "近半年" },
      { id: "1y", label: "近1年" }
    ];

    const fundRankState = {
      period: "month",
      list: [],
      total: 0
    };

    function fundRankPeriodLabel(period) {
      return (
        FUND_RANK_PERIOD_TABS.find((t) => t.id === period)?.label || "月涨幅"
      );
    }

    function fundRankSubText(period, loaded) {
      const tip = fundRankPeriodLabel(period);
      return loaded
        ? `开放式基金 · ${tip}前 ${loaded}`
        : `开放式基金 · ${tip}加载中…`;
    }

    function updateFundRankSub() {
      const subEl = document.getElementById("fundRankSub");
      if (!subEl) return;
      subEl.textContent = fundRankSubText(
        fundRankState.period || "month",
        fundRankState.list?.length || 0
      );
    }

    function buildFundRankPanelElement(isActive) {
      const panel = document.createElement("section");
      panel.className = "panel" + (isActive ? " active" : "");
      panel.dataset.panel = "fundRank";
      const period = fundRankState.period || "month";
      const loaded = fundRankState.list?.length || 0;
      const periodTabs = FUND_RANK_PERIOD_TABS.map(
        (t) => `
          <button
            class="board-tab${t.id === period ? " active" : ""}"
            type="button"
            data-fund-rank="${t.id}"
          >${t.label}</button>`
      ).join("");

      panel.innerHTML = `
          <div class="fund-card kr-rank-card fund-rank-card">
            <div class="fund-meta">
              <div class="fund-meta-text">
                <div class="name">基金涨幅榜</div>
                <div class="sub" id="fundRankSub">${fundRankSubText(period, loaded)}</div>
              </div>
              <div class="fund-meta-actions">
                <button class="btn-sync" type="button" data-fund-rank-refresh title="刷新基金排行" aria-label="刷新基金排行">
                  <img src="assets/pull.png" alt="刷新" />
                </button>
              </div>
            </div>
            <div class="add-stock">
              <div class="add-stock-field">
                <input
                  type="text"
                  class="add-stock-input"
                  data-add-code="fundRank"
                  placeholder="输入基金代码，如 017811"
                  autocomplete="off"
                  spellcheck="false"
                />
                <button class="btn btn-add" type="button" data-add-stock="fundRank" aria-label="添加自选基金" title="添加自选基金">
                  <img src="assets/add_zixuan.png" alt="添加" />
                </button>
              </div>
            </div>
            <div class="board-tabs kr-rank-tabs fund-rank-tabs">
              ${periodTabs}
            </div>
            <div class="board-list-head us-stock-head kr-stock-head fund-rank-head">
              <div>基金</div>
              <div style="text-align:center">日涨幅%</div>
              <div style="text-align:center">净值</div>
              <div style="text-align:center">区间%</div>
            </div>
            <div class="kr-rank-body">
              <div class="us-stock-list kr-stock-list fund-rank-list" id="fundRankList"></div>
              <div class="board-status show" id="fundRankStatus">加载中…</div>
            </div>
          </div>`;
      return panel;
    }

    function renderFundRankList(list) {
      const wrap = document.getElementById("fundRankList");
      if (!wrap) return;
      if (!list.length) {
        wrap.innerHTML = "";
        return;
      }

      wrap.innerHTML = list
        .map((item, i) => {
          const tone = toneClass(item.change);
          const dayTone = toneClass(item.dayChange);
          const chgText =
            item.change == null
              ? "--"
              : formatPct(item.change) + chgArrowHtml(item.change);
          const dayText =
            item.dayChange == null
              ? "--"
              : formatPct(item.dayChange) + chgArrowHtml(item.dayChange);
          const navText =
            item.nav == null ? "--" : Number(item.nav).toFixed(4);
          const safeName = String(item.name || item.code || "").replace(
            /"/g,
            "&quot;"
          );
          return `
            <button class="board-row kr-stock-row fund-rank-row fund-rank-row-btn" type="button" data-fund-detail="${item.code}" data-fund-detail-name="${safeName}" title="查看 ${safeName} 详情">
              <div class="board-info rank-board-info">
                <div class="rank-board-text">
                  <div class="board-name-row">
                    <div class="board-name">${item.name}</div>
                    <svg class="board-name-arrow" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M5.8 2.6 4.6 3.8 8.8 8l-4.2 4.2 1.2 1.2L11.2 8 5.8 2.6z"/>
                    </svg>
                  </div>
                  <div class="board-meta">${i + 1} · ${item.code}${
                    item.date ? ` · ${item.date}` : ""
                  }</div>
                </div>
              </div>
              <div class="board-chg ${dayTone}">${dayText}</div>
              <div class="board-price">${navText}</div>
              <div class="board-chg ${tone}">${chgText}</div>
            </button>`;
        })
        .join("");
    }

    async function loadFundRankPeriod(period, { force = false } = {}) {
      const next =
        FUND_RANK_PERIOD_TABS.some((t) => t.id === period) ? period : "month";

      if (!force && fundRankState.period === next && fundRankState.list?.length) {
        document.querySelectorAll("[data-fund-rank]").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.fundRank === next);
        });
        updateFundRankSub();
        renderFundRankList(fundRankState.list);
        setStatus("fundRankStatus", "");
        return;
      }

      fundRankState.period = next;
      document.querySelectorAll("[data-fund-rank]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.fundRank === next);
      });

      const requestId = (loadFundRankPeriod._req =
        (loadFundRankPeriod._req || 0) + 1);
      const refreshBtn = document.querySelector("[data-fund-rank-refresh]");
      if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.classList.add("loading");
      }

      updateFundRankSub();
      renderFundRankList([]);
      setStatus("fundRankStatus", `加载${fundRankPeriodLabel(next)}前 20…`);

      try {
        const result = await loadOpenFundRank(next, 20);
        if (requestId !== loadFundRankPeriod._req) return;
        fundRankState.list = result.list || [];
        fundRankState.total = result.total || 0;
        updateFundRankSub();
        renderFundRankList(fundRankState.list);
        setStatus(
          "fundRankStatus",
          fundRankState.list.length ? "" : "暂无排行数据"
        );
      } catch (err) {
        if (requestId !== loadFundRankPeriod._req) return;
        fundRankState.list = [];
        fundRankState.total = 0;
        updateFundRankSub();
        renderFundRankList([]);
        setStatus("fundRankStatus", err?.message || "基金排行加载失败");
      } finally {
        if (requestId === loadFundRankPeriod._req && refreshBtn) {
          refreshBtn.disabled = false;
          refreshBtn.classList.remove("loading");
        }
      }
    }
