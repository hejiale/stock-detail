    function setFundDetailTab(tab) {
      const next = tab === "holdings" || tab === "history" ? tab : "overview";
      document.querySelectorAll("[data-fund-detail-tab]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.fundDetailTab === next);
      });
      document.querySelectorAll("[data-fund-detail-pane]").forEach((pane) => {
        pane.classList.toggle("active", pane.dataset.fundDetailPane === next);
      });
      if (next === "overview") {
        requestAnimationFrame(() => drawFundDetailChart(openFundDetailModal._chart || []));
      }
    }

    function renderFundDetailPeriods(list) {
      const wrap = document.getElementById("fundDetailPeriods");
      if (!wrap) return;
      if (!list?.length) {
        wrap.innerHTML = '<div class="fund-detail-empty">暂无阶段涨幅</div>';
        return;
      }
      wrap.innerHTML = list
        .map((item) => {
          const tone = toneClass(item.change);
          return `
            <div class="fund-period-card">
              <div class="fund-period-label">${item.title}</div>
              <div class="fund-period-value ${tone}">${
                item.change == null ? "--" : formatPctWithArrow(item.change)
              }</div>
              <div class="fund-period-sub">${
                item.rank ? `同类 ${item.rank}` : item.hs300 == null ? "" : `沪深300 ${formatPct(item.hs300)}`
              }</div>
            </div>`;
        })
        .join("");
    }

    function renderFundDetailBasic(basic) {
      const wrap = document.getElementById("fundDetailBasic");
      if (!wrap) return;
      if (!basic) {
        wrap.innerHTML = "";
        return;
      }
      const rows = [
        ["基金类型", basic.type || "--"],
        ["基金公司", basic.company || "--"],
        ["成立日期", basic.establishDate || "--"],
        ["主题/行业", basic.theme || "--"],
        [
          "基金规模",
          basic.scale == null
            ? "--"
            : `${basic.scale} 亿元${basic.scaleDate ? `（${basic.scaleDate}）` : ""}`
        ],
        ["申购状态", basic.buyStatus || "--"],
        ["赎回状态", basic.redeemStatus || "--"],
        ["业绩比较基准", basic.bench || "--"]
      ];
      wrap.innerHTML = rows
        .map(
          ([k, v]) => `
          <div class="fund-basic-row">
            <div class="fund-basic-k">${k}</div>
            <div class="fund-basic-v">${v}</div>
          </div>`
        )
        .join("");
      if (basic.comment) {
        wrap.insertAdjacentHTML(
          "beforeend",
          `<div class="fund-basic-comment">${basic.comment}</div>`
        );
      }
    }

    function renderFundDetailHoldings(holdings) {
      const wrap = document.getElementById("fundDetailHoldings");
      const asOfEl = document.getElementById("fundDetailHoldAsOf");
      if (asOfEl) asOfEl.textContent = "重仓股披露";
      if (!wrap) return;
      const list = holdings?.list || [];
      if (!list.length) {
        wrap.innerHTML = '<div class="fund-detail-empty">暂无持仓披露</div>';
        return;
      }
      wrap.innerHTML = list
        .map((item) => {
          const dayTone = toneClass(item.dayChange);
          const dayArrow =
            item.dayChange == null || typeof chgArrowHtml !== "function"
              ? ""
              : chgArrowHtml(item.dayChange);
          const dayText =
            item.dayChange == null
              ? "--"
              : `${formatPct(item.dayChange)}${dayArrow}`;

          return `
            <div class="fund-hold-row">
              <div class="fund-hold-info">
                <div class="fund-hold-name">${item.name}</div>
                <div class="fund-hold-meta">${item.rank} · ${item.code}${
                  item.sector ? ` · ${item.sector}` : ""
                }</div>
              </div>
              <div class="fund-hold-day ${dayTone}">${dayText}</div>
            </div>`;
        })
        .join("");
    }

    async function fillFundHoldingDayChanges(holdings, requestId) {
      const list = holdings?.list;
      if (!list?.length) return;
      const quoteHoldings = list.map((item) => ({
        code: item.code,
        name: item.name,
        market: item.market != null ? item.market : undefined
      }));
      try {
        const map = await loadQuotes(quoteHoldings);
        if (requestId != null && requestId !== openFundDetailModal._req) return;
        list.forEach((item) => {
          const q = map[quoteKey(item.code)];
          item.dayChange =
            q?.change == null || Number.isNaN(Number(q.change))
              ? null
              : Number(q.change);
          if (q?.price != null) item.price = q.price;
          if (q?.name) item.name = q.name;
        });
        if (openFundDetailModal._detail?.holdings) {
          openFundDetailModal._detail.holdings.list = list;
        }
        renderFundDetailHoldings({
          asOf: holdings.asOf || "",
          list
        });
      } catch {
        /* 报价失败时涨跌幅显示 -- */
      }
    }

    function renderFundDetailHistory(list) {
      const wrap = document.getElementById("fundDetailHistory");
      if (!wrap) return;
      if (!list?.length) {
        wrap.innerHTML = '<div class="fund-detail-empty">暂无历史净值</div>';
        return;
      }
      wrap.innerHTML = list
        .map((item) => {
          const tone = toneClass(item.dayChange);
          return `
            <div class="fund-nav-row">
              <div>${item.date}</div>
              <div style="text-align:right">${
                item.nav == null ? "--" : Number(item.nav).toFixed(4)
              }</div>
              <div style="text-align:right">${
                item.accNav == null ? "--" : Number(item.accNav).toFixed(4)
              }</div>
              <div class="${tone}" style="text-align:right">${
                item.dayChange == null ? "--" : formatPctWithArrow(item.dayChange)
              }</div>
            </div>`;
        })
        .join("");
    }

    function drawFundDetailChart(points) {
      const canvas = document.getElementById("fundDetailChart");
      const tip = document.getElementById("fundDetailChartTip");
      if (!canvas) return;
      const list = Array.isArray(points) ? points.filter((p) => p?.nav != null) : [];
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth || 320;
      const cssH = canvas.clientHeight || 160;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      if (list.length < 2) {
        if (tip) tip.textContent = list.length ? "净值点过少" : "暂无走势数据";
        return;
      }

      const vals = list.map((p) => Number(p.nav));
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const pad = { t: 12, r: 12, b: 22, l: 12 };
      const w = cssW - pad.l - pad.r;
      const h = cssH - pad.t - pad.b;
      const span = max - min || 1;
      const first = vals[0];
      const last = vals[vals.length - 1];
      const pct = first ? ((last - first) / first) * 100 : 0;
      const up = last >= first;
      const color = up ? "#ef4444" : "#22c55e";

      ctx.strokeStyle = "rgba(148,163,184,0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.l, pad.t + h / 2);
      ctx.lineTo(pad.l + w, pad.t + h / 2);
      ctx.stroke();

      ctx.beginPath();
      list.forEach((p, i) => {
        const x = pad.l + (i / (list.length - 1)) * w;
        const y = pad.t + (1 - (Number(p.nav) - min) / span) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();

      const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + h);
      grad.addColorStop(0, up ? "rgba(239,68,68,0.18)" : "rgba(34,197,94,0.18)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.lineTo(pad.l + w, pad.t + h);
      ctx.lineTo(pad.l, pad.t + h);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      if (tip) {
        const start = list[0].date || "";
        const end = list[list.length - 1].date || "";
        tip.textContent = `${start} ~ ${end} · 区间 ${formatPct(pct)}`;
        tip.className = "fund-nav-chart-tip " + (pct > 0 ? "up" : pct < 0 ? "down" : "flat");
      }
    }

    function syncFundDetailAddWatch(code, name) {
      const btn = document.getElementById("fundDetailAddWatch");
      if (!btn) return;
      const fundCode = String(code || "").trim();
      const labelName = String(name || fundCode || "").trim();
      btn.setAttribute("data-watch-code", fundCode);
      btn.dataset.watchCode = fundCode;
      if (labelName) {
        btn.setAttribute("data-watch-name", labelName);
      }
      const already = !!(
        fundCode &&
        typeof focusFundsState !== "undefined" &&
        focusFundsState.list?.some((item) => item.code === fundCode)
      );
      btn.hidden = !fundCode;
      btn.disabled = false;
      btn.classList.toggle("is-added", already);
      btn.title = already ? "已加入自选" : "加入自选";
      btn.setAttribute(
        "aria-label",
        already
          ? `已加入自选 ${labelName}`
          : `加入自选 ${labelName}`
      );
    }

    function fillFundDetailHeader(basic) {
      const nameEl = document.getElementById("fundDetailName");
      const subEl = document.getElementById("fundDetailSub");
      const navEl = document.getElementById("fundDetailNav");
      const dayEl = document.getElementById("fundDetailDayChg");
      const dayArrowEl = document.getElementById("fundDetailDayChgArrow");
      const metaEl = document.getElementById("fundDetailMeta");
      if (nameEl) nameEl.textContent = basic?.name || basic?.code || "--";
      if (basic?.code || basic?.name) {
        syncFundDetailAddWatch(basic.code, basic.name || basic.code);
      }
      if (subEl) {
        subEl.textContent = basic?.code
          ? `${basic.code}${basic.type ? " · " + basic.type : ""}`
          : "基金详情";
      }
      if (navEl) {
        navEl.textContent =
          basic?.nav == null ? "--" : Number(basic.nav).toFixed(4);
        navEl.className = "price " + toneClass(basic?.dayChange);
      }
      if (dayEl) {
        dayEl.textContent =
          basic?.dayChange == null ? "--" : formatPct(basic.dayChange);
        dayEl.className = "chg " + toneClass(basic?.dayChange);
      }
      if (dayArrowEl) paintChgArrow(dayArrowEl, basic?.dayChange);
      if (metaEl) {
        const parts = [];
        if (basic?.navDate) parts.push(`净值日 ${basic.navDate}`);
        if (basic?.company) parts.push(basic.company);
        if (basic?.scale != null) parts.push(`规模 ${basic.scale} 亿`);
        metaEl.textContent = parts.join(" · ");
      }
    }

    function resetFundDetailModal() {
      fillFundDetailHeader(null);
      syncFundDetailAddWatch("", "");
      renderFundDetailPeriods([]);
      renderFundDetailBasic(null);
      renderFundDetailHoldings({ asOf: "", list: [] });
      renderFundDetailHistory([]);
      openFundDetailModal._chart = [];
      drawFundDetailChart([]);
      setFundDetailTab("overview");
    }

    async function openFundDetailModal(code, presetName) {
      const fundCode = String(code || "").trim();
      if (!fundCode) {
        showToast("缺少基金代码");
        return;
      }

      const requestId = (openFundDetailModal._req =
        (openFundDetailModal._req || 0) + 1);
      resetFundDetailModal();
      if (presetName) {
        const nameEl = document.getElementById("fundDetailName");
        if (nameEl) nameEl.textContent = presetName;
      }
      const subEl = document.getElementById("fundDetailSub");
      if (subEl) subEl.textContent = fundCode;
      syncFundDetailAddWatch(fundCode, presetName || fundCode);
      showModal("fundDetailModal");
      setStatus("fundDetailStatus", "加载基金详情…");

      try {
        const detail = await loadFundDetail(fundCode);
        if (requestId !== openFundDetailModal._req) return;
        openFundDetailModal._detail = detail;
        openFundDetailModal._chart = detail.chart || [];
        fillFundDetailHeader(detail.basic);
        renderFundDetailPeriods(detail.periods || []);
        renderFundDetailBasic(detail.basic);
        renderFundDetailHoldings(detail.holdings || { asOf: "", list: [] });
        renderFundDetailHistory(detail.history || []);
        requestAnimationFrame(() =>
          drawFundDetailChart(openFundDetailModal._chart)
        );
        // 有数据后必须关掉全屏 status，否则会盖住三个 Tab 内容
        setStatus("fundDetailStatus", "");
        if (detail.warnings?.length && typeof showToast === "function") {
          showToast(detail.warnings.join("；"));
        }
        fillFundHoldingDayChanges(
          detail.holdings || { asOf: "", list: [] },
          requestId
        ).catch(() => {});
      } catch (err) {
        if (requestId !== openFundDetailModal._req) return;
        setStatus(
          "fundDetailStatus",
          err?.message || "基金详情加载失败"
        );
      }
    }

    function closeFundDetailModal() {
      openFundDetailModal._req = (openFundDetailModal._req || 0) + 1;
      openFundDetailModal._detail = null;
      openFundDetailModal._chart = [];
      hideModal("fundDetailModal");
      setStatus("fundDetailStatus", "");
    }
