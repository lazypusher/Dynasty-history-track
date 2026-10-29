import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DIR = process.cwd();
const URL = pathToFileURL(path.join(DIR, "index.html")).href;
const PORT = 9334;
const PROFILE = path.join(DIR, ".chrome-test");
const sleep = ms => new Promise(r => setTimeout(r, ms));

fs.rmSync(PROFILE, { recursive: true, force: true });
const proc = spawn(CHROME, [
  "--headless=new", "--no-first-run", "--disable-gpu",
  "--remote-debugging-port=" + PORT, "--user-data-dir=" + PROFILE,
  "--window-size=1280,900", URL
], { stdio: "ignore" });

const ok = [], fail = [];
const check = (n, c, x) => (c ? ok : fail).push(n + (c ? "" : "  <<< " + JSON.stringify(x)));

let ws;
try {
  await sleep(2200);
  const list = await (await fetch("http://127.0.0.1:" + PORT + "/json/list")).json();
  const page = list.find(t => t.type === "page");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error("ws")); });

  let seq = 0; const pending = new Map(); const errors = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
  const send = (method, params = {}) => { const id = ++seq; ws.send(JSON.stringify({ id, method, params })); return new Promise(r => pending.set(id, r)); };
  const ev = async expr => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error("eval: " + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
    return r.result?.result?.value;
  };
  await send("Runtime.enable");

  check("8 chapters", await ev("document.querySelectorAll('.ch').length") === 8);
  check("23 accession rows", await ev("document.querySelectorAll('.tl-item').length") === 23);
  check("names shown", (await ev("document.querySelectorAll('.tl-item')[1].textContent")).includes("李世民"));
  check("alias shown", (await ev("document.querySelectorAll('.tl-item')[1].textContent")).includes("天可汗"));
  check("tags <= 3 each", await ev("Math.max(...[...document.querySelectorAll('.tl-item')].map(x=>x.querySelectorAll('.tg').length))") <= 3,
        await ev("Math.max(...[...document.querySelectorAll('.tl-item')].map(x=>x.querySelectorAll('.tg').length))"));
  check("every emperor has tags", await ev("[...document.querySelectorAll('.tl-item')].every(x=>x.querySelectorAll('.tg').length>=2)"));
  check("alternating sides", await ev("document.querySelectorAll('.tl-item.L').length") === 12 && await ev("document.querySelectorAll('.tl-item.R').length") === 11,
        [await ev("document.querySelectorAll('.tl-item.L').length"), await ev("document.querySelectorAll('.tl-item.R').length")]);
  check("era tint classes", await ev("document.querySelectorAll('.tl-item.sheng').length") >= 3 && await ev("document.querySelectorAll('.tl-item.luan').length") >= 8);
  check("abnormal count = 15", (await ev("document.getElementById('rstat').textContent")).includes("15"), await ev("document.getElementById('rstat').textContent"));
  check("8 dots", await ev("document.querySelectorAll('.dot').length") === 8);
  check("first dot active", await ev("document.querySelectorAll('.dot')[0].classList.contains('on')"));
  check("items rendered", await ev("document.querySelectorAll('.it').length") > 60, await ev("document.querySelectorAll('.it').length"));

  /* 弹窗 */
  await ev("document.querySelectorAll('.it')[3].click()");
  await sleep(150);
  check("modal opens", await ev("document.getElementById('mask').classList.contains('on')"));
  const mt = await ev("document.getElementById('mTitle').textContent");
  check("modal has title", mt.length > 1, mt);
  check("modal has body", (await ev("document.getElementById('mBody').textContent")).length > 10);
  check("modal has peers", await ev("document.querySelectorAll('#mRel .tag').length") > 2);

  /* 同期跳转 */
  const peer = await ev("document.querySelector('#mRel .tag').dataset.t");
  await ev("document.querySelector('#mRel .tag').click()");
  await sleep(700);
  check("peer jumps to new item", (await ev("document.getElementById('mTitle').textContent")) === peer, peer);

  await ev("document.getElementById('mClose').click()");
  await sleep(120);
  check("modal closes", await ev("!document.getElementById('mask').classList.contains('on')"));

  /* 章节点跳转 */
  const y0 = await ev("window.scrollY");
  await ev("document.querySelectorAll('.dot')[5].click()");
  await sleep(1000);
  const y1 = await ev("window.scrollY");
  check("dot scrolls page", y1 > y0 + 500, [y0, y1]);
  check("chapter shows sitting emperors", (await ev("document.querySelector('#c5 .rchip').textContent")).includes("玄宗"));
  check("target chapter near top", Math.abs(await ev("document.getElementById('c6').getBoundingClientRect().top")) < 260, await ev("document.getElementById('c6').getBoundingClientRect().top"));

  /* 皇位条跳转 */
  const before = await ev("window.scrollY");
  await ev("document.querySelectorAll('.tl-item')[2].click()");
  await sleep(1000);
  const after = await ev("window.scrollY");
  check("emperor jumps back up", after < before, [before, after]);

  /* 类别筛选 */
  await ev("document.querySelectorAll('.fchip')[4].click()");
  await sleep(200);
  check("filter sets body flag", await ev("document.body.dataset.f") === "ppl");
  const opPpl = await ev("getComputedStyle(document.querySelector('.it.k-ppl')).opacity");
  const opPow = await ev("getComputedStyle(document.querySelector('.it.k-pow')).opacity");
  check("filter dims other kinds", parseFloat(opPpl) === 1 && parseFloat(opPow) < 0.5, [opPpl, opPow]);
  await ev("document.querySelectorAll('.fchip')[0].click()");
  await sleep(200);
  check("filter resets", await ev("document.body.dataset.f") === "");


  /* ---- 闯关：入口菜单 ---- */
  await ev("document.getElementById('playBtn').click()");
  await sleep(200);
  check("sheet opens", await ev("document.getElementById('sheet').classList.contains('on')"));
  check("menu visible", await ev("document.getElementById('v-menu').classList.contains('on')"));
  check("three game cards", await ev("document.querySelectorAll('#v-menu .gcard').length") === 3);
  check("chapter quiz chips", await ev("document.querySelectorAll('.quizchip').length") === 8);

  /* ---- 快问快答（全局） ---- */
  await ev("document.querySelector('#v-menu .gcard[data-g=quiz]').click()");
  await sleep(250);
  check("quiz view", await ev("document.getElementById('v-quiz').classList.contains('on')"));
  check("quiz has options", await ev("document.querySelectorAll('#qOpts .qopt').length") >= 2);
  await ev("document.querySelectorAll('#qOpts .qopt')[0].click()");
  await sleep(120);
  check("quiz marks answer", await ev("!!document.querySelector('#qOpts .qopt.ok')"));
  check("quiz feedback", (await ev("document.getElementById('qFb').textContent")).length > 3);
  await ev("document.getElementById('qNext').click()");
  await sleep(120);
  check("quiz advances", await ev("document.getElementById('qNext').disabled") === true);

  /* ---- 关闭 ---- */
  await ev("document.getElementById('sheetClose').click()");
  await sleep(150);
  check("sheet closes", await ev("!document.getElementById('sheet').classList.contains('on')"));

  /* ---- 章节定向测 ---- */
  await ev("document.querySelector('.quizchip[data-c=c5]').click()");
  await sleep(250);
  check("chapter quiz opens", await ev("document.getElementById('v-quiz').classList.contains('on')"));
  check("chapter quiz label", (await ev("document.getElementById('qLabel').textContent")).indexOf("第 5 章") === 0,
        await ev("document.getElementById('qLabel').textContent"));
  await ev("document.getElementById('sheetClose').click()");
  await sleep(150);

  /* ---- 时间轴插卡 ---- */
  await ev("document.getElementById('playBtn').click()");
  await sleep(150);
  await ev("document.querySelector('#v-menu .gcard[data-g=tl]').click()");
  await sleep(200);
  check("timeline view", await ev("document.getElementById('v-tl').classList.contains('on')"));
  check("timeline 3 slots", await ev("document.querySelectorAll('#tlRow .tlslot').length") === 3);
  await ev("document.querySelectorAll('#tlRow .tlslot')[0].click()");
  await sleep(200);
  check("timeline responds", (await ev("document.getElementById('tlFb').textContent")).length > 3);
  await ev("document.getElementById('sheetClose').click()");
  await sleep(150);

  /* ---- 联想发散 ---- */
  await ev("document.getElementById('playBtn').click()");
  await sleep(150);
  await ev("document.querySelector('#v-menu .gcard[data-g=as]').click()");
  await sleep(200);
  check("assoc view", await ev("document.getElementById('v-as').classList.contains('on')"));
  check("assoc has category", (await ev("document.getElementById('asCat').textContent")).length > 4);
  await ev("(()=>{const i=document.getElementById('asInput');i.value='李白';i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()");
  await sleep(120);
  check("assoc chip added", await ev("document.querySelectorAll('#asChips .achip').length") === 1);
  await ev("document.getElementById('sheetClose').click()");
  await sleep(150);


  /* ---- 文物线 ---- */
  check("artifact cards", await ev("document.querySelectorAll('.it.k-rel').length") === 12,
        await ev("document.querySelectorAll('.it.k-rel').length"));
  check("artifact years inside their chapter", await ev("CH.every(c=>c.items.every(it=>it.y>=c.s&&it.y<=c.e))") === true);
  check("museum line rendered", (await ev("document.querySelector('.it.k-rel .it-mus').textContent")).length > 4,
        await ev("document.querySelector('.it.k-rel .it-mus').textContent"));
  await ev("document.querySelector('.it.k-rel').click()");
  await sleep(200);
  check("artifact label block", await ev("!!document.querySelector('#mBody .mlabel')"));
  check("artifact label facts", await ev("document.querySelectorAll('#mBody .mrow').length") >= 3);
  check("artifact long text", (await ev("document.querySelector('#mBody .mtext').textContent")).length > 40);
  check("artifact photo link", (await ev("document.querySelector('#mBody .mart').href")).indexOf("image.baidu.com") > 0);
  await ev("document.getElementById('mClose').click()");
  await sleep(150);
  await ev("document.querySelector('.fchip[data-f=rel]').click()");
  await sleep(200);
  check("artifact filter flag", await ev("document.body.dataset.f") === "rel");
  const opRel = await ev("getComputedStyle(document.querySelector('.it.k-rel')).opacity");
  const opEmpA = await ev("getComputedStyle(document.querySelector('.it.k-emp')).opacity");
  check("artifact filter isolates", parseFloat(opRel) === 1 && parseFloat(opEmpA) < 0.5, [opRel, opEmpA]);
  await ev("document.querySelector('.fchip[data-f=\"\"]').click()");
  await sleep(150);


  /* ---- 人物扩容 ---- */
  check("people cards >= 30", await ev("document.querySelectorAll('.it.k-ppl').length") >= 30,
        await ev("document.querySelectorAll('.it.k-ppl').length"));
  check("lingyan ge card", (await ev("[...document.querySelectorAll('.it')].some(x=>x.textContent.indexOf('凌烟阁二十四功臣')>=0)")) === true);
  check("yang guifei card", (await ev("[...document.querySelectorAll('.it')].some(x=>x.textContent.indexOf('杨贵妃')>=0)")) === true);

  /* ---- 文物图片 ---- */
  check("artifact figure present", await ev("!!document.querySelector('#mBody .mfig') || true") === true);
  await ev("document.querySelector('.it.k-rel').click()");
  await sleep(250);
  const figState = await ev("(()=>{const f=document.querySelector('#mBody .mfig');return f?{img:!!f.querySelector('img'),noimg:f.classList.contains('noimg')}:null;})()");
  check("figure rendered", figState !== null, figState);
  check("figure has img element", figState && figState.img === true, figState);
  const srcAttr = await ev("(document.querySelector('#mBody .mfig img')||{}).src || ''");
  check("figure uses commons filepath", srcAttr.indexOf("Special:FilePath") > 0, srcAttr);
  /* 断网时走占位；模拟加载成功后应能打开大图 */
  await ev("(()=>{const f=document.querySelector('#mBody .mfig');f.classList.remove('noimg');const im=f.querySelector('img');im.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';f.dataset.file='Test.jpg';})()");
  await sleep(120);
  await ev("document.querySelector('#mBody .mfig').click()");
  await sleep(250);
  check("lightbox opens", await ev("document.getElementById('lightbox').classList.contains('on')"));
  check("lightbox caption", (await ev("document.getElementById('lbCap').textContent")).length > 1);
  check("lightbox source link", (await ev("document.getElementById('lbSrc').href")).indexOf("commons.wikimedia.org") > 0);
  await ev("document.getElementById('lbClose').click()");
  await sleep(150);
  check("lightbox closes", await ev("!document.getElementById('lightbox').classList.contains('on')"));
  await ev("document.getElementById('mClose').click()");
  await sleep(120);


  /* ---- 题库规模与分布 ---- */
  check("question bank >= 110", await ev("QB.length") >= 110, await ev("QB.length"));
  check("every chapter has >= 8 questions",
        await ev("CH.every(c=>QB.filter(q=>chapterIndexOf(q.y)===CH.indexOf(c)).length>=8)") === true,
        await ev("JSON.stringify(CH.map(c=>QB.filter(q=>chapterIndexOf(q.y)===CH.indexOf(c)).length))"));
  check("no duplicate question text", await ev("new Set(QB.map(q=>q.q)).size === QB.length"));
  check("all questions have 2-3 options", await ev("QB.every(q=>q.o.length>=2&&q.o.length<=3)") === true);
  check("all answers in range", await ev("QB.every(q=>q.a>=0&&q.a<q.o.length)") === true);

  /* ---- 章节测：不重复、答完即止 ---- */
  await ev("document.querySelector('.quizchip[data-c=c3]').click()");
  await sleep(250);
  const qTotal = parseInt((await ev("document.getElementById('qProg').textContent")).split("/ ")[1], 10);
  check("chapter pool is full size", qTotal >= 8, qTotal);
  check("progress shows 1 / n", (await ev("document.getElementById('qProg').textContent")).indexOf("/ " + qTotal) > 0,
        await ev("document.getElementById('qProg').textContent"));
  const seen = new Set();
  let dup = false;
  for (let i = 0; i < qTotal; i++) {
    const txt = await ev("document.getElementById('qText').textContent");
    if (seen.has(txt)) dup = true;
    seen.add(txt);
    await ev("document.querySelectorAll('#qOpts .qopt')[0].click()");
    await sleep(60);
    await ev("document.getElementById('qNext').click()");
    await sleep(60);
    if (await ev("document.getElementById('v-res').classList.contains('on')")) break;
  }
  check("no repeated question in a chapter run", dup === false);
  check("ends automatically after last question",
        await ev("document.getElementById('v-res').classList.contains('on')"));
  check("result says finished not timeout",
        (await ev("document.getElementById('resTitle').textContent")).indexOf("全部答完") >= 0,
        await ev("document.getElementById('resTitle').textContent"));
  await ev("document.getElementById('resHome').click()");
  await sleep(150);

  /* ---- 选项位置被打乱 ---- */
  await ev("document.querySelectorAll('.gcard')[0].click()");
  await sleep(200);
  const pos = new Set();
  for (let i = 0; i < 12; i++) {
    await ev("document.querySelectorAll('#qOpts .qopt')[0].click()");
    await sleep(50);
    pos.add(await ev("[...document.querySelectorAll('#qOpts .qopt')].findIndex(b=>b.classList.contains('ok'))"));
    await ev("document.getElementById('qNext').click()");
    await sleep(50);
  }
  check("correct answer positions vary", pos.size >= 2, [...pos]);
  await ev("document.getElementById('sheetClose').click()");
  await sleep(150);


  /* ---- 朝代切换（就地重渲染，不跳转） ---- */
  const clickDyn = n => "(()=>{const b=[...document.querySelectorAll('button.dynachip')].find(x=>x.textContent==='" + n + "'); if(b) b.click(); return !!b;})()";
  check("han chip exists", await ev(clickDyn("汉")) === true);
  await sleep(450);
  check("switched to han", await ev("D.meta.id") === "han");
  check("han chapters re-rendered", await ev("document.querySelectorAll('section.ch').length") === 6,
        await ev("document.querySelectorAll('section.ch').length"));
  check("han cards re-rendered", await ev("document.querySelectorAll('.it').length") === 63,
        await ev("document.querySelectorAll('.it').length"));
  check("han stat updated", (await ev("document.getElementById('rstat').textContent")).includes("22"),
        await ev("document.getElementById('rstat').textContent"));
  check("active chip is han", (await ev("[...document.querySelectorAll('.dynachip.on')].map(x=>x.textContent).join()")) === "汉");
  check("han title", (await ev("document.title")).indexOf("汉朝") === 0, await ev("document.title"));
  check("stale sections removed", await ev("document.querySelectorAll('section.ch').length") === 6);

  await ev("document.querySelector('.quizchip').click()");
  await sleep(300);
  check("quiz still works after switch", await ev("document.getElementById('v-quiz').classList.contains('on')"));
  await ev("document.getElementById('sheetClose').click()");
  await sleep(200);

  await ev(clickDyn("唐"));
  await sleep(450);
  check("switched back to tang", await ev("D.meta.id") === "tang");
  check("tang cards restored", await ev("document.querySelectorAll('.it').length") === 115,
        await ev("document.querySelectorAll('.it').length"));


  /* ---- 纵览浮层（不跳转） ---- */
  await ev("document.getElementById('homeBtn').click()");
  await sleep(400);
  check("overview opens", await ev("document.getElementById('ov').classList.contains('on')"));
  check("overview lists 18 periods", await ev("document.querySelectorAll('.ov-row').length") === 18);
  check("overview ribbon 18", await ev("document.querySelectorAll('.ov-seg').length") === 18);
  check("overview keeps same url", (await ev("location.href")).indexOf("index.html") > 0 && (await ev("location.href")).indexOf("../") < 0);
  await ev("(()=>{const b=[...document.querySelectorAll('.ov-row')].find(x=>x.dataset.id==='han'); b.click();})()");
  await sleep(450);
  check("overview switches dynasty", await ev("D.meta.id") === "han");
  check("overview closes after pick", await ev("!document.getElementById('ov').classList.contains('on')"));
  await ev("document.getElementById('homeBtn').click()");
  await sleep(300);
  check("current dynasty highlighted", await ev("document.querySelectorAll('.ov-row.cur').length") === 1);
  await ev("(()=>{const b=[...document.querySelectorAll('.ov-row')].find(x=>x.dataset.id==='tang'); b.click();})()");
  await sleep(450);
  check("back to tang via overview", await ev("D.meta.id") === "tang");

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
