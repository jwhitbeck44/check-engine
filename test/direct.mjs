// Calls the Anthropic API directly with the same request the Worker builds (worker/src/request.js).
// Used by the steadiness run, which would otherwise burn a passcode's daily limit. Never prints the key.
import { validate, buildRequest } from "../worker/src/request.js";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
export const E = require("../docs/engine.js");

export const PRICES = {
  "claude-opus-5-5": { in: 4, out: 20, cr: 0.2, cw: 5 },
  "claude-sonnet-5-5": { in: 2, out: 10, cr: 0.1, cw: 2.5 },
};
export const cost = (u, model = "claude-opus-5-5") => { const p = PRICES[model]; return (u.in * p.in + u.out * p.out + u.cr * p.cr + u.cw * p.cw) / 1e6; };

// The page's fields for a step, built from a test canvas the same way app.js builds them.
export function varsFor(cv, extra = {}) {
  const parsed = E.parseNums(cv.nums).n;
  const c = E.calc(parsed);
  return { vars: { name: cv.name, about: cv.about, ...cv.blocks, numbers: extra.numbers ?? E.numbersText(parsed, c), lights: extra.lights || "" }, nums: parsed, c };
}

export async function callDirect(step, vars, { model = "claude-opus-5-5", effort } = {}) {
  const key = process.env.ANTHROPIC_API_KEY_ENTP;
  if (!key) throw new Error("ANTHROPIC_API_KEY_ENTP not set");
  const v = validate({ step, vars });
  if (!v) throw new Error("validate() rejected the vars for " + step);
  const body = buildRequest(v, { model, effort, stream: false });
  const t0 = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
    headers: { "x-api-key": key.trim(), "anthropic-version": "2026-10-21", "content-type": "application/json" }, body: JSON.stringify(body) });
  const ms = Date.now() - t0;
  const j = await res.json();
  if (!res.ok) return { ok: false, status: res.status, type: j?.error?.type, message: String(j?.error?.message || "").slice(0, 300), ms };
  const text = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  const u = { in: j.usage.input_tokens || 0, out: j.usage.output_tokens || 0, cr: j.usage.cache_read_input_tokens || 0, cw: j.usage.cache_creation_input_tokens || 0 };
  let data = null; try { data = JSON.parse(text); } catch {}
  return { ok: true, stop: j.stop_reason, data, text, usage: u, cost: cost(u, model), ms };
}

if (process.argv[1] && process.argv[1].endsWith("direct.mjs")) {
  const { CANVASES } = await import("./canvases.mjs");
  const [step = "CHECK", id = "clear"] = process.argv.slice(2);
  const cv = CANVASES.find((x) => x.id === id);
  const { vars, nums, c } = varsFor(cv, step === "NUMBERS" ? { numbers: "(not filled in yet)" } : {});
  const r = await callDirect(step, vars);
  console.log(JSON.stringify({ ...r, text: undefined }, null, 1));
  if (r.ok && step === "CHECK") {
    const fin = E.finalize(r.data, cv, c);
    console.log("final:", Object.fromEntries(E.PKEYS.map((k) => [k, fin.pairs[k].status])), "watch", fin.watch, "dropped quotes", fin.droppedQuotes, "headline", E.headline(fin, cv));
  }
}
