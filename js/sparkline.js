    function drawSparkline(canvas, points, baseline) {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth || 120;
      const cssH = canvas.clientHeight || 44;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);

      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      if (!points?.length) return;

      const padY = 2;
      const prices = points.map((p) => p.price);
      let minP = Math.min(...prices);
      let maxP = Math.max(...prices);
      if (baseline != null) {
        minP = Math.min(minP, baseline);
        maxP = Math.max(maxP, baseline);
      }
      const span = maxP - minP || Math.abs(maxP) * 0.01 || 1;
      minP -= span * 0.06;
      maxP += span * 0.06;

      const last = points[points.length - 1];
      const lineColor =
        baseline == null
          ? "#1677ff"
          : last.price >= baseline
            ? "#e64545"
            : "#12a150";

      function xAt(i) {
        if (points.length === 1) return cssW / 2;
        return (i / (points.length - 1)) * cssW;
      }
      function yAt(price) {
        return padY + ((maxP - price) / (maxP - minP)) * (cssH - padY * 2);
      }

      if (baseline != null) {
        const y = yAt(baseline);
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = "#cbd5e1";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(cssW, y);
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
      ctx.lineTo(lastX, cssH);
      ctx.lineTo(xAt(0), cssH);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, 0, 0, cssH);
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
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      ctx.stroke();
    }

    function formatBreadthHtml(breadth) {
      if (!breadth) return "";
      const up = Number(breadth.up) || 0;
      const down = Number(breadth.down) || 0;
      const flat = Number(breadth.flat) || 0;
      const total = up + down + flat;
      const upPct = total ? (up / total) * 100 : 0;
      const flatPct = total ? (flat / total) * 100 : 0;
      const downPct = total ? (down / total) * 100 : 0;
      const flatCenter = upPct + flatPct / 2;
      return `
        <div class="breadth-bar" role="img" aria-label="涨 ${up}，平 ${flat}，跌 ${down}">
          <div class="breadth-seg up" style="flex:${upPct || 0}"></div>
          <div class="breadth-seg flat" style="flex:${flatPct || 0}"></div>
          <div class="breadth-seg down" style="flex:${downPct || 0}"></div>
        </div>
        <div class="breadth-legend">
          <span class="breadth-item up">涨 ${up}</span>
          <span class="breadth-item flat" style="left:${flatCenter}%">平 ${flat}</span>
          <span class="breadth-item down">跌 ${down}</span>
        </div>`;
    }

    function renderMarketBreadth(elId, breadth) {
      const el = document.getElementById(elId);
      if (!el) return;
      if (!breadth || !(breadth.up || breadth.down || breadth.flat || breadth.total)) {
        el.hidden = true;
        el.innerHTML = "";
        return;
      }
      el.hidden = false;
      el.innerHTML = `<div class="breadth-label">实时涨跌家数</div><div class="breadth-body">${formatBreadthHtml(breadth)}</div>`;
    }


    function chgArrowHtml(change) {
      if (change > 0) {
        return '<img class="chg-arrow" src="assets/aesc.png" alt="" aria-hidden="true" />';
      }
      if (change < 0) {
        return '<img class="chg-arrow" src="assets/desc.png" alt="" aria-hidden="true" />';
      }
      return "";
    }

