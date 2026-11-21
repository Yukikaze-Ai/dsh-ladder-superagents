# EB 模式使用指南（外部大脑）

> 版本 0.4.0。EB = External Brains。一句话：**DSH 照常自己干活，旁边多放几个只读的外脑。**

---

## 1. 它和普通模式的区别

| | 普通模式（阶梯） | **EB 模式** |
|---|---|---|
| 谁管子代理 | SupA 用难度梯子派 worker | **DSH 平台自己管**，插件不介入 |
| 插件提供什么 | 选档、队列、守卫、任务板 | **只读外部大脑**、队列、账本 |
| 能改文件吗 | 能（worker 有手） | **不能**（大脑只能读和想） |

判断标准：**需要动手的活留在 DSH；需要判断/挑毛病/换视角的活丢给大脑。**

---

## 2. 开启

### 方式一：整个 profile 默认开

设置 → **SupA 配置** → 默认产品 → **外部大脑**

### 方式二：只给某个会话开（推荐）

打开那个会话 → **SupA** 面板 → **设置** tab → 产品 → **外部大脑**

```
SupA   [已开启]
产品   [外部大脑 ▾]
```

这样别的会话还是普通模式，两边同时跑互不影响。

> 头部那个 `● SupA` 胶囊只管**开关**，不管模式。

---

## 3. 加一个大脑

**SupA 面板 → 设置 → 这个会话的大脑 → 添加大脑**

| 字段 | 说明 |
|---|---|
| 驱动 | `claude` 或 `codex`（只有这两个能强制只读） |
| 模型 | 下拉选择。claude 有 16 个（含别名），codex 来自上次 Scan |
| 推理强度 | 两个驱动都支持；codex 还能选 `ultra` |
| 名字 | 留空会用「驱动 · 模型」 |

提交后自动创建为 **read-only**，并默认勾选到当前会话。

### 关于模型强度的默认值

选「模型默认」就不传强度参数，让 CLI 用它自己的默认（claude 是 medium，codex 是 low）。**建议保持默认**：厂商调默认值时你自动跟上。

---

## 4. 每个会话用哪些脑子

在 **SupA 面板 → 设置 → 这个会话的大脑** 里勾选：

```
☑ Claude Code · Opus        claude · opus
☑ Codex CLI · gpt-6-astra   codex · gpt-6-astra
```

| 勾选情况 | 效果 |
|---|---|
| 全勾 | 等于不限制 |
| 部分勾 | 只能路由到这几个 |
| 全不勾 | 这个会话没有可用大脑，调用会报错 |

所以可以做到：A 会话只问 Claude，B 会话只用 Codex，C 会话两个都用。

---

## 5. 怎么问

```
supa_brain {
  needs: ["review"],
  difficulty: 6,
  brief: "读 docs/BRAIN.md 和 git diff HEAD~1，
          从架构和可维护性 review，写进 reviews/2026-11-21-x.md，
          回我 5 行摘要。"
}
```

### 参数

| 参数 | 作用 |
|---|---|
| `brief` | 要做的事。**给路径，不要贴内容**——大脑能自己读仓库 |
| `needs` | 能力标签过滤：`review` / `second-brain` / `long-context` |
| `difficulty` | 1-10，和普通模式一样参与选档 |
| `route` | 直接指定某个大脑的 id（`supa_models list` 可见） |
| `fresh` | `true` = 开新对话，不续上次 |
| `panel` | `true` = 同时问所有匹配的大脑 |

### 结果在哪

答案进队列，用 `supa_inbox` 取。**大脑没有 `supa_report` 工具**——它的 stdout 就是报告。

---

## 6. 连续性：它会记得上次

同一个「驱动 + 大脑 + 文件夹」会自动续上同一个对话：

```
第一次：记住 MANGO
第二次：我刚才让你记的词是什么？ → MANGO
```

- 会话 id 存在 `~/.dsh/supa/cli-sessions.json`；
- 换文件夹就是另一个对话（不同项目不串味）；
- `fresh: true` 强制重开。

---

## 7. 多脑会诊

```
supa_brain {
  panel: true,
  needs: ["review"],
  brief: "这个模块的分层合理吗？直接给结论。"
}
→ started claude-xxx, codex-yyy
```

每个大脑各自独立回答，结果一条一条进队列。

**第二轮**才是真讨论——把第一轮的意见贴回 brief：

```
supa_brain {
  panel: true,
  brief: "别人给了这些意见：<A><B>。请指出它们都漏掉了什么。"
}
```

> 注意：两个模型给出一致结论**不等于**独立验证。它们的训练先验相近，一致反而可能是同一个盲区。

---

## 8. 只读到底有多硬

| 驱动 | 机制 |
|---|---|
| **claude** | `--permission-mode plan` + 只允许 `Read/Grep/Glob` + 显式禁用 `Write/Edit/MultiEdit/NotebookEdit/Bash/PowerShell/Agent` |
| **codex** | `-s read-only` 沙箱 |

- 即使 authority 是 `full`，大脑档位也**不会**加 `--dangerously-skip-permissions`；
- 不能强制只读的驱动（gemini、kimi 等）**会被拒绝**当大脑，而不是悄悄给它写权限；
- 实测过：让它创建文件，它拒绝，文件也确实没生成。

**边界**：只读挡的是"改工作区"。它仍然能读文件、能联网（取决于 CLI 自己的配置），所以不要拿它处理不该外发的秘密。

---

## 9. 跨模型记忆：BRAIN.md

不同模型之间**没有共享对话**。要跨模型传知识，只能靠文件：

```
docs/BRAIN.md     决策、被否决的方案、术语、未决问题
reviews/*.md      每次 review 的产出
```

模板在 [BRAIN.template.md](BRAIN.template.md)，复制到项目里即可。

大脑的 resume 只对**它自己**有效；`BRAIN.md` 才是换模型也不丢的部分。

---

## 10. 成本

一次大脑调用 = 一个 CLI 进程 + 它的完整上下文。

| 做法 | 成本 |
|---|---|
| 只等待/构建的命令 | **不要**用它，用 `run_in_background`（零成本） |
| 短问题 | 便宜，但每次都带系统提示 |
| 同一话题反复问 | 用 resume（续对话比新开便宜） |
| panel 开 3 个脑 | 算 3 次 |

看用量：**SupA 面板 → 用量**。

---

## 11. 排错

| 现象 | 原因 / 处理 |
|---|---|
| `supa_brain` 报 "is for EB sessions" | 这个会话是普通模式，去 SupA 面板 → 设置改产品 |
| "no read-only CLI brain matches … in this session" | 会话的大脑勾选把匹配项排掉了，或 `needs` 太窄 |
| 大脑一直不返回 | 检查 CLI 是否登录：`supa_models list` 看驱动路径；CLI 单次上限 15 分钟 |
| 改了 UI 但界面没变 | 客户端模块有缓存，**Ctrl+Shift+R** |
| 大脑说"我没有 supa_report" | 正常，它本来就没有；它的话就是结果 |

---

## 12. 最短上手路径

```bash
# 1. 准备记忆文件
cp docs/BRAIN.template.md docs/BRAIN.md

# 2. 会话里切到 EB
（SupA 面板 → 设置 → 产品：外部大脑）

# 3. 加一个 Claude 大脑（已经加过就跳过）
（SupA 面板 → 设置 → 添加大脑 → claude / Opus 5.5）

# 4. 问它
supa_brain { needs: ["review"], difficulty: 5,
             brief: "读 docs/BRAIN.md 和 src/，指出三个最可能出问题的地方" }

# 5. 取结果
supa_inbox
```
