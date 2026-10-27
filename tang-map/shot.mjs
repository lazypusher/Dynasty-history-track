import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DIR = process.cwd();
const URL = pathToFileURL(path.join(DIR, "index.html")).href;
const PORT = 9335;
const PROFILE = path.join(DIR, ".chrome-test");
const OUT = path.join(DIR, "shots");
const sleep = ms => new Promise(r => setTimeout(r, ms));

fs.rmSync(PROFILE, { recursive: true, force: true });
const proc = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", "--hide-scrollbars",
  "--remote-debugging-port=" + PORT, "--user-data-dir=" + PROFILE, "--window-size=1280,980", URL], { stdio: "ignore" });

let ws;
try {
  await sleep(2200);
  const list = await (await fetch("http://127.0.0.1:" + PORT + "/json/list")).json();
  ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });
  let seq = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => { const id = ++seq; ws.send(JSON.stringify({ id, method, params })); return new Promise(r => pending.set(id, r)); };
  const ev = async e => (await send("Runtime.evaluate", { expression: e, returnByValue: true })).result?.result?.value;
  const shot = async name => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(OUT + "/" + name, Buffer.from(r.result.data, "base64"));
    console.log("saved", name);
  };
  await send("Page.enable");

  // 第五章
  await ev("document.getElementById('c5').scrollIntoView({block:'start'})");
  await sleep(600);
  await shot("chapter5.png");

  // 弹窗
  await ev("document.querySelectorAll('#c5 .it')[4].click()");
  await sleep(300);
  await shot("modal.png");
} finally {
  try { ws && ws.close(); } catch (e) {}
  proc.kill();
  await sleep(300);
  fs.rmSync(PROFILE, { recursive: true, force: true });
}
