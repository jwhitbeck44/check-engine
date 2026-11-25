// One full live pass through the deployed relay: NUMBERS, CHECK, ROAD on the Ladle Patrol canvas.
// Prints per-call cost and time, and a projection for 40 users. Reads the passcode from _local/passcodes.txt; never prints it.
// Run: node live-flow.mjs [label=steady]
import fs from "node:fs";
import { CANVASES } from "./canvases.mjs";
import { cost, E } from "./direct.mjs";

const RELAY = fs.readFileSync(new URL("../docs/config.js", import.meta.url), "utf8").match(/RELAY = "([^"]+)"/)[1];
const label = process.argv[2] || "steady";
const CODE = fs.readFileSync(new URL("../_local/passcodes.txt", import.meta.url), "utf8").split(/\r?\n/).find((l) => l.startsWith(label + "="))?.split("=")[1];
if (!CODE) throw new Error("no passcode for " + label);

async function step(name, vars) {
  const t0 = Date.now();
  const res = await fetch(RELAY + "/api/step", { method: "POST", headers: { "Content-Type": "application/json", "X-Passcode": CODE, Origin: "https://jwhitbeck44.github.io" }, body: JSON.stringify({ step: name, vars }) });
  if (!res.ok) return { status: res.status, body: await res.text(), ms: Date.now() - t0 };
  let text = "", usage = null, stop = "", first = 0;
  const dec = new TextDecoder(); let buf = "";
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    let i; while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const m = JSON.parse(line);
      if (m.t === "text") { if (!first) first = Date.now() - t0; text += m.d; } else if (m.t === "usage") usage = m; else if (m.t === "done") stop = m.stop; else if (m.t === "err") stop = "ERR";
    }
  }
  return { status: 200, data: JSON.parse(text), usage, stop, ms: Date.now() - t0, first, cors: res.headers.get("access-control-allow-origin") };
}

const cv = CANVASES[0];
const base = { name: cv.name, about: cv.about, ...cv.blocks, lights: "" };
const rows = [];
const log = (name, r) => { const c = r.usage ? cost(r.usage) : 0; rows.push({ name, c, ms: r.ms }); console.log(name.padEnd(8), r.status, r.stop, `in ${r.usage?.in} cw ${r.usage?.cw} cr ${r.usage?.cr} out ${r.usage?.out}`, "$" + c.toFixed(4), (r.ms / 1000).toFixed(1) + "s", "first text " + (r.first / 1000).toFixed(1) + "s", "cors " + r.cors); };

const n = await step("NUMBERS", { ...base, numbers: "(not filled in yet)" });
log("NUMBERS", n);
const found = Object.fromEntries(E.FIELDS.map((f) => [f, E.partsToValue(f, n.data[f].parts)]));
console.log("  found:", JSON.stringify(found));
const nums = E.parseNums(cv.nums).n, c = E.calc(nums);
const ch = await step("CHECK", { ...base, numbers: E.numbersText(nums, c) });
log("CHECK", ch);
const fin = E.finalize(ch.data, cv, c);
console.log("  lights:", E.PKEYS.map((k) => k + "=" + fin.pairs[k].status).join(" "), "| watch", fin.watch, "| headline", E.headline(fin, cv).kind, "| dropped quotes", fin.droppedQuotes);
const lights = ["Answers on the latest check:", ...E.PKEYS.map((k) => k + ": " + fin.pairs[k].status + ". " + fin.pairs[k].reason), "", "Pair to watch first: " + fin.watch + "."].join("\n");
const rd = await step("ROAD", { ...base, numbers: E.numbersText(nums, c), lights });
log("ROAD", rd);
const road = E.finalizeRoad(rd.data, fin, nums);
for (const e of road.events) console.log("  " + (e.survives ? "survives" : "BREAKS  ") + " [" + e.block + "] " + e.event + (e.on.length ? "  on: " + e.on.join(",") : "") + (e.adjust ? "  adjust " + JSON.stringify(e.adjust) : ""));
console.log("  Survives " + road.survived + " of 3");
const total = rows.reduce((a, r) => a + r.c, 0);
console.log(`\nTOTAL (3 calls): $${total.toFixed(4)}`);
// A session: NUMBERS once, about 5 checks, 2 road tests (see SUMMARY for the assumption)
const sess = rows[0].c + 5 * rows[1].c + 2 * rows[2].c;
console.log(`Per session (1 NUMBERS + 5 CHECK + 2 ROAD = 8 calls): $${sess.toFixed(2)} | 40 users, one session each: $${(40 * sess).toFixed(2)}`);
