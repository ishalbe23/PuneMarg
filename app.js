/*
 * app.js - application shell: API calls, Algorithm Lab strip, unit/feature navigation,
 * form helpers, map <-> data-structure view switching, theme, command palette,
 * keyboard shortcuts, toasts and the welcome tour.
 * Feature panels themselves live in features.js and register via App.feature({...}).
 */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

const App = {
  meta: null,
  names: [],
  units: [
    { id: "home", short: "Go", icon: "🧭", label: "route", title: "Route Planner", desc: "Plan a route with any algorithm - every result shows the data structure that produced it.", features: [] },
    { id: "u1", short: "U1", icon: "📈", label: "growth", title: "Unit 1 · Complexity & Recursion", desc: "Asymptotic analysis (Ω, Θ, O), time-space trade-offs, recursion and backtracking.", features: [] },
    { id: "u2", short: "U2", icon: "🔢", label: "arrays", title: "Unit 2 · Arrays, Searching, Sorting", desc: "2D arrays, sparse matrices & transpose, linear vs binary search, five sorting algorithms.", features: [] },
    { id: "u3", short: "U3", icon: "📚", label: "stacks", title: "Unit 3 · Stacks & Queues", desc: "Expression conversion & evaluation, undo/redo, queue, circular queue, deque, priority queue.", features: [] },
    { id: "u4", short: "U4", icon: "🔗", label: "lists", title: "Unit 4 · Linked Lists", desc: "Singly, doubly, circular and polynomial linked lists with dynamic memory (new/delete).", features: [] },
    { id: "u5", short: "U5", icon: "🌳", label: "trees", title: "Unit 5 · Trees", desc: "BST, AVL, expression tree, heap tree, decision tree and a general (n-ary) tree.", features: [] },
    { id: "u6", short: "U6", icon: "🕸️", label: "graphs", title: "Unit 6 · Graphs & Hashing", desc: "Adjacency list vs matrix, BFS/DFS, shortest paths, closures, chaining and open addressing.", features: [] },
  ],
  currentUnit: null,
  currentFeature: null,
  activePlaceInput: null,
  lastRoute: null,
  explored: new Set(store.get("pm-explored", [])),
  pending: 0,

  // ------------------------------------------------------------ API
  async api(path, params = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") qs.set(k, v);
    let data;
    progress(+1);
    try {
      if (window.PM_STATIC) {
        // Static website: the C++ engine is compiled to WebAssembly and runs inside this browser tab.
        const engine = await (App.engine ||= PuneMargEngine());
        data = JSON.parse(engine.ccall("pm_api", "string", ["string", "string"], [path, qs.toString()]));
      } else {
        const res = await fetch(`/api/${path}?${qs}`);
        data = await res.json();
      }
      setStatus(true);
    } catch (e) {
      console.error(e);
      setStatus(false);
      toast("Cannot reach the PuneMarg server – is punemarg_server running?");
      return { ok: false, error: "Server not reachable" };
    } finally {
      progress(-1);
    }
    if (data.ok) renderLab(data);
    else { toast(data.error || "Request failed"); renderMemory(data.memory); }
    return data;
  },

  // ------------------------------------------------------- features
  feature(def) {
    const unit = this.units.find(u => u.id === def.unit);
    unit.features.push(def);
  },

  placeId(name) {
    if (name === "" || name == null) return -1;
    if (/^\d+$/.test(String(name))) return +name;
    const i = this.names.findIndex(n => n.toLowerCase() === String(name).trim().toLowerCase());
    return i;
  },
  name(id) { return this.meta?.places[id]?.name ?? String(id); },
};

// ------------------------------------------------------------ UI helpers
function progress(delta) {
  App.pending = Math.max(0, App.pending + delta);
  const bar = $("#topProgress");
  if (App.pending > 0) { bar.classList.remove("done"); bar.classList.add("on"); }
  else { bar.classList.remove("on"); bar.classList.add("done"); setTimeout(() => { if (!App.pending) bar.classList.remove("done"); }, 400); }
}

function toast(msg, kind = "error") {
  const box = $("#toasts");
  const icon = kind === "info" ? "ℹ️" : kind === "ok" ? "✅" : "⚠️";
  // de-duplicate identical messages that arrive in a burst
  const same = $$(".t-item", box).find(t => t.dataset.msg === msg);
  if (same) same.remove();
  const t = document.createElement("div");
  t.className = "t-item " + (kind === "error" ? "" : kind);
  t.dataset.msg = msg;
  t.innerHTML = `<span class="t-ico">${icon}</span><span>${DS.esc(msg)}</span><button title="Dismiss">✕</button>`;
  const close = () => { t.classList.add("out"); setTimeout(() => t.remove(), 250); };
  t.querySelector("button").onclick = close;
  box.appendChild(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(close, kind === "error" ? 5000 : 3200);
}
function setStatus(ok) {
  const s = $("#serverStatus");
  s.querySelector("span").textContent = ok ? (window.PM_STATIC ? "C++ engine (WebAssembly)" : "C++ backend connected") : "backend offline – click to retry";
  s.className = "pill " + (ok ? "ok" : "bad");
  s.title = ok ? (window.PM_STATIC ? "The hand-written C++ engine, compiled to WebAssembly, is running inside this browser" : "The hand-written C++ server is answering requests") : "Start punemarg_server.exe, then click here";
}
function setView(which) {
  $("#mapPane").classList.toggle("hidden", which !== "map");
  $("#dsPane").classList.toggle("hidden", which !== "ds");
  $("#viewMap").classList.toggle("active", which === "map");
  $("#viewDs").classList.toggle("active", which === "ds");
  const b = $("#showDsBtn");
  if (b) b.innerHTML = which === "ds" ? "🗺 Back to map" : "🔍 Show data structure";
  if (which === "map") window.dispatchEvent(new Event("resize"));
}
function setDS(title, caption, html) {
  $("#dsTitle").textContent = title;
  $("#dsCaption").innerHTML = caption || "";
  const view = $("#dsView");
  const keepScroll = view.dataset.title === title;          // same animation -> keep the user's scroll
  view.innerHTML = html || "";
  view.dataset.title = title;
  const tree = $("svg[data-rootx]", view);                  // centre wide trees on their root
  if (tree && !keepScroll) view.scrollLeft = Math.max(0, +tree.dataset.rootx - view.clientWidth / 2);
}
function renderMemory(m) {
  if (!m) return;
  $("#labMem").innerHTML = `<div class="lab-label">Memory (new / delete)</div>
    <div><span>allocations</span><b>${m.allocations}</b></div><div><span>frees</span><b>${m.frees}</b></div>
    <div><span>live blocks</span><b>${m.liveBlocks}</b></div><div><span>live bytes</span><b>${(m.bytesLive / 1024).toFixed(1)} KB</b></div>`;
}
let lastCounters = {};
function renderLab(r) {
  const s = r.stats || {}, c = r.complexity || {};
  $("#labOp").textContent = s.operation || "—";
  $("#labDs").textContent = "data structure: " + (r.structure || "—");
  const ctr = (k, label) => {
    const v = s[k] ?? 0;
    const changed = k !== "timeMs" && v && lastCounters[k] !== v;
    return `<div class="ctr ${v ? "" : "zero"} ${changed ? "flash" : ""}" title="${label}"><b>${k === "timeMs" ? (+v).toFixed(3) : v}</b><span>${label}</span></div>`;
  };
  $("#labCounters").innerHTML = ctr("comparisons", "comparisons") + ctr("swaps", "swaps / moves") + ctr("visited", "nodes visited") +
    ctr("probes", "hash probes") + ctr("pushes", "push / enqueue") + ctr("pops", "pop / dequeue") +
    (s.rotations ? ctr("rotations", "AVL rotations") : ctr("recursiveCalls", `recursive calls${s.maxDepth ? " (depth " + s.maxDepth + ")" : ""}`)) +
    ctr("timeMs", "time (ms)");
  lastCounters = { ...s };
  $("#labCx").innerHTML = `<div class="lab-label">Complexity</div>
    <div class="cx"><span title="best case">Ω ${DS.esc(c.best || "-")}</span><span title="average case">Θ ${DS.esc(c.average || "-")}</span><span title="worst case">O ${DS.esc(c.worst || "-")}</span><span title="extra space">space ${DS.esc(c.space || "-")}</span></div>
    <div class="trade">⚖ ${DS.esc(c.tradeoff || "")}</div>`;
  renderMemory(r.memory);
}

// Form builder. field: {name, label, type: place|text|number|select|check|hour, value, options, full}
let placeIdx = 0;
function buildForm(fields) {
  placeIdx = 0;
  return fields.map(f => {
    const full = f.full ? "full" : "";
    const id = `f_${f.name}`;
    if (f.type === "place") return `<label class="${full}">${f.label}<span class="place-wrap p${placeIdx++}"><i class="pin"></i><input type="text" id="${id}" list="placeList" value="${DS.esc(f.value ?? "")}" data-place autocomplete="off" placeholder="Type or click on the map"><button type="button" class="clr" tabindex="-1" title="Clear">✕</button></span></label>`;
    if (f.type === "select") return `<label class="${full}">${f.label}<select id="${id}">${f.options.map(o => {
      const [v, t] = Array.isArray(o) ? o : [o, o];
      return `<option value="${DS.esc(v)}" ${String(v) === String(f.value) ? "selected" : ""}>${DS.esc(t)}</option>`;
    }).join("")}</select></label>`;
    if (f.type === "check") return `<label class="${full}" style="flex-direction:row;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="${id}" ${f.value ? "checked" : ""}>${f.label}</label>`;
    if (f.type === "hour") return `<label class="${full}">${f.label}: <b id="${id}_v">${hourText(f.value)}</b><input type="range" id="${id}" min="0" max="23" value="${f.value}" oninput="document.getElementById('${id}_v').textContent=hourText(this.value)"></label>`;
    return `<label class="${full}">${f.label}<input type="${f.type === "number" ? "number" : "text"}" id="${id}" value="${DS.esc(f.value ?? "")}" ${f.min !== undefined ? `min="${f.min}"` : ""} ${f.max !== undefined ? `max="${f.max}"` : ""} ${f.placeholder ? `placeholder="${DS.esc(f.placeholder)}"` : ""}></label>`;
  }).join("");
}
function hourText(h) {
  h = +h;
  const ampm = h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;
  const tag = (h >= 8 && h <= 11) || (h >= 17 && h <= 20) ? " · 🚦 peak" : h >= 23 || h <= 5 ? " · 🌙 night" : "";
  return `${h}:00 (${ampm})${tag}`;
}
function readForm(fields) {
  const v = {};
  for (const f of fields) {
    const e = document.getElementById(`f_${f.name}`);
    if (!e) continue;
    v[f.name] = f.type === "check" ? e.checked : e.value;
  }
  return v;
}

// --------------------------------------------------------- navigation
function renderRail() {
  $("#unitRail").innerHTML = App.units.map((u, i) =>
    `<button data-unit="${u.id}" title="${DS.esc(u.title)} (key ${i + 1})"><span class="ri">${u.icon}</span><b>${u.short}</b>${u.label}<span class="prog"><i></i></span></button>` +
    (i === 0 ? `<div class="rail-sep"></div>` : "")).join("");
  $$("#unitRail button").forEach(b => (b.onclick = () => openUnit(b.dataset.unit)));
  updateProgress();
}
function updateProgress() {
  for (const u of App.units) {
    const done = u.features.filter(f => App.explored.has(`${u.id}/${f.id}`)).length;
    const b = $(`#unitRail button[data-unit="${u.id}"]`);
    if (b) b.querySelector(".prog i").style.width = (u.features.length ? (100 * done / u.features.length) : 0) + "%";
    if (u === App.currentUnit) {
      const ex = $("#unitHeader .explored");
      if (ex) ex.textContent = `${done} / ${u.features.length} explored`;
      $$("#featureTabs button").forEach(t => {
        const has = App.explored.has(`${u.id}/${t.dataset.f}`);
        let tick = t.querySelector(".tick");
        if (has && !tick) t.insertAdjacentHTML("beforeend", `<span class="tick">✓</span>`);
      });
    }
  }
}
function markExplored() {
  const key = `${App.currentUnit.id}/${App.currentFeature.id}`;
  if (App.explored.has(key)) return;
  App.explored.add(key);
  store.set("pm-explored", [...App.explored]);
  updateProgress();
}
function openUnit(id, featureId, opts = {}) {
  const u = App.units.find(x => x.id === id);
  if (!u) return;
  App.currentUnit = u;
  $$("#unitRail button").forEach(b => b.classList.toggle("active", b.dataset.unit === id));
  $("#unitHeader").innerHTML = `<div class="uh-top"><h2>${DS.esc(u.title)}</h2><span class="explored"></span></div><p>${DS.esc(u.desc)}</p>`;
  $("#featureTabs").innerHTML = u.features.map(f => `<button data-f="${f.id}" title="${DS.esc(f.ds)}">${DS.esc(f.title)}</button>`).join("");
  $$("#featureTabs button").forEach(b => (b.onclick = () => openFeature(b.dataset.f)));
  openFeature(featureId && u.features.some(f => f.id === featureId) ? featureId : u.features[0]?.id, opts);
  updateProgress();
}
function openFeature(fid, opts = {}) {
  const f = App.currentUnit.features.find(x => x.id === fid);
  if (!f) return;
  App.currentFeature = f;
  $("#layout").classList.remove("focus");
  const hash = `#${App.currentUnit.id}/${f.id}`;
  if (location.hash !== hash) {
    if (opts.replace) history.replaceState(null, "", hash);
    else history.pushState(null, "", hash);
  }
  $$("#featureTabs button").forEach(b => b.classList.toggle("active", b.dataset.f === fid));
  $(`#featureTabs button[data-f="${fid}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  Player.clear();
  MapView.setRoadClick(null);
  const panel = $("#featurePanel");
  const dsOpen = !$("#dsPane").classList.contains("hidden");
  const hasPrimary = (f.actions || []).some(a => a.primary);
  panel.innerHTML = `<div class="feat-head"><div><h3>${DS.esc(f.title)}</h3><span class="ds-badge ${f.cls || ""}">${DS.esc(f.ds)}</span></div>
      <div class="feat-tools">
        <button id="copyLink" title="Copy a link that opens this feature and runs it">🔗</button>
        <button class="show-ds" id="showDsBtn" title="Switch the left pane between the map and the live data structure (M / D)">${dsOpen ? "🗺 Back to map" : "🔍 Show data structure"}</button>
      </div></div>
    <p class="feat-desc">${f.desc}</p>
    <div class="form">${buildForm(f.fields || [])}<div class="actions">${(f.actions || []).map((a, i) => `<button data-a="${i}" class="${a.primary ? "primary" : ""}">${DS.esc(a.label)}</button>`).join("")}${hasPrimary && (f.fields || []).length ? `<span class="enter-hint"><kbd>Enter</kbd> to run</span>` : ""}</div></div>
    <div class="out" id="out"></div>`;
  panel.scrollTop = 0;
  $("#showDsBtn").onclick = () => setView($("#dsPane").classList.contains("hidden") ? "ds" : "map");
  $("#copyLink").onclick = async () => {
    const url = `${location.origin}${location.pathname}#${App.currentUnit.id}/${f.id}/run`;
    try { await navigator.clipboard.writeText(url); toast("Link copied – it opens this feature and runs it", "ok"); }
    catch { toast(url, "info"); }
  };
  const ctx = {
    out: $("#out"),
    values: () => readForm(f.fields || []),
    set: html => ($("#out").innerHTML = html),
  };
  $$(".actions button", panel).forEach(b => (b.onclick = async () => {
    const a = f.actions[+b.dataset.a];
    b.disabled = true;
    b.classList.add("loading");
    try { await a.run(ctx.values(), ctx); markExplored(); } catch (e) { console.error(e); toast("UI error: " + e.message); }
    b.disabled = false;
    b.classList.remove("loading");
  }));
  // place inputs: focus target, clear button, validation
  $$("[data-place]", panel).forEach(inp => {
    inp.addEventListener("focus", () => setTargetInput(inp));
    inp.addEventListener("input", () => inp.classList.remove("invalid"));
    inp.addEventListener("change", () => validatePlace(inp));
    inp.parentElement.querySelector(".clr").onclick = () => { inp.value = ""; inp.focus(); };
  });
  setTargetInput($("[data-place]", panel));
  // Enter in any field runs the main action
  $$(".form input", panel).forEach(inp => inp.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); $(".actions button.primary", panel)?.click(); }
  }));
  if (f.onOpen) f.onOpen(ctx);
}
function setTargetInput(inp) {
  App.activePlaceInput = inp || null;
  $$("#featurePanel [data-place]").forEach(i => i.classList.toggle("target", i === inp));
}
function validatePlace(inp) {
  const ok = !inp.value.trim() || App.placeId(inp.value) >= 0;
  inp.classList.toggle("invalid", !ok);
  inp.title = ok ? "" : "Unknown place – pick one from the list or click it on the map";
}

// clicking a map node fills the focused place input, then moves focus to the next one
function onMapNodeClick(id) {
  const inputs = $$("#featurePanel [data-place]");
  if (!inputs.length) { toast(`${App.name(id)} (#${id})`, "info"); return; }
  const target = App.activePlaceInput && inputs.includes(App.activePlaceInput) ? App.activePlaceInput : inputs[0];
  target.value = App.name(id);
  target.classList.remove("invalid");
  const next = inputs[(inputs.indexOf(target) + 1) % inputs.length];
  setTargetInput(next);
  next.focus({ preventScroll: true });
}

// Shared helper: show summary lines returned by the backend.
function summaryBox(r) {
  return r.summary ? `<div class="summary">${r.summary.map(DS.esc).join("\n")}</div>` : "";
}
function errorBox(r) {
  return `<div class="err">⚠ ${DS.esc(r.error || "Request failed")}</div>`;
}

// ------------------------------------------------------ command palette
const Palette = (() => {
  let items = [], shown = [], sel = 0;
  function build() {
    items = [];
    for (const u of App.units) for (const f of u.features)
      items.push({ kind: "feature", u, f, title: f.title, sub: f.ds, hay: `${f.title} ${f.ds} ${u.title} ${u.short} ${String(f.desc).replace(/<[^>]+>/g, "")}`.toLowerCase() });
    (App.meta?.places || []).forEach((p, i) =>
      items.push({ kind: "place", id: i, p, title: p.name, sub: `${p.type.replace("_", " ")} · ${p.zone} / ${p.ward}`, hay: `${p.name} ${p.type} ${p.zone} ${p.ward}`.toLowerCase() }));
  }
  function hl(text, q) {
    const t = DS.esc(text);
    if (!q) return t;
    const i = text.toLowerCase().indexOf(q.split(/\s+/)[0]);
    if (i < 0) return t;
    const w = q.split(/\s+/)[0].length;
    return DS.esc(text.slice(0, i)) + "<mark>" + DS.esc(text.slice(i, i + w)) + "</mark>" + DS.esc(text.slice(i + w));
  }
  function render() {
    const q = $("#paletteInput").value.trim().toLowerCase();
    const toks = q.split(/\s+/).filter(Boolean);
    const score = it => {
      const t = it.title.toLowerCase();
      return (t.startsWith(q) ? 0 : t.includes(q) ? 1 : 2) + (it.kind === "place" ? 0.5 : 0);
    };
    shown = items.filter(it => toks.every(t => it.hay.includes(t)));
    if (q) shown.sort((a, b) => score(a) - score(b));
    else shown = shown.filter(it => it.kind === "feature");
    shown = shown.slice(0, 60);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    const list = $("#paletteList");
    if (!shown.length) { list.innerHTML = `<div class="p-empty">No feature or place matches “${DS.esc(q)}”</div>`; return; }
    let html = "", group = "";
    shown.forEach((it, i) => {
      const g = it.kind === "place" ? "Places on the map" : q ? "Features" : it.u.title;
      if (g !== group) { html += `<div class="p-group">${DS.esc(g)}</div>`; group = g; }
      const cls = it.kind === "feature" ? it.f.cls || "" : "";
      const ico = it.kind === "feature" ? DS.esc(it.u.short) : `<i style="width:10px;height:10px;border-radius:50%;background:${MapView.TYPE_COLORS[it.p.type] || "#888"}"></i>`;
      html += `<div class="p-item ${cls} ${i === sel ? "sel" : ""}" data-i="${i}"><span class="p-ico">${ico}</span>
        <div class="p-main"><div>${hl(it.title, q)}</div><div class="p-sub">${DS.esc(it.sub)}</div></div>
        <span class="p-unit">${it.kind === "feature" ? DS.esc(it.u.icon) : "📍 show on map"}</span></div>`;
    });
    list.innerHTML = html;
    $$(".p-item", list).forEach(el => {
      el.onclick = () => choose(+el.dataset.i);
      el.onmousemove = () => { if (sel !== +el.dataset.i) { sel = +el.dataset.i; mark(); } };
    });
    mark();
  }
  function mark() {
    $$("#paletteList .p-item").forEach(el => el.classList.toggle("sel", +el.dataset.i === sel));
    $("#paletteList .p-item.sel")?.scrollIntoView({ block: "nearest" });
  }
  function choose(i) {
    const it = shown[i];
    if (!it) return;
    close();
    if (it.kind === "feature") openUnit(it.u.id, it.f.id);
    else {
      setView("map");
      MapView.clearOverlays();
      MapView.ring(it.id, "#e03131", 4, 1.2);
      MapView.focusNodes([it.id]);
      if (App.activePlaceInput) { onMapNodeClick(it.id); toast(`${it.p.name} added to the form`, "ok"); }
    }
  }
  function open() {
    if (!items.length) build();
    $("#palette").classList.remove("hidden");
    const inp = $("#paletteInput");
    inp.value = ""; sel = 0; render();
    setTimeout(() => inp.focus(), 0);
  }
  function close() { $("#palette").classList.add("hidden"); }
  function wire() {
    $("#searchOpen").onclick = open;
    $("#palette").addEventListener("mousedown", e => { if (e.target.id === "palette") close(); });
    $("#paletteInput").oninput = () => { sel = 0; render(); };
    $("#paletteInput").onkeydown = e => {
      if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); mark(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
      else if (e.key === "Enter") { e.preventDefault(); choose(sel); }
      else if (e.key === "Escape") close();
    };
  }
  return { open, close, wire, build, get isOpen() { return !$("#palette").classList.contains("hidden"); } };
})();

// ------------------------------------------------------ help / welcome
const Help = {
  open() { $("#help").classList.remove("hidden"); $("#helpAlways").checked = !!store.get("pm-help-always", false); setTimeout(() => $("#helpStart").focus(), 0); },
  close() { $("#help").classList.add("hidden"); store.set("pm-help-always", $("#helpAlways").checked); store.set("pm-seenhelp", true); },
  get isOpen() { return !$("#help").classList.contains("hidden"); },
  wire() {
    $("#helpBtn").onclick = () => Help.open();
    $("#helpClose").onclick = $("#helpStart").onclick = () => Help.close();
    $("#help").addEventListener("mousedown", e => { if (e.target.id === "help") Help.close(); });
  },
};

// ------------------------------------------------------ keyboard
function wireKeys() {
  document.addEventListener("keydown", e => {
    const tag = (e.target.tagName || "").toLowerCase();
    const typing = tag === "input" && !["checkbox", "range"].includes(e.target.type) || tag === "select" || tag === "textarea";
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); Palette.isOpen ? Palette.close() : Palette.open(); return; }
    if (e.key === "Escape") {
      if (Palette.isOpen) return Palette.close();
      if (Help.isOpen) return Help.close();
      if (typing) return e.target.blur();
      if ($("#layout").classList.contains("focus")) return toggleFocus();
      return;
    }
    if (typing || Palette.isOpen || Help.isOpen || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (/^[1-7]$/.test(k)) { openUnit(App.units[+k - 1].id); return; }
    switch (k) {
      case " ": e.preventDefault(); Player.toggle(); break;
      case "ArrowRight": e.preventDefault(); $("#pNext").click(); break;
      case "ArrowLeft": e.preventDefault(); $("#pPrev").click(); break;
      case "Home": e.preventDefault(); $("#pFirst").click(); break;
      case "m": case "M": setView("map"); break;
      case "d": case "D": setView("ds"); break;
      case "f": case "F": MapView.fit(); break;
      case "+": case "=": MapView.zoom(0.75); break;
      case "-": case "_": MapView.zoom(1 / 0.75); break;
      case "l": case "L": toggleLab(); break;
      case "t": case "T": toggleTheme(); break;
      case "x": case "X": toggleFocus(); break;
      case "?": case "/": e.preventDefault(); Help.open(); break;
    }
  });
}

function toggleTheme() {
  const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("pm-theme", t); } catch { /* private mode */ }
}
function toggleLab(force) {
  const lab = $("#lab");
  const hide = force !== undefined ? !force : !lab.classList.contains("collapsed");
  lab.classList.toggle("collapsed", hide);
  document.body.classList.toggle("lab-hidden", hide);
  $("#labToggle").classList.toggle("on", !hide);
  store.set("pm-lab", !hide);
  window.dispatchEvent(new Event("resize"));
}
function toggleFocus() {
  const on = $("#layout").classList.toggle("focus");
  $("#focusMode").textContent = on ? "⇤" : "⛶";
  $("#focusMode").title = on ? "Show the feature panel again (X)" : "Expand the viewer (X)";
  setTimeout(() => window.dispatchEvent(new Event("resize")), 320);
}

function showOffline() {
  $("#unitHeader").innerHTML = "";
  $("#featureTabs").innerHTML = "";
  $("#featurePanel").innerHTML = `<div class="offline">
    <div class="empty-ico">🔌</div>
    <h3>The C++ backend isn't running</h3>
    <p>Start <code>punemarg_server.exe</code> (or double-click <b>PuneMarg</b> on the desktop).<br>This page will reconnect automatically.</p>
    <button class="primary" id="retryBtn">Retry now</button></div>`;
  $("#retryBtn").onclick = () => location.reload();
}

// --------------------------------------------------------------- boot
async function boot() {
  Player.wire();
  Palette.wire();
  Help.wire();
  wireKeys();
  $("#viewMap").onclick = () => setView("map");
  $("#viewDs").onclick = () => setView("ds");
  $("#fitMap").onclick = () => MapView.fit();
  $("#zoomIn").onclick = () => MapView.zoom(0.75);
  $("#zoomOut").onclick = () => MapView.zoom(1 / 0.75);
  $("#focusMode").onclick = toggleFocus;
  $("#labelMode").onchange = e => MapView.setLabelMode(e.target.value);
  $("#showMetro").onchange = e => MapView.setMetroVisible(e.target.checked);
  $("#labToggle").onclick = () => toggleLab();
  $("#themeToggle").onclick = toggleTheme;
  $("#serverStatus").onclick = () => { if ($("#serverStatus").classList.contains("bad")) location.reload(); };
  $("#legendToggle").onclick = () => $("#mapLegend").classList.remove("collapsed");
  $("#mapLegend").onclick = () => $("#mapLegend").classList.add("collapsed");
  $("#mapLegend").title = "Click to hide the legend";
  toggleLab(store.get("pm-lab", true));
  // fade the map hint after the first interaction
  ["wheel", "mousedown"].forEach(ev => $("#map").addEventListener(ev, () => ($("#mapHint").style.opacity = "0"), { once: true }));
  $("#map").addEventListener("mouseleave", () => MapView.hideTip?.());

  const meta = await App.api("meta");
  if (!meta.ok && window.PM_STATIC) {
    $("#featurePanel").innerHTML = errorBox({ error: "The C++ engine could not start in this browser. Please reload the page, or try an up-to-date Chrome, Edge, Firefox or Safari." });
    return;
  }
  if (!meta.ok) {
    showOffline();
    const retry = setInterval(async () => {
      try { const r = await fetch("/api/meta"); if (r.ok) { clearInterval(retry); location.reload(); } } catch { /* still down */ }
    }, 3000);
    return;
  }
  App.meta = meta.result;
  App.names = App.meta.places.map(p => p.name);
  $("#placeList").innerHTML = App.names.slice().sort().map(n => `<option value="${DS.esc(n)}">`).join("");
  MapView.init($("#map"), App.meta);
  MapView.setNodeClick(onMapNodeClick);
  renderRail();
  const autoRun = location.hash.endsWith("/run");
  // Deep links for the viva: #u3/formula opens a feature, #u3/formula/run also presses its main button.
  const route = () => {
    const [unit, feat, run] = location.hash.replace("#", "").split("/");
    if (unit && App.units.some(u => u.id === unit)) {
      openUnit(unit, feat, { replace: true });
      if (run === "run") setTimeout(() => $("#featurePanel .actions button.primary")?.click(), 50);
      return true;
    }
    return false;
  };
  if (!route()) openUnit("home", undefined, { replace: true });
  window.addEventListener("popstate", route);
  if ((store.get("pm-help-always", false) || !store.get("pm-seenhelp", false)) && !autoRun) Help.open();
}
window.addEventListener("DOMContentLoaded", boot);
