# -*- coding: utf-8 -*-
import io

P = 'index.html'
s = io.open(P, encoding='utf-8').read()

# ---------- 1) 计数样式 ----------
old = '''  .tfilters .fchip.t-on{background:var(--gold);border-color:var(--gold);color:#fff}'''
new = '''  .tfilters .fchip.t-on{background:var(--gold);border-color:var(--gold);color:#fff}
  .fchip .fnum{font-size:9.5px;opacity:.55;margin-left:3px;vertical-align:1px}'''
assert old in s
s = s.replace(old, new, 1)

# ---------- 2) 右侧章节刻度 ----------
css = '''  .rail{position:fixed;right:14px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;
    gap:13px;z-index:40}
  .rail button{position:relative;display:flex;align-items:center;justify-content:flex-end;
    background:none;border:none;padding:2px 0;cursor:pointer;font-family:inherit}
  .rail i{display:block;width:13px;height:2px;background:#cebca4;border-radius:2px;transition:.18s}
  .rail button:hover i{width:22px;background:var(--gold)}
  .rail button.on i{width:26px;height:3px;background:var(--red)}
  .rail .rl{position:absolute;right:34px;white-space:nowrap;font-size:11px;color:var(--ink2);
    background:#fff;border:1px solid var(--line);border-radius:4px;padding:1px 8px;opacity:0;
    pointer-events:none;transition:.15s}
  .rail button:hover .rl{opacity:1}
  @media (max-width:1100px){.rail{display:none}}
'''
anchor = '  /* ============ 动效：卷轴展开 / 王朝更迭 ============ */'
assert anchor in s
s = s.replace(anchor, css + '\n' + anchor, 1)

# ---------- 3) 节点 ----------
old = '''  <main id="main">'''
new = '''  <nav class="rail" id="rail" aria-label="章节刻度"></nav>

  <main id="main">'''
assert old in s
s = s.replace(old, new, 1)

# ---------- 4) 渲染 + 高亮 + 点击 ----------
old = '''  /* 顶部章节点 */
  $("#dots").innerHTML = CH.map((c, i) =>
    `<button class="dot" data-i="${i}" title="${c.y} ${c.t}">${i + 1}</button>`).join("");'''
new = '''  /* 顶部章节点 */
  $("#dots").innerHTML = CH.map((c, i) =>
    `<button class="dot" data-i="${i}" title="${c.y} ${c.t}">${i + 1}</button>`).join("");
  /* 右侧刻度 */
  $("#rail").innerHTML = CH.map((c, i) =>
    `<button data-i="${i}" title="${c.y} ${c.t}"><span class="rl">${c.y} ${c.t}</span><i></i></button>`).join("");'''
assert old in s
s = s.replace(old, new, 1)

old = '''function setActive(i) {
  $$(".dot").forEach((d, k) => d.classList.toggle("on", k === i));
}'''
new = '''function setActive(i) {
  $$(".dot").forEach((d, k) => d.classList.toggle("on", k === i));
  $$("#rail button").forEach((d, k) => d.classList.toggle("on", k === i));
}'''
assert old in s
s = s.replace(old, new, 1)

old = '''$("#dots").addEventListener("click", e => {
  const b = e.target.closest(".dot");
  if (b) goChapter(+b.dataset.i);
});'''
new = '''$("#dots").addEventListener("click", e => {
  const b = e.target.closest(".dot");
  if (b) goChapter(+b.dataset.i);
});
$("#rail").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (b) goChapter(+b.dataset.i);
});'''
assert old in s
s = s.replace(old, new, 1)

io.open(P, 'w', encoding='utf-8').write(s)
print('rail + count style ok')
