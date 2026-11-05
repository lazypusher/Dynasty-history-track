# eADA 桌面版 —— 可行性分析与技术路线（v5 · Linux 单机）

> 分析对象：`D:\Workspace\eADA_DSH`（当前 web 形态，`deploy/` 用 Docker 启动）
> 分析基线：本机 dsh `0.2.1-rc.3`；仓库/profile 锁定 `@deepseek-ai/dsh@0.2.0-rc.2`
> v2：VNC 退役 → eADA 与 Virtuoso 同机
> v3：确定只做 Linux 桌面版
> v4：Virtuoso 不在平台内启动/渲染，按钮 = 执行一条 bash 命令（可选叠加 SKILL）
> **v5：web 版暂时保留 VNC** → 两版共存，VNC 从"删除"改为"能力开关"
> 状态：**方案待定稿，本期不实现**

---

## 0. 结论

**可行。v5 的决定（web 保留 VNC）改变了实现顺序，但没有推翻架构 —— 只是把"删代码"换成"加开关"。**

四条支撑：

1. **形态匹配**：Virtuoso GUI 只跑 Linux；同机后一条命令就能把界面唤到用户眼前，而"执行本机命令"只有桌面应用能自然做到。
2. **技术铺垫已在**：eADA 是「公开 CLI + 普通 profile」，`dsh --profile eada` 就是全部启动方式；UI 隐藏/品牌改造全在 profile patch + client 插件里。
3. **Virtuoso 侧极轻**：按钮 = 一条命令，平台不懂 Cadence，不管 PID/窗口/渲染，新增约 80–150 行。
4. **两版共存成本可控**：VNC 的 Host 半本来就是**独立 row**（`@eada/dsh-host-live/vnc`），桌面版关掉这一行即可；只有 UI 上一个 tab 需要加开关。

工时估算（1 人、熟悉 Electron、不含签名与 CI）：**5.5–8.5 人日**到可内测版
（比 v4 多约 0.5 人日：能力开关 + 两套回归）。

---

## 1. 范围

| 项 | 本期范围 |
|---|---|
| 目标平台 | **Linux x86_64 桌面**（有图形会话的工作站，与 Virtuoso 同机） |
| 交付形态 | 单机可执行 + 安装包（AppImage / deb / rpm） |
| 用户模型 | 单用户本地（不继承 portal 的登录/多用户体系） |
| Virtuoso 集成 | **只负责"执行命令"**：命令/参数/SKILL 由站点配置，平台做变量替换与转义 |
| VNC | **web 版保留；桌面版关掉**（能力开关，不删代码） |
| 不改动 | web/Docker 形态的行为（除新增 caps 接口外零行为变化） |
| 不做 | Windows/macOS、自动更新、代码签名、Virtuoso 画面内嵌 |

---

## 2. 两版共存的架构（v5 核心）

### 2.1 VNC 从"删"改成"关"

| 层 | 位置 | 处置 |
|---|---|---|
| Host 半（SSH 隧道 / WS 升级 / 凭据窄口，507 行） | `@eada/dsh-host-live/vnc` —— **独立 row**（profile patch L280 `id: eada-vnc`） | 桌面 profile 里 `- id: eada-vnc` + `disabled: true`。**零代码改动** |
| 桌面构建体积 | `eada-ui-artifact/vendor/novnc/`（前端懒加载 `/eada-api/vnc-lib/core/rfb.js`） | 桌面安装包**可以不打包**该目录；代码留在仓库给 web 用 |
| UI 的 `vnc` tab | `eada-ui-artifact/client.js`（2020 行里约 400+ 行是 VNC 段） | **不能整行禁用**（会连产物面板一起没了）→ 需要 tab 级开关，见 §2.2 |
| `remote-config` 的 `vncPort`/`vncPassword` | `eada-host-live/lib/remote-config.js` + 前端表单 | 桌面版隐藏该分组（同 caps 驱动） |

> 也就是说：**Host 侧一行 YAML 就能关掉，Client 侧需要一个小开关**。这是 v5 唯一的新增工作量。

### 2.2 能力开关：一个 profile + caps 接口（推荐）

**不要做两个 profile。** 理由：那份 48KB 的 `cordis.patch.yml` 已由 `deploy/sync-profile-template.mjs` 从开发机 profile 生成，
再复制一份 `eada-desktop` 必然漂移 —— 与你们文件里反复写的"平台行为唯一事实源"原则相冲突。

推荐做法：**一个 profile `eada`，靠环境变量分版**。

```
EADA_EDITION=desktop   # 桌面版；缺省 = web
```

三处消费它：

1. **profile patch 里的 row 级开关**（`!!js` 已在该文件大量使用，机制现成）：

```yaml
- id: eada-vnc
  disabled: !!js process.env.EADA_EDITION === 'desktop'
```

2. **Host 侧能力接口**（新增，约 30 行）—— 前端唯一的判断依据：

```
GET /eada-api/platform/caps
→ { edition: 'desktop'|'web', vnc: false, virtuoso: true, portal: false }
```

3. **Client 侧按 caps 渲染**：artifact 面板的 tab 列表由 caps 决定 ——
   `vnc` tab 只在 `caps.vnc` 时出现；`virtuoso` 入口只在 `caps.virtuoso` 时出现。

> 为什么不让 client 读自己的 row config：客户端配置链路要验证、且桌面壳一旦换注入方式就断。
> **能力属于 Host，前端只消费一个 caps 响应** —— 这条边界最省心。

### 2.3 两种形态的差异一览

| 能力 | web（现状） | 桌面（目标） |
|---|---|---|
| 打开 artifact / 网表 / 仿真结果 | ✅ | ✅ 不变 |
| 看远端 Virtuoso 画面 | ✅ VNC | ❌ 关掉 |
| 本机唤醒 Virtuoso | ❌（命令在服务器跑，界面没人看） | ✅ 命令按钮 |
| portal 登录 / 用户管理 | ✅ | ❌ 删掉（单用户） |
| 多用户隔离 | ✅ 每用户一容器 | 不适用 |

---

## 3. Linux 专属风险（承 v3，按"会不会翻车"排序）

### 3.1 发行版与运行时基线 —— **P0 前实测，可能反过来决定技术选型**

| 风险 | 说明 | 处置 |
|---|---|---|
| glibc 过旧 | 新版 Electron 只保证较新发行版（大致 RHEL/CentOS 8+、Ubuntu 20.04+）。**RHEL 7（glibc 2.17）基本跑不起来** | 降 Electron 大版本，或改系统 WebView（Tauri） |
| FUSE 缺失 | AppImage 依赖 libfuse2，RHEL 8/9 默认不装 | `--appimage-extract-and-run` 兜底，或改 deb/rpm/tar.gz |
| Electron 沙箱 | 部分加固发行版关闭 unprivileged user namespaces，`chrome-sandbox` 未 setuid 时启动即崩 | deb 自带 setuid sandbox；AppImage 场景给 `--no-sandbox` 开关 |
| 系统库缺失 | 最小安装常缺 `libgtk-3` / `libnss3` / `libasound2` / `libgbm` | deb/rpm 声明 `Depends`；AppImage 文档给清单 |
| NFS home | 单实例锁与 SQLite 在 NFS 上不可靠 | `userData` 落本地盘；至少实测一次 |
| SELinux | 从 NFS/家目录启动可执行文件偶发被拦 | 文档给 `chcon` / `unconfined_u` 处置 |

### 3.2 图形会话：X11 / Wayland

Virtuoso 是 X11/Motif 程序，靠 XWayland 在 Wayland 下显示。判定看 `DISPLAY`；
纯 Wayland 无 XWayland 时按钮置灰并说明原因；必要时补 `GDK_BACKEND=x11`。

### 3.3 打包与桌面集成

- 主推 **AppImage**，辅以 **deb/rpm**（可声明依赖）；
- **`.desktop` 必须写 `StartupWMClass`** 且与 `app.setName()` 一致，否则任务栏会另起一个 "Electron" 图标；
- **不要依赖托盘**：GNOME 默认无 AppIndicator 扩展，"最小化到托盘"= 应用消失；
- 单实例锁基于 `userData`，落 NFS 要实测。

### 3.4 Python 与字体

- venv 是 `bin/python`（`python-env.js` 已平台感知）；
- 打包 `uv` + 离线 wheel，或内置 venv（约 +370MB）；
- **中文字体**：matplotlib 无 CJK 字体会把报告中文画成方框，EDA 工作站最小安装常缺 —— P3 就要定。

### 3.5 进程与信号

dsh 退出按**进程组**清理：`spawn(..., {detached:true})` + `process.kill(-pid,'SIGTERM')`；
只 kill 父进程会留下 `bash`/`python` 孤儿。

---

## 4. 关键约束

### 坑 1 ⚠️ 命令的**环境**必须自包含

Cadence 依赖 `LM_LICENSE_FILE`/`CDS_LIC_FILE`、`CDS_*`、`PATH` 里的 `tools/bin`、`.cshrc`/`module load`。
双击图标启动的 Electron，`process.env` 只有最小集。

**结论：把环境装配放进命令模板本身。** 三条路对比：

| 做法 | 可靠性 | 备注 |
|---|---|---|
| **模板里 `source` 站点脚本**（推荐） | 高 | 与 app 启动方式无关 |
| 平台采样登录 shell（`-ilc` / `tcsh -c`） | 中 | `module load` 场景常漏；DSH 官方桌面版用这招兜底（`app.asar/lib/main.js:9336`） |
| 依赖 PTY 的交互式 shell | 中 | 终端 shell 是 `-i`（**非 login**，`api-terminal-controller/lib/types/shells.js:19`）：`.bashrc` 会读、`.profile` 不会 |

命令失败时，把采样的登录环境一并打进日志，现场可用 `env | sort` 对照。

### 坑 2 ⚠️ 命令不能挂在平台终端的生命周期上

`ui-sidebar-terminal` → `api-terminal-controller` 有**闲置回收**：`unattendedTimeoutMs` 默认 **2 小时**
（`lib/index.js:760`）；关闭标签、无窗口持有时进入倒计时；`inspectActivity()` 判定"有活动"会重置，
但**Virtuoso 在前台运行算不算"有活动"未实测**。

→ 命令模板必须自带 detach（`nohup setsid … &`），别赌终端保活。
顺带解决"关终端/关应用不该杀用户工作现场"（v4 的坑 3 由此消解）。

### 坑 3 ⚠️ **不要**在 preload 里暴露名为 `dshDesktop` 的全局

dsh 自己的客户端代码会做 `"dshDesktop" in globalThis` 特征检测
（`dsh-client-ui-chat/lib/client.js:13146`：命中时把 transcript 默认视图切成 `standard`）。

→ 桌面壳**只暴露 `__DSH_DIRECTORY_PICKER__`**（`directory-picker-native/lib/client.js:63` 会检测），
不要顺手造一个 `dshDesktop` 名字的桥 —— 会静默改变聊天界面行为，且极难定位。

### 坑 4 ⚠️ 无图形会话必须降级

Host 侧不注册命令路由；`/status` 返回 `ok:false` + 具体 `why`；前端置灰给可操作提示。

### 坑 5 ⚠️ 不能叫 `desktop`

`dsh` 的 `rejectElectronProfile()` 对 `--profile desktop` 直接报错。继续用 `eada`。

### 坑 6 ⚠️ `@deepseek-ai` 双实例

profile 里再装一份 `@deepseek-ai/*` 会与内置 dsh 构成两个实例 →
「设置 → 模型」保存报 `profile reload requires the root Include entry`。
Linux 直接 symlink（无需管理员）。Dockerfile 里已踩白，桌面版会原样复现。

### 坑 7 ⚠️ 版本锁死，升级 = 重放补丁

profile 的 `dsh-base|dsh-web-app` 必须与内置 dsh 同版本；
`patch-dsh.mjs` 的 `from` 串、`client.js` 的 class hash 都跟版本走。

### 坑 8 ✅ `dsh-app://` 协议：不推荐（非禁止）

仍建议直接 `loadURL('http://127.0.0.1:<port>/?token=…')`：省 ~300 行协议代码、
fetch/SSE/WS 走 Chromium 原生、未来加"终端/实时日志"零成本。

---

## 5. Virtuoso 集成

### 5.1 模型

```
按钮 → [模板 + 变量] → 一条 bash 命令 → 执行通道 → Virtuoso GUI（+ SKILL 加载原理图）
```

**平台不认识 Cadence**，只认识：命令模板（站点配置）、变量（平台提供）、执行通道。

守住这条边界 —— 一旦平台开始内置 `-library/-cell/-view` 之类语义，
版本差异与站点差异就变成平台的维护负担。

### 5.2 命令模板与变量

```bash
EADA_VIRTUOSO_CMD='source /tools/cadence/cshrc >& /dev/null \
  && nohup setsid virtuoso -replay "${EADA_IL}" \
       > "$HOME/.eada/virtuoso-$(date +%s).log" 2>&1 &'
EADA_VIRTUOSO_IL_TEMPLATE='/opt/eada/skills/open-cell.il.tmpl'
```

平台只做：**变量替换 + shell 转义**（`shQuote`）。变量限定为：

| 变量 | 来源 |
|---|---|
| `${EADA_DESIGN_DIR}` | 任务根（`eada-host-live/lib/roots.js` 的设计基准） |
| `${EADA_LIB}` / `${EADA_CELL}` / `${EADA_VIEW}` | 前端传参（白名单字段） |
| `${EADA_IL}` | 平台按站点模板生成的临时 SKILL 路径 |
| `${EADA_SESSION_ID}` / `${EADA_RUN}` | 会话/轮次，便于日志归因 |

**SKILL 叠加**：平台只按模板生成临时 `.il`（内容由站点决定，如 `deOpenCellViewByType(...)`），
**怎么交给 Virtuoso 由命令模板决定**（`-replay`、写进 `.cdsinit`、或 `load()`）。

### 5.3 执行通道

| 通道 | 实现 | 适用 |
|---|---|---|
| **A. 平台自带终端**（推荐桌面版） | 复用 `ui-sidebar-terminal` / `webTerminals`：新开标签并写入命令行 | 用户看得见命令与输出，出错能现场补 |
| B. 后台 exec | `spawn(shell, ['-lc', cmd])`，stdout 落日志 | 无终端 UI；纯批处理（`-nograph`） |
| C. 仅复制命令 | 前端"复制"按钮 | web 远端形态的过渡 |

推荐：**桌面版走 A**（web 版本来就有 VNC，不需要这条）。

### 5.4 预检

```
GET /eada-api/virtuoso/status
→ { ok, why?,
    checks: { shellEnv, virtuosoBin, license, display, cshrc } }
```

判定三件套：Linux、有 `DISPLAY`、站点 `EADA_VIRTUOSO_CMD` 非空。
`virtuosoBin` 用**在命令模板环境里**执行的 `command -v virtuoso`（否则会误报）。
缺哪项说哪项 —— 现场必然发生。

### 5.5 安全边界

- 命令模板**只来自站点配置**，绝不接受前端 shell 串；
- 前端只传 `library/cell/view`，全部 `shQuote`；
- 路由仅回环可达；
- 生成的 `.il` 写临时目录并限大小。

### 5.6 v5 之后的两版分工

| | web | 桌面 |
|---|---|---|
| 远端 Virtuoso 画面 | VNC（保留） | — |
| 本机 Virtuoso | — | 命令按钮 |
| 命令模板 / 预检 | 保留 capability 代码，但 caps 关闭 | 启用 |

> 未来若确认"远端图形"需求消失，再一次性删净 VNC（`vnc.js` + noVNC + tab 段）。
> **现在不动它** —— 保留的代价是每次 UI 改动要跑两套验收，这点已计入工期。

---

## 6. 路线（P0–P5）

### P0 打通验证（1 人日，go/no-go）
1. `node deploy/run-local.mjs --port 8092` 起 eADA（现在就能跑）；
2. 30 行 Electron 脚本 `loadURL(url)`，确认品牌/隐藏项/预设/设置/artifact 预览；
3. **手工在目标机终端跑一遍目标命令**（`source` + `virtuoso` + SKILL），确认真能拉起窗口并加载原理图；
4. 把这条命令（detach 版）放进一个临时按钮，验证"点一下 → 界面出现、终端可关"。

> 第 3、4 步是关键关口；顺便确认 detach 后关终端 Virtuoso 是否还活着（坑 2）。

### P1 壳骨架（1–2 人日）
spawn dsh → 解析 `dsh web: <url>` → `loadURL`；单实例锁；退出按进程组清理；
崩溃自恢复；splash；preload 只暴露 `__DSH_DIRECTORY_PICKER__`（**不要叫 `dshDesktop`**，坑 3）。

### P1.5 能力开关（0.5 人日，v5 新增）
`EADA_EDITION` → profile patch 的 `!!js` 开关（先只关 `eada-vnc`）+ `GET /eada-api/platform/caps` +
artifact 的 tab 按 caps 渲染。**这一步对 web 必须零行为变化**，改完先跑一遍 web 回归。

### P2 打包（2 人日）
```
resources/app/
├── dsh/      内置运行时（含 dsh-web-frontend/dist）
└── eada/     L1 代码根：dsh/(5 插件) skills/ workflows/ vendor/ Virtuoso_Simulate_py/ tools/
resources/profile-seed/   预装 profile（node_modules 已剔除 @deepseek-ai）
```
`gen-profile.mjs` 首启跑；`patch-dsh.mjs` 构建期跑；软链去双实例；`asar:false` 或 `extraResources`；
`.desktop` + 图标 + `StartupWMClass`；AppImage/deb；**桌面包不含 `vendor/novnc/`**。

### P3 本机环境（1.5 人日）
Python（uv + 离线 wheel 或内置 venv）、`pythonPath`、中文字体；
站点配置本地化（`~/.config/eADA/site.env`，含 `EADA_VIRTUOSO_CMD` 与 `.il` 模板）；
`remote-config` 的 VNC 分组按 caps 隐藏；兜底：命令失败时把登录环境打进日志。

### P4 UI 收尾（1 人日）
Virtuoso 按钮 + 预检面板；portal 那套**直接删**（单用户桌面版没有登录/退出/用户管理，
`eada-platform-ui/client.js` 的账号条 `/admin` `/logout` 整体移除）；
版本/日志入口（`$DSH_HOME/logs`、`~/.eada/virtuoso-*.log`）、首次启动引导（填 API Key）。

### P5 升级与回归（持续）
`upgrade:dsh`：换版本 → 重建 runtime + profile → 重放补丁 → 跑 §8 两套清单。

---

## 7. 目标机预检清单（P0 之前）

- [ ] `cat /etc/os-release` + `ldd --version` → 发行版与 glibc（决定 Electron 版本）
- [ ] `echo $XDG_SESSION_TYPE $DISPLAY $WAYLAND_DISPLAY` → X11 / Wayland
- [ ] `sysctl user.max_user_namespaces` → Electron 沙箱是否可用
- [ ] `df -h ~` → home 是否 NFS
- [ ] `command -v virtuoso` / `module avail | grep -i cadence`
- [ ] `echo $LM_LICENSE_FILE $CDS_LIC_FILE`
- [ ] `ls /tools/cadence*/cshrc*` → 站点脚本路径
- [ ] **手动跑一次目标命令（含 SKILL），确认能打开原理图**
- [ ] `python3 --version` / `which uv`
- [ ] `fc-list :lang=zh | head` → 中文字体

---

## 8. 验收清单

### 8.1 桌面版（新增）

**平台核心**
- [ ] 品牌：侧栏九同方 logo + `eADA Platform` 字标（展开/折叠两态）
- [ ] 隐藏项：hero 标语与鲸鱼、工作区增删入口、预设分组标题、"标准模式"字样
- [ ] 预设：新会话默认 eADA；PTC 在；名录无 standard 卡片（standard 未被禁用）
- [ ] 设置：只有「通用设置」+「模型」；插件页/市场/反馈三件套不可见
- [ ] 窗口标题 = `eADA Platform`；设置 → 模型能保存自定义 provider（**验证无双实例**）
- [ ] artifact 预览、`/eada-api/work-mode`、技能中心列表非空
- [ ] **VNC tab 与"远程配置"的 VNC 分组不出现**（caps 生效）
- [ ] 聊天默认 transcript 视图未被意外切换（坑 3 回归项）

**Virtuoso 命令**
- [ ] `/status` 预检四项全绿
- [ ] 点按钮 → 终端可见命令回显，GUI 起来并加载对应原理图
- [ ] **带 detach**：关掉终端标签后 Virtuoso 仍在；关闭 eADA 后仍在
- [ ] 连点两次行为符合文档（并行 or 去重）
- [ ] 失败时日志含 stderr 尾部 + 实际使用的环境
- [ ] 无 `DISPLAY` 时按钮置灰且文案准确

**桌面壳**
- [ ] **从桌面图标（非终端）启动时命令仍可用**
- [ ] 冷启动到可交互 < 8s（首启放宽到 60s）
- [ ] 退出后无残留 `dsh`/`node`/`bash` 进程
- [ ] 双击两次被单实例锁拦住；任务栏图标正确分组

### 8.2 web 版（不得回归，v5 新增）

- [ ] VNC tab 存在且能连上（**每条 desktop 改动后都要跑**）
- [ ] 「远程配置」的 VNC 端口/密码仍在
- [ ] portal 登录、用户管理、退出登录正常
- [ ] 局域网访问三层 fence 仍成立（`ownsHost`、trustedHosts、回环源地址）
- [ ] `EADA_EDITION` 未设置时，caps 返回 `vnc:true`、`virtuoso:false`

---

## 9. 一页纸决策

- **形态**：Electron 薄壳 + 内置 dsh 运行时 + `--profile eada` + 窗口直载 `http://127.0.0.1:<port>`。
- **两版共存**：**一个 profile**，靠 `EADA_EDITION` 分版；VNC 在桌面版用 `disabled` 关掉，**不删代码**。
- **能力开关**：Host 出 `/eada-api/platform/caps`，前端只消费它 —— 不要前端各读各的配置。
- **Virtuoso**：一条可配置命令（模板 + 变量 + 可选 SKILL），平台不内置 Cadence 语义。
- **命令必须 detach**（`nohup setsid … &`），环境在模板里 `source`，别指望进程继承。
- **别造 `dshDesktop` 全局**：dsh 客户端会特征检测它并改聊天行为。
- **顺序**：加 caps 开关（web 零变化）→ 命令按钮 → 打包。
- **最早要确认**：目标机 glibc / X11-Wayland / Electron 沙箱（§3.1、§7）。
- **内测时间**：P0–P2 约 3.5–5 人日；含环境与 UI 收尾共 5.5–8.5 人日。
