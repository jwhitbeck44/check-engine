// Opens the live GitHub Pages site on a phone-size screen and checks the passcode box against the real relay.
// No AI calls. Reads the tester1 passcode from _local/passcodes.txt; never prints it.
import { chromium } from "playwright-core";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const URL_LIVE = "https://jwhitbeck44.github.io/check-engine/";
const CODE = fs.readFileSync(new URL("../_local/passcodes.txt", import.meta.url), "utf8").split(/\r?\n/).find((l) => l.startsWith("tester1="))?.split("=")[1];
const b = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
const r = await p.goto(URL_LIVE + "?t=" + Date.now());
console.log("status", r.status());
await p.fill("#pass", CODE); await p.press("#pass", "Tab");
await p.waitForFunction(() => document.getElementById("pass-msg").textContent.length > 0, null, { timeout: 15000 });
console.log("passcode message:", await p.textContent("#pass-msg"));
await p.screenshot({ path: fileURLToPath(new URL("../_local/live-start-390.png", import.meta.url)) });
console.log("script errors:", errs.length ? errs : "none");
await b.close();
