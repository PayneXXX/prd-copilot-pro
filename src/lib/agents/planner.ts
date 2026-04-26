import fs from "fs/promises"
import path from "path"

import { generatePRDText } from "@/lib/llm/generate"
import {
  PlannerOutputSchema,
  type PlannerOutput,
} from "@/lib/types/planner"
import type { NormalizedContent } from "@/lib/types/requirement"

// 读取 Rubric Skill 文件（服务端运行，读项目根目录）
async function loadRubric(): Promise<string> {
  const rubricPath = path.join(
    process.cwd(),
    "skills",
    "prd-evaluation-rubric-v1.md",
  )

  try {
    return await fs.readFile(rubricPath, "utf-8")
  } catch {
    throw new Error(`无法读取 Rubric Skill 文件：${rubricPath}`)
  }
}

const PLANNER_SYSTEM_PROMPT = `你是 PRD Copilot 的 Planner Agent。你的职责是作为整个系统的调度中枢。

## 你的三个产出

### 产出一：写作规划 (WritingPlan)
为 Generator Agent 产出一份结构化的 PRD 写作指引，包括章节大纲、每章核心问题、关键要点、建议字数。

### 产出二：评估规则 (EvaluationRule)
基于用户提供的评估 Rubric Skill，**为本次任务定制化**产出一份评估规则给 Evaluator Agent。核心动作是：
1. 识别需求类型（轻量级 API / 复杂 Agent / 底层感知），并说明判定理由
2. 根据需求类型从 Rubric 的动态权重表中选取对应权重
3. 决定本次要激活哪些评估维度，并重新分配分值
4. 对每个激活的维度，给出"本次任务要特别关注什么"的具体指引

### 产出三：用户待确认问题 (plannerQuestions)
归一化阶段已经梳理过痛点和约束，但**写 PRD 之前往往还有 PM 没明确表态的关键细节**——比如技术栈、目标平台、是否需要服务端、关键业务规则、UX 走向等。
列出**最多 5 条**你认为 PM 必须先回答才能让 PRD 真正落地的问题。每条含：
- id：稳定唯一的 slug（如 "tech-stack"、"auth-policy"、"q1"）
- category：technical | business | scope | ux
- question：一句话提问，直白好答
- hint（可选）：这个问题为什么重要、不答会怎样

如果归一化阶段 confidence=high 且关键决策都已显式，可以输出**空数组**。**宁缺毋滥**，不要为凑数硬编。

## 关键原则

1. **你是 Harness，不是 Generator**：你不写 PRD 内容，你只给下一步定规则
2. **你是 Rubric 的使用者，不是创造者**：评估维度来自 Rubric，不要自创维度
3. **权重必须显式解释**：为什么选这个需求类型、为什么调整这些分值
4. **规划要务实可执行**：大纲的每一项都要让 Generator 能直接开写，不要写"优化体验"这种空话

## 输出格式
严格按照下面的 JSON key 输出，不要包裹 Markdown 代码块，不要输出额外解释文字：
{
  "writingPlan": {
    "outline": [
      {
        "section": "章节标题",
        "purpose": "本章节要回答的核心问题",
        "keyPoints": ["必须覆盖的要点"],
        "estimatedWords": 300
      }
    ],
    "overallGuidance": "写作全局指引",
    "risks": ["风险点"]
  },
  "evaluationRule": {
    "rubricVersion": "Rubric 版本",
    "needType": "lightweight_api | complex_agent | perception",
    "needTypeReason": "一句话判定理由",
    "weights": { "hardMetrics": 50, "taste": 50 },
    "activeDimensions": [
      {
        "id": "1.1",
        "name": "维度名称",
        "maxScore": 18,
        "focus": "本次任务特别关注什么"
      }
    ],
    "passThreshold": 70
  },
  "plannerNote": "给用户看的整体判断",
  "plannerQuestions": [
    {
      "id": "tech-stack",
      "category": "technical",
      "question": "希望使用什么技术栈？",
      "hint": "决定 PRD 中的接口规范、性能预期与部署架构"
    }
  ]
}`

function buildPlannerUserPrompt(params: {
  normalizedContent: NormalizedContent
  rawContent: string
  rubricContent: string
}): string {
  const { normalizedContent, rawContent, rubricContent } = params

  return `## 本次任务的需求信息

### 原始输入
${rawContent}

### 归一化后的需求
- 概要：${normalizedContent.summary}
- 用户故事：${normalizedContent.userStory}
- 痛点：${normalizedContent.painPoints.map(point => `  - ${point}`).join("\n")}
- 约束：${normalizedContent.constraints.map(constraint => `  - ${constraint}`).join("\n")}
- 待追问：${normalizedContent.openQuestions.map(question => `  - ${question}`).join("\n")}
- 信息充分度：${normalizedContent.confidence}

---

## 你要使用的评估 Rubric

${rubricContent}

---

请基于以上信息，产出 WritingPlan 和 EvaluationRule。`
}

function extractJson(text: string): unknown {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonText = fenced?.[1] ?? trimmed
  const start = jsonText.indexOf("{")
  const end = jsonText.lastIndexOf("}")

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Planner 未返回可解析的 JSON")
  }

  return JSON.parse(jsonText.slice(start, end + 1))
}

function toNeedType(value: unknown): "lightweight_api" | "complex_agent" | "perception" {
  const text = String(value ?? "").toLowerCase()

  if (
    text.includes("complex_agent") ||
    text.includes("复杂") ||
    text.includes("agent")
  ) {
    return "complex_agent"
  }

  if (
    text.includes("perception") ||
    text.includes("感知") ||
    text.includes("多模态")
  ) {
    return "perception"
  }

  return "lightweight_api"
}

function firstNumber(value: unknown, fallback: number): number {
  if (typeof value === "number") return value
  const matched = String(value ?? "").match(/\d+/)
  return matched ? Number(matched[0]) : fallback
}

function normalizePlannerShape(value: unknown): unknown {
  if (!value || typeof value !== "object") return value

  const raw = value as Record<string, any>

  if (raw.writingPlan && raw.evaluationRule && raw.plannerNote) {
    return raw
  }

  const legacyPlan = raw.WritingPlan ?? raw.writing_plan ?? raw.plan ?? {}
  const legacyRule = raw.EvaluationRule ?? raw.evaluation_rule ?? raw.rule ?? {}

  const legacySections = Array.isArray(legacyPlan.sections)
    ? legacyPlan.sections
    : Array.isArray(legacyPlan.outline)
      ? legacyPlan.outline
      : []

  const outline = legacySections.slice(0, 8).map((section: any, index: number) => ({
    section: String(section.section ?? section.title ?? `章节 ${index + 1}`),
    purpose: String(section.purpose ?? section.goal ?? "说明本章节的核心问题"),
    keyPoints: Array.isArray(section.keyPoints)
      ? section.keyPoints.map(String)
      : Array.isArray(section.coreQuestions)
        ? section.coreQuestions.map(String)
        : [],
    estimatedWords: firstNumber(
      section.estimatedWords ?? section.suggestedWordCount,
      350,
    ),
  }))

  const requirementType = legacyRule.requirementType ?? {}
  const dynamicWeight = legacyRule.dynamicWeight ?? {}
  const dimensionActivation = legacyRule.dimensionActivation ?? {}
  const activeDimensions = Array.isArray(legacyRule.activeDimensions)
    ? legacyRule.activeDimensions
    : Array.isArray(dimensionActivation.activatedDimensions)
      ? dimensionActivation.activatedDimensions
      : []

  const needTypeValue =
    legacyRule.needType ??
    requirementType.selectedType ??
    dynamicWeight.selectedFromRubric

  const needTypeReason =
    legacyRule.needTypeReason ??
    requirementType.mappingNote ??
    (Array.isArray(requirementType.judgementReason)
      ? requirementType.judgementReason.join("；")
      : "Planner 基于 Rubric 动态权重表完成需求类型判定。")

  return {
    writingPlan: {
      outline,
      overallGuidance: String(
        legacyPlan.overallGuidance ??
          legacyPlan.goal ??
          (Array.isArray(legacyPlan.writingPrinciples)
            ? legacyPlan.writingPrinciples.join("；")
            : "保持 PRD 结构清晰、结论前置，并显式标注假设与待确认问题。"),
      ),
      risks: Array.isArray(legacyPlan.risks)
        ? legacyPlan.risks.map(String)
        : Array.isArray(legacyPlan.globalConstraints)
          ? legacyPlan.globalConstraints.map(String)
          : ["当前需求仍有信息缺口，Generator 需要显式保留默认假设与待确认项。"],
    },
    evaluationRule: {
      rubricVersion: String(
        legacyRule.rubricVersion ??
          legacyRule.version ??
          raw.rubricVersion ??
          "1.0-revised",
      ),
      needType: toNeedType(needTypeValue),
      needTypeReason: String(needTypeReason),
      weights: {
        hardMetrics: firstNumber(
          legacyRule.weights?.hardMetrics ?? dynamicWeight.hardMetricsWeight,
          50,
        ),
        taste: firstNumber(
          legacyRule.weights?.taste ?? dynamicWeight.tasteWeight,
          50,
        ),
      },
      activeDimensions: activeDimensions.map((dimension: any) => ({
        id: String(dimension.id ?? dimension.dimensionId ?? ""),
        name: String(dimension.name ?? dimension.dimensionName ?? ""),
        maxScore: firstNumber(dimension.maxScore ?? dimension.score, 0),
        focus: String(
          dimension.focus ??
            dimension.whyAdjusted ??
            (Array.isArray(dimension.taskSpecificFocus)
              ? dimension.taskSpecificFocus.join("；")
              : ""),
        ),
      })),
      passThreshold: firstNumber(legacyRule.passThreshold, 70),
    },
    plannerNote: String(
      raw.plannerNote ??
        raw.PlannerNote ??
        "Planner 已基于归一化需求和 Rubric Skill 生成写作规划与评估规则。",
    ),
    plannerQuestions: Array.isArray(raw.plannerQuestions)
      ? raw.plannerQuestions
          .slice(0, 5)
          .map((q: any, index: number) => {
            const rawCategory = String(q?.category ?? "").toLowerCase()
            const category =
              rawCategory === "business" ||
              rawCategory === "scope" ||
              rawCategory === "ux"
                ? rawCategory
                : "technical"

            return {
              id: String(q?.id ?? `q${index + 1}`),
              category,
              question: String(q?.question ?? "").trim() || "（问题缺失）",
              hint:
                typeof q?.hint === "string" && q.hint.trim().length > 0
                  ? q.hint
                  : undefined,
            }
          })
          .filter((q: any) => q.question !== "（问题缺失）")
      : [],
  }
}

export async function runPlanner(params: {
  normalizedContent: NormalizedContent
  rawContent: string
  signal?: AbortSignal
}): Promise<{
  output: PlannerOutput
  tokens: { input: number; output: number }
  durationMs: number
}> {
  const start = Date.now()
  const rubricContent = await loadRubric()

  const result = await generatePRDText({
    system: PLANNER_SYSTEM_PROMPT,
    prompt: buildPlannerUserPrompt({
      normalizedContent: params.normalizedContent,
      rawContent: params.rawContent,
      rubricContent,
    }),
    maxOutputTokens: 4000,
    signal: params.signal,
  })
  const parsed = normalizePlannerShape(extractJson(result.text))
  const output = PlannerOutputSchema.parse(parsed)

  return {
    output,
    tokens: {
      input: result.inputTokens,
      output: result.outputTokens,
    },
    durationMs: Date.now() - start,
  }
}
