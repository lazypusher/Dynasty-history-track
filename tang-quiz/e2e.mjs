import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DIR = process.cwd();
const URL = pathToFileURL(path.join(DIR, "index.html")).href;
const PORT = 9333;
const PROFILE = path.join(DIR, ".chrome-test");
const sleep = ms => new Promise(r => setTimeout(r, ms));

fs.rmSync(PROFILE, { recursive: true, force: true });
const proc = spawn(CHROME, [
  "--headless=new", "--no-first-run", "--disable-gpu",
  "--remote-debugging-port=" + PORT,
  "--user-data-dir=" + PROFILE,
  "--window-size=820,900",
  URL
], { stdio: "ignore" });

const fail = [];
const ok = [];
const check = (name, cond, extra) => { (cond ? ok : fail).push(name + (cond ? "" : "  <<< " + JSON.stringify(extra))); };

let ws;
try {
  await sleep(2200);
  const list = await (await fetch("http://127.0.0.1:" + PORT + "/json/list")).json();
  const page = list.find(t => t.type === "page");
  if (!page) throw new Error("no page target");

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = e => rej(new Error("ws error")); });

  let seq = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push("console.error: " + JSON.stringify(m.params.args.map(a => a.value)));
  };
  const send = (method, params = {}) => {
    const id = ++seq;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise(res => pending.set(id, res));
  };
  const ev = async expr => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error("eval: " + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
    return r.result?.result?.value;
  };
  await send("Runtime.enable");

  /* ---- home ---- */
  check("home: 3 modes", await ev("document.querySelectorAll('.mode').length") === 3);

  /* ---- quiz ---- */
  await ev("document.querySelectorAll('.mode')[0].click()");
  await sleep(250);
  check("quiz: active", await ev("document.getElementById('quiz').classList.contains('active')"));
  check("quiz: has question text", (await ev("document.getElementById('qText').textContent")).length > 5);
  const optCount = await ev("document.querySelectorAll('.opt').length");
  check("quiz: 2-3 options", optCount >= 2 && optCount <= 3, optCount);

  const correctIdx = await ev("QUES.cur.a");
  await ev("document.querySelectorAll('.opt')[" + correctIdx + "].click()");
  await sleep(120);
  check("quiz: marks correct option", await ev("!!document.querySelector('.opt.ok')"));
  check("quiz: score > 0", await ev("QUES.score") > 0, await ev("QUES.score"));
  check("quiz: feedback has source", (await ev("document.getElementById('fb').textContent")).indexOf("《") >= 0);
  check("quiz: next enabled", await ev("document.getElementById('nextBtn').disabled === false"));

  await ev("document.getElementById('nextBtn').click()");
  await sleep(120);
  check("quiz: advanced", await ev("QUES.i") === 1);
  check("quiz: next disabled again", await ev("document.getElementById('nextBtn').disabled === true"));

  /* wrong answer path */
  const wrongIdx = (await ev("QUES.cur.a") + 1) % (await ev("document.querySelectorAll('.opt').length"));
  await ev("document.querySelectorAll('.opt')[" + wrongIdx + "].click()");
  await sleep(120);
  check("quiz: wrong recorded", await ev("QUES.wrong.length") === 1 || await ev("QUES.total") > 1);

  /* ---- timeline ---- */
  await ev("document.getElementById('quiz').classList.remove('active'); document.getElementById('home').classList.add('active');");
  await ev("document.querySelectorAll('.mode')[1].click()");
  await sleep(250);
  const slots = await ev("document.querySelectorAll('#tlRow .slot').length");
  check("timeline: 3 slots at start", slots === 3, slots);
  check("timeline: 2 placed", await ev("TL.placed.length") === 2);
  const right = await ev("(()=>{const y=TL.cur.y;let i=0;while(i<TL.placed.length&&TL.placed[i].y<y)i++;return i;})()");
  await ev("document.querySelectorAll('#tlRow .slot')[" + right + "].click()");
  await sleep(150);
  check("timeline: correct insert keeps 3 lives", await ev("TL.lives") === 3);
  check("timeline: placed grows", await ev("TL.placed.length") === 3);
  await sleep(700);
  check("timeline: next card served", await ev("TL.placed.length") === 3 && (await ev("TL.picked.length")) === 4, [await ev("TL.placed.length"), await ev("TL.picked.length")]);

  /* ---- assoc ---- */
  await ev("document.getElementById('timeline').classList.remove('active'); document.getElementById('home').classList.add('active');");
  await ev("document.querySelectorAll('.mode')[2].click()");
  await sleep(250);
  check("assoc: active", await ev("document.getElementById('assoc').classList.contains('active')"));
  await ev("(()=>{const i=document.getElementById('asInput');i.value='李白';i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()");
  await sleep(120);
  check("assoc: chip added", await ev("document.querySelectorAll('#asChips .chip').length") === 1);
  check("assoc: said tracked", await ev("AS.said.length") === 1);
  await ev("finishAssoc()");
  await sleep(150);
  check("assoc: reveal rendered", await ev("document.querySelectorAll('#asReveal .rv').length") > 0);
  check("assoc: hit counted", typeof (await ev("AS.hit")) === "number");

  /* ---- result ---- */
  await ev("document.getElementById('asDone').click()");
  await sleep(200);
  check("result: shown", await ev("document.getElementById('result').classList.contains('active')"));
  check("result: score text", (await ev("document.getElementById('resScore').textContent")).length > 0);

  check("no page errors", errors.length === 0, errors);

  console.log("PASS " + ok.length);
  ok.forEach(o => console.log("  ✓ " + o));
  if (fail.length) { console.log("FAIL " + fail.length); fail.forEach(f => console.log("  ✗ " + f)); }
  process.exitCode = fail.length ? 1 : 0;
} catch (e) {
  console.error("HARNESS ERROR:", e.message);
  process.exitCode = 2;
} finally {
  try { ws && ws.close(); } catch (e) {}
  proc.kill();
  await sleep(300);
  fs.rmSync(PROFILE, { recursive: true, force: true });
}
