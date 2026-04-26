import { generateText } from "ai"

import { getModel } from "@/config/models"
import type { EvaluationResult } from "@/lib/types/evaluator"
import type { PlannerQuestionAnswer } from "@/lib/types/feedback"
import {
  GeneratorOutputSchema,
  type GeneratorOutput,
} from "@/lib/types/generator"
import type { PlannerOutput, WritingPlan } from "@/lib/types/planner"
import type { NormalizedContent } from "@/lib/types/requirement"

const GENERATOR_METADATA_SEPARATOR = "---METADATA---"

const GENERATOR_SYSTEM_PROMPT = `你是 PRD Copilot 的 Generator Agent。你的职责是：接收 Planner 产出的写作规划，按照规划撰写一份**信息密度高**的 PRD。

## 🎯 核心原则：信息密度 > 字数覆盖

一份好 PRD 的标准不是"写得全"，而是"研发看完就能开工，老板看完就能拍板"。
为此你必须强制遵守以下**格式红线**（来自评估 Rubric 2.1 条）：

### 🚫 禁止的写法

1. **禁止过场句**：不要写"在本章节中我们将讨论..."、"接下来需要说明的是..."、
   "综上所述..."、"值得一提的是..."这类无信息量的过渡句。每个句子必须携带信息。

2. **禁止叙事散文**：不要把判定逻辑写成"当用户...时，系统会...如果...则..."这类长句。
   判定逻辑必须用表格。

3. **禁止同一个点在多章节重复**：如果某个风险在 1.2 节讲过，2.3 节不要再展开讲一遍。

4. **禁止"为了完整而完整"**：Planner 给了要点但实际没有信息补充的，直接在对应位置写
   "[信息缺失，见 openQuestions]"，不要编造细节凑字数。

### ✅ 强制的表达形式

根据内容类型，必须用对应的结构化形式：

| 内容类型 | 必须使用的形式 | 示例 |
|---|---|---|
| 状态/条件判定 | Markdown 表格 | 用户状态 → 系统动作对照表 |
| 流程/步骤 | 有序列表或 Mermaid | 1. 用户点击 → 2. 系统校验 → 3. ... |
| 方案对比 | 对比表 | Plan A vs Plan B 的多维对比 |
| 字段/参数/指标 | 表格 | 字段名 / 类型 / 必填 / 说明 |
| 异常分支 | 表格 | 触发条件 / 降级行为 / 责任归属 |
| 业务目标/指标 | 带数字的列表 | 基线 15% → 目标 25% |

### ✅ 允许的段落场景（仅限这三类）

1. **章节开头的"本章目的"**：一句话说明本章要回答什么问题（不超过 40 字）
2. **"为什么要做这件事"的业务背景**：不超过 3 句话
3. **核心方案的"设计思路"说明**：不超过 3 句话

其他所有内容都必须结构化。

## 🎯 Planner 约束的严格服从

1. 章节数量和顺序必须与 outline 一致
2. 每个章节必须回答 Planner 指定的"核心问题"并覆盖"关键要点"
3. Planner 提示的风险点（risks）必须在 PRD 中体现
4. 字数建议作为目标，**如果你发现自己超出 1.5 倍，八成是密度不够——用表格替换段落**

## 🎯 诚实姿态

- 原始需求没提供的关键信息，标注 "[假设: ...]" 而不是编造
- 重要假设汇总到 assumptions 字段
- 确实无法覆盖的问题列入 openQuestions

## 🎯 格式自检（formatStats）

写完后，你要对输出做一次自检，填写 formatStats 字段：
- tableCount: 数一下用了几个 Markdown 表格
- listCount: 数一下顶层列表（ol / ul）有几个
- mermaidBlockCount: 数一下 \`\`\`mermaid 代码块有几个
- paragraphCount: 数一下纯文字段落（连续 3 行以上文字块）有几个
- totalWordCount: PRD 正文的字数（近似值，中文按字数、英文按词数计）

**目标比例**（作为你的自检参考）：
对一份中等复杂度的 PRD，健康的密度比例是：
- tableCount + mermaidBlockCount ≥ 章节数的 50%（一半以上章节有结构化内容）
- paragraphCount < totalWordCount / 200（平均每 200 字至少一个表格或列表，而不是一段纯文字）

如果你自己数完发现偏离太远，**重写对应章节用表格替代**。

## 🎯 输出格式：Markdown 主体 + 元数据后置

你必须按以下顺序输出：

1. 先输出完整 PRD Markdown 主体。这里不要包在 JSON 字符串里，不要转义换行。
2. 输出固定分隔符：

---METADATA---

3. 分隔符后输出一段 JSON，只包含以下元数据字段：
{
  "sectionsGenerated": ["章节1", "章节2"],
  "assumptions": ["..."],
  "openQuestions": ["..."],
  "formatStats": {
    "tableCount": 6,
    "listCount": 12,
    "mermaidBlockCount": 2,
    "paragraphCount": 8,
    "totalWordCount": 4500
  }
}

不要把 PRD 主体放进 JSON。不要用 Markdown 代码块包裹 metadata JSON。`

function buildGeneratorPrompt(params: {
  normalizedContent: NormalizedContent
  rawContent: string
  plannerOutput: PlannerOutput
  plannerUserFeedback?: string
  plannerQuestionAnswers?: Record<string, PlannerQuestionAnswer>
}): string {
  const {
    normalizedContent,
    rawContent,
    plannerOutput,
    plannerUserFeedback,
    plannerQuestionAnswers,
  } = params
  const plan = plannerOutput.writingPlan

  const outlineText = plan.outline
    .map(
      (section, index) => `### ${index + 1}. ${section.section}
  - 本章核心问题：${section.purpose}
  - 必须覆盖的要点：${section.keyPoints.map(point => `\n    - ${point}`).join("")}
  - 建议字数：${section.estimatedWords}
  `,
    )
    .join("\n")

  // 用户对 Planner 提问的回答
  let questionAnswerSection = ""
  if (
    plannerOutput.plannerQuestions.length > 0 &&
    plannerQuestionAnswers &&
    Object.keys(plannerQuestionAnswers).length > 0
  ) {
    const lines = plannerOutput.plannerQuestions.map(q => {
      const answer = plannerQuestionAnswers[q.id]
      const answerText =
        answer === "auto"
          ? "[由你自行决定，并显式标注假设]"
          : answer && answer.trim().length > 0
            ? answer.trim()
            : "[用户未作答，请自行决定并显式标注假设]"
      return `- ${q.question}\n  → ${answerText}`
    })

    questionAnswerSection = `

## 用户对 Planner 提问的回答（必读）

${lines.join("\n")}
`
  }

  // 用户对规划的整体反馈
  let feedbackSection = ""
  if (plannerUserFeedback && plannerUserFeedback.trim().length > 0) {
    feedbackSection = `

## 用户对本次规划的额外反馈（必读，优先级高于 Planner 默认意见）

${plannerUserFeedback.trim()}
`
  }

  return `## 原始需求

${rawContent}

## 归一化后的需求

- 概要：${normalizedContent.summary}
- 用户故事：${normalizedContent.userStory}
- 痛点：${normalizedContent.painPoints.join("；")}
- 约束：${normalizedContent.constraints.join("；")}
- PM 应追问的问题：${normalizedContent.openQuestions.join("；") || "无"}
- 信息充分度：${normalizedContent.confidence}

## Planner 的全局指引

${plan.overallGuidance}

## Planner 的章节规划（严格遵守）

${outlineText}

## Planner 的风险提醒（必须体现在 PRD 中）

${plan.risks.map((risk, index) => `${index + 1}. ${risk}`).join("\n")}
${questionAnswerSection}${feedbackSection}
---

现在请按"Markdown 主体 + ---METADATA--- + metadata JSON"的协议产出完整 PRD。`
}

function makeEmptyFormatStats(totalWordCount = 0) {
  return {
    tableCount: 0,
    listCount: 0,
    mermaidBlockCount: 0,
    paragraphCount: 0,
    totalWordCount,
  }
}

function normalizeMetadataJson(text: string) {
  let attempt = text.trim()

  if (attempt.startsWith("```")) {
    attempt = attempt.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "")
  }

  const firstBrace = attempt.indexOf("{")
  const lastBrace = attempt.lastIndexOf("}")

  if (firstBrace !== -1 && lastBrace !== -1) {
    attempt = attempt.slice(firstBrace, lastBrace + 1)
  }

  return JSON.parse(attempt)
}

function parseMetadata(metadataText: string, prdMarkdown: string): Omit<
  GeneratorOutput,
  "prdMarkdown" | "parseStatus"
> {
  const parsed = normalizeMetadataJson(metadataText)

  return {
    sectionsGenerated: Array.isArray(parsed.sectionsGenerated)
      ? parsed.sectionsGenerated
      : [],
    assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
    openQuestions: Array.isArray(parsed.openQuestions)
      ? parsed.openQuestions
      : [],
    formatStats: {
      tableCount: parsed.formatStats?.tableCount ?? 0,
      listCount: parsed.formatStats?.listCount ?? 0,
      mermaidBlockCount: parsed.formatStats?.mermaidBlockCount ?? 0,
      paragraphCount: parsed.formatStats?.paragraphCount ?? 0,
      totalWordCount: parsed.formatStats?.totalWordCount ?? prdMarkdown.length,
    },
  }
}

function safeParseGeneratorOutput(text: string): GeneratorOutput {
  const separatorIndex = text.indexOf(GENERATOR_METADATA_SEPARATOR)

  if (separatorIndex === -1) {
    console.warn("[generator] output protocol violation: metadata separator missing")

    return GeneratorOutputSchema.parse({
      prdMarkdown: text.trim(),
      sectionsGenerated: [],
      assumptions: [],
      openQuestions: [
        "Generator 未按 Markdown + metadata 协议输出，已将原文作为 PRD 主体保留。",
      ],
      formatStats: makeEmptyFormatStats(text.length),
      parseStatus: "protocol_violation",
    })
  }

  const prdMarkdown = text.slice(0, separatorIndex).trim()
  const metadataText = text
    .slice(separatorIndex + GENERATOR_METADATA_SEPARATOR.length)
    .trim()

  try {
    return GeneratorOutputSchema.parse({
      prdMarkdown,
      ...parseMetadata(metadataText, prdMarkdown),
      parseStatus: "ok",
    })
  } catch (error) {
    console.warn("[generator] metadata parse failed, keeping PRD markdown", {
      message: error instanceof Error ? error.message : String(error),
    })

    return GeneratorOutputSchema.parse({
      prdMarkdown,
      sectionsGenerated: [],
      assumptions: [],
      openQuestions: ["Generator metadata 解析失败，PRD 主体已保留。"],
      formatStats: makeEmptyFormatStats(prdMarkdown.length),
      parseStatus: "metadata_missing",
    })
  }
}

export async function runGenerator(params: {
  normalizedContent: NormalizedContent
  rawContent: string
  plannerOutput: PlannerOutput
  plannerUserFeedback?: string
  plannerQuestionAnswers?: Record<string, PlannerQuestionAnswer>
  signal?: AbortSignal
}): Promise<{
  output: GeneratorOutput
  tokens: { input: number; output: number }
  durationMs: number
}> {
  const start = Date.now()
  const outlineCount = params.plannerOutput.writingPlan.outline.length
  const estimatedWords = params.plannerOutput.writingPlan.outline.reduce(
    (sum, outline) => sum + outline.estimatedWords,
    0,
  )
  const estimatedOutputTokens = Math.ceil(estimatedWords * 1.8)

  const prompt = buildGeneratorPrompt(params)

  console.log("[generator] calling GLM", {
    outlineCount,
    estimatedWords,
    estimatedOutputTokens,
    maxOutputTokens: 8000,
    hasUserFeedback: Boolean(
      params.plannerUserFeedback && params.plannerUserFeedback.trim().length,
    ),
    answeredQuestions: Object.keys(params.plannerQuestionAnswers ?? {}).length,
    promptLength: prompt.length,
  })

  const { text, usage } = await generateText({
    model: getModel("generator"),
    system: GENERATOR_SYSTEM_PROMPT,
    prompt,
    maxOutputTokens: 8000,
    abortSignal: params.signal,
  })

  console.log("[generator] raw text head (first 300 chars)", {
    length: text.length,
    head: text.slice(0, 300),
    hasMetadataSeparator: text.includes(GENERATOR_METADATA_SEPARATOR),
    startsWithFence: text.trimStart().startsWith("```"),
    looksLikeJson: text.trimStart().startsWith("{"),
  })

  const output = safeParseGeneratorOutput(text)

  console.log("[generator] parse result", {
    parseStatus: output.parseStatus,
    prdLength: output.prdMarkdown.length,
    sectionsCount: output.sectionsGenerated.length,
  })

  return {
    output,
    tokens: {
      input: usage?.inputTokens ?? 0,
      output: usage?.outputTokens ?? 0,
    },
    durationMs: Date.now() - start,
  }
}

const REVISION_SYSTEM_PROMPT = `你是 PRD Copilot 的 Generator Agent，现在处于**修订模式**。

你的职责：根据 Evaluator 的反馈，对已有 PRD 做精准修订。

## 修订原则

### 1. 只改被批评的部分
Evaluator 的 revisionSuggestions 每一条对应一个具体问题。你只修改这些问题涉及的段落/章节，**其他章节保持原样**。

### 2. 处理硬连接
如果修改某处（比如改了目标数字）会影响其他章节（比如验收标准里引用了那个数字），你也要同步更新那些相关位置。但在输出的 openQuestions 里显式列出"我修改了 XX 位置，以下章节也做了同步更新"。

### 3. 不要重写未被批评的部分
即使你觉得原来的某处还能更好，也不要改。这是修订模式，不是重写模式。

### 4. 保留诚实姿态
Evaluator 指出某处缺数据，如果你确实无法从原始需求里推断出数据，继续标注 [假设: ...] 而不是编造。把这个写进 openQuestions。

## 输出格式：Markdown 主体 + 元数据后置
和普通 Generator 相同，必须先输出完整修订后的 PRD Markdown 主体，然后输出固定分隔符：

---METADATA---

分隔符后输出 metadata JSON：
{
  "sectionsGenerated": ["修订后包含的章节标题"],
  "assumptions": ["本次修订引入的新假设"],
  "openQuestions": ["修订的位置 + 无法补全的信息"],
  "formatStats": {
    "tableCount": 0,
    "listCount": 0,
    "mermaidBlockCount": 0,
    "paragraphCount": 0,
    "totalWordCount": 0
  }
}

不要把 PRD 主体放进 JSON。不要用 Markdown 代码块包裹 metadata JSON。`

export async function runGeneratorRevision(params: {
  originalPrd: string
  evaluation: EvaluationResult
  writingPlan: WritingPlan
  evaluatorUserFeedback?: string
  signal?: AbortSignal
}): Promise<{
  output: GeneratorOutput
  tokens: { input: number; output: number }
  durationMs: number
}> {
  const start = Date.now()

  const userPrompt = `## 原有 PRD

${params.originalPrd}

## Evaluator 的评分结果

**总分**：${params.evaluation.overallScore} / 100
**判定**：${params.evaluation.verdict}

### 硬门槛状态
${Object.values(params.evaluation.hardGates)
  .map(
    gate =>
      `- ${gate.name}（${gate.id}）: ${gate.score}/${gate.maxScore} · ${gate.passed ? "✅ 过线" : "❌ 未过线"}\n  反馈：${gate.feedback}`,
  )
  .join("\n")}

### 各维度评分
${params.evaluation.dimensions
  .map(
    dimension =>
      `- ${dimension.id} ${dimension.name}: ${dimension.score}/${dimension.maxScore}\n  反馈：${dimension.feedback}`,
  )
  .join("\n")}

## 🎯 必须处理的返工建议

${params.evaluation.revisionSuggestions
  .map((suggestion, index) => `${index + 1}. ${suggestion}`)
  .join("\n")}

## 人类对 Evaluator 评分/建议的补充反馈

${params.evaluatorUserFeedback?.trim() || "无"}

## Planner 原始规划（必须继续遵守）

${params.writingPlan.overallGuidance}

---

请按修订原则产出修订版 PRD（Markdown 主体 + ---METADATA--- + metadata JSON）。`

  console.log("[generator] calling GLM revision", {
    originalPrdLength: params.originalPrd.length,
    suggestionCount: params.evaluation.revisionSuggestions.length,
    maxOutputTokens: 6000,
  })

  const { text, usage } = await generateText({
    model: getModel("generator"),
    system: REVISION_SYSTEM_PROMPT,
    prompt: userPrompt,
    maxOutputTokens: 6000,
    abortSignal: params.signal,
  })

  console.log("[generator-revision] raw text head (first 300 chars)", {
    length: text.length,
    head: text.slice(0, 300),
    hasMetadataSeparator: text.includes(GENERATOR_METADATA_SEPARATOR),
    startsWithFence: text.trimStart().startsWith("```"),
    looksLikeJson: text.trimStart().startsWith("{"),
  })

  const output = safeParseGeneratorOutput(text)

  console.log("[generator-revision] parse result", {
    parseStatus: output.parseStatus,
    prdLength: output.prdMarkdown.length,
  })

  return {
    output,
    tokens: {
      input: usage?.inputTokens ?? 0,
      output: usage?.outputTokens ?? 0,
    },
    durationMs: Date.now() - start,
  }
}

const FEEDBACK_REGEN_SYSTEM_PROMPT = `你是 PRD Copilot 的 Generator Agent，现在处于**人类反馈重生模式**。

你的职责：接收已有 PRD、Planner 写作规划、历次人类反馈，产出一版新的完整 PRD。

## 核心原则

1. **反馈优先**：用户反馈是本轮重生的最高优先级，必须逐条吸收。
2. **保持规划一致**：章节结构仍以 Planner 的 writingPlan 为准，除非反馈明确要求调整。
3. **不是小修小补**：如果反馈涉及整体方向，可以重写相关章节；但不要无理由改变未被反馈影响的内容。
4. **保留诚实姿态**：缺数据时标注 [假设: ...] 或放入 openQuestions，不要编造。

## 输出格式：Markdown 主体 + 元数据后置
必须先输出完整 PRD Markdown 主体，然后输出固定分隔符：

---METADATA---

分隔符后输出 metadata JSON：
{
  "sectionsGenerated": ["新版 PRD 包含的章节标题"],
  "assumptions": ["本次重生引入或保留的关键假设"],
  "openQuestions": ["仍需人类确认的问题"],
  "formatStats": {
    "tableCount": 0,
    "listCount": 0,
    "mermaidBlockCount": 0,
    "paragraphCount": 0,
    "totalWordCount": 0
  }
}

不要把 PRD 主体放进 JSON。不要用 Markdown 代码块包裹 metadata JSON。`

export async function runGeneratorWithFeedback(params: {
  originalPrd: string
  writingPlan: WritingPlan
  aggregatedHumanFeedback: string
  evaluatorSuggestions?: string[]
  signal?: AbortSignal
}): Promise<{
  output: GeneratorOutput
  tokens: { input: number; output: number }
  durationMs: number
}> {
  const start = Date.now()

  const outlineText = params.writingPlan.outline
    .map(
      (section, index) => `### ${index + 1}. ${section.section}
- 本章核心问题：${section.purpose}
- 必须覆盖的要点：
${section.keyPoints.map(point => `  - ${point}`).join("\n")}
- 建议字数：${section.estimatedWords}`,
    )
    .join("\n\n")

  const evaluatorSuggestions =
    params.evaluatorSuggestions && params.evaluatorSuggestions.length > 0
      ? params.evaluatorSuggestions
          .map((suggestion, index) => `${index + 1}. ${suggestion}`)
          .join("\n")
      : "无"

  const userPrompt = `## 原有 PRD

${params.originalPrd}

## Planner 原始规划（新版仍需遵守）

### 全局指引
${params.writingPlan.overallGuidance}

### 章节规划
${outlineText}

### 风险提醒
${params.writingPlan.risks
  .map((risk, index) => `${index + 1}. ${risk}`)
  .join("\n")}

## 历次人类反馈（必读）

${params.aggregatedHumanFeedback || "暂无人类反馈。"}

## Evaluator 建议（如有）

${evaluatorSuggestions}

---

请基于以上反馈产出新版完整 PRD（Markdown 主体 + ---METADATA--- + metadata JSON）。`

  console.log("[generator-feedback] calling GLM", {
    originalPrdLength: params.originalPrd.length,
    feedbackLength: params.aggregatedHumanFeedback.length,
    evaluatorSuggestionCount: params.evaluatorSuggestions?.length ?? 0,
    maxOutputTokens: 8000,
  })

  const { text, usage } = await generateText({
    model: getModel("generator"),
    system: FEEDBACK_REGEN_SYSTEM_PROMPT,
    prompt: userPrompt,
    maxOutputTokens: 8000,
    abortSignal: params.signal,
  })

  console.log("[generator-feedback] raw text head (first 300 chars)", {
    length: text.length,
    head: text.slice(0, 300),
    hasMetadataSeparator: text.includes(GENERATOR_METADATA_SEPARATOR),
  })

  const output = safeParseGeneratorOutput(text)

  console.log("[generator-feedback] parse result", {
    parseStatus: output.parseStatus,
    prdLength: output.prdMarkdown.length,
    sectionsCount: output.sectionsGenerated.length,
  })

  return {
    output,
    tokens: {
      input: usage?.inputTokens ?? 0,
      output: usage?.outputTokens ?? 0,
    },
    durationMs: Date.now() - start,
  }
}
