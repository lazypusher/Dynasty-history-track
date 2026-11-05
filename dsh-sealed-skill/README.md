# @yourco/dsh-skill-sealed

用**加密包 + 自定义 provider** 交付 DSH 技能，替代明文 `SKILL.md` 目录：

- 磁盘上只有 `.pack`（AES-256-GCM），没有明文 SKILL.md、没有脚本源码；
- `resourceBase` 是 `opaque`，模型拿不到可 `ls`/`read` 的目录路径；
- 脚本通过 stdin 喂给解释器执行，**不写临时文件**；
- 参考文档按 topic 分片取用，一次只给一段。

设计取舍、威胁模型和"防不住什么"见仓库根目录的
[`DSH-Skill-资产保密方案.md`](../DSH-Skill-资产保密方案.md)。

## 安装

```bash
npm pack                                     # 或直接给目录
dsh plugin --profile <profile> add ./dsh-skill-sealed-0.1.0.tgz
```

等价于在 profile 的 `package.json` 里把包加进 `dependencies` 和 `dsh.profile.bundles`。
包自带 `cordis.patch.yml`，安装后自动插入 `skill-sealed` 一行。

## 生成密文包

明文源码树里放一个 `skill.json`：

```json
{
  "name": "complaint-triage",
  "description": "客诉工单分诊：分级、定责与处置建议。",
  "whenToUse": "用户提供客诉工单文本，或要求对投诉做分级时。",
  "contentFile": "SKILL.md",
  "scripts": [
    { "id": "plan", "lang": "python", "file": "scripts/plan.py", "description": "推进流程，返回下一步" }
  ],
  "docs": [{ "id": "sla", "title": "SLA 阈值", "file": "docs/sla.md" }]
}
```

```bash
node bin/seal.mjs --src ./product-skills --out ./assets/product.pack \
                  --secret "$SEAL_SECRET" --assert-no-plaintext
# 可离线部署的现场：把密钥绑到本机
node bin/seal.mjs --src ./product-skills --out ./assets/product.pack \
                  --secret "$SEAL_SECRET" --write-keyfile ./assets/product.key
```

`--src` 可重复，把多个技能打进一个包。`SKILL.md` 可带 YAML frontmatter（会被剥离，元数据以 `skill.json` 为准）。

**打包纪律**：`examples/` 与明文源码树只在你这侧，绝不进客户镜像；CI 里用
`--assert-no-plaintext` 兜底。

## 密钥

优先级从高到低：

1. `config.key`（开发用，别进生产）
2. 环境变量 `DSH_SEAL_KEY`
3. `config.keyFile` / `DSH_SEAL_KEY_FILE`：机器绑定的密钥文件

机器绑定用"主机名 + 网卡 MAC + 平台"派生，作用是**阻止把 profile 目录拷到别的机器跑**。
它是混淆，不是硬件信任根——派生代码和密钥在同一块盘上，挡不住有调试权限的人。

在线部署可以在首次启动时向授权服务换取密钥并写入同一个 keyFile，
之后离线可用；换机或到期自动失效。这个交换逻辑留给你接（`lib/pack.js`
的 `resolveSecret` 是唯一入口）。

## 模型看到的四个工具

| 工具 | 用途 | 泄漏面 |
| --- | --- | --- |
| `sealed_assets` | 列出脚本 id / 文档 topic + 一句话说明 | 只有 id 和说明 |
| `sealed_run` | 执行一个脚本，返回 stdout | 只有执行输出 |
| `sealed_doc` | 按 topic 取一段文档 | 一次一段 |
| `sealed_status` | pack 摘要、构建时间、技能名 | 版本信息 |

这些名字可以在 `lib/index.js` 里改。技能正文里要写清"先调 `sealed_assets`，
用 `sealed_run` 推进流程"，否则模型不知道有这些工具。

## 自测

```bash
node test/smoke.mjs
```

23 项检查：加解密与篡改检测、opaque 资源基、正文不含规则、脚本执行不留文件、
流程状态机、工具挂载与调用。**注意**：如果当前 shell 被 DSH 的
`workspace-write` 沙箱限制（子进程管道被禁），执行类用例会自动跳过并标注原因——
插件本身运行在宿主进程里，不受该限制。

## 已知限制

- 正文仍然会进模型上下文，也就进了会话日志。想彻底不留痕，需要把流程改写成脚本
  状态机（方案文档 L4），或做远端执行（L5）。
- `sealed_run` 依赖宿主允许 `spawn` + 管道。更严的容器里会失败，届时走 L5。
- 一次脚本调用只能看到它自己的输出；跨步骤状态由脚本自己维护（demo 用"已完成步骤数组"）。
- 工具名、技能名不要和客户已装插件撞名；`rank` 默认 600，压过所有文件系统根。
