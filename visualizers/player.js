/*
 * player.js - one step-by-step animation player shared by every feature.
 * A feature calls Player.load(count, renderFn): renderFn(i) draws step i
 * (on the map and/or in the data-structure view). The toolbar buttons, the
 * scrubber and the speed slider drive it.
 */
const Player = (() => {
  let count = 0, idx = -1, render = null, timer = null, onDone = null;
  const $ = id => document.getElementById(id);

  function delay() {
    const s = +$("speed").value;              // 1 (slow) .. 10 (fast)
    return Math.round(1400 / Math.pow(1.45, s - 1));
  }
  function sync() {
    const scrub = $("pScrub"), bar = $("player");
    scrub.disabled = count === 0;
    scrub.max = Math.max(0, count - 1);
    scrub.value = Math.max(0, idx);
    scrub.title = count ? `step ${Math.max(1, idx + 1)} of ${count} - drag to jump` : "no animation";
    bar.classList.toggle("idle", count === 0);
    bar.classList.toggle("active", count > 0);
  }
  function show(i) {
    if (!render || count === 0) return;
    idx = Math.max(0, Math.min(count - 1, i));
    render(idx);
    $("pCounter").textContent = `step ${idx + 1} / ${count}`;
    sync();
  }
  function tick() {
    if (idx >= count - 1) { pause(); if (onDone) onDone(); return; }
    show(idx + 1);
    timer = setTimeout(tick, delay());
  }
  function play() {
    if (!render || count === 0) return;
    if (idx >= count - 1) idx = -1;
    pause();
    $("pPlay").textContent = "⏸";
    timer = setTimeout(tick, 30);
  }
  function pause() {
    if (timer) clearTimeout(timer);
    timer = null;
    $("pPlay").textContent = "▶";
  }
  function load(n, fn, opts = {}) {
    pause();
    count = n; render = fn; idx = -1; onDone = opts.onDone || null;
    $("pCounter").textContent = n ? `${n} steps` : "no animation";
    sync();
    if (n && opts.autoplay !== false) play();
    else if (n && opts.showFirst) show(0);
  }
  function clear() { pause(); count = 0; render = null; idx = -1; $("pCounter").textContent = "no animation"; sync(); }

  function wire() {
    $("pPlay").onclick = () => (timer ? pause() : play());
    $("pNext").onclick = () => { pause(); show(idx + 1); };
    $("pPrev").onclick = () => { pause(); show(idx - 1); };
    $("pFirst").onclick = () => { pause(); show(0); };
    $("pScrub").oninput = e => { pause(); show(+e.target.value); };
    sync();
  }
  return {
    load, clear, play, pause, show, wire, delay,
    toggle() { timer ? pause() : play(); },
    get index() { return idx; }, get count() { return count; }, get playing() { return !!timer; },
  };
})();
