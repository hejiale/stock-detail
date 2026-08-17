    function renderFundPicker() {
      const picker = document.getElementById("fundPicker");
      if (!picker) return;
      const groupId = getMainGroupId(activeMainTab);
      const group = MAIN_TABS.find((tab) => tab.id === groupId);
      const children = group?.children;
      if (!children?.length || (groupId === "watch" && !isLoggedIn())) {
        picker.innerHTML = "";
        picker.hidden = true;
        picker.removeAttribute("aria-label");
        return;
      }
      picker.hidden = false;
      picker.setAttribute("aria-label", group.name);
      picker.innerHTML = children
        .map((tab) => {
          const icon = tab.icon
            ? `<img class="fund-pick-icon" src="${tab.icon}" alt="" aria-hidden="true" />`
            : "";
          const active = tab.id === activeMainTab;
          return `<button class="fund-pick${active ? " active" : ""}" type="button" data-fund-pick="${tab.id}" role="tab" aria-selected="${active}">${icon}<span>${tab.name}</span></button>`;
        })
        .join("");
    }

    function buildFocusFundsPanelElement(isActive) {
      const panel = document.createElement("section");
      panel.className = "panel" + (isActive ? " active" : "");
      panel.dataset.panel = "funds";
      const loaded = focusFundsState.list?.length || 0;
      panel.innerHTML = `
          <div class="fund-card kr-rank-card watch-rank-card">
            <div class="fund-meta">
              <div class="fund-meta-text">
                <div class="name">自选基金</div>
                <div class="sub" id="focusFundSub">${
                  loaded ? `自选 ${loaded} 只` : "加载中…"
                }</div>
              </div>
              <div class="fund-meta-actions">
                <button class="btn-sync" type="button" data-focus-fund-refresh title="刷新自选基金" aria-label="刷新自选基金">
                  <img src="assets/pull.png" alt="刷新" />
                </button>
              </div>
            </div>
            <div class="board-list-head us-stock-head kr-stock-head watch-fund-head">
              <div>基金</div>
              <div style="text-align:center">净值</div>
              <div style="text-align:center">日涨幅%</div>
            </div>
            <div class="kr-rank-body">
              <div class="us-stock-list kr-stock-list fund-rank-list watch-fund-list" id="focusFundList"></div>
              <div class="board-status show" id="focusFundStatus">加载中…</div>
            </div>
          </div>`;
      return panel;
    }

    function renderFocusFundLoginGate() {
      const wrap = document.getElementById("focusFundList");
      const subEl = document.getElementById("focusFundSub");
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
      setStatus("focusFundStatus", "");
    }

    function renderFocusFundList(list) {
      const wrap = document.getElementById("focusFundList");
      if (!wrap) return;
      if (!list.length) {
        wrap.innerHTML = "";
        return;
      }
      wrap.innerHTML = list
        .map((item) => {
          const tone = item.dayChange == null ? "flat" : toneClass(item.dayChange);
          const chgText =
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
            <div class="board-row kr-stock-row fund-rank-row watch-fund-row">
              <div class="board-info watch-board-info">
                <button
                  class="btn-remove-stock"
                  type="button"
                  data-remove-focus-fund="${item.code}"
                  title="移除自选"
                  aria-label="移除 ${safeName}"
                ><img src="assets/quxiao_zixuan.png" alt="移除" /></button>
                <div class="watch-board-text">
                  <div
                    class="board-name"
                    role="button"
                    tabindex="0"
                    data-fund-detail="${item.code}"
                    data-fund-detail-name="${safeName}"
                    title="查看 ${safeName} 详情"
                  >${item.name || item.code}</div>
                  <div class="board-meta">${codeWithCopyHtml(item.code, item.name)}${
                    item.date ? ` · ${item.date}` : ""
                  }</div>
                </div>
              </div>
              <div class="board-price">${navText}</div>
              <div class="board-chg ${tone}">${chgText}</div>
            </div>`;
        })
        .join("");
    }

    async function loadFocusFunds({ force = false } = {}) {
      if (!isLoggedIn()) {
        focusFundsState.list = [];
        renderFocusFundLoginGate();
        return;
      }

      if (!force && focusFundsState.list?.length) {
        renderFocusFundList(focusFundsState.list);
        const subEl = document.getElementById("focusFundSub");
        if (subEl) subEl.textContent = `自选 ${focusFundsState.list.length} 只`;
        setStatus("focusFundStatus", "");
        return;
      }

      const requestId = (loadFocusFunds._req = (loadFocusFunds._req || 0) + 1);
      const listEl = document.getElementById("focusFundList");
      const subEl = document.getElementById("focusFundSub");
      const refreshBtn = document.querySelector("[data-focus-fund-refresh]");
      if (listEl) listEl.innerHTML = "";
      setStatus("focusFundStatus", "加载自选基金…");
      if (subEl) subEl.textContent = "加载中…";
      if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.classList.add("loading");
      }

      try {
        const rows = await listFocusFunds();
        if (requestId !== loadFocusFunds._req) return;
        const quotes = rows.length
          ? await loadFundQuotes(rows.map((row) => row.code))
          : {};
        if (requestId !== loadFocusFunds._req) return;
        const list = rows.map((row) => {
          const q = quotes[row.code] || {};
          return {
            code: row.code,
            name: q.name || row.code,
            nav: q.nav != null ? q.nav : null,
            dayChange: q.dayChange != null ? q.dayChange : null,
            date: q.date || "",
            createdAt: row.createdAt
          };
        });
        focusFundsState.list = list;
        renderFocusFundList(list);
        if (subEl) subEl.textContent = `自选 ${list.length} 只`;
        setStatus(
          "focusFundStatus",
          list.length ? "" : "暂无自选基金，可在基金页搜索添加"
        );
      } catch (err) {
        if (requestId !== loadFocusFunds._req) return;
        focusFundsState.list = [];
        if (listEl) listEl.innerHTML = "";
        if (subEl) subEl.textContent = "加载失败";
        setStatus(
          "focusFundStatus",
          err?.message || "自选基金加载失败，请稍后重试"
        );
      } finally {
        if (requestId === loadFocusFunds._req && refreshBtn) {
          refreshBtn.disabled = false;
          refreshBtn.classList.remove("loading");
        }
      }
    }
