// Check Engine relay. Copied from the From Here to There relay (passcode version, commit 9c00efc) and cut down.
// The browser sends a step name plus the canvas fields. This Worker fills the prompt itself (request.js, prompts.gen.js),
// so a passcode can only run this tool's three steps, not act as a general Claude proxy.
// It never logs or stores what people type. The only thing kept is counters (Durable Object).
import { validate, buildRequest } from "./request.js";
import { Counter } from "./counter.js";
export { Counter };

const API_URL = "https://api.anthropic.com/v1/messages";
const MAX_BODY = 40_000;

const enc = new TextEncoder();
const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...headers } });

function corsFor(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return { ok: true, headers: {} };   // not a browser (curl, tests); passcodes and limits still apply
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
  const local = env.ALLOW_LOCALHOST === "1" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (!allowed.includes(origin) && !local) return { ok: false, headers: {} };
  return { ok: true, headers: {
    "Access-Control-Allow-Origin": origin, "Vary": "Origin",
    "Access-Control-Allow-Headers": "Content-Type, X-Passcode", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Max-Age": "86400" } };
}

async function sha(text) { return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text))); }
function sameBytes(a, b) { let d = a.length ^ b.length; for (let i = 0; i < a.length && i < b.length; i++) d |= a[i] ^ b[i]; return d === 0; }
const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, "0")).join("");

// PASSCODES secret: label=code pairs, separated by commas or new lines. Usage is counted under the label.
async function labelFor(env, candidate) {
  if (!candidate || candidate.length > 100) return null;
  const want = await sha(candidate);
  let found = null;
  for (const part of String(env.PASSCODES || "").split(/[,\n\r]+/)) {
    const m = part.trim().match(/^([A-Za-z0-9_-]{1,32})=(\S{8,100})$/);
    if (!m) continue;
    if (sameBytes(want, await sha(m[2])) && !found) found = m[1];   // keep looping so timing doesn't reveal which entry matched
  }
  return found;
}

function denverDay() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }

// Turn Anthropic's event stream into one small JSON line per event. Thinking never reaches the browser.
async function pump(upstream, writer, abort, onUsage) {
  const dec = new TextDecoder();
  const send = (o) => writer.write(enc.encode(JSON.stringify(o) + "\n"));
  let buf = "", usage = {}, stop = "", finished = false;
  const kinds = {};
  const handle = async (line) => {
    if (!line.startsWith("data:")) return;
    let e; try { e = JSON.parse(line.slice(5)); } catch { return; }
    switch (e.type) {
      case "message_start": usage = { ...(e.message && e.message.usage) }; await send({ t: "start" }); break;
      case "content_block_start": kinds[e.index] = (e.content_block || {}).type; break;
      case "content_block_delta":
        if (e.delta && e.delta.type === "text_delta" && kinds[e.index] === "text") await send({ t: "text", d: e.delta.text });
        break;
      case "message_delta":
        if (e.delta && e.delta.stop_reason) stop = e.delta.stop_reason;
        if (e.usage) usage = { ...usage, ...e.usage };
        break;
      case "message_stop": finished = true; break;
      case "error": await send({ t: "err", code: "upstream" }); finished = true; stop = "error"; break;
    }
  };
  try {
    const reader = upstream.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf("\n")) >= 0) { await handle(buf.slice(0, i).trimEnd()); buf = buf.slice(i + 1); }
    }
    if (buf) await handle(buf.trim());
    if (stop !== "error") {
      const u = { in: usage.input_tokens || 0, out: usage.output_tokens || 0, cr: usage.cache_read_input_tokens || 0, cw: usage.cache_creation_input_tokens || 0 };
      await send({ t: "usage", ...u });
      await send(finished ? { t: "done", stop } : { t: "err", code: "upstream" });
      onUsage(u);
    }
  } catch {
    abort();            // browser went away (or upstream broke): stop the Anthropic call so it stops costing money
  } finally {
    try { await writer.close(); } catch {}
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsFor(request, env);
    if (!cors.ok) return json({ error: "forbidden_origin" }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors.headers });

    const stub = env.COUNTER.get(env.COUNTER.idFromName("main"));

    // Admin: today's counts and token totals. curl -H "X-Admin-Token: ..." https://<worker>/api/usage
    if (url.pathname === "/api/usage" && request.method === "GET") {
      const t = request.headers.get("X-Admin-Token") || "";
      if (!env.ADMIN_TOKEN || !sameBytes(await sha(t), await sha(String(env.ADMIN_TOKEN).trim()))) return json({ error: "no" }, 401);
      return json({ ...(await stub.report(denverDay())), limits: { perCodeDaily: Number(env.PER_CODE_DAILY) || 50, globalDaily: Number(env.GLOBAL_DAILY) || 500 } });
    }
    if (request.method !== "POST" || (url.pathname !== "/api/step" && url.pathname !== "/api/check")) return json({ error: "not_found" }, 404, cors.headers);

    // Who is this? Rate-limit wrong guesses per connection (counter only; the address is hashed and expires).
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const ipKey = hex(await sha("ce|" + ip)).slice(0, 16);
    if (await stub.isBlocked(ipKey, Number(env.BAD_TRIES_PER_HOUR) || 20)) return json({ error: "too_many_tries" }, 429, cors.headers);
    const label = await labelFor(env, request.headers.get("X-Passcode") || "");
    if (!label) { await stub.bad(ipKey); return json({ error: "bad_passcode" }, 401, cors.headers); }
    if (url.pathname === "/api/check") return json({ ok: true }, 200, cors.headers);

    // Check the request is one of this tool's steps with sane inputs.
    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ error: "bad_request" }, 413, cors.headers);
    let parsed; try { parsed = JSON.parse(raw); } catch { return json({ error: "bad_request" }, 400, cors.headers); }
    const v = validate(parsed);
    if (!v) return json({ error: "bad_request" }, 400, cors.headers);

    // Count the call (atomic) before spending money.
    const day = denverDay();
    const hit = await stub.hit(label, day, Number(env.PER_CODE_DAILY) || 50, Number(env.GLOBAL_DAILY) || 500);
    if (!hit.ok) return json({ error: hit.reason }, 429, { ...cors.headers, "Retry-After": "3600" });

    const ctl = new AbortController();
    let upstream;
    try {
      upstream = await fetch(API_URL, { method: "POST", signal: ctl.signal,
        headers: { "x-api-key": String(env.ANTHROPIC_API_KEY || "").trim(), "anthropic-version": env.ANTHROPIC_VERSION || "2026-10-21", "content-type": "application/json" },
        body: JSON.stringify(buildRequest(v, { model: env.MODEL, effort: env.EFFORT })) });
    } catch { return json({ error: "upstream" }, 502, cors.headers); }
    if (!upstream.ok) {
      // Report only the status and Anthropic's error type, never the message (it can quote the request).
      let type = ""; try { type = (await upstream.json()).error.type || ""; } catch {}
      return json({ error: "upstream", status: upstream.status, type }, 502, cors.headers);
    }

    const { readable, writable } = new TransformStream();
    const done = pump(upstream, writable.getWriter(), () => ctl.abort(), (u) => ctx.waitUntil(stub.addUsage(day, label, u)));
    ctx.waitUntil(done);
    return new Response(readable, { headers: { ...cors.headers, "Content-Type": "application/x-ndjson", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
  },
};
