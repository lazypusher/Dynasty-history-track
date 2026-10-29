
/* ============================================================
   数据
   ============================================================ */


/* ---------- 闯关题库（由 tang-quiz 迁入） ---------- */
/* 数据来自 data/*.js，按 ?d=朝代id 选择，默认唐 */
const DY = window.DYNASTIES;
let D, EMPS, CH, QB, EVENTS, CATS, cur = 0, spy = null;

function useDynasty(id) {
  D = DY[id] || DY.tang;
  EMPS = D.emps; CH = D.chapters; QB = D.questions; EVENTS = D.events; CATS = D.cats;
  try { localStorage.setItem("dyn", D.meta.id); } catch (e) {}
  try {
    const u = new URL(location.href);
    u.searchParams.set("d", D.meta.id);
    history.replaceState(null, "", u.href);
  } catch (e) {}
}
const fy = y => (y < 0 ? "前" + (-y) : "" + y);
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
  $("#introC").textContent = CN[CH.length] || CH.length;
  $("#dynachips").innerHTML = (window.DYNASTY_LIST || []).map(d => {
    if (!DY[d.id]) return '<span class="dynachip off" title="筹备中">' + d.name + "</span>";
    return '<button class="dynachip' + (d.id === D.meta.id ? " on" : "") + '" data-id="' + d.id + '" title="' + d.years + '">' + d.name + "</button>";
  }).join("");

  /* 顶部章节点 */
  $("#dots").innerHTML = CH.map((c, i) =>
    `<button class="dot" data-i="${i}" title="${c.y} ${c.t}">${i + 1}</button>`).join("");

  /* 皇位竖轴 */
  const abCount = EMPS.filter(e => e.ab).length;
  const peopleN = new Set(EMPS.map(e => e.n + (e.p || ""))).size;
  $("#rstat").innerHTML = peopleN + " 位君主 · " + EMPS.length + " 次即位 · 其中 <b>" + abCount + "</b> 次非正常（政变、拥立、自立、篡位、禅让）";

  function empHTML(e, i) {
    const tags = (e.tags || []).map(t => `<span class="tg">${t}</span>`).join("");
    const al = e.al ? `<span class="al">${e.al}</span>` : "";
  const rg = e.regime ? `<span class="rg">${e.regime}</span>` : "";
    const cls = [i % 2 === 0 ? "L" : "R", e.k || "wen", e.ab ? "ab" : ""].join(" ");
    return `<button class="tl-item ${cls}" data-i="${i}" data-y="${e.y0}"
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
          <button class="it k-${it.k}" data-c="${c.id}" data-j="${j}">
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
    $$(".fchip").forEach((c, i) => c.classList.toggle("on", i === 0));
    if (spy) spy.disconnect();
    spy = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) { cur = +en.target.dataset.i; setActive(cur); }
      });
    }, { rootMargin: "-15% 0px -70% 0px", threshold: 0 });
    $$(".ch").forEach(el => spy.observe(el));
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
}

$("#dots").addEventListener("click", e => {
  const b = e.target.closest(".dot");
  if (b) goChapter(+b.dataset.i);
});

/* 类别筛选 */
$("#filters").addEventListener("click", e => {
  const b = e.target.closest(".fchip");
  if (!b) return;
  $$(".fchip").forEach(c => c.classList.toggle("on", c === b));
  document.body.dataset.f = b.dataset.f;
});
$("#prev").onclick = () => goChapter(cur - 1);
$("#next").onclick = () => goChapter(cur + 1);
document.querySelector(".tlwrap").addEventListener("click", e => {
  const b = e.target.closest(".tl-item");
  if (b) goChapter(chapterIndexOf(+b.dataset.y));
});
$("#jump").addEventListener("click", () => goChapter(0));

/* 切换朝代 */
function switchTo(id) {
  if (!DY[id] || (D && id === D.meta.id)) return;
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
  let id = "tang";
  try { id = new URLSearchParams(location.search).get("d") || localStorage.getItem("dyn") || "tang"; } catch (e) {}
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
