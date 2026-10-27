import fs from "fs";

const html = fs.readFileSync("index.html", "utf8");
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error("no <script> found"); process.exit(1); }
const code = m[1];

// 1. syntax
try { new Function(code); console.log("syntax: OK  (" + code.length + " chars)"); }
catch (e) { console.error("SYNTAX ERROR: " + e.message); process.exit(1); }

// 2. data integrity
const head = code.split("const $ =")[0];
const { QB, EVENTS, CATS } = new Function(head + "; return {QB, EVENTS, CATS};")();
console.log("questions:", QB.length, " events:", EVENTS.length, " categories:", CATS.length);

let bad = 0;
QB.forEach((q, i) => {
  if (!Array.isArray(q.o) || q.o.length < 2 || q.o.length > 3) { console.error("Q" + i + " options out of range"); bad++; }
  if (typeof q.a !== "number" || q.a < 0 || q.a >= q.o.length) { console.error("Q" + i + " bad answer index"); bad++; }
  if (!q.q || !q.n || !q.s) { console.error("Q" + i + " missing q/n/s"); bad++; }
  if (new Set(q.o).size !== q.o.length) { console.error("Q" + i + " duplicate options"); bad++; }
});
const years = EVENTS.map(e => e.y);
if (new Set(years).size !== years.length) { console.error("duplicate event years"); bad++; }
if (years.some((y, i) => i && y <= years[i - 1])) { console.error("events not ascending"); bad++; }
CATS.forEach((c, i) => { if (!c.c || !Array.isArray(c.a) || c.a.length < 3) { console.error("CAT" + i + " bad"); bad++; } });

console.log(bad === 0 ? "data: OK" : "data: " + bad + " problem(s)");
process.exit(bad === 0 ? 0 : 1);
