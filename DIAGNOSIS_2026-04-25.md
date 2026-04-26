# PRD Copilot Pro · 代码诊断报告 · 2026-04-25

## 1. Generator 泛化能力诊断

### 结论
Generator prompt 本身没有出现“骑手 App”“列表筛选”“取消订单”等特定业务硬编码。当前泛化失败更可能来自输出协议、token 上限、Rubric 类型偏置和 fallback 成功伪装。

### 可能根因

1. `src/lib/agents/generator.ts:82-101` 要求 GLM 把完整 PRD Markdown 塞进一个 JSON 字符串字段 `prdMarkdown`。Markdown 内容天然包含换行、表格、引号、代码块，长文本一旦被截断或转义失败，就会出现 `Unterminated string in JSON`。这不是“新需求类型”问题，是输出协议对长 Markdown 不友好。

2. `src/lib/agents/generator.ts:218-223` 把 Generator 的 `maxOutputTokens` 固定为 `3500`；`src/lib/agents/generator.ts:325-330` 的修订模式也固定为 `3500`。当 Planner 给出多章节 outline 时，GLM 必须同时输出 Markdown 正文、sectionsGenerated、assumptions、openQuestions、formatStats，3500 tokens 不够稳定承载中等复杂度 PRD。

3. `src/lib/agents/planner.ts:171-183` 对 legacy outline 最多截到 8 节，但正常 Planner 输出没有硬性章节数上限；`src/lib/agents/generator.ts:111-142` 会把完整 outline、全局指引、风险提醒全部拼进 prompt。新需求一旦被 Planner 展开成较多章节，Generator 上下文会推动 GLM 生成超长内容，然后撞上 `3500` token 上限。

4. `skills/prd-evaluation-rubric-v1.md:13-15` 明确把 Rubric 定义为 AI/Agent 产品 PRD 评估标准；`skills/prd-evaluation-rubric-v1.md:39-45` 要求区分 Skill / Agent / API；`skills/prd-evaluation-rubric-v1.md:97-101` 只定义“轻量级 API / 复杂 Agent 工作流 / 底层感知/多模态”三类需求。普通业务 PRD 会被迫映射到 AI/Agent 评估框架，Planner 和 Evaluator 会把非 AI 需求拉偏。

5. `src/lib/agents/generator.ts:125-130` 传给 Generator 的归一化上下文只包含概要、用户故事、痛点、约束，遗漏了 `openQuestions` 和 `confidence`。新需求信息不足时，Generator 看不到 Normalizer 提出的追问清单，仍会按完整 PRD 开写，导致编造、泛化漂移和长文本失控。

6. `src/lib/agents/generator.ts:185-202` 在 JSON 解析失败后把原始 `text.trim()` 直接塞进 `prdMarkdown` 并返回成功结构。该路径会把半截 JSON、未闭合字符串、模型解释文字直接当成 PRD 展示给用户；`src/components/dashboard/GeneratorWorkspace.tsx:134-175` 无错误态区分，会照常显示“PRD 初稿（可编辑）”。

## 2. Planner 输出可见性诊断

### 是否存在信息断层
存在。

1. `src/store/session-store.ts:104-120` 的 `setDraft` 在归一化成功后直接把 `currentStep` 切到 `planner`。归一化结果只在 `src/components/dashboard/InputWorkspace.tsx:98` 的 `DraftPreview` 中可见，离开输入步骤后没有全局回看入口。

2. `src/components/dashboard/PlannerWorkspace.tsx:85-190` 在 Planner 步骤内展示 `plannerNote`、`evaluationRule`、`writingPlan`；但 `src/store/session-store.ts:121-141` 的 `setPlannerResult` 完成后直接把 `currentStep` 切到 `generator`，进入 Generator 后只剩 `src/components/dashboard/GeneratorWorkspace.tsx:113-124` 的“章节数 / 风险点 / 总建议字数”摘要，完整 Planner 内容消失。

3. `src/components/dashboard/GeneratorWorkspace.tsx:134-239` 显示 PRD 编辑器和出口按钮；进入 Evaluator 后，`src/components/dashboard/EvaluatorWorkspace.tsx:118-149` 只显示评估参数和启动按钮，PRD 正文不在页面中。用户在等待 Evaluator 时无法确认评估的是哪份 PRD。

4. `src/app/page.tsx:47-65` 的右侧主区只渲染当前 step 的 Workspace，没有固定的“上下文面板”。当前架构把每一步产物存在 store 里，但 UI 不提供跨步骤回看。

### 修复方向
建立全局上下文区：始终展示当前 RequirementDraft、PlannerOutput 摘要和 PRD 快照；每个步骤页面只负责当前操作，不负责隐藏上游产物。

## 3. UI 视觉与信息密度诊断

### `src/app/page.tsx`

1. `src/app/page.tsx:20-21` 使用固定 `w-64` 侧栏和 `p-8` 主区，整体像后台表单壳，不像 AI Copilot 产品。没有页面级标题、当前任务说明、进度解释区。

2. `src/app/page.tsx:47-48` 主内容限制在 `max-w-4xl`，Generator 的双栏编辑器、Evaluator 的维度卡片都被压窄；长 PRD 和长反馈在这个宽度下阅读密度差。

3. `src/app/page.tsx:54-64` Skill 步骤文案仍写“PRD 已导出，本次会话结束”，但 Review 的“通过并沉淀”也会进入该步骤。状态文案和真实路径不一致。

### `src/components/dashboard/Stepper.tsx`

1. `src/components/dashboard/Stepper.tsx:49-52` 只用 `✓ / ● / ○` 区分状态，视觉表达弱；缺少“失败 / 超时 / 待重评估”状态。

2. `src/components/dashboard/Stepper.tsx:61-67` 当前态只给 `bg-muted font-medium`，锁定态只给灰字。所有步骤在视觉上接近，用户不容易判断当前流程卡在哪里。

3. `src/components/dashboard/Stepper.tsx:16-46` 状态判断只看产物存在与当前 step order，不反映 loading、error、fallback、timeout。

### `src/components/dashboard/RunStats.tsx`

1. `src/components/dashboard/RunStats.tsx:9-14` 成本永远按 `claude-opus-4-6` 计价，但 Generator/Evaluator 已切到 SiliconFlow GLM/Kimi。成本面板数据错误。

2. `src/components/dashboard/RunStats.tsx:19-38` 只有 tokens、耗时、成本三行，没有按角色拆分。用户无法知道慢的是 Planner、Generator 还是 Evaluator。

3. `src/components/dashboard/RunStats.tsx:20-36` 大量依赖 `text-muted-foreground`，关键数据没有视觉突出。

### `src/components/dashboard/InputWorkspace.tsx`

1. `src/components/dashboard/InputWorkspace.tsx:68-99` 输入和归一化结果是两列，但没有当前任务标题、引导文案、示例入口。新用户只看到表单。

2. `src/components/dashboard/InputWorkspace.tsx:94-96` 只在按钮 disabled 上体现至少 10 字限制；没有直接显示当前输入长度和限制原因。实验页有字数提示，主路径没有。

3. `src/components/dashboard/InputWorkspace.tsx:47-48` 归一化成功后直接跳到 Planner，用户还没看清右侧结果就被切走。

### `src/components/dashboard/PlannerWorkspace.tsx`

1. `src/components/dashboard/PlannerWorkspace.tsx:66-83` Planner 未运行态只有一张普通 Card 和一个按钮，没有展示当前归一化需求摘要，用户不知道 Planner 将基于什么输入规划。

2. `src/components/dashboard/PlannerWorkspace.tsx:85-190` Planner 结果拆成多张普通 Card，但没有“下一步”主按钮；只靠 store 自动进入 Generator。用户会感觉 Planner 内容闪过或不可控。

3. `src/components/dashboard/PlannerWorkspace.tsx:119-133`、`src/components/dashboard/PlannerWorkspace.tsx:159-166` 大量关键信息使用 `text-xs text-muted-foreground`，评估规则和写作要点视觉权重过低。

### `src/components/dashboard/GeneratorWorkspace.tsx`

1. `src/components/dashboard/GeneratorWorkspace.tsx:101-131` Generator 启动前只显示 Planner 摘要，不显示 `plannerNote`、`writingPlan.outline` 详情、`evaluationRule`。这是用户反馈“看不到 Planner 计划”的直接原因。

2. `src/components/dashboard/GeneratorWorkspace.tsx:159-173` 编辑器和预览各占 50%，但没有工具栏、错误横幅、fallback 标识、复制/下载状态。乱码也会被当成普通 PRD。

3. `src/components/dashboard/GeneratorWorkspace.tsx:145-154` formatStats 全是小号灰字，且来自模型自报。用户无法判断这些指标可信不可信。

### `src/components/dashboard/EvaluatorWorkspace.tsx`

1. `src/components/dashboard/EvaluatorWorkspace.tsx:174-189` Evaluator loading 写死“预计 150-200 秒”，但没有真实倒计时、超时进度、重试入口、当前耗时。

2. `src/components/dashboard/EvaluatorWorkspace.tsx:245-270` 总分卡有颜色，但 `displayedReason` 回退只取 `overallFeedback` 第一行前 120 字。真实原因可能被截断，用户看不到关键扣分点。

3. `src/components/dashboard/EvaluatorWorkspace.tsx:369-414` 维度详情默认折叠，用户必须逐个点开才能看到反馈。对于评审场景，默认隐藏核心证据降低了信息可见性。

## 4. 交互逻辑诊断

1. 输入 → 归一化链路强制跳步。`src/store/session-store.ts:104-120` 的 `setDraft` 自动进入 Planner，`src/components/dashboard/InputWorkspace.tsx:47-48` 归一化成功后用户无法停留查看 Normalizer 结果。

2. Planner 长等待期间没有可取消、无阶段进度、无日志 ID。`src/components/dashboard/PlannerWorkspace.tsx:17-53` 只维护本地 `loading`；`src/components/dashboard/PlannerWorkspace.tsx:77-79` 只把按钮文案改成“规划中”。用户不知道请求是否进入后端、模型、还是中转站。

3. Generator 失败恢复弱。`src/components/dashboard/GeneratorWorkspace.tsx:50-60` 只 toast 错误；如果后端走 `safeParseGeneratorOutput` fallback，前端完全不知道。乱码会继续进入编辑器和 Evaluator。

4. 编辑态没有持久化。`src/store/session-store.ts:101-187` 是纯内存 Zustand store，没有 persist；`src/components/dashboard/GeneratorWorkspace.tsx:160-165` 的 textarea 改动刷新页面即丢。

5. Evaluator 熔断后用户只能看到 toast。`src/components/dashboard/EvaluatorWorkspace.tsx:39-66` 没有 AbortController、没有前端超时控制、没有把错误保存成页面状态；`src/app/api/evaluate/route.ts:90-96` 返回 504 文案后，Workspace 没有专门 UI 承接。

6. 重置会话无二次确认。`src/app/page.tsx:30-38` 直接调用 `reset`；`src/store/session-store.ts:186` 会清空所有状态、PRD 编辑内容和评分历史。

7. `/experiment` 仍可用，但是旧链路。`src/app/experiment/page.tsx:68-100` 继续调用 `/api/generate` 三档生成；主路径已经变成 Planner → Generator → Evaluator，实验模式没有同步 Provider 切换、超时 UI 和新错误恢复策略。

## 5. 错误恢复与可观测性诊断

1. API 错误只有 `error` 字符串，没有结构化错误类型。`src/app/api/generate-prd/route.ts:98-104`、`src/app/api/evaluate/route.ts:93-96`、`src/app/api/plan/route.ts:93-99` 返回的都是单句文本，前端无法区分 provider 超时、schema 失败、parse fallback、真实模型错误。

2. 后端日志存在，但用户看不到。`src/app/api/evaluate/route.ts:47-75`、`src/app/api/generate-prd/route.ts:48-79` 有分层日志；前端 Workspace 不展示 request id、阶段、耗时、最后一次后端 tick。

3. Generator fallback 是“成功降级”。`src/lib/agents/generator.ts:185-202` 返回合法 `GeneratorOutput`，`src/components/dashboard/GeneratorWorkspace.tsx:134-175` 直接展示为初稿。用户看到乱码时，系统没有告诉他这是 parse fallback。

4. Evaluator fallback 也是“成功降级”。`src/lib/agents/evaluator.ts:330-367` 会把抢救或 fallback 的结果包装成 `EvaluationResult`；`src/app/api/evaluate/route.ts:77-82` 返回 `ok: true`。用户可能把抢救结果误认为完整评分。

5. 180 秒熔断文案无法定位中转站还是模型。`src/app/api/evaluate/route.ts:90-96` 只写“Evaluator 执行超时（180秒）”；没有 provider、modelId、是否已发起上游请求、是否收到 partial usage。

6. Normalizer 没有服务端 AbortController。`src/app/api/normalize/route.ts:61-66` 直接 await `generateObject`，只有前端 `src/components/dashboard/InputWorkspace.tsx:29-30` 有 60 秒 abort；后端侧不会主动中断短请求。

## 6. 代码层面的健康度

1. `any` 集中在模型输出适配层。`src/lib/agents/planner.ts:156`、`src/lib/agents/planner.ts:171`、`src/lib/agents/planner.ts:241` 和 `src/lib/agents/evaluator.ts:119`、`src/lib/agents/evaluator.ts:167`、`src/lib/agents/evaluator.ts:249` 大量使用 `any`，说明核心协议仍靠运行时猜测，不靠类型约束。

2. `session-store` 字段语义混乱。`src/store/session-store.ts:49-50` 同时存在 `prdEditingContent` 和 `prdFinalContent`；`src/store/session-store.ts:160-164` 的 `submitToEvaluator` 会设置 `prdFinalContent`，但它并不是最终 PRD，只是提交评估快照。

3. 成本模型和角色模型脱节。`src/config/models.ts:3-20` 已经按角色配置 provider/model；`src/components/dashboard/RunStats.tsx:9-14` 仍按 Claude 单价估算全部 token。

4. Workspace 组件重复 fetch/loading/toast 逻辑。`src/components/dashboard/InputWorkspace.tsx:25-65`、`src/components/dashboard/PlannerWorkspace.tsx:14-53`、`src/components/dashboard/GeneratorWorkspace.tsx:25-64`、`src/components/dashboard/EvaluatorWorkspace.tsx:34-66` 都手写请求、loading、错误 toast，行为不一致。

5. 主路径和实验模式两套状态系统并存。`src/app/page.tsx:16-69` 使用全局 session store；`src/app/experiment/page.tsx:16-100` 使用页面内局部 state。两个入口共享 `/api/normalize`，但后续生成链路和错误处理分叉。

6. `.DS_Store` 已进入源码目录。`find src/components/dashboard src/lib/agents src/app/api -type f` 显示 `src/app/api/.DS_Store`，说明项目没有清理 macOS 元文件。

7. `safeParseGeneratorOutput` 的函数名和行为不一致。`src/lib/agents/generator.ts:149-152` 声称是容错 JSON 解析，`src/lib/agents/generator.ts:190-202` 实际会把任意原文包装成成功 PRD。

## 7. 综合判断

当前项目不能直接展示给面试官。主流程能跑，但失败时会把乱码包装成正常 PRD；用户跨步骤看不到 Normalizer 和 Planner 产物；Evaluator 长请求熔断后没有页面级恢复。若只剩 8 小时，先处理：Generator 输出协议、fallback 显式错误态、跨步骤上下文面板、Evaluator 超时 UI、成本/状态语义。实验模式、Skill 沉淀、美化细节属于 v1.1。
