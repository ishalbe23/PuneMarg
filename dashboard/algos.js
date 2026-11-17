/* algos.js - the data structures & algorithms behind the dashboard labs.
 * Pure JavaScript, no DOM. Each "...Steps" function returns a list of steps that the UI replays.
 * Works in the browser (window.A) and in Node (module.exports) so it can be unit-tested. */
(function (root) {
  const A = {};

  // ---------------------------------------------------------------- data loading
  A.parseCSV = function (text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith("#"));
    const head = lines.shift().split(",");
    return lines.map(l => { const c = l.split(","); const o = {}; head.forEach((h, i) => o[h] = c[i]); return o; });
  };
  A.buildCity = function (nodesCsv, edgesCsv, trafficCsv) {
    const nodes = A.parseCSV(nodesCsv).map(r => ({ id: +r.id, name: r.name, zone: r.zone, lat: +r.lat, lon: +r.lon, type: r.type, rating: +r.rating }));
    const edges = A.parseCSV(edgesCsv).map(r => ({ id: +r.id, a: +r.from, b: +r.to, km: +r.distance_km, type: r.road_type, oneWay: r.one_way === "1", toll: +r.toll, speed: +r.base_speed_kmph, name: r.name }));
    const traffic = {};
    if (trafficCsv) A.parseCSV(trafficCsv).forEach(r => { const a = []; for (let h = 0; h < 24; h++) a.push(+r["h" + h]); traffic[+r.road_id] = a; });
    return { nodes, edges, traffic };
  };
  /** adjacency list: adj[u] = [{to, w, e}] ; weightFn(edge) gives the cost. Respects one-way roads unless undirected. */
  A.buildAdj = function (n, edges, weightFn, undirected) {
    const adj = Array.from({ length: n }, () => []);
    edges.forEach((e, i) => {
      const w = weightFn(e);
      adj[e.a].push({ to: e.b, w, e: i });
      if (undirected || !e.oneWay) adj[e.b].push({ to: e.a, w, e: i });
    });
    return adj;
  };

  // ---------------------------------------------------------------- binary min-heap (array based)
  class MinHeap {
    constructor() { this.a = []; this.swaps = 0; }
    get size() { return this.a.length; }
    push(item) { const a = this.a; a.push(item); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; this.swaps++; i = p; } }
    pop() {
      const a = this.a; const top = a[0]; const last = a.pop();
      if (a.length) { a[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; this.swaps++; i = m; } }
      return top;
    }
    peek() { return this.a[0]; }
  }
  A.MinHeap = MinHeap;

  // ---------------------------------------------------------------- Union-Find (disjoint set)
  class UnionFind {
    constructor(n) { this.p = Array.from({ length: n }, (_, i) => i); this.r = new Array(n).fill(0); this.sets = n; this.hops = 0; }
    find(x) { while (this.p[x] !== x) { this.p[x] = this.p[this.p[x]]; x = this.p[x]; this.hops++; } return x; }   // path halving
    union(a, b) {
      a = this.find(a); b = this.find(b); if (a === b) return false;
      if (this.r[a] < this.r[b]) [a, b] = [b, a];
      this.p[b] = a; if (this.r[a] === this.r[b]) this.r[a]++; this.sets--; return true;
    }
  }
  A.UnionFind = UnionFind;

  /** Kruskal's minimum spanning tree. Returns {steps, tree, total}. */
  A.kruskalSteps = function (city) {
    const n = city.nodes.length;
    const order = city.edges.map((e, i) => i).sort((x, y) => city.edges[x].km - city.edges[y].km || x - y);
    const uf = new UnionFind(n); const steps = []; const tree = []; let total = 0;
    order.forEach((ei, k) => {
      const e = city.edges[ei]; const ra = uf.find(e.a), rb = uf.find(e.b);
      const same = ra === rb;
      if (!same) { uf.union(e.a, e.b); tree.push(ei); total += e.km; }
      steps.push({ k, edge: ei, added: !same, total: +total.toFixed(2), sets: uf.sets, treeSize: tree.length, roots: n <= 200 ? Array.from({ length: n }, (_, i) => uf.find(i)) : null, ra, rb });
    });
    return { steps, tree, total: +total.toFixed(2), order, components: uf.sets };
  };

  // ---------------------------------------------------------------- Dijkstra with a visible heap
  A.dijkstraSteps = function (n, adj, src, dst) {
    const dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), prevEdge = new Array(n).fill(-1);
    const settled = []; const done = new Array(n).fill(false);
    const heap = new MinHeap(); dist[src] = 0; heap.push([0, src]);
    const snap = () => heap.a.slice().sort((x, y) => x[0] - y[0]);
    const steps = [{ kind: "init", u: src, d: 0, relaxed: [], heap: snap(), settledCount: 0, pops: 0, pushes: 1 }];
    let pops = 0, pushes = 1, stale = 0, found = false;
    while (heap.size) {
      const [d, u] = heap.pop(); pops++;
      if (done[u]) { stale++; continue; }
      done[u] = true; settled.push(u);
      const relaxed = [];
      for (const { to, w, e } of adj[u]) {
        if (done[to]) continue;
        const nd = d + w;
        if (nd < dist[to]) { relaxed.push({ to, e, nd, was: dist[to], improved: true }); dist[to] = nd; prev[to] = u; prevEdge[to] = e; heap.push([nd, to]); pushes++; }
        else relaxed.push({ to, e, nd, was: dist[to], improved: false });
      }
      steps.push({ kind: "settle", u, d, relaxed, heap: snap(), settledCount: settled.length, pops, pushes, frontier: heap.a.map(x => x[1]) });
      if (u === dst) { found = true; break; }
    }
    const path = []; if (found || done[dst]) for (let v = dst; v !== -1; v = prev[v]) path.push(v); path.reverse();
    return { steps, settled, dist, prev, prevEdge, path: path[0] === src ? path : [], stale, swaps: heap.swaps, pops, pushes };
  };

  // ---------------------------------------------------------------- graph basics
  A.components = function (n, edges) {
    const uf = new UnionFind(n); edges.forEach(e => uf.union(e.a, e.b));
    const map = new Map(); for (let i = 0; i < n; i++) { const r = uf.find(i); if (!map.has(r)) map.set(r, []); map.get(r).push(i); }
    return [...map.values()].sort((x, y) => y.length - x.length);
  };
  /** Floyd-Warshall all-pairs shortest paths. Returns {dist, next, ops}. O(V^3). */
  A.floyd = function (n, edges, weightFn) {
    const INF = 1e9; const dist = Array.from({ length: n }, (_, i) => { const r = new Float64Array(n).fill(INF); r[i] = 0; return r; });
    const next = Array.from({ length: n }, () => new Int16Array(n).fill(-1));
    edges.forEach(e => { const w = weightFn(e); if (w < dist[e.a][e.b]) { dist[e.a][e.b] = w; next[e.a][e.b] = e.b; } if (!e.oneWay && w < dist[e.b][e.a]) { dist[e.b][e.a] = w; next[e.b][e.a] = e.a; } });
    let ops = 0;
    for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) { const dik = dist[i][k]; if (dik >= INF) continue; for (let j = 0; j < n; j++) { ops++; const t = dik + dist[k][j]; if (t < dist[i][j]) { dist[i][j] = t; next[i][j] = next[i][k]; } } }
    return { dist, next, ops, INF };
  };
  A.fwPath = function (fw, u, v) { if (fw.next[u][v] === -1) return []; const p = [u]; while (u !== v) { u = fw.next[u][v]; p.push(u); } return p; };
  /** Top-K using a size-K min-heap: O(n log k). Returns {top, steps}. score(i) -> number */
  A.topK = function (items, k, score) {
    const h = new MinHeap(); const steps = [];
    items.forEach((it, i) => {
      const s = score(it);
      if (h.size < k) { h.push([s, i]); steps.push({ i, action: "push", s }); }
      else if (s > h.peek()[0]) { h.pop(); h.push([s, i]); steps.push({ i, action: "replace", s }); }
      else steps.push({ i, action: "skip", s });
    });
    const top = h.a.slice().sort((x, y) => y[0] - x[0]).map(x => ({ item: items[x[1]], score: x[0] }));
    return { top, steps, swaps: h.swaps };
  };

  // ---------------------------------------------------------------- Segment tree (sum or max) + Fenwick tree
  class SegTree {
    constructor(arr, mode) {
      this.mode = mode; this.n = 1; while (this.n < arr.length) this.n <<= 1; this.len = arr.length;
      this.id = mode === "max" ? -Infinity : 0; this.t = new Array(2 * this.n).fill(this.id);
      arr.forEach((v, i) => this.t[this.n + i] = v);
      for (let i = this.n - 1; i >= 1; i--) this.t[i] = this.f(this.t[2 * i], this.t[2 * i + 1]);
    }
    f(a, b) { return this.mode === "max" ? Math.max(a, b) : a + b; }
    /** query [l, r] inclusive; returns {value, visits:[{idx, lo, hi, state}]} state = taken | partial | skipped */
    query(l, r) {
      const visits = []; const rec = (idx, lo, hi) => {
        if (r < lo || hi < l || lo >= this.len) { visits.push({ idx, lo, hi, state: "skipped" }); return this.id; }
        if (l <= lo && hi <= r) { visits.push({ idx, lo, hi, state: "taken" }); return this.t[idx]; }
        visits.push({ idx, lo, hi, state: "partial" }); const mid = (lo + hi) >> 1;
        return this.f(rec(2 * idx, lo, mid), rec(2 * idx + 1, mid + 1, hi));
      };
      return { value: rec(1, 0, this.n - 1), visits };
    }
    update(pos, v) { let i = this.n + pos; this.t[i] = v; const touched = [i]; for (i >>= 1; i >= 1; i >>= 1) { this.t[i] = this.f(this.t[2 * i], this.t[2 * i + 1]); touched.push(i); } return touched; }
  }
  A.SegTree = SegTree;
  class Fenwick {
    constructor(arr) { this.n = arr.length; this.t = new Array(this.n + 1).fill(0); arr.forEach((v, i) => this.add(i, v)); }
    add(i, d) { const touched = []; for (i++; i <= this.n; i += i & -i) { this.t[i] += d; touched.push(i); } return touched; }
    prefix(i) { const used = []; let s = 0; for (i++; i > 0; i -= i & -i) { s += this.t[i]; used.push(i); } return { sum: s, used }; }
  }
  A.Fenwick = Fenwick;

  // ---------------------------------------------------------------- Trie
  class Trie {
    constructor() { this.root = { c: {}, end: null }; this.nodes = 1; }
    insert(word, payload) { let n = this.root; for (const ch of word) { if (!n.c[ch]) { n.c[ch] = { c: {}, end: null }; this.nodes++; } n = n.c[ch]; } n.end = payload; }
    /** walk the prefix; returns {path:[{ch, kids, found}], node} */
    walk(prefix) {
      let n = this.root; const path = [{ ch: "(root)", kids: Object.keys(n.c).length, found: true }]; let ok = true;
      for (const ch of prefix) { if (ok && n.c[ch]) { n = n.c[ch]; path.push({ ch, kids: Object.keys(n.c).length, found: true }); } else { ok = false; path.push({ ch, kids: 0, found: false }); } }
      return { path, node: ok ? n : null };
    }
    collect(node, prefix, out, limit) { if (out.length >= limit) return; if (node.end !== null) out.push({ text: prefix, payload: node.end }); for (const ch of Object.keys(node.c).sort()) this.collect(node.c[ch], prefix + ch, out, limit); }
    suggest(prefix, limit = 8) { const w = this.walk(prefix); const out = []; if (w.node) this.collect(w.node, prefix, out, limit); return { out, walk: w }; }
  }
  A.Trie = Trie;

  // ---------------------------------------------------------------- KMP string matching
  A.kmpTable = function (p) { const f = new Array(p.length).fill(0); for (let i = 1, k = 0; i < p.length; i++) { while (k && p[i] !== p[k]) k = f[k - 1]; if (p[i] === p[k]) k++; f[i] = k; } return f; };
  /** returns {steps:[{i,j,match,found}], found:[start...], cmp} - i walks the text and never goes back. */
  A.kmpSteps = function (text, p) {
    const f = A.kmpTable(p); const steps = []; const found = []; let j = 0, cmp = 0;
    for (let i = 0; i < text.length; i++) {
      for (;;) {
        cmp++; const ok = text[i] === p[j];
        steps.push({ i, j, ok, found: false, f: j > 0 && !ok ? f[j - 1] : null });
        if (ok) { j++; break; }
        if (j === 0) break;
        j = f[j - 1];
      }
      if (j === p.length) { found.push(i - p.length + 1); steps[steps.length - 1].found = true; j = f[j - 1]; }
    }
    return { steps, found, cmp, table: f };
  };
  A.naiveCount = function (text, p) { let c = 0; for (let i = 0; i + p.length <= text.length; i++) { let j = 0; while (j < p.length) { c++; if (text[i + j] !== p[j]) break; j++; } } return c; };

  // ---------------------------------------------------------------- Topological sort (Kahn) on a task graph
  A.topoSteps = function (tasks, deps) { // deps: [[from,to]] meaning from must finish before to
    const n = tasks.length; const indeg = new Array(n).fill(0); const out = Array.from({ length: n }, () => []);
    deps.forEach(([a, b]) => { out[a].push(b); indeg[b]++; });
    const q = []; for (let i = 0; i < n; i++) if (!indeg[i]) q.push(i);
    const steps = [{ kind: "init", queue: q.slice(), indeg: indeg.slice(), order: [] }]; const order = []; const done = new Array(n).fill(false);
    while (q.length) {
      const u = q.shift(); order.push(u); done[u] = true; const released = [];
      for (const v of out[u]) { indeg[v]--; if (!indeg[v]) { q.push(v); released.push(v); } }
      steps.push({ kind: "take", u, queue: q.slice(), indeg: indeg.slice(), order: order.slice(), released });
    }
    const stuck = []; for (let i = 0; i < n; i++) if (!done[i]) stuck.push(i);
    return { steps, order, cycle: order.length < n, stuck };
  };

  if (typeof module !== "undefined" && module.exports) module.exports = A; else root.A = A;
})(typeof window !== "undefined" ? window : globalThis);
