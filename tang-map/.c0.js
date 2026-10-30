
/* ============================================================
   数据
   ============================================================ */


/* ---------- 闯关题库（由 tang-quiz 迁入） ---------- */
/* 数据来自 data/*.js，按 ?d=朝代id 选择，默认唐 */
const DY = window.DYNASTIES;
let D, EMPS, CH, QB, EVENTS, CATS, cur = 0, spy = null, spy2 = null;
const MOTION = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function useDynasty(id) {
  D = DY[id] || DY.tang;
  EMPS = D.emps; CH = D.chapters; QB = D.questions; EVENTS = D.events; CATS = D.cats;
  try { localStorage.setItem("dyn", D.meta.id); } catch (e) {}
  try {
    if (/[#&]d=/.test(location.hash || "")) {
      history.replaceState(null, "", location.pathname + "#d=" + D.meta.id);
    } else {
      const u = new URL(location.href);
      u.searchParams.set("d", D.meta.id);
      history.replaceState(null, "", u.href);
    }
  } catch (e) {}
}
const fy = y => (y < 0 ? (typeof D !== "undefined" && D.meta && D.meta.approx ? "约前" : "前") + (-y) : "" + y);
const KIND = { emp:"皇位", pow:"权力", war:"战争", ppl:"人物", cul:"文化", rel:"文物" };
const CN = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];



/* ============================================================
   渲染
   ============================================================ */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function renderAll() {
  /* 壳层：标题、选朝条、简介里的数字 */
  document.title = D.meta.title + " · 主线";
  $("#seal").textContent = D.meta.seal;
  $("#ttlMain").textContent = D.meta.title;
  $("#ttlSub").textContent = D.meta.span + " · " + D.meta.tagline;
  $("#introN").textContent = EMPS.length;
  $("#introA").textContent = D.meta.ascend || "即位";
  $("#introC").textContent = CN[CH.length] || CH.length;
  $("#secTitle").textContent = D.meta.rulerLabel || "皇位更替";
  $("#tlegend").style.display = D.meta.noAbnormal ? "none" : "";
  $("#jump").textContent = "↓ 跳到" + (CN[CH.length] || CH.length) + "章主线";
  $("#dynachips").innerHTML = (window.DYNASTY_LIST || []).map(d => {
    if (!DY[d.id]) return '<span class="dynachip off" title="筹备中">' + d.name + "</span>";
    return '<button class="dynachip' + (d.id === D.meta.id ? " on" : "") + '" data-id="' + d.id + '" title="' + d.years + '">' + d.name + "</button>";
  }).join("");

  /* 顶部章节点 */
  $("#dots").innerHTML = CH.map((c, i) =>
    `<button class="dot" data-i="${i}" title="${c.y} ${c.t}">${i + 1}</button>`).join("");
  /* 右侧章节刻度 */
  $("#rail").innerHTML = CH.map((c, i) =>
    `<button data-i="${i}" title="${c.y} ${c.t}"><span class="rl">${c.y} ${c.t}</span><i></i></button>`).join("");

  /* 皇位竖轴 */
  const abCount = EMPS.filter(e => e.ab).length;
  const peopleN = new Set(EMPS.map(e => e.n + (e.p || ""))).size;
  $("#rstat").innerHTML = D.meta.noAbnormal
  ? peopleN + " 位" + (D.meta.unit || "君主") + " · " + EMPS.length + " 次" + (D.meta.ascend || "即位")
  : peopleN + " 位" + (D.meta.unit || "君主") + " · " + EMPS.length + " 次" + (D.meta.ascend || "即位") + " · 其中 <b>" + abCount + "</b> 次非正常（政变、拥立、自立、篡位、禅让）";

  function empHTML(e, i) {
    const tags = (e.tags || []).map(t => `<span class="tg">${t}</span>`).join("");
    const al = e.al ? `<span class="al">${e.al}</span>` : "";
  const rg = e.regime ? `<span class="rg">${e.regime}</span>` : "";
    const cls = [i % 2 === 0 ? "L" : "R", e.k || "wen", e.ab ? "ab" : ""].join(" ");
    return `<button class="tl-item ${cls}" data-i="${i}" data-y="${e.y0}" style="--i:${i}"
      title="${e.n}${e.p ? " " + e.p : ""} ${fy(e.y0)}–${fy(e.y1)}｜${e.m}">
      <span class="tl-mid"><span class="tdot"></span></span>
      <span class="tl-card">
        <span class="row1"><span class="yr">${fy(e.y0)}–${fy(e.y1)}</span><span class="nm"><b>${e.n}</b><span class="pn">${e.p}</span>${rg}${al}</span></span>
        <span class="tags">${tags}</span>
      </span>
    </button>`;
  }
  $("#tlwrap").innerHTML = EMPS.map((e, i) => empHTML(e, i)).join("");
  $$(".ch").forEach((el) => el.remove());

  /* 章节正文 */
  $("#chapters").insertAdjacentHTML("beforeend", CH.map((c, ci) => {
    const ruled = EMPS.filter(e => e.y0 <= c.e && e.y1 >= c.s);
    const chips = ruled.map(e => `<span class="rchip">${e.n}${e.p ? " " + e.p : ""}</span>`).join("");
    return `
    <section class="ch" id="${c.id}" data-i="${ci}">
      <div class="chhead"><span class="chy">${c.y}</span><span class="rulerow">${chips}</span><button class="quizchip" data-c="${c.id}">考这一章</button></div>
      <h2 class="cht">${c.t}</h2>
      <p class="chlead">${c.lead}</p>
      <div class="grid">
        ${c.items.map((it, j) => `
          <button class="it k-${it.k}${(it.th || []).map(t => " t-" + t).join("")}" data-c="${c.id}" data-j="${j}" style="--j:${j}">
            <span class="top"><span class="iy">${fy(it.y)}</span><span class="ik">${KIND[it.k]}</span></span>
            <span class="it-t">${it.t}</span>
            <span class="it-d">${it.d}</span>
            ${it.mus ? '<span class="it-mus">' + it.mus + "</span>" : ""}
          </button>`).join("")}
      </div>
      <div class="chain"><span class="cl">因果链</span>${
        c.chain.map((n, i) => (i ? '<span class="ar">→</span>' : "") + `<span class="nd">${n}</span>`).join("")
      }</div>
    </section>`;
  }).join(""));

    cur = 0;
    document.body.dataset.f = "";
    $$("#filters .fchip").forEach((c, i) => c.classList.toggle("on", i === 0));
    document.body.dataset.f = "";
    document.body.dataset.t = "";
    const TH_LABEL = { reform: "变法", build: "建设", exam: "选官", treaty: "和议", coin: "币制" };
    const counts = {};
    CH.forEach(c => c.items.forEach(it => (it.th || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; })));
    const chips = Object.keys(TH_LABEL).filter(k => counts[k]).map(k =>
      '<button class="fchip" data-t="' + k + '">' + TH_LABEL[k] + '<span class="fnum">' + counts[k] + "</span></button>");
    $("#tfilters").innerHTML = chips.length
      ? '<span class="flabel">主题</span>' + chips.join("")
      : "";
    applyFilter();
    if (spy) spy.disconnect();
    spy = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) { cur = +en.target.dataset.i; setActive(cur); }
      });
    }, { rootMargin: "-15% 0px -70% 0px", threshold: 0 });
    $$(".ch").forEach(el => spy.observe(el));

    /* 卷轴展开：竖轴重绘、印章重落、章节卡滚动浮现 */
    if (MOTION) {
      const wrap = $(".tlwrap");
      wrap.classList.remove("draw");
      void wrap.offsetWidth;
      wrap.classList.add("draw");
      const seal = $("#seal");
      seal.classList.remove("stamp");
      void seal.offsetWidth;
      seal.classList.add("stamp");
      if (spy2) spy2.disconnect();
      spy2 = new IntersectionObserver(es => es.forEach(en => {
        if (en.isIntersecting) { en.target.classList.add("in"); spy2.unobserve(en.target); }
      }), { rootMargin: "-2% 0px -8% 0px", threshold: 0 });
      $$(".ch").forEach(el => spy2.observe(el));
      const first = $(".ch");
      if (first) first.classList.add("in");
    }
    setActive(0);
}


/* ============================================================
   交互
   ============================================================ */

function chapterIndexOf(year) {
  for (let i = CH.length - 1; i >= 0; i--) if (year >= CH[i].s) return i;
  return 0;
}
function goChapter(i) {
  i = Math.max(0, Math.min(CH.length - 1, i));
  const el = document.getElementById(CH[i].id);
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}
function setActive(i) {
  $$(".dot").forEach((d, k) => d.classList.toggle("on", k === i));
  $$("#rail button").forEach((d, k) => d.classList.toggle("on", k === i));
}

$("#dots").addEventListener("click", e => {
  const b = e.target.closest(".dot");
  if (b) goChapter(+b.dataset.i);
});
$("#rail").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (b) goChapter(+b.dataset.i);
});

/* 类别 + 主题筛选 */
function applyFilter() {
  const f = document.body.dataset.f || "";
  const t = document.body.dataset.t || "";
  $$(".it").forEach(el => {
    const okF = !f || el.classList.contains("k-" + f);
    const okT = !t || el.classList.contains("t-" + t);
    el.classList.toggle("dim", !(okF && okT));
  });
}
$("#filters").addEventListener("click", e => {
  const b = e.target.closest(".fchip");
  if (!b) return;
  $$("#filters .fchip").forEach(c => c.classList.toggle("on", c === b));
  document.body.dataset.f = b.dataset.f;
  applyFilter();
});
$("#tfilters").addEventListener("click", e => {
  const b = e.target.closest(".fchip");
  if (!b) return;
  const on = document.body.dataset.t === b.dataset.t;
  document.body.dataset.t = on ? "" : b.dataset.t;
  $$("#tfilters .fchip").forEach(c => c.classList.toggle("on", !on && c === b));
  applyFilter();
});
$("#prev").onclick = () => goChapter(cur - 1);
$("#next").onclick = () => goChapter(cur + 1);
document.querySelector(".tlwrap").addEventListener("click", e => {
  const b = e.target.closest(".tl-item");
  if (b) goChapter(chapterIndexOf(+b.dataset.y));
});
$("#jump").addEventListener("click", () => goChapter(0));

/* 朝代纵览浮层（就地切换，不做页面跳转） */
const OV_ERAS = [
  ["先秦", ["xia", "shang", "zhou", "chunqiu", "zhanguo"]],
  ["秦汉", ["qin", "han"]],
  ["魏晋南北朝", ["sanguo", "jin"]],
  ["隋唐", ["sui", "tang"]],
  ["五代 · 宋辽金", ["wudai", "song", "liao", "jin2"]],
  ["元明清", ["yuan", "ming", "qing"]]
];
const OV_HOOK = {
  xia: "治水换来的王权", shang: "甲骨与青铜的王朝", zhou: "分封、宗法与礼乐",
  chunqiu: "霸主代替天子", zhanguo: "变法竞赛，秦笑到最后", qin: "十五年改造天下",
  han: "郡县与儒术的定型", sanguo: "三方立国，谁都没赢", jin: "门阀与皇权共治",
  sui: "制度比武功更长久", tang: "从贞观到藩镇", wudai: "武人当国，南方积累",
  song: "用制度换和平", liao: "草原与农耕的二元帝国", jin2: "从部落到中原王朝",
  yuan: "行省、纸币与双轨治理", ming: "废相之后的皇权", qing: "最后一个王朝的收尾"
};
const OV_VAR = ["--c1", "--c2", "--c3", "--c4", "--c5", "--c6"];
const ovEl = $("#ov");
let ovBuilt = false;

function buildOverview() {
  const rows = [];
  OV_ERAS.forEach(([name, ids], ei) => {
    ids.forEach(id => {
      const d = DY[id];
      if (!d) return;
      rows.push({
        id, name: d.meta.name, years: d.meta.span, ei,
        s: d.chapters[0].s, e: d.chapters[d.chapters.length - 1].e,
        hook: OV_HOOK[id] || ""
      });
    });
  });
  const min = Math.min(...rows.map(r => r.s)), max = Math.max(...rows.map(r => r.e));
  const total = max - min;

  $("#ovRibbon").innerHTML = rows.map(r => {
    const w = Math.max((r.e - r.s) / total * 100, 1.2);
    return '<button class="ov-seg" data-id="' + r.id + '" title="' + r.name + " " + r.years + '"' +
      ' data-ei="' + r.ei + '" style="--i:' + rows.indexOf(r) + ";width:" + w.toFixed(3) + "%;background:var(" + OV_VAR[r.ei] + ')">' +
      (w >= 4 ? "<span>" + r.name + "</span>" : "") + "</button>";
  }).join("");

  const TICKS = [[-2070, "约前 2070"], [-1000, "前 1000"], [0, "元年"], [1000, "1000"], [1912, "1912"]];
  $("#ovAxis").innerHTML = TICKS.map(t =>
    '<span style="left:' + ((t[0] - min) / total * 100).toFixed(2) + '%">' + t[1] + "</span>").join("");
  $("#ovLegend").innerHTML = OV_ERAS.map((e, i) =>
    '<span><i style="background:var(' + OV_VAR[i] + ')"></i>' + e[0] + "</span>").join("");

  $("#ovList").innerHTML = OV_ERAS.map(([name], ei) => {
    const items = rows.filter(r => r.ei === ei);
    if (!items.length) return "";
    return '<section class="ov-era"><h3>' + name + "</h3>" + items.map(r =>
      '<button class="ov-row' + (D && r.id === D.meta.id ? " cur" : "") + '" data-id="' + r.id + '" style="--i:' + rows.indexOf(r) + '">' +
        '<span class="yr">' + r.years + "</span>" +
        '<span class="nm"><span class="dot" style="background:var(' + OV_VAR[ei] + ')"></span>' + r.name + "</span>" +
        '<span class="hk">' + r.hook + "</span>" +
        '<span class="go">进入 →</span></button>').join("") + "</section>";
  }).join("");

  ovBuilt = true;
}

function openOverview() {
  if (!ovBuilt) buildOverview();
  else $("#ovList").querySelectorAll(".ov-row").forEach(b =>
    b.classList.toggle("cur", D && b.dataset.id === D.meta.id));
  ovEl.classList.add("on");
  document.body.style.overflow = "hidden";
}
function closeOverview() {
  ovEl.classList.remove("on");
  document.body.style.overflow = "";
}
$("#homeBtn").onclick = openOverview;
$("#ovClose").onclick = closeOverview;
ovEl.addEventListener("click", e => {
  if (e.target === ovEl) { closeOverview(); return; }
  const b = e.target.closest(".ov-seg, .ov-row");
  if (!b) return;
  const id = b.dataset.id;
  closeOverview();
  switchTo(id);
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && ovEl.classList.contains("on")) closeOverview();
});

/* 主题纵览 */
let thCur = 0;
function renderTheme(i) {
  thCur = i;
  const T = (window.THEMES || [])[i];
  if (!T) return;
  $("#thTabs").innerHTML = (window.THEMES || []).map((t, k) =>
    '<button class="th-tab' + (k === i ? " on" : "") + '" data-k="' + k + '">' + t.name + "</button>").join("");
  $("#thBody").innerHTML =
    '<div class="th-head"><span class="th-name">' + T.name + '</span>' +
      '<span class="th-sub">' + T.sub + "</span>" +
      '<p class="th-lead">' + T.lead + "</p></div>" +
    '<div class="th-list">' + T.nodes.map(n => {
      const jump = n.d && DY[n.d];
      return '<button class="th-node' + (jump ? "" : " gap") + '"' +
        (jump ? ' data-d="' + n.d + '" data-y="' + n.y + '"' : "") + ' title="' +
        (jump ? "跳到" + DY[n.d].meta.name + "对应章节" : "该政权暂无独立页面") + '">' +
        '<span class="th-r1"><span class="th-y">' + fy(n.y) + "</span>" +
        '<span class="th-dyn">' + n.dn + "</span>" +
        '<span class="th-t">' + n.t + "</span></span>" +
        '<span class="th-v">' + n.d2 + "</span></button>";
    }).join("") + "</div>" +
    '<div class="th-tail">' + T.tail + "</div>";
}
function openThemes() {
  if (!window.THEMES || !window.THEMES.length) return;
  renderTheme(thCur);
  $("#th").classList.add("on");
  document.body.style.overflow = "hidden";
}
function closeThemes() {
  $("#th").classList.remove("on");
  document.body.style.overflow = "";
}
$("#themeBtn").onclick = openThemes;
$("#thClose").onclick = closeThemes;
$("#th").addEventListener("click", e => {
  if (e.target === $("#th")) { closeThemes(); return; }
  const tab = e.target.closest(".th-tab");
  if (tab) { renderTheme(+tab.dataset.k); return; }
  const node = e.target.closest(".th-node");
  if (!node || !node.dataset.d) return;
  const id = node.dataset.d, y = +node.dataset.y;
  closeThemes();
  if (D && D.meta.id === id) { setTimeout(() => goChapter(chapterIndexOf(y)), 60); return; }
  switchTo(id);
  setTimeout(() => goChapter(chapterIndexOf(y)), 90);
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && $("#th").classList.contains("on")) closeThemes();
});

/* 切换朝代 */
function switchTo(id) {
  if (!DY[id]) return;
  if (D && id === D.meta.id) { closeOverview(); return; }
  if (MOTION) {
    const sw = $(".sweep");
    if (sw) { sw.classList.remove("on"); void sw.offsetWidth; sw.classList.add("on"); }
    const tn = $("#turn");
    if (tn) {
      $("#turnName").textContent = DY[id].meta.name;
      $("#turnSub").textContent = DY[id].meta.span;
      tn.classList.remove("on"); void tn.offsetWidth; tn.classList.add("on");
    }
  }
  closeLB(); closeModal();
  useDynasty(id);
  renderAll();
  window.scrollTo({ top: 0, behavior: "auto" });
}
$("#dynachips").addEventListener("click", e => {
  const b = e.target.closest("button.dynachip");
  if (b) switchTo(b.dataset.id);
});

/* 首次渲染 */
(function () {
  let id = "";
  try {
    id = new URLSearchParams(location.search).get("d") || "";
    if (!id) {
      const m = (location.hash || "").match(/[#&]d=([^&]+)/);
      if (m) id = decodeURIComponent(m[1]);
    }
    if (!id) id = localStorage.getItem("dyn") || "";
  } catch (e) {}
  if (!id) id = "tang";
  if (MOTION) {
    const sw = document.createElement("div");
    sw.className = "sweep";
    document.body.appendChild(sw);
    document.body.classList.add("motion");
  }
  useDynasty(id);
  renderAll();
})();


/* ---------- 文物大图 ---------- */
const commonsUrl = f => "https://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(f) + "?width=1000";
const lbEl = $("#lightbox"), lbImg = $("#lbImg"), lbCap = $("#lbCap"), lbSrc = $("#lbSrc");
function openLB(src, name, file) {
  lbImg.src = src;
  lbImg.alt = name;
  lbCap.textContent = name;
  if (file) { lbSrc.href = "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(file); lbSrc.style.display = ""; }
  else { lbSrc.style.display = "none"; }
  lbEl.classList.add("on");
}
function closeLB() { lbEl.classList.remove("on"); lbImg.removeAttribute("src"); }
$("#lbClose").onclick = closeLB;
lbEl.addEventListener("click", e => { if (e.target === lbEl) closeLB(); });
$("#mBody").addEventListener("click", e => {
  const f = e.target.closest(".mfig");
  if (!f || f.classList.contains("noimg")) return;
  const img = f.querySelector("img");
  if (img) openLB(img.src, f.dataset.name, f.dataset.file);
});

/* 弹窗 */
const mask = $("#mask");
function openItem(cid, j) {
  const c = CH.find(x => x.id === cid);
  const it = c.items[j];
  $("#mTitle").textContent = it.t;
  $("#mMeta").textContent = `${fy(it.y)} 年 · ${KIND[it.k]} · ${c.y} ${c.t}`;
  if (it.facts) {
    const rows = it.facts.map(f => '<div class="mrow"><span class="mk">' + f[0] + '</span><span class="mv">' + f[1] + '</span></div>').join("");
    const pic = '<a class="mart" target="_blank" rel="noopener" href="https://image.baidu.com/search/index?tn=baiduimage&word=' +
      encodeURIComponent(it.t) + '">看实拍图 ↗</a>';
    const fig = '<div class="mfig' + (it.img ? "" : " noimg") + '" data-file="' + (it.img || "") + '" data-name="' + it.t + '">' +
      (it.img ? '<img alt="' + it.t + '" src="' + commonsUrl(it.img) + '">' : "") +
      '<span class="mfig-ph">' + (it.glyph || "文") + '</span></div>';
    $("#mBody").innerHTML = '<div class="mlabel"><div class="mglyph">' + it.glyph + '</div>' + fig +
      '<div class="mfacts">' + rows + pic + "</div></div>" +
      '<div class="mtext">' + it.long + "</div>";
    $$("#mBody .mfig img").forEach(img => {
      img.onerror = () => img.parentNode.classList.add("noimg");
      setTimeout(() => { if (!img.complete || img.naturalWidth === 0) img.parentNode.classList.add("noimg"); }, 2500);
    });
  } else {
    $("#mBody").innerHTML = '<div class="mtext">' + it.d + "</div>";
  }
  const others = c.items.filter((x, k) => k !== j);
  $("#mRel").innerHTML = `<div class="rl">同一时期</div><div class="tags">` +
    others.map(o => `<button class="tag" data-t="${o.t}">${o.t}</button>`).join("") + `</div>`;
  mask.classList.add("on");
}
function closeModal() { mask.classList.remove("on"); }
$("#mClose").onclick = closeModal;
mask.addEventListener("click", e => { if (e.target === mask) closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") { closeLB(); closeModal(); } });

$("#chapters").addEventListener("click", e => {
  const b = e.target.closest(".it");
  if (b) openItem(b.dataset.c, +b.dataset.j);
});
$("#mRel").addEventListener("click", e => {
  const b = e.target.closest(".tag");
  if (!b) return;
  const title = b.dataset.t;
  for (const c of CH) {
    const j = c.items.findIndex(x => x.t === title);
    if (j >= 0) {
      closeModal();
      const el = document.getElementById(c.id);
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => openItem(c.id, j), 320);
      return;
    }
  }
});

/* 键盘左右切章 */
document.addEventListener("keydown", e => {
  if (mask.classList.contains("on") || document.getElementById("sheet").classList.contains("on")) return;
  if (e.key === "ArrowRight") goChapter(cur + 1);
  if (e.key === "ArrowLeft") goChapter(cur - 1);
});
