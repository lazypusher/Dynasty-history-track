# spec2spectre 保密改造：前端可见性与资产加密

> 前提（按你的口径）：不联网、客户自建模型、不考虑模型供应商侧的泄漏、用系统提示词约束 agent 不主动复述。
> 只关心：**用 DSH 的时候，客户在界面上能看到什么。**

---

## 0. 三个问题的直接回答

| 你的问题 | 答案 | 做法 | 成本 |
| --- | --- | --- | --- |
| 能否隐藏 `available_skills` 的明文显示 | **不能"隐藏"，但可以"不产生"** | 在产品 profile 里关掉 `tool-skill` 这一行，用自己的工具暴露技能 | 极低，改一行 YAML |
| 能否隐藏 / 不输出 `resourceBase: {kind:'directory'}` | **能，彻底消除** | 用自己的 provider 给 `opaque`，不给路径 | 极低，上一轮已实测 |
| 是否必须做成二进制加密 | **对这个目标：不必须。** 对"盘上不可读"这个目标：必须 | 两件事互不替代 | 见第 5 节 |

**但这三条都做到，界面上仍然会显示脚本和流程**——原因在第 1 节。所以真正要做的不是"遮 UI"，而是"改模型看到什么"。

---

## 1. 为什么"遮 UI"这条路走不通

我把客户端 bundle 翻了一遍，三个硬事实：

**① catalog 是持久化消息，前端有专门的渲染器，没有开关。**
`dsh-tool-skill` 每步发一条 `user/message`，`source.kind = "skill-catalog"`；客户端 `contextBody()` 用 `case "catalog"` 派发到 `CatalogBody`，逐条渲染 `name + description`（`client.js:4656`、`4900`）。
没有任何配置项能关掉它——它只有"存在"和"不存在"两种状态。

**② 工具结果是按"模型看到的内容"渲染的，这是 DSH 的设计原则。**
客户端把 `tool/result` 投影成 `tool-call` 节点（`client.js:10386`、`rootResult()`），内容来自结果本身。同一份代码里的注释写得很直白：

> "The text keeps its `<system-reminder>` framing verbatim — the framing is part of what the model read, so hiding it would misreport the request."

也就是说：**DSH 有意让界面忠实反映模型上下文**。想让界面不显示某段内容，得改客户端：渲染器注册在 `conversation.chat.node` 这个 slot 上（`client.js:7175`），去和内核抢同一个 key（`context` / `assistant-step`），本质是 fork 渲染层，跨版本必坏，而且只遮住这一个前端——会话导出、原始 JSONL、API 都还在。

**③ 更现实的一层：你的 profile 里已经装着 `@linxin666/dsh-client-ui-skill-explorer`。**
它是一个"技能中心"页面，**带可视化 SKILL.md 编辑器**，按来源分组列出所有技能——包括 `runtime registered` 的。也就是说：即使你把自己的目录藏好，这个第三方插件会把你注册的技能再列一遍。
**产品 profile 必须是白名单，不能是开发机 profile 的拷贝。**

**结论**：UI 是"结果"，不是"原因"。只要内容进了模型上下文，UI 就会显示；只要有人能装插件，就能找别的口子看。正确方向是让**模型根本不需要看到脚本正文和流程**——那时 UI 上自然什么都没有。

---

## 2. 正确做法：改"模型看到什么"

| # | 动作 | 界面上消失的东西 |
| --- | --- | --- |
| 1 | 关掉 `tool-skill` 行 | 整个 `<available_skills>` 块、技能名与描述列表 |
| 2 | provider 给 `opaque` 资源基 | 脚本目录的绝对路径 |
| 3 | 脚本改成工具调用 | 脚本源码、`.py` 文件名、目录树 |
| 4 | 流程改成代码里的状态机 | 每一步的完整流程、分支条件、阈值 |
| 5 | SKILL.md 去路径化（现在写死了 `skills/spec2spectre/...`） | agent `cat` 出整个知识库 |
| 6 | 脚本异常栈裁剪 | 崩一次就把源码片段打印出来（见第 6 节） |

改造后，界面上一次运行只剩：

```
[工具] s2s  { op: "build", arch: "lc_vco", name: "3C6NBY_1" }
[结果] {"ok":true,"round":"r2","files":["design.py","design.scs","design.svg"]}
```

——参数是你愿意让客户看到的，结果是产物清单。流程和代码都不在界面上。

---

## 3. spec2spectre 的改造形状

现在这个 skill 的形状是"文档 + 一堆脚本 + 一堆知识库，全靠模型读文档、拼命令行"。改造后是"薄壳 + 一个工具"。

### 3.1 工具面（4 个就够）

| 工具 | 入参 | 出参 | 替代了什么 |
| --- | --- | --- | --- |
| `s2s_plan` | `{ done: [stepId] }` | 下一步 + 参数提示 | SKILL.md 里 196 行的流程叙述 |
| `s2s_run` | `{ op, args }` | 紧凑 JSON（产物清单/关键数值） | `uv run python skills/spec2spectre/xxx.py ...` |
| `s2s_doc` | `{ sel }` | **一节**知识库内容 | `read kb/arch/ARCH_INDEX.md` 整份 |
| `s2s_kb_write` | `{ sel, patch }` | 写入结果 | 子 agent 直接改文件 |

`op` 到脚本的映射（按你 SKILL.md 里已经列出的入口）：

```
plan        → render/task_dir.py --new | --resume     （返回 task_root / round_dir）
build       → render/build_design.py --arch --name --dir --spec --size-only
emit        → render/build_design.py --arch --name --dir --config
render      → render/render_design.py <d> --dir
registry    → tools/build_registry.py --check
techfile    → tools/parse_techfile.py / tools/check_ranges.py
```

### 3.2 SKILL.md 从 196 行压到 ~30 行（模板）

```markdown
---
name: spec2spectre
description: 从 spec 生成 tsmcN28 Spectre 网表与原理图。用于新设计需求或性能指标驱动的电路设计。
---

# spec2spectre

不要自行推断流程。每次只做一件事：

1. 调 `s2s_plan`，把已完成步骤 id 传进去，按返回的 `next` 执行。
2. 执行一律调 `s2s_run({op, args})`。**不要自己拼命令行，不要访问任何文件路径。**
3. 需要依据时调 `s2s_doc({sel})`，一次只取一节。
4. 三道确认门（G1 指标 / G2 架构+模块 / G3 器件）仍用 AskUserQuestion，卡片只问决策。

禁止：输出文件路径、目录名、章节号、脚本名；禁止复述 `s2s_run` 的入参细节。
```

丢掉的东西：路径约定、脚本清单、Reference index、Common mistakes（这些全部挪进 `s2s_run` 的实现和 `s2s_plan` 的返回值里，必要时用 `s2s_doc` 分节取）。

### 3.3 目录怎么放

```
product-kit/                     # 不再叫 skills/spec2spectre
├── packages/spec2spectre.pack   # 可选：脚本+流程加密
├── kb/                          # 明文（要读、要写、要更新）
└── lib/tool.mjs                 # s2s_* 的实现
```

关键是**这个目录不能出现在模型可见的任何文本里**：不进 workspace、不在 SKILL.md 里、不在工具描述里。模型通过 `op` 名字调用，永远不需要知道它在哪。

---

## 4. 动态更新（你担心的那一点）

"执行结束后调子 agent 更新知识库"这件事，取决于更新器跑在哪：

| 方案 | 更新器形态 | 主会话 | 子会话/日志 | 评价 |
| --- | --- | --- | --- | --- |
| A | DSH 子 agent（现在的做法） | 干净 | **子 agent 会话会被创建，可被打开** | 会漏，且漏的是整份知识库 |
| B | 独立脚本，直连模型 API | 干净 | 不产生 DSH 会话 | **推荐** |
| C | 不接受更新 | — | — | 知识库不演进，不现实 |

**方案 B 的做法**：`s2s_run({op:"kb_update"})` 拉起一个脚本，脚本自己调模型 API（用客户已有的 key），拿到新知识后调 `s2s_kb_write` 落盘。DSH 侧只看到"开始/结束"两行，知识库内容从头到尾没进过任何会话。

如果知识库也要防"翻盘"：把 `kb/` 一起封进 pack，`s2s_kb_write` 在内存里改完立刻重封（2.7MB，毫秒级）。代价是每次更新重写整包，用原子写避免半包。

**我的建议**：脚本进 pack（静态、高价值、不用改），`kb/` 保持明文（要读要写、且被模型读到就会显示，封了只防"不用的时候翻盘"）。如果客户会翻目录，再整体封。

---

## 5. 加密放在哪一层（回答"是否必须"）

| 目标 | 前端隐藏够不够 | 说明 |
| --- | --- | --- |
| 客户在界面上看不到流程/脚本 | **够** | 前提是第 2 节 6 条都做到 |
| 客户在资源管理器里 `grep` 不到 | **不够** | 明文在盘上，一个搜索框搞定 |
| 客户把 profile 拷到别的机器能跑 | **不够** | 需要机器绑定密钥 |

所以：**不是"必须加密"，而是"前端隐藏"和"静态加密"解决两个不同的问题，不能互相替代。**

- 只做前端隐藏 → 界面上干净了，但盘上还是明文，遇到会翻目录的人等于没做；
- 只做加密 → 盘上干净了，但模型一读，界面上全出来了。

两条一起做才是完整的。上一轮的 `dsh-sealed-skill` 已经把"加密 + opaque + 工具执行"这条路跑通了，这里只需要把 `kb/` 部分换成 `s2s_doc` / `s2s_kb_write`。

---

## 6. 容易漏的四个口子（这个 skill 尤其要注意）

1. **Python traceback 会打印源码行。** 脚本一崩，`bash` 的结果里就有 `File ".../sizing.py", line 88, in ...` 加那行代码。必须在 `s2s_run` 里捕获异常，只回结构化错误（`{"ok":false,"code":"GEOMETRY_MISMATCH","hint":"..."}`），stderr 一律截断或丢弃。
2. **`__pycache__` 里的 `.pyc` 反编译成本极低。** 你的目录里已经有 `kits/common/__pycache__`。封 `.py` 却留 `.pyc` 等于没封。
3. **子 agent 会话**（第 4 节方案 A）是可打开的独立会话，别以为"子"就看不见。
4. **产物文件**（`review.md`、`topology.txt`、`config.json`）本来就是给客户看的，但里面别写内部推理过程和规则数值——这是内容纪律，不是技术问题。

---

## 7. 改造清单与验收

**改动量估计**：工具适配层 1 天（12 个 op 的壳 + 异常规范化），SKILL.md 重写半天，`s2s_doc` 分节半天，pack 化复用现成代码半天。总 2–3 天。

**验收（在客户 GUI 里逐项对照）**：

- [ ] 新会话里没有 `<available_skills>` 块
- [ ] 加载技能后，对话里没有超长的技能正文
- [ ] 跑一次完整设计，界面上只出现 `s2s_*` 的工具名、入参、紧凑结果
- [ ] 全文搜索界面（Ctrl+F、会话导出、`zstd -dc` 日志）搜不到 `sizing`、`kb/`、`.py` 路径
- [ ] 故意让脚本报错，确认结果里没有 traceback 和源码行
- [ ] 客户 profile 里没有 skill-explorer 之类会列技能的第二入口
- [ ] 磁盘上 `grep -r "SEVERITY"` 之类搜不到核心数值（如果做了加密）

---

## 8. 一句话总结

你的三个问题里，前两个是"能不能"，答案是**能，而且不用加密**；第三个是"要不要加密"，答案是**加密解决的是另一个问题**。
真正的难点不是藏 UI，而是把 196 行"告诉模型怎么做"的文档，换成"模型只调用、不阅读"的工具——这和你上一轮做的 L4 是同一件事。
