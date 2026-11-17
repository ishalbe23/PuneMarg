/*
 * features.js - every feature panel, grouped by syllabus unit.
 * Each App.feature({...}) declares: unit, id, title, ds (data structure badge), cls (colour),
 * desc, fields (form), actions (buttons -> call the C++ API), and how to draw the
 * result on the map and in the "data structure" pane.
 */
(() => {
  const N = id => App.name(id);
  const esc = DS.esc;
  const COLORS = { path: "#2f6fde", alt: "#e8730c", visit: "#8b5cf6", astar: "#e03131", queue: "#0f9d8f", tree: "#2f9e44" };
  const placeOpts = () => App.names.slice().sort();

  // ===================================================== shared route helpers
  function drawRoute(nodes, color = COLORS.path, focus = true) {
    MapView.clearOverlays();
    MapView.drawPath(nodes, color, 1.9);
    MapView.markEnds(nodes[0], nodes[nodes.length - 1]);
    if (focus) MapView.focusNodes(nodes);
  }
  function totalsHtml(res) {
    const t = res.totals;
    return `<div class="kv"><div><b>${t.km.toFixed(1)} km</b><span>distance</span></div>
      <div><b>${t.minutes.toFixed(0)} min</b><span>leaving ${res.hour}:00</span></div>
      <div><b>${t.tolls}</b><span>toll roads</span></div></div>`;
  }
  function directionsHtml(res) {
    return `<ol class="list">${res.directions.map(d => `<li>${esc(d.text)}</li>`).join("")}</ol>`;
  }
  function sllNodes(res) {
    return res.directions.map((d, i) => ({ label: d.text.replace(/ for .*/, ""), sub: d.km ? `${d.km.toFixed(1)} km` : "end" }));
  }
  function comparisonHtml(res) {
    const c = res.comparison || {};
    if (res.mode === "fastest" || res.mode === "shortest")
      return `<div class="note">Dijkstra settled <b>${c.dijkstraVisited}</b> places · A* settled <b>${c.astarVisited}</b> places ·
        ${c.sameRoute ? "same optimal route" : "equal optimal cost"} (A* heuristic = straight-line distance, admissible).</div>`;
    if (res.mode === "no_toll")
      return `<div class="note">0-1 BFS (deque): minimum unavoidable toll roads = <b>${c.minTolls}</b>. The plain fastest route
        uses <b>${c.fastestRouteTolls}</b> toll road(s) and takes ${(+c.fastestRouteMinutes).toFixed(0)} min.</div>`;
    if (res.mode === "custom")
      return `<div class="note">Formula compiled once to postfix <span class="mono">${esc(c.postfix)}</span>, then evaluated with a
        stack on all <b>${c.evaluations}</b> roads (weights ${(+c.minWeight).toFixed(2)} … ${(+c.maxWeight).toFixed(2)}${c.negativeClampedToZero ? `, ${c.negativeClampedToZero} negative clamped to 0` : ""}).</div>`;
    return "";
  }

  // Animate the algorithm that produced a route (heap / queue / deque snapshots).
  function animateRoute(r, { onlyDs = false } = {}) {
    const res = r.result, path = res.path.nodes, steps = r.steps || [];
    const heapMode = ["fastest", "shortest", "custom"].includes(res.mode);
    const finalDraw = () => {
      drawRoute(path, COLORS.path, false);
      if (res.mode === "fastest" || res.mode === "shortest") {
        res.path.visitOrder.forEach(n => MapView.dot(n, COLORS.visit, 1.9, 0.35));
        (res.comparison.astarVisitOrder || []).forEach(n => MapView.ring(n, COLORS.astar, 2.6, 0.5));
        MapView.drawPath(path, COLORS.path, 1.9);
      }
    };
    if (!steps.length) { finalDraw(); return; }
    Player.load(steps.length, i => {
      const s = steps[i];
      if (!onlyDs) {
        MapView.clearOverlays();
        MapView.markEnds(path[0], path[path.length - 1]);
        for (let k = 0; k <= i; k++) {
          const n = heapMode ? steps[k].popped : steps[k].current;
          if (n >= 0) MapView.dot(n, heapMode ? COLORS.visit : COLORS.queue, 1.9, 0.45);
        }
        const cur = heapMode ? s.popped : s.current;
        if (cur >= 0) MapView.ring(cur, COLORS.alt, 3, 1);
      }
      if (heapMode) {
        setDS("Priority queue = binary min-heap (Dijkstra)", `Step ${i + 1}: pop-min → <b>${esc(N(s.popped))}</b> (key ${s.key}). Remaining entries are shown as a tree and as the underlying array. Stale entries are skipped (lazy deletion).`,
          DS.heap(s.heap, { names: App.names, poppedText: `popped ${N(s.popped)}` }));
      } else if (res.mode === "no_toll") {
        setDS("Deque - 0-1 BFS (toll road = 1, free road = 0)", `Step ${i + 1}: ${esc(s.action)}. Free-road neighbours go to the FRONT, toll-road neighbours to the BACK.`,
          DS.queue(s.items, { title: "Deque (front … back)", label: N, frontName: "front", rearName: "back" }));
      } else {
        setDS("Queue - BFS for fewest roads", `Step ${i + 1}: dequeued <b>${esc(N(s.current))}</b>, enqueued its unvisited neighbours.`,
          DS.queue(s.items, { title: "Queue (front … rear)", label: N }));
      }
    }, { onDone: onlyDs ? null : finalDraw });
  }

  async function runRoute(v, ctx, mode) {
    const r = await App.api("route", { from: v.from, to: v.to, hour: v.hour, mode, formula: v.formula });
    if (!r.ok) return ctx.set(errorBox(r));
    App.lastRoute = r;
    const res = r.result;
    drawRoute(res.path.nodes);
    ctx.set(totalsHtml(res) + comparisonHtml(res) + `<h4>Route</h4><div>${res.path.names.map(esc).join(" → ")}</div>
      <h4>Turn-by-turn (singly linked list, ${res.directionNodes} nodes)</h4>${directionsHtml(res)}`);
    animateRoute(r);
    return r;
  }

  const routeFields = (from = "Kothrud", to = "Viman Nagar", hour = 9) => [
    { name: "from", label: "From", type: "place", value: from },
    { name: "to", label: "To", type: "place", value: to },
    { name: "hour", label: "Departure", type: "hour", value: hour, full: true },
  ];

  // ================================================================ HOME
  App.feature({
    unit: "home", id: "plan", title: "Plan a route", ds: "Graph + heap / queue / deque / stack", cls: "c-graph",
    desc: "Pick two places (type or click them on the map), a departure hour and an algorithm. Travel times use the 2D array traffic[road][hour], updated as the trip progresses.",
    fields: [...routeFields("Kothrud", "Viman Nagar", 9),
      { name: "mode", label: "Algorithm", type: "select", value: "fastest", options: [["fastest", "Fastest (Dijkstra, min-heap)"], ["shortest", "Shortest distance (Dijkstra)"], ["fewest_stops", "Fewest roads (BFS, queue)"], ["no_toll", "Avoid tolls (0-1 BFS, deque)"], ["custom", "Custom formula (stack)"]] },
      { name: "formula", label: "Custom formula (custom mode)", type: "text", value: "distance*2 + traffic*3 + toll*50" }],
    actions: [{ label: "Find route", primary: true, run: (v, ctx) => runRoute(v, ctx, v.mode) },
      { label: "Swap", run: () => { const a = $("#f_from"), b = $("#f_to"); [a.value, b.value] = [b.value, a.value]; } }],
  });

  // =============================================================== UNIT 1
  App.feature({
    unit: "u1", id: "allpaths", title: "All routes (backtracking)", ds: "Recursion + backtracking", cls: "c-rec",
    desc: "Recursive DFS with backtracking lists every simple route (no place twice) up to a depth limit. Watch the call stack grow (choose) and shrink (un-choose).",
    fields: [{ name: "from", label: "From", type: "place", value: "Deccan Gymkhana" }, { name: "to", label: "To", type: "place", value: "Swargate" },
      { name: "depth", label: "Max roads (depth limit)", type: "number", value: 6, min: 1, max: 14 }, { name: "k", label: "Max routes K", type: "number", value: 10, min: 1, max: 50 }],
    actions: [{ label: "Enumerate routes", primary: true, run: async (v, ctx) => {
      const r = await App.api("allpaths", { from: v.from, to: v.to, depth: v.depth, k: v.k });
      if (!r.ok) return ctx.set(errorBox(r));
      const res = r.result;
      const list = res.paths.map((p, i) => `<tr class="${i === res.shortestIndex ? "best" : ""}" data-p="${i}" style="cursor:pointer"><td>#${i + 1}</td><td class="num">${p.km.toFixed(1)}</td><td class="num">${p.hops}</td><td>${esc(p.names.join(" › "))}</td></tr>`).join("");
      ctx.set(`<div class="kv"><div><b>${res.count}</b><span>routes found${res.truncated ? " (capped)" : ""}</span></div><div><b>${r.stats.recursiveCalls}</b><span>recursive calls</span></div><div><b>${res.recursionDepthReached}</b><span>max recursion depth</span></div></div>
        <div class="note">Click a row to show it on the map. Green = shortest.</div>
        <table class="grid"><tr><th>#</th><th>km</th><th>roads</th><th>route</th></tr>${list}</table>`);
      $$("tr[data-p]", ctx.out).forEach(tr => (tr.onclick = () => drawRoute(res.paths[+tr.dataset.p].nodes, COLORS.alt)));
      if (res.paths.length) drawRoute(res.paths[res.shortestIndex].nodes);
      // replay recursion events: rebuild the call stack
      const ev = r.steps;
      Player.load(ev.length, i => {
        const stack = [];
        let found = 0;
        for (let k = 0; k <= i; k++) {
          const e = ev[k];
          if (e.t === "e") { stack.length = e.depth; stack.push(e.node); }
          else if (e.t === "b") { stack.length = e.depth; }
          else if (e.t === "f") found++;
        }
        const e = ev[i];
        const what = { e: "CALL explore(" + N(e.node) + ")", b: "BACKTRACK - un-choose " + N(e.node), f: "FOUND a route ✔", p: "depth limit reached - prune" }[e.t];
        setDS("Recursion call stack (backtracking)", `Event ${i + 1}/${ev.length}: <b>${esc(what)}</b> · depth ${e.depth} · routes found so far ${found}`,
          DS.stack(stack.slice().reverse(), { title: "Call stack (top = current call)", cls: "c-rec", label: N, max: 16 }));
        MapView.clearOverlays();
        MapView.drawPath(stack, e.t === "f" ? "#2f9e44" : COLORS.astar, 1.6);
        if (stack.length) MapView.ring(stack[stack.length - 1], COLORS.alt, 3, 1);
      }, { autoplay: false, showFirst: true });
      setView("ds");
    } }],
  });

  App.feature({
    unit: "u1", id: "complexity", title: "Measure growth (Ω Θ O)", ds: "Asymptotic analysis", cls: "c-rec",
    desc: "Runs the five sorts on n = 5 … 40 real places and plots measured comparisons against n and n²/2 - theory vs. measurement. Every other feature also shows its counters and Ω/Θ/O in the Algorithm Lab below.",
    fields: [{ name: "origin", label: "Around", type: "place", value: "Shivajinagar" }, { name: "by", label: "Sort key", type: "select", value: "distance", options: ["distance", "time", "rating"] }],
    actions: [{ label: "Measure", primary: true, run: async (v, ctx) => {
      const ns = [5, 10, 15, 20, 25, 30, 35, 40], algos = ["bubble", "selection", "insertion", "merge", "quick"];
      const data = Object.fromEntries(algos.map(a => [a, []]));
      for (const n of ns) {
        const r = await App.api("sort", { origin: v.origin, by: v.by, algo: "merge", n });
        if (!r.ok) return ctx.set(errorBox(r));
        r.result.table.forEach(t => data[t.algo].push([n, t.comparisons]));
      }
      const colors = { bubble: "#e03131", selection: "#e8730c", insertion: "#c99700", merge: "#2f9e44", quick: "#2f6fde" };
      const series = algos.map(a => ({ name: a, color: colors[a], points: data[a], dots: true }));
      series.push({ name: "n²/2", color: "#999", dash: "4 3", points: ns.map(n => [n, n * n / 2]) });
      series.push({ name: "n log₂ n", color: "#555", dash: "2 3", points: ns.map(n => [n, +(n * Math.log2(n)).toFixed(1)]) });
      const chart = DS.lineChart(series, { width: 520, height: 230, xLabel: "n (places)", yLabel: "comparisons", xTicks: ns });
      setDS("Measured growth of comparisons", "Quadratic sorts follow n²/2; merge sort follows n log n. Quick sort is n log n on average.", chart);
      setView("ds");
      ctx.set(`<div class="note">Bubble/selection/insertion grow ~n² (selection is always exactly n(n-1)/2). Merge sort grows ~n log n in best, average and worst case.</div>` +
        DS.table(["n", ...algos], ns.map((n, i) => [n, ...algos.map(a => data[a][i][1])]), { numCols: [0, 1, 2, 3, 4, 5] }) +
        `<h4>Cheat-sheet</h4>` + DS.table(["Operation", "Ω best", "Θ average", "O worst", "Space"], [
          ["Dijkstra (binary heap)", "(V+E)log V", "(V+E)log V", "(V+E)log V", "V+E"], ["BFS / DFS", "V+E", "V+E", "V+E", "V"],
          ["0-1 BFS (deque)", "V+E", "V+E", "V+E", "V"], ["All simple paths", "d", "b^d", "b^d", "d"],
          ["BST search", "1", "log n", "n", "h"], ["AVL search/insert", "1", "log n", "log n", "log n"],
          ["Hash (chaining)", "1", "1+α", "n", "n+m"], ["Fast transpose", "c+t", "c+t", "c+t", "c"],
          ["Simple transpose", "c·t", "c·t", "c·t", "1"], ["Binary search", "1", "log n", "log n", "1"]]));
    } }],
  });

  // =============================================================== UNIT 2
  App.feature({
    unit: "u2", id: "traffic", title: "Traffic 2D array", ds: "2D array traffic[road][hour]", cls: "c-matrix",
    desc: "A 149 × 24 two-dimensional array of congestion factors. traffic[r][h] is read in O(1) by Dijkstra when the trip reaches road r at hour h.",
    fields: [{ name: "road", label: "Road", type: "select", value: 0, full: true, options: [] }],
    onOpen: () => { $("#f_road").innerHTML = App.meta.roads.map(r => `<option value="${r.id}">#${r.id} ${esc(r.name)} (${esc(N(r.from))} – ${esc(N(r.to))})</option>`).join(""); },
    actions: [{ label: "Read row", primary: true, run: async (v, ctx) => {
      const r = await App.api("traffic", { road: v.road });
      if (!r.ok) return ctx.set(errorBox(r));
      const res = r.result;
      const road = App.meta.roads[res.road.id];
      drawRoute([road.from, road.to], COLORS.alt);
      const heat = res.hours.map(h => `<div class="cell c-matrix" style="min-width:0;padding:3px 0;background:rgba(214,69,69,${((h.factor - 1) / 1.6).toFixed(2)})">${h.factor.toFixed(1)}<small>${h.hour}h</small></div>`).join("");
      ctx.set(`<div class="kv"><div><b>${res.rows}×${res.cols}</b><span>array size</span></div><div><b>${res.peakHour}:00</b><span>peak hour</span></div><div><b>${(res.bytes / 1024).toFixed(1)} KB</b><span>memory</span></div></div>
        <div class="ds-label">traffic[${res.road.id}][0…23]</div><div class="slots" style="grid-template-columns:repeat(12,1fr)">${heat}</div>` + summaryBox(r));
      setDS(`traffic[${res.road.id}][h] - ${res.road.name}`, `Address of traffic[r][h] = base + (r × 24 + h) × 8 bytes → O(1) access.`,
        DS.lineChart([{ name: "travel minutes", color: "#e03131", points: res.hours.map(h => [h.hour, +h.minutes.toFixed(2)]), dots: true },
          { name: "congestion factor", color: "#c99700", points: res.hours.map(h => [h.hour, h.factor]) }], { xLabel: "hour", xTicks: [0, 3, 6, 9, 12, 15, 18, 21, 23] }));
    } }],
  });

  App.feature({
    unit: "u2", id: "sparse", title: "Sparse matrix · Who can reach here?", ds: "Sparse matrix (triplets) + transpose", cls: "c-matrix",
    desc: "The 91×91 road adjacency matrix is ~97% zeros, so it is stored as (row, col, value) triplets. Its TRANSPOSE is the reverse graph; BFS on it finds every place that can reach the target respecting one-way roads.",
    fields: [{ name: "target", label: "Target", type: "place", value: "Sassoon Hospital", full: true }],
    actions: [{ label: "Who can reach here?", primary: true, run: async (v, ctx) => {
      const r = await App.api("reverse-reach", { target: v.target });
      if (!r.ok) return ctx.set(errorBox(r));
      const res = r.result;
      MapView.clearOverlays();
      const maxHop = Math.max(...res.reachers.map(x => x.hops), 1);
      res.reachers.forEach(x => { MapView.dot(x.id, `hsl(${140 - 140 * x.hops / maxHop},70%,45%)`, 2.2, 0.75); });
      res.reachers.forEach(x => { if (x.hops <= 1) MapView.text(x.id, x.hops, "#000"); });
      MapView.ring(res.target.id, "#e03131", 3.5, 1.2);
      MapView.fit();
      const s = res.simple.stats, f = res.fast.stats;
      ctx.set(`<div class="kv"><div><b>${res.terms}</b><span>non-zero of ${res.rows * res.cols}</span></div><div><b>${res.densityPercent.toFixed(2)}%</b><span>density</span></div><div><b>${res.memorySavedPercent.toFixed(1)}%</b><span>memory saved</span></div></div>
        ${DS.table(["Transpose", "comparisons", "term visits / steps", "moves", "time ms", "complexity"], [
          ["Simple", s.comparisons, s.visited, s.swaps, s.timeMs, res.simple.complexity.worst], ["Fast", f.comparisons, f.visited, f.swaps, f.timeMs, res.fast.complexity.worst]], { numCols: [1, 2, 3, 4] })}
        <div class="note">Both transposes identical: <b>${res.transposesEqual ? "YES" : "NO"}</b>. ${res.reachers.length - 1} places can reach ${esc(res.target.name)} (map colour = hops: green near, red far); ${res.cannotReach.length} cannot.</div>` + summaryBox(r));
      const trip = (t, n) => DS.table(["row", "col", "km"], t.slice(0, n), { numCols: [0, 1, 2] });
      setDS("Sparse matrix → fast transpose → reverse graph", `Dense ${res.denseBytes} B vs triplets ${res.sparseBytes} B. Fast transpose = count terms per column (rowTerms), prefix sums (startPos), then place each term directly.`,
        `<div style="display:flex;gap:14px;flex-wrap:wrap"><div><div class="ds-label">A (first 20 triplets)</div>${trip(res.triplets, 20)}</div>
         <div><div class="ds-label">Aᵀ (first 20 triplets)</div>${trip(res.transposeTriplets, 20)}</div>
         <div style="flex:1;min-width:260px"><div class="ds-label">rowTerms[c] (terms per column)</div><div class="ds-row">${res.rowTerms.slice(0, 40).map((x, i) => DS.cell(x, i, "c-matrix")).join("")}…</div>
         <div class="ds-label">startPos[c] (prefix sums)</div><div class="ds-row">${res.startPos.slice(0, 40).map((x, i) => DS.cell(x, i, "c-matrix")).join("")}…</div></div></div>`);
    } }],
  });

  let searchTimer = null;
  const searchFeature = {
    unit: "u2", id: "search", title: "Search & autocomplete", ds: "Unsorted array · sorted array · hash table", cls: "c-list",
    desc: "Type a place: autocomplete uses BINARY SEARCH (lower bound) on the sorted name array. The same query is also answered by linear search, binary search and the chaining hash table - compare the comparisons.",
    fields: [{ name: "q", label: "Place name or prefix", type: "text", value: "Kothrud", full: true }],
    onOpen: ctx => {
      const inp = $("#f_q");
      inp.setAttribute("autocomplete", "off");
      inp.insertAdjacentHTML("afterend", '<div id="sugg" class="suggest hidden"></div>');
      inp.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(async () => {
          if (!inp.value.trim()) { $("#sugg").classList.add("hidden"); return; }
          const r = await App.api("search", { q: inp.value });
          if (!r.ok) return;
          const s = r.result.suggestions;
          $("#sugg").innerHTML = s.map(p => `<div data-n="${esc(p.name)}">${esc(p.name)} <span class="muted">· ${esc(p.zone)}</span></div>`).join("") || '<div class="muted">no match</div>';
          $("#sugg").classList.remove("hidden");
          $$("#sugg [data-n]").forEach(d => (d.onclick = () => { inp.value = d.dataset.n; $("#sugg").classList.add("hidden"); runSearch(inp.value, ctx); }));
        }, 160);
      });
    },
    actions: [{ label: "Search", primary: true, run: (v, ctx) => runSearch(v.q, ctx) }],
  };
  async function runSearch(q, ctx) {
    const r = await App.api("search", { q });
    if (!r.ok) return ctx.set(errorBox(r));
    const res = r.result;
    if (res.found) { MapView.clearOverlays(); MapView.ring(res.found.id, COLORS.astar, 4, 1.2); MapView.focusNodes([res.found.id]); }
    ctx.set(DS.table(["Method", "result index", "comparisons", "time ms", "O"], res.algorithms.map(a => [a.name, a.index, a.comparisons, a.timeMs, a.complexity.worst]), { numCols: [1, 2, 3] }) +
      `<div class="note">Hash lookup: bucket ${res.hashBucket}, ${res.hashProbes} chain node(s) inspected.</div>` + summaryBox(r));
    const steps = r.steps, names = res.sortedNames;
    if (!steps.length) return;
    Player.load(steps.length, i => {
      const s = steps[i];
      const lo = Math.max(0, s.low - 2), hi = Math.min(names.length - 1, s.high + 2);
      const cells = [];
      for (let k = lo; k <= hi; k++) {
        const tag = k === s.mid ? "mid" : k === s.low ? "low" : k === s.high ? "high" : "";
        cells.push(DS.cell(DS.short(names[k], 13), `[${k}] ${tag}`, "c-list" + (k === s.mid ? " hl" : k < s.low || k > s.high ? " dim" : "")));
      }
      setDS("Binary search on the sorted name array", `Step ${i + 1}: low=${s.low}, mid=${s.mid} (“${esc(s.midName)}”), high=${s.high} → ${s.cmp === 0 ? "FOUND" : s.cmp < 0 ? "key is smaller: high = mid-1" : "key is larger: low = mid+1"}`,
        `<div class="ds-row">${cells.join("")}</div><div class="muted">Showing indices ${lo}…${hi} of ${names.length}. Each step halves the range → ⌈log₂ ${names.length}⌉ = ${Math.ceil(Math.log2(names.length))} steps max.</div>`);
    });
  }
  App.feature(searchFeature);

  App.feature({
    unit: "u2", id: "sort", title: "Sorting Arena", ds: "Array + 5 sorts", cls: "c-list",
    desc: "Sort nearby places or alternative routes by distance, time or rating with bubble, selection, insertion, merge and quick sort - all on the SAME data. The chosen algorithm is animated step by step.",
    fields: [{ name: "origin", label: "Around / from", type: "place", value: "Shivajinagar" }, { name: "to", label: "To (routes dataset)", type: "place", value: "Swargate" },
      { name: "dataset", label: "Data", type: "select", value: "nearby", options: [["nearby", "Nearby places"], ["routes", "Alternative routes"]] },
      { name: "by", label: "Sort by", type: "select", value: "distance", options: ["distance", "time", "rating"] },
      { name: "algo", label: "Animate", type: "select", value: "quick", options: ["bubble", "selection", "insertion", "merge", "quick"] },
      { name: "n", label: "How many", type: "number", value: 12, min: 3, max: 40 }],
    actions: [{ label: "Sort!", primary: true, run: async (v, ctx) => {
      const r = await App.api("sort", { origin: v.origin, to: v.to, dataset: v.dataset, by: v.by, algo: v.algo, n: v.n });
      if (!r.ok) return ctx.set(errorBox(r));
      const res = r.result;
      const best = Math.min(...res.table.map(t => t.comparisons));
      ctx.set(DS.table(["Algorithm", "comparisons", "swaps/moves", "time ms", "best", "avg", "worst", "space", "stable"],
        res.table.map(t => [t.algo, t.comparisons, t.swaps, t.timeMs, t.complexity.best, t.complexity.average, t.complexity.worst, t.complexity.space, t.stable]),
        { numCols: [1, 2, 3], rowClass: t => (t[1] === best ? "best" : t[0] === res.algo ? "cur" : "") }) +
        `<h4>Result (${esc(res.by)}, ${res.order})</h4><ol class="list">${res.sorted.map(x => `<li>${esc(x.label)} - ${x.key.toFixed(2)}</li>`).join("")}</ol>`);
      MapView.clearOverlays();
      if (res.dataset === "nearby") res.items.forEach(it => MapView.dot(it.node, COLORS.alt, 2.2, 0.7));
      else res.items.forEach(it => MapView.drawPath(it.nodes, COLORS.alt, 1, 0.35));
      // replay: c compare, s swap, w write item id at i, p pivot
      const steps = r.steps, init = res.initial;
      const snapshots = [];
      let arr = init.map(x => ({ ...x }));
      const byId = Object.fromEntries(init.map(x => [x.id, x]));
      for (const [t, i, j, id] of steps) {
        arr = arr.slice();                       // each snapshot owns its own copy
        if (t === "s") { const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp; }
        if (t === "w") arr[i] = byId[id];
        snapshots.push({ arr, t, i, j });
      }
      const label = { c: "compare", s: "swap", w: "write", p: "pivot" };
      Player.load(snapshots.length, k => {
        const s = snapshots[k];
        setDS(`${res.algo} sort - step-by-step`, `Step ${k + 1}/${snapshots.length}: <b>${label[s.t]}</b> [${s.i}]${s.t !== "p" && s.t !== "w" ? " , [" + s.j + "]" : ""}. Orange = compared, red = swapped, purple = pivot.`,
          DS.bars(s.arr, { cmp: s.t === "c" ? [s.i, s.j] : [], swap: s.t === "s" || s.t === "w" ? [s.i] : [], pivot: s.t === "p" ? s.i : -1 }));
      });
      setView("ds");
    } }],
  });

  // =============================================================== UNIT 3
  function convTable(steps, withOutput = true) {
    return DS.table(withOutput ? ["token", "action", "stack (bottom → top)", "output"] : ["token", "action", "stack"],
      steps.map(s => withOutput ? [s.token, s.action, s.stack, s.output] : [s.token, s.action, s.stack]));
  }
  App.feature({
    unit: "u3", id: "formula", title: "★ Route-cost formula", ds: "Stack (validate · convert · evaluate)", cls: "c-stack",
    desc: "FLAGSHIP: write your own cost for a road using <b>distance</b> (km), <b>time</b> (min), <b>traffic</b> (factor ≥ 1), <b>toll</b> (0/1), <b>rating</b> (0-5). A stack validates brackets, converts infix → postfix and prefix, and evaluates the postfix for every road; Dijkstra then routes on those weights.",
    fields: [{ name: "formula", label: "Formula", type: "text", value: "distance*2 + traffic*3 + toll*50", full: true },
      { name: "from", label: "From", type: "place", value: "Kothrud" }, { name: "to", label: "To", type: "place", value: "Viman Nagar" },
      { name: "hour", label: "Departure", type: "hour", value: 9, full: true }],
    onOpen: () => {
      const ex = ["distance*2 + traffic*3 + toll*50", "time + toll*30", "distance * traffic ^ 2", "(distance + time) * (6 - rating)", "time*(1 + toll)", "(distance + 2"];
      $("#f_formula").insertAdjacentHTML("afterend", `<div class="chips" style="margin-top:4px">${ex.map(e => `<span class="chip">${esc(e)}</span>`).join("")}</div>`);
      $$(".chip").forEach(c => (c.onclick = () => ($("#f_formula").value = c.textContent)));
    },
    actions: [
      { label: "Analyse formula", primary: true, run: async (v, ctx) => {
        const r = await App.api("expression", { formula: v.formula });
        const res = r.result || {};
        if (!r.ok) {
          ctx.set(errorBox(r) + (res.parenSteps ? `<h4>Parenthesis check (stack)</h4>${convTable(res.parenSteps, false)}` : ""));
          if (res.parenSteps) setDS("Parenthesis validation stack", "Push on '(' · pop on ')' · error when popping an empty stack or when the stack is not empty at the end.",
            DS.table(["token", "action", "stack"], res.parenSteps.map(s => [s.token, s.action, s.stack])));
          return;
        }
        ctx.set(`<div class="kv"><div><b class="mono" style="font-size:12px">${esc(res.postfix)}</b><span>postfix</span></div><div><b class="mono" style="font-size:12px">${esc(res.prefix)}</b><span>prefix</span></div>
            <div><b>${res.evaluation.ok ? res.evaluation.value.toFixed(3) : "error"}</b><span>on ${esc(res.sampleRoad.name)} @9AM</span></div></div>
          <div class="note">Tokens: ${res.tokens.map(t => `<span class="chip">${esc(t.text)}<small class="muted"> ${t.kind}</small></span>`).join(" ")}</div>
          <h4>Infix → postfix (operator stack)</h4>${convTable(res.postfixSteps)}
          <h4>Infix → prefix (reverse, convert, reverse)</h4>${convTable(res.prefixSteps)}
          <h4>Postfix evaluation on ${esc(res.sampleRoad.name)} (operand stack)</h4>
          <div class="muted">distance=${res.variables.distance}, time=${res.variables.time.toFixed(2)}, traffic=${res.variables.traffic}, toll=${res.variables.toll}, rating=${res.variables.rating.toFixed(2)}</div>
          ${convTable(res.evalSteps, false)}
          <div class="note">Across all ${res.allRoads.count} roads at 9 AM the formula gives ${res.allRoads.min.toFixed(2)} … ${res.allRoads.max.toFixed(2)} (avg ${res.allRoads.avg.toFixed(2)}). Expression-tree traversals match: <b>${res.traversalsMatch ? "YES" : "NO"}</b>.</div>`);
        // animation: postfix conversion, then evaluation
        const conv = res.postfixSteps, ev = res.evalSteps;
        Player.load(conv.length + ev.length, i => {
          if (i < conv.length) {
            const s = conv[i];
            setDS("Infix → postfix with an operator stack", `Step ${i + 1}: token <b>${esc(s.token)}</b> → ${esc(s.action)}`,
              DS.stack(s.stack ? s.stack.split(" ").reverse() : [], { title: "Operator stack", cls: "c-stack" }) +
              `<div class="vstack" style="align-items:flex-start"><div class="ds-label">Output (postfix so far)</div><div class="ds-row">${(s.output ? s.output.split(" ") : []).map(t => DS.cell(t, "", "c-list")).join("")}</div></div>`);
          } else {
            const s = ev[i - conv.length];
            setDS("Postfix evaluation with an operand stack", `Step ${i - conv.length + 1}: <b>${esc(s.token)}</b> → ${esc(s.action)}`,
              DS.stack(s.stack ? s.stack.split(" ").reverse() : [], { title: "Operand stack", cls: "c-stack" }));
          }
        });
        setView("ds");
      } },
      { label: "Route with this formula", run: async (v, ctx) => { setView("map"); await runRoute(v, ctx, "custom"); } },
    ],
  });

  App.feature({
    unit: "u3", id: "dfs", title: "DFS: recursion vs stack", ds: "Call stack vs explicit Stack · Queue", cls: "c-stack",
    desc: "The same DFS written recursively (implicit CALL STACK) and iteratively (our own Stack). Both visit places in the identical order. BFS (queue) is shown for contrast.",
    fields: [{ name: "start", label: "Start", type: "place", value: "Swargate" },
      { name: "algo", label: "Animate", type: "select", value: "dfs_iter", options: [["dfs_iter", "DFS - explicit stack"], ["dfs_rec", "DFS - recursion"], ["bfs", "BFS - queue"]] }],
    actions: [{ label: "Traverse", primary: true, run: (v, ctx) => runTraverse(v, ctx) }],
  });
  async function runTraverse(v, ctx) {
    const r = await App.api("traverse", { start: v.start, algo: v.algo });
    if (!r.ok) return ctx.set(errorBox(r));
    const res = r.result, key = { bfs: "bfs", dfs_rec: "dfsRecursive", dfs_iter: "dfsIterative" }[v.algo];
    const t = res[key];
    const row = (name, x) => [name, x.stats.visited, x.stats.comparisons, x.maxContainer, x.stats.maxDepth, x.stats.timeMs];
    ctx.set(DS.table(["Traversal", "visited", "edge checks", "max queue/stack", "max depth", "ms"], [row("BFS (queue)", res.bfs), row("DFS recursive", res.dfsRecursive), row("DFS explicit stack", res.dfsIterative)], { numCols: [1, 2, 3, 4, 5] }) +
      `<div class="note">Recursive and iterative DFS orders identical: <b>${res.dfsOrdersMatch ? "YES" : "NO"}</b></div>
      <h4>Visit order (${esc(v.algo)})</h4><div class="muted">${t.names.map(esc).join(" → ")}</div>`);
    MapView.clearOverlays();
    MapView.fit();
    const order = t.order, snaps = r.steps;
    Player.load(order.length, i => {
      MapView.clearOverlays();
      for (let k = 0; k <= i; k++) {
        const n = order[k], p = t.parent[n];
        if (p >= 0) MapView.edge(p, n, v.algo === "bfs" ? COLORS.queue : COLORS.alt, 1);
        MapView.dot(n, v.algo === "bfs" ? COLORS.queue : COLORS.alt, 1.8, 0.6);
      }
      MapView.ring(order[i], "#e03131", 3, 1);
      const s = snaps[Math.min(i, snaps.length - 1)];
      if (!s) return;
      const title = v.algo === "bfs" ? "Queue (BFS frontier)" : v.algo === "dfs_rec" ? "Call stack (recursion)" : "Explicit Stack";
      setDS(title, `Visit #${i + 1}: ${esc(N(order[i]))} · ${esc(s.action)}`,
        v.algo === "bfs" ? DS.queue(s.items, { label: N }) : DS.stack(s.items, { title, cls: v.algo === "dfs_rec" ? "c-rec" : "c-stack", label: N, max: 18 }));
    });
  }

  App.feature({
    unit: "u3", id: "trip", title: "Trip editor (undo / redo)", ds: "Two stacks", cls: "c-stack",
    desc: "Every edit (add / remove / move a stop) is pushed on the UNDO stack. Undo pops it, applies the inverse and pushes it on the REDO stack. A new edit clears the redo stack.",
    fields: [{ name: "place", label: "Stop to add", type: "place", value: "Shaniwar Wada" }, { name: "index", label: "Position (-1 = end)", type: "number", value: -1 },
      { name: "to", label: "Move to position", type: "number", value: 0 }],
    onOpen: () => tripCall({ op: "state" }),
    actions: [
      { label: "Add stop", primary: true, run: v => tripCall({ op: "add", place: v.place, index: v.index }) },
      { label: "Remove @pos", run: v => tripCall({ op: "remove", index: v.index }) },
      { label: "Move pos→to", run: v => tripCall({ op: "move", index: v.index, to: v.to }) },
      { label: "↶ Undo", run: () => tripCall({ op: "undo" }) },
      { label: "↷ Redo", run: () => tripCall({ op: "redo" }) },
      { label: "Reset", run: () => tripCall({ op: "reset" }) },
    ],
  });
  async function tripCall(params) {
    const r = await App.api("trip", params);
    const out = $("#out");
    if (!r.ok) { out.innerHTML = errorBox(r); return; }
    const res = r.result;
    out.innerHTML = `<div class="kv"><div><b>${res.stops.length}</b><span>stops</span></div><div><b>${res.totalKm.toFixed(1)} km</b><span>trip</span></div><div><b>${res.totalMinutes.toFixed(0)} min</b><span>@ 9 AM</span></div></div>
      <ol class="list" start="0">${res.stops.map(s => `<li>${esc(s.name)}</li>`).join("") || '<span class="muted">No stops yet - add some (click places on the map).</span>'}</ol>` + summaryBox(r);
    MapView.clearOverlays();
    if (res.path.length > 1) MapView.drawPath(res.path, COLORS.path, 1.8);
    res.stops.forEach((s, i) => MapView.text(s.id, String(i), "#e03131"));
    setDS("Undo / redo = two stacks", res.message || "", DS.stack(res.undoStack, { title: "UNDO stack", cls: "c-stack" }) + DS.stack(res.redoStack, { title: "REDO stack", cls: "c-queue" }));
  }

  App.feature({
    unit: "u3", id: "transit", title: "Fewest stops (metro/bus)", ds: "Queue (BFS)", cls: "c-queue",
    desc: "BFS on the unweighted transit graph (Purple & Aqua metro lines + 6 bus loops) finds the route with the fewest stops. Only metro stations and bus stops are on this graph.",
    fields: [{ name: "from", label: "From station / stop", type: "place", value: "Vanaz" }, { name: "to", label: "To station / stop", type: "place", value: "PCMC" }],
    actions: [{ label: "Fewest stops", primary: true, run: async (v, ctx) => {
      const r = await App.api("transit", v);
      if (!r.ok) return ctx.set(errorBox(r));
      const res = r.result;
      drawRoute(res.path.nodes, "#7b2cbf");
      ctx.set(`<div class="kv"><div><b>${res.stops}</b><span>stops</span></div><div><b>${res.changes}</b><span>line changes</span></div><div><b>${res.km.toFixed(1)} km</b><span>approx.</span></div></div>
        ${DS.table(["from", "to", "line"], res.hops.map(h => [N(h.from), N(h.to), h.line]))}`);
      const steps = r.steps;
      Player.load(steps.length, i => setDS("Queue - BFS on the transit graph", `Step ${i + 1}: ${esc(steps[i].action)} (${esc(N(steps[i].current))})`, DS.queue(steps[i].items, { label: N })));
    } }],
  });

  App.feature({
    unit: "u3", id: "cqueue", title: "Recent searches & alerts", ds: "Circular queue", cls: "c-queue",
    desc: "Two fixed-size ring buffers: the last 8 searches and the last 6 live traffic alerts. rear = (rear + 1) % capacity; when full the oldest entry is overwritten.",
    fields: [{ name: "msg", label: "New alert (blank = sample)", type: "text", value: "", full: true }],
    onOpen: () => cqCall({ op: "state" }),
    actions: [{ label: "Push alert", primary: true, run: v => cqCall({ op: "alert", msg: v.msg }) },
      { label: "Dismiss oldest", run: () => cqCall({ op: "dismiss" }) }, { label: "Refresh", run: () => cqCall({ op: "state" }) }],
  });
  async function cqCall(p) {
    const r = await App.api("recent", p);
    if (!r.ok) { $("#out").innerHTML = errorBox(r); return; }
    const res = r.result;
    $("#out").innerHTML = summaryBox(r);
    setDS("Circular queues", "F = front (oldest), R = rear (newest). Physical slot positions are shown - watch the indices wrap around.",
      DS.circularQueue(res.alerts, { title: "Live traffic alerts (capacity 6)", color: "var(--c-hash)" }) + DS.circularQueue(res.recent, { title: "Recent searches (capacity 8)" }));
    setView("ds");
  }

  App.feature({
    unit: "u3", id: "deque", title: "Avoid tolls (0-1 BFS)", ds: "Deque", cls: "c-queue",
    desc: "Toll road = weight 1, free road = weight 0. 0-1 BFS uses a DEQUE: 0-edges are pushed at the front, 1-edges at the back - O(V+E) instead of Dijkstra's O(E log V). It finds the minimum unavoidable tolls; ties are broken by travel time.",
    fields: routeFields("Katraj", "Warje", 9),
    actions: [{ label: "Avoid tolls", primary: true, run: (v, ctx) => runRoute(v, ctx, "no_toll") },
      { label: "Compare: fastest", run: (v, ctx) => runRoute(v, ctx, "fastest") }],
  });

  App.feature({
    unit: "u3", id: "pq", title: "Dijkstra vs A*", ds: "Priority queue (binary min-heap)", cls: "c-heap",
    desc: "Fastest route for the chosen departure hour (traffic changes during the trip). Dijkstra pops the smallest tentative time from our min-heap; A* adds a straight-line estimate and explores fewer places. Purple dots = Dijkstra settled, red rings = A* settled.",
    fields: routeFields("Hinjewadi Phase 3", "VIT Pune", 9),
    actions: [{ label: "Fastest route", primary: true, run: (v, ctx) => runRoute(v, ctx, "fastest") },
      { label: "Try 2 AM", run: (v, ctx) => { $("#f_hour").value = 2; $("#f_hour_v").textContent = hourText(2); return runRoute({ ...v, hour: 2 }, ctx, "fastest"); } }],
  });

  App.feature({
    unit: "u3", id: "dispatch", title: "Emergency dispatch", ds: "Priority queue (min-heap)", cls: "c-heap",
    desc: "Requests are served by priority: ambulance > fire > police > normal (FIFO among equals). Ambulances are sent from the nearest hospital (Dijkstra).",
    fields: [{ name: "type", label: "Type", type: "select", value: "ambulance", options: ["ambulance", "fire", "police", "normal"] }, { name: "place", label: "Location", type: "place", value: "Kothrud" }],
    onOpen: () => dispatchCall({ op: "list" }),
    actions: [{ label: "Add request", primary: true, run: v => dispatchCall({ op: "add", type: v.type, place: v.place }) },
      { label: "Serve next", run: () => dispatchCall({ op: "serve" }) },
      { label: "Add 5 random", run: async () => {
        const types = ["normal", "police", "ambulance", "fire", "normal"];
        for (const t of types) await App.api("dispatch", { op: "add", type: t, place: App.names[Math.floor(Math.random() * App.names.length)] });
        dispatchCall({ op: "list" });
      } },
      { label: "Clear", run: () => dispatchCall({ op: "reset" }) }],
  });
  async function dispatchCall(p) {
    const r = await App.api("dispatch", p);
    if (!r.ok) { $("#out").innerHTML = errorBox(r); return; }
    const res = r.result;
    MapView.clearOverlays();
    res.heap.forEach(h => MapView.ring(h.place, h.priority === 4 ? "#e03131" : h.priority === 3 ? "#e8730c" : h.priority === 2 ? "#2f6fde" : "#888", 3, 1));
    if (res.served && res.served.path) drawRoute(res.served.path, "#e03131");
    $("#out").innerHTML = summaryBox(r);
    const icon = { ambulance: "🚑", fire: "🚒", police: "🚓", normal: "📞" };
    const tree = DS.heapToTree(res.heap.map(h => [h.priority, h.seq]));
    const meta = Object.fromEntries(res.heap.map(h => [h.seq, h]));
    setDS("Dispatch priority queue (binary heap)", "Root = next request to serve. Ordering: higher priority first, then earlier arrival (#).",
      res.heap.length ? DS.binaryTree(tree, { label: n => `${icon[meta[n.node].type]}${n.k}`, sub: n => `#${n.node} ${DS.short(meta[n.node].name, 10)}`, hl: n => n.idx === 0, color: "var(--c-heap)", gap: 70, levelH: 62 }) : '<div class="muted">Queue empty</div>');
  }

  // =============================================================== UNIT 4
  App.feature({
    unit: "u4", id: "directions", title: "Turn-by-turn directions", ds: "Singly linked list", cls: "c-list",
    desc: "Directions are built once, front to back, into a singly linked list of Instruction nodes (append at tail = O(1)). Consecutive segments on the same road are merged; turns come from compass bearings.",
    fields: routeFields("Deccan Gymkhana", "Pune Airport", 9),
    actions: [{ label: "Get directions", primary: true, run: async (v, ctx) => {
      const r = await runRoute(v, ctx, "fastest");
      if (!r || !r.ok) return;
      Player.clear();
      const nodes = sllNodes(r.result);
      Player.load(nodes.length, i => {
        setDS("Directions as a singly linked list", `Walking the list: node ${i + 1} → ${esc(r.result.directions[i].text)}`, DS.linkedList(nodes, { cursor: i, title: "head → … → NULL" }));
        MapView.marker(r.result.directions[i].node);
      });
      setView("ds");
    } }],
  });

  App.feature({
    unit: "u4", id: "playback", title: "Navigation playback", ds: "Doubly linked list", cls: "c-list",
    desc: "The last computed route is stored in a doubly linked list. Next / Previous move a cursor in O(1) using next / prev pointers - Rewind jumps to the head. (Compute a route first in any routing feature.)",
    fields: routeFields("Swargate", "Baner", 18),
    onOpen: () => playCall("state", true),
    actions: [{ label: "Load route", primary: true, run: async (v, ctx) => { const r = await runRoute(v, ctx, "fastest"); Player.clear(); if (r && r.ok) playCall("state"); } },
      { label: "⏮ Rewind", run: () => playCall("rewind") }, { label: "◀ Prev", run: () => playCall("prev") },
      { label: "Next ▶", run: () => playCall("next") }, { label: "End ⏭", run: () => playCall("end") },
      { label: "Auto-play", run: async () => { await playCall("rewind"); for (let i = 0; i < 60; i++) { const r = await playCall("next"); if (!r || !r.result.hasNext) break; await new Promise(res => setTimeout(res, Player.delay())); } } }],
  });
  async function playCall(op, quiet = false) {
    const r = await App.api("playback", { op });
    if (!r.ok) { if (!quiet) $("#out").innerHTML = errorBox(r); return null; }
    const res = r.result;
    const nodes = res.list.map(s => s.node);
    MapView.clearOverlays();
    MapView.drawPath(nodes, COLORS.path, 1.6, 0.6);
    MapView.drawPath(nodes.slice(0, res.position + 1), COLORS.alt, 2.2);
    MapView.marker(res.current.node);
    setDS("Playback = doubly linked list", `Cursor at node ${res.position + 1}/${res.size}: ${esc(res.current.text)} · ${res.current.km.toFixed(1)} km · ${res.current.min.toFixed(0)} min`,
      DS.linkedList(res.list.map(s => ({ label: N(s.node), sub: `${s.km.toFixed(1)} km` })), { doubly: true, cursor: res.position, title: "NULL ← prev | node | next → NULL" }));
    const box = $("#playState") || (() => { $("#out").insertAdjacentHTML("afterbegin", '<div id="playState"></div>'); return $("#playState"); })();
    box.innerHTML = `<div class="note">Step ${res.position + 1}/${res.size}: <b>${esc(res.current.text)}</b> (${res.current.km.toFixed(1)} km, ${res.current.min.toFixed(0)} min) · prev: ${res.hasPrev ? "✔" : "NULL"} · next: ${res.hasNext ? "✔" : "NULL"}</div>`;
    return r;
  }

  App.feature({
    unit: "u4", id: "bus", title: "Bus loop - next stop", ds: "Circular linked list", cls: "c-list",
    desc: "Each PMPML-style loop route is a circular linked list (tail → next = head). 'Next stop' simply follows next, so it cycles forever without index arithmetic. ETAs are summed while walking round the loop.",
    fields: [{ name: "route", label: "Route", type: "select", value: 0, full: true, options: [] }],
    onOpen: () => { $("#f_route").innerHTML = App.meta.bus.map(b => `<option value="${b.index}">Bus ${esc(b.id)} - ${esc(b.name)}</option>`).join(""); busCall(0, "info"); $("#f_route").onchange = e => busCall(+e.target.value, "info"); },
    actions: [{ label: "Next stop ▶", primary: true, run: v => busCall(+v.route, "next") },
      { label: "Run a full loop", run: async v => { for (let i = 0; i < 14; i++) { await busCall(+v.route, "next"); await new Promise(r => setTimeout(r, Player.delay())); } } },
      { label: "Reset", run: v => busCall(+v.route, "reset") }],
  });
  async function busCall(route, op) {
    const r = await App.api("bus", { route, op });
    if (!r.ok) { $("#out").innerHTML = errorBox(r); return; }
    const res = r.result;
    const stops = res.stops.map(s => s.id);
    MapView.clearOverlays();
    MapView.drawPath([...stops, stops[0]], res.route.color, 1.6, 0.85);
    stops.forEach(s => MapView.dot(s, res.route.color, 1.8, 0.8));
    MapView.marker(res.current.id);
    MapView.focusNodes(stops);
    $("#out").innerHTML = `<div class="kv"><div><b>${esc(res.current.name)}</b><span>bus is at</span></div><div><b>${esc(res.next.name)}</b><span>next stop</span></div><div><b>${res.loopMinutes.toFixed(0)} min</b><span>one loop (${res.loopKm.toFixed(1)} km)</span></div></div>
      <h4>Upcoming stops (wraps round the loop)</h4>${DS.table(["stop", "ETA (min)"], res.upcoming.map(u => [u.name, Math.round(u.eta)]))}`;
    // ring drawing
    const n = res.stops.length, R = 120, cx = 170, cy = 150;
    let svg = `<svg width="340" height="310" viewBox="0 0 340 310"><circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--c-list)" stroke-dasharray="4 4"/>`;
    res.stops.forEach((s, i) => {
      const a = (i / n) * 2 * Math.PI - Math.PI / 2, x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
      const cur = i === res.cursor;
      svg += `<circle cx="${x}" cy="${y}" r="${cur ? 13 : 9}" fill="${cur ? "var(--c-list)" : "var(--surface)"}" stroke="var(--c-list)" stroke-width="2"/>
        <text x="${x}" y="${y + (y > cy ? 25 : -17)}" font-size="10" text-anchor="middle" fill="currentColor">${esc(DS.short(s.name, 16))}</text>
        <text x="${x}" y="${y + 1}" font-size="9" text-anchor="middle" dominant-baseline="central" fill="${cur ? "#fff" : "currentColor"}">${i}</text>`;
    });
    svg += `<text x="${cx}" y="${cy}" text-anchor="middle" font-size="12" fill="currentColor">tail→next = head</text></svg>`;
    setDS(`Circular linked list - Bus ${res.route.id} ${res.route.name}`, `Cursor at <b>${esc(res.current.name)}</b>; next pointer → ${esc(res.next.name)}. Every ${res.route.headway} min a bus starts the loop.`,
      svg + DS.linkedList(res.stops.map(s => ({ label: s.name, sub: `+${s.minutesFromPrev.toFixed(0)} min` })), { circular: true, cursor: res.cursor, title: "Same list, drawn in a line" }));
  }

  App.feature({
    unit: "u4", id: "poly", title: "Best time to leave", ds: "Polynomial linked list", cls: "c-list",
    desc: "Each road's extra delay across the day is fitted as a polynomial in x = (hour − 12)/12 and stored as a linked list of (coef, exp) terms. Adding the lists of all roads on the route (merge of sorted lists, O(m+n)) gives the route's delay polynomial; evaluating it for 24 hours picks the best departure time.",
    fields: routeFields("Hinjewadi Phase 1", "Shivajinagar", 9),
    actions: [{ label: "Find best time", primary: true, run: async (v, ctx) => {
      const r = await App.api("polynomial", v);
      if (!r.ok) return ctx.set(errorBox(r));
      const res = r.result;
      drawRoute(res.path.nodes);
      ctx.set(`<div class="kv"><div><b>${res.bestHourDaytime}:00</b><span>best (6-22 h)</span></div><div><b>${res.worstHour}:00</b><span>worst</span></div><div><b>${res.termNodesAllocated}</b><span>term nodes (new)</span></div></div>
        <h4>Route delay polynomial D(x)</h4><div class="mono">${esc(res.routePolynomial)}</div>
        ${DS.lineChart([{ name: "D(hour) polynomial", color: "#2f6fde", points: res.hours.map(h => [h.hour, +h.predicted.toFixed(2)]) },
          { name: "actual delay from traffic.csv", color: "#e8730c", dash: "4 3", points: res.hours.map(h => [h.hour, +h.actual.toFixed(2)]), dots: true }],
          { width: 410, height: 180, xLabel: "hour", yLabel: "extra min", markX: res.bestHourDaytime, xTicks: [0, 4, 8, 12, 16, 20, 23] })}
        <h4>Road polynomials</h4>${DS.table(["road", "polynomial"], res.roadPolynomials.map(p => [p.name, p.poly]))}`);
      const steps = r.steps;
      const termsOf = s => (s === "0" ? [] : s.replace(/ - /g, " + -").split(" + ").map(t => t.trim()));
      Player.load(steps.length, i => {
        const s = steps[i];
        const lst = (str, title) => DS.linkedList(termsOf(str).map(t => ({ label: t })), { title, cls: "c-list" });
        setDS(`Polynomial addition ${i + 1}/${steps.length}: + ${s.road}`, s.merge.map(esc).join(" · "),
          lst(s.before, "Running total (before)") + lst(s.adding, "Road polynomial being added") + lst(s.after, "Result (after merge)"));
      });
      setView("ds");
    } }],
  });

  App.feature({
    unit: "u4", id: "memory", title: "Memory tracker", ds: "new / delete counters", cls: "c-list",
    desc: "Every linked node in PuneMarg inherits from a <span class=mono>Tracked</span> base class whose operator new / delete update global counters. Live blocks are the nodes currently held by the long-lived structures (graph, trees, bus loops, hash tables …); temporary structures are freed when they go out of scope.",
    onOpen: async ctx => { const r = await App.api("memory"); if (r.ok) ctx.set(summaryBox(r)); },
    actions: [{ label: "Refresh", primary: true, run: async (v, ctx) => { const r = await App.api("memory"); if (r.ok) ctx.set(summaryBox(r)); } }],
  });

  // =============================================================== UNIT 5
  function treeFeature(kind) {
    const isAvl = kind === "avl";
    return {
      unit: "u5", id: kind, title: isAvl ? "AVL tree" : "BST place directory", ds: isAvl ? "AVL tree (self-balancing)" : "Binary search tree", cls: "c-tree",
      desc: isAvl ? "Same directory in an AVL tree: every node keeps height and balance factor (shown on hover); LL, RR, LR, RL rotations keep the height ≤ 1.44 log₂ n."
        : "All 91 place names keyed by name. Insert / delete (3 cases) / search / range 'K…M' / traversals. Inorder = A-Z. Try 'Sorted (15)' to see a degenerate tree.",
      fields: [{ name: "key", label: "Key (place name)", type: "place", value: "Kothrud" }, { name: "lo", label: "Range from", type: "text", value: "K" }, { name: "hi", label: "Range to", type: "text", value: "M" }],
      onOpen: () => treeCall(kind, { op: "state" }),
      actions: [{ label: "Search", primary: true, run: v => treeCall(kind, { op: "search", key: v.key }) },
        { label: "Insert", run: v => treeCall(kind, { op: "insert", key: v.key }) }, { label: "Delete", run: v => treeCall(kind, { op: "delete", key: v.key }) },
        { label: "Range", run: v => treeCall(kind, { op: "range", lo: v.lo, hi: v.hi }) },
        { label: "Load all 91", run: () => treeCall(kind, { op: "load" }) }, { label: "Sample (16)", run: () => treeCall(kind, { op: "sample" }) },
        { label: "Sorted (15)", run: () => treeCall(kind, { op: "sorted" }) }],
    };
  }
  async function treeCall(kind, p) {
    const r = await App.api(kind, p);
    if (!r.ok) { $("#out").innerHTML = errorBox(r); return; }
    const res = r.result;
    const path = new Set(res.searchPath || []), range = new Set(res.range || []);
    $("#out").innerHTML = `<div class="kv"><div><b>${res.size}</b><span>nodes</span></div><div><b>${res.height}</b><span>height (${kind === "avl" ? "BST" : "AVL"}: ${res.otherHeight})</span></div><div><b>${Math.log2(Math.max(1, res.size)).toFixed(1)}</b><span>log₂ n</span></div></div>
      ${summaryBox(r)}
      ${res.rotations && res.rotations.length ? `<h4>Rotations</h4><ul class="list">${res.rotations.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      <h4>Inorder (A-Z)</h4><div class="muted">${res.inorder.map(esc).join(", ")}</div>
      <h4>Preorder</h4><div class="muted">${res.preorder.map(esc).join(", ")}</div>
      <h4>Postorder</h4><div class="muted">${res.postorder.map(esc).join(", ")}</div>`;
    MapView.clearOverlays();
    (res.range || []).forEach(n => { const id = App.placeId(n); if (id >= 0) MapView.dot(id, COLORS.tree, 2.2, 0.8); });
    const sp = res.searchPath || [];
    const found = sp.length && sp[sp.length - 1] === (res.message.match(/'(.*)'/) || [])[1];
    if (found) { const id = App.placeId(sp[sp.length - 1]); if (id >= 0) { MapView.ring(id, "#e03131", 4, 1.2); } }
    const draw = upto => DS.binaryTree(res.tree, {
      label: n => n.k, sub: kind === "avl" ? n => `h${n.h} bf${n.bf}` : null, gap: res.size > 40 ? 30 : 46, levelH: kind === "avl" ? 58 : 50,
      hl: n => (upto === undefined ? path.has(n.k) : sp.slice(0, upto + 1).includes(n.k)) || range.has(n.k),
    });
    setDS(kind === "avl" ? "AVL tree" : "Binary search tree", `${esc(res.message || "")} · highlighted = search path / range results. Scroll sideways for big trees.`, draw());
    if (sp.length) Player.load(sp.length, i => setDS(kind === "avl" ? "AVL search path" : "BST search path", `Comparison ${i + 1}: key vs “${esc(sp[i])}”`, draw(i)));
    setView("ds");
  }
  App.feature(treeFeature("bst"));
  App.feature(treeFeature("avl"));

  App.feature({
    unit: "u5", id: "compare", title: "BST vs AVL experiment", ds: "BST · AVL", cls: "c-tree",
    desc: "Insert n place names in SORTED order into an empty BST and an empty AVL tree. The BST degrades into a linked list (height n); the AVL stays ≈ log₂ n thanks to rotations.",
    fields: [{ name: "n", label: "n names", type: "number", value: 20, min: 3, max: 91 }],
    actions: [{ label: "Run experiment", primary: true, run: async (v, ctx) => {
      const r = await App.api("tree-compare", { n: v.n });
      if (!r.ok) return ctx.set(errorBox(r));
      const res = r.result, s = res.sorted;
      ctx.set(DS.table(["", "BST", "AVL"], [["height (sorted input)", s.bstHeight, s.avlHeight], ["comparisons", s.bstComparisons, s.avlComparisons],
        ["height (unsorted input)", res.unsorted.bstHeight, res.unsorted.avlHeight], ["rotations", "-", `${s.rotations} (LL ${s.rotationCounts.LL}, RR ${s.rotationCounts.RR}, LR ${s.rotationCounts.LR}, RL ${s.rotationCounts.RL})`]], { numCols: [1, 2] }) +
        DS.lineChart([{ name: "BST height", color: "#e03131", points: res.growth.map(g => [g.n, g.bst]) }, { name: "AVL height", color: "#2f9e44", points: res.growth.map(g => [g.n, g.avl]) },
          { name: "log₂ n", color: "#999", dash: "4 3", points: res.growth.map(g => [g.n, +Math.log2(g.n).toFixed(2)]) }], { width: 410, height: 170, xLabel: "names inserted", yLabel: "height" }) +
        `<h4>Rotation log</h4><ul class="list">${s.rotationLog.slice(0, 30).map(x => `<li>${esc(x)}</li>`).join("")}</ul>`);
      setDS("Sorted insertion: BST (left) vs AVL (right)", `n = ${res.n}: BST height ${s.bstHeight}, AVL height ${s.avlHeight} (log₂ n = ${res.log2n.toFixed(1)})`,
        `<div style="display:flex;gap:20px;align-items:flex-start;overflow:auto"><div>${DS.binaryTree(res.bstTree, { gap: 26, levelH: 30, title: "BST - degenerate", color: "#e03131", maxLabel: 6 })}</div>
         <div>${DS.binaryTree(res.avlTree, { gap: 46, levelH: 56, title: "AVL - balanced", maxLabel: 9 })}</div></div>`);
      setView("ds");
    } }],
  });

  App.feature({
    unit: "u5", id: "exprtree", title: "Expression tree", ds: "Binary expression tree", cls: "c-tree",
    desc: "The cost formula's postfix is turned into a tree with a stack of subtrees. Inorder / preorder / postorder traversals reproduce the infix, prefix and postfix forms; the tree also evaluates the formula recursively.",
    fields: [{ name: "formula", label: "Formula", type: "text", value: "(distance + time) * traffic - toll * 20", full: true }],
    actions: [{ label: "Build tree", primary: true, run: async (v, ctx) => {
      const r = await App.api("expression", { formula: v.formula });
      if (!r.ok) return ctx.set(errorBox(r));
      const res = r.result;
      ctx.set(DS.table(["traversal", "result", "matches"], [["inorder", res.traversals.inorder, "infix (fully bracketed)"], ["preorder", res.traversals.preorder, res.prefix === res.traversals.preorder ? "prefix ✔" : "✘"],
        ["postorder", res.traversals.postorder, res.postfix === res.traversals.postorder ? "postfix ✔" : "✘"]]) +
        `<div class="kv"><div><b>${res.treeNodes}</b><span>nodes</span></div><div><b>${res.treeHeight}</b><span>height</span></div><div><b>${res.evaluation.treeOk ? res.evaluation.treeValue.toFixed(3) : "err"}</b><span>value on ${esc(res.sampleRoad.name)}</span></div></div>`);
      const order = res.traversals.postorder.split(" ");
      const draw = k => DS.binaryTree(res.tree, { label: n => n.k, fill: n => (n.op ? "var(--c-stack)" : "var(--surface)"), hl: () => false, gap: 52, levelH: 62 }) +
        `<div class="ds-label">Postorder walk</div><div class="ds-row">${order.map((t, i) => DS.cell(t, "", "c-tree" + (i === k ? " hl" : i > k ? " dim" : ""))).join("")}</div>`;
      setDS("Expression tree", "Orange = operator (internal node), white = operand (leaf). Built from postfix with a stack of subtree pointers.", draw(-1));
      Player.load(order.length, i => setDS("Expression tree - postorder traversal", `Visit ${i + 1}: ${esc(order[i])}`, draw(i)), { autoplay: false });
      setView("ds");
    } }],
  });

  App.feature({
    unit: "u5", id: "heaptree", title: "Heap tree (Dijkstra)", ds: "Min-heap drawn as a tree", cls: "c-heap",
    desc: "Watch Dijkstra's priority queue as a complete binary tree: the root is always the smallest tentative travel time. Each step shows the heap just after a pop-min (sift-down) and the pushes (sift-up) of relaxed neighbours.",
    fields: routeFields("Katraj", "Shivajinagar", 18),
    actions: [{ label: "Animate heap", primary: true, run: async (v, ctx) => {
      const r = await App.api("route", { ...v, mode: "fastest" });
      if (!r.ok) return ctx.set(errorBox(r));
      drawRoute(r.result.path.nodes);
      ctx.set(totalsHtml(r.result) + comparisonHtml(r.result) + `<div class="note">${r.steps.length} heap snapshots recorded (pushes ${r.stats.pushes}, pops ${r.stats.pops}, sift swaps ${r.stats.swaps}).</div>`);
      animateRoute(r, { onlyDs: true });
      setView("ds");
    } }],
  });

  App.feature({
    unit: "u5", id: "decision", title: "Travel-mode decision tree", ds: "Binary decision tree", cls: "c-tree",
    desc: "Answers yes/no questions (distance, rain = monsoon, urgency, budget, metro access) from the root to a leaf that recommends walk / bus / metro / auto / cab. Distance comes from the shortest route between the two places.",
    fields: [{ name: "from", label: "From", type: "place", value: "Deccan Gymkhana" }, { name: "to", label: "To", type: "place", value: "Pune Airport" },
      { name: "budget", label: "Budget (Rs)", type: "number", value: 120 }, { name: "urgency", label: "Urgency", type: "select", value: 1, options: [[0, "low"], [1, "normal"], [2, "high"]] },
      { name: "rain", label: "Raining (monsoon)", type: "check", value: true }],
    actions: [{ label: "Suggest mode", primary: true, run: async (v, ctx) => {
      const r = await App.api("decision", { from: v.from, to: v.to, budget: v.budget, urgency: v.urgency, rain: v.rain ? 1 : 0 });
      if (!r.ok) return ctx.set(errorBox(r));
      const res = r.result;
      if (res.route) drawRoute(res.route.nodes);
      const icon = { walk: "🚶", bus: "🚌", metro: "🚇", auto: "🛺", cab: "🚕" };
      ctx.set(`<div class="kv"><div><b>${icon[res.mode] || ""} ${esc(res.mode)}</b><span>suggested</span></div><div><b>${res.context.distanceKm.toFixed(1)} km</b><span>distance</span></div><div><b>${res.context.metroAccess ? "yes" : "no"}</b><span>metro access</span></div></div>
        <div class="note">${esc(res.reason)}</div><ol class="list">${res.answers.map(a => `<li>${esc(a)}</li>`).join("")}</ol>`);
      const onPath = new Set(res.path);
      setDS("Binary decision tree (◆ question, ● leaf = travel mode)", `Highlighted = the ${res.answers.length} questions asked for this trip and the leaf reached. Each question node has exactly two children: yes / no.`,
        DS.decisionTree(res.tree, onPath, icon));
      setView("ds");
    } }],
  });

  App.feature({
    unit: "u5", id: "hierarchy", title: "City hierarchy", ds: "General tree (left-child, right-sibling)", cls: "c-tree",
    desc: "Pune → Zone → Ward → Locality like folders in a file system. Stored with two pointers per node (first child, next sibling). Counts are subtree sizes computed recursively. Click a locality to locate it.",
    fields: [{ name: "find", label: "Find place", type: "place", value: "VIT Pune", full: true }],
    onOpen: ctx => hierCall("", ctx),
    actions: [{ label: "Find path", primary: true, run: (v, ctx) => hierCall(v.find, ctx) }],
  });
  async function hierCall(find, ctx) {
    const r = await App.api("hierarchy", { find });
    if (!r.ok) return ctx.set(errorBox(r));
    const res = r.result, onPath = new Set(res.path);
    const render = n => n.children.length
      ? `<details class="h" ${onPath.has(n.name) || n.level === "city" ? "open" : ""}><summary>${onPath.has(n.name) ? `<span class="found">${esc(n.name)}</span>` : esc(n.name)} <span class="count">(${n.leaves} localities, ${n.size} nodes)</span></summary>${n.children.map(render).join("")}</details>`
      : `<div class="leaf" data-id="${n.id}">📍 ${onPath.has(n.name) ? `<span class="found">${esc(n.name)}</span>` : esc(n.name)}</div>`;
    ctx.set((res.path.length ? `<div class="note">${res.path.map(esc).join(" › ")}</div>` : "") + `<div style="margin-left:-14px">${render(res.tree)}</div>`);
    $$(".leaf[data-id]", ctx.out).forEach(l => (l.onclick = () => { const id = +l.dataset.id; MapView.clearOverlays(); MapView.ring(id, "#e03131", 4, 1.2); MapView.focusNodes([id]); setView("map"); }));
    if (res.path.length) { const id = App.placeId(res.path[res.path.length - 1]); if (id >= 0) { MapView.clearOverlays(); MapView.ring(id, "#e03131", 4, 1.2); } }
    const zones = res.tree.children;
    setDS("City hierarchy (n-ary tree)", `${res.nodes} nodes, height ${res.height}. Each zone's bar = number of localities in its subtree.`,
      DS.table(["Zone", "wards", "localities", "subtree nodes"], zones.map(z => [z.name, z.children.length, z.leaves, z.size]), { numCols: [1, 2, 3] }));
  }

  // =============================================================== UNIT 6
  App.feature({
    unit: "u6", id: "graph", title: "Adjacency list vs matrix", ds: "Graph representations", cls: "c-graph",
    desc: "The road network is stored both ways. The list costs O(V+E) memory and walks only real neighbours; the matrix costs O(V²) but answers 'is there a road u→v?' in O(1).",
    fields: [{ name: "node", label: "Place", type: "place", value: "Deccan Gymkhana", full: true }],
    actions: [{ label: "Compare", primary: true, run: async (v, ctx) => {
      const r = await App.api("graph", { node: v.node });
      if (!r.ok) return ctx.set(errorBox(r));
      const res = r.result;
      MapView.clearOverlays();
      res.adjacencyList.forEach(a => MapView.edge(res.node.id, a.to, COLORS.alt, 1.4, 0.9));
      MapView.ring(res.node.id, "#e03131", 3.5, 1.2);
      MapView.focusNodes([res.node.id, ...res.adjacencyList.map(a => a.to)]);
      const maxB = Math.max(res.listBytes, res.matrixBytes);
      const bar = (label, b, col) => `<div style="margin:3px 0"><div class="muted">${label}: <b>${b.toLocaleString()} bytes</b></div><div style="height:14px;width:${(100 * b / maxB).toFixed(1)}%;background:${col};border-radius:4px"></div></div>`;
      ctx.set(`<div class="kv"><div><b>${res.V}</b><span>V places</span></div><div><b>${res.E}</b><span>E directed arcs</span></div><div><b>${res.density.toFixed(2)}%</b><span>matrix filled</span></div></div>
        ${bar("Adjacency list O(V+E)", res.listBytes, "var(--c-list)")}${bar("Adjacency matrix O(V²)", res.matrixBytes, "var(--c-matrix)")}
        <div class="note">Neighbours of ${esc(res.node.name)}: list walk = <b>${res.listSteps}</b> steps, matrix row scan = <b>${res.matrixSteps}</b> steps.</div>` + summaryBox(r));
      setDS(`Representations of ${res.node.name}`, "Top: linked list of arcs head[u] → … → NULL. Bottom: the matrix row (only non-zero cells shown out of " + res.V + ").",
        DS.linkedList(res.adjacencyList.map(a => ({ label: a.toName, sub: `${a.km} km${a.oneWay ? " one-way" : ""}${a.toll ? " toll" : ""}` })), { title: `head[${res.node.id}] (adjacency list)` }) +
        `<div class="ds-label">matrix[${res.node.id}][0…${res.V - 1}] non-zero cells</div><div class="ds-row">${res.matrixRow.map(c => DS.cell(c.km, `col ${c.col}`, "c-matrix")).join("")}</div>`);
    } }],
  });

  App.feature({
    unit: "u6", id: "bfs", title: "BFS / DFS on the map", ds: "Queue · Stack", cls: "c-queue",
    desc: "Animated traversal of the whole road graph from a start place. BFS spreads in rings of equal hop count; DFS dives along one branch first.",
    fields: [{ name: "start", label: "Start", type: "place", value: "Shivajinagar" },
      { name: "algo", label: "Algorithm", type: "select", value: "bfs", options: [["bfs", "BFS - queue"], ["dfs_iter", "DFS - explicit stack"], ["dfs_rec", "DFS - recursion"]] }],
    actions: [{ label: "Animate", primary: true, run: (v, ctx) => { setView("map"); return runTraverse(v, ctx); } }],
  });

  App.feature({
    unit: "u6", id: "closure", title: "Road closures & re-route", ds: "Graph + BFS", cls: "c-graph",
    desc: "CLOSURE MODE: click roads on the map to close / reopen them (monsoon flooding, processions). Closed roads are skipped by every algorithm. BFS reports areas that became unreachable and Dijkstra re-routes automatically. Tip: close 'Hinjewadi Phase 3 Road' to cut off Phase 3.",
    fields: [{ name: "from", label: "From (reachability)", type: "place", value: "Swargate" }, { name: "to", label: "Re-route to", type: "place", value: "Pune Station" }, { name: "hour", label: "Hour", type: "hour", value: 9, full: true }],
    onOpen: ctx => {
      MapView.setRoadClick(async id => { const v = ctx.values(); await closureCall({ op: "toggle", road: id, ...v }, ctx); });
      closureCall({ op: "status", ...ctx.values() }, ctx);
      setView("map");
    },
    actions: [{ label: "Re-route", primary: true, run: (v, ctx) => closureCall({ op: "status", ...v }, ctx) },
      { label: "Reopen all roads", run: (v, ctx) => closureCall({ op: "reset", ...v }, ctx) }],
  });
  async function closureCall(p, ctx) {
    const r = await App.api("closure", p);
    if (!r.ok) return ctx.set(errorBox(r));
    const res = r.result;
    const meta = await App.api("meta");
    if (meta.ok) { App.meta.roads = meta.result.roads; MapView.updateRoads(meta.result.roads); }
    renderLab(r);
    MapView.clearOverlays();
    res.unreachable.forEach(n => MapView.dot(n, "#e03131", 2.6, 0.7));
    res.cannotReachStart.forEach(n => MapView.ring(n, "#e8730c", 3, 0.9));
    const rr = res.reroute;
    if (rr && rr.found) {
      MapView.drawPath(rr.baselinePath.nodes, "#999", 1.2, 0.6, "2 1.5");
      MapView.drawPath(rr.path.nodes, COLORS.path, 1.9);
    }
    MapView.markEnds(res.from.id, rr ? rr.to.id : -1);
    ctx.set(`<div class="kv"><div><b>${res.closed.length}</b><span>closed roads</span></div><div><b>${res.unreachable.length}</b><span>unreachable from ${esc(res.from.name)}</span></div>
      <div><b>${rr ? (rr.found ? "+" + rr.extraMinutes.toFixed(0) + " min" : "cut off!") : "-"}</b><span>re-route delay</span></div></div>
      <div class="note">Click any road on the map to close / reopen it. Red dots = unreachable, orange rings = can no longer reach ${esc(res.from.name)}; dashed grey = normal route.</div>` + summaryBox(r));
  }

  App.feature({
    unit: "u6", id: "hashchain", title: "Hash: separate chaining", ds: "Hash table (array of linked lists)", cls: "c-hash",
    desc: "Every place-name lookup in the app goes through this table: h(name) = polynomial rolling hash mod m (m prime). Colliding names share a bucket's linked list. Rehash when the load factor exceeds 1.5.",
    fields: [{ name: "key", label: "Place name", type: "place", value: "Viman Nagar", full: true }],
    onOpen: ctx => hashChain("", ctx),
    actions: [{ label: "Lookup", primary: true, run: (v, ctx) => hashChain(v.key, ctx) }],
  });
  async function hashChain(key, ctx) {
    const r = await App.api("hash", { table: "chaining", key });
    if (!r.ok) return ctx.set(errorBox(r));
    const res = r.result, lk = res.lookup;
    ctx.set(`<div class="kv"><div><b>${res.loadFactor.toFixed(2)}</b><span>load factor α</span></div><div><b>${res.collisions}</b><span>collisions</span></div><div><b>${res.longestChain}</b><span>longest chain</span></div></div>` + summaryBox(r));
    if (lk && lk.found) { MapView.clearOverlays(); MapView.ring(lk.id, "#d6336c", 4, 1.2); }
    setDS(`Chaining: ${res.size} keys in ${res.capacity} buckets`, lk ? `h("${esc(lk.key)}") mod ${res.capacity} = bucket <b>${lk.bucket}</b> → ${lk.found ? "found" : "not found"} after ${lk.probes} node(s)` : "Look up a name to highlight its bucket.",
      DS.buckets(res.buckets, { hlBucket: lk ? lk.bucket : -1, hlKey: lk ? lk.key : null }));
    setView("ds");
  }

  App.feature({
    unit: "u6", id: "hashopen", title: "Hash: open addressing", ds: "Hash table (linear / quadratic probing)", cls: "c-hash",
    desc: "Road records keyed by road code (from·1000 + to·10 + n) in ONE array. h(k) = k mod m. Collisions probe h, h+1, h+2 … (linear) or h, h+1, h+3, h+6 … (quadratic). Deleting leaves a tombstone (†). The table doubles when α would exceed 0.7.",
    fields: [{ name: "key", label: "Road id", type: "number", value: 42, min: 0 }, { name: "probe", label: "Probing", type: "select", value: "linear", options: ["linear", "quadratic"] }],
    onOpen: ctx => hashOpen({ key: "", probe: "linear" }, ctx),
    actions: [{ label: "Lookup", primary: true, run: (v, ctx) => hashOpen({ key: v.key, probe: v.probe }, ctx) },
      { label: "Rebuild from 16 slots", run: (v, ctx) => hashOpen({ key: v.key, probe: v.probe, op: "build" }, ctx) },
      { label: "Delete (tombstone)", run: (v, ctx) => hashOpen({ key: v.key, probe: v.probe, op: "delete" }, ctx) }],
  });
  async function hashOpen(p, ctx) {
    const r = await App.api("hash", { table: "open", ...p });
    if (!r.ok) return ctx.set(errorBox(r));
    const res = r.result, lk = res.lookup;
    const c = res.compare;
    ctx.set(`<div class="kv"><div><b>${res.loadFactor.toFixed(2)}</b><span>α (max ${res.maxLoad})</span></div><div><b>${res.collisions}</b><span>collisions</span></div><div><b>${res.longestCluster}</b><span>longest cluster</span></div></div>
      ${DS.table(["probing", "avg probes / lookup", "collisions", "longest cluster"], [["linear", c.linear.avgProbes, c.linear.collisions, c.linear.longestCluster], ["quadratic", c.quadratic.avgProbes, c.quadratic.collisions, c.quadratic.longestCluster]], { numCols: [1, 2, 3] })}
      <h4>Rehash log</h4><ul class="list">${res.rehashLog.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` + summaryBox(r));
    if (lk && lk.found) { const road = App.meta.roads[lk.roadId]; drawRoute([road.from, road.to], "#d6336c", false); }
    const seq = lk ? lk.sequence : [];
    const draw = k => DS.slots(res.slots, { seq: seq.slice(0, k + 1), home: lk ? lk.home : -1, hit: lk && lk.found && k >= seq.length - 1 ? seq[seq.length - 1] : -1 });
    setDS(`Open addressing (${res.probe}) - ${res.size} roads in ${res.capacity} slots`, lk ? `Key ${lk.key} → home slot ${lk.home}; probe sequence ${seq.join(" → ")} (${lk.probes} probe${lk.probes > 1 ? "s" : ""})` : "Pink = occupied, † = tombstone, · = empty.", draw(seq.length));
    if (seq.length > 1) Player.load(seq.length, k => setDS(`Probing (${res.probe})`, `Probe ${k + 1}: slot ${seq[k]}`, draw(k)), { autoplay: true });
    setView("ds");
  }

  // the autocomplete search is also a Unit 6 (hashing) topic
  App.feature({ ...searchFeature, unit: "u6", id: "search6", title: "Autocomplete search" });
})();
