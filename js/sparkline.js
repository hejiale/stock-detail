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

    // 渐变 id 自增，避免同页多个图 id 冲突
    let breadthGradSeq = 0;

    function formatBreadthHtml(breadth) {
      if (!breadth) return "";
      const up = Number(breadth.up) || 0;
      const down = Number(breadth.down) || 0;
      const flat = Number(breadth.flat) || 0;
      const total = up + down + flat;
      if (!total) return "";

      // 画布与圆环几何
      const vbW = 360;
      const vbH = 210;
      const cx = vbW / 2;
      const cy = vbH / 2;
      const rOuter = 56;
      const rInner = 34;
      const rMid = (rOuter + rInner) / 2;
      const ringW = rOuter - rInner;
      const circ = 2 * Math.PI * rMid;

      const polar = (r, deg) => {
        const rad = (deg * Math.PI) / 180;
        return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
      };

      // 每种状态的渐变（内浅外深，营造立体光泽）
      const seq = (breadthGradSeq = (breadthGradSeq + 1) % 100000);
      const uid = "bg" + seq;
      const segs = [
        {
          key: "up",
          label: "涨",
          value: up,
          base: "#e64545",
          grad: ["#ffa6a6", "#ef5757", "#c02b2b"]
        },
        {
          key: "flat",
          label: "平",
          value: flat,
          base: "#94a3b8",
          grad: ["#dbe3ee", "#9aa8bb", "#7285a0"]
        },
        {
          key: "down",
          label: "跌",
          value: down,
          base: "#12a150",
          grad: ["#79e0a6", "#16a75a", "#0a7a3b"]
        }
      ];

      const defs = segs
        .filter((s) => s.value > 0)
        .map(
          (s) =>
            `<radialGradient id="${uid}-${s.key}" gradientUnits="userSpaceOnUse" ` +
            `cx="${cx}" cy="${cy}" r="${rOuter}">` +
            `<stop offset="58%" stop-color="${s.grad[0]}" />` +
            `<stop offset="78%" stop-color="${s.grad[1]}" />` +
            `<stop offset="100%" stop-color="${s.grad[2]}" />` +
            `</radialGradient>`
        )
        .join("");

      let acc = 0;
      const rings = [];
      const labels = [];
      segs.forEach((s) => {
        if (s.value <= 0) return;
        const frac = s.value / total;
        const dash = frac * circ;
        const offset = -acc * circ;
        acc += frac;

        // 段与段之间留一点缝，让边界更清晰
        const visDash = dash > 6 ? dash - 2.5 : dash;
        rings.push(
          `<circle cx="${cx}" cy="${cy}" r="${rMid}" fill="none" stroke-width="${ringW}" ` +
            `stroke-dasharray="${visDash.toFixed(2)} ${(circ - visDash).toFixed(2)}" ` +
            `stroke-dashoffset="${offset.toFixed(2)}" transform="rotate(-90 ${cx} ${cy})" ` +
            `stroke="url(#${uid}-${s.key})" />`
        );

        const midDeg = -90 + (acc - frac / 2) * 360;
        const rad = (midDeg * Math.PI) / 180;
        labels.push({
          label: s.label,
          value: s.value,
          color: s.base,
          start: polar(rOuter + 1, midDeg),
          side: Math.cos(rad) >= 0 ? 1 : -1,
          y: cy + (rOuter + 16) * Math.sin(rad),
        });
      });

      // 同一侧的文字做防重叠排布
      [1, -1].forEach((side) => {
        const group = labels.filter((l) => l.side === side).sort((a, b) => a.y - b.y);
        const gap = 22;
        for (let i = 1; i < group.length; i++) {
          if (group[i].y - group[i - 1].y < gap) group[i].y = group[i - 1].y + gap;
        }
        const minY = 16;
        const maxY = vbH - 16;
        if (group.length && group[0].y < minY) {
          const shift = minY - group[0].y;
          group.forEach((l) => (l.y += shift));
        }
        if (group.length && group[group.length - 1].y > maxY) {
          const shift = group[group.length - 1].y - maxY;
          group.forEach((l) => (l.y -= shift));
        }
      });

      // 折线指引 + 文字
      const marks = labels
        .map((l) => {
          const kinkX = cx + l.side * (rOuter + 12);
          const tailX = cx + l.side * (rOuter + 26);
          const textX = tailX + l.side * 5;
          const anchor = l.side === 1 ? "start" : "end";
          return (
            `<polyline points="${l.start.x.toFixed(1)},${l.start.y.toFixed(1)} ` +
            `${kinkX.toFixed(1)},${l.y.toFixed(1)} ${tailX.toFixed(1)},${l.y.toFixed(1)}" ` +
            `fill="none" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" ` +
            `style="stroke:${l.color}" />` +
            `<text x="${textX}" y="${l.y.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle" ` +
            `style="fill:${l.color};font-size:13px;font-weight:600">${l.label} ${l.value}</text>`
          );
        })
        .join("");

      // 中心：涨停 / 跌停家数（仅 A 股有数据）
      const limitUp = breadth.limitUp;
      const limitDown = breadth.limitDown;
      let center = "";
      if (limitUp != null || limitDown != null) {
        center =
          `<text x="${cx}" y="${cy - 9}" text-anchor="middle" dominant-baseline="middle" ` +
          `style="fill:var(--up);font-size:12px;font-weight:600">涨停 ${limitUp ?? 0}</text>` +
          `<text x="${cx}" y="${cy + 11}" text-anchor="middle" dominant-baseline="middle" ` +
          `style="fill:var(--down);font-size:12px;font-weight:600">跌停 ${limitDown ?? 0}</text>`;
      }

      const centerLabel =
        limitUp != null || limitDown != null
          ? `，涨停 ${limitUp ?? 0}，跌停 ${limitDown ?? 0}`
          : "";
      return (
        `<svg class="breadth-donut" viewBox="0 0 ${vbW} ${vbH}" role="img" ` +
        `aria-label="涨 ${up}，平 ${flat}，跌 ${down}${centerLabel}">` +
        `<defs>${defs}</defs>` +
        `<circle cx="${cx}" cy="${cy}" r="${rMid}" fill="none" stroke-width="${ringW}" style="stroke:#e9eef6" />` +
        rings.join("") +
        marks +
        center +
        `</svg>`
      );
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
        return '<svg class="chg-arrow" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M5 1.2 9.3 8.8H.7z"/></svg>';
      }
      if (change < 0) {
        return '<svg class="chg-arrow" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M5 8.8.7 1.2h8.6z"/></svg>';
      }
      return "";
    }

    function formatPctWithArrow(n) {
      if (n == null || Number.isNaN(Number(n))) return "--";
      const x = Number(n);
      return formatPct(x) + chgArrowHtml(x);
    }

    function paintChgArrow(el, change) {
      if (!el) return;
      const tone =
        change == null || Number.isNaN(Number(change)) ? "flat" : toneClass(change);
      el.className = "chg-arrow-host " + tone;
      el.innerHTML = chgArrowHtml(change);
    }

