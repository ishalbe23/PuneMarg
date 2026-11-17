/*
 * structures.js - draws the LIVE data structures returned by the C++ backend.
 * Every function returns an HTML/SVG string; colours follow the structure family
 * (stack = orange, queue = teal, heap = purple, tree = green, list = blue,
 *  hash = pink, matrix = yellow, recursion = red).
 */
const DS = (() => {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const short = (s, n = 14) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
  const fmt = (v, d = 2) => (typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(d)) : esc(v));

  function cell(label, sub, cls = "", extra = "") {
    return `<div class="cell ${cls}" ${extra}>${esc(label)}${sub !== undefined && sub !== "" ? `<small>${esc(sub)}</small>` : ""}</div>`;
  }

  // Stack: items[0] is the TOP. Drawn as a bucket open at the top.
  function stack(items, { title = "Stack", cls = "c-stack", label = x => x, max = 14 } = {}) {
    const shown = items.slice(0, max);
    const cells = shown.slice().reverse().map((x, i) => cell(short(label(x), 18), i === shown.length - 1 ? "top" : "", cls + (i === shown.length - 1 ? " hl" : ""))).join("");
    return `<div class="vstack"><div class="ds-label">${esc(title)} (${items.length})</div>
      ${items.length > max ? `<div class="muted">… ${items.length - max} more below</div>` : ""}
      <div class="stack-box" style="border-color:var(--${cls.replace("c-", "c-")})">${cells || '<span class="muted">empty</span>'}</div></div>`;
  }

  // Queue / deque: items[0] is the FRONT.
  function queue(items, { title = "Queue", cls = "c-queue", label = x => x, max = 18, frontName = "front", rearName = "rear" } = {}) {
    const shown = items.slice(0, max);
    const cells = shown.map((x, i) => cell(short(label(x), 16), i === 0 ? frontName : i === shown.length - 1 ? rearName : "", cls + (i === 0 ? " hl" : ""))).join('<span class="arrow">←</span>');
    return `<div class="ds-label">${esc(title)} (${items.length})</div><div class="ds-row">${cells || '<span class="muted">empty</span>'}${items.length > max ? `<span class="muted">… +${items.length - max}</span>` : ""}</div>`;
  }

  // Circular queue as a ring of fixed slots with FRONT / REAR markers.
  function circularQueue(q, { title = "Circular queue", color = "var(--c-queue)" } = {}) {
    const n = q.capacity, R = 92, cx = 150, cy = 120;
    let s = `<svg width="300" height="245" viewBox="0 0 300 245">`;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
      const p = (a, r) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
      const [x0, y0] = p(a0, R), [x1, y1] = p(a1, R), [x2, y2] = p(a1, R - 34), [x3, y3] = p(a0, R - 34);
      const used = q.slots[i].used;
      s += `<path d="M${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1} L${x2},${y2} A${R - 34},${R - 34} 0 0 0 ${x3},${y3} Z"
              fill="${used ? color : "transparent"}" fill-opacity="${used ? 0.25 : 0}" stroke="${color}" stroke-width="1.5"/>`;
      const [tx, ty] = p((a0 + a1) / 2, R - 17);
      s += `<text x="${tx}" y="${ty}" font-size="11" text-anchor="middle" dominant-baseline="central" fill="currentColor">${i}</text>`;
      const [lx, ly] = p((a0 + a1) / 2, R + 14);
      if (i === q.front && q.size > 0) s += `<text x="${lx}" y="${ly}" font-size="10" text-anchor="middle" fill="var(--ok)" font-weight="700">F</text>`;
      if (i === q.rear && q.size > 0) s += `<text x="${lx}" y="${ly + (i === q.front ? 11 : 0)}" font-size="10" text-anchor="middle" fill="var(--bad)" font-weight="700">R</text>`;
    }
    s += `<text x="${cx}" y="${cy - 6}" font-size="12" text-anchor="middle" fill="currentColor">${q.size}/${n}</text>
          <text x="${cx}" y="${cy + 10}" font-size="10" text-anchor="middle" fill="currentColor" opacity=".7">front=${q.front} rear=${q.rear}</text></svg>`;
    const list = q.slots.map(sl => `<div class="bucket"><span class="idx">${sl.index}</span>${sl.used ? cell(short(sl.value, 46), sl.index === q.front ? "front" : sl.index === q.rear ? "rear" : "", "c-queue" + (sl.index === q.front ? " hl" : "")) : '<span class="muted">— empty —</span>'}</div>`).join("");
    return `<div class="ds-label">${esc(title)}</div><div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">${s}<div style="flex:1;min-width:220px">${list}</div></div>`;
  }

  // Linked list: nodes [{label, sub}] ; doubly -> ⇄ ; circular -> back arrow to head.
  function linkedList(nodes, { title = "Linked list", cls = "c-list", doubly = false, circular = false, cursor = -1, max = 30 } = {}) {
    const shown = nodes.slice(0, max);
    const sep = doubly ? '<span class="arrow">⇄</span>' : '<span class="arrow">→</span>';
    const cells = shown.map((n, i) => cell(short(n.label, 22), n.sub, cls + (i === cursor ? " hl" : ""), i === cursor ? 'title="cursor"' : "")).join(sep);
    const tail = circular ? '<span class="arrow">↩ back to head</span>' : '<span class="arrow">→ NULL</span>';
    return `<div class="ds-label">${esc(title)} (${nodes.length} nodes)</div>
      <div class="ds-row">${doubly ? '<span class="arrow">NULL ←</span>' : '<span class="arrow">head →</span>'}${cells}${nodes.length > max ? `<span class="muted">… +${nodes.length - max}</span>` : ""}${tail}</div>`;
  }

  // Binary tree from nested JSON {k, l, r, ...}. Layout: x = inorder index, y = depth.
  function binaryTree(root, { label = n => n.k, sub = null, hl = () => false, color = "var(--c-tree)", fill = null, maxLabel = 11, gap = 34, levelH = 52, title = "" } = {}) {
    if (!root) return `<div class="muted">(empty tree)</div>`;
    const nodes = [];
    let order = 0, maxDepth = 0;
    (function walk(n, d, parent) {
      if (!n) return;
      walk(n.l, d + 1, n);
      n._x = order++; n._d = d; n._p = parent;
      if (d > maxDepth) maxDepth = d;
      nodes.push(n);
      walk(n.r, d + 1, n);
    })(root, 0, null);
    const W = Math.max(200, order * gap + 40), H = (maxDepth + 1) * levelH + 30;
    const X = n => 20 + n._x * gap + gap / 2, Y = n => 24 + n._d * levelH;
    let edges = "", circles = "";
    for (const n of nodes) {
      if (n._p) edges += `<line class="tree-edge${hl(n) && hl(n._p) ? " hl" : ""}" x1="${X(n._p)}" y1="${Y(n._p)}" x2="${X(n)}" y2="${Y(n)}"/>`;
      const h = hl(n);
      const f = fill ? fill(n) : h ? color : "var(--surface)";
      circles += `<g class="tree-node"><circle cx="${X(n)}" cy="${Y(n)}" r="15" fill="${f}" stroke="${h ? "var(--warn)" : color}" ${h ? 'stroke-width="3"' : ""}/>
        <text x="${X(n)}" y="${Y(n)}" ${h ? 'fill="#fff"' : ""} style="font-size:${String(label(n)).length > 6 ? 8.5 : 11}px">${esc(short(label(n), maxLabel))}</text>
        ${sub ? `<text x="${X(n)}" y="${Y(n) + 22}" style="font-size:9px;fill:var(--muted)">${esc(sub(n))}</text>` : ""}
        <title>${esc(n.k)}${n.h !== undefined ? ` (height ${n.h}, bf ${n.bf})` : ""}</title></g>`;
    }
    return `${title ? `<div class="ds-label">${esc(title)}</div>` : ""}<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="max-width:none" data-rootx="${X(root)}">${edges}${circles}</svg>`;
  }

  // Array-backed heap -> tree JSON (children of i are 2i+1, 2i+2).
  function heapToTree(arr, i = 0) {
    if (i >= arr.length) return null;
    return { k: arr[i][0], node: arr[i][1], idx: i, l: heapToTree(arr, 2 * i + 1), r: heapToTree(arr, 2 * i + 2) };
  }
  function heap(arr, { names = [], title = "Binary min-heap", poppedText = "", keyFmt = k => fmt(k, 1) } = {}) {
    const tree = heapToTree(arr);
    const cells = arr.slice(0, 24).map((e, i) => cell(keyFmt(e[0]), `[${i}] ${short(names[e[1]] ?? e[1], 10)}`, "c-heap" + (i === 0 ? " hl" : ""))).join("");
    return `<div class="ds-label">${esc(title)} - ${arr.length} entries ${poppedText ? "· " + esc(poppedText) : ""}</div>
      ${binaryTree(tree, { label: n => keyFmt(n.k), sub: n => short(names[n.node] ?? n.node, 10), hl: n => n.idx === 0, color: "var(--c-heap)", gap: 46, levelH: 56 })}
      <div class="ds-label">Array view (parent i → children 2i+1, 2i+2)</div><div class="ds-row">${cells}${arr.length > 24 ? '<span class="muted">…</span>' : ""}</div>`;
  }

  function buckets(list, { hlBucket = -1, hlKey = null, max = 80 } = {}) {
    return list.slice(0, max).map((keys, i) => `<div class="bucket"><span class="idx">${i}</span>${
      keys.length ? keys.map((k, j) => cell(short(k, 18), "", "c-hash" + (i === hlBucket && k === hlKey ? " hl" : i === hlBucket ? "" : " ")) + (j < keys.length - 1 ? '<span class="arrow">→</span>' : "")).join("") : '<span class="muted">NULL</span>'
    }</div>`).join("");
  }

  function slots(list, { seq = [], home = -1, hit = -1 } = {}) {
    return `<div class="slots">${list.map((s, i) => {
      const cls = ["slot", s[0] === 1 ? "full" : s[0] === 2 ? "del" : "", seq.includes(i) ? "probe" : "", i === home ? "home" : "", i === hit ? "hit" : ""].join(" ");
      return `<div class="${cls}" title="slot ${i}${s[0] === 1 ? " key " + s[1] : s[0] === 2 ? " tombstone" : " empty"}">${i}<br>${s[0] === 1 ? s[1] : s[0] === 2 ? "†" : "·"}</div>`;
    }).join("")}</div>`;
  }

  // Bars for the sorting animation.
  function bars(items, { cmp = [], swap = [], pivot = -1, sortedFrom = -1, keyFmt = k => fmt(k, 1) } = {}) {
    const max = Math.max(...items.map(x => x.key), 1);
    const W = Math.max(320, items.length * 34), H = 210, bw = W / items.length;
    let s = `<svg width="${W}" height="${H + 70}" viewBox="0 0 ${W} ${H + 70}" style="max-width:none">`;
    items.forEach((it, i) => {
      const h = Math.max(4, (it.key / max) * (H - 20));
      let col = "var(--c-list)";
      if (cmp.includes(i)) col = "var(--warn)";
      if (swap.includes(i)) col = "var(--bad)";
      if (i === pivot) col = "var(--c-heap)";
      s += `<rect x="${i * bw + 3}" y="${H - h}" width="${bw - 6}" height="${h}" rx="3" fill="${col}"/>
        <text x="${i * bw + bw / 2}" y="${H - h - 4}" font-size="10" text-anchor="middle" fill="currentColor">${keyFmt(it.key)}</text>
        <text transform="translate(${i * bw + bw / 2 + 3},${H + 6}) rotate(55)" font-size="10" fill="currentColor">${esc(short(it.label, 16))}</text>`;
    });
    return s + "</svg>";
  }

  // Simple multi-series line chart.
  function lineChart(series, { width = 520, height = 190, xLabel = "", yLabel = "", markX = null, xTicks = null } = {}) {
    const all = series.flatMap(s => s.points);
    if (!all.length) return "";
    const minX = Math.min(...all.map(p => p[0])), maxX = Math.max(...all.map(p => p[0]));
    const minY = Math.min(0, ...all.map(p => p[1])), maxY = Math.max(...all.map(p => p[1])) * 1.08 || 1;
    const L = 38, B = 26, T = 10, R = 10;
    const sx = x => L + ((x - minX) / (maxX - minX || 1)) * (width - L - R);
    const sy = y => height - B - ((y - minY) / (maxY - minY || 1)) * (height - B - T);
    let s = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
    for (let k = 0; k <= 4; k++) {
      const yv = minY + (k / 4) * (maxY - minY);
      s += `<line x1="${L}" x2="${width - R}" y1="${sy(yv)}" y2="${sy(yv)}" stroke="var(--border)"/><text x="${L - 4}" y="${sy(yv)}" font-size="9" text-anchor="end" dominant-baseline="central" fill="var(--muted)">${yv.toFixed(yv < 10 ? 1 : 0)}</text>`;
    }
    const ticks = xTicks || [minX, (minX + maxX) / 2, maxX];
    for (const t of ticks) s += `<text x="${sx(t)}" y="${height - 10}" font-size="9" text-anchor="middle" fill="var(--muted)">${t}</text>`;
    if (markX !== null) s += `<line x1="${sx(markX)}" x2="${sx(markX)}" y1="${T}" y2="${height - B}" stroke="var(--ok)" stroke-width="2" stroke-dasharray="4 3"/>`;
    for (const se of series) {
      const d = se.points.map((p, i) => (i ? "L" : "M") + sx(p[0]) + "," + sy(p[1])).join(" ");
      s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="2" ${se.dash ? `stroke-dasharray="${se.dash}"` : ""}/>`;
      if (se.dots) for (const p of se.points) s += `<circle cx="${sx(p[0])}" cy="${sy(p[1])}" r="2.5" fill="${se.color}"/>`;
    }
    s += `<text x="${width - R}" y="${height - 1}" font-size="9" text-anchor="end" fill="var(--muted)">${esc(xLabel)}</text>
          <text x="2" y="9" font-size="9" fill="var(--muted)">${esc(yLabel)}</text></svg>`;
    const legend = series.map(se => `<span style="color:${se.color}">━ ${esc(se.name)}</span>`).join(" &nbsp; ");
    return s + `<div style="font-size:11px">${legend}</div>`;
  }

  function table(headers, rows, { rowClass = () => "", numCols = [] } = {}) {
    return `<table class="grid"><tr>${headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr>${
      rows.map((r, i) => `<tr class="${rowClass(r, i)}">${r.map((c, j) => `<td class="${numCols.includes(j) ? "num" : ""}">${typeof c === "number" ? fmt(c, 3) : esc(c)}</td>`).join("")}</tr>`).join("")
    }</table>`;
  }

  // Decision tree as an indented yes/no outline (long questions stay readable).
  function decisionTree(n, onPath, icon = {}, prefix = "", branch = "") {
    if (!n) return "";
    const hl = onPath.has(n.id);
    const text = n.q ? n.q : `${icon[n.mode] || ""} ${n.mode.toUpperCase()} - ${n.reason}`;
    const line = `<div style="white-space:pre;font-family:var(--mono);font-size:12px;line-height:1.7">${esc(prefix)}${branch ? `<b style="color:${branch === "yes" ? "var(--ok)" : "var(--bad)"}">${branch}</b> ` : ""}<span style="${hl ? "background:var(--c-tree);color:#fff;border-radius:4px;padding:1px 6px;font-weight:600" : n.q ? "" : "color:var(--muted)"}">${n.q ? "◆ " : "● "}${esc(text)}</span></div>`;
    if (!n.q) return line;
    const childPrefix = prefix.replace(/├─ $/, "│  ").replace(/└─ $/, "   ");
    return line + decisionTree(n.yes, onPath, icon, childPrefix + "├─ ", "yes") + decisionTree(n.no, onPath, icon, childPrefix + "└─ ", "no");
  }

  return { esc, short, fmt, cell, decisionTree, stack, queue, circularQueue, linkedList, binaryTree, heap, heapToTree, buckets, slots, bars, lineChart, table };
})();
