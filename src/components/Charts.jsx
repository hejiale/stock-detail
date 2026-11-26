import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { loadIntradayCached, intradayKey } from "../lib/market";

function setupCanvas(canvas, cssW, cssH) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(cssW * dpr));
  canvas.height = Math.max(1, Math.round(cssH * dpr));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  return ctx;
}

function drawSpark(canvas, points, baseline) {
  const cssW = canvas.clientWidth || 92;
  const cssH = canvas.clientHeight || 30;
  const ctx = setupCanvas(canvas, cssW, cssH);
  const prices = (points || [])
    .map((p) => Number(p.price))
    .filter((n) => Number.isFinite(n));
  if (!prices.length) {
    // 未悬停加载时给一条极淡的占位线，避免整列看起来是空的
    ctx.save();
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = "rgba(148,163,184,0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cssH / 2);
    ctx.lineTo(cssW, cssH / 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const padY = 2;
  let minP = Math.min(...prices);
  let maxP = Math.max(...prices);
  if (baseline != null && Number.isFinite(Number(baseline))) {
    minP = Math.min(minP, Number(baseline));
    maxP = Math.max(maxP, Number(baseline));
  }
  const span = maxP - minP || Math.abs(maxP) * 0.01 || 1;
  minP -= span * 0.08;
  maxP += span * 0.08;

  const last = prices[prices.length - 1];
  const lineColor =
    baseline == null
      ? "#4c9dff"
      : last >= Number(baseline)
        ? "#ff5c5c"
        : "#22c77a";

  const xAt = (i) =>
    prices.length === 1 ? cssW / 2 : (i / (prices.length - 1)) * cssW;
  const yAt = (price) => padY + ((maxP - price) / (maxP - minP)) * (cssH - padY * 2);

  if (baseline != null && Number.isFinite(Number(baseline))) {
    const y = yAt(Number(baseline));
    ctx.save();
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = "rgba(148,163,184,0.38)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cssW, y);
    ctx.stroke();
    ctx.restore();
  }

  ctx.beginPath();
  prices.forEach((p, i) => {
    const x = xAt(i);
    const y = yAt(p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(cssW, cssH);
  ctx.lineTo(0, cssH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, cssH);
  grad.addColorStop(0, lineColor + "38");
  grad.addColorStop(1, lineColor + "00");
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  prices.forEach((p, i) => {
    const x = xAt(i);
    const y = yAt(p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.stroke();
}

/** 列表行内分时走势：行悬停后才拉取数据，同一代码全站共享缓存 */
export function TrendSparkline({ holding, baseline, width = 92, height = 30, version = 0 }) {
  const canvasRef = useRef(null);
  const [data, setData] = useState(null);
  const [active, setActive] = useState(false);
  const key = intradayKey(holding);
  const hasBaseline = baseline != null && Number.isFinite(Number(baseline));

  // 只有鼠标停留在这一行时才加载，避免整页 20 行同时请求分时接口
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const row = canvas.closest("tr") || canvas;
    let timer = null;
    const enter = () => {
      if (active) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setActive(true), 220);
    };
    const leave = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    row.addEventListener("pointerenter", enter);
    row.addEventListener("pointerleave", leave);
    return () => {
      if (timer) clearTimeout(timer);
      row.removeEventListener("pointerenter", enter);
      row.removeEventListener("pointerleave", leave);
    };
  }, [active]);

  useEffect(() => {
    if (!active || !holding?.code) return undefined;
    let alive = true;
    loadIntradayCached(holding, { skipSnapshot: hasBaseline }).then((trend) => {
      if (alive) setData(trend);
    });
    return () => {
      alive = false;
    };
  }, [key, version, active]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawSpark(canvas, data?.points || [], data?.preClose ?? baseline);
  }, [data, baseline, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="spark-cell"
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

/** 通用折线图（分时 / 日K / 净值 / 虚拟币） */
export function LineChart({
  points = [],
  baseline = null,
  valueFormatter = (v) => String(v),
  height = 260,
  color,
  emptyText = "暂无走势数据"
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [hover, setHover] = useState(null);

  const clean = useMemo(
    () =>
      (points || []).filter(
        (p) => p && p.value != null && Number.isFinite(Number(p.value))
      ),
    [points]
  );

  const lineColor = useMemo(() => {
    if (color) return color;
    if (!clean.length) return "#4c9dff";
    const last = Number(clean[clean.length - 1].value);
    if (baseline != null && Number.isFinite(Number(baseline))) {
      return last >= Number(baseline) ? "#ff5c5c" : "#22c77a";
    }
    const first = Number(clean[0].value);
    return last >= first ? "#ff5c5c" : "#22c77a";
  }, [clean, baseline, color]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const draw = () => {
      const cssW = wrap.clientWidth || 600;
      const cssH = wrap.clientHeight || height;
      const ctx = setupCanvas(canvas, cssW, cssH);
      if (!clean.length) return;

      const values = clean.map((p) => Number(p.value));
      let min = Math.min(...values);
      let max = Math.max(...values);
      if (baseline != null && Number.isFinite(Number(baseline))) {
        min = Math.min(min, Number(baseline));
        max = Math.max(max, Number(baseline));
      }
      const span = max - min || Math.abs(max) * 0.01 || 1;
      min -= span * 0.12;
      max += span * 0.12;

      const padL = 10;
      const padR = 46;
      const padT = 16;
      const padB = 22;
      const plotW = Math.max(10, cssW - padL - padR);
      const plotH = Math.max(10, cssH - padT - padB);

      const xAt = (i) =>
        padL + (clean.length === 1 ? plotW / 2 : (i / (clean.length - 1)) * plotW);
      const yAt = (v) => padT + ((max - v) / (max - min)) * plotH;

      // 网格与右侧价格刻度
      ctx.font = "10px -apple-system, 'Segoe UI', sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      for (let i = 0; i <= 3; i += 1) {
        const y = padT + (plotH / 3) * i;
        const val = max - ((max - min) / 3) * i;
        ctx.strokeStyle = "rgba(148,163,184,0.09)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + plotW, y);
        ctx.stroke();
        ctx.fillStyle = "rgba(139,155,180,0.75)";
        ctx.fillText(valueFormatter(val), padL + plotW + 8, y);
      }

      // 基准线（昨收）
      if (baseline != null && Number.isFinite(Number(baseline))) {
        const y = yAt(Number(baseline));
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "rgba(148,163,184,0.38)";
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + plotW, y);
        ctx.stroke();
        ctx.restore();
      }

      // 面积
      ctx.beginPath();
      clean.forEach((p, i) => {
        const x = xAt(i);
        const y = yAt(Number(p.value));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.lineTo(padL + plotW, padT + plotH);
      ctx.lineTo(padL, padT + plotH);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
      grad.addColorStop(0, lineColor + "40");
      grad.addColorStop(1, lineColor + "00");
      ctx.fillStyle = grad;
      ctx.fill();

      // 折线
      ctx.beginPath();
      clean.forEach((p, i) => {
        const x = xAt(i);
        const y = yAt(Number(p.value));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();

      // 悬浮十字线
      if (hover != null && clean[hover]) {
        const hx = xAt(hover);
        const hy = yAt(Number(clean[hover].value));
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = "rgba(232,238,248,0.35)";
        ctx.beginPath();
        ctx.moveTo(hx, padT);
        ctx.lineTo(hx, padT + plotH);
        ctx.stroke();
        ctx.restore();
        ctx.beginPath();
        ctx.arc(hx, hy, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = lineColor;
        ctx.fill();
        ctx.strokeStyle = "#0b121c";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // x 轴首尾标签
      if (clean.length > 1) {
        ctx.fillStyle = "rgba(139,155,180,0.7)";
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        ctx.fillText(String(clean[0].label || ""), padL, cssH - 16);
        ctx.textAlign = "right";
        ctx.fillText(
          String(clean[clean.length - 1].label || ""),
          padL + plotW,
          cssH - 16
        );
      }
      // 最新值标记
      const lastVal = clean[clean.length - 1];
      ctx.beginPath();
      const lx = xAt(clean.length - 1);
      const ly = yAt(Number(lastVal.value));
      ctx.arc(lx, ly, 3, 0, Math.PI * 2);
      ctx.fillStyle = lineColor;
      ctx.fill();
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [clean, baseline, hover, height, lineColor, valueFormatter]);

  const onMove = (e) => {
    const wrap = wrapRef.current;
    if (!wrap || !clean.length) return;
    const rect = wrap.getBoundingClientRect();
    const padL = 10;
    const padR = 46;
    const plotW = Math.max(10, rect.width - padL - padR);
    const x = Math.min(Math.max(e.clientX - rect.left, padL), padL + plotW);
    const idx = Math.round(((x - padL) / plotW) * (clean.length - 1));
    setHover(Math.min(Math.max(idx, 0), clean.length - 1));
  };

  const hoverItem = hover != null ? clean[hover] : null;

  return (
    <div
      ref={wrapRef}
      className="chart-wrap"
      style={{ height }}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      <canvas ref={canvasRef} />
      {hoverItem ? (
        <div className="chart-tooltip">
          {hoverItem.label ? <span>{hoverItem.label}　</span> : null}
          <b style={{ color: lineColor }}>{valueFormatter(hoverItem.value)}</b>
        </div>
      ) : null}
      {!clean.length ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "var(--muted-2)",
            fontSize: 12
          }}
        >
          {emptyText}
        </div>
      ) : null}
    </div>
  );
}