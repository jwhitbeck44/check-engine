// Playwright test that mocks the relay (no network, no key, no cost). Screenshots go to _local/run-<date>/.
// Run: cd test && npm install && node mocktest.mjs
import { chromium } from "playwright-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CANVASES } from "./canvases.mjs";

const DOCS = new URL("../docs/", import.meta.url);
const d = new Date(), DAY = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
const OUT = new URL("../_local/run-" + DAY + "/", import.meta.url);
const outFile = (name) => fileURLToPath(new URL(name, OUT));
fs.mkdirSync(OUT, { recursive: true });
const RELAY = "http://localhost:8799";
const GOOD = "test-code-1234";

let failed = 0;
const ok = (c, msg) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failed++; };

// ---- static site with the relay address swapped ----
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const srv = http.createServer((q, s) => {
  const p = decodeURIComponent(new URL(q.url, "http://x").pathname.replace(/^\/+/, "")) || "index.html";
  const f = new URL(p, DOCS);
  if (!fs.existsSync(f)) { s.writeHead(404); return s.end(); }
  let body = fs.readFileSync(f);
  if (p === "config.js") body = Buffer.from(`window.RELAY = "${RELAY}";`);
  s.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "text/plain" }); s.end(body);
}).listen(0);
const PAGE = "http://localhost:" + srv.address().port + "/";

// ---- canned replies ----
const PK = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"];
function checkReply(statuses, cv) {
  const quoteFrom = (k) => ({ p1: cv.blocks.cs, p2: cv.blocks.ch, p3: cv.blocks.rs, p4: cv.blocks.cr, p5: cv.blocks.ka, p6: cv.blocks.kp, p7: cv.blocks.co }[k] || "").split(/[.,]/)[0];
  const pairs = {};
  PK.forEach((k, i) => {
    pairs[k] = { status: statuses[i], quote: k === "p3" ? "words that are not on the canvas" : quoteFrom(k), reason: "Reason for " + k + ".", question: "Question for " + k + "?" };
  });
  pairs.p2.volume_flag = false; pairs.p2.volume_note = "";
  return { pairs, watch_first: "p3", watch_why: "Watch why line.", assumptions: [{ belief: "Nurses want soup at 2 a.m.", test: "Ask five nurses this week." }, { belief: "Charge nurses share the menu.", test: "Ask both to post it once." }, { belief: "$8 is fine.", test: "Ask what they paid last time." }] };
}
const NUMBERS = {
  price: { parts: [{ amount: 8, per: "sale" }], quote: "$8 a bowl", ask: "" },
  unit_cost: { parts: [{ amount: 2, per: "sale" }], quote: "About $2 a bowl", ask: "" },
  sales: { parts: [], quote: "", ask: "How many bowls a month?" },
  monthly_cost: { parts: [{ amount: 200, per: "month" }], quote: "Kitchen rent $200 a month", ask: "" },
  pay: { parts: [], quote: "", ask: "What do you need to be paid?" },
  hours_per_sale: { parts: [], quote: "", ask: "Hours per bowl?" },
  hours_have: { parts: [{ amount: 15, per: "week" }], quote: "invented quote", ask: "" },
};
const ROAD = (base) => {
  const ev = (block, event, change, adjust) => {
    const pairs = Object.fromEntries(PK.map((k, i) => [k, { status: base[i], reason: "" }]));
    for (const [k, st] of Object.entries(change)) pairs[k] = { status: st, reason: "Because of the event, " + k + " changes." };
    return { block, event, adjust: { price: null, unit_cost: null, sales: null, monthly_cost: null, pay: null, hours_per_sale: null, hours_have: null, ...adjust }, pairs };
  };
  return { e1: ev("rs", "Half your nurses switch to day shifts.", { p3: "shaky" }, {}),
    e2: ev("co", "The church raises kitchen rent a lot.", {}, { monthly_cost: 3 }),
    e3: ev("kp", "Your charge nurse quits.", { p6: "shaky" }, {}) };
};
let MODE = { check: ["holds", "holds", "holds", "holds", "holds", "holds", "holds"], cv: CANVASES[0], fail: "" };
const nd = (...o) => o.map((x) => JSON.stringify(x)).join("\n") + "\n";
const stream = (obj) => { const b = JSON.stringify(obj), parts = []; for (let i = 0; i < b.length; i += 50) parts.push({ t: "text", d: b.slice(i, i + 50) }); return nd({ t: "start" }, ...parts, { t: "usage", in: 1, out: 1, cr: 0, cw: 0 }, { t: "done", stop: "end_turn" }); };

async function mock(page) {
  const calls = [], outside = [];
  await page.route("**/*", async (r) => {
    const u = r.request().url();
    if (u.startsWith(PAGE) || u.startsWith("data:") || u.startsWith("blob:")) return r.continue();
    if (u.startsWith(RELAY)) {
      const pass = r.request().headers()["x-passcode"];
      if (u.endsWith("/api/check")) return r.fulfill({ status: pass === GOOD ? 200 : 401, contentType: "application/json", body: pass === GOOD ? '{"ok":true}' : '{"error":"bad_passcode"}' });
      const b = JSON.parse(r.request().postData());
      calls.push({ step: b.step, vars: b.vars, pass });
      if (pass !== GOOD) return r.fulfill({ status: 401, contentType: "application/json", body: '{"error":"bad_passcode"}' });
      if (MODE.fail) return r.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: MODE.fail }) });
      await new Promise((res) => setTimeout(res, b.step === "CHECK" ? 700 : 150));
      const body = b.step === "NUMBERS" ? NUMBERS : b.step === "CHECK" ? checkReply(MODE.check, MODE.cv) : ROAD(MODE.check);
      return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: stream(body) });
    }
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return r.abort();
    outside.push(u); return r.abort();
  });
  return { calls, outside };
}

const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const browser = await chromium.launch({ executablePath: fs.existsSync(edge) ? edge : undefined, headless: true });

async function walk(width, tag) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 } });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: PAGE.replace(/\/$/, "") });
  await ctx.addInitScript(() => { try { delete Navigator.prototype.share; } catch (e) {} });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { calls, outside } = await mock(page);
  const shot = (name) => page.screenshot({ path: outFile(`${tag}-${name}.png`), fullPage: true });
  const wide = async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  MODE = { check: Array(7).fill("holds"), cv: CANVASES[0], fail: "" };
  const cv = CANVASES[0];

  await page.goto(PAGE);
  await shot("01-start");
  await page.fill("#pass", "wrong-code-99"); await page.press("#pass", "Tab");
  await page.waitForFunction(() => document.getElementById("pass-msg").textContent.length > 0);
  ok(/didn't work/.test(await page.textContent("#pass-msg")), tag + ": a wrong passcode says so");
  await page.fill("#pass", GOOD); await page.press("#pass", "Tab");
  await page.waitForFunction(() => /works/.test(document.getElementById("pass-msg").textContent));
  await page.fill("#v-name", cv.name); await page.fill("#v-about", cv.about);
  await page.click("#go-build");
  const ids = ["cs", "vp", "ch", "cr", "rs", "kr", "ka", "kp", "co"];
  for (let i = 0; i < 9; i++) {
    await page.fill("#block-text", cv.blocks[ids[i]]);
    if (i === 0) await shot("02-build");
    if (i === 4) { ok(/funding mix/.test(await page.textContent("#main")), tag + ": The Fuel carries the funding-mix line"); await page.click("text=Show me an example"); await shot("03-build-fuel"); }
    if (i < 8) await page.click("#block-next");
  }
  ok(await wide(), tag + ": build screen never scrolls sideways");
  // first engine start: numbers step
  await page.click("#block-next");
  await page.waitForSelector("#n-price");
  ok(calls[0] && calls[0].step === "NUMBERS" && calls[0].vars.cs.includes("Night-shift") && !("prompt" in calls[0].vars), tag + ": first start sends NUMBERS with the canvas fields, not a prompt");
  ok((await page.inputValue("#n-price")) === "8" && (await page.inputValue("#n-monthly_cost")) === "200" && (await page.inputValue("#n-hours_have")) === String(Math.round(15 * 52 / 12)), tag + ": numbers found in the words fill the form (weeks turned into months by code)");
  ok((await page.textContent("#main")).includes("How many bowls a month?"), tag + ": a missing number shows the question to ask");
  ok(!(await page.textContent("#main")).includes("invented quote"), tag + ": a quote not on the canvas is not shown");
  await shot("04-numbers");
  for (const [f, v] of Object.entries(cv.nums)) await page.fill("#n-" + f, v);
  await page.click("#go-check");
  await page.waitForSelector(".dashpanel.igniting");
  ok((await page.locator(".dashpanel.igniting .light").count()) === 7, tag + ": at ignition all seven lights come on");
  await shot("05-ignition");
  await page.waitForSelector(".dashpanel:not(.igniting) #headline");
  await page.waitForTimeout(950);
  ok((await page.textContent("#headline")) === "All clear as written.", tag + ": all holds reads All clear as written");
  ok(await page.isVisible("#route") && (await page.getAttribute("#route", "href")) === "https://jwhitbeck44.github.io/from-here-to-there/", tag + ": a clear dashboard shows Now plan the route");
  ok(await page.isVisible("#watch"), tag + ": Watch this one first shows even on a clear dashboard");
  const lw = await page.$$eval(".light .lw", (els) => els.map((e) => e.textContent));
  ok(lw.length === 7 && lw.every((t) => t === "Holds" || t === "Holds · watch first") && lw.filter((t) => t.includes("watch first")).length === 1, tag + ": every light carries its status as a word");
  ok(/v\s*0\s*1/.test(await page.textContent("#odo")), tag + ": odometer reads v01");
  const chk = calls.find((c) => c.step === "CHECK");
  ok(/Status the page sets for p7: holds/.test(chk.vars.numbers) && /Status the page sets for p5: holds/.test(chk.vars.numbers), tag + ": CHECK carries the page's money and hours results");
  ok(await wide(), tag + ": dashboard never scrolls sideways");
  await shot("06-clear");
  await page.click("#light-p3");
  ok(await page.isVisible("#detail") && !(await page.textContent("#detail")).includes("words that are not on the canvas"), tag + ": tapping a light opens it, and a made-up quote is dropped");
  await page.click("#light-p7");
  ok(/From the money check/.test(await page.textContent("#detail")), tag + ": the money light says it comes from the money check");
  await shot("07-light-open");

  // road test
  await page.click("#to-road"); await page.click("#go-road");
  await page.waitForSelector("#survive");
  ok((await page.textContent("#survive")).trim() === "Survives 2 of 3.", tag + ": road test reads Survives 2 of 3");
  ok(calls.filter((c) => c.step === "ROAD").length === 1 && /Pair to watch first: p3/.test(calls.find((c) => c.step === "ROAD").vars.lights), tag + ": ROAD carries the latest lights and the pair to watch");
  ok(/The Fuel \+ The Burn · Breaks/.test(await page.textContent("#event-1")), tag + ": rent tripling turns the money light red, by the page's math");
  await shot("08-road");

  // change a block and start again
  await page.click("nav.rail button:has-text('Build')");
  await page.click(".thumb .cell[style*='--a:ch']");
  await page.fill("#block-text", cv.blocks.ch + " Also a QR code on the elevator.");
  ok(await page.locator(".thumb .cell.ch").count() === 1, tag + ": a block changed since the last check is marked");
  await page.click("nav.rail button:has-text('Dashboard')");
  MODE.check = ["holds", "holds", "shaky", "holds", "holds", "holds", "holds"];
  await page.click("#engine");
  await page.waitForSelector(".dashpanel:not(.igniting) #headline");
  ok((await page.textContent("#headline")) === "1 amber light." && /v\s*0\s*2/.test(await page.textContent("#odo")), tag + ": a changed canvas saves version 2; one shaky reads 1 amber light");
  ok(/The Distribution/.test(await page.textContent("#changed")), tag + ": the dashboard lists what changed since the last check");
  ok(!(await page.isVisible("#route")), tag + ": Now plan the route only shows when clear");
  await page.waitForTimeout(950);
  await shot("09-amber");
  await page.click("#to-road");
  ok(await page.isVisible("#road-stale"), tag + ": an older road test says it's out of date");
  await page.click("nav.rail button:has-text('Dashboard')");

  // reload keeps everything
  await page.reload();
  ok((await page.textContent("#headline")) === "1 amber light." && (await page.evaluate(() => window.__ce.state().versions.length)) === 2, tag + ": reloading keeps the canvas, versions and result");

  // share link: read-only, no relay calls, no passcode
  await page.click("#share");
  await page.waitForSelector("#toast:not(.hidden)");
  const link = await page.evaluate(() => navigator.clipboard.readText());
  ok(/#s=z/.test(link), tag + ": Share copies a link with a compressed canvas after #");
  const ctx2 = await browser.newContext({ viewport: { width, height: 900 } });
  const p2 = await ctx2.newPage();
  const m2 = await mock(p2);
  await p2.goto(link);
  await p2.waitForSelector("#screen-view .dashpanel");
  ok((await p2.textContent("#headline")) === "1 amber light." && (await p2.locator("#pass").count()) === 0, tag + ": the link opens a read-only dashboard with no passcode box");
  await p2.click("#light-p3");
  ok(await p2.isVisible("#detail"), tag + ": lights open in the read-only view");
  await p2.waitForTimeout(950);
  await p2.screenshot({ path: outFile(`${tag}-10-shared.png`), fullPage: true });
  ok(m2.calls.length === 0 && (await p2.evaluate(() => localStorage.getItem("ce-state"))) === null, tag + ": viewing a link makes no relay calls and saves nothing");
  await p2.click("#make-mine");
  ok((await p2.locator("#pass").count()) === 1 && !p2.url().includes("#s="), tag + ": Make my own opens a fresh start screen");
  await ctx2.close();

  // red and can't-tell headlines
  MODE.check = ["holds", "breaks", "shaky", "holds", "holds", "holds", "holds"];
  await page.evaluate((m) => { const s = window.__ce.state(); Object.assign(s.nums, m); }, CANVASES[1].nums);
  await page.click("#engine");
  await page.waitForSelector(".dashpanel:not(.igniting) #headline");
  ok((await page.textContent("#headline")) === "3 red lights.", tag + ": two red from the AI plus the money check reads 3 red lights (code sets p7 and p5)");
  ok((await page.getAttribute("#light-p7", "data-status")) === "breaks", tag + ": the money light follows the numbers, not the AI");
  await page.waitForTimeout(950);
  await shot("11-red");
  MODE.check = ["cant_tell", "cant_tell", "cant_tell", "cant_tell", "cant_tell", "holds", "holds"];
  await page.evaluate(() => { const s = window.__ce.state(); for (const k of Object.keys(s.nums)) s.nums[k] = ""; s.blocks.cs = "Everyone."; s.blocks.kr = ""; });
  await page.click("#engine");
  await page.waitForSelector(".dashpanel:not(.igniting) #headline");
  const need = await page.textContent("#need");
  ok((await page.textContent("#headline")) === "Not enough to start yet." && /the numbers/.test(need) && /The Arsenal/.test(need), tag + ": vague blocks and no numbers read Not enough to start yet, naming what to add");
  await page.waitForTimeout(950);
  await shot("12-cant");

  // errors
  MODE.fail = "passcode_cap";
  await page.click("#engine");
  await page.waitForSelector("#err");
  ok(/today's limit/.test(await page.textContent("#err")), tag + ": a capped passcode gets a plain message");
  MODE.fail = "";

  ok(errors.length === 0, tag + ": no script errors" + (errors.length ? " (" + errors.join(" | ") + ")" : ""));
  ok(outside.length === 0, tag + ": the page talks only to the relay" + (outside.length ? " (" + outside.join(", ") + ")" : ""));
  await ctx.close();
}

await walk(390, "390");
await walk(1280, "1280");

// reduced motion: no blinking or sweeping during ignition
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await mock(page);
  MODE = { check: Array(7).fill("holds"), cv: CANVASES[0], fail: "" };
  await page.addInitScript((st) => { localStorage.setItem("ce-pass", "test-code-1234"); localStorage.setItem("ce-state", JSON.stringify(st)); }, { name: "Ladle Patrol", blocks: CANVASES[0].blocks, nums: CANVASES[0].nums, numsRead: true, screen: "dash" });
  await page.goto(PAGE);
  await page.click("#engine");
  await page.waitForSelector(".dashpanel.igniting");
  const anim = await page.$eval(".igniting .light .lamp .lc", (e) => getComputedStyle(e).animationName);
  ok(anim === "none", "reduced motion: the ignition lights don't blink");
  await page.waitForSelector(".dashpanel:not(.igniting) #headline");
  await ctx.close();
}

await browser.close(); srv.close();
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
