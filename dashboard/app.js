/* app.js - PuneMarg dashboard shell + interactive labs (uses algos.js) */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const cv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const fmt = (x, d = 2) => (x === Infinity ? "∞" : (+x).toFixed(d));
  let city = null;
  const name = i => city.nodes[i].name;
  const b = i => `<b>${esc(name(i))}</b>`;

  // ------------------------------------------------------------------ shared widgets
  function placeOptions(sel) {
    return city.nodes.slice().sort((a, c) => a.name.localeCompare(c.name)).map(n => `<option value="${n.id}"${n.id === sel ? " selected" : ""}>${esc(n.name)}</option>`).join("");
  }
  const idByName = nm => city.nodes.find(n => n.name === nm).id;

  /** Replays a list of steps: first / prev / play / next / last / slider / speed. */
  function Player(host, onChange) {
    host.classList.add("player");
    host.innerHTML = `<button data-a="first" title="First step">⏮</button><button data-a="prev" title="Previous (←)">◀</button><button data-a="play" class="play" title="Play / pause (Space)">▶ Play</button><button data-a="next" title="Next (→)">▶|</button><button data-a="last" title="Jump to the end">⏭</button><input type="range" min="0" max="0" value="0" aria-label="Step"><span class="lbl"></span><select class="spd" title="Speed"><option value="1400">Slow</option><option value="700" selected>Normal</option><option value="160">Fast</option></select>`;
    const slider = $("input", host), lbl = $(".lbl", host), play = $(".play", host), spd = $(".spd", host);
    const P = { n: 1, i: 0, timer: null };
    function show() { slider.max = P.n - 1; slider.value = P.i; lbl.textContent = `Step ${P.i + 1} / ${P.n}`; onChange(P.i); }
    P.go = i => { P.i = Math.max(0, Math.min(P.n - 1, i)); show(); };
    P.set = (n, i = 0) => { P.stop(); P.n = Math.max(1, n); P.go(i); };
    P.stop = () => { clearInterval(P.timer); P.timer = null; play.textContent = "▶ Play"; };
    P.toggle = () => {
      if (P.timer) return P.stop();
      if (P.i >= P.n - 1) P.go(0);
      play.textContent = "⏸ Pause";
      const tick = () => { if (P.i >= P.n - 1) return P.stop(); P.go(P.i + 1); };
      P.timer = setInterval(tick, +spd.value);
    };
    spd.onchange = () => { if (P.timer) { P.stop(); P.toggle(); } };
    host.addEventListener("click", e => {
      const a = e.target.dataset && e.target.dataset.a; if (!a) return;
      if (a === "play") return P.toggle();
      P.stop(); if (a === "first") P.go(0); if (a === "prev") P.go(P.i - 1); if (a === "next") P.go(P.i + 1); if (a === "last") P.go(P.n - 1);
    });
    slider.oninput = () => { P.stop(); P.go(+slider.value); };
    return P;
  }

  /** Canvas map of all places and roads. draw() takes style callbacks, so every lab can colour it differently. */
  class MapView {
    constructor(canvas) {
      this.cv = canvas; this.pad = 22; this.clickCb = null;
      const lats = city.nodes.map(n => n.lat), lons = city.nodes.map(n => n.lon);
      this.b = { a: Math.min(...lats), z: Math.max(...lats), o: Math.min(...lons), w: Math.max(...lons) };
      canvas.addEventListener("click", ev => {
        if (!this.clickCb) return; const r = canvas.getBoundingClientRect(); const x = ev.clientX - r.left, y = ev.clientY - r.top;
        let best = -1, bd = 18; city.nodes.forEach(n => { const p = this.pt(n); const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = n.id; } });
        if (best >= 0) this.clickCb(best);
      });
    }
    size() { const w = this.cv.clientWidth || 600; const h = Math.round(Math.min(560, Math.max(320, w * 0.78))); const dpr = window.devicePixelRatio || 1; this.W = w; this.H = h; this.cv.width = w * dpr; this.cv.height = h * dpr; this.cv.style.height = h + "px"; this.dpr = dpr; }
    pt(n) { const { a, z, o, w } = this.b, p = this.pad; return { x: p + (n.lon - o) / (w - o) * (this.W - 2 * p), y: p + (z - n.lat) / (z - a) * (this.H - 2 * p) }; }
    draw(st) {
      this.size(); const g = this.cv.getContext("2d"); g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.clearRect(0, 0, this.W, this.H);
      const line = cv("--line"), muted = cv("--muted"), ink = cv("--ink");
      const P = city.nodes.map(n => this.pt(n));
      city.edges.forEach((e, i) => {
        const s = (st.edge && st.edge(i, e)) || { c: line, w: 1.2 };
        g.strokeStyle = s.c; g.lineWidth = s.w; g.setLineDash(s.dash || []); g.globalAlpha = s.a ?? 1; g.beginPath(); g.moveTo(P[e.a].x, P[e.a].y); g.lineTo(P[e.b].x, P[e.b].y); g.stroke();
      });
      g.setLineDash([]); g.globalAlpha = 1;
      city.nodes.forEach(n => { const s = (st.node && st.node(n.id)) || { c: muted, r: 2.6, a: .55 }; g.globalAlpha = s.a ?? 1; g.fillStyle = s.c; g.beginPath(); g.arc(P[n.id].x, P[n.id].y, s.r, 0, 7); g.fill(); if (s.ring) { g.strokeStyle = s.ring; g.lineWidth = 2; g.beginPath(); g.arc(P[n.id].x, P[n.id].y, s.r + 3, 0, 7); g.stroke(); } });
      g.globalAlpha = 1; g.font = "600 11.5px system-ui,sans-serif"; g.textBaseline = "middle";
      (st.labels || []).forEach(id => {
        const t = name(id).replace(/ \(.*\)/, ""); const p = P[id]; const w = g.measureText(t).width; let x = p.x + 8; if (x + w > this.W - 4) x = p.x - 8 - w; const y = Math.max(8, Math.min(this.H - 8, p.y - 9));
        g.lineWidth = 3.5; g.strokeStyle = cv("--card"); g.strokeText(t, x, y); g.fillStyle = ink; g.fillText(t, x, y);
      });
    }
  }

  const legend = items => `<div class="legend">${items.map(([c, t, ln]) => `<span><i class="${ln ? "ln" : ""}" style="background:${c}"></i>${t}</span>`).join("")}</div>`;
  const learnBox = (what, how, big, real) => `<details class="card learn" open><summary>📘 How it works</summary><p><b>Idea:</b> ${what}</p><ul>${how.map(x => `<li>${x}</li>`).join("")}</ul><p><b>Speed:</b> ${big}</p><p><b>In real life:</b> ${real}</p></details>`;
  const shell = (el, { icon, title, lead, controls, stage, side, learn, wide }) => {
    el.innerHTML = `<h2>${icon} ${title}</h2><p class="lead">${lead}</p><div class="labgrid${wide ? " wide" : ""}"><div class="card stage"><div class="controls">${controls || ""}</div>${stage}<div class="player-host"></div></div><aside class="side">${side}${learn}</aside></div>`;
    return { player: $(".player-host", el) };
  };
  const sayBox = `<div class="card say"><div class="h">What just happened</div><div class="txt"></div></div>`;
  const colorOf = r => `hsl(${(r * 47) % 360} 70% ${document.documentElement.dataset.theme === "dark" ? 62 : 45}%)`;

  // ------------------------------------------------------------------ LAB: Dijkstra + heap
  function dijkstraLab(el) {
    shell(el, {
      icon: "🚦", title: "Shortest Path Lab", lead: "How does a route planner pick the best road? <b>1.</b> Choose a start and an end (or click the map). <b>2.</b> Press ▶ Play. <b>3.</b> Read the box on the right: it explains each step in plain words.",
      controls: `<label>From<select class="from">${placeOptions(idByName("Swargate"))}</select></label><label>To<select class="to">${placeOptions(idByName("Shivajinagar"))}</select></label><label>Cost is<select class="mode"><option value="km">Distance (km)</option><option value="min">Travel time (min, with traffic)</option></select></label><label class="hr" hidden>Hour of day: <span class="hv">9</span>:00<input type="range" class="hour" min="0" max="23" value="9"></label>`,
      stage: `<canvas class="map"></canvas>${legend([["#16a34a", "start"], ["#dc2626", "destination"], ["#4f46e5", "settled (final answer known)"], ["#d97706", "in the heap (candidates)"], ["#16a34a", "best route", 1]])}`,
      side: `${sayBox}<div class="card ds"><h3>🧱 Priority queue (min-heap) right now</h3><div class="chips heap"></div><div class="kv"></div></div>`,
      learn: learnBox("Always expand the closest not-yet-final place. A <b>min-heap</b> hands us that place instantly.", ["Every place starts at distance ∞, the start at 0.", "<b>Pop</b> the smallest distance from the heap: that distance is now final.", "<b>Relax</b> each road out of it: if going through here is shorter, update the neighbour and <b>push</b> it on the heap.", "Stop as soon as the destination is popped."], "O((V + E) log V). The heap makes “find the closest” cost log V instead of scanning all V places.", "Google Maps style routing, network packet routing (OSPF), game AI path finding.")
    });
    const sel = c => $(c, el); const canvas = sel("canvas"); const map = new MapView(canvas);
    let R = null, mode = "km";
    const wfn = () => mode === "km" ? e => e.km : (h => e => e.km / e.speed * 60 * (city.traffic[e.id] ? city.traffic[e.id][h] : 1))(+sel(".hour").value);
    const P = Player($(".player-host", el), i => render(i));
    function run() {
      mode = sel(".mode").value; sel(".hr").hidden = mode === "km"; sel(".hv").textContent = sel(".hour").value;
      const s = +sel(".from").value, t = +sel(".to").value;
      R = { s, t, ...A.dijkstraSteps(city.nodes.length, A.buildAdj(city.nodes.length, city.edges, wfn()), s, t) };
      P.set(R.steps.length);
    }
    function render(i) {
      if (!R) return; const st = R.steps[i], unit = mode === "km" ? "km" : "min", last = i === R.steps.length - 1;
      const settled = new Set(R.settled.slice(0, st.settledCount)); const frontier = new Set(st.frontier || []);
      const tree = new Set(); settled.forEach(v => { if (R.prevEdge[v] >= 0) tree.add(R.prevEdge[v]); });
      const relaxE = new Set(st.relaxed.map(r => r.e)); const pathE = new Set(); const pathN = new Set();
      if (last && R.path.length > 1) R.path.forEach((v, k) => { pathN.add(v); if (k) pathE.add(R.prevEdge[v]); });
      const labels = new Set([R.s, R.t, st.u, ...pathN, ...st.relaxed.map(r => r.to)]);
      map.draw({
        edge: (ei) => pathE.has(ei) ? { c: cv("--green"), w: 5 } : relaxE.has(ei) ? { c: cv("--amber"), w: 3, dash: [5, 4] } : tree.has(ei) ? { c: cv("--accent"), w: 2.4 } : null,
        node: id => id === R.s ? { c: cv("--green"), r: 7 } : id === R.t ? { c: cv("--red"), r: 7 } : id === st.u ? { c: cv("--ink"), r: 6, ring: cv("--accent") } : pathN.has(id) ? { c: cv("--green"), r: 5 } : settled.has(id) ? { c: cv("--accent"), r: 4 } : frontier.has(id) ? { c: cv("--amber"), r: 4.5 } : null,
        labels: [...labels]
      });
      let t;
      if (st.kind === "init") t = `Start at ${b(R.s)} with distance <b>0</b>. Every other place is <b>∞</b> (not reached yet). The heap holds just the start.`;
      else {
        t = `Pop the closest place from the heap: ${b(st.u)} at <b>${fmt(st.d)} ${unit}</b>. This number is now <b>final</b>.`;
        if (st.relaxed.length) t += `<ul>${st.relaxed.slice(0, 7).map(r => `<li>→ ${esc(name(r.to))}: ${fmt(st.d)} + ${fmt(r.nd - st.d)} = <b>${fmt(r.nd)}</b> ${r.improved ? `<span class="ok">better than ${fmt(r.was)} → update &amp; push</span>` : `<span class="no">not better than ${fmt(r.was)} → ignore</span>`}</li>`).join("")}${st.relaxed.length > 7 ? `<li>…and ${st.relaxed.length - 7} more roads</li>` : ""}</ul>`;
        else t += " All its neighbours are already final.";
      }
      if (last) t += R.path.length ? `<br><br>🎯 <b>Done.</b> Best route: ${R.path.map(v => esc(name(v))).join(" → ")}<br><b>${fmt(R.dist[R.t])} ${unit}</b> · looked at only <b>${st.settledCount}</b> of ${city.nodes.length} places (stopped early).` : `<br><br>No route exists between these places.`;
      $(".txt", sel(".say")).innerHTML = t;
      sel(".heap").innerHTML = st.heap.slice(0, 9).map((x, k) => `<span class="chip ${k ? "" : "first"}">${esc(name(x[1]).replace(/ \(.*\)/, ""))} · ${fmt(x[0], 1)}</span>`).join("") + (st.heap.length > 9 ? `<span class="chip">+${st.heap.length - 9} more</span>` : "") || `<span class="chip">empty</span>`;
      sel(".kv").innerHTML = `<div><b>${st.heap.length}</b><span>items in heap</span></div><div><b>${st.pops}</b><span>pops so far</span></div><div><b>${st.pushes}</b><span>pushes so far</span></div><div><b>${st.settledCount}</b><span>places finalised</span></div>`;
    }
    ["from", "to", "mode", "hour"].forEach(c => sel("." + c).addEventListener("input", run));
    let nextIsTo = true; map.clickCb = id => { sel(nextIsTo ? ".to" : ".from").value = id; nextIsTo = !nextIsTo; run(); };
    run();
    return { player: P, show: () => render(P.i) };
  }

  // ------------------------------------------------------------------ LAB: Kruskal + Union-Find
  function mstLab(el) {
    shell(el, {
      icon: "🕸️", title: "Road Backbone Lab", lead: "<b>Question:</b> what is the least road length that still connects every place? <b>Try it:</b> press ▶ Play and watch cheap roads join groups of places. Roads that would only make a loop get rejected.",
      stage: `<canvas class="map"></canvas>${legend([["#16a34a", "road kept", 1], ["#d97706", "road being checked", 1], ["#dc2626", "rejected (would form a loop)", 1], ["#4f46e5", "colour = which group a place is in"]])}`,
      side: `${sayBox}<div class="card ds"><h3>🧱 Union-Find (disjoint sets)</h3><div class="kv"></div><p class="note">Each group is a tree of parent pointers. “Same root” = “already connected”.</p></div>`,
      learn: learnBox("<b>Kruskal's algorithm:</b> sort all roads shortest-first, keep a road only if it joins two groups that are not yet connected.", ["Start: every place is its own group.", "Take the next shortest road. <b>find</b> the group of both ends.", "Different groups → keep road, <b>union</b> (merge) them. Same group → skip.", "After V−1 roads everything is connected."], "Sorting E roads is O(E log E); Union-Find with path compression is almost O(1) per check.", "Laying cable / pipes / roads cheaply, clustering data, detecting cycles.")
    });
    const sel = c => $(c, el); const map = new MapView(sel("canvas"));
    const R = A.kruskalSteps(city); const allKm = city.edges.reduce((s, e) => s + e.km, 0);
    const P = Player($(".player-host", el), i => render(i));
    P.set(R.steps.length + 1);
    function render(i) {
      const done = R.steps.slice(0, i); const added = new Set(), rej = new Set(); done.forEach(s => (s.added ? added : rej).add(s.edge));
      const cur = i > 0 ? R.steps[i - 1] : null; const roots = cur ? cur.roots : null;
      const size = {}; if (roots) roots.forEach(r => size[r] = (size[r] || 0) + 1);
      const labels = cur ? [city.edges[cur.edge].a, city.edges[cur.edge].b] : [];
      map.draw({
        edge: ei => cur && cur.edge === ei ? { c: cv("--amber"), w: 5 } : added.has(ei) ? { c: cv("--green"), w: 3 } : rej.has(ei) ? { c: cv("--red"), w: 1.2, dash: [3, 3], a: .55 } : { c: cv("--line"), w: 1, a: .8 },
        node: id => roots && size[roots[id]] > 1 ? { c: colorOf(roots[id]), r: 4.5 } : null, labels
      });
      let t;
      if (!cur) t = `We have <b>${city.nodes.length}</b> places and <b>${city.edges.length}</b> roads. Sorted shortest-first, the roads wait in line. Press ▶ to start.`;
      else {
        const e = city.edges[cur.edge];
        t = `Road #${cur.k + 1} of ${R.steps.length} (shortest first): <b>${esc(e.name)}</b>, ${esc(name(e.a))} ↔ ${esc(name(e.b))}, <b>${fmt(e.km, 1)} km</b>.<br>find(${esc(name(e.a))}) → group of <b>${esc(name(cur.ra))}</b>; find(${esc(name(e.b))}) → group of <b>${esc(name(cur.rb))}</b>.<br>` +
          (cur.added ? `<span class="ok">Different groups → KEEP this road and merge the two groups.</span>` : `<span class="no">Same group → SKIP. They are already connected, so this road would only create a loop.</span>`);
        if (i === R.steps.length + 0 && cur.sets === 1) t += `<br><br>🎯 Everything is connected with just <b>${R.tree.length}</b> roads totalling <b>${fmt(R.total, 1)} km</b>, instead of ${fmt(allKm, 1)} km for all roads.`;
      }
      $(".txt", sel(".say")).innerHTML = t;
      const c = cur || { sets: city.nodes.length, treeSize: 0, total: 0 };
      sel(".kv").innerHTML = `<div><b>${c.sets}</b><span>separate groups</span></div><div><b>${c.treeSize} / ${city.nodes.length - 1}</b><span>roads kept</span></div><div><b>${fmt(c.total, 1)} km</b><span>length of backbone so far</span></div><div><b>${fmt(allKm, 1)} km</b><span>length of ALL roads</span></div>`;
    }
    return { player: P, show: () => render(P.i) };
  }

  // ------------------------------------------------------------------ LAB: Network analysis (components, Floyd-Warshall, top-K heap)
  function netLab(el) {
    const n = city.nodes.length;
    const fw = A.floyd(n, city.edges, e => e.km);
    const comps = A.components(n, city.edges);
    const ecc = city.nodes.map((_, i) => Math.max(...Array.from(fw.dist[i]).filter(d => d < fw.INF)));
    const order = ecc.map((e, i) => i).sort((x, y) => ecc[x] - ecc[y]);
    const deg = new Array(n).fill(0); city.edges.forEach(e => { deg[e.a]++; deg[e.b]++; });
    shell(el, {
      icon: "🧮", title: "Network Analysis Lab", lead: "Three classic ideas on one map. <b>Pick two places</b> to look up their shortest distance instantly, see which place is the <b>centre</b> of the city, and see the <b>busiest junctions</b> found with a small heap.",
      controls: `<label>From<select class="from">${placeOptions(idByName("Swargate"))}</select></label><label>To<select class="to">${placeOptions(idByName("COEP"))}</select></label><label>Top-K list<select class="metric"><option value="deg">most roads (junction degree)</option><option value="rating">best rated places</option></select></label><label>K = <span class="kv2">5</span><input type="range" class="k" min="3" max="10" value="5"></label>`,
      stage: `<canvas class="map"></canvas>${legend([["#16a34a", "centre of the city"], ["#dc2626", "furthest outskirts"], ["#d97706", "top-K list"], ["#4f46e5", "chosen route", 1]])}`,
      side: `<div class="card say"><div class="h">Distance lookup · Floyd–Warshall</div><div class="txt pair"></div></div><div class="card"><h3>🏙️ City facts · Union-Find</h3><div class="kv facts"></div></div><div class="card"><h3>🔝 Top-K with a min-heap</h3><div class="txt topk"></div></div>`,
      learn: learnBox("<b>Floyd–Warshall</b> (dynamic programming) pre-computes the shortest distance between <i>every</i> pair of places.", ["For each possible middle stop k, ask: is i → k → j shorter than the best i → j found so far?", "After all k are tried, the V×V table is complete: any question is one lookup.", "<b>Centre</b> = place whose farthest destination is the nearest (smallest “eccentricity”).", "<b>Top-K</b>: keep a heap of size K; a new item only enters if it beats the heap's smallest."], "Floyd–Warshall O(V³) once, then O(1) per query. Top-K is O(n log K) instead of sorting everything in O(n log n).", "Choosing where to put a hospital or warehouse (graph centre), leaderboards, “top 10” lists.")
    });
    const sel = c => $(c, el); const map = new MapView(sel("canvas"));
    $(".facts", el).innerHTML = `<div><b>${n}</b><span>places</span></div><div><b>${city.edges.length}</b><span>roads</span></div><div><b>${comps.length}</b><span>connected part${comps.length > 1 ? "s" : "" } (Union-Find)</span></div><div><b>${fw.ops.toLocaleString()}</b><span>Floyd–Warshall steps (V³)</span></div>`;
    const render = () => {
      const s = +sel(".from").value, t = +sel(".to").value, k = +sel(".k").value; sel(".kv2").textContent = k;
      const path = A.fwPath(fw, s, t); const pe = new Set(); for (let i = 1; i < path.length; i++) city.edges.forEach((e, ei) => { const u = path[i - 1], v = path[i]; if ((e.a === u && e.b === v) || (e.b === u && e.a === v)) pe.add(ei); });
      const centre = order[0], edge3 = order.slice(-3);
      const metric = sel(".metric").value; const tk = A.topK(city.nodes, k, x => metric === "deg" ? deg[x.id] : x.rating);
      const topIds = new Set(tk.top.map(x => x.item.id));
      sel(".pair").innerHTML = path.length ? `Look up <b>dist[${esc(name(s))}][${esc(name(t))}]</b> → <b>${fmt(fw.dist[s][t], 1)} km</b> (one array read).<br>Route rebuilt from the “next hop” table:<br>${path.map(v => esc(name(v))).join(" → ")}` : "No route between these places.";
      sel(".topk").innerHTML = `<ol style="margin:0 0 6px;padding-left:20px">${tk.top.map(x => `<li>${esc(x.item.name)} <span class="note">· ${metric === "deg" ? x.score + " roads" : x.score.toFixed(1) + " ★"}</span></li>`).join("")}</ol><p class="note">Scanned ${n} places; the heap never held more than ${k}. ${tk.steps.filter(x => x.action === "replace").length} replacements, ${tk.steps.filter(x => x.action === "skip").length} places skipped without touching the heap.</p><p class="note">🏙️ City centre (smallest farthest-distance): ${b(centre)} — everything is within ${fmt(ecc[centre], 1)} km.</p>`;
      map.draw({
        edge: ei => pe.has(ei) ? { c: cv("--accent"), w: 5 } : null,
        node: id => id === centre ? { c: cv("--green"), r: 8 } : edge3.includes(id) ? { c: cv("--red"), r: 6 } : topIds.has(id) ? { c: cv("--amber"), r: 6 } : path.includes(id) ? { c: cv("--accent"), r: 4.5 } : null,
        labels: [s, t, centre, ...edge3, ...topIds]
      });
    };
    ["from", "to", "metric", "k"].forEach(c => sel("." + c).addEventListener("input", render));
    let nextTo = true; map.clickCb = id => { sel(nextTo ? ".to" : ".from").value = id; nextTo = !nextTo; render(); };
    render(); return { show: render };
  }

  // ------------------------------------------------------------------ LAB: Traffic ranges (segment tree + Fenwick)
  function trafficLab(el) {
    const roads = city.edges.filter(e => city.traffic[e.id]);
    const defRoad = roads.find(e => /Karve|FC/.test(e.name)) || roads[0];
    shell(el, {
      wide: 1, icon: "📊", title: "Traffic Range Lab", lead: "<b>Question:</b> “How busy is this road between 8 am and 11 am?” <b>Try it:</b> pick a road, drag the hour range, and see which tree boxes are used. <b>Click a bar</b> to add a traffic jam at that hour and watch only a few boxes update.",
      controls: `<label>Road<select class="road">${roads.map(e => `<option value="${e.id}"${e === defRoad ? " selected" : ""}>${esc(e.name)} (${esc(name(e.a))} – ${esc(name(e.b))})</option>`).join("")}</select></label><label>Question<select class="qm"><option value="sum">Average congestion</option><option value="max">Worst congestion</option></select></label><label>From hour <span class="lv">8</span><input type="range" class="l" min="0" max="23" value="8"></label><label>To hour <span class="rv">11</span><input type="range" class="r" min="0" max="23" value="11"></label><button class="btn reset">Reset jams</button>`,
      stage: `<svg class="bars" viewBox="0 0 760 170" width="100%"></svg><h3 style="margin-top:8px">Segment tree (each box pre-computes its hours)</h3><svg class="tree" viewBox="0 0 860 290" width="100%"></svg>${legend([["#16a34a", "box used as-is for the answer"], ["#d97706", "box split further"], ["#9aa6bd", "box not needed (outside range)"], ["#dc2626", "box updated by a new jam"]])}`,
      side: `<div class="card say"><div class="h">Answer</div><div class="txt ans"></div></div><div class="card"><h3>🌲 Compared with the plain way</h3><div class="txt cmp"></div></div>`,
      learn: learnBox("A <b>segment tree</b> stores the answer for blocks of hours: leaves are single hours, each parent covers its two children. Any range is built from a few ready-made blocks.", ["Root covers hours 0–23 (padded to 32). Children split the range in half.", "A query walks down: <b>fully inside</b> → take the box; <b>outside</b> → ignore; <b>partly</b> → look at both children.", "An update changes one leaf and fixes its ancestors only (about log₂ 32 = 5 boxes).", "<b>Fenwick tree</b> (binary indexed tree) does the same for sums with just an array and bit tricks."], "Query and update are both O(log n). A plain loop is O(n) per query.", "Stock charts, analytics dashboards, game leaderboards, range-sum questions in databases.")
    });
    const sel = c => $(c, el); let base = [], arr = [], touched = new Set(), jam = new Set();
    const loadRoad = () => { base = city.traffic[+sel(".road").value].slice(); arr = base.slice(); touched = new Set(); jam = new Set(); render(); };
    function render() {
      let l = +sel(".l").value, r = +sel(".r").value; if (l > r) [l, r] = [r, l]; sel(".lv").textContent = l; sel(".rv").textContent = r;
      const mode = sel(".qm").value, seg = new A.SegTree(arr, mode), q = seg.query(l, r); const fen = new A.Fenwick(arr);
      const state = {}; q.visits.forEach(v => state[v.idx] = v.state);
      // bars
      const mx = Math.max(3.2, ...arr), bw = 28; let s = "";
      arr.forEach((v, h) => { const ht = v / mx * 120, x = 20 + h * bw, inR = h >= l && h <= r; s += `<g data-h="${h}" style="cursor:pointer"><rect x="${x}" y="${135 - ht}" width="${bw - 6}" height="${ht}" rx="3" fill="${jam.has(h) ? cv("--red") : inR ? cv("--accent") : cv("--line")}"/><title>${h}:00 → ×${v.toFixed(2)}</title><text x="${x + (bw - 6) / 2}" y="${130 - ht}" font-size="8.5" text-anchor="middle">${v.toFixed(1)}</text><text x="${x + (bw - 6) / 2}" y="152" font-size="9.5" text-anchor="middle" fill="${cv("--muted")}">${h % 3 === 0 ? h : ""}</text></g>`; });
      s += `<text x="20" y="167" font-size="10.5" fill="${cv("--muted")}">hour of day · bar height = congestion factor (1.0 = free flow). Click a bar to simulate a jam.</text>`;
      sel(".bars").innerHTML = s;
      // tree
      const N = seg.n, lv = Math.log2(N), cell = 840 / N; let t = "", pos = {};
      for (let L = 0; L <= lv; L++) for (let j = 0; j < (1 << L); j++) { const idx = (1 << L) + j; const w = N / (1 << L); pos[idx] = { x: 10 + (j * w + w / 2) * cell, y: 20 + L * 50, lo: j * w, hi: j * w + w - 1 }; }
      for (let idx = 2; idx < 2 * N; idx++) { const a = pos[idx], p = pos[idx >> 1]; if (a.lo >= seg.len) continue; t += `<line x1="${p.x}" y1="${p.y + 12}" x2="${a.x}" y2="${a.y - 12}" stroke="${cv("--line")}"/>`; }
      for (let idx = 1; idx < 2 * N; idx++) {
        const p = pos[idx]; if (p.lo >= seg.len) continue; const w = Math.min(cell * (p.hi - p.lo + 1) - 3, 58), st = state[idx];
        const fill = st === "taken" ? cv("--green") : st === "partial" ? cv("--amber") : cv("--card"); const op = st === "skipped" ? .4 : st ? 1 : .8;
        const val = seg.t[idx]; const txt = mode === "max" ? val.toFixed(1) : (val >= 100 ? val.toFixed(0) : val.toFixed(1));
        t += `<g opacity="${op}"><rect x="${p.x - w / 2}" y="${p.y - 12}" width="${w}" height="24" rx="5" fill="${fill}" stroke="${touched.has(idx) ? cv("--red") : cv("--line")}" stroke-width="${touched.has(idx) ? 3 : 1}"/><title>hours ${p.lo}–${Math.min(p.hi, seg.len - 1)}: ${val.toFixed(2)}</title><text x="${p.x}" y="${p.y + 4}" font-size="${idx >= N ? 8.5 : 10.5}" text-anchor="middle" fill="${st === "taken" ? "#fff" : cv("--ink")}">${txt}</text></g>`;
      }
      sel(".tree").innerHTML = t;
      // answer
      const taken = q.visits.filter(v => v.state === "taken"), cnt = r - l + 1;
      const ans = mode === "sum" ? q.value / cnt : q.value;
      sel(".ans").innerHTML = `${mode === "sum" ? "Average" : "Worst"} congestion from <b>${l}:00</b> to <b>${r}:00</b> = <b style="font-size:22px">×${ans.toFixed(2)}</b><br><span class="note">${ans < 1.3 ? "Mostly free-flowing." : ans < 1.9 ? "Moderately busy." : "Heavy traffic."}</span>`;
      const fenTxt = mode === "sum" ? (() => { const A1 = fen.prefix(r), B1 = l > 0 ? fen.prefix(l - 1) : { used: [], sum: 0 }; return `<li><b>Fenwick tree:</b> prefix(${r}) − prefix(${l - 1}) reads cells [${A1.used.join(", ")}] and [${B1.used.join(", ") || "none"}] = ${A1.used.length + B1.used.length} reads.</li>`; })() : `<li><b>Fenwick tree:</b> only handles sums (max cannot be “subtracted”), so use the segment tree here.</li>`;
      sel(".cmp").innerHTML = `<ul style="margin:0;padding-left:18px"><li><b>Plain loop:</b> read ${cnt} hour${cnt > 1 ? "s" : ""} one by one.</li><li><b>Segment tree:</b> visited ${q.visits.length} boxes, used ${taken.length} ready-made block${taken.length > 1 ? "s" : ""} (hours ${taken.map(v => v.lo === v.hi ? v.lo : v.lo + "–" + v.hi).join(", ")}).</li>${fenTxt}</ul><p class="note">With only 24 numbers the gain is small. With a year of per-minute data (525,600 numbers) a range question needs about 40 boxes instead of half a million reads.</p>${touched.size ? `<p class="note">💥 Your last jam changed only <b>${touched.size}</b> boxes (the leaf and its ancestors), not all of them.</p>` : ""}`;
    }
    sel(".bars").addEventListener("click", ev => {
      const g = ev.target.closest("g[data-h]"); if (!g) return; const h = +g.dataset.h; const seg = new A.SegTree(arr, sel(".qm").value);
      if (jam.has(h)) { jam.delete(h); arr[h] = base[h]; } else { jam.add(h); arr[h] = 3.5; }
      touched = new Set(seg.update(h, arr[h])); render();
    });
    sel(".reset").onclick = loadRoad;
    ["road"].forEach(c => sel("." + c).addEventListener("input", loadRoad));
    ["qm", "l", "r"].forEach(c => sel("." + c).addEventListener("input", () => { touched = new Set(); render(); }));
    loadRoad(); return { show: render };
  }

  // ------------------------------------------------------------------ LAB: Trie + KMP text search
  function textLab(el) {
    const trie = new A.Trie(); city.nodes.forEach(n => trie.insert(n.name.toLowerCase(), n.id));
    shell(el, {
      icon: "🔤", title: "Text Search Lab", lead: "Two ways to find places by name. <b>Trie:</b> type the first letters and get suggestions. <b>KMP:</b> find a piece of text <i>inside</i> a longer text without ever re-reading letters.",
      controls: `<label>Trie: start typing a place<input type="text" class="pre" value="sh" placeholder="e.g. sh" autocomplete="off"></label><label>KMP: text<input type="text" class="txt2" list="plc" value="Shivajinagar" autocomplete="off"></label><label>KMP: find<input type="text" class="pat" value="naga" autocomplete="off"></label><button class="btn nasty" title="Repetitive text is where naive search struggles">Try a nasty case</button><datalist id="plc">${city.nodes.map(n => `<option value="${esc(n.name)}">`).join("")}</datalist>`,
      stage: `<h3>① Trie: letters become a path</h3><div class="trie"></div><h3 style="margin-top:14px">② KMP: step through a match</h3><div class="kmpwrap"></div>`,
      side: `${sayBox}<div class="card"><h3>🔎 Whole-city KMP search</h3><div class="allkmp"></div></div>`,
      learn: learnBox("<b>Trie</b> (prefix tree): one node per letter, so all names starting with “sh” share the same two nodes. <b>KMP</b> pre-computes a <i>failure table</i> so after a mismatch it knows how far it can safely fall back.", ["Trie: walk one letter at a time. If a letter is missing, nothing matches. Otherwise everything below that node is a suggestion.", "KMP: the text pointer i only moves forward. On a mismatch, only the pattern pointer j jumps back to table[j−1].", "The table says: “the longest prefix of the pattern that is also a suffix of what I just matched”."], "Trie lookup O(length of word), independent of how many names exist. KMP O(text + pattern) vs naive O(text × pattern).", "Search-box autocomplete, spell checkers, IP routing (tries); text editors' find, DNA search (KMP).")
    });
    const sel = c => $(c, el); let K = null;
    const P = Player($(".player-host", el), i => renderK(i));
    function renderTrie() {
      const raw = sel(".pre").value.toLowerCase(); const { out, walk } = trie.suggest(raw, 8);
      sel(".trie").innerHTML = `<div class="chips">${walk.path.map((p, i) => `<span class="chip ${p.found ? (i === walk.path.length - 1 ? "first" : "") : ""}" style="${p.found ? "" : "color:var(--red);border-color:var(--red)"}">${i ? esc(p.ch) : "root"}${p.found ? ` <small>· ${p.kids} branch${p.kids === 1 ? "" : "es"}</small>` : " ✘"}</span>`).join("→")}</div>` +
        (out.length ? `<ul class="sug">${out.map(o => `<li>📍 <b>${esc(raw)}</b>${esc(o.text.slice(raw.length))} <span class="note">· ${esc(city.nodes[o.payload].type)}</span></li>`).join("")}</ul>` : `<p class="no">No place starts with “${esc(raw)}”: the walk stopped at the ✘ letter.</p>`) +
        `<p class="note">Found with <b>${raw.length}</b> letter steps. Scanning the whole list would take ${city.nodes.length} comparisons. The trie holds ${trie.nodes} letter-nodes for ${city.nodes.length} names.</p>`;
    }
    function renderAll() {
      const p = sel(".pat").value.toLowerCase(); if (!p) { sel(".allkmp").innerHTML = "<p class='note'>Type something to find.</p>"; return; }
      let kc = 0, nc = 0; const hits = []; city.nodes.forEach(n => { const t = n.name.toLowerCase(), r = A.kmpSteps(t, p); kc += r.cmp; nc += A.naiveCount(t, p); if (r.found.length) hits.push(n.name); });
      sel(".allkmp").innerHTML = `<p>“${esc(p)}” appears in <b>${hits.length}</b> place name${hits.length === 1 ? "" : "s"}.</p><div class="chips">${hits.slice(0, 8).map(h => `<span class="chip">${esc(h)}</span>`).join("")}${hits.length > 8 ? `<span class="chip">+${hits.length - 8}</span>` : ""}</div><p class="note">Letter comparisons over all ${city.nodes.length} names: KMP <b>${kc}</b> vs naive <b>${nc}</b>. Names are short, so they are similar here. KMP's promise is a <i>guarantee</i>: never more than 2 × text length. Press <b>Try a nasty case</b> to see it win big.</p>`;
    }
    function runK() {
      const t = sel(".txt2").value.toLowerCase(), p = sel(".pat").value.toLowerCase();
      if (!p || !t) { K = null; sel(".kmpwrap").innerHTML = "<p class='note'>Enter some text and a pattern.</p>"; return; }
      K = { t, p, ...A.kmpSteps(t, p) }; P.set(K.steps.length);
    }
    function renderK(i) {
      if (!K) return; const st = K.steps[i], { t, p } = K; const s0 = st.i - st.j;
      const foundSet = new Set(); K.steps.slice(0, i + 1).forEach(x => { if (x.found) for (let q = 0; q < p.length; q++) foundSet.add(x.i - p.length + 1 + q); });
      let tr = "", pr = " ".repeat(Math.max(0, s0));
      for (let q = 0; q < t.length; q++) { const cls = q === st.i ? (st.ok ? "c" : "b") : (q >= s0 && q < st.i ? "m" : ""); tr += `<span class="${cls} ${foundSet.has(q) ? "f" : ""}">${esc(t[q])}</span>`; }
      for (let q = 0; q < p.length; q++) { const cls = q === st.j ? (st.ok ? "c" : "b") : q < st.j ? "m" : ""; pr += `<span class="${cls}">${esc(p[q])}</span>`; }
      sel(".kmpwrap").innerHTML = `<pre class="kmp">text    ${tr}\npattern ${pr}</pre><div><span class="note">Failure table (how far to fall back):</span> <span class="ftable">${[...p].map((c, k) => `<div>${esc(c)}<br><span class="r2">${K.table[k]}</span></div>`).join("")}</span></div>`;
      const sayT = $(".txt", sel(".say"));
      sayT.innerHTML = `Compare text letter <b>“${esc(t[st.i])}”</b> (position ${st.i + 1}) with pattern letter <b>“${esc(p[st.j])}”</b> (position ${st.j + 1}).<br>` +
        (st.ok ? `<span class="ok">Match.</span> ${st.found ? `🎯 The whole pattern matched, starting at position <b>${st.i - p.length + 2}</b>.` : "Move both pointers forward."}` : (st.j === 0 ? `<span class="no">Mismatch</span> and nothing matched yet, so just move on in the text.` : `<span class="no">Mismatch.</span> Instead of restarting, the table says we already matched the first <b>${st.f}</b> letter${st.f === 1 ? "" : "s"} of the pattern: slide the pattern and keep the text pointer where it is.`)) +
        `<br><span class="note">Total comparisons KMP needs: ${K.cmp} (naive: ${A.naiveCount(t, p)}). Matches: ${K.found.length ? K.found.map(x => x + 1).join(", ") : "none"}.</span>`;
    }
    ["pre"].forEach(c => sel("." + c).addEventListener("input", renderTrie));
    ["txt2", "pat"].forEach(c => sel("." + c).addEventListener("input", () => { runK(); renderAll(); }));
    sel(".nasty").onclick = () => { sel(".txt2").value = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaab"; sel(".pat").value = "aaaaaab"; runK(); renderAll(); };
    renderTrie(); renderAll(); runK(); return { player: P, show: () => { renderTrie(); renderK(P.i); } };
  }

  // ------------------------------------------------------------------ LAB: Topological sort
  function taskLab(el) {
    const tasks = ["Survey route", "Buy land", "Shift utilities", "Design stations", "Excavation", "Lay tracks", "Build stations", "Install signals", "Safety trials", "Open to public"];
    const baseDeps = [[0, 1], [0, 2], [0, 3], [1, 4], [2, 4], [3, 6], [4, 5], [4, 6], [5, 7], [6, 7], [7, 8], [8, 9]];
    const posn = [[70, 130], [200, 50], [200, 130], [200, 210], [350, 90], [480, 50], [480, 180], [610, 115], [730, 115], [850, 115]];
    shell(el, {
      wide: 1, icon: "🏗️", title: "Work Order Lab", lead: "<b>Question:</b> a new metro line has tasks that depend on each other. In what order can they be done? <b>Try it:</b> press ▶ Play, then tick “add a circular rule” to see how the algorithm notices an impossible plan.",
      controls: `<label style="flex-direction:row;display:flex;gap:6px;align-items:center;font-size:13.5px"><input type="checkbox" class="cyc"> Add circular rule: “Survey route” can only start after “Open to public”</label>`,
      stage: `<svg class="dag" viewBox="0 0 930 270" width="100%"></svg><h3>Ready queue (tasks with nothing left to wait for)</h3><div class="chips queue"></div><h3>Finished order so far</h3><div class="chips order"></div>`,
      side: `${sayBox}<div class="card ds"><h3>🧱 Queue + in-degree counts</h3><p class="note">Number on each task = how many unfinished tasks it still waits for (its <b>in-degree</b>). Zero means ready.</p></div>`,
      learn: learnBox("<b>Topological sort</b> (Kahn's algorithm) lines up tasks so every task comes after all the tasks it depends on. It works only if there is no circular dependency.", ["Count, for each task, how many tasks it waits for (in-degree).", "Put every task with 0 in a <b>queue</b>.", "Take one from the queue, “finish” it: lower the count of every task that was waiting on it. Any count that reaches 0 joins the queue.", "If the queue empties before all tasks are done → there is a cycle (a circular rule)."], "O(V + E): each task and each dependency is touched once.", "Build systems (make, npm install), course prerequisites, spreadsheets' cell recalculation, project planning.")
    });
    const sel = c => $(c, el); let R = null, deps = baseDeps;
    const P = Player($(".player-host", el), i => render(i));
    function run() { deps = sel(".cyc").checked ? baseDeps.concat([[9, 0]]) : baseDeps; R = A.topoSteps(tasks, deps); P.set(R.steps.length); }
    function render(i) {
      const st = R.steps[i], last = i === R.steps.length - 1; let s = `<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="${cv("--muted")}"/></marker></defs>`;
      deps.forEach(([a, c]) => { const A1 = posn[a], B1 = posn[c], back = a === 9; const dx = B1[0] - A1[0], dy = B1[1] - A1[1], d = Math.hypot(dx, dy) || 1; const x1 = A1[0] + dx / d * 52, y1 = A1[1] + dy / d * 18, x2 = B1[0] - dx / d * 56, y2 = B1[1] - dy / d * 22; s += back ? `<path d="M ${A1[0]} ${A1[1] + 22} Q 460 265 ${B1[0]} ${B1[1] + 22}" fill="none" stroke="${cv("--red")}" stroke-width="2" stroke-dasharray="5 4" marker-end="url(#ar)"/>` : `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${cv("--muted")}" stroke-width="1.6" marker-end="url(#ar)"/>`; });
      tasks.forEach((tn, k) => { const [x, y] = posn[k]; const done = st.order.includes(k), ready = st.queue.includes(k), cur = st.u === k; const fill = cur ? cv("--accent") : done ? cv("--green") : ready ? cv("--amber") : cv("--card");
        s += `<g><rect x="${x - 54}" y="${y - 20}" width="108" height="40" rx="10" fill="${fill}" stroke="${cv("--line")}" stroke-width="1.5"/><text x="${x}" y="${y + 4}" font-size="12.5" font-weight="600" text-anchor="middle" fill="${cur || done ? "#fff" : cv("--ink")}">${esc(tn)}</text><circle cx="${x - 54}" cy="${y - 20}" r="10" fill="${cv("--card")}" stroke="${cv("--line")}"/><text x="${x - 54}" y="${y - 16}" font-size="11" text-anchor="middle">${st.indeg[k]}</text></g>`; });
      sel(".dag").innerHTML = s;
      sel(".queue").innerHTML = st.queue.map((k, j) => `<span class="chip ${j ? "" : "first"}">${esc(tasks[k])}</span>`).join("") || `<span class="chip">empty</span>`;
      sel(".order").innerHTML = st.order.map((k, j) => `<span class="chip">${j + 1}. ${esc(tasks[k])}</span>`).join("") || `<span class="chip">nothing yet</span>`;
      let t;
      if (st.kind === "init") t = `Count what each task waits for (the small numbers). Only <b>${esc(tasks[st.queue[0]])}</b> waits for nothing, so it goes into the ready queue.`;
      else t = `Take <b>${esc(tasks[st.u])}</b> from the front of the queue and finish it.${st.released.length ? `<br>That frees <b>${st.released.map(k => esc(tasks[k])).join(", ")}</b>: their waiting-count reached 0, so they join the queue.` : "<br>Nothing new became ready."}`;
      if (last) t += R.cycle ? `<br><br><span class="no">⚠ The queue is empty but ${R.stuck.length} tasks are still waiting (${R.stuck.map(k => esc(tasks[k])).join(", ")}). They wait on each other in a circle, so <b>no valid order exists</b>.</span>` : `<br><br>🎯 <span class="ok">All ${tasks.length} tasks ordered.</span> Several other valid orders exist too; any order that respects the arrows works.`;
      $(".txt", sel(".say")).innerHTML = t;
    }
    sel(".cyc").addEventListener("change", run); run(); return { player: P, show: () => render(P.i) };
  }

  // ------------------------------------------------------------------ overview + planner tabs
  function overview(el) {
    const km = city.edges.reduce((s, e) => s + e.km, 0);
    el.innerHTML = `<h1>PuneMarg Dashboard</h1><p class="lead">The original PuneMarg route planner lives in one tab, unchanged. The other tabs are interactive labs that explain more data-structure ideas using the same Pune map data. Every lab has a <b>▶ Play</b> button and a plain-English “what just happened” box.</p>
    <div class="stats"><div class="card stat"><b>${city.nodes.length}</b><span>places</span></div><div class="card stat"><b>${city.edges.length}</b><span>roads</span></div><div class="card stat"><b>${km.toFixed(0)} km</b><span>total road length</span></div><div class="card stat"><b>6</b><span>new interactive labs</span></div></div>
    <h3>How to use any lab</h3><div class="steps3"><div class="card"><span class="n">1</span><b>Choose</b><br><span class="note">Pick places, a road or type some text. You can also click the map.</span></div><div class="card"><span class="n">2</span><b>Play</b><br><span class="note">Press ▶ Play or use ← → keys to move one step at a time.</span></div><div class="card"><span class="n">3</span><b>Read</b><br><span class="note">The right-hand panel explains each step and shows the data structure's contents.</span></div></div>
    <h3>Pick a tab</h3><div class="grid cards">${LABS.filter(l => l.id !== "overview").map(l => `<a class="card tile" href="#/${l.id}"><div class="big">${l.icon}</div><b>${l.title}</b><p>${l.blurb}</p>${(l.tags || []).map(t => `<span class="tag">${t}</span>`).join("")}</a>`).join("")}</div>
    <h3 style="margin-top:22px">Concept map</h3><div class="card" style="overflow:auto"><table><tr><th>Data structure / algorithm</th><th>Where to see it</th><th>Real-world use</th></tr>
    <tr><td>Min-heap / priority queue</td><td>Shortest Path Lab · Network Lab (top-K)</td><td>Navigation, task schedulers</td></tr>
    <tr><td>Union-Find (disjoint set)</td><td>Road Backbone Lab · Network Lab</td><td>Network design, connectivity</td></tr>
    <tr><td>Greedy (Kruskal)</td><td>Road Backbone Lab</td><td>Cheapest cabling</td></tr>
    <tr><td>Dynamic programming (Floyd–Warshall)</td><td>Network Lab</td><td>Distance tables, choosing a hub</td></tr>
    <tr><td>Segment tree · Fenwick tree</td><td>Traffic Range Lab</td><td>Analytics, range queries</td></tr>
    <tr><td>Trie · KMP string matching</td><td>Text Search Lab</td><td>Autocomplete, find-in-text</td></tr>
    <tr><td>Queue + topological sort</td><td>Work Order Lab</td><td>Build systems, prerequisites</td></tr>
    <tr><td>Arrays, stacks, queues, linked lists, BST/AVL, hashing, graphs, sorting…</td><td>Route Planner tab (original app, Units 1–6)</td><td>—</td></tr></table></div>`;
    return {};
  }
  function planner(el) {
    el.innerHTML = `<h2>🧭 Route Planner (original app)</h2><p class="lead">This is the complete original PuneMarg project, shown here exactly as it is. <a href="../" target="_blank" rel="noopener">Open it in its own tab ↗</a></p><iframe class="orig" src="../" title="PuneMarg original app" loading="lazy"></iframe>`;
    return {};
  }

  const LABS = [
    { id: "overview", icon: "🏠", title: "Overview", group: "Start", mount: overview },
    { id: "planner", icon: "🧭", title: "Route Planner", group: "Original app", sub: "Your existing project, unchanged", mount: planner, blurb: "The complete original project, unchanged.", tags: ["Units 1–6"] },
    { id: "paths", icon: "🚦", title: "Shortest Paths", group: "New labs", sub: "Min-heap · Dijkstra", mount: dijkstraLab, blurb: "Watch Dijkstra pick the best road with a priority queue.", tags: ["Heap", "Dijkstra", "Greedy"] },
    { id: "backbone", icon: "🕸️", title: "Road Backbone", group: "New labs", sub: "Union-Find · Kruskal", mount: mstLab, blurb: "Connect the whole city with the least road, group by group.", tags: ["Union-Find", "MST"] },
    { id: "network", icon: "🧮", title: "Network Analysis", group: "New labs", sub: "Floyd–Warshall · Top-K", mount: netLab, blurb: "All-pairs distances, the city centre and busiest junctions.", tags: ["DP", "Heap", "Graph"] },
    { id: "traffic", icon: "📊", title: "Traffic Ranges", group: "New labs", sub: "Segment & Fenwick tree", mount: trafficLab, blurb: "Answer “how busy from 8 to 11?” with a few tree boxes.", tags: ["Segment tree", "Fenwick"] },
    { id: "text", icon: "🔤", title: "Text Search", group: "New labs", sub: "Trie · KMP", mount: textLab, blurb: "Autocomplete with a trie and substring search with KMP.", tags: ["Trie", "KMP"] },
    { id: "order", icon: "🏗️", title: "Work Order", group: "New labs", sub: "Queue · Topological sort", mount: taskLab, blurb: "Order metro-building tasks and detect impossible plans.", tags: ["Queue", "DAG"] },
  ];

  // ------------------------------------------------------------------ shell / routing
  const mounted = {};
  let current = null;
  function buildRail() {
    let h = "", g = "";
    LABS.forEach(l => { if (l.group !== g) { g = l.group; h += `<h6>${g}</h6>`; } h += `<a href="#/${l.id}" data-id="${l.id}"><span class="ic">${l.icon}</span><span>${l.title}${l.sub ? `<small>${l.sub}</small>` : ""}</span></a>`; });
    $("#rail").innerHTML = h;
    $("#main").innerHTML = LABS.map(l => `<section class="tab" id="tab-${l.id}"></section>`).join("");
  }
  function route() {
    const id = (location.hash.match(/#\/(\w+)/) || [])[1] || "overview"; const lab = LABS.find(l => l.id === id) || LABS[0];
    if (current && current.api && current.api.player) current.api.player.stop();
    $$(".tab").forEach(t => t.classList.toggle("on", t.id === "tab-" + lab.id)); $$("#rail a").forEach(a => a.classList.toggle("on", a.dataset.id === lab.id));
    $("#rail").classList.remove("open");
    if (!mounted[lab.id]) mounted[lab.id] = { api: lab.mount($("#tab-" + lab.id)) || {} };
    current = mounted[lab.id]; if (current.api.show) requestAnimationFrame(current.api.show); window.scrollTo(0, 0);
  }
  document.addEventListener("keydown", e => {
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.target.type !== "range") return;
    const p = current && current.api && current.api.player; if (!p) return;
    if (e.key === "ArrowRight") { p.stop(); p.go(p.i + 1); e.preventDefault(); } else if (e.key === "ArrowLeft") { p.stop(); p.go(p.i - 1); e.preventDefault(); } else if (e.key === " " && e.target.tagName !== "BUTTON") { p.toggle(); e.preventDefault(); }
  });
  window.addEventListener("resize", () => { if (current && current.api.show) current.api.show(); });
  $("#menuBtn").onclick = () => $("#rail").classList.toggle("open");
  $("#themeBtn").onclick = () => { const r = document.documentElement; const dark = r.dataset.theme ? r.dataset.theme === "dark" : matchMedia("(prefers-color-scheme:dark)").matches; r.dataset.theme = dark ? "light" : "dark"; try { localStorage.setItem("pm-dash-theme", r.dataset.theme); } catch (e) {} if (current && current.api.show) current.api.show(); };
  try { const t = localStorage.getItem("pm-dash-theme"); if (t) document.documentElement.dataset.theme = t; } catch (e) {}

  Promise.all(["nodes", "edges", "traffic"].map(f => fetch(`data/${f}.csv`).then(r => { if (!r.ok) throw new Error(f); return r.text(); })))
    .then(([n, e, t]) => { city = A.buildCity(n, e, t); buildRail(); window.addEventListener("hashchange", route); route(); })
    .catch(err => { $("#main").innerHTML = `<div class="card"><h2>Could not load map data</h2><p>${esc(err.message)}. If you opened this file directly, serve the folder with a web server (e.g. <code>python -m http.server</code>).</p></div>`; });
})();
