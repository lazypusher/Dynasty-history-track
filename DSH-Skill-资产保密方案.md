# 在 DSH 上给 Skill 做资产保密：插件设计与落地

> **结论**：能做，但必须先接受一个事实——**凡是交给模型的文本，等于交给了操作这台机器的人**。
> 所以方案不是"把 skill 藏起来"，而是把资产拆成两类，分别用不同手段处理：
>
> | 资产 | 能不能保密 | 手段 |
> | --- | --- | --- |
> | 判定规则、脚本、话术模板（真正能搬走卖钱的部分） | **基本可以**（挡住 T1–T2，显著抬高 T3 成本） | 密文分发 + 内存执行 + 不落盘 |
> | 流程骨架（必须让模型读到才能跑） | **做不到不可见**，只能抬高获取成本 | 打散、按需、可追溯 |
>
> 本文第 1 节先证明"为什么做不到不可见"，第 3 节给分层设计，第 5 节是已经跑通的原型。

---

## 1. 现状：一次 skill 调用，资产流到了哪 5 个地方

把 `dsh-skill` / `dsh-skill-filesystem` / `dsh-tool-skill` 的源码读完之后，泄漏路径是确定性的，不是猜测：

| # | 落点 | DSH 的实际行为 | 客户能不能拿到 |
| --- | --- | --- | --- |
| 1 | **磁盘明文目录** | `skill-filesystem` 扫描 `.dsh/skills`、`~/.dsh/skills`、`customSkillDirs` 等根目录，`readFile` 整份 SKILL.md | 直接 `cat`，连脚本目录一起 |
| 2 | **模型上下文** | `skill` 工具把正文原样塞进 `<skill_content>` 返回 | 界面里就能展开、复制 |
| 3 | **资源目录路径** | `resourceBase: { kind: 'directory', path }` 会渲染成"Base directory for this skill: `D:\...\scripts`"，模型据此 `ls`/`read` 全部脚本 | 一句话就能让 agent 把脚本念出来 |
| 4 | **会话日志** | 所有事件（含 `tool/result`）逐条写进 `session.v4.jsonl.zstd`，默认 zstd **压缩，不是加密** | `zstd -dc` 一条命令 |
| 5 | **模型供应商** | 正文随请求上传。客户自建模型时，它进了**客户的**推理集群 | 取决于部署形态 |

第 4 条实测证据（本机某个真实会话，`zstd -dc` 后 grep）：

```
A skill is a reusable set of task-specific instructions. The following skills are available in this session:
<available_skills>
- `diagnose-windows-sandbox-acl`: Use on Windows for unexpected DSH sandbox access denials...
```

这只是 **catalog**（只有 name + description）。同一套持久化路径写 `tool/result`，所以 skill 正文、脚本内容、工具输出一样会落地。**第 2 条和第 4 条是同一条数据流的两端：模型看见了，盘上就有了。**

> 换句话说：只要你保留"skill 正文 → 模型上下文"这条路，就别指望客户拿不到正文。真正的问题变成——**你愿意让多少东西走这条路**。

---

## 2. 威胁分层：决定你值得投入多少

| 层级 | 对手 | 现实中的行为 | 方案要做到 |
| --- | --- | --- | --- |
| **T1** | 普通业务用户 | 只用界面，最多复制粘贴对话 | 界面里看不到脚本/规则 |
| **T2** | 会用电脑的员工 | 打开 `~/.dsh`，`grep` 一遍 | 盘上没有明文，日志里没有正文 |
| **T3** | 有管理员/调试权限的 IT | 附加调试器、读进程内存、反编译 | 只能抬高成本 + 可追溯 |
| **T4** | 整机搬走/转售 | 把 profile 目录拷到别处跑 | 密文绑定机器 + 许可证 |

**关键判断**：企业现场 90% 的泄漏是 T1/T2——有人想看"这东西凭什么值这个钱"，然后翻目录、翻日志、翻界面。T3/T4 属于"要么走法律，要么走云端"，不该用工程手段硬扛。

原型是按"挡住 T1/T2、显著抬高 T3"设计的。

---

## 3. 五层防线（从便宜到彻底）

### L1 密文包 + 自定义 provider（已实现）

不装成 `.md` 目录，而是装成一个 `.pack`（AES-256-GCM，`scrypt` 派生密钥）。插件注册自己的 skill provider，在**内存里**解密。

- 盘上只有密文；
- `skill-filesystem` 根本发现不了它（不是 `.md`）；
- provider 的 `rank` 用 600，压过 project(100)/user(400/500) 等所有文件系统根——**万一客户目录里残留一份明文副本，也抢不过密文版**。

### L2 `resourceBase` 改成 `opaque`（已实现）

这是**性价比最高的一条**。默认实现会给模型一个绝对路径，等于把整个 `scripts/` 目录送给它。改成：

```js
resourceBase: { kind: 'opaque', description: 'Sealed product resources. Read them only through the sealed_* tools.' }
```

模型再也拿不到可 `ls` 的路径，只能走你提供的工具。**一行改动，堵掉第 3 条泄漏路径。**

### L3 脚本内存执行，不落盘（已实现）

不要再让模型"跑 `scripts/foo.py`"，改成调用 `sealed_run({ script, args })`：

- 脚本源码从密文里取出，通过 **stdin** 喂给 `python -` / `node -` / `bash -s`；
- **不写临时文件**，磁盘上没有中间态，结束后什么都查不到；
- 超时、输出截断、abort 由插件统一控制。

实测：跑完之后目标目录 `readdir` 与运行前完全一致。

### L4 把流程搬进代码（已实现演示）

这是唯一能真正藏住"流程"的办法：**别用散文描述流程，用代码实现流程**。

原型的 demo skill 里，`SKILL.md` 只剩"怎么驱动工具"的几句话，真正的东西在 `plan.py` 里：

```python
STEPS = [{"id":"classify","script":"classify",...}, {"id":"respond",...}, {"id":"close",...}]
# 传入已完成步骤，返回下一个动作
```

模型每次只能看到"下一步做什么"，看不到全局。**单次会话里永远拼不出完整流程**，拼出来也只是执行输出，不是规则。

代价：skill 的写法变了——从"文档"变成"薄壳 + 状态机"。这是本次方案里唯一需要你重构资产结构的地方。

### L5 远端执行（未实现，接口已预留）

脚本和流程留在你侧，客户现场只有一个 RPC 工具：

```
sealed_run → [HTTP/mTLS] → 你的执行服务 → 结果
```

- 资产物理上不在客户机器上，T3/T4 直接失效；
- 能按租户限流、计费、审计、随时下线；
- 代价：必须联网、要运维、延迟上升、客户数据要出境/出域（这往往比资产保密更难谈）。

**判断标准**：如果部署现场能连到你，且客户接受"业务数据出域"，L5 是唯一真正强的东西；否则 L1–L4 就是上限。

### 会话落盘（第 4 条路径）三个选择

| 选择 | 做法 | 成本 | 效果 |
| --- | --- | --- | --- |
| **A. 接受**（推荐，配合 L4） | 正文里本来就没有机密，落盘无所谓 | 0 | 靠 L4 保证"落盘的都不值钱" |
| B. 自建 `sessionPersistence` 加密后端 | 插件替换 `ctx.sessionPersistence`，事件落盘前加密 | 高（要重实现/包装 jsonl，牵动搜索、投影、UI、恢复） | T2 挡住，T3 挡不住 |
| C. 关掉持久化 | 不挂 persistence 插件 | 低 | **需验证**：影响续跑、搜索、会话列表，可能不可接受 |

我不建议在没有 L4 的情况下单独做 B——那只是把"明文在地上"换成"明文在内存里+密钥在同一台机器上"，投入产出不划算。

---

## 4. 方案对照

| 方案 | 流程保密 | 脚本保密 | 改动量 | 适用 |
| --- | --- | --- | --- | --- |
| 现状（明文目录） | ✗ | ✗ | 0 | — |
| **A. 只做 L2+L3** | ✗ | **✓** | 小（改 skill 写法 + 一个 provider） | 只想堵最大的洞 |
| **B. L1+L2+L3**（原型） | ✗ | ✓✓ | 中 | **推荐起点** |
| **C. B + L4** | **✓（分片）** | ✓✓ | 中大（资产要重构） | 流程本身就是核心 IP |
| **D. C + L5 远端** | ✓✓ | ✓✓✓ | 大（要服务端） | 资产极敏感 + 可联网 |

---

## 5. 交付物：已经跑通的原型

`dsh-sealed-skill/`，纯 ESM，无构建步骤，可直接装进 profile。

```
dsh-sealed-skill/
├── package.json          # dsh.bundle.patch → 装进 profile 即生效
├── cordis.patch.yml      # 插入 skill-sealed 一行
├── lib/
│   ├── pack.js           # AES-256-GCM 封装 / scrypt 派生 / 机器绑定密钥
│   ├── core.js           # 解包后的目录：summaries/definition/run/doc
│   ├── runner.js         # stdin 执行（node/python/bash），超时+截断
│   └── index.js          # cordis provider + 4 个工具
├── bin/seal.mjs          # 明文源码树 → .pack
├── assets/demo.pack      # 演示包（密文）
├── examples/demo-skill/  # 明文源码（只在你这侧，不进客户镜像）
└── test/smoke.mjs        # 23 项自测
```

它给模型暴露 4 个工具：

| 工具 | 作用 | 为什么这样设计 |
| --- | --- | --- |
| `sealed_assets` | 列出脚本 id / 文档 topic + 一句话说明 | 让模型"知道有什么"，但拿不到内容 |
| `sealed_run` | 内存执行一个脚本 | 替代 `bash scripts/foo.py` |
| `sealed_doc` | 按 topic 取一段参考文档 | 一次只给一个片段，不给整份 |
| `sealed_status` | 报告 pack 摘要与构建时间 | 现场排查 + 版本溯源 |

实测输出（`node test/smoke.mjs`，在允许子进程的环境中全绿）：

```
ok   pack is ciphertext (no plaintext skill text)
ok   wrong secret fails authentication
ok   tampered ciphertext fails authentication
ok   catalog lists an opaque resource base and no path
ok   skill body carries no rules or script bodies
ok   sealed python script runs and returns a graded result
ok   script run leaves no file behind
ok   flow state machine lives in the sealed script
ok   node runs from stdin too / bash runs from stdin too
ok   timeout kills a runaway script
ok   plugin registers provider and four tools
ok   provider.list()/get() serve the sealed skill
ok   sealed_run rejects an unknown id with guidance
```

> 注意：DSH 自己的 `workspace-write` 沙箱禁止子进程管道，所以在沙箱内跑测试会自动跳过执行类用例。**这是环境限制，不是插件问题**——插件运行在宿主进程（profile 安装的 Host 代码本来就在沙箱外）。但要记住一点：如果客户把 DSH 放进更严的容器里限制 `spawn`，`sealed_run` 会失效，届时退回 L5 远端执行。

### 密钥怎么放

| 场景 | 方式 | 说明 |
| --- | --- | --- |
| 开发 | `DSH_SEAL_KEY=...` | 不要进生产 |
| **离线现场（推荐）** | `bin/seal.mjs --write-keyfile assets/x.key` | 密钥用"机器指纹"二次封装，拷到别的机器解不开；作用是**防拷贝**，不是防同机逆向 |
| **在线现场** | 首次启动向你的授权服务换密钥，写进同一个 keyfile | 之后可离线跑；换机/过期自动失效 |

要诚实：机器绑定是混淆，不是硬件信任根——密钥派生代码就在同一块盘上。它的边界是"阻止把 profile 整个拷走",不是"阻止反编译"。

---

## 6. 落地路径

```bash
# 1) 你自己的 CI：明文资产 → 密文包，明文不进客户镜像
node bin/seal.mjs --src ./product-skills --out ./assets/product.pack \
                  --secret "$SEAL_SECRET" --assert-no-plaintext

# 2) 发到私有 npm / 或直接带 tarball 到现场
npm pack            # 产出 dsh-skill-sealed-0.1.0.tgz（不含 examples/）

# 3) 现场：装进产品 profile
dsh plugin --profile product add ./dsh-skill-sealed-0.1.0.tgz
#    等价于在 profile 的 package.json 里加依赖，并在 dsh.profile.bundles 里追加包名

# 4) 冒烟
dsh --profile product --dump-config | grep skill-sealed
dsh headless --profile product "看一下 sealed_status 报告的是哪个 pack"
```

打包纪律（写进 CI）：

- `assets/*.pack` 进包，`examples/` **绝不**进包；
- 构建机 `--assert-no-plaintext` 校验同目录没有残留 `.md`/`.py`；
- 每个客户发**不同的** `--secret`，并在 pack 里带上客户编号（见下节水印），泄漏可溯源。

---

## 7. 防不住什么（请直接写进合同）

| 手段 | 说明 | 补位 |
| --- | --- | --- |
| 进程内存取证 / 调试器 | 运行期明文必然在内存里 | 只能靠合同 + 审计 |
| 让模型复述正文 | 模型看见过就有概率说出来 | prompt 约束不可靠；L4 让"看见的"不值钱 |
| 会话日志里的 catalog 描述 | description 是必须给模型的 | 把 description 写成"能力"而非"方法" |
| 客户端改写 | 有管理员权限的人能改插件 | 签名校验 + 远端心跳 |
| 转售/搬运 | | 机器绑定 + 许可证到期 |

**水印建议**（便宜且有效）：给每个客户生成 pack 时，在正文里植入一个零宽字符序列或一个固定的"步骤 id 别名"，映射到客户编号。正文一旦流出，`grep` 就能定位到是谁。原型没实现，但 `seal.mjs` 里加 20 行即可。

---

## 8. 需要你拍板的三件事

1. **现场能不能连到你的服务？**
   能 → 值得做 L5，资产保密从此是"物理隔离"级；
   不能 → L1–L4 就是上限，别在客户端加密上过度投入。

2. **客户是自建模型还是走你的云端？**
   自建 → 第 5 条泄漏路径归客户，正文尽量少给（L4 更重要）；
   云端 → 正文在你的信任域内，风险主要在前 4 条。

3. **流程骨架愿意重构到什么程度？**
   只想"堵洞" → 做 L2+L3，改动很小，但流程仍可见；
   要"流程也不可见" → 必须做 L4，把散文流程改写成状态机/脚本，这是本次唯一的重构成本。

---

## 附：关键实现片段

**注册 provider（替代 skill-filesystem 的角色）**

```js
ctx.skills.registerProvider(() => ({
  name: providerName,
  async list() {
    const sealed = await catalog()
    return { candidates: sealed.summaries(), complete: true }   // resourceBase 已是 opaque
  },
  async get(candidate) {
    const sealed = await catalog()
    return sealed.definition(candidate.name)                     // 正文在内存里解密
  },
}))
```

**不落盘执行**

```js
spawn(interpreter, ['-', ...args], { stdio: ['pipe', 'pipe', 'pipe'] })
child.stdin.end(code)      // 脚本从 stdin 进解释器，磁盘上没有它
```

---

*本文的证据均来自实际读取 `app.asar` 内的 `@deepseek-ai/dsh-skill`、`dsh-skill-filesystem`、`dsh-tool-skill`、`dsh-tools`、`dsh-session-persistence-jsonl` 源码，以及本机真实会话日志。原型代码见 `dsh-sealed-skill/`。*
