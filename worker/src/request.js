// Builds the Anthropic request for one step. No Cloudflare imports, so the steadiness test can use it too.
import { COACH, STEPS, DATA, SCHEMAS } from "./prompts.gen.js";

// max = max_tokens ceiling. It includes the model's thinking, so it leaves headroom.
export const STEP_CFG = {
  NUMBERS: { max: 8000 },
  CHECK: { max: 14000 },
  ROAD: { max: 20000 },
};
export const BLOCK_IDS = ["cs", "vp", "ch", "cr", "rs", "kr", "ka", "kp", "co"];
// Every field the page may send, with its length cap. Anything else is rejected.
export const VAR_MAX = { name: 120, about: 400, numbers: 3000, lights: 4000, ...Object.fromEntries(BLOCK_IDS.map((b) => [b, 1500])) };

const fill = (t, vars) => t.replace(/\{\{(\w+)\}\}/g, (m, k) => {
  const v = String(vars[k] ?? "").trim();
  return v || (BLOCK_IDS.includes(k) || k === "name" || k === "about" ? "(blank)" : "(none)");
});

export function validate(body) {
  if (!body || typeof body !== "object") return null;
  const cfg = STEP_CFG[body.step];
  if (!cfg || !STEPS[body.step]) return null;
  const v = body.vars && typeof body.vars === "object" && !Array.isArray(body.vars) ? body.vars : {};
  for (const k of Object.keys(v)) if (!(k in VAR_MAX)) return null;
  const vars = {};
  for (const k of Object.keys(VAR_MAX)) {
    const val = v[k] == null ? "" : v[k];
    if (typeof val !== "string" || val.length > VAR_MAX[k]) return null;
    vars[k] = val;
  }
  return { step: body.step, cfg, vars };
}

export function buildRequest({ step, cfg, vars }, opts = {}) {
  return {
    model: opts.model || "claude-opus-5-5",
    max_tokens: cfg.max,
    stream: opts.stream !== false,
    output_config: { effort: opts.effort || "medium", format: { type: "json_schema", schema: SCHEMAS[step] } },
    system: [
      { type: "text", text: COACH, cache_control: { type: "ephemeral" } },   // identical on every call, so it is cached
      { type: "text", text: STEPS[step] },
    ],
    messages: [{ role: "user", content: fill(DATA, vars) }],
  };
}
