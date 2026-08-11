    function resetPeriodValues() {
      document.querySelectorAll("[data-period-value]").forEach((el) => {
        el.textContent = "--";
        el.className = "value";
      });
      document.querySelectorAll(".chart-period").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.chartRange === "day");
      });
    }

    function renderPeriodReturns(returns) {
      Object.entries(returns || {}).forEach(([key, value]) => {
        const el = document.querySelector(`[data-period-value="${key}"]`);
        if (!el) return;
        if (value == null || Number.isNaN(value)) {
          el.textContent = "--";
          el.className = "value";
          return;
        }
        el.textContent = formatPct(value);
        el.className = "value " + toneClass(value);
      });
    }

    function buildRangeSeries(range, state) {
      if (range === "day") {
        if (!state.trend) return null;
        return {
          title: "当日分时",
          baseline: state.trend.preClose,
          baselineLabel: "昨收",
          points: state.trend.points.map((p) => ({
            label: p.time,
            price: p.price,
            avg: p.avg,
            volume: p.volume
          })),
          showAvg: true
        };
      }

      if (!state.history?.klines?.length) return null;
      const sliced = sliceKlinesForRange(state.history.klines, range);
      if (sliced.length < 2) return null;

      const labels = {
        "1m": "近1月",
        "3m": "近3月",
        "6m": "近半年",
        ytd: "今年以来",
        "1y": "近1年"
      };

      return {
        title: labels[range] || "走势",
        baseline: sliced[0].close,
        baselineLabel: "起点",
        points: sliced.map((k) => ({
          label: k.date.slice(5),
          price: k.close,
          avg: null,
          volume: k.volume
        })),
        showAvg: false
      };
    }

    function drawIntradayChart(canvas, series) {
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth || 320;
      const cssH = canvas.clientHeight || 280;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);

      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const points = series.points;
      if (!points?.length) return;

      const pad = { top: 16, right: 52, bottom: 56, left: 52 };
      const volH = 48;
      const plotW = cssW - pad.left - pad.right;
      const plotH = cssH - pad.top - pad.bottom - volH - 10;
      const volTop = pad.top + plotH + 10;

      const prices = points.map((p) => p.price);
      let minP = Math.min(...prices);
      let maxP = Math.max(...prices);
      if (series.baseline != null) {
        minP = Math.min(minP, series.baseline);
        maxP = Math.max(maxP, series.baseline);
      }
      const span = maxP - minP || Math.abs(maxP) * 0.01 || 1;
      minP -= span * 0.08;
      maxP += span * 0.08;

      const maxVol = Math.max(...points.map((p) => p.volume || 0), 1);
      const last = points[points.length - 1];
      const base =
        series.baseline != null && series.baseline !== 0
          ? series.baseline
          : null;
      const lineColor =
        base == null
          ? "#1677ff"
          : last.price >= base
            ? "#e64545"
            : "#12a150";

      function xAt(i) {
        if (points.length === 1) return pad.left + plotW / 2;
        return pad.left + (i / (points.length - 1)) * plotW;
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

      if (base != null) {
        const y = yAt(base);
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "#94a3b8";
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + plotW, y);
        ctx.stroke();
        ctx.restore();
      }

      ctx.beginPath();
      points.forEach((p, i) => {
        const x = xAt(i);
        const y = yAt(p.price);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      const lastX = xAt(points.length - 1);
      ctx.lineTo(lastX, pad.top + plotH);
      ctx.lineTo(xAt(0), pad.top + plotH);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
      grad.addColorStop(0, lineColor + "33");
      grad.addColorStop(1, lineColor + "00");
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      points.forEach((p, i) => {
        const x = xAt(i);
        const y = yAt(p.price);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = "round";
      ctx.stroke();

      if (series.showAvg) {
        let started = false;
        ctx.beginPath();
        points.forEach((p, i) => {
          if (p.avg == null) return;
          const x = xAt(i);
          const y = yAt(p.avg);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        });
        if (started) {
          ctx.strokeStyle = "#f59e0b";
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }

      const barW = Math.max(1, plotW / points.length - 0.5);
      points.forEach((p, i) => {
        const h = ((p.volume || 0) / maxVol) * volH;
        const x = xAt(i) - barW / 2;
        const y = volTop + volH - h;
        const up =
          i === 0
            ? base == null || p.price >= base
            : p.price >= points[i - 1].price;
        ctx.fillStyle = up ? "rgba(230, 69, 69, 0.35)" : "rgba(18, 161, 80, 0.35)";
        ctx.fillRect(x, y, barW, h);
      });

      ctx.font = '11px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textBaseline = "middle";
      for (let i = 0; i <= 4; i++) {
        const price = maxP - ((maxP - minP) * i) / 4;
        const y = pad.top + (plotH * i) / 4;
        ctx.fillStyle = "#8a8f98";
        ctx.textAlign = "right";
        ctx.fillText(formatPrice(price), pad.left - 8, y);

        if (base != null) {
          const pct = ((price - base) / base) * 100;
          ctx.textAlign = "left";
          ctx.fillStyle =
            pct > 0.005 ? "#e64545" : pct < -0.005 ? "#12a150" : "#8a8f98";
          ctx.fillText(formatPct(pct), pad.left + plotW + 8, y);
        }
      }

      ctx.fillStyle = "#8a8f98";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const timeIdx = [0, Math.floor((points.length - 1) / 2), points.length - 1];
      timeIdx.forEach((i) => {
        ctx.fillText(points[i].label, xAt(i), cssH - 18);
      });

      ctx.textAlign = "left";
      ctx.fillText("成交量", pad.left, volTop - 2);
    }

    function updateChartMeta(series, state) {
      const last = series.points[series.points.length - 1];
      const base = series.baseline;
      const chg = base ? ((last.price - base) / base) * 100 : null;
      const tone = chg == null ? "flat" : toneClass(chg);

      const priceEl = document.getElementById("chartModalPrice");
      const chgEl = document.getElementById("chartModalChg");
      priceEl.textContent = formatPrice(last.price);
      priceEl.className = "price " + tone;

      if (chg == null) {
        chgEl.textContent = "--";
        chgEl.className = "chg flat";
      } else {
        chgEl.textContent = formatPct(chg);
        chgEl.className = "chg " + tone;
      }

      const name = state.trend?.name || state.history?.name || "";
      document.getElementById("chartModalName").textContent = name || "--";
      document.getElementById("chartModalSub").textContent =
        `${series.title} · ${series.baselineLabel || "基准"} ${formatPrice(base)}`;
    }

    function renderActiveChart() {
      const state = openChartModal._state;
      if (!state) return;
      const series = buildRangeSeries(state.range, state);
      const canvas = document.getElementById("chartCanvas");
      if (!series) {
        setStatus("chartStatus", state.range === "day" ? "暂无当日分时数据" : "暂无该区间行情");
        return;
      }
      openChartModal._lastSeries = series;
      setStatus("chartStatus", "");
      updateChartMeta(series, state);
      drawIntradayChart(canvas, series);
    }

    function setChartRange(range) {
      const state = openChartModal._state;
      if (!state) return;
      state.range = range;
      document.querySelectorAll(".chart-period").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.chartRange === range);
      });
      renderActiveChart();
    }

    let chartRequestId = 0;

    function resolveChartHolding(fundId, index) {
      if (fundId === "hkStocks" && typeof getHkRankHolding === "function") {
        return getHkRankHolding(index);
      }
      if (fundId === "krStocks" && typeof getKrRankHolding === "function") {
        return getKrRankHolding(index);
      }
      if (fundId === "watchStocks" && typeof getWatchHolding === "function") {
        return getWatchHolding(index);
      }
      return window.FUND_HOLDINGS[fundId]?.holdings?.[index] || null;
    }

    function updateChartWatchBtn(fundId) {
      const btn = document.getElementById("chartWatchBtn");
      if (!btn) return;
      const canAdd = ADDABLE_FUNDS.has(fundId);
      btn.hidden = !canAdd;
      btn.disabled = false;
      btn.classList.remove("is-added");
      const label = btn.querySelector("span");
      if (label) label.textContent = "加入自选";
    }

    async function openChartModal(fundId, index) {
      const holding = resolveChartHolding(fundId, index);
      if (!holding) return;

      const canvas = document.getElementById("chartCanvas");
      const reqId = ++chartRequestId;

      document.getElementById("chartModalName").textContent =
        holding.name;
      document.getElementById("chartModalSub").textContent = "加载行情中…";
      document.getElementById("chartModalPrice").textContent = "--";
      document.getElementById("chartModalPrice").className = "price flat";
      document.getElementById("chartModalChg").textContent = "--";
      document.getElementById("chartModalChg").className = "chg flat";
      resetPeriodValues();
      canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);

      openChartModal._state = {
        range: "day",
        trend: null,
        history: null,
        returns: null,
        holding,
        fundId
      };
      openChartModal._lastSeries = null;
      updateChartWatchBtn(fundId);

      showModal("chartModal");
      setStatus("chartStatus", "加载分时与区间涨跌幅…");

      const [trendResult, historyResult] = await Promise.allSettled([
        loadIntradayTrends(holding),
        loadDailyKlines(holding)
      ]);

      if (reqId !== chartRequestId) return;

      const state = {
        range: "day",
        trend: trendResult.status === "fulfilled" ? trendResult.value : null,
        history: historyResult.status === "fulfilled" ? historyResult.value : null,
        returns: null,
        holding,
        fundId
      };

      if (state.history) {
        state.returns = calcPeriodReturns(state.history.klines);
      } else {
        state.returns = { day: null, "1m": null, "3m": null, "6m": null, ytd: null, "1y": null };
      }

      if (state.trend?.preClose != null && state.trend.points?.length) {
        const last = state.trend.points[state.trend.points.length - 1];
        state.returns.day =
          Math.round(((last.price - state.trend.preClose) / state.trend.preClose) * 10000) / 100;
      }
      renderPeriodReturns(state.returns);

      openChartModal._state = state;

      if (!state.trend && !state.history) {
        openChartModal._lastSeries = null;
        setStatus("chartStatus", "行情加载失败，请稍后重试");
        return;
      }

      if (!state.trend && state.history) {
        state.range = "1m";
        document.querySelectorAll(".chart-period").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.chartRange === "1m");
        });
      }

      renderActiveChart();
    }

    function closeChartModal() {
      chartRequestId += 1;
      openChartModal._state = null;
      openChartModal._lastSeries = null;
      if (document.getElementById("profileModal")?.classList.contains("show")) {
        closeProfileModal();
      }
      hideModal("chartModal");
      setStatus("chartStatus", "");
      resetPeriodValues();
    }

