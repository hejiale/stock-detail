    const cryptoState = {
      list: [],
      sub: "主流币种 · USDT 计价"
    };

    function cryptoSubText(loaded, sub) {
      if (loaded) {
        return sub ? `${sub} · ${loaded} 种` : `已加载 ${loaded} 种`;
      }
      return sub || "加载中…";
    }

    function updateCryptoSub() {
      const subEl = document.getElementById("cryptoSub");
      if (!subEl) return;
      subEl.textContent = cryptoSubText(
        cryptoState.list?.length || 0,
        cryptoState.sub
      );
    }

    function buildCryptoPanelElement(isActive) {
      const panel = document.createElement("section");
      panel.className = "panel" + (isActive ? " active" : "");
      panel.dataset.panel = "crypto";
      const loaded = cryptoState.list?.length || 0;

      panel.innerHTML = `
          <div class="fund-card kr-rank-card metals-card">
            <div class="fund-meta">
              <div class="fund-meta-text">
                <div class="name">虚拟币行情</div>
                <div class="sub" id="cryptoSub">${cryptoSubText(
                  loaded,
                  cryptoState.sub
                )}</div>
              </div>
              <div class="fund-meta-actions">
                <button class="btn-sync" type="button" data-crypto-refresh title="刷新虚拟币行情" aria-label="刷新虚拟币行情">
                  <img src="assets/pull.png" alt="刷新" />
                </button>
              </div>
            </div>
            <div class="board-list-head us-stock-head kr-stock-head metals-list-head">
              <div>币种</div>
              <div style="text-align:center">最新价</div>
              <div style="text-align:center">涨跌额</div>
              <div style="text-align:center">涨跌幅%</div>
            </div>
            <div class="kr-rank-body">
              <div class="us-stock-list kr-stock-list metals-list" id="cryptoList"></div>
              <div class="board-status show" id="cryptoStatus">加载中…</div>
            </div>
          </div>`;
      return panel;
    }

    function cryptoStat(label, value) {
      if (!value || value === "--") return "";
      return `<span><em>${label}</em>${value}</span>`;
    }

    function renderCryptoList(list) {
      const wrap = document.getElementById("cryptoList");
      if (!wrap) return;
      if (!list.length) {
        wrap.innerHTML = "";
        return;
      }

      wrap.innerHTML = list
        .map((item) => {
          const tone = toneClass(item.change);
          const priceText = "$" + formatCryptoPrice(item.price);
          const amtText = formatCryptoSigned(item.changeAmt);
          const chgText =
            item.change == null
              ? "--"
              : formatPct(item.change) + chgArrowHtml(item.change);
          const safeName = String(item.name || item.code || "").replace(
            /"/g,
            "&quot;"
          );
          const extra = [
            cryptoStat("24h额", formatMarketCap(item.amount)),
            cryptoStat("市值", formatMarketCap(item.marketCap))
          ]
            .filter(Boolean)
            .join("");
          return `
            <button
              class="board-row kr-stock-row metals-row metals-row-btn"
              type="button"
              data-crypto-code="${item.code}"
              title="查看 ${safeName} 详情"
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
              ${extra ? `<div class="metals-stats">${extra}</div>` : ""}
            </button>`;
        })
        .join("");
    }

    async function loadCryptoList({ force = false } = {}) {
      if (!force && cryptoState.list?.length) {
        renderCryptoList(cryptoState.list);
        updateCryptoSub();
        setStatus("cryptoStatus", "");
        return;
      }

      const requestId = (loadCryptoList._req = (loadCryptoList._req || 0) + 1);
      const listEl = document.getElementById("cryptoList");
      if (listEl) listEl.innerHTML = "";
      setStatus("cryptoStatus", "加载虚拟币行情…");
      updateCryptoSub();

      try {
        const result = await loadCryptoQuotes();
        if (requestId !== loadCryptoList._req) return;
        const list = result.list || [];
        cryptoState.list = list;
        cryptoState.sub = result.sub || "";
        renderCryptoList(list);
        updateCryptoSub();
        setStatus("cryptoStatus", list.length ? "" : "暂无虚拟币行情");
      } catch (err) {
        if (requestId !== loadCryptoList._req) return;
        cryptoState.list = [];
        if (listEl) listEl.innerHTML = "";
        updateCryptoSub();
        setStatus(
          "cryptoStatus",
          err?.message || "虚拟币行情加载失败，请稍后重试"
        );
      }
    }

    function renderCryptoDetailPeriods(list, activeRange) {
      const wrap = document.getElementById("cryptoDetailPeriods");
      if (!wrap) return;
      if (!list?.length) {
        wrap.innerHTML = '<div class="fund-detail-empty">暂无阶段涨幅</div>';
        return;
      }
      const current = activeRange || openCryptoDetailModal._range || "day";
      wrap.innerHTML = list
        .map((item) => {
          const tone = toneClass(item.change);
          const active = item.key === current ? " active" : "";
          return `
            <button
              class="fund-period-card${active}"
              type="button"
              data-crypto-range="${item.key}"
            >
              <div class="fund-period-label">${item.title}</div>
              <div class="fund-period-value ${tone}">${
                item.change == null ? "--" : formatPctWithArrow(item.change)
              }</div>
            </button>`;
        })
        .join("");
    }

    function renderCryptoDetailBasic(quote) {
      const wrap = document.getElementById("cryptoDetailBasic");
      if (!wrap) return;
      if (!quote) {
        wrap.innerHTML = "";
        return;
      }
      const rows = [
        ["交易对", quote.symbol || `${quote.code}USDT`],
        ["英文名", quote.nameEn || "--"],
        ["今开", quote.open == null ? "--" : "$" + formatCryptoPrice(quote.open)],
        ["24h最高", quote.high == null ? "--" : "$" + formatCryptoPrice(quote.high)],
        ["24h最低", quote.low == null ? "--" : "$" + formatCryptoPrice(quote.low)],
        ["昨收", quote.preClose == null ? "--" : "$" + formatCryptoPrice(quote.preClose)],
        ["近1年最高", quote.yearHigh == null ? "--" : "$" + formatCryptoPrice(quote.yearHigh)],
        ["近1年最低", quote.yearLow == null ? "--" : "$" + formatCryptoPrice(quote.yearLow)],
        ["24h成交量", quote.volume == null ? "--" : formatVolume(quote.volume)],
        ["24h成交额", quote.amount == null ? "--" : formatMarketCap(quote.amount) + " USDT"],
        ["估算市值", quote.marketCap == null ? "--" : formatMarketCap(quote.marketCap) + " USD"],
        ["流通量", quote.circulating == null ? "--" : formatMarketCap(quote.circulating)],
        ["最大供应", quote.maxSupply == null ? "无上限" : formatMarketCap(quote.maxSupply)],
        ["24h成交笔数", quote.trades == null ? "--" : formatVolume(quote.trades)]
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
      if (quote.desc) {
        wrap.insertAdjacentHTML(
          "beforeend",
          `<div class="fund-basic-comment">${quote.desc}。市值按近似流通量估算，价格为币安 USDT 现货。</div>`
        );
      }
    }

    function fillCryptoDetailHeader(quote) {
      const nameEl = document.getElementById("cryptoDetailName");
      const subEl = document.getElementById("cryptoDetailSub");
      const priceEl = document.getElementById("cryptoDetailPrice");
      const dayEl = document.getElementById("cryptoDetailDayChg");
      const dayArrowEl = document.getElementById("cryptoDetailDayChgArrow");
      const metaEl = document.getElementById("cryptoDetailMeta");
      if (nameEl) nameEl.textContent = quote?.name || quote?.code || "--";
      if (subEl) {
        if (quote?.code) {
          subEl.innerHTML = `${codeWithCopyHtml(quote.code, quote.name)}${
            quote.symbol ? ` · ${escapeAttr(quote.symbol)}` : ""
          } · USDT`;
        } else {
          subEl.textContent = "虚拟币详情";
        }
      }
      if (priceEl) {
        priceEl.textContent =
          quote?.price == null ? "--" : "$" + formatCryptoPrice(quote.price);
        priceEl.className = "price " + toneClass(quote?.change);
      }
      if (dayEl) {
        dayEl.textContent =
          quote?.change == null ? "--" : formatPct(quote.change);
        dayEl.className = "chg " + toneClass(quote?.change);
      }
      if (dayArrowEl) paintChgArrow(dayArrowEl, quote?.change);
      if (metaEl) {
        const parts = [];
        if (quote?.changeAmt != null) {
          parts.push("涨跌额 " + formatCryptoSigned(quote.changeAmt));
        }
        if (quote?.marketCap != null) {
          parts.push("市值 " + formatMarketCap(quote.marketCap));
        }
        metaEl.textContent = parts.join(" · ");
      }
    }

    function cryptoRangeTitle(range) {
      return (
        {
          day: "近24小时",
          "1w": "近1周",
          "1m": "近1月",
          "3m": "近3月",
          ytd: "今年以来",
          "1y": "近1年"
        }[range] || "价格走势"
      );
    }

    function sliceCryptoDailyByDays(klines, days) {
      if (!klines?.length) return [];
      if (!days) return klines.slice();
      const last = klines[klines.length - 1];
      const end = String(last.date || "").slice(0, 10);
      if (!end) return klines.slice(-days);
      const parts = end.split("-").map(Number);
      const targetDate = new Date(parts[0], parts[1] - 1, parts[2]);
      targetDate.setDate(targetDate.getDate() - days);
      const y = targetDate.getFullYear();
      const m = String(targetDate.getMonth() + 1).padStart(2, "0");
      const d = String(targetDate.getDate()).padStart(2, "0");
      const target = `${y}-${m}-${d}`;
      let startIdx = 0;
      for (let i = 0; i < klines.length; i++) {
        if (klines[i].date <= target) startIdx = i;
        else break;
      }
      return klines.slice(startIdx);
    }

    function mapCryptoChartPoint(k, hourly) {
      return {
        date: k.date,
        time: k.time || "",
        nav: k.close != null ? k.close : k.nav,
        volume: k.volume || 0,
        label: hourly
          ? k.time || k.label || ""
          : (k.date || "").slice(5) || k.label || ""
      };
    }

    function sliceCryptoChartPoints(detail, range) {
      if (!detail) return [];
      const hours = detail.hours || [];
      if (range === "day" && hours.length) {
        return hours.slice(-24).map((k) => mapCryptoChartPoint(k, true));
      }
      if (range === "1w" && hours.length >= 12) {
        return hours.slice(-168).map((k) =>
          mapCryptoChartPoint(
            {
              ...k,
              label: (k.date || "").slice(5)
            },
            false
          )
        );
      }
      const klines = detail.klines || [];
      let sliced = [];
      if (range === "1w") {
        sliced = sliceCryptoDailyByDays(klines, 7);
      } else if (typeof sliceKlinesForRange === "function" && range !== "day") {
        sliced = sliceKlinesForRange(klines, range);
      } else {
        sliced = sliceCryptoDailyByDays(klines, 1);
      }
      return sliced.map((k) => mapCryptoChartPoint(k, false));
    }

    function cryptoChartAxisLabel(point, range) {
      if (!point) return "";
      if (range === "day") return point.time || point.label || "";
      return point.label || (point.date || "").slice(5);
    }

    function getCryptoChartMetrics(cssW, cssH) {
      const volH = 36;
      const volGap = 6;
      const pad = { top: 14, right: 46, bottom: 22, left: 58 };
      const plotW = Math.max(40, cssW - pad.left - pad.right);
      const plotH = Math.max(40, cssH - pad.top - pad.bottom - volH - volGap);
      const volTop = pad.top + plotH + volGap;
      const timeY = volTop + volH + 4;
      return { pad, plotW, plotH, volH, volTop, timeY };
    }

    function bindCryptoChartPointer(canvas) {
      if (!canvas || canvas._cryptoBound) return;
      canvas._cryptoBound = true;
      const pick = (e) => {
        const points = openCryptoDetailModal._chart;
        if (!points?.length) return;
        const rect = canvas.getBoundingClientRect();
        const src = e.touches ? e.touches[0] : e;
        if (!src) return;
        const { pad, plotW } = getCryptoChartMetrics(rect.width, rect.height);
        const x = src.clientX - rect.left - pad.left;
        const ratio = plotW ? x / plotW : 0;
        const index = Math.max(
          0,
          Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))
        );
        drawCryptoDetailChart(points, openCryptoDetailModal._range, index);
      };
      canvas.addEventListener("pointerdown", pick);
      canvas.addEventListener("pointermove", (e) => {
        if (e.buttons || e.pointerType === "touch") pick(e);
        else pick(e);
      });
      canvas.addEventListener("pointerleave", () => {
        drawCryptoDetailChart(
          openCryptoDetailModal._chart || [],
          openCryptoDetailModal._range,
          null
        );
      });
    }

    function drawCryptoDetailChart(points, range, activeIndex = null) {
      const canvas = document.getElementById("cryptoDetailChart");
      const tip = document.getElementById("cryptoDetailChartTip");
      const cross = document.getElementById("cryptoDetailCrosshair");
      if (!canvas) return;
      const list = Array.isArray(points)
        ? points.filter((p) => p?.nav != null)
        : [];
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      bindCryptoChartPointer(canvas);

      const currentRange = range || openCryptoDetailModal._range || "day";
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth || 320;
      const cssH = canvas.clientHeight || 240;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      if (list.length < 2) {
        if (tip) tip.textContent = list.length ? "行情点过少" : "暂无走势数据";
        if (cross) cross.hidden = true;
        return;
      }

      const { pad, plotW, plotH, volH, volTop, timeY } = getCryptoChartMetrics(
        cssW,
        cssH
      );
      const vals = list.map((p) => Number(p.nav));
      let minP = Math.min(...vals);
      let maxP = Math.max(...vals);
      const first = vals[0];
      const last = vals[vals.length - 1];
      const span = maxP - minP || Math.abs(maxP) * 0.01 || 1;
      minP -= span * 0.08;
      maxP += span * 0.08;
      const pct = first ? ((last - first) / first) * 100 : 0;
      const up = last >= first;
      const color = up ? "#e64545" : "#12a150";
      const maxVol = Math.max(...list.map((p) => p.volume || 0), 1);

      function xAt(i) {
        if (list.length === 1) return pad.left + plotW / 2;
        return pad.left + (i / (list.length - 1)) * plotW;
      }
      function yAt(price) {
        return pad.top + ((maxP - price) / (maxP - minP)) * plotH;
      }

      ctx.strokeStyle = "#edf0f5";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = pad.top + (plotH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + plotW, y);
        ctx.stroke();
      }

      const baseY = yAt(first);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "#94a3b8";
      ctx.beginPath();
      ctx.moveTo(pad.left, baseY);
      ctx.lineTo(pad.left + plotW, baseY);
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      list.forEach((p, i) => {
        const x = xAt(i);
        const y = yAt(Number(p.nav));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.lineTo(xAt(list.length - 1), pad.top + plotH);
      ctx.lineTo(xAt(0), pad.top + plotH);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
      grad.addColorStop(0, up ? "rgba(230,69,69,0.20)" : "rgba(18,161,80,0.20)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      list.forEach((p, i) => {
        const x = xAt(i);
        const y = yAt(Number(p.nav));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = "round";
      ctx.stroke();

      const barW = Math.max(1, plotW / list.length - 0.4);
      list.forEach((p, i) => {
        const h = ((p.volume || 0) / maxVol) * volH;
        const x = xAt(i) - barW / 2;
        const y = volTop + volH - h;
        const barUp = i === 0 ? up : Number(p.nav) >= Number(list[i - 1].nav);
        ctx.fillStyle = barUp
          ? "rgba(230, 69, 69, 0.32)"
          : "rgba(18, 161, 80, 0.32)";
        ctx.fillRect(x, y, barW, h);
      });

      ctx.font = '11px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textBaseline = "middle";
      for (let i = 0; i <= 4; i++) {
        const price = maxP - ((maxP - minP) * i) / 4;
        const y = pad.top + (plotH * i) / 4;
        ctx.fillStyle = "#8a8f98";
        ctx.textAlign = "right";
        ctx.fillText("$" + formatCryptoPrice(price), pad.left - 6, y);
        const axisPct = first ? ((price - first) / first) * 100 : 0;
        ctx.textAlign = "left";
        ctx.fillStyle =
          axisPct > 0.005 ? "#e64545" : axisPct < -0.005 ? "#12a150" : "#8a8f98";
        ctx.fillText(formatPct(axisPct), pad.left + plotW + 6, y);
      }

      ctx.fillStyle = "#8a8f98";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const timeIdx = [0, Math.floor((list.length - 1) / 2), list.length - 1];
      timeIdx.forEach((i) => {
        ctx.fillText(cryptoChartAxisLabel(list[i], currentRange), xAt(i), timeY);
      });

      if (tip) {
        const start = cryptoChartAxisLabel(list[0], currentRange);
        const end = cryptoChartAxisLabel(list[list.length - 1], currentRange);
        tip.textContent = `${cryptoRangeTitle(currentRange)} · ${start} ~ ${end} · ${formatPct(pct)}`;
        tip.className =
          "fund-detail-section-sub " +
          (pct > 0 ? "up" : pct < 0 ? "down" : "flat");
      }

      const safeIndex =
        activeIndex == null || activeIndex < 0 || activeIndex >= list.length
          ? null
          : activeIndex;
      if (safeIndex == null) {
        if (cross) cross.hidden = true;
        return;
      }

      const active = list[safeIndex];
      const ax = xAt(safeIndex);
      const ay = yAt(Number(active.nav));
      ctx.strokeStyle = "rgba(15,23,42,0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax, pad.top);
      ctx.lineTo(ax, pad.top + plotH);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(ax, ay, 3.5, 0, Math.PI * 2);
      ctx.fill();

      if (cross) {
        const activePct = first
          ? ((Number(active.nav) - first) / first) * 100
          : 0;
        const timeText =
          currentRange === "day"
            ? `${active.date || ""} ${active.time || ""}`.trim()
            : active.date || active.label || "";
        const timeEl = cross.querySelector(".t-time");
        const priceEl = cross.querySelector(".t-price");
        const pctEl = cross.querySelector(".t-pct");
        if (timeEl) timeEl.textContent = timeText;
        if (priceEl) priceEl.textContent = "$" + formatCryptoPrice(active.nav);
        if (pctEl) {
          pctEl.textContent = formatPct(activePct);
          pctEl.className = "t-pct " + toneClass(activePct);
        }
        cross.hidden = false;
      }
    }

    function setCryptoChartRange(range) {
      const next = ["day", "1w", "1m", "3m", "ytd", "1y"].includes(range)
        ? range
        : "day";
      openCryptoDetailModal._range = next;
      document.querySelectorAll("[data-crypto-range]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.cryptoRange === next);
      });
      const points = sliceCryptoChartPoints(openCryptoDetailModal._detail, next);
      openCryptoDetailModal._chart = points;
      requestAnimationFrame(() => drawCryptoDetailChart(points, next));
    }

    function resetCryptoDetailModal() {
      fillCryptoDetailHeader(null);
      renderCryptoDetailPeriods([]);
      renderCryptoDetailBasic(null);
      openCryptoDetailModal._chart = [];
      openCryptoDetailModal._range = "day";
      const cross = document.getElementById("cryptoDetailCrosshair");
      if (cross) cross.hidden = true;
      drawCryptoDetailChart([]);
    }

    async function openCryptoDetailModal(code, presetName) {
      const coinCode = String(code || "").trim().toUpperCase();
      if (!coinCode) {
        showToast("缺少虚拟币代码");
        return;
      }

      const requestId = (openCryptoDetailModal._req =
        (openCryptoDetailModal._req || 0) + 1);
      resetCryptoDetailModal();
      const preset = cryptoState.list?.find((item) => item.code === coinCode);
      fillCryptoDetailHeader(
        preset || { name: presetName || coinCode, code: coinCode }
      );
      showModal("cryptoDetailModal");
      setStatus("cryptoDetailStatus", "加载虚拟币详情…");

      try {
        const detail = await loadCryptoDetail(coinCode);
        if (requestId !== openCryptoDetailModal._req) return;
        openCryptoDetailModal._detail = detail;
        fillCryptoDetailHeader(detail.quote);
        renderCryptoDetailPeriods(detail.periods || [], "day");
        renderCryptoDetailBasic(detail.quote);
        setCryptoChartRange("day");
        setStatus("cryptoDetailStatus", "");
      } catch (err) {
        if (requestId !== openCryptoDetailModal._req) return;
        setStatus(
          "cryptoDetailStatus",
          err?.message || "虚拟币详情加载失败"
        );
      }
    }

    function closeCryptoDetailModal() {
      openCryptoDetailModal._req = (openCryptoDetailModal._req || 0) + 1;
      openCryptoDetailModal._detail = null;
      openCryptoDetailModal._chart = [];
      openCryptoDetailModal._range = "day";
      hideModal("cryptoDetailModal");
      setStatus("cryptoDetailStatus", "");
    }
