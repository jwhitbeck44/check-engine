// Check Engine · page logic. Every word a person sees comes from content.js; every calculation from engine.js.
// State lives in localStorage under one key. A shared link carries a compressed copy in the URL fragment,
// which never reaches a server. The relay (config.js) is called only for NUMBERS, CHECK and ROAD.
(() => {
  "use strict";
  const C = window.CONTENT, E = window.ENGINE, RELAY = String(window.RELAY || "").replace(/\/+$/, "");
  const KEY = "ce-state", PASS = "ce-pass", SCHEMA = 1, MAX_VERSIONS = 10;
  const IDS = C.blocks.map((b) => b.id);
  const B = Object.fromEntries(C.blocks.map((b) => [b.id, b]));
  const F = Object.fromEntries(C.numbers.fields.map((f) => [f.id, f]));
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- state ----------
  const blankNums = () => Object.fromEntries(E.FIELDS.map((f) => [f, ""]));
  const blank = () => ({
    schema: SCHEMA, name: "", about: "",
    blocks: Object.fromEntries(IDS.map((i) => [i, ""])),
    nums: blankNums(), found: {}, numsRead: false,
    versions: [],   // [{ n, at, blocks, nums, result, head }], last ten kept
    checks: 0,
    road: null,     // { n, blocks, nums, result, at }
    screen: "start", bi: 0,
  });
  function normalize(raw) {
    const s = blank();
    if (!raw || typeof raw !== "object") return s;
    for (const k of ["name", "about", "screen"]) if (typeof raw[k] === "string") s[k] = raw[k];
    for (const k of ["bi", "checks"]) if (typeof raw[k] === "number") s[k] = raw[k];
    s.numsRead = raw.numsRead === true;
    s.blocks = Object.fromEntries(IDS.map((i) => [i, String((raw.blocks || {})[i] ?? "")]));
    s.nums = Object.fromEntries(E.FIELDS.map((f) => [f, String((raw.nums || {})[f] ?? "")]));
    if (raw.found && typeof raw.found === "object") s.found = raw.found;
    if (Array.isArray(raw.versions)) s.versions = raw.versions.filter((v) => v && v.result && v.blocks).slice(-MAX_VERSIONS);
    if (raw.road && raw.road.result) s.road = raw.road;
    return s;
  }
  let S;
  try { S = normalize(JSON.parse(localStorage.getItem(KEY) || "null")); } catch { S = blank(); }
  let saveTimer = null;
  function saveNow() { clearTimeout(saveTimer); saveTimer = null; if (VIEW) return; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage full or blocked */ } }
  function save() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 250); }
  addEventListener("pagehide", saveNow);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveNow(); });
  addEventListener("storage", (e) => {   // another tab saved newer work: take it so this tab can't write old work over it
    if (e.key !== KEY || !e.newValue || BUSY) return;
    clearTimeout(saveTimer); saveTimer = null;
    try { S = normalize(JSON.parse(e.newValue)); } catch { return; }
    render();
  });
  let VIEW = null;   // a shared copy being viewed (read-only); never saved
  let BUSY = null;   // "numbers" | "check" | "road" while a call is out
  let ERR = { where: "", msg: "" };
  let SEL = null;    // the light that is open on the dashboard

  // ---------- helpers ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "value") el.value = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const SVG = "http://www.w3.org/2000/svg";
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v !== null && v !== undefined) el.setAttribute(k, v);
    for (const kid of kids.flat()) if (kid) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const fill = (str, map) => str.replace(/\{(\w+)\}/g, (_, k) => map[k]);
  const plural = (pair, n) => fill(n === 1 ? pair[0] : pair[1], { n });
  const $ = (id) => document.getElementById(id);
  const nick = (id) => B[id].nick;
  const pairLabel = (i) => nick(C.pairs[i].a) + " + " + nick(C.pairs[i].b);
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.remove("hidden"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add("hidden"), 3600); }
  function input(attrs, onval) {
    const el = h(attrs.rows ? "textarea" : "input", Object.assign({ type: attrs.rows ? null : "text" }, attrs));
    el.addEventListener("input", () => { onval(el.value); save(); live(); });
    return el;
  }
  const liveHooks = [];
  function live() { odometer(); for (const f of liveHooks) f(); }
  const builtCount = (st) => IDS.filter((i) => String(st.blocks[i] || "").trim()).length;
  const latest = () => S.versions[S.versions.length - 1] || null;
  const sameBlocks = (a, b) => IDS.every((i) => String(a[i] || "").trim() === String(b[i] || "").trim());
  const sameNums = (a, b) => E.FIELDS.every((f) => String(a[f] || "").trim() === String(b[f] || "").trim());
  const changedSince = (v, id) => !!v && String(S.blocks[id] || "").trim() !== String(v.blocks[id] || "").trim();
  const when = (t) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  // ---------- relay ----------
  const getPass = () => { try { return localStorage.getItem(PASS) || ""; } catch { return ""; } };
  const setPass = (v) => { try { v ? localStorage.setItem(PASS, v) : localStorage.removeItem(PASS); } catch { /* blocked */ } };
  async function checkPass(code) {
    try { const r = await fetch(RELAY + "/api/check", { method: "POST", headers: { "X-Passcode": code } }); return r.status === 200 ? "ok" : r.status === 429 ? "too_many_tries" : "bad"; }
    catch { return "unreachable"; }
  }
  function stepVars(st, extra) {
    const v = { name: st.name, about: st.about, numbers: "", lights: "" };
    for (const id of IDS) v[id] = String(st.blocks[id] || "").slice(0, 1500);
    return Object.assign(v, extra || {});
  }
  async function relay(step, vars) {
    let res;
    try { res = await fetch(RELAY + "/api/step", { method: "POST", headers: { "Content-Type": "application/json", "X-Passcode": getPass() }, body: JSON.stringify({ step, vars }) }); }
    catch { throw { code: "unreachable" }; }
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw { code: j.error || "upstream" }; }
    let text = "", stop = "", buf = "";
    const reader = res.body.getReader(), dec = new TextDecoder();
    const handle = (ln) => {
      if (!ln.trim()) return;
      let m; try { m = JSON.parse(ln); } catch { return; }
      if (m.t === "text") text += m.d;
      else if (m.t === "done") stop = m.stop || "end_turn";
      else if (m.t === "err") throw { code: m.code || "upstream" };
    };
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i; while ((i = buf.indexOf("\n")) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 1); }
      }
      handle(buf);
    } catch (e) { if (e && e.code) throw e; throw { code: "unreachable" }; }
    if (stop === "refusal") throw { code: "refused" };
    if (stop === "max_tokens") throw { code: "too_long" };
    if (stop !== "end_turn") throw { code: "upstream" };
    try { return JSON.parse(text); } catch { throw { code: "bad_reply" }; }
  }
  const errText = (e) => C.errors[(e && e.code) || "upstream"] || C.errors.upstream;

  // ---------- numbers and lights text sent to the AI ----------
  const parsedNums = (st) => E.parseNums(st.nums).n;
  function lightsText(result) {
    const L = ["Answers on the latest check:"];
    E.PKEYS.forEach((k, i) => { const p = result.pairs[k]; L.push(k + " (" + pairLabel(i) + "): " + p.status + (p.reason ? ". " + p.reason : "")); });
    const wi = E.PKEYS.indexOf(result.watch);
    L.push("", "Pair to watch first: " + result.watch + " (" + pairLabel(wi) + "), blocks " + C.pairs[wi].a + " and " + C.pairs[wi].b + ".");
    return L.join("\n");
  }

  // ---------- the engine ----------
  async function startEngine() {
    if (BUSY) return;
    if (!getPass()) { ERR = { where: "start", msg: C.engine.needPass }; return go("start"); }
    if (!builtCount(S)) { toast(C.engine.empty); return; }
    if (!S.numsRead) { go("numbers"); return readNumbers(false); }
    return runCheck();
  }
  async function readNumbers(replace) {
    BUSY = "numbers"; ERR = { where: "", msg: "" }; render();
    try {
      const r = await relay("NUMBERS", stepVars(S, { numbers: "(not filled in yet)" }));
      const found = {};
      for (const f of E.FIELDS) {
        const x = (r && r[f]) || {};
        const v = E.partsToValue(f, x.parts);
        const quote = E.verifyQuote(x.quote, E.canvasText(S));
        found[f] = { quote: v != null ? quote : "", ask: v == null ? String(x.ask || "").slice(0, 200) : "" };
        if (v != null && (replace || !String(S.nums[f]).trim())) S.nums[f] = E.fmtNum(v);
      }
      S.found = found; S.numsRead = true;
    } catch (e) { ERR = { where: "numbers", msg: errText(e) }; }
    BUSY = null; saveNow(); render();
  }
  async function runCheck() {
    BUSY = "check"; ERR = { where: "", msg: "" }; SEL = null;
    go("dash");
    const started = Date.now();
    const snap = { blocks: { ...S.blocks }, nums: { ...S.nums } };
    const nums = E.parseNums(snap.nums).n, c = E.calc(nums);
    try {
      const reply = await relay("CHECK", stepVars({ ...S, blocks: snap.blocks }, { numbers: E.numbersText(nums, c) }));
      const result = E.finalize(reply, { ...S, blocks: snap.blocks }, c);
      result.money = c.money; result.hours = c.hours;
      const head = E.headline(result, { blocks: snap.blocks });
      const last = latest();
      if (last && sameBlocks(last.blocks, snap.blocks) && sameNums(last.nums, snap.nums)) Object.assign(last, { at: Date.now(), result, head });
      else S.versions.push({ n: last ? last.n + 1 : 1, at: Date.now(), blocks: snap.blocks, nums: snap.nums, result, head });
      S.versions = S.versions.slice(-MAX_VERSIONS);
      S.checks++;
      // let the ignition sweep finish so the lights visibly settle
      const wait = reduced() ? 0 : Math.max(0, 1200 - (Date.now() - started));
      await new Promise((r) => setTimeout(r, wait));
    } catch (e) { ERR = { where: "dash", msg: errText(e) }; }
    BUSY = null; saveNow(); render();
  }
  async function runRoad() {
    const v = latest();
    if (!v || BUSY) return;
    if (!getPass()) { ERR = { where: "start", msg: C.engine.needPass }; return go("start"); }
    BUSY = "road"; ERR = { where: "", msg: "" }; render();
    try {
      const nums = E.parseNums(v.nums).n;
      const reply = await relay("ROAD", stepVars({ ...S, blocks: v.blocks }, { numbers: E.numbersText(nums, E.calc(nums)), lights: lightsText(v.result) }));
      S.road = { n: v.n, blocks: { ...v.blocks }, nums: { ...v.nums }, result: E.finalizeRoad(reply, v.result, nums), at: Date.now() };
    } catch (e) { ERR = { where: "road", msg: errText(e) }; }
    BUSY = null; saveNow(); render();
  }

  // ---------- canvas pictures ----------
  function thumb(cur) {
    const v = latest();
    return h("div", { class: "canvas thumb", role: "group", "aria-label": "Canvas" }, IDS.map((id) => {
      const filled = S.blocks[id].trim() !== "";
      const ch = changedSince(v, id);
      return h("button", { class: "cell" + (filled ? " filled" : "") + (id === cur ? " cur" : "") + (ch ? " ch" : ""), style: "--a:" + id, type: "button",
        "aria-label": B[id].nick + (filled ? ", filled" : ", empty") + (ch ? ", " + C.build.changed : ""),
        onclick: () => go("build", { bi: IDS.indexOf(id) }) },
        h("span", { class: "s", text: B[id].short }), h("span", { class: "mk", "aria-hidden": "true", text: ch ? "•" : filled ? "✓" : "+" }));
    }));
  }
  function full(blocks, opts = {}) {
    return h("div", { class: "canvas full" }, IDS.map((id) => {
      const t = String(blocks[id] || "").trim();
      const ch = opts.changed && opts.changed.includes(id);
      return h("div", { class: "cell" + (ch ? " changed" : ""), style: "--a:" + id },
        h("div", { class: "n", text: B[id].nick }), h("div", { class: "nm", text: B[id].name + (ch ? " · " + C.build.changed : "") }),
        h("div", { class: "t" + (t ? "" : " empty"), text: t || "(blank)" }));
    }));
  }

  // ---------- gauges and lights (drawn in code) ----------
  const ARC = { cx: 100, cy: 96, r: 78 };
  const pt = (f, r) => { const a = Math.PI * (1 - f); return [ARC.cx + r * Math.cos(a), ARC.cy - r * Math.sin(a)]; };
  function arc(f0, f1, cls) {
    const [x0, y0] = pt(f0, ARC.r), [x1, y1] = pt(f1, ARC.r);
    return s("path", { d: `M${x0.toFixed(1)} ${y0.toFixed(1)} A${ARC.r} ${ARC.r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`, class: "zone " + cls });
  }
  // value: fraction 0..1 of the dial, or null (no reading). zones: [[from, to, cls]]. ticks: [[f, label]]
  function gauge({ title, sub, value, zones, ticks, read, idName }) {
    const svg = s("svg", { viewBox: "0 -18 200 146", class: "gsvg", role: "img", "aria-label": title + ". " + read });
    for (const [a, b, cls] of zones) svg.append(arc(a, b, cls));
    for (const [f, lab] of ticks) {
      const [x0, y0] = pt(f, ARC.r - 9), [x1, y1] = pt(f, ARC.r + 9);
      // end labels sit under the ends of the dial; a middle label sits outside the arc
      const [lx, ly] = f === 0 ? [ARC.cx - ARC.r, ARC.cy + 22] : f === 1 ? [ARC.cx + ARC.r, ARC.cy + 22] : pt(f, ARC.r + 20);
      svg.append(s("line", { x1: x0, y1: y0, x2: x1, y2: y1, class: "tick" }), s("text", { x: lx.toFixed(1), y: (ly + 4).toFixed(1), class: "tl", "text-anchor": f === 0 ? "start" : f === 1 ? "end" : f > 0.5 ? "start" : "middle" }, lab));
    }
    const needle = s("g", { class: "needle" + (value == null ? " none" : ""), style: "--to:" + (value == null ? 0 : (value * 180 - 90)).toFixed(1) + "deg" },
      s("line", { x1: ARC.cx, y1: ARC.cy, x2: ARC.cx, y2: ARC.cy - ARC.r + 6 }), s("circle", { cx: ARC.cx, cy: ARC.cy, r: 6 }));
    svg.append(needle);
    if (value == null) svg.append(s("text", { x: ARC.cx, y: ARC.cy - 20, class: "q", "text-anchor": "middle" }, "?"));
    return h("div", { class: "gauge", id: idName }, h("div", { class: "gt", text: title }), svg, h("p", { class: "gread", text: read }), sub || null);
  }
  function fuelGauge(m, ign) {
    const d = C.dash;
    let read, value = null, sub = null;
    if (m.status === "cant_tell") read = d.noRead;
    else {
      value = Math.max(0, Math.min(1, m.ratio / 1.5));
      read = m.margin <= 0 && m.out > 0 ? d.fuelLoses : fill(d.fuelRead, { p: Math.round(m.ratio * 100) + "%" });
      sub = h("p", { class: "gsub" }, m.need == null ? d.salesNever : fill(d.salesNeed, { need: m.need.toLocaleString("en-US") }), h("br"), fill(d.salesExpect, { n: m.expect.toLocaleString("en-US") }));
    }
    return gauge({ title: d.fuel, idName: "g-fuel", value: ign ? null : value, read: ign ? C.engine.checking : read, sub: ign ? null : sub,
      zones: [[0, 0.6, "red"], [0.6, 0.667, "amber"], [0.667, 1, "ok"]], ticks: [[0, d.tankEmpty], [0.667, d.covered], [1, "150%"]] });
  }
  function tempGauge(hr, ign) {
    const d = C.dash;
    let read, value = null;
    if (hr.status === "cant_tell") read = d.noRead;
    else { value = Math.max(0, Math.min(1, hr.ratio / 1.5)); read = fill(d.tempRead, { need: hr.need.toLocaleString("en-US"), have: hr.have.toLocaleString("en-US") }) + (hr.ratio > 1 ? " " + d.hot + "." : ""); }
    return gauge({ title: d.temp, idName: "g-temp", value: ign ? null : value, read: ign ? C.engine.checking : read,
      zones: [[0, 0.667, "ok"], [0.667, 0.733, "amber"], [0.733, 1, "red"]], ticks: [[0, d.cool], [0.667, "100%"], [1, d.hotTick]] });
  }
  function lamp(status, small) {
    const r = small ? 9 : 13, c = r + 2;
    const g = s("svg", { viewBox: `0 0 ${2 * c} ${2 * c}`, class: "lamp " + status, "aria-hidden": "true" });
    g.append(s("circle", { cx: c, cy: c, r, class: "lc" }));
    const glyph = { holds: "", shaky: "!", breaks: "!", cant_tell: "?" }[status];
    if (glyph) g.append(s("text", { x: c, y: c + (small ? 4 : 5.5), "text-anchor": "middle", class: "lg" }, glyph));
    return g;
  }

  // ---------- chrome ----------
  function chrome() {
    const brand = $("brand"); brand.textContent = "";
    const parts = C.title.split(" ");
    brand.append(parts.slice(0, -1).join(" ") + " ", h("span", { text: parts[parts.length - 1] }));
    $("kicker").textContent = C.kicker;
    $("foot-note").textContent = C.footer;
    const cl = $("foot-class"); cl.textContent = C.classLink; cl.href = C.classUrl;
    $("foot-forget").textContent = C.forget;
    $("foot-forget").onclick = () => { setPass(""); toast(C.forget + " ✓"); render(); };
    $("foot-reset").textContent = C.reset;
    $("foot-reset").onclick = () => { if (confirm(C.resetAsk)) { S = blank(); saveNow(); render(); } };
  }
  function odometer() {
    const o = $("odo"); o.textContent = "";
    const st = VIEW ? VIEW.st : S;
    const v = st.versions[st.versions.length - 1];
    if (!v) { o.append(h("span", { class: "muted-dark", text: C.odo.none })); return; }
    const digits = (n, w) => h("span", { class: "digits" }, String(n).padStart(w, "0").split("").map((d) => h("b", { text: d })));
    o.append(h("span", {}, C.odo.version, digits(v.n, 2)), h("span", {}, digits(st.checks || v.n, 3), " " + C.odo.checks));
  }
  const RAIL = ["start", "build", "numbers", "dash", "road"];
  function rail() {
    const r = $("rail"); r.textContent = "";
    if (VIEW) return;
    for (const k of RAIL) r.append(h("button", { type: "button", class: S.screen === k ? "now" : null, "aria-current": S.screen === k ? "step" : null, text: C.rail[k], onclick: () => go(k) }));
  }
  function go(screen, extra) {
    if (extra) Object.assign(S, extra);
    S.screen = screen;
    save(); render(); scrollTo(0, 0);
  }
  const errBox = (where) => (ERR.where === where && ERR.msg ? h("p", { class: "alertnote", role: "alert", id: "err", text: ERR.msg }) : null);

  // ---------- screens ----------
  const screens = {};

  screens.start = () => {
    const t = C.start;
    const msg = h("p", { class: "small", id: "pass-msg", "aria-live": "polite" });
    const pass = h("input", { id: "pass", type: "text", autocomplete: "off", spellcheck: "false", placeholder: t.passPh, value: getPass() });
    pass.addEventListener("change", async () => {
      const v = pass.value.trim();
      setPass(v); if (!v) { msg.textContent = ""; return; }
      const r = await checkPass(v);
      msg.textContent = r === "ok" ? t.passOk : r === "bad" ? t.passBad : C.errors[r];
      msg.className = "small " + (r === "ok" ? "okline" : "alertline");
      if (r === "ok" && ERR.where === "start") { ERR = { where: "", msg: "" }; const e = $("err"); if (e) e.remove(); }
    });
    return [
      h("h1", { text: t.h1 }),
      h("p", { class: "lede", text: t.lede }),
      errBox("start"),
      h("div", { class: "card" },
        h("div", { class: "field" }, h("label", { class: "lab", for: "pass", text: t.passLabel }), pass, msg),
        h("div", { class: "field" }, h("label", { class: "lab", for: "v-name", text: t.nameLabel }), input({ id: "v-name", placeholder: t.namePh, value: S.name, maxlength: 100 }, (v) => (S.name = v))),
        h("div", { class: "field" }, h("label", { class: "lab", for: "v-about", text: t.aboutLabel }), input({ id: "v-about", rows: 2, placeholder: t.aboutPh, value: S.about, maxlength: 380 }, (v) => (S.about = v))),
        h("div", { class: "row" }, h("button", { class: "btn primary", type: "button", id: "go-build", text: t.go, onclick: () => go("build", { bi: 0 }) })),
        h("p", { class: "small muted", text: t.saved })),
      h("ol", { class: "plain small" }, t.steps.map((x) => h("li", { text: x }))),
    ];
  };

  screens.build = () => {
    const t = C.build;
    const bi = Math.max(0, Math.min(8, S.bi | 0));
    const b = C.blocks[bi];
    const ex = h("p", { class: "example hidden" }, h("b", { text: t.exLead + " " }), b.ex);
    const exBtn = h("button", { class: "btn link", type: "button", text: t.showEx, "aria-expanded": "false",
      onclick: () => { const open = ex.classList.toggle("hidden"); exBtn.textContent = open ? t.showEx : t.hideEx; exBtn.setAttribute("aria-expanded", String(!open)); } });
    const thumbBox = h("div", {}, thumb(b.id));
    liveHooks.push(() => thumbBox.replaceChildren(thumb(b.id)));
    const ta = input({ id: "block-text", rows: 3, placeholder: t.ph, value: S.blocks[b.id], "aria-labelledby": "block-q", maxlength: 1500 }, (v) => (S.blocks[b.id] = v));
    return [
      h("div", { class: "row between" }, h("span", { class: "kicker", text: C.rail.build }), h("span", { class: "tag", text: fill(t.blockOf, { n: bi + 1 }) })),
      thumbBox,
      h("p", { class: "small muted", text: t.tapNote }),
      h("div", { class: "card hot" },
        h("div", { class: "blockhead" }, h("h2", { text: b.nick }), h("span", { class: "nm", text: b.name })),
        h("p", { class: "lab", id: "block-q", text: b.q }),
        b.note ? h("p", { class: "note small", text: b.note }) : null,
        ta,
        h("div", {}, exBtn, ex)),
      h("div", { class: "row between" },
        h("button", { class: "btn", type: "button", text: t.back, onclick: () => (bi === 0 ? go("start") : go("build", { bi: bi - 1 })) }),
        bi < 8 ? h("button", { class: "btn primary", type: "button", id: "block-next", text: t.next, onclick: () => go("build", { bi: bi + 1 }) })
          : h("button", { class: "btn primary ignite", type: "button", id: "block-next", text: t.toEngine, onclick: startEngine })),
      h("p", { class: "small muted", text: t.skipNote }),
    ];
  };

  screens.numbers = () => {
    const t = C.numbers;
    if (BUSY === "numbers") return [h("h2", { text: t.h2 }), h("p", { class: "status", role: "status" }, h("span", { class: "dots", text: t.reading }))];
    const fieldEl = (f) => {
      const meta = F[f], fd = (S.found || {})[f] || {};
      const msg = h("p", { class: "small alertline hidden" });
      const el = h("input", { id: "n-" + f, inputmode: "decimal", autocomplete: "off", value: S.nums[f] });
      const check = () => { const p = E.parseNums({ [f]: el.value }); const bad = p.bad[f]; msg.textContent = bad ? t[bad] : ""; msg.classList.toggle("hidden", !bad); };
      el.addEventListener("input", () => { S.nums[f] = el.value; save(); check(); });
      check();
      return h("div", { class: "field" },
        h("label", { class: "lab", for: "n-" + f, text: meta.label }),
        meta.money ? h("div", { class: "dollar" }, h("span", { text: "$" }), el) : el,
        fd.quote && String(S.nums[f]).trim() ? h("p", { class: "small muted" }, t.fromWords + " ", h("q", { text: fd.quote })) : null,
        !String(S.nums[f]).trim() && S.numsRead ? h("p", { class: "small muted", text: fd.ask || meta.ask }) : null,
        msg);
    };
    return [
      h("h2", { text: t.h2 }),
      h("p", { class: "lede", text: t.lede }),
      S.numsRead && Object.keys(S.found || {}).length ? h("p", { class: "note small", text: t.foundNote }) : null,
      errBox("numbers"),
      h("div", { class: "card money" }, E.FIELDS.map(fieldEl)),
      h("div", { class: "row between" },
        h("button", { class: "btn small", type: "button", id: "reread", text: t.reread, onclick: () => { if (!getPass()) { ERR = { where: "start", msg: C.engine.needPass }; return go("start"); } if (!S.numsRead || confirm(t.rereadAsk)) readNumbers(true); } }),
        h("button", { class: "btn primary ignite", type: "button", id: "go-check", text: t.go, onclick: () => { S.numsRead = true; runCheck(); } })),
    ];
  };

  function lightsGrid(result, ign, onPick) {
    const grid = h("div", { class: "lights", role: "group", "aria-label": "Warning lights" });
    E.PKEYS.forEach((k, i) => {
      const p = result ? result.pairs[k] : { status: "cant_tell" };
      const st = ign ? "ign" : p.status;
      const watch = result && !ign && result.watch === k;
      grid.append(h("button", { type: "button", class: "light " + st + (SEL === k ? " open" : "") + (watch ? " watch" : ""), id: "light-" + k, "data-status": p.status,
        "aria-expanded": onPick ? String(SEL === k) : null, disabled: ign || !onPick ? true : null, style: "--i:" + i,
        onclick: onPick ? () => onPick(k) : null },
        lamp(ign ? "shaky" : p.status), h("span", { class: "ll", text: pairLabel(i) }), h("span", { class: "lw", text: ign ? "" : C.status[p.status] + (watch ? " · " + C.dash.watchShort : "") })));
    });
    return grid;
  }
  function lightDetail(result, k) {
    const i = E.PKEYS.indexOf(k), p = result.pairs[k], d = C.dash;
    return h("div", { class: "detail " + p.status, id: "detail" },
      h("div", { class: "row" }, lamp(p.status, true), h("b", { text: pairLabel(i) + " · " + C.status[p.status] })),
      h("p", { class: "small muted", text: C.pairs[i].q }),
      p.src === "money" ? h("p", { class: "tag", text: d.fromMoney }) : p.src === "hours" ? h("p", { class: "tag", text: d.fromHours }) : null,
      p.reason ? h("p", { text: p.reason }) : null,
      p.volume ? h("p", { class: "small" }, h("b", { text: d.judgment + " " }), p.volume) : null,
      p.quote ? h("p", { class: "small" }, h("span", { class: "muted", text: d.fromCanvas + " " }), h("q", { text: p.quote })) : null,
      p.question ? h("p", { class: "small" }, h("b", { text: d.settle + " " }), p.question) : null,
      p.src !== "ai" ? h("button", { class: "btn small", type: "button", text: d.fixNumbers, onclick: () => go("numbers") }) : null);
  }
  function headlineText(head) {
    const d = C.dash;
    return head.kind === "red" ? plural(d.red, head.n) : head.kind === "amber" ? plural(d.amber, head.n) : head.kind === "cant" ? d.notEnough : d.clear;
  }
  const needName = (x) => (x === "numbers" ? C.dash.addNumbers : nick(x));

  // The dashboard panel. st = state to read from; readOnly for the shared view.
  function dashboard(v, opts = {}) {
    const d = C.dash, ign = !!opts.ign;
    const result = v && v.result;
    const head = v && v.head;
    const panel = h("div", { class: "dashpanel" + (ign ? " igniting" : ""), id: "dashpanel", "aria-busy": ign ? "true" : null });
    const m = result ? result.money : { status: "cant_tell" }, hr = result ? result.hours : { status: "cant_tell" };
    panel.append(
      h("div", { class: "hl", "aria-live": "polite" },
        h("h2", { id: "headline", text: ign ? C.engine.checking : head ? headlineText(head) : d.none }),
        !ign && head && head.kind === "cant" && head.need.length ? h("p", { class: "need", id: "need" }, d.addMore + " " + head.need.map(needName).join(", ") + ".") : null,
        h("p", { class: "standing", text: d.standing })),
      h("div", { class: "gauges" }, fuelGauge(m, ign), tempGauge(hr, ign)),
      lightsGrid(result, ign, opts.readOnly || !result ? null : (k) => { SEL = SEL === k ? null : k; render(); }),
      !ign && result ? h("p", { class: "small tapnote", text: d.tapLight }) : null);
    if (!ign && result && SEL && result.pairs[SEL]) panel.append(lightDetail(result, SEL));
    if (opts.readOnly && result) panel.querySelectorAll(".light").forEach((el) => el.removeAttribute("disabled"));
    return panel;
  }
  function watchCard(result) {
    const i = E.PKEYS.indexOf(result.watch), p = result.pairs[result.watch], d = C.dash;
    return h("div", { class: "card hot", id: "watch" },
      h("span", { class: "chip", text: d.watch }),
      h("div", { class: "row" }, lamp(p.status, true), h("b", { text: pairLabel(i) + " · " + C.status[p.status] })),
      h("p", { text: result.watchWhy || p.reason }),
      p.question ? h("p", { class: "small" }, h("b", { text: d.settle + " " }), p.question) : null);
  }
  function assumeCard(result) {
    const d = C.dash;
    if (!result.assumptions.length) return null;
    return h("div", { class: "card", id: "assume" },
      h("h3", { text: d.assumeH }), h("p", { class: "small muted", text: d.assumeLede }),
      h("ol", { class: "plain assume" }, result.assumptions.map((a) => h("li", {}, h("b", { text: a.belief }), h("br"), h("span", { class: "small" }, h("span", { class: "muted", text: d.testLabel + " " }), a.test)))));
  }

  screens.dash = () => {
    const d = C.dash, v = latest(), ign = BUSY === "check";
    const out = [];
    out.push(h("div", { class: "row between" }, h("span", { class: "kicker", text: d.h2 + (v && !ign ? " · v" + v.n : "") }), h("span", { class: "tag", text: S.name.trim() })));
    out.push(errBox("dash"));
    out.push(dashboard(ign ? null : v, { ign }));
    const again = h("button", { class: "btn primary ignite", type: "button", id: "engine", text: v ? C.engine.again : C.engine.start, disabled: ign ? true : null, onclick: startEngine });
    if (ign || !v) { out.push(h("div", { class: "row" }, again)); return out; }
    const r = v.result, clear = v.head.kind === "clear";
    out.push(watchCard(r));
    // what changed since the version before this one
    const prev = S.versions[S.versions.length - 2];
    if (prev) {
      const ch = IDS.filter((id) => String(v.blocks[id]).trim() !== String(prev.blocks[id]).trim());
      out.push(h("p", { class: "small", id: "changed" }, ch.length ? [h("b", { text: d.changed + " " }), ch.map(nick).join(", ") + "."] : d.noChange));
    }
    out.push(h("div", { class: "row actions" }, again,
      clear ? h("a", { class: "btn route", id: "route", href: C.routeUrl, target: "_blank", rel: "noopener", text: d.route }) : null,
      h("button", { class: "btn", type: "button", id: "to-road", text: clear ? d.toRoadClear : d.toRoad, onclick: () => go("road") }),
      h("button", { class: "btn", type: "button", id: "share", text: d.share, onclick: share })));
    if (clear) out.push(h("p", { class: "small muted", text: d.routeNote }));
    out.push(assumeCard(r));
    if (S.versions.length > 1) {
      out.push(h("details", { class: "older" }, h("summary", { text: d.older }),
        h("ul", { class: "plain small" }, S.versions.slice().reverse().map((x) => h("li", { text: fill(d.olderLine, { n: x.n, when: when(x.at), head: headlineText(x.head) }) })))));
    }
    return out;
  };

  screens.road = () => {
    const t = C.road, v = latest();
    const out = [h("h2", { text: t.h2 }), h("p", { class: "lede", text: t.lede }), errBox("road")];
    if (!v) { out.push(h("p", { class: "note", text: t.needDash }), h("div", { class: "row" }, h("button", { class: "btn primary ignite", type: "button", text: C.engine.start, onclick: startEngine }))); return out; }
    if (BUSY === "road") { out.push(h("p", { class: "status", role: "status" }, h("span", { class: "dots", text: t.checking }))); return out; }
    const rd = S.road;
    if (rd) {
      const stale = rd.n !== v.n || !sameBlocks(rd.blocks, S.blocks) || !sameNums(rd.nums, S.nums);
      if (stale) out.push(h("p", { class: "note small", id: "road-stale", text: t.stale }));
      const baseRed = E.PKEYS.some((k) => v.result.pairs[k].status === "breaks");
      out.push(h("div", { class: "survive", id: "survive" }, h("span", { text: fill(t.survives, { n: rd.result.survived }) })));
      if (baseRed) out.push(h("p", { class: "small muted", text: t.baseRed }));
      rd.result.events.forEach((e, n) => {
        out.push(h("div", { class: "ecard " + (e.survives ? "ok" : "bad"), id: "event-" + n },
          h("div", { class: "row between" }, h("span", { class: "tag", text: (e.block ? t.hits + ": " + nick(e.block) : "") }), e.aimed ? h("span", { class: "chip", text: t.watchTag }) : null),
          h("p", { class: "t", text: e.event }),
          h("p", { class: "verdict", text: e.survives ? t.eventOk : t.eventBad }),
          h("div", { class: "minilights", "aria-hidden": "true" }, E.PKEYS.map((k) => lamp(e.pairs[k].status, true))),
          e.on.length ? h("div", {}, h("p", { class: "small lab", text: t.lightsOn }),
            h("ul", { class: "plain small" }, e.on.map((k) => { const i = E.PKEYS.indexOf(k); return h("li", {}, h("b", { text: pairLabel(i) + " · " + C.status[e.pairs[k].status] }), e.pairs[k].reason ? ": " + e.pairs[k].reason : ""); })))
            : h("p", { class: "small muted", text: t.noneOn })));
      });
    }
    out.push(h("div", { class: "row" }, h("button", { class: "btn primary", type: "button", id: "go-road", text: rd ? t.again : t.go, onclick: runRoad })));
    return out;
  };

  // ---------- share (read-only link, compressed, in the URL fragment) ----------
  function b64url(bytes) { let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function unb64url(s) { const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)); return Uint8Array.from(bin, (c) => c.charCodeAt(0)); }
  async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
  async function packShare() {
    const v = latest();
    const payload = { v: 1, name: S.name, about: S.about, blocks: v.blocks, nums: v.nums, n: v.n, checks: S.checks, result: v.result, head: v.head };
    const raw = new TextEncoder().encode(JSON.stringify(payload));
    if (typeof CompressionStream === "function") return "z" + b64url(await pipe(raw, new CompressionStream("deflate-raw")));
    return "j" + b64url(raw);
  }
  async function unpackShare(s) {
    const bytes = unb64url(s.slice(1));
    const raw = s[0] === "z" ? await pipe(bytes, new DecompressionStream("deflate-raw")) : bytes;
    const p = JSON.parse(new TextDecoder().decode(raw));
    if (!p || p.v !== 1 || !p.result || !p.blocks) throw new Error("bad");
    return p;
  }
  async function share() {
    if (!latest()) return;
    saveNow();
    const url = location.href.split("#")[0] + "#s=" + (await packShare());
    const d = C.dash;
    if (navigator.share) { try { await navigator.share({ title: (S.name || C.title) + " · " + C.title, url }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(url); toast(d.shared + (url.length > 6000 ? " " + d.tooBig : "")); return; } catch { /* fall through */ }
    prompt(d.shareFail, url);
  }
  async function readHash() {
    const m = location.hash.match(/^#s=([A-Za-z0-9_-]+)/);
    if (!m) { if (VIEW) { VIEW = null; render(); } return; }
    try {
      const p = await unpackShare(m[1]);
      const blocks = Object.fromEntries(IDS.map((i) => [i, String(p.blocks[i] ?? "")]));
      VIEW = { st: { name: String(p.name || ""), about: String(p.about || ""), blocks, checks: p.checks, versions: [{ n: p.n, blocks, nums: p.nums || {}, result: p.result, head: p.head }] } };
    } catch { VIEW = { bad: true, st: blank() }; }
    SEL = null; render(); scrollTo(0, 0);
  }
  function viewScreen() {
    const t = C.share;
    const mine = h("button", { class: "btn primary", type: "button", id: "make-mine", text: t.mine, onclick: () => { history.replaceState(null, "", location.pathname + location.search); VIEW = null; render(); scrollTo(0, 0); } });
    if (VIEW.bad) return [h("p", { class: "alertnote", text: t.bad }), h("div", { class: "row" }, mine)];
    const st = VIEW.st, v = st.versions[0];
    return [
      h("div", { class: "row between" }, h("span", { class: "chip", text: t.viewTag }), mine),
      h("p", { class: "small muted", text: t.viewNote }),
      h("h2", { text: st.name || C.title }),
      st.about ? h("p", { text: st.about }) : null,
      dashboard(v, { readOnly: true }),
      watchCard(v.result),
      assumeCard(v.result),
      full(st.blocks),
      h("div", { class: "row" }, mine.cloneNode(true)),
    ];
  }

  // ---------- render ----------
  function render() {
    liveHooks.length = 0;
    const main = $("main");
    if (VIEW) {
      const sec = h("section", { class: "screen", id: "screen-view" }, viewScreen());
      sec.querySelectorAll("#make-mine").forEach((b) => (b.onclick = () => { history.replaceState(null, "", location.pathname + location.search); VIEW = null; render(); scrollTo(0, 0); }));
      sec.querySelectorAll(".light").forEach((b) => (b.onclick = () => { SEL = SEL === b.id.slice(6) ? null : b.id.slice(6); render(); }));
      main.replaceChildren(sec);
    } else {
      if (!screens[S.screen]) S.screen = "start";
      main.replaceChildren(h("section", { class: "screen", id: "screen-" + S.screen }, screens[S.screen]()));
    }
    rail(); odometer();
    document.title = C.title + (S.name && !VIEW ? " · " + S.name : "");
  }
  chrome();
  render();
  readHash();
  addEventListener("hashchange", readHash);
  window.__ce = { state: () => S, view: () => VIEW };   // for tests
})();
