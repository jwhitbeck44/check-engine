// Reads every string in docs/content.js: flags em or en dashes, and lists sentences over 15 words.
import fs from "node:fs";
global.window = {};
new Function(fs.readFileSync(new URL("../docs/content.js", import.meta.url), "utf8"))();
const strs = [];
(function walk(o, path) { if (typeof o === "string") strs.push([path, o]); else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, path + "." + k); })(window.CONTENT, "C");
let dashes = 0, long = [], words = 0, sents = 0;
for (const [p, s] of strs) {
  if (/[–—]/.test(s)) { dashes++; console.log("DASH", p, s); }
  if (/^https?:/.test(s)) continue;
  for (const t of s.split(/(?<=[.?!])\s+/)) { const n = (t.match(/\S+/g) || []).length; if (!n) continue; words += n; sents++; if (n > 15) long.push([n, p, t]); }
}
console.log(`${strs.length} strings, ${dashes} with dashes, ${sents} sentences, ${(words / sents).toFixed(1)} words per sentence on average`);
for (const [n, p, t] of long.sort((a, b) => b[0] - a[0])) console.log(`  ${n} words  ${p}: ${t}`);
