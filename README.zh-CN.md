[English](README.md) | **简体中文**

# 🤖 MultiAgent Autopilot — Claude Code 的自动驾驶 phase 管线

> **一句话 TL;DR** — 你只需把需求**描述一次**。顶级模型对你做访谈、锁定一份 charter、写出自防御的执行计划。一个便宜的 CLI 模型(你 cc-switch 里的 provider,比如 GLM)**无头**实现每一个 brief —— 包括用截图亲自证明自己的 UI 成果 —— 而顶级 session 负责审查 diff、重跑验证、复核证据。你回来时面对的是一个已完成的 phase 和一份手把手教你测的 UAT runbook。
> **你只出现两次:需求访谈,以及最后的人工配置 + 验收。**

改编自(orchestrator · advisor · handoff)—— 把三个模式融合成一条管线,接在"双订阅"机器上(Anthropic 顶级模型 + cc-switch 里的副模型)。

---

## 🎯 适合谁

| 你是…… | 它替你解决…… |
|---|---|
| 在 Claude Code desktop(顶级模型)+ CLI 便宜编码模型之间两头跑的独立开发者 | 整天盯着两个窗口、互相复制粘贴 prompt |
| 做出来的 "v1" 老是停留在原型、上不了生产的人 | 每个 phase —— 包括第一版脚手架 —— 都被同一套 Definition of Done 把关 |
| 总是要靠自己手动 UAT 才发现 bug 的人 | 执行者用截图 + console 捕获为每条 UI 改动自证;顶级模型每个 phase 只做一次完整浏览器走查来签字 |
| 受够了随意、不标准测试文档的人 | 每个 phase 产出一份格式固定、手把手式的 runbook |

**前置要求:** Claude Code ≥ 2.x(desktop + CLI)· Node ≥ 22.5 · [cc-switch](https://github.com/farion1231/cc-switch) 且已配置你的 GLM provider · git。

---

## 📦 里面有什么

| 组件 | 职责 |
|---|---|
| `skills/phase-kickstart` | 跨 8 个领域盘问需求 → `PROJECT-CHARTER.md` → 一份 `handoff/` 计划(manifest · contracts · 编号 briefs · STATE 日志)。所有架构决策在这里定死,执行者从不做选择。 |
| `skills/phase-autopilot` | 无人值守主循环:按批 spawn CLI 模型、审查它的 diff("报告是线索不是事实")、亲自重跑验证、复核执行者的 UI 证据、对 deviation 做裁决(`ADVISOR.md`)、终审时做**唯一一次**亲手浏览器全面走查。可从 manifest 的 `NEXT:` 行恢复 —— 任何 session、任何一天。 |
| `skills/uat-runbook` | 把真正需要人做的事(bot、webhook、密钥、点部署)变成 TL;DR → 前置准备 → Localhost UAT → 生产 → 排错 的 runbook,带 TC 复选框。 |
| `scripts/autopilot/glm-run.mjs` | 两个模型之间的桥:从 cc-switch **按进程**读取 GLM env(绝不翻转你的全局切换)、prompt 走 **stdin**(Windows 安全)、**应答模型不是 GLM 就 exit 3 大声报错**(`MODEL_VERIFIED`)、用 `--loop N` 连续串接最多 N 个 brief —— **一旦某次运行没有推进 `NEXT:` 就立刻停链**(`LOOP_STALLED`)—— 并自带 `--dry-run`(零成本验线)、`--json`(机器可读结果)和自己的单元测试。 |

## 🔁 流程

```
requirements ─► /phase-kickstart   (你回答一次问题 → charter + handoff 计划)
                       │
                       ▼
               /phase-autopilot    (可以走开了)
               ┌──────────────────────────────────────┐
               │ 每批 (--loop 3):                     │
               │   CLI 模型无头实现,                  │
               │   并自己抓 UI 证据                    │
               │   (截图 + console,Playwright)        │
               │   顶级模型审查 diff + 证据、          │
               │   重跑验证                           │
               │   修 brief → 重派一次 → 亲自接手      │
               │   终审 = 唯一一次亲手                 │
               │   浏览器全面走查(仅顶级模型)        │
               └──────────────────────────────────────┘
                       │
                       ▼
               /uat-runbook  →  你:人工前置 + 最后验收 + 部署
```

两个模型从不共享对话记忆 —— **仓库就是共享记忆**(charter、`handoff/`、`STATE.md`、`CLAUDE.md`)。这正是管线可恢复、可审计、抗崩溃的根本原因。

---

## 🧰 安装

### 方式 A — 让你的 agent 装它(推荐,约 2 分钟)

把这一句 prompt 贴进 Claude Code(desktop 或 CLI,任何有文件 + shell 权限的 agent):

```
Help me install the MultiAgent-Autopilot skills:
https://raw.githubusercontent.com/pmgwee/MultiAgent-Autopilot/main/docs/install.md
```

agent 读完这份指南,问你两个问题(skills 装全局还是某个项目?runner 装进哪个项目?),复制好所有文件,再跑探针验线。
✅ **预期:** 结束时显示 `MODEL_VERIFIED=true`。

### 方式 B — 手动(5 分钟)

- [ ] **1. 拿到代码** — `git clone https://github.com/pmgwee/MultiAgent-Autopilot`,或点 **Code → Download ZIP** 解压。

- [ ] **2. 复制 skills** — 装全局(所有项目可用)或装进某个项目的 `.claude/skills/`:

```bash
# macOS / Linux / Git Bash — 全局:
cp -r MultiAgent-Autopilot/skills/* ~/.claude/skills/
```

```powershell
# Windows PowerShell — 全局:
Copy-Item -Recurse MultiAgent-Autopilot\skills\* "$env:USERPROFILE\.claude\skills\"
```

- [ ] **3. 把 runner 复制进【每一个】要跑这条管线的项目** —— 无头执行者 session 以那个项目根目录启动,日志和 commit 都归属那个 repo,所以 runner 必须放在项目里:

```bash
# macOS / Linux / Git Bash:
mkdir -p <你的项目>/scripts/autopilot
cp MultiAgent-Autopilot/scripts/autopilot/glm-run.mjs <你的项目>/scripts/autopilot/
```

```powershell
# Windows PowerShell:
New-Item -ItemType Directory -Force <你的项目>\scripts\autopilot
Copy-Item MultiAgent-Autopilot\scripts\autopilot\glm-run.mjs <你的项目>\scripts\autopilot\
```

- [ ] **4. 零成本验线**(免费 —— 只解析 provider、打印将会执行什么;不 spawn、不花任何 token):

```bash
node scripts/autopilot/glm-run.mjs --dry-run
```

✅ **预期:** 你的 GLM provider 名称 + base URL,且 `tokenLen` > 0。

- [ ] **5. 探针验线**(一次极小的 GLM 调用;在项目根目录,任意终端):

```bash
node scripts/autopilot/glm-run.mjs --probe
```

✅ **预期:** `MODEL_VERIFIED=true` 加上你副模型的 id(如 `glm-5.2`)。否则看下面的排错。

> 💡 cc-switch 里的 GLM 条目改过名?`--provider "<正则>"` 按 name/URL 选中它;`--expect-model "<正则>"` 跟进变化的 GLM 模型 id。

---

## ▶️ 使用

**第 1 步 · Kickstart —— 待在键盘前(唯一需要你的一步)**
在 **Claude Code desktop** 选最强模型跑:`/phase-kickstart` + 你的需求/rubrics/验收标准。
✅ **预期:** 几轮尖锐提问 → `docs/charter/PROJECT-CHARTER.md` + 一份 `handoff/` 计划,其 manifest 以 `NEXT: execute brief 01` 结尾。计划写完后它**会主动问你要不要立刻启动 autopilot** —— 答应,然后走开。

**第 2 步 · Autopilot —— 放手**
(如果上一步没答应:)`/phase-autopilot`
✅ **预期:** brief 按 ~3 个一批执行 —— desktop session 自己 spawn CLI 模型;**你再也不用往 CLI/VS Code 窗口里打字**。每个 commit 是 `handoff: brief NN <state>`;每个 UI brief 在 `handoff/evidence/` 留下截图 + console 证据。

**第 3 步 · 回来**
打开 `docs/runbooks/<phase>-runbook.md`,把复选框一个个做掉(这是仅有的人工步骤),最后看一眼,部署。

---

## 💰 保护顶级模型配额

desktop 套餐是稀缺资源;整条管线的形状,就是让天才只签字、不搬砖:

| 烧副模型(GLM)的 | 烧顶级 desktop 套餐的 |
|---|---|
| 全部实现、全部 brief | Kickstart 访谈 + 规划(一次性) |
| 它自己的验证运行 | 审查 diff + 重跑 regression(花 CPU 时间,不花多少 token) |
| **UI 证据:每条 UAT note 截图 + console 捕获(Playwright)** | 每 brief 抽查 1–2 张截图 |
| **Runbook 起草**(计划倒数第二个 brief) | Runbook **核真**(每条命令对着真实代码核实)+ Notion 发布 |
| 连跑 brief(`--loop 3` —— 一批一次 desktop 唤醒,而非一个 brief 一次) | deviation 裁决 · **终审的全面浏览器走查** |

**哪个 desktop 模型干哪个活**(地板由 skill 自己强制):

| Desktop 模型 | 角色 | 为什么 |
|---|---|---|
| Sonnet 级(Sonnet 5,默认 effort) | 例行循环:spawn · 审查 · 复核证据 | 订阅消耗最便宜;按 Anthropic 官方文档,coding/agentic 接近 Opus;遇到裁决或终审会自己停下 |
| Opus 级(Opus 4.8) | 备胎顶级:**原地**裁决 + 签字,零暂停 | 当最强模型窗口烧完时的兜底 |
| 最强(Fable 级) | Kickstart 访谈 + 规划 · 最难裁决 · 终审 | 判断力封顶整个项目质量的地方 |

另加一条:尽量**在批次边界开新 session** —— 状态在磁盘上,新 session 只需读一次 manifest,而不是重读一长段对话。

---

## 🎚️ desktop 模型怎么选、什么时候选

> ### 唯一一条规则
> **运行中的 session 无法切换自己的模型 —— 你在 desktop 选的模型,就是从头到尾跑的那个。** skill **不会**自动降档到便宜模型、再自动叫回最强模型。它只强制一道*地板*:便宜 session 撞到裁决或终审时**会停下、叫你切上去**(`NEXT: ruling required — resume on a top-tier model`)—— 它从不替你切。所以**每次 `/phase-autopilot` 之前,先看一眼模型选择器** —— 那就是接下来这一段谁在跑。

所以你的模型选择 = 你的操作模式:

| 模式 | 你怎么做 | 暂停次数 | 配额消耗 | 什么时候用 |
|---|---|---|---|---|
| **A · 全程 Fable 5** | 选 Fable,永不切 | 零(Fable 原地裁决 + 签字) | 最高 | **首跑** —— 你想盯它一次跑到底、中途不停 |
| **B · 全程 Opus 4.8** | 选 Opus,永不切 | 零(Opus 也是顶级 —— 原地裁决 + 签字) | 中等 | **省心默认** —— 不碰选择器,全程判断力在线 |
| **C · Sonnet 循环 + 签字时切上去** | 循环用 Sonnet;撞到裁决/终审时切 Fable/Opus | 每次裁决/终审停一次 | 最低 | 配额吃紧时 |

**终审不是非 Fable 不可 —— Opus 4.8 也算顶级、也能原地签字。** "需要顶级"指的是 Fable *或* Opus,不是特指 Fable。真正的 Fable 留给 kickstart 规划和最难的裁决 —— 那里峰值判断力决定整个项目的天花板。裁决很**稀**(只在 deviation / 锁定决策时出现,不是每个 brief),终审每个 phase 只**一次** —— 所以一个顺利的 phase,模式 C 可能整段循环都在 Sonnet 上跑,只在**最后终审那一下**需要你切上去。

### 首跑推荐走法

1. **Kickstart —— 选 Fable 5**,跑 `/phase-kickstart`。一次性、不循环、以思考为主 —— 基本不吃限额,放心用最强模型做访谈和规划。
2. 计划写完后它会问要不要启动 autopilot。**首跑:保持 Fable(模式 A),答应。** 它一次不停跑到底;你在旁边盯管线第一次实战 —— 格式咬合、GLM 的协议服从度、Playwright 证据。
3. **如果首跑中途 Fable 撞限额了:** 进度已在磁盘上(`handoff/` + `NEXT:` 行)。两个选择 ——
   - 想继续省心 + 不停:切 **Opus 4.8**,`/phase-autopilot` —— 它原地续跑、自己也能签字(模式 B)。
   - 想验证省钱模式:切 **Sonnet 5**,`/phase-autopilot` —— 循环在 Sonnet 上跑,终审时停下让你切上去(模式 C)。
4. **从第二个 phase 起:** 管线你已经信得过 —— 默认走**模式 B(全程 Opus)**或**模式 C(Sonnet + 签字时切上去)**,不必再全程 Fable 盯。

---

## ⏸️ 跑到一半停了?怎么恢复 —— 只看这一次

> ### 唯一一条规则
> **永远在 Claude Code DESKTOP(顶级模型那边)用一句 `/phase-autopilot` 恢复。**
> 绝不手动去 prompt CLI/GLM 窗口 —— 它只是管线随用随抛的无状态 worker。所有进度都在磁盘的 `handoff/` 里(不在任何对话中),所以**任何 session、任何一天、任何有这个 repo 的机器**都能从停下的地方接着跑。

| 你是因为……停的 | 怎么办 |
|---|---|
| Desktop(顶级)吃到限额 | 切一个更便宜的 desktop 模型,再 `/phase-autopilot` —— 在你选的那个模型上续跑(见上面的"desktop 模型怎么选");如果是 Sonnet 级,它会在裁决/终审时停下叫你切上去 |
| 副模型(GLM)吃到限额 | 循环自己暂停(`NEXT: awaiting-user — quota`)→ 冷却结束后:`/phase-autopilot` |
| 你合上笔记本 / 关了 app | 重开 desktop → `/phase-autopilot` |
| brief 跑一半崩了 | 同一句命令 —— autopilot 识别出崩溃的运行(一个 `in-progress` 行 + 残留改动),reset 到上一个完好的 `handoff:` commit,重跑那个 brief |
| kickstart 访谈被打断 | 再 `/phase-kickstart` —— charter 每轮问答后都存盘,答案不丢 |

---

## 🧯 排错

| 症状 | 原因 → 修法 |
|---|---|
| `MODEL_VERIFIED=false`(exit 3) | cc-switch 的 provider 改名/变了 → 调整 `--provider` 正则,再探一次 |
| `FATAL: no cc-switch provider…` | cc-switch 里没有副模型,或它没存 auth token |
| Autopilot 拒绝启动 | 脏 git 树且是**你自己**的未提交改动 —— 先 commit/stash(崩溃的管线运行会自动恢复;你的活绝不被碰) |
| 循环暂停:`awaiting-user — quota` | 副模型套餐耗尽 —— 等一下再跑 `/phase-autopilot` 即可 |
| 同一个 brief 一直失败 | 这是设计:重派一次,然后由顶级 session 亲自接手;一个 phase 里接手两次 = brief 切太大 —— 重新规划 |
| 执行者第一次跑 Playwright 很慢 | 每台机器一次性浏览器下载 —— 正常,之后有缓存 |
| runner 输出里出现 `LOOP_STALLED` | 某次运行 exit 0 却没推进 `NEXT:` —— 执行者偏离了协议 → autopilot 会把该 brief 按审查失败走 failure ladder;你无需做任何事 |

## 🔐 备注

- `glm-run.mjs` 绝不打印或记录你的 auth token。
- 无头 brief 在**你的 repo 内**以权限放行模式运行 —— 一切都纳入 git;每个 brief 恰好一个可追溯 commit,任何改动都可回滚。
- UI 证据在 `handoff/evidence/brief-NN/`(截图、console 捕获、一次性测试脚本)—— 本地产物,凡 `handoff/` 被 gitignore 的地方它也跟着被忽略。
- **范围收窄是有意为之:两个模型,一条线。** 这条管线只为一种组合而造 —— Claude Code desktop 上的 Claude 顶级模型 + 经 cc-switch 路由 GLM 的 Claude Code CLI。`--provider` / `--expect-model` 的存在是为了跟进改名的 GLM 条目和未来的 GLM 模型 id,不是为了接入其他厂商。
- runner 自带测试(纯逻辑 —— 不花任何 token):`node --test scripts/autopilot/glm-run.test.mjs`。改过 `glm-run.mjs` 之后记得跑。
- skills 是纯 markdown:改它,它就是你的。项目专属规则放进各项目的 `CLAUDE.md`(执行者协议把那个文件当硬约束)。

## License

MIT —— 见 [LICENSE](LICENSE)。
