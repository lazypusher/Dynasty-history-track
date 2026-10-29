# 中国朝代史 · 可视化学习站

按中国王朝更替的顺序，**每个朝代一页**：皇位更替时间轴、主线章节、人物与文物卡片、闯关练习。
纯静态、零依赖，双击 `tang-map/index.html` 就能用。

目前已建成 **汉、唐、宋、明** 四朝，其余朝代在顶部的朝代条中占位（标为「筹备中」）。

![唐朝首页](tang-map/shots/hero.png)

## 页面结构

顶部是**朝代切换条**，按时间顺序排列：夏 商 周 秦 汉 三国 晋 隋 唐 五代十国 宋 辽 金 元 明 清。
点哪个朝代就跳到 `?d=<id>`，页面重新加载该朝数据；没建好的朝代是虚线灰字。

每一页都包含五块：

### 1. 皇位更替 —— 中轴左右交替的竖时间轴

每位君主一条：在位年份、庙号、姓名、别称，以及最多三条治世评价或大事。
底色区分 **治世 / 平稳 / 乱局**，红点标记 **非正常继位**，顶部给出统计。

### 2. 主线章节 —— 每章一个论点

以唐为例：八章各有一句论点、一段导语，末尾一条**因果链**（如 `府兵瓦解 → 节度使掌兵财 → 中央失去制衡 → 安史之乱`）。

### 3. 卡片：六条线

**皇位 · 权力 · 战争 · 人物 · 文化 · 文物**，可单独筛选。

### 4. 文物展签

按博物馆展签格式：**年代 / 材质 / 出土地 / 馆藏** + 科普长文。有照片的可以点开放大（图片来源 Wikimedia Commons）。

### 5. 闯关

- 快问快答（连击加分，选项每次洗牌）
- 时间轴插卡（3 条命）
- 联想发散（同类检索）
- **考这一章**：每章标题右侧，只抽该章题目，答完自动结束

## 各朝代数据

| 朝代 | 君主 | 章节 | 卡片 | 题目 | 事件 |
|---|---|---|---|---|---|
| 汉（前202—220） | 22 | 6 | 64 | 46 | 17 |
| 唐（618—907） | 23 | 8 | 115 | 119 | 19 |
| 宋（960—1279） | 18 | 6 | 52 | 43 | 14 |
| 明（1368—1644） | 17 | 7 | 59 | 47 | 15 |

## 快速开始

```bash
git clone git@github.com:lazypusher/Dynasty-history-track.git
cd Dynasty-history-track
```

双击 `tang-map/index.html`（默认打开唐），或直接指定朝代：

```
tang-map/index.html?d=han
tang-map/index.html?d=song
tang-map/index.html?d=ming
```

上次看过的朝代会被记住（localStorage），下次打开直接进入。

## 目录

```
.
├── 中国朝代史自学手册.md        # 六周自学方案、卡片模板、可信度纪律
├── tang-map/
│   ├── index.html              # 壳层：渲染引擎 + 选朝条
│   ├── data/
│   │   ├── dynasties.js        # 朝代清单 + 唐
│   │   ├── han.js              # 汉
│   │   ├── song.js             # 宋
│   │   └── ming.js             # 明
│   ├── check-data.mjs          # 数据校验（结构 / 年份 / 题库覆盖）
│   ├── e2e.mjs                 # 端到端测试（唐，75 项）
│   └── shots/
└── tang-quiz/                  # 独立版闯关（旧）
```

## 加一个朝代

1. 新建 `data/<id>.js`，写 `window.DYNASTIES.<id> = { meta, emps, chapters, questions, events, cats }`
2. 在 `index.html` 里加一行 `<script src="data/<id>.js"></script>`
3. 确认该 id 已在 `data/dynasties.js` 的 `DYNASTY_LIST` 中

数据结构：

- `emps[i]` — `{n:庙号, p:姓名, y0, y1, m:继位说明, k:"盛"|"稳"|"乱", ab:1, al:别称, tags:[≤3]}`
- `chapters[i]` — `{id, y, s, e, t:论点, lead, items:[], chain:[]}`
- `items[j]` — `{t, y, k:"emp|pow|war|ppl|cul|rel", d, long?, mus?, facts?, img?}`
- `questions[i]` — `{y, q, o:[选项], a:正确项, n:解析, s:出处}`
- 年份用负数表示公元前（`-202` = 公元前 202 年）

写完跑 `node check-data.mjs`，它会检查：章节年份递增、卡片年份落在所属章节区间、题目答案下标、题干重复、每章题目数 ≥6、事件按年递增等。

## 测试

```bash
cd tang-map
node check-data.mjs     # 数据一致性
node e2e.mjs            # 页面行为（需本机 Chrome）
```

## 内容说明

- 史实以正史（《史记》《汉书》《旧唐书》《宋史》《明史》等）为主，出处标注到书名一级。
- 年份、馆藏等信息如有错误，欢迎提 issue。
- 文物照片来自 Wikimedia Commons，许可见对应文件页；本项目仅作个人学习用途。
- 代码 MIT，文字内容可自由使用（注明出处即可）。

## License

MIT
