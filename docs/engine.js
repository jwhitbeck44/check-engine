// Check Engine · the math and the rules. Code does every calculation; the AI never does.
// Plain functions, no page access, so the Node tests use this same file.
(function (root) {
  "use strict";
  const FIELDS = ["price", "unit_cost", "sales", "monthly_cost", "pay", "hours_per_sale", "hours_have"];
  const BLOCKS = ["cs", "vp", "ch", "cr", "rs", "kr", "ka", "kp", "co"];
  const PKEYS = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"];
  const STATUSES = ["holds", "shaky", "breaks", "cant_tell"];
  // Thresholds. Money: in/out at or above 1 holds, 0.9 to 1 is shaky, below 0.9 breaks.
  // Hours: needed/have at or below 1 holds, up to 1.1 is shaky, above 1.1 breaks.
  const MONEY_SHAKY = 0.9, HOURS_SHAKY = 1.1;
  const PAIR_BLOCKS = { p1: ["cs", "vp"], p2: ["ch", "cs"], p3: ["rs", "cs"], p4: ["cr", "ka"], p5: ["ka", "kr"], p6: ["kp", "ka"], p7: ["rs", "co"] };

  // "$1,500" -> 1500, "" -> null, "abc" -> NaN
  function num(s) {
    const t = String(s == null ? "" : s).replace(/[$,\s]/g, "");
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  }
  function parseNums(raw) {
    const out = {}, bad = {};
    for (const f of FIELDS) {
      const n = num(raw && raw[f]);
      if (Number.isNaN(n)) { out[f] = null; bad[f] = "nan"; }
      else if (n !== null && n < 0) { out[f] = null; bad[f] = "neg"; }
      else out[f] = n;
    }
    return { n: out, bad };
  }

  // NUMBERS reply parts -> one value per field. Unit conversion and adding happen here, not in the AI.
  const PER = {
    price: { sale: 1 }, unit_cost: { sale: 1 }, hours_per_sale: { sale: 1 },
    sales: { month: 1, week: 52 / 12, year: 1 / 12 },
    monthly_cost: { month: 1, week: 52 / 12, year: 1 / 12 },
    pay: { month: 1, week: 52 / 12, year: 1 / 12 },
    hours_have: { month: 1, week: 52 / 12, day: 30 },
  };
  function partsToValue(field, parts) {
    if (!Array.isArray(parts) || !parts.length) return null;
    let sum = 0, used = 0;
    for (const p of parts) {
      const k = PER[field][p && p.per];
      if (!k || typeof p.amount !== "number" || !Number.isFinite(p.amount) || p.amount < 0) continue;
      sum += p.amount * k; used++;
    }
    if (!used) return null;
    const keepCents = field === "price" || field === "unit_cost";
    return keepCents ? Math.round(sum * 100) / 100 : field === "hours_per_sale" ? Math.round(sum * 100) / 100 : Math.round(sum);
  }
  const fmtNum = (v) => (v == null ? "" : String(v));

  // The money check and the hours check.
  function calc(nums) {
    const { price: P, sales: Q, monthly_cost: M, pay: Y, hours_per_sale: H, hours_have: A } = nums;
    const U = nums.unit_cost == null ? 0 : nums.unit_cost;
    const money = { status: "cant_tell", missing: [] };
    for (const [k, v] of [["price", P], ["sales", Q], ["monthly_cost", M], ["pay", Y]]) if (v == null) money.missing.push(k);
    if (!money.missing.length) {
      money.inn = Math.round(P * Q);
      money.out = Math.round(M + Y + U * Q);
      money.margin = P - U;
      money.need = money.margin > 0 ? Math.ceil((M + Y) / money.margin) : null;   // null: no number of sales covers it
      money.expect = Q;
      money.ratio = money.out > 0 ? money.inn / money.out : 1;
      money.status = money.ratio >= 1 ? "holds" : money.ratio >= MONEY_SHAKY ? "shaky" : "breaks";
      if (money.margin <= 0 && money.out > 0) money.status = "breaks";
    }
    const hours = { status: "cant_tell", missing: [] };
    if (H == null) hours.missing.push("hours_per_sale");
    if (A == null) hours.missing.push("hours_have");
    if (money.status === "cant_tell") hours.missing.push(...money.missing.filter((m) => !hours.missing.includes(m)));
    if (!hours.missing.length && money.need != null) {
      hours.need = Math.round(money.need * H);
      hours.have = A;
      hours.ratio = A > 0 ? hours.need / A : hours.need > 0 ? Infinity : 0;
      hours.status = hours.ratio <= 1 ? "holds" : hours.ratio <= HOURS_SHAKY ? "shaky" : "breaks";
    } else if (!hours.missing.length) hours.never = true;   // every sale loses money, so no hours figure makes sense
    return { money, hours };
  }
  // adjust: [{ field, factor }] from the road test (an object of field: factor is accepted too)
  function adjusted(nums, adjust) {
    const out = { ...nums };
    let any = false;
    const map = Array.isArray(adjust) ? Object.fromEntries(adjust.filter((a) => a && FIELDS.includes(a.field)).map((a) => [a.field, a.factor])) : adjust || {};
    for (const f of FIELDS) {
      const k = map[f];
      if (typeof k === "number" && Number.isFinite(k) && k >= 0 && out[f] != null) { out[f] = out[f] * k; any = true; }
    }
    return { nums: out, any };
  }

  const usd = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
  const LABEL = { price: "Price per sale", unit_cost: "Cost each time you make a sale", sales: "Sales per month expected",
    monthly_cost: "Monthly cost to run it", pay: "Founder pay needed per month", hours_per_sale: "Hours each sale takes", hours_have: "Hours available per month" };
  // What the page tells the AI about the numbers. Plain facts; the AI only writes words around them.
  function numbersText(nums, c) {
    const L = [];
    for (const f of FIELDS) {
      const v = nums[f];
      L.push(LABEL[f] + ": " + (v == null ? (f === "unit_cost" ? "0 (not given)" : "not given") : (f === "price" || f === "unit_cost" || f === "monthly_cost" || f === "pay" ? "$" + v : v)));
    }
    const m = c.money, h = c.hours;
    L.push("");
    if (m.status === "cant_tell") L.push("Money check (done by the page): can't tell, missing " + m.missing.map((k) => LABEL[k].toLowerCase()).join(", ") + ".");
    else {
      L.push("Money check (done by the page): money in " + usd(m.inn) + " a month, money out " + usd(m.out) + " a month with founder pay, so The Fuel covers " + Math.round(m.ratio * 100) + "% of The Burn.");
      L.push(m.need == null ? "Each sale costs as much as it brings in or more, so no number of sales covers the costs." : "Sales needed to cover it: " + m.need + " a month. Sales expected: " + m.expect + " a month.");
    }
    L.push("Status the page sets for p7: " + m.status + ".");
    if (h.status !== "cant_tell") {
      L.push("Hours check (done by the page): the needed sales take " + h.need + " hours a month; the person has " + h.have + ".");
      L.push("Status the page sets for p5: " + h.status + ".");
    } else L.push("Hours check: no result" + (h.never ? " (no number of sales covers the costs)" : ", missing " + h.missing.map((k) => LABEL[k].toLowerCase()).join(", ")) + ". Judge p5 from the words.");
    return L.join("\n");
  }

  // Quotes must be the person's own words. Anything not found on the canvas is dropped.
  const norm = (s) => String(s || "").toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
  function canvasText(st) { return norm([st.name, st.about, ...BLOCKS.map((b) => st.blocks[b])].join(" \n ")); }
  function verifyQuote(q, text) {
    const t = norm(q).replace(/^["'\s.]+|["'\s]+$/g, "").replace(/[.,;:!]+$/, "");
    if (!t) return "";
    const pieces = t.split(/\s*(?:\.\.\.|…)\s*/).filter(Boolean);
    return pieces.length && pieces.every((p) => text.includes(p)) ? String(q).trim().replace(/^["'“‘]+|["'”’]+$/g, "") : "";
  }

  const RANK = { holds: 0, cant_tell: 1, shaky: 2, breaks: 3 };
  const okStatus = (s) => (STATUSES.includes(s) ? s : "cant_tell");
  const clip = (s, n) => String(s || "").trim().slice(0, n || 400);

  // CHECK reply + canvas + numbers -> the result the dashboard shows. Code owns p7 always and p5 when hours exist.
  function finalize(reply, st, c) {
    const text = canvasText(st);
    const r = reply && typeof reply === "object" ? reply : {};
    const rp = r.pairs || {};
    const pairs = {};
    let dropped = 0;
    for (const k of PKEYS) {
      const x = rp[k] || {};
      const quote = verifyQuote(x.quote, text);
      if (clip(x.quote) && !quote) dropped++;
      pairs[k] = { status: okStatus(x.status), quote, reason: clip(x.reason, 300), question: clip(x.question, 200), src: "ai" };
      if (k === "p2" && x.volume_flag && clip(x.volume_note)) {
        pairs[k].volume = clip(x.volume_note, 300);
        if (pairs[k].status === "holds") pairs[k].status = "shaky";
      }
    }
    pairs.p7.status = c.money.status; pairs.p7.src = "money";
    if (c.hours.status !== "cant_tell") { pairs.p5.status = c.hours.status; pairs.p5.src = "hours"; }
    let watch = PKEYS.includes(r.watch_first) ? r.watch_first : null;
    const reds = PKEYS.filter((k) => pairs[k].status === "breaks");
    const ambers = PKEYS.filter((k) => pairs[k].status === "shaky");
    // the one to watch must be one of the worst lights present: a red if any, else an amber if any
    if (reds.length && (!watch || pairs[watch].status !== "breaks")) watch = reds[0];
    else if (!reds.length && ambers.length && (!watch || pairs[watch].status !== "shaky")) watch = ambers[0];
    if (!watch) watch = PKEYS.slice().sort((a, b) => RANK[pairs[b].status] - RANK[pairs[a].status])[0];
    const assumptions = (Array.isArray(r.assumptions) ? r.assumptions : []).slice(0, 3)
      .map((a) => ({ belief: clip(a && a.belief, 200), test: clip(a && a.test, 300) })).filter((a) => a.belief);
    return { pairs, watch, watchWhy: watch === r.watch_first ? clip(r.watch_why, 300) : "", assumptions, droppedQuotes: dropped };
  }

  // The headline, from the lights. Order: any red, then any can't tell, then any amber, then all clear.
  function headline(result, st) {
    const p = result.pairs;
    const n = (s) => PKEYS.filter((k) => p[k].status === s).length;
    const red = n("breaks"), cant = n("cant_tell"), amber = n("shaky");
    if (red) return { kind: "red", n: red };
    if (cant) {
      const need = [];
      for (const k of PKEYS) {
        if (p[k].status !== "cant_tell") continue;
        if (k === "p7" || (k === "p5" && p[k].src !== "ai")) { if (!need.includes("numbers")) need.push("numbers"); continue; }
        const empty = PAIR_BLOCKS[k].filter((b) => !String(st.blocks[b] || "").trim());
        for (const b of empty.length ? empty : PAIR_BLOCKS[k]) if (!need.includes(b)) need.push(b);
      }
      if (p.p7.status === "cant_tell" && !need.includes("numbers")) need.push("numbers");
      return { kind: "cant", n: cant, need };
    }
    if (amber) return { kind: "amber", n: amber };
    return { kind: "clear", n: 0 };
  }

  // ROAD reply -> three events with their lights, numbers re-run in code under each event.
  function finalizeRoad(reply, base, nums) {
    const r = reply && typeof reply === "object" ? reply : {};
    const events = [];
    for (const e of ["e1", "e2", "e3"]) {
      const x = r[e];
      if (!x || !clip(x.event)) continue;
      // start from the dashboard's lights; apply only the pairs the event changes
      const pairs = Object.fromEntries(PKEYS.map((k) => [k, { status: base.pairs[k].status, reason: "" }]));
      for (const y of Array.isArray(x.changes) ? x.changes : []) if (y && PKEYS.includes(y.pair) && STATUSES.includes(y.status)) pairs[y.pair] = { status: y.status, reason: clip(y.reason, 300) };
      const adj = adjusted(nums, x.adjust);
      const c = calc(adj.nums);
      // the numbers-owned lights follow the page's math under the event, never the AI's
      pairs.p7 = { status: c.money.status, reason: adj.any && c.money.status !== base.pairs.p7.status ? pairs.p7.reason : "" };
      if (base.pairs.p5.src === "hours" || c.hours.status !== "cant_tell") {
        if (c.hours.status !== "cant_tell") pairs.p5 = { status: c.hours.status, reason: c.hours.status !== base.pairs.p5.status ? pairs.p5.reason : "" };
      }
      const on = PKEYS.filter((k) => RANK[pairs[k].status] > RANK[base.pairs[k].status] && pairs[k].status !== "cant_tell");
      // survives = the event adds no new red light (a light already red on the dashboard doesn't count against it)
      const survives = !PKEYS.some((k) => pairs[k].status === "breaks" && base.pairs[k].status !== "breaks");
      events.push({ block: BLOCKS.includes(x.block) ? x.block : "", event: clip(x.event, 240), aimed: e === "e1", pairs, on, survives, adjust: adj.any ? x.adjust : null, money: c.money });
    }
    return { events, survived: events.filter((e) => e.survives).length };
  }

  const api = { FIELDS, BLOCKS, PKEYS, STATUSES, PAIR_BLOCKS, num, parseNums, partsToValue, fmtNum, calc, adjusted, numbersText, verifyQuote, canvasText, finalize, headline, finalizeRoad, usd, RANK };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ENGINE = api;
})(typeof window !== "undefined" ? window : globalThis);
