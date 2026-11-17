/*
 * map.js - offline SVG map of Pune drawn from node coordinates (no internet needed).
 * Projection: equirectangular around the city centre (x = lon * cos(lat0), y = -lat),
 * scaled so 1 unit ~ 0.11 km. Supports zoom (wheel), pan (drag), node / road clicks,
 * path + visit-order overlays and an animated marker for navigation playback.
 */
const MapView = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const TYPE_COLORS = {
    junction: "#64748b", landmark: "#f08c00", hospital: "#e03131", college: "#2f9e44",
    metro: "#7b2cbf", bus_stop: "#1c7ed6", petrol: "#495057", atm: "#0ca678",
  };
  const KEY_TYPES = new Set(["landmark", "hospital", "college", "metro", "bus_stop"]);
  let svg, gRoads, gMetro, gOverlay, gNodes, gLabels, gMarker;
  let meta = null, pos = [], bounds = null, view = null;
  let onNodeClick = () => {}, onRoadClick = null;
  let labelMode = "key";

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function project(lat, lon) {
    const lat0 = 18.55 * Math.PI / 180;
    return [lon * 1000 * Math.cos(lat0), -lat * 1000];
  }

  function init(svgEl, metaData) {
    svg = svgEl;
    meta = metaData;
    svg.innerHTML = "";
    const defs = el("defs", {}, svg);
    const mk = el("marker", { id: "arrow", viewBox: "0 0 10 10", refX: "9", refY: "5", markerUnits: "userSpaceOnUse", markerWidth: "1.9", markerHeight: "1.9", orient: "auto-start-reverse" }, defs);
    el("path", { d: "M0,0 L10,5 L0,10 z", fill: "#7d8aa0" }, mk);
    gRoads = el("g", {}, svg);
    gMetro = el("g", {}, svg);
    gOverlay = el("g", {}, svg);
    gNodes = el("g", {}, svg);
    gLabels = el("g", {}, svg);
    gMarker = el("g", {}, svg);
    pos = meta.places.map(p => project(p.lat, p.lon));
    const xs = pos.map(p => p[0]), ys = pos.map(p => p[1]);
    bounds = { x: Math.min(...xs) - 8, y: Math.min(...ys) - 8, w: Math.max(...xs) - Math.min(...xs) + 16, h: Math.max(...ys) - Math.min(...ys) + 16 };
    drawRoads();
    drawMetro();
    drawNodes();
    drawLabels();
    fit();
    window.addEventListener("resize", rescale);
    enablePanZoom();
    drawLegend();
  }

  function drawRoads() {
    gRoads.innerHTML = "";
    for (const r of meta.roads) {
      const a = pos[r.from], b = pos[r.to];
      const major = r.type === "highway" || r.type === "arterial";
      const width = r.type === "highway" ? 1.1 : r.type === "arterial" ? 0.8 : r.type === "street" ? 0.55 : 0.4;
      const cls = "road" + (major ? " major" : "") + (r.toll ? " toll" : "") + (r.closed ? " closed" : "");
      const line = el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: cls + " nss", "stroke-width": width * 2.6, "data-road": r.id }, gRoads);
      if (r.oneWay) {
        // shorten so the arrow head sits just before the target node
        const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
        line.setAttribute("x2", b[0] - dx / len * 1.4);
        line.setAttribute("y2", b[1] - dy / len * 1.4);
        line.setAttribute("marker-end", "url(#arrow)");
      }
      const hit = el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "road-hit nss", "data-road": r.id }, gRoads);
      const t = el("title", {}, hit);
      t.textContent = `#${r.id} ${r.name} (${meta.places[r.from].name} ${r.oneWay ? "→" : "↔"} ${meta.places[r.to].name}) ${r.km} km${r.toll ? " · toll" : ""}${r.closed ? " · CLOSED" : ""}`;
      hit.addEventListener("click", ev => { if (onRoadClick) { ev.stopPropagation(); onRoadClick(r.id); } });
    }
  }

  function drawMetro() {
    gMetro.innerHTML = "";
    for (const line of meta.metro) {
      const d = line.stations.map((s, i) => (i ? "L" : "M") + pos[s][0] + "," + pos[s][1]).join(" ");
      el("path", { d, class: "metro-line nss", stroke: line.color }, gMetro);
    }
  }

  function drawNodes() {
    gNodes.innerHTML = "";
    meta.places.forEach((p, i) => {
      const c = el("circle", { cx: pos[i][0], cy: pos[i][1], "data-rpx": KEY_TYPES.has(p.type) ? 5 : 4, r: 1.5, fill: TYPE_COLORS[p.type] || "#888", class: "node", "data-node": i }, gNodes);
      c.addEventListener("click", ev => { ev.stopPropagation(); onNodeClick(i); });
      c.addEventListener("mouseenter", ev => showTip(i, ev));
      c.addEventListener("mousemove", ev => moveTip(ev));
      c.addEventListener("mouseleave", hideTip);
    });
  }

  // ---------- hover tooltip ----------
  function tipEl() { return document.getElementById("mapTip"); }
  function showTip(i, ev) {
    const tip = tipEl(); if (!tip) return;
    const p = meta.places[i];
    const col = TYPE_COLORS[p.type] || "#888";
    tip.innerHTML = `<b>${DS.esc(p.name)}</b><span class="t"><i style="background:${col}"></i>${DS.esc(p.type.replace("_", " "))} · ${DS.esc(p.zone)} / ${DS.esc(p.ward)} · ★${p.rating}</span><div class="k">click to use · #${i}</div>`;
    tip.classList.remove("hidden");
    moveTip(ev);
  }
  function moveTip(ev) {
    const tip = tipEl(); if (!tip) return;
    const rect = svg.getBoundingClientRect();
    let x = ev.clientX - rect.left + 14, y = ev.clientY - rect.top + 14;
    if (x + tip.offsetWidth > rect.width - 6) x = ev.clientX - rect.left - tip.offsetWidth - 10;
    if (y + tip.offsetHeight > rect.height - 6) y = ev.clientY - rect.top - tip.offsetHeight - 10;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  function hideTip() { tipEl()?.classList.add("hidden"); }

  function drawLabels() {
    gLabels.innerHTML = "";
    if (labelMode === "none") return;
    setTimeout(rescale, 0);
    meta.places.forEach((p, i) => {
      if (labelMode === "key" && !KEY_TYPES.has(p.type)) return;
      const t = el("text", { x: pos[i][0] + 2, y: pos[i][1] + 0.9, "data-x": pos[i][0], "data-y": pos[i][1], class: "label" }, gLabels);
      t.textContent = p.name.replace(" (Sinhagad Road)", "").replace(" (University Circle)", "");
    });
  }

  function drawLegend() {
    const lg = document.getElementById("mapLegend");
    lg.innerHTML = Object.entries(TYPE_COLORS).map(([k, c]) => `<span><i style="background:${c}"></i>${k.replace("_", " ")}</span>`).join("") +
      `<span><i style="background:transparent;border:1px dashed #7d8aa0;border-radius:0;height:2px"></i>toll road</span><span>→ one-way</span>`;
  }

  // ---------- zoom & pan ----------
  // Units-per-pixel of the current zoom. Everything tagged with data-rpx (radius in px)
  // or living in the label layer is resized so it keeps the same size on screen.
  function upp() {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !view) return 0.12;
    return Math.max(view.w / rect.width, view.h / rect.height);
  }
  function rescale() {
    const k = upp();
    const arrow = svg.querySelector("#arrow");
    if (arrow) { arrow.setAttribute("markerWidth", (9 * k).toFixed(3)); arrow.setAttribute("markerHeight", (9 * k).toFixed(3)); }
    svg.querySelectorAll("[data-rpx]").forEach(c => c.setAttribute("r", (+c.dataset.rpx * k).toFixed(3)));
    gLabels.setAttribute("font-size", (11 * k).toFixed(3));
    gLabels.setAttribute("stroke-width", (3 * k).toFixed(3));
    gLabels.querySelectorAll("text").forEach(t => { t.setAttribute("x", +t.dataset.x + 6 * k); t.setAttribute("y", +t.dataset.y + 4 * k); });
    gOverlay.querySelectorAll("text").forEach(t => t.setAttribute("font-size", (12 * k).toFixed(3)));
  }
  function setView(v) { view = v; svg.setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`); rescale(); }
  function fit() { setView({ ...bounds }); }
  function zoom(scale) {               // zoom around the centre of the current view (buttons / keys)
    if (!view) return;
    const cx = view.x + view.w / 2, cy = view.y + view.h / 2;
    const w = Math.min(bounds.w * 1.5, Math.max(12, view.w * scale)), h = view.h * (w / view.w);
    setView({ x: cx - w / 2, y: cy - h / 2, w, h });
  }
  function enablePanZoom() {
    svg.addEventListener("wheel", ev => {
      ev.preventDefault();
      const rect = svg.getBoundingClientRect();
      const scale = ev.deltaY < 0 ? 0.85 : 1 / 0.85;
      // keep the point under the cursor fixed (account for preserveAspectRatio meet)
      const s = Math.max(view.w / rect.width, view.h / rect.height);
      const offX = (rect.width * s - view.w) / 2, offY = (rect.height * s - view.h) / 2;
      const mx = view.x - offX + (ev.clientX - rect.left) * s, my = view.y - offY + (ev.clientY - rect.top) * s;
      const w = Math.min(bounds.w * 1.5, Math.max(12, view.w * scale)), h = view.h * (w / view.w);
      setView({ x: mx - (mx - view.x) * (w / view.w), y: my - (my - view.y) * (h / view.h), w, h });
    }, { passive: false });
    let drag = null;
    svg.addEventListener("mousedown", ev => { drag = { x: ev.clientX, y: ev.clientY, v: { ...view } }; svg.classList.add("dragging"); });
    window.addEventListener("mousemove", ev => {
      if (!drag) return;
      const rect = svg.getBoundingClientRect();
      const s = Math.max(view.w / rect.width, view.h / rect.height);
      setView({ ...drag.v, x: drag.v.x - (ev.clientX - drag.x) * s, y: drag.v.y - (ev.clientY - drag.y) * s });
    });
    window.addEventListener("mouseup", () => { drag = null; svg.classList.remove("dragging"); });
  }

  // ---------- overlays ----------
  function clearOverlays() { gOverlay.innerHTML = ""; gMarker.innerHTML = ""; }

  function drawPath(nodes, color = "#2f6fde", width = 1.6, opacity = 0.9, dash = null) {
    if (!nodes || nodes.length < 2) return null;
    const d = nodes.map((n, i) => (i ? "L" : "M") + pos[n][0] + "," + pos[n][1]).join(" ");
    const attrs = { d, class: "ov-path nss", stroke: color, "stroke-width": width * 2.6, opacity };
    if (dash) attrs["stroke-dasharray"] = dash;
    const animate = !dash && !(typeof Player !== "undefined" && Player.playing);
    if (animate) { attrs.pathLength = 1; attrs.class += " anim"; }
    return el("path", attrs, gOverlay);
  }

  function ring(node, color, r = 2.8, width = 0.8) {
    return el("circle", { cx: pos[node][0], cy: pos[node][1], "data-rpx": r * 3, r: r * 3 * upp(), fill: "none", stroke: color, "stroke-width": width * 2.2, class: "ov-visit nss" }, gOverlay);
  }
  function dot(node, color, r = 2.2, opacity = 0.55) {
    return el("circle", { cx: pos[node][0], cy: pos[node][1], "data-rpx": r * 3, r: r * 3 * upp(), fill: color, opacity, class: "ov-visit" }, gOverlay);
  }
  function edge(a, b, color, width = 0.9, opacity = 0.8) {
    return el("line", { x1: pos[a][0], y1: pos[a][1], x2: pos[b][0], y2: pos[b][1], stroke: color, "stroke-width": width * 2.4, opacity, class: "ov-visit nss" }, gOverlay);
  }
  function text(node, str, color = "#000") {
    const t = el("text", { x: pos[node][0], y: pos[node][1], "font-size": 12 * upp(), "dominant-baseline": "central", "text-anchor": "middle", fill: color, "font-weight": 700, class: "ov-visit" }, gOverlay);
    t.textContent = str;
    return t;
  }

  function marker(node) {
    gMarker.innerHTML = "";
    if (node == null || node < 0) return;
    el("circle", { cx: pos[node][0], cy: pos[node][1], "data-rpx": 8, r: 8 * upp(), class: "marker nss" }, gMarker);
  }

  function markEnds(from, to) {
    gNodes.querySelectorAll(".sel-from,.sel-to").forEach(n => n.classList.remove("sel-from", "sel-to"));
    if (from != null && from >= 0) gNodes.querySelector(`[data-node="${from}"]`)?.classList.add("sel-from");
    if (to != null && to >= 0) gNodes.querySelector(`[data-node="${to}"]`)?.classList.add("sel-to");
  }

  function focusNodes(nodes) {
    if (!nodes || !nodes.length) return;
    const xs = nodes.map(n => pos[n][0]), ys = nodes.map(n => pos[n][1]);
    const x0 = Math.min(...xs) - 10, y0 = Math.min(...ys) - 10;
    const w0 = Math.max(...xs) - x0 + 10, h0 = Math.max(...ys) - y0 + 10;
    const w = Math.max(w0, 40), h = Math.max(h0, 30);          // keep small selections centred
    setView({ x: x0 - (w - w0) / 2, y: y0 - (h - h0) / 2, w, h });
  }

  function updateRoads(roads) { meta.roads = roads; drawRoads(); }

  return {
    init, fit, zoom, hideTip, clearOverlays, drawPath, ring, dot, edge, text, marker, markEnds, focusNodes, updateRoads,
    setLabelMode(m) { labelMode = m; drawLabels(); },
    setMetroVisible(v) { gMetro.style.display = v ? "" : "none"; },
    setNodeClick(fn) { onNodeClick = fn; },
    setRoadClick(fn) { onRoadClick = fn; svg.classList.toggle("closure-mode", !!fn); },
    TYPE_COLORS,
  };
})();
