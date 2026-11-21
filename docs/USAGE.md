# 使用指南（0.3.1）

这份文档只讲**怎么用**。原理见 [DESIGN.md](DESIGN.md)，跨模型协作记忆见 [BRAIN.template.md](BRAIN.template.md)。

---

## 零、两种模式

插件有**两个产品**，在「设置 → 模式」里切：

| | **普通模式（normal）** | **EB 模式（external brains）** |
|---|---|---|
| 谁管子代理 | SupA 派，梯子选档 | **DSH 自己管**，我们完全不碰 |
| 我们提供什么 | 梯子、队列、账本、任务板、命令守卫 | 只提供**外部大脑**、队列、账本 |
| 工具 | `supa_spawn` 等 12 个 | `supa_brain` 等 7 个 |
| 适合 | 想让 SupA 自己拆活、按难度选模型 | 想保持原生 DSH，只多几个"外脑" |

一句话：**普通模式是"我来编排"；EB 模式是"DSH 照常干活，我只是在旁边多放几个脑子"。**

---

## 一、先分清四样东西

SupA 不是"一个更强的模型"，是一套分派机制。四样东西各管一件事，混用就会又慢又贵：

| 东西 | 管什么 | 什么时候用 |
|---|---|---|
| **后台任务**（`run_in_background`） | 让命令不挡着这一轮 | 等待、构建、测试、跑脚本 |
| **`supa_spawn`**（普通模式） | 把一块需要判断的活交给另一个模型 | 要读、要改、要决定 |
| **`supa_brain`**（EB 模式） | 问一个只读的外部大脑 | 要思路、要 review、要挑盲区 |
| **任务板**（`team_task_*`） | 谁在做什么、做到哪 | 多个 worker 同时干活 |
| **账本 / BRAIN.md** | 跨会话、跨模型的知识 | 决定、结论、术语 |

一句话：**不需要判断的活不要起 agent**。

---

## 二、第一次配置

### 1. 梯子（设置页 → SupA）

十个槽位，`T1` 最强。槽位就是难度上限：T1 覆盖 10，T7 覆盖 4。留下空洞没关系，空洞由上面更强的档接住。

### 2. 能力标签
槽位决定"多难"，标签决定"适合什么"：

```jsonc
{ "id": "t6", "label": "Claude Code (opus)", "kind": "cli", "driver": "claude",
  "model": "opus", "slot": 3, "tags": ["review", "second-brain", "long-context"] }
```

派活时用 `needs` 匹配：

```
supa_spawn { needs: ["review"], difficulty: 6, brief: "..." }
```

没有一档带这些标签时，会退回按难度选，并在 brief 里写明"没有 tier 声明 review"——**不会静默忽略**。

### 3. 大脑档位（只能看，不能改）

给 tier 加 `readonly: true`，它就成为"大脑"：读、想、review，但**不许改工作区**。

```jsonc
{ "id": "t6", "label": "Claude (brain)", "kind": "cli", "driver": "claude",
  "model": "opus", "slot": 3, "readonly": true,
  "tags": ["review", "second-brain", "long-context"] }
```

约束是**强制的**，不是提示词：

- Claude 档位走 `--permission-mode plan`，并显式禁用 `Write` / `Edit` / `MultiEdit` / `NotebookEdit` / `Bash`；
- 其它档位没有这种开关，规则写在 brief 开头的「Role: brain, not hands」里；
- 实测：让它"创建 brain-probe.txt"，它拒绝，文件也确实没生成。

想有第三、第四大脑，就再加几个带 `readonly` 的档位，用 `needs` 区分用途（例如 `["review"]` 和 `["architecture"]`）。

### 4. Claude 的连续性

Claude 档位支持 `--resume`：第一次调用记下会话 id，同一个文件夹下次自动续上。

- 想开新会话：`supa_spawn { fresh: true, ... }`
- 会话 id 存在 `~/.dsh/supa/cli-sessions.json`，键是 `驱动|文件夹`
- 换文件夹就是另一个 Claude 会话（这是故意的：不同项目不该串味）

---

## 三、日常怎么用

### 场景 A：一条会等很久的命令

```
你：跑一下 cargo test
```

不需要你做任何事。guard 会拦住它，并告诉模型用 `run_in_background`。你会在任务完成时拿到输出，**不花一个 token 给子代理**。

### 场景 B：一块活值得派出去

```
supa_spawn {
  difficulty: 5,
  brief: "把 src/parser/*.ts 里的 any 换成具体类型，跑 tsc 验证",
  acceptance: "tsc --noEmit 通过"
}
```

然后你做别的事。结果会进队列，你 `supa_inbox` 取。

### 场景 C：两件互不依赖的活

同一个回合派两个，梯子并行跑，两个结果都进队列：

```
supa_spawn { difficulty: 4, brief: "A" }
supa_spawn { difficulty: 4, brief: "B" }
```

### 场景 D：同一个 worker 接着干

```
supa_spawn { continue: "a1b2c3d4", brief: "再补一个边界用例" }
```

复用它已有的上下文，比新派一个便宜得多。

### 场景 E：好几个 worker 并行

1. 先建任务：`team_task_create { subject, description, write_scopes }`
2. 派活时带上 id：`supa_spawn { task: "task-3", ... }`
3. 看进度：`team_task_list`
4. worker 自己会 claim → 做完 → complete

**状态走任务板，结果走队列**，不要反过来。

### 场景 F：停掉跑偏的 worker

```
supa_stop                    // 列出所有子和状态
supa_stop { child: "a1b2" }  // 打断它（队列和会话保留，可再唤醒）
```

---

## 四、跨模型协作怎么落地

### 规则一：共享记忆是文件，不是对话

不同模型之间**没有共享的对话**。所以：

```
BRAIN.md          决策、被否决的方案、术语
reviews/*.md      每次 review 的产出
```

把 [BRAIN.template.md](BRAIN.template.md) 复制成项目里的 `docs/BRAIN.md`，每次派活前让它先读。

### 规则二：交接给路径，不贴内容

```
❌ brief: "这是代码……（贴 500 行）"
✅ brief: "读 src/foo.ts 和 docs/BRAIN.md，review 后写进 reviews/2026-11-21-foo.md"
```

CLI 档位有完整工具链（读文件、跑命令），你不必替它搬运内容。

### 规则三：一个编排者

只让一个会话做决策，其他都是执行单元。两个模型互相派活无法仲裁。

### 规则四：跨模型必须验

换模型复核的价值是"不同错法"，但前提是**用产物验证**：跑测试、看 diff、grep 断言。

### 典型分工

| 角色 | 用谁 |
|---|---|
| 写代码、改代码 | 你的主模型（DSH 会话自己） |
| 长上下文通读、架构 review | `needs: ["review", "long-context"]` → Claude |
| 批量机械修改 | 便宜档 |
| 跑构建/测试 | 后台任务 |

---

## 五、看数据

| 命令 | 作用 |
|---|---|
| `supa_status` | 当前会话、账本、子代理、开关状态 |
| `supa_stats` | 每个档位的调用次数、完成率、耗时、token |
| `supa_models list` | 梯子、标签、可用路由、codex 目录 |

统计页的胶囊显示 `SupA · N`，N 是正在跑的 worker 数。

---

## 六、常见误判

| 现象 | 真相 |
|---|---|
| "扫描没看到 Claude" | Claude CLI 没有可机读的模型列表，那一栏是**声明的别名**，不是扫描结果 |
| "派了活却没人报告" | CLI 档位没有 `supa_report`，它的 stdout 就是结果 |
| "worker 不记得上次" | harness 档位用 `continue`；CLI 档位靠 `--resume`（同文件夹） |
| "关掉 SupA 会卡" | 已修复：切换只写一个文件，不再重建整个状态 |
| "花了很多 token" | 看 `supa_stats` 的 route 分布；`handoff` 应该有，但不该占大头 |

---

## 七、配置速查

| 键 | 默认 | 说明 |
|---|---|---|
| `mode` | `session` | `all` / `root` / `session` |
| `handOffShell` | `long` | 哪些命令算"会挡路" |
| `handOffMode` | `job` | `job`=劝去后台；`child`=旧行为（起 worker） |
| `maxChildren` | 8 | 并发上限 |
| `tierAttempts` | 2 | 同档重试次数 |
| `failureCooldownMs` | 2700000 | 失败档冷却 45 分钟 |
| `cliTimeoutMs` | 600000 | CLI 单次上限 |
| `maxCliResultChars` | — | CLI 输出截断长度 |
