    function resetPeriodValues() {
      document.querySelectorAll("[data-period-value]").forEach((el) => {
        el.textContent = "--";
        el.className = "value";
      });
      document.querySelectorAll(".chart-period").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.chartRange === "day");
      });
    }

    function resetChartQuoteUi() {
      const priceEl = document.getElementById("chartModalPrice");
      const chgAmtEl = document.getElementById("chartModalChgAmt");
      const chgEl = document.getElementById("chartModalChg");
      const arrowEl = document.getElementById("chartModalChgArrow");
      const gridEl = document.getElementById("chartQuoteGrid");
      if (priceEl) {
        priceEl.textContent = "--";
        priceEl.className = "price flat";
      }
      if (chgAmtEl) {
        chgAmtEl.textContent = "--";
        chgAmtEl.className = "chg-amt flat";
      }
      if (chgEl) {
        chgEl.textContent = "--";
        chgEl.className = "chg flat";
      }
      if (arrowEl) arrowEl.innerHTML = "";
      if (gridEl) {
        gridEl.innerHTML = "";
        gridEl.hidden = true;
      }
    }

    function quoteToneVsBase(value, base) {
      if (value == null || base == null || Number.isNaN(value) || Number.isNaN(base)) {
        return "flat";
      }
      if (value > base) return "up";
      if (value < base) return "down";
      return "flat";
    }

    function formatQuoteRatio(n, digits = 2) {
      if (n == null || Number.isNaN(n)) return "--";
      return n.toFixed(digits);
    }

    function formatQuotePctValue(n) {
      if (n == null || Number.isNaN(n)) return "--";
      return n.toFixed(2) + "%";
    }

    function renderQuoteGrid(quote) {
      const gridEl = document.getElementById("chartQuoteGrid");
      if (!gridEl) return;
      if (!quote) {
        gridEl.innerHTML = "";
        gridEl.hidden = true;
        return;
      }

      const base = quote.preClose;
      const kind =
        typeof getMarketKind === "function"
          ? getMarketKind({ code: quote.code, market: openChartModal._state?.holding?.market })
          : "CN";
      const showLimit = kind === "CN";

      const cells = [
        {
          label: "今开",
          text: formatPrice(quote.open),
          tone: quoteToneVsBase(quote.open, base)
        },
        {
          label: "最高",
          text: formatPrice(quote.high),
          tone: quoteToneVsBase(quote.high, base)
        },
        {
          label: "涨停",
          text: showLimit ? formatPrice(quote.limitUp) : "--",
          tone: showLimit ? "up" : "flat"
        },
        {
          label: "换手",
          text: formatQuotePctValue(quote.turnoverRate),
          tone: "flat"
        },
        {
          label: "成交量",
          text: formatVolume(quote.volume),
          tone: "flat"
        },
        {
          label: "市盈(动)",
          text: formatQuoteRatio(quote.pe),
          tone: "flat"
        },
        {
          label: "昨收",
          text: formatPrice(quote.preClose),
          tone: "flat"
        },
        {
          label: "最低",
          text: formatPrice(quote.low),
          tone: quoteToneVsBase(quote.low, base)
        },
        {
          label: "跌停",
          text: showLimit ? formatPrice(quote.limitDown) : "--",
          tone: showLimit ? "down" : "flat"
        },
        {
          label: "量比",
          text: formatQuoteRatio(quote.volumeRatio),
          tone: "flat"
        },
        {
          label: "成交额",
          text: formatMarketCap(quote.amount),
          tone: "flat"
        },
        {
          label: "市净",
          text: formatQuoteRatio(quote.pb),
          tone: "flat"
        },
        {
          label: "流通市值",
          text: formatMarketCap(quote.floatCap),
          tone: "flat"
        },
        {
          label: "总市值",
          text: formatMarketCap(quote.marketCap),
          tone: "flat"
        }
      ];

      gridEl.innerHTML = cells
        .map(
          (c) => `
            <div class="chart-quote-item">
              <span class="q-label">${c.label}</span>
              <span class="q-val ${c.tone}">${c.text}</span>
            </div>`
        )
        .join("");
      gridEl.hidden = false;
    }

    function updateQuoteSummary(quote) {
      if (!quote) return;
      const tone =
        quote.change == null ? "flat" : toneClass(quote.change);
      const priceEl = document.getElementById("chartModalPrice");
      const chgAmtEl = document.getElementById("chartModalChgAmt");
      const chgEl = document.getElementById("chartModalChg");
      const arrowEl = document.getElementById("chartModalChgArrow");

      if (priceEl) {
        priceEl.textContent = formatPrice(quote.price);
        priceEl.className = "price " + tone;
      }
      if (chgAmtEl) {
        if (quote.changeAmt == null || Number.isNaN(quote.changeAmt)) {
          chgAmtEl.textContent = "--";
          chgAmtEl.className = "chg-amt flat";
        } else {
          chgAmtEl.textContent = formatPrice(quote.changeAmt);
          chgAmtEl.className = "chg-amt " + tone;
        }
      }
      if (chgEl) {
        if (quote.change == null || Number.isNaN(quote.change)) {
          chgEl.textContent = "--";
          chgEl.className = "chg flat";
        } else {
          chgEl.textContent = formatPct(quote.change);
          chgEl.className = "chg " + tone;
        }
      }
      if (arrowEl) {
        arrowEl.innerHTML =
          typeof chgArrowHtml === "function" ? chgArrowHtml(quote.change) : "";
      }
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

    const chartScrub = {
      index: null,
      dragging: false
    };

    function getChartPlotMetrics(cssW, cssH) {
      const volH = 48;
      const volGap = 8;
      const timeGap = 4;
      const timeLabelH = 14;
      const bottomPad = 60;
      const pad = {
        top: 16,
        right: 52,
        bottom: timeGap + timeLabelH + bottomPad,
        left: 52
      };
      const plotW = cssW - pad.left - pad.right;
      const plotH = cssH - pad.top - pad.bottom - volH - volGap;
      const volTop = pad.top + plotH + volGap;
      const timeY = volTop + volH + timeGap;
      return { pad, plotW, plotH, volH, volGap, volTop, timeY };
    }

    function clearChartScrub(restoreMeta = true) {
      chartScrub.index = null;
      chartScrub.dragging = false;
      const tip = document.getElementById("chartCrosshairTip");
      if (tip) tip.hidden = true;
      if (!restoreMeta) return;
      const series = openChartModal._lastSeries;
      const state = openChartModal._state;
      const canvas = document.getElementById("chartCanvas");
      if (series && canvas) drawIntradayChart(canvas, series, null);
      if (series && state) updateChartMeta(series, state);
    }

    function pointIndexFromClientX(canvas, clientX, pointsLen) {
      if (!pointsLen) return null;
      const rect = canvas.getBoundingClientRect();
      const cssW = canvas.clientWidth || rect.width || 320;
      const cssH = canvas.clientHeight || rect.height || 280;
      const { pad, plotW } = getChartPlotMetrics(cssW, cssH);
      const x = clientX - rect.left;
      if (pointsLen === 1) return 0;
      const t = (x - pad.left) / plotW;
      return Math.round(Math.max(0, Math.min(1, t)) * (pointsLen - 1));
    }

    function updateChartScrubMeta(point, series) {
      const base = series.baseline;
      const chg =
        base != null && base !== 0
          ? ((point.price - base) / base) * 100
          : null;
      const tone = chg == null ? "flat" : toneClass(chg);
      const priceEl = document.getElementById("chartModalPrice");
      const chgAmtEl = document.getElementById("chartModalChgAmt");
      const chgEl = document.getElementById("chartModalChg");
      const arrowEl = document.getElementById("chartModalChgArrow");
      if (priceEl) {
        priceEl.textContent = formatPrice(point.price);
        priceEl.className = "price " + tone;
      }
      if (chgAmtEl) {
        if (chg == null || base == null) {
          chgAmtEl.textContent = "--";
          chgAmtEl.className = "chg-amt flat";
        } else {
          chgAmtEl.textContent = formatPrice(point.price - base);
          chgAmtEl.className = "chg-amt " + tone;
        }
      }
      if (chgEl) {
        if (chg == null) {
          chgEl.textContent = "--";
          chgEl.className = "chg flat";
        } else {
          chgEl.textContent = formatPct(chg);
          chgEl.className = "chg " + tone;
        }
      }
      if (arrowEl) {
        arrowEl.innerHTML =
          typeof chgArrowHtml === "function" ? chgArrowHtml(chg) : "";
      }
    }

    function updateCrosshairTip(point, series, x, cssW) {
      const tip = document.getElementById("chartCrosshairTip");
      if (!tip) return;
      const base = series.baseline;
      const chg =
        base != null && base !== 0
          ? ((point.price - base) / base) * 100
          : null;
      const tone = chg == null ? "flat" : toneClass(chg);
      tip.querySelector(".t-time").textContent = point.label || "--";
      tip.querySelector(".t-price").textContent = formatPrice(point.price);
      const pctEl = tip.querySelector(".t-pct");
      pctEl.textContent = chg == null ? "--" : formatPct(chg);
      pctEl.className = "t-pct " + tone;
      tip.hidden = false;

      const tipW = tip.offsetWidth || 120;
      const left = Math.max(8 + tipW / 2, Math.min(cssW - 8 - tipW / 2, x));
      tip.style.left = left + "px";
    }

    function applyChartScrub(index) {
      const series = openChartModal._lastSeries;
      const canvas = document.getElementById("chartCanvas");
      if (!series?.points?.length || !canvas) return;
      const safeIndex = Math.max(0, Math.min(series.points.length - 1, index));
      if (chartScrub.index === safeIndex) return;
      chartScrub.index = safeIndex;
      const point = series.points[safeIndex];
      drawIntradayChart(canvas, series, safeIndex);
      updateChartScrubMeta(point, series);
    }

    function bindChartPointer(canvas) {
      if (!canvas || canvas._chartPointerBound) return;
      canvas._chartPointerBound = true;

      const onMove = (e) => {
        const series = openChartModal._lastSeries;
        if (!series?.points?.length) return;
        // 鼠标悬停即可；触摸需按下后滑动
        if (e.pointerType !== "mouse" && !chartScrub.dragging) return;
        e.preventDefault();
        const idx = pointIndexFromClientX(canvas, e.clientX, series.points.length);
        if (idx == null) return;
        applyChartScrub(idx);
      };

      canvas.addEventListener("pointerdown", (e) => {
        const series = openChartModal._lastSeries;
        if (!series?.points?.length) return;
        chartScrub.dragging = true;
        canvas.setPointerCapture?.(e.pointerId);
        e.preventDefault();
        const idx = pointIndexFromClientX(canvas, e.clientX, series.points.length);
        if (idx != null) applyChartScrub(idx);
      });

      canvas.addEventListener("pointermove", onMove);

      const endScrub = (e) => {
        const wasDragging = chartScrub.dragging;
        chartScrub.dragging = false;
        try {
          canvas.releasePointerCapture?.(e.pointerId);
        } catch (_) {}
        if (e.pointerType !== "mouse") {
          if (wasDragging) clearChartScrub(true);
          return;
        }
        const rect = canvas.getBoundingClientRect();
        const outside =
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom;
        if (outside) clearChartScrub(true);
      };

      canvas.addEventListener("pointerup", endScrub);
      canvas.addEventListener("pointercancel", endScrub);
      canvas.addEventListener("pointerleave", (e) => {
        if (e.pointerType === "mouse") clearChartScrub(true);
      });
    }

    function drawIntradayChart(canvas, series, activeIndex = null) {
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

      bindChartPointer(canvas);

      const { pad, plotW, plotH, volH, volTop, timeY } = getChartPlotMetrics(cssW, cssH);

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
        ctx.fillText(points[i].label, xAt(i), timeY);
      });

      ctx.textAlign = "left";
      ctx.fillText("成交量", pad.left, volTop - 2);

      if (activeIndex == null || activeIndex < 0 || activeIndex >= points.length) {
        const tip = document.getElementById("chartCrosshairTip");
        if (tip) tip.hidden = true;
        return;
      }

      const ap = points[activeIndex];
      const ax = xAt(activeIndex);
      const ay = yAt(ap.price);

      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = "rgba(71, 85, 105, 0.85)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax, pad.top);
      ctx.lineTo(ax, volTop + volH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pad.left, ay);
      ctx.lineTo(pad.left + plotW, ay);
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(ax, ay, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = lineColor;
      ctx.stroke();

      updateCrosshairTip(ap, series, ax, cssW);
    }

    function updateChartMeta(series, state) {
      const last = series.points[series.points.length - 1];
      const base = series.baseline;
      const chg = base ? ((last.price - base) / base) * 100 : null;
      const tone = chg == null ? "flat" : toneClass(chg);
      const isDay = state.range === "day";
      const quote = state.quote;

      // 当日优先用盘口行情（含涨跌额）；其它区间用走势相对涨跌
      if (isDay && quote) {
        updateQuoteSummary(quote);
      } else {
        const priceEl = document.getElementById("chartModalPrice");
        const chgAmtEl = document.getElementById("chartModalChgAmt");
        const chgEl = document.getElementById("chartModalChg");
        const arrowEl = document.getElementById("chartModalChgArrow");
        priceEl.textContent = formatPrice(last.price);
        priceEl.className = "price " + tone;
        if (chgAmtEl) {
          if (chg == null || base == null) {
            chgAmtEl.textContent = "--";
            chgAmtEl.className = "chg-amt flat";
          } else {
            chgAmtEl.textContent = formatPrice(last.price - base);
            chgAmtEl.className = "chg-amt " + tone;
          }
        }
        if (chg == null) {
          chgEl.textContent = "--";
          chgEl.className = "chg flat";
        } else {
          chgEl.textContent = formatPct(chg);
          chgEl.className = "chg " + tone;
        }
        if (arrowEl) {
          arrowEl.innerHTML =
            typeof chgArrowHtml === "function" ? chgArrowHtml(chg) : "";
        }
      }

      const name =
        quote?.name || state.trend?.name || state.history?.name || "";
      document.getElementById("chartModalName").textContent = name || "--";
    }

    function renderActiveChart() {
      const state = openChartModal._state;
      if (!state) return;
      chartScrub.index = null;
      chartScrub.dragging = false;
      const tip = document.getElementById("chartCrosshairTip");
      if (tip) tip.hidden = true;
      const series = buildRangeSeries(state.range, state);
      const canvas = document.getElementById("chartCanvas");
      if (!series) {
        openChartModal._lastSeries = null;
        setStatus("chartStatus", state.range === "day" ? "暂无当日分时数据" : "暂无该区间行情");
        return;
      }
      openChartModal._lastSeries = series;
      setStatus("chartStatus", "");
      updateChartMeta(series, state);
      drawIntradayChart(canvas, series, null);
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
      if (fundId === "cnSemi" && typeof getCnRankHolding === "function") {
        return getCnRankHolding(index);
      }
      if (fundId === "usSemi" && typeof getUsRankHolding === "function") {
        return getUsRankHolding(index);
      }
      if (fundId === "hkStocks" && typeof getHkRankHolding === "function") {
        return getHkRankHolding(index);
      }
      if (fundId === "jpStocks" && typeof getJpRankHolding === "function") {
        return getJpRankHolding(index);
      }
      if (fundId === "krStocks" && typeof getKrRankHolding === "function") {
        return getKrRankHolding(index);
      }
      if (fundId === "watchStocks" && typeof getWatchHolding === "function") {
        return getWatchHolding(index);
      }
      return window.FUND_HOLDINGS[fundId]?.holdings?.[index] || null;
    }

    async function openChartModal(fundId, index) {
      const holding = resolveChartHolding(fundId, index);
      if (!holding) return;

      const canvas = document.getElementById("chartCanvas");
      const reqId = ++chartRequestId;

      clearChartScrub(false);
      document.getElementById("chartModalName").textContent =
        holding.name;
      resetChartQuoteUi();
      resetPeriodValues();
      canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);

      openChartModal._state = {
        range: "day",
        trend: null,
        history: null,
        quote: null,
        returns: null,
        holding,
        fundId
      };
      openChartModal._lastSeries = null;

      showModal("chartModal");
      setStatus("chartStatus", "加载分时与区间涨跌幅…");

      const [trendResult, historyResult, quoteResult] = await Promise.allSettled([
        loadIntradayTrends(holding),
        loadDailyKlines(holding),
        loadStockQuoteDetail(holding)
      ]);

      if (reqId !== chartRequestId) return;

      const quote =
        quoteResult.status === "fulfilled" ? quoteResult.value : null;

      const state = {
        range: "day",
        trend: trendResult.status === "fulfilled" ? trendResult.value : null,
        history: historyResult.status === "fulfilled" ? historyResult.value : null,
        quote,
        returns: null,
        holding,
        fundId
      };

      if (state.history) {
        state.returns = calcPeriodReturns(state.history.klines);
      } else {
        state.returns = { day: null, "1m": null, "3m": null, "6m": null, ytd: null, "1y": null };
      }

      if (quote?.change != null) {
        state.returns.day = quote.change;
      } else if (state.trend?.preClose != null && state.trend.points?.length) {
        const last = state.trend.points[state.trend.points.length - 1];
        state.returns.day =
          Math.round(((last.price - state.trend.preClose) / state.trend.preClose) * 10000) / 100;
      }
      renderPeriodReturns(state.returns);
      renderQuoteGrid(quote);

      openChartModal._state = state;

      if (!state.trend && !state.history) {
        openChartModal._lastSeries = null;
        if (quote) {
          updateQuoteSummary(quote);
          document.getElementById("chartModalName").textContent =
            quote.name || holding.name || "--";
        }
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
      clearChartScrub(false);
      openChartModal._state = null;
      openChartModal._lastSeries = null;
      if (document.getElementById("profileModal")?.classList.contains("show")) {
        closeProfileModal();
      }
      hideModal("chartModal");
      setStatus("chartStatus", "");
      resetPeriodValues();
      resetChartQuoteUi();
    }
