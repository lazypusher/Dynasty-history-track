/* 多朝代数据校验：结构、年份区间、题库分布、重复题干
   用法：node check-data.mjs */
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "data");
const ctx = { window: {} };
const files = fs.readdirSync(DIR).filter(f => f.endsWith(".js")).sort();
for (const f of files) {
  const code = fs.readFileSync(path.join(DIR, f), "utf8");
  new Function("window", code)(ctx.window);
}

const dyns = ctx.window.DYNASTIES || {};
const list = ctx.window.DYNASTY_LIST || [];
const problems = [];
const say = (d, msg) => problems.push(d + ": " + msg);

function chapterIndexOf(d, y) {
  for (let i = d.chapters.length - 1; i >= 0; i--) if (y >= d.chapters[i].s) return i;
  return 0;
}

for (const [id, d] of Object.entries(dyns)) {
  const m = d.meta;
  if (!m || m.id !== id) say(id, "meta.id 与键名不一致");
  for (const k of ["emps", "chapters", "questions", "events", "cats"]) {
    if (!Array.isArray(d[k]) || !d[k].length) say(id, k + " 缺失或为空");
  }

  // 数组空洞（逗号漏写会生成 elision，界面会少一张卡）
  d.chapters.forEach(c => {
    for (let i = 0; i < c.items.length; i++) {
      if (!(i in c.items) || !c.items[i] || !c.items[i].t) say(id, c.id + " items 第 " + i + " 项为空位");
    }
  });
  for (let i = 0; i < d.questions.length; i++) {
    if (!(i in d.questions) || !d.questions[i] || !d.questions[i].q) say(id, "questions 第 " + i + " 项为空位");
  }

  // 章节
  d.chapters.forEach((c, i) => {
    if (i && c.s <= d.chapters[i - 1].s) say(id, c.id + " 起始年未递增");
    if (c.e < c.s) say(id, c.id + " 结束年早于起始年");
    if (!c.t || !c.lead) say(id, c.id + " 缺论点或导语");
    if (!c.items || c.items.length < 5) say(id, c.id + " 卡片少于 5 张");
    c.items.forEach(it => {
      if (it.y < c.s || it.y > c.e) say(id, c.id + " 卡片「" + it.t + "」年份 " + it.y + " 不在区间");
      if (!["emp", "pow", "war", "ppl", "cul", "rel"].includes(it.k)) say(id, "卡片「" + it.t + "」类别非法");
      if (it.k === "rel" && !it.facts) say(id, "文物「" + it.t + "」缺 facts");
    });
  });

  // 题库
  const stems = new Set();
  d.questions.forEach(q => {
    if (stems.has(q.q)) say(id, "题干重复：" + q.q);
    stems.add(q.q);
    if (!Array.isArray(q.o) || q.o.length < 2 || q.o.length > 3) say(id, "选项数异常：" + q.q);
    if (typeof q.a !== "number" || q.a < 0 || q.a >= q.o.length) say(id, "答案下标越界：" + q.q);
    if (!q.n || !q.s) say(id, "缺解析或出处：" + q.q);
    if (q.y < d.chapters[0].s || q.y > d.chapters[d.chapters.length - 1].e) say(id, "题目年份越界：" + q.q);
  });

  // 每章覆盖
  const per = d.chapters.map(() => 0);
  d.questions.forEach(q => per[chapterIndexOf(d, q.y)]++);
  per.forEach((n, i) => { if (n < 6) say(id, d.chapters[i].id + " 只有 " + n + " 道题（<6）"); });

  // 时间轴游戏
  if (d.events.length < 12) say(id, "事件少于 12 个");
  const ey = d.events.map(e => e.y);
  if (new Set(ey).size !== ey.length) say(id, "事件年份有重复");
  if (ey.some((y, i) => i && y <= ey[i - 1])) say(id, "事件未按年份递增");

  console.log(
    id.padEnd(5),
    "君主", String(d.emps.length).padStart(2),
    "章", d.chapters.length,
    "卡", String(d.chapters.reduce((a, c) => a + c.items.length, 0)).padStart(3),
    "题", String(d.questions.length).padStart(3),
    "每章", per.join("/"),
    "事", String(d.events.length).padStart(2),
    "类", d.cats.length
  );
}

const missing = list.filter(x => !dyns[x.id]);
console.log("\n已建朝代:", Object.keys(dyns).join(" "));
console.log("待建朝代:", missing.map(x => x.name).join(" ") || "（无）");

if (problems.length) {
  console.log("\n问题 " + problems.length + " 处：");
  problems.slice(0, 40).forEach(p => console.log("  ✗ " + p));
  process.exit(1);
}
console.log("\n全部通过");
