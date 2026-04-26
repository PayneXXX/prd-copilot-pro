# Error Log

## 2026-04-23 · Day 2 M2 Validation

### 已观察到的异常
- `/api/generate` 在当前中转站环境下存在明显的高延迟。多轮真实请求中，服务端曾成功返回 `200`，但总耗时分别观察到约 `300986ms`、`443194ms`、`514176ms`、`516867ms`。
- 在加入 `maxOutputTokens`、`effort: low` 和精简输出策略后，最新一轮 `/api/generate` 已回落到 `110555ms`，但仍显著高于预期的 20-40 秒。
- 使用 Node `fetch` 做端到端脚本验证时，客户端出现过 `UND_ERR_HEADERS_TIMEOUT`，表现为客户端先超时，随后服务端才返回 `200`。
- 在 dev 验证中，至少确认过 A 档已经成功产出并记录日志：`durationMs: 57284`, `inputTokens: 952`, `outputTokens: 1120`。
- 在 C 档链路中，至少确认过 Planner 步成功产出并记录日志：`inputTokens: 1491`, `outputTokens: 1902`。

### 影响判断
- 当前异常更像是模型推理时延 / 中转站响应时延问题，而不是 TypeScript、构建或接口代码崩溃。
- `npx tsc --noEmit` 与 `npm run build` 在当前代码版本下可通过，说明主干代码结构是稳定的。

### 临时缓解
- 统一生成入口已避免使用 `temperature`。
- 已为三档生成增加 `maxOutputTokens` 上限，减少无界扩写。
- 已为 Anthropic 调用增加 `effort: low`，降低生成时延与 token 消耗。
- 已在生成链路加入日志观测，便于后续继续定位 `bare / structured / copilot` 以及 `planner / outliner / drafter` 的分段耗时。

### 后续建议
- 优先排查中转站对长请求的超时、排队和吞吐限制。
- 若后续仍需本地稳定验证，可考虑增加专门的异步任务队列或轮询式结果获取，避免单个 HTTP 请求长时间阻塞。

## [Day 3 上半天] 模型版本决策：Opus 4.7 → 4.6

### 背景
Day 2 端到端观测到三档并行生成总耗时 110 秒，A 档单档 57 秒。长请求体验不可接受。

### 根因分析（排查顺序）
1. 代码层：TypeScript 类型、Prompt 长度、Promise 并发已全部检查通过，无问题。
2. 模型层：Opus 4.7 为本月新发模型，中转站路由/缓存未完全优化。
3. 横向对比：同中转站、同 prompt，用户日常使用 Opus 4.6 时延正常。

### 决策
- 生成侧从 `claude-opus-4-7` 降到 `claude-opus-4-6`
- 三档继续使用同一模型保持对照公平性
- 放弃流式输出作为性能方案（代码复杂度高，且根因不在时延展示上）

### 预期
- 总耗时从 110s 降到 30-50s
- 质量感知差异：PRD 写作为 knowledge + instruction following 密集任务，4.6 与 4.7 差距可忽略

### 风险兜底
如 4.6 仍超过 60s：
- Plan B1: 生成侧切 Claude Sonnet 4.6（速度优先）
- Plan B2: 启用流式输出降低体感等待

### Day 3 实测补充
- 使用 `claude-opus-4-6` 后，当前中转站环境下三档端到端总耗时仍达到 `682512ms`。
- 三档分档结果：
  - bare: `61342ms`, token `{ input: 953, output: 1243 }`
  - structured: `219502ms`, token `{ input: 1313, output: 4537 }`
  - copilot: `682511ms`, token `{ input: 9458, output: 14026 }`
- C 档三步链结果：
  - planner: `{ input: 1511, output: 2820 }`
  - outliner: `{ input: 2475, output: 5216 }`
  - drafter: `{ input: 5472, output: 5990 }`
- 额外异常：当前中转站/路由下，`maxOutputTokens` 看起来未被严格遵守；例如 C 档 planner 设定上限为 `500`，但实际观测 `outputTokens` 为 `2820`。

## [Day 5 上半天] Generator 结构化重构 · 信息密度优先

### 问题
Day 4 端到端测试：Generator 产出 13687 tokens / 约 13500 字 PRD，
远超 Planner 建议 5000 字。耗时 249 秒（约 4 分钟）。

### 根因诊断
PM 视角分析后确认：**不是字数上限不够，而是信息密度不足**。
- 大量"在本章节中我们将..."式过场句
- 本可用表格说清的判定逻辑写成叙事段落
- 同一个点在不同章节重复展开

### 决策
不做"字数上限"这种工程管控，改做"结构化表达"产品约束：
1. Generator system prompt 强制遵循 Rubric 2.1 的"能画图绝不写字"原则
2. 新增 formatStats 输出字段：Generator 自检表格数/列表数/流程图数/段落数/字数
3. 前端显示密度指标，让 PM 一眼看到 PRD 的结构化程度

### 预期
- PRD 字数从 13000 降到 5000-7000 字
- 信息密度（表格+流程图占比）显著提升
- Generator 耗时从 249s 降到 60-100s（副产品）

### 产品叙事价值
这一改动证明了 Rubric 不只是评分工具，也是 Generator 的"写作风格准则"。
Rubric 作为 Skill，在产品里是多角色复用的——既管评分，也管生成。

## [Day 5 诊断实验] 可观测性 + 180s 熔断实测

### 实验 #1 · 2026-04-24 12:39
- 输入：骑手 App 订单列表筛选优化需求
- Normalize：成功，`15675ms`
- Planner：服务端 180s 熔断，返回 `504`
- Generator：未触发（未出现 `[gen-prd] 4. calling generator`）
- 关键日志：
  - `[plan] 04:39:59.930 4. calling planner (+1ms)`
  - `[plan] 04:42:59.936 X. planner aborted by timeout (+180007ms)`
- 返回状态：Planner 超时中断
- 中转站使用日志：有调用。控制台出现 `2026-04-24 12:43:53` 记录，`233s / input 4817 / output 7880 / $0.353736`，说明请求已进入中转站/模型侧，但本地 180s 熔断先返回。
- 诊断结论：本轮还没到 Generator，卡点在 Planner → Anthropic SDK/中转站返回之间；AbortController 能防止前端无限等待，但中转站侧仍可能继续执行并计费。

## [Day 5] Provider 切换 · Generator 转向硅基流动 GLM

### 背景
Day 5 实验 #1 观测到一次 25.8 分钟的 Generator 调用（中转站最终返回成功但前端已中断）。
结合 Day 4 的 249 秒，确认中转站长尾不可控，且耗时在 2-25 分钟波动。
不适合作为产品演示通道。

### 决策
引入多 provider 架构：
- Normalizer: 保留 Claude Opus 4.6（中转站）
- Planner: 保留 Claude Opus 4.6（中转站） — 质量优先，一次会话只跑一次
- Generator: 切换 Pro/zai-org/GLM-5.1（硅基流动） — 速度优先
- Evaluator: Pro/moonshotai/Kimi-K2.6（硅基流动） — Day 5 下半天接入

### 架构落地
新增 `src/config/models.ts` 的 ROLE_MODELS 和 getModel() 抽象。
未来任何角色的模型切换只需修改该文件一处。

### 产品叙事
"三角色三供应商，证明 Agent 抽象层的 provider 无关性。"

### 性能预期
- Generator 耗时：从 2-25 分钟降到 10-30 秒
- 中文长文本质量：GLM 对 PRD 这类专业文档的表达偏书面化，符合场景
- 成本：GLM 约为 Opus 的 1/7，频繁返工场景下成本显著下降
