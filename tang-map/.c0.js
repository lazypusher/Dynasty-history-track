
/* ============================================================
   闯关：快问快答 / 时间轴插卡 / 联想发散
   ============================================================ */
(function () {
  const qs = s => document.querySelector(s);
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  const sheet = qs("#sheet");
  const VIEWS = ["menu", "quiz", "tl", "as", "res"];
  const S = { timer: null, chapter: null, replay: null };

  const TITLES = { menu: "闯关", quiz: "快问快答", tl: "时间轴插卡", as: "联想发散", res: "本局结果" };
  const show = v => { VIEWS.forEach(x => qs("#v-" + x).classList.toggle("on", x === v)); qs("#vTitle").textContent = TITLES[v]; };
  function open() { sheet.classList.add("on"); document.body.style.overflow = "hidden"; }
  function close() { sheet.classList.remove("on"); document.body.style.overflow = ""; stop(); show("menu"); }
  function stop() { if (S.timer) { clearInterval(S.timer); S.timer = null; } }
  function tick(fn) { stop(); S.timer = setInterval(fn, 100); }

  qs("#bankSize").textContent = QB.length;
  qs("#playBtn").onclick = () => { open(); show("menu"); };
  qs("#sheetClose").onclick = close;
  qs("#resHome").onclick = close;
  document.addEventListener("keydown", e => { if (e.key === "Escape" && sheet.classList.contains("on")) close(); });

  qs("#v-menu").addEventListener("click", e => {
    const b = e.target.closest(".gcard");
    if (!b) return;
    if (b.dataset.g === "quiz") runQuiz(QB, 60, "全部 " + QB.length + " 题");
    if (b.dataset.g === "tl") runTl();
    if (b.dataset.g === "as") runAs();
    if (b.dataset.g === "all") runAll();
  });

  qs("#chapters").addEventListener("click", e => {
    const b = e.target.closest(".quizchip");
    if (!b) return;
    const ci = CH.findIndex(c => c.id === b.dataset.c);
    const list = QB.filter(q => chapterIndexOf(q.y) === ci);
    open();
    const pool = list.length >= 3 ? list : QB;
    runQuiz(pool, Math.max(45, Math.round(pool.length * 6)), "第 " + (ci + 1) + " 章 · " + CH[ci].y);
  });

  /* ---------------- 快问快答 ---------------- */
  const Q = { list: [], i: 0, score: 0, combo: 0, right: 0, total: 0, wrong: [], locked: false, left: 60, span: 60 };

  function prepareQs(list) {
    return shuffle(list).map(q => {
      const order = shuffle(q.o.map((t, i) => i));
      return { y: q.y, q: q.q, n: q.n, s: q.s, dyn: q.dyn, dname: q.dname,
        o: order.map(i => q.o[i]), a: order.indexOf(q.a) };
    });
  }

  function runQuiz(list, seconds, label, title) {
    Q.list = prepareQs(list); Q.i = 0; Q.score = 0; Q.combo = 0; Q.right = 0; Q.total = 0;
    Q.title = title || "快问快答";
    Q.wrong = []; Q.locked = false; Q.left = seconds; Q.span = seconds;
    qs("#qLabel").textContent = label;
    qs("#qTime").textContent = seconds + "s";
    qs("#qScore").textContent = "0";
    qs("#qCombo").classList.remove("on");
    qs("#qBar i").style.width = "100%";
    show("quiz");
    paintQ();
    tick(() => {
      Q.left -= 0.1;
      if (Q.left <= 0) { Q.left = 0; finishQuiz(); return; }
      qs("#qBar i").style.width = (Q.left / Q.span * 100) + "%";
      qs("#qTime").textContent = Math.ceil(Q.left) + "s";
    });
    S.replay = () => runQuiz(list, seconds, label, title);
  }

  function paintQ() {
    const q = Q.list[Math.min(Q.i, Q.list.length - 1)];
    Q.cur = q;
    qs("#qText").textContent = q.q;
    qs("#qFb").innerHTML = "";
    qs("#qNext").disabled = true;
    qs("#qNext").textContent = "下一题";
    qs("#qProg").textContent = (Q.i + 1) + " / " + Q.list.length;
    const box = qs("#qOpts");
    box.innerHTML = "";
    q.o.forEach((t, i) => {
      const b = document.createElement("button");
      b.className = "qopt";
      b.innerHTML = '<span class="k">' + (i + 1) + "</span><span>" + t + "</span>";
      b.onclick = () => answerQ(i);
      box.appendChild(b);
    });
    Q.locked = false;
  }

  function answerQ(i) {
    if (Q.locked) return;
    Q.locked = true;
    const q = Q.cur, btns = Array.prototype.slice.call(qs("#qOpts").children);
    btns.forEach(b => b.disabled = true);
    btns[q.a].classList.add("ok");
    Q.total++;
    if (i === q.a) {
      Q.right++; Q.combo++;
      Q.score += 10 + Math.min(Q.combo - 1, 5) * 2;
      qs("#qScore").textContent = Q.score;
      if (Q.combo > 1) { qs("#qCombo").textContent = "连击 ×" + Q.combo; qs("#qCombo").classList.add("on"); }
      qs("#qFb").innerHTML = "<b>对。</b>" + q.n + '<span class="qsrc">' + q.s + "</span>" +
        (q.dname ? '<span class="qdyn">' + q.dname + "</span>" : "");
    } else {
      btns[i].classList.add("bad");
      Q.combo = 0; qs("#qCombo").classList.remove("on");
      Q.wrong.push({ q: q.q, a: q.o[q.a], n: q.n, s: q.s, y: q.y, dyn: q.dyn, dname: q.dname });
      qs("#qFb").innerHTML = "<b>错。</b>正解「" + q.o[q.a] + "」。" + q.n + '<span class="qsrc">' + q.s + "</span>" +
        (q.dname ? '<span class="qdyn">' + q.dname + "</span>" : "");
    }
    qs("#qNext").disabled = false;
  }

  qs("#qNext").onclick = () => {
    if (qs("#qNext").disabled) return;
    Q.i++;
    if (Q.left <= 0 || Q.i >= Q.list.length) { finishQuiz(); return; }
    paintQ();
  };

  document.addEventListener("keydown", e => {
    if (!sheet.classList.contains("on") || !qs("#v-quiz").classList.contains("on")) return;
    if (e.key >= "1" && e.key <= "3") {
      const b = qs("#qOpts").children[Number(e.key) - 1];
      if (b && !b.disabled) b.click();
    } else if (e.key === "Enter") { e.preventDefault(); qs("#qNext").click(); }
  });

  function finishQuiz() {
    stop();
    if (Q.total === 0) { show("menu"); return; }
    const acc = Math.round(Q.right / Q.total * 100);
    const done = Q.i >= Q.list.length;
    showResult((Q.title || "快问快答") + " · " + (done ? "全部答完" : "时间到"), Q.score,
      "答对 " + Q.right + " / " + Q.total, "正确率 " + acc + "%", Q.wrong, S.replay);
  }

  /* ---------------- 通史卷（跨朝代） ---------------- */
  function runAll() {
    const ids = Object.keys(DY).filter(k => DY[k] && DY[k].questions && DY[k].questions.length);
    const picks = shuffle(ids).slice(0, 12);
    const pool = picks.map(id => {
      const list = DY[id].questions;
      const q = list[Math.floor(Math.random() * list.length)];
      return Object.assign({}, q, { dyn: id, dname: DY[id].meta.name });
    });
    runQuiz(pool, Math.max(60, pool.length * 6), "通史卷 · " + pool.length + " 个时期", "通史卷");
    S.replay = runAll;
  }

  qs("#resReview").addEventListener("click", e => {
    const b = e.target.closest(".rgo");
    if (!b) return;
    const id = b.dataset.d, y = +b.dataset.y;
    close();
    if (D && D.meta.id !== id) switchTo(id);
    setTimeout(() => goChapter(chapterIndexOf(y)), 120);
  });

  /* ---------------- 时间轴插卡 ---------------- */
  const T = { placed: [], picked: [], cur: null, lives: 3, locked: false };

  function runTl() {
    stop();
    const pool = shuffle(EVENTS).slice(0, 8);
    T.placed = pool.slice(0, 2).sort((a, b) => a.y - b.y);
    T.picked = pool.slice(2);
    T.lives = 3; T.locked = false;
    qs("#tlLives").textContent = "❤❤❤";
    qs("#tlFb").textContent = "";
    show("tl");
    nextTl();
    S.replay = runTl;
  }

  function nextTl() {
    if (!T.picked.length) { finishTl(); return; }
    T.cur = T.picked.shift();
    T.locked = false;
    qs("#tlCard").textContent = T.cur.t;
    qs("#tlFb").textContent = "";
    paintTl();
  }

  function paintTl() {
    const row = qs("#tlRow");
    row.innerHTML = "";
    for (let i = 0; i <= T.placed.length; i++) {
      const b = document.createElement("button");
      b.className = "tlslot";
      b.textContent = "插在这里";
      b.onclick = () => placeTl(i);
      row.appendChild(b);
      if (i < T.placed.length) {
        const d = document.createElement("div");
        d.className = "tlitem";
        d.innerHTML = '<span class="yy">' + fy(T.placed[i].y) + "</span><span>" + T.placed[i].t + "</span>";
        row.appendChild(d);
      }
    }
  }

  function placeTl(i) {
    if (T.locked) return;
    const y = T.cur.y;
    const okL = i === 0 || T.placed[i - 1].y < y;
    const okR = i === T.placed.length || y < T.placed[i].y;
    T.locked = true;
    if (okL && okR) {
      T.placed.splice(i, 0, T.cur);
      qs("#tlFb").innerHTML = "<b>对。</b>" + fy(y) + " 年，位置正好。";
      paintTl();
      setTimeout(nextTl, 520);
      return;
    }
    T.lives--;
    qs("#tlLives").textContent = "❤".repeat(Math.max(T.lives, 0)) + "♡".repeat(Math.max(3 - T.lives, 0));
    let r = 0;
    while (r < T.placed.length && T.placed[r].y < y) r++;
    qs("#tlFb").innerHTML = "<b>错。</b>它应该插在第 " + (r + 1) + " 个空位（" + fy(y) + " 年），已帮你放好。";
    T.placed.splice(r, 0, T.cur);
    paintTl();
    if (T.lives <= 0) { setTimeout(finishTl, 900); return; }
    setTimeout(nextTl, 900);
  }

  function finishTl() {
    stop();
    const perfect = T.lives === 3;
    showResult(perfect ? "时间轴 · 全部插对" : "时间轴 · 完成", Math.max(0, T.lives) * 100 + T.placed.length * 10,
      "插对 " + T.placed.length + " 张", "剩余生命 " + Math.max(T.lives, 0), [], S.replay);
  }

  /* ---------------- 联想发散 ---------------- */
  const A = { cat: null, left: 45, said: [], done: false, hit: 0 };

  function runAs() {
    stop();
    A.cat = CATS[Math.floor(Math.random() * CATS.length)];
    A.left = 45; A.said = []; A.done = false; A.hit = 0;
    qs("#asCat").textContent = A.cat.c;
    qs("#asTime").textContent = "45s";
    qs("#asBar").style.width = "100%";
    qs("#asChips").innerHTML = "";
    qs("#asReveal").innerHTML = "";
    qs("#asFb").textContent = "想到就写，回车提交；写错不扣分。";
    qs("#asDone").style.display = "none";
    const inp = qs("#asInput");
    inp.value = ""; inp.disabled = false;
    show("as");
    setTimeout(() => inp.focus(), 60);
    tick(() => {
      A.left -= 0.1;
      qs("#asTime").textContent = Math.ceil(Math.max(0, A.left)) + "s";
      qs("#asBar").style.width = (Math.max(0, A.left) / 45 * 100) + "%";
      if (A.left <= 0) finishAs();
    });
    S.replay = runAs;
  }

  const norm = t => t.replace(/[\s，。、,.;；:：()（）·"“”'‘’]/g, "");

  function addChip() {
    if (A.done) return;
    const inp = qs("#asInput");
    const v = inp.value.trim();
    if (!v) return;
    if (!A.said.some(x => norm(x) === norm(v))) {
      A.said.push(v);
      const c = document.createElement("span");
      c.className = "achip";
      c.textContent = v;
      qs("#asChips").appendChild(c);
    }
    inp.value = "";
  }

  qs("#asInput").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addChip(); } });

  function finishAs() {
    if (A.done) return;
    A.done = true;
    stop();
    qs("#asInput").disabled = true;
    const used = new Set();
    const rows = [];
    let hit = 0;
    A.cat.a.forEach(ans => {
      const idx = A.said.findIndex((s, i) => !used.has(i) && (norm(ans).indexOf(norm(s)) >= 0 || norm(s).indexOf(norm(ans)) >= 0));
      if (idx >= 0) { used.add(idx); hit++; rows.push({ t: ans, ok: true }); }
      else rows.push({ t: ans, ok: false });
    });
    A.hit = hit;
    qs("#asReveal").innerHTML = '<div class="rlabel">参考答案 · 命中 ' + hit + " / " + A.cat.a.length + "</div>" +
      rows.map(r => '<div class="rv ' + (r.ok ? "hit" : "") + '"><span class="d"></span><span>' + r.t + "</span></div>").join("");
    qs("#asFb").innerHTML = "你写了 <b>" + A.said.length + "</b> 个，其中 <b>" + hit + "</b> 个在参考答案里。";
    qs("#asDone").style.display = "block";
    S.replay = runAs;
  }

  qs("#asDone").onclick = () => {
    showResult("联想发散 · 命中 " + A.hit, A.hit * 10 + A.said.length * 2,
      "命中 " + A.hit + " / " + A.cat.a.length, "共写 " + A.said.length + " 个", [], S.replay);
  };

  /* ---------------- 结果 ---------------- */
  function showResult(title, score, s1, s2, wrong, again) {
    qs("#resTitle").textContent = title;
    qs("#resScore").textContent = score;
    qs("#resStats").innerHTML = "<span>" + s1 + "</span><span>" + s2 + "</span>";
    qs("#resReview").innerHTML = wrong && wrong.length
      ? '<div class="rlabel">错题回顾</div>' + wrong.map(w =>
          '<div class="ritem"><div class="rq">' + w.q + '</div><div class="ra">✓ ' + w.a + "</div>" +
          '<div class="rn">' + w.n + ' <span class="qsrc">' + w.s + "</span></div>" +
          (w.dyn ? '<button class="rgo" data-d="' + w.dyn + '" data-y="' + w.y + '">去' + w.dname + "看这一节 →</button>" : "") +
          "</div>").join("")
      : "";
    qs("#resAgain").onclick = again || (() => show("menu"));
    show("res");
  }
})();

/* ============================================================
   史官 · 页面助手（接 OpenAI 兼容接口，默认 DeepSeek）
   ============================================================ */
(function () {
  const q = s => document.querySelector(s);
  const LS = "dshchat.cfg";
  const DEF = { key: "", base: "https://api.deepseek.com", model: "deepseek-chat" };
  let cfg = Object.assign({}, DEF);
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(LS) || "{}")); } catch (e) {}
  if (window.CHAT_CONFIG) Object.assign(cfg, window.CHAT_CONFIG);

  let hist = [];
  let busy = false;

  /* ---------- 持久化 ---------- */
  const LS_HIST = "dshchat.hist";
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { try { return sessionStorage.getItem(k); } catch (e2) { return null; } } },
    set(k, v) {
      try { localStorage.setItem(k, v); return true; }
      catch (e) { try { sessionStorage.setItem(k, v); return false; } catch (e2) { return false; } }
    },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} try { sessionStorage.removeItem(k); } catch (e) {} }
  };
  function loadHist() {
    try {
      const a = JSON.parse(store.get(LS_HIST) || "[]");
      if (Array.isArray(a)) hist = a.filter(m => m && m.role && typeof m.content === "string").slice(-40);
    } catch (e) { hist = []; }
  }
  function saveHist() {
    try {
      const keep = hist.slice(-40).map(m => ({ role: m.role, content: m.content, ts: m.ts }));
      store.set(LS_HIST, JSON.stringify(keep));
    } catch (e) {}
  }
  function dayLabel(ts) {
    if (!ts) return "";
    const d = new Date(ts), n = new Date();
    const same = d.toDateString() === n.toDateString();
    return same ? "今天" : (d.getMonth() + 1) + "月" + d.getDate() + "日";
  }

  const DYN_IDS = "xia,shang,zhou,chunqiu,zhanguo,qin,han,sanguo,jin,sui,tang,wudai,song,liao,jin2,yuan,ming,qing";
  const SYS = () => [
    "你是「史官」，一个嵌在《中国朝代史》学习站里的历史助手。",
    "规则：用中文回答；简洁准确；先结论后依据；只讲有可靠记载的史实，不确定就直说不知道，不要编造年份、人名或数字；默认 300 字以内，用户要求展开时才写长。",
    "你可以提出一个页面动作：在回答的最后另起一行，输出一个 ```do 代码块，内容是一行 JSON，例如：",
    '```do\n{"act":"goto","dyn":"tang","chapter":3}\n```',
    "act 取值：goto（dyn 用下列 id 或中文名，chapter 从 1 开始）、quiz（chapter）、theme（reform/exam/build/treaty/coin）、overview。不需要动作时不要输出这个代码块。",
    "朝代 id：" + DYN_IDS,
    "",
    "【当前页面】" + ctx()
  ].join("\n");

  function ctx() {
    if (!D || !D.meta) return "（未载入）";
    const c = CH[cur];
    const cards = c ? c.items.slice(0, 8).map(i => i.t).join(" / ") : "";
    return D.meta.name + "（" + D.meta.id + "）· " + D.meta.span + " · " + CH.length + " 章" +
      (c ? "｜当前第 " + (cur + 1) + " 章 " + c.y + " " + c.t : "") +
      (cards ? "｜本章卡片：" + cards : "");
  }

  /* ---------- UI ---------- */
  const chat = q("#chat"), body = q("#chatBody"), text = q("#chatText");
  const sendBtn = q("#chatSend"), fab = q("#chatFab"), cfgBox = q("#chatCfg");

  function openChat() {
    chat.classList.add("on");
    fab.classList.add("hide");
    if (!cfg.key) showCfg(true);
    else if (!hist.length) hello();
    else if (!body.children.length) renderHistory();
    setTimeout(() => text.focus(), 60);
    body.scrollTop = body.scrollHeight;
  }
  function closeChat() {
    chat.classList.remove("on");
    fab.classList.remove("hide");
  }
  function showCfg(on) {
    cfgBox.classList.toggle("on", on);
    q("#chatIn").style.display = on ? "none" : "";
    q("#chatQuick").style.display = on ? "none" : "";
    if (on) {
      q("#cfgKey").value = cfg.key || "";
      q("#cfgBase").value = cfg.base || DEF.base;
      q("#cfgModel").value = cfg.model || DEF.model;
      q("#chatState").textContent = "未配置";
      q("#chatDot").classList.remove("live");
      q("#cfgSnip").textContent = 'window.CHAT_CONFIG = {\n  key: "' + (cfg.key || "sk-...") + '",\n  base: "' +
        (cfg.base || DEF.base) + '",\n  model: "' + (cfg.model || DEF.model) + '"\n};';
    }
  }
  function state() {
    q("#chatState").textContent = cfg.key ? "已就绪 · " + cfg.model : "未配置";
    q("#chatDot").classList.toggle("live", !!cfg.key);
  }

  function addMsg(role, txt) {
    const el = document.createElement("div");
    el.className = "msg " + role;
    el.textContent = txt;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    return el;
  }
  function hello() {
    addMsg("a", "我是史官。可以问我这一章讲了什么、某个事件的因果，或者让我带你去某一朝、某一章。");
  }
  function renderHistory() {
    body.innerHTML = "";
    if (!hist.length) return;
    const last = hist[hist.length - 1];
    const div = document.createElement("div");
    div.className = "daydiv";
    div.textContent = "上次对话 · " + (dayLabel(last.ts) || "已保存");
    body.appendChild(div);
    hist.forEach(m => addMsg(m.role === "user" ? "u" : "a", m.content));
    body.scrollTop = body.scrollHeight;
  }

  /* ---------- 调用 ---------- */
  async function stream(messages, onDelta) {
    const url = (cfg.base || DEF.base).replace(/\/+$/, "") + "/chat/completions";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + cfg.key },
      body: JSON.stringify({ model: cfg.model || DEF.model, messages, stream: true, temperature: 0.6 })
    });
    if (!res.ok) {
      let detail = "";
      try { const j = await res.json(); detail = j.error && j.error.message || JSON.stringify(j).slice(0, 160); }
      catch (e) { detail = await res.text().catch(() => ""); }
      throw new Error("HTTP " + res.status + " " + detail);
    }
    if (!res.body) { const j = await res.json(); return j.choices[0].message.content; }
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "", full = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const chunks = buf.split("\n\n");
      buf = chunks.pop();
      for (const ch of chunks) {
        const line = ch.split("\n").find(l => l.startsWith("data:"));
        if (!line) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const j = JSON.parse(data);
          const d = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
          if (d) { full += d; onDelta(d); }
        } catch (e) {}
      }
    }
    return full;
  }

  /* ---------- 动作 ---------- */
  const THEME_IDS = ["reform", "exam", "build", "treaty", "coin"];
  function runAction(a) {
    if (!a || !a.act) return "";
    try {
      if (a.act === "goto") {
        let id = a.dyn;
        if (!DY[id]) {
          const hit = Object.keys(DY).find(k => DY[k].meta.name === a.dyn || DY[k].meta.name.indexOf(a.dyn) === 0);
          id = hit || id;
        }
        if (!DY[id]) return "找不到朝代「" + a.dyn + "」";
        if (D.meta.id !== id) switchTo(id);
        const n = Math.max(1, Math.min(+a.chapter || 1, CH.length));
        setTimeout(() => goChapter(n - 1), 120);
        return "已跳到 " + DY[id].meta.name + " 第 " + n + " 章";
      }
      if (a.act === "quiz") {
        const n = Math.max(1, Math.min(+a.chapter || 1, CH.length));
        const sec = document.querySelectorAll(".ch")[n - 1];
        const b = sec && sec.querySelector(".quizchip");
        if (b) { b.click(); return "已打开第 " + n + " 章的闯关"; }
        return "没找到这一章的闯关";
      }
      if (a.act === "theme") {
        const i = THEME_IDS.indexOf(a.theme);
        if (i < 0) return "没有这个主题";
        openThemes();
        renderTheme(i);
        return "已打开主题：" + (window.THEMES[i] ? window.THEMES[i].name : a.theme);
      }
      if (a.act === "overview") { openOverview(); return "已打开朝代纵览"; }
      return "";
    } catch (e) { return "动作执行失败：" + e.message; }
  }

  function splitAction(txt) {
    const m = txt.match(/```(?:do|json)?\s*(\{[\s\S]*?\})\s*```/);
    if (!m) return { text: txt, act: null };
    let act = null;
    try { act = JSON.parse(m[1]); } catch (e) {}
    return { text: txt.replace(m[0], "").trim(), act };
  }

  async function send() {
    if (busy) return;
    const val = text.value.trim();
    if (!val) return;
    if (!cfg.key) { showCfg(true); return; }
    text.value = "";
    addMsg("u", val);
    hist.push({ role: "user", content: val, ts: Date.now() });
    saveHist();
    const bubble = addMsg("a", "…");
    bubble.classList.add("streaming");
    busy = true; sendBtn.disabled = true;
    try {
      const msgs = [{ role: "system", content: SYS() }].concat(hist.slice(-12));
      let out = "";
      out = await stream(msgs, d => {
        if (!out) bubble.textContent = "";
        bubble.textContent += d;
        out += d;
        body.scrollTop = body.scrollHeight;
      });
      const { text: shown, act } = splitAction(bubble.textContent || out);
      bubble.textContent = shown || "（空回复）";
      hist.push({ role: "assistant", content: shown, ts: Date.now() });
      saveHist();
      const note = runAction(act);
      if (note) {
        const d = document.createElement("div");
        d.className = "act";
        d.textContent = "→ " + note;
        bubble.appendChild(d);
      }
    } catch (e) {
      bubble.classList.remove("streaming");
      bubble.innerHTML = "";
      const sp = document.createElement("span");
      sp.className = "err";
      sp.textContent = "调用失败：" + e.message;
      bubble.appendChild(sp);
      if (/401|403/.test(e.message)) {
        const tip = document.createElement("div");
        tip.className = "act";
        tip.textContent = "→ 检查 API Key 是否正确（点右上角 ⚙）";
        bubble.appendChild(tip);
      }
    } finally {
      busy = false; sendBtn.disabled = false;
      body.scrollTop = body.scrollHeight;
    }
  }

  /* ---------- 事件 ---------- */
  fab.onclick = openChat;
  q("#chatClose").onclick = closeChat;
  q("#chatCfgBtn").onclick = () => showCfg(!cfgBox.classList.contains("on"));
  q("#chatClear").onclick = () => {
    if (!hist.length) return;
    if (!confirm("清空全部对话记录？")) return;
    hist = [];
    saveHist();
    body.innerHTML = "";
    hello();
  };
  q("#cfgCopy").onclick = () => {
    const txt = q("#cfgSnip").textContent;
    navigator.clipboard && navigator.clipboard.writeText(txt).then(
      () => { q("#cfgCopy").textContent = "已复制"; setTimeout(() => q("#cfgCopy").textContent = "复制上面这段", 1400); },
      () => {}
    );
  };
  q("#cfgSave").onclick = () => {
    cfg.key = q("#cfgKey").value.trim();
    cfg.base = q("#cfgBase").value.trim() || DEF.base;
    cfg.model = q("#cfgModel").value.trim() || DEF.model;
    try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) {}
    state();
    showCfg(false);
    if (!hist.length) hello();
    text.focus();
  };
  sendBtn.onclick = send;
  text.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && chat.classList.contains("on")) closeChat();
  });

  const QUICK = ["这一章讲了什么？", "帮我理一下这一章的因果", "给我出 3 道这章的题"];
  q("#chatQuick").innerHTML = QUICK.map(t => '<button type="button">' + t + "</button>").join("");
  q("#chatQuick").addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    text.value = b.textContent;
    text.focus();
  });

  /* 可选：本地 chat-config.js（不进仓库） */
  (function loadFileCfg() {
    const sc = document.createElement("script");
    sc.src = "chat-config.js";
    sc.onload = () => {
      if (window.CHAT_CONFIG) {
        Object.assign(cfg, window.CHAT_CONFIG);
        state();
        if (chat.classList.contains("on") && !cfgBox.classList.contains("on")) showCfg(false);
      }
    };
    sc.onerror = () => {};
    document.head.appendChild(sc);
  })();

  loadHist();
  state();
})();

