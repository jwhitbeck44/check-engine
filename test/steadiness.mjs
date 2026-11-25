// Steadiness of the check: run CHECK N times on each test canvas and report, pair by pair, how often the answers agree.
// Uses the Worker's own request builder against the API directly (test/direct.mjs). Costs money.
// Run: node steadiness.mjs [runs=5] [model=claude-opus-5-5] [tag]
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { CANVASES } from "./canvases.mjs";
import { callDirect, varsFor, E } from "./direct.mjs";

const RUNS = Number(process.argv[2] || 5), MODEL = process.argv[3] || "claude-opus-5-5", TAG = process.argv[4] || MODEL;
const out = fileURLToPath(new URL(`../_local/steady-${TAG}.json`, import.meta.url));
const SHORT = { holds: "H", shaky: "S", breaks: "B", cant_tell: "?" };

async function one(cv) {
  const { vars, c } = varsFor(cv);
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await callDirect("CHECK", vars, { model: MODEL });
    if (r.ok && r.data) {
      const fin = E.finalize(r.data, cv, c);
      return { ai: Object.fromEntries(E.PKEYS.map((k) => [k, r.data.pairs?.[k]?.status])), final: Object.fromEntries(E.PKEYS.map((k) => [k, fin.pairs[k].status])),
        watch: fin.watch, head: E.headline(fin, cv).kind, dropped: fin.droppedQuotes, volume: !!fin.pairs.p2.volume, cost: r.cost, ms: r.ms, usage: r.usage, stop: r.stop,
        reasons: Object.fromEntries(E.PKEYS.map((k) => [k, fin.pairs[k].reason])) };
    }
    console.error("retry", cv.id, r.status || r.stop, r.type || "");
    await new Promise((res) => setTimeout(res, 4000));
  }
  return { error: true };
}

const results = {};
for (const cv of CANVASES) {
  // first call alone so the cache is written once, then the rest in parallel
  const first = await one(cv);
  const rest = await Promise.all(Array.from({ length: RUNS - 1 }, () => one(cv)));
  results[cv.id] = [first, ...rest];
  const runs = results[cv.id].filter((r) => !r.error);
  const line = E.PKEYS.map((k) => k + ":" + runs.map((r) => SHORT[r.final[k]]).join("")).join("  ");
  console.log(cv.id.padEnd(10), line, " watch:" + runs.map((r) => r.watch.slice(1)).join(""), " head:" + runs.map((r) => r.head[0]).join(""));
}
fs.writeFileSync(out, JSON.stringify({ model: MODEL, runs: RUNS, at: new Date().toISOString(), results }, null, 1));

// agreement: for each pair, the share of runs that gave the most common answer
let calls = 0, total = 0, ms = 0, dropped = 0, quotes = 0;
const table = [];
for (const cv of CANVASES) {
  const runs = results[cv.id].filter((r) => !r.error);
  const row = { canvas: cv.id };
  for (const k of [...E.PKEYS, "watch", "head"]) {
    const vals = runs.map((r) => (k === "watch" ? r.watch : k === "head" ? r.head : r.final[k]));
    const counts = {}; for (const v of vals) counts[v] = (counts[v] || 0) + 1;
    const [mode, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    row[k] = `${n}/${runs.length} ${k === "watch" || k === "head" ? mode : SHORT[mode]}`;
  }
  for (const r of runs) { calls++; total += r.cost; ms += r.ms; dropped += r.dropped; quotes += 7; }
  table.push(row);
}
console.table(table);
console.log(`${MODEL}: ${calls} calls, $${total.toFixed(3)} total, $${(total / calls).toFixed(4)} per call, ${(ms / calls / 1000).toFixed(1)} s average, ${dropped} of ${quotes} quotes dropped as not on the canvas`);
