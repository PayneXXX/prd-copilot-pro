import { generateText } from "ai"

import { getModel } from "@/config/models"
import {
  EvaluationResultSchema,
  type EvaluationResult,
} from "@/lib/types/evaluator"
import type { EvaluationRule } from "@/lib/types/planner"

const EVALUATOR_SYSTEM_PROMPT = `你是 PRD Copilot 的 Evaluator Agent，由 Kimi K2 担任。你的职责是：按照 Planner 产出的 EvaluationRule，对 Generator 产出的 PRD 打分。

## 你的定位

- 你是独立第三方评审，**不是 Generator 的同厂商模型**（Generator 是 GLM，你是 Kimi），这是设计上特意的跨厂商评估
- 你的任务是按规则打分，不是创作
- 不要给 PRD "加分鼓励"，也不要为了苛刻而苛刻

## 核心原则

### 1. 只按激活维度打分
Planner 产出的 EvaluationRule 已经明确了本次评估激活哪些维度（activeDimensions）。你**只评这些维度**，不要自创维度。

### 2. 三核心维度硬门槛（不可妥协）
无论权重如何调节，以下三个维度必须独立打分并判定是否过线：
- **1.1 业务价值与量化目标** · 过线 = 得分 ≥ 60% × maxScore
- **1.4 评测与验收标准** · 过线 = 得分 ≥ 60% × maxScore
- **2.3 决策确定性** · 过线 = 得分 ≥ 60% × maxScore

**如果任一硬门槛不过线，无论总分多高，verdict 都是 needs_revision 或 rejected**。

### 3. verdict 判定规则
- \`pass\`: 三硬门槛全过 **且** overallScore ≥ passThreshold
- \`needs_revision\`: 有可修复问题（硬门槛不过但问题明确、或总分略低）
- \`rejected\`: 严重不合格（PRD 基本不能用，建议从 Planner 重启）

### 4. 证据优先
每个维度的 feedback 应引用 PRD 原文片段作为 evidence。空话扣分。

### 5. revisionSuggestions 必须具体可执行
- ❌ 坏的："加强业务价值说明"
- ✅ 好的："在第 7 章'指标、埋点与验收标准'前补充一个基线数据表格：[客服咨询占比 8%、查单时长 15s]；目标改为具体数值"

## 打分校准

对于每个维度，你要在 Rubric 的四档（满分/合格/勉强/不合格）之间定位：
- 满分档：给 maxScore
- 合格档：给 maxScore × 70%
- 勉强档：给 maxScore × 30%
- 不合格：给 0

校准举例（维度 1.1 业务价值，maxScore = 18）：
- PRD 里有"基线 15s → 目标 5s"这样的数字对：满分档 = 18 分
- PRD 里只有"降低客服咨询量"没数字：合格档 = 约 12 分（低于 60% 阈值 10.8，不过线！）
- PRD 里写"显著提升效率"：勉强档 = 约 5 分

## 输出格式

严格按照 EvaluationResultSchema 输出 JSON，不要用 Markdown 代码块包裹。`

function formatActiveDimensions(rule: EvaluationRule): string {
  return rule.activeDimensions
    .map(
      dimension =>
        `### ${dimension.id} · ${dimension.name}（本次满分 ${dimension.maxScore} 分）\n- 关注点：${dimension.focus}`,
    )
    .join("\n\n")
}

function buildEvaluatorPrompt(params: {
  prdMarkdown: string
  evaluationRule: EvaluationRule
}): string {
  const { prdMarkdown, evaluationRule: rule } = params

  return `## 评估规则（来自 Planner）

- 需求类型：${rule.needType}
- 类型判定理由：${rule.needTypeReason}
- 硬指标权重：${rule.weights.hardMetrics}%
- 品味层权重：${rule.weights.taste}%
- 总分过线（passThreshold）：${rule.passThreshold}

### 激活的评估维度

${formatActiveDimensions(rule)}

## 待评估的 PRD

${prdMarkdown}

---

请按系统 Prompt 的要求输出打分 JSON。特别注意：
- 1.1、1.4、2.3 必须独立打分并放进 hardGates 字段（即使它们不在 activeDimensions 里，也要给出一个基于 PRD 内容的合理估分）
- hardGates 的每个 threshold 固定为 maxScore × 0.6
- overallScore 按 dimensions 的分数加权合计，映射到 0-100 分范围
- verdict 必须严格按系统 Prompt 的规则判定`
}

type ActiveDimension = EvaluationRule["activeDimensions"][number]

const DIM_METADATA: Record<string, { name: string; defaultMaxScore: number }> = {
  "1.1": { name: "业务价值与量化目标", defaultMaxScore: 18 },
  "1.2": { name: "架构解耦纯净度", defaultMaxScore: 18 },
  "1.3": { name: "异常流与性能边界", defaultMaxScore: 12 },
  "1.4": { name: "评测与验收标准", defaultMaxScore: 12 },
  "2.1": { name: "信息降噪与结构化表达", defaultMaxScore: 12 },
  "2.2": { name: "读者同理心与视角隔离", defaultMaxScore: 13 },
  "2.3": { name: "决策确定性", defaultMaxScore: 15 },
}

function normalizeDimKey(key: string): string {
  const dimId = normalizeDimId(key) ?? dimKeyToId(key)
  return `dim_${dimId.replace(".", "_")}`
}

function dimKeyToId(key: string): string {
  if (key.startsWith("dim_")) {
    return key.replace("dim_", "").replace("_", ".")
  }

  return key
}

function normalizeDimId(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined
  }

  const text = String(value).trim().replace(/^dim_/, "").replace("_", ".")
  const match = text.match(/[12]\.\d/)
  return match?.[0]
}

function readString(raw: any, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = raw?.[key]

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim()
    }
  }

  return undefined
}

function readNumber(raw: any, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = raw?.[key]

    if (typeof value === "number" && Number.isFinite(value)) {
      return value
    }

    if (typeof value === "string") {
      const match = value.match(/\d+(?:\.\d+)?/)
      if (match) {
        return parseFloat(match[0])
      }
    }
  }

  return undefined
}

function activeDimensionById(
  activeDimensions: ActiveDimension[] | undefined,
  dimId: string | undefined,
): ActiveDimension | undefined {
  if (!dimId) return undefined
  return activeDimensions?.find(dimension => dimension.id === dimId)
}

function hydrateHardGate(
  key: string,
  raw: any,
  activeDimensions?: ActiveDimension[],
): any {
  const dimId =
    normalizeDimId(raw?.id) ??
    normalizeDimId(raw?.dimensionId) ??
    normalizeDimId(raw?.dimension_id) ??
    normalizeDimId(raw?.dimension) ??
    normalizeDimId(raw?.name) ??
    normalizeDimId(key) ??
    dimKeyToId(key)
  const activeDimension = activeDimensionById(activeDimensions, dimId)
  const meta = DIM_METADATA[dimId] ?? {
    name: activeDimension?.name ?? "未知维度",
    defaultMaxScore: activeDimension?.maxScore ?? 0,
  }
  const maxScore =
    readNumber(raw, ["maxScore", "max_score", "fullScore", "totalScore"]) ??
    activeDimension?.maxScore ??
    meta.defaultMaxScore
  const score =
    readNumber(raw, ["score", "actualScore", "actual_score", "points", "value"]) ??
    0

  return {
    id: raw.id ?? dimId,
    name:
      readString(raw, ["name", "dimensionName", "dimension_name", "title"]) ??
      activeDimension?.name ??
      meta.name,
    score,
    maxScore,
    threshold: readNumber(raw, ["threshold"]) ?? maxScore * 0.6,
    passed: raw.passed ?? score >= maxScore * 0.6,
    feedback: readString(raw, ["feedback", "comment", "reason"]) ?? "",
  }
}

function normalizeEvidence(evidence: unknown): string | undefined {
  if (Array.isArray(evidence)) {
    return evidence.map(item => String(item)).join("\n")
  }

  if (typeof evidence === "string") {
    return evidence
  }

  return undefined
}

function dimensionToHardGate(
  dimId: string,
  dimensions: any[],
  activeDimensions?: ActiveDimension[],
): any | undefined {
  const dimension = dimensions.find(item => item.id === dimId)

  if (!dimension) {
    return undefined
  }

  return hydrateHardGate(dimId, {
    id: dimension.id,
    name: dimension.name,
    score: dimension.score,
    maxScore: dimension.maxScore,
    feedback: dimension.feedback,
  }, activeDimensions)
}

function normalizeDimensions(
  rawDimensions: unknown,
  activeDimensions?: ActiveDimension[],
): any[] {
  let entries: Array<{ key?: string; value: any }> = []

  if (Array.isArray(rawDimensions)) {
    entries = rawDimensions.map(value => ({ value }))
  } else if (rawDimensions && typeof rawDimensions === "object") {
    entries = Object.entries(rawDimensions).map(([key, value]) => ({
      key,
      value,
    }))
  }

  return entries.map(({ key, value }, index) => {
    const raw = value && typeof value === "object" ? value : {}
    const activeDimension = activeDimensions?.[index]
    const dimId =
      normalizeDimId(raw.id) ??
      normalizeDimId(raw.dimensionId) ??
      normalizeDimId(raw.dimension_id) ??
      normalizeDimId(raw.dimension) ??
      normalizeDimId(raw.name) ??
      normalizeDimId(raw.title) ??
      normalizeDimId(key) ??
      activeDimension?.id ??
      ""
    const activeById = activeDimensionById(activeDimensions, dimId)
    const active = activeById ?? activeDimension
    const meta = DIM_METADATA[dimId] ?? {
      name: active?.name ?? "未知维度",
      defaultMaxScore: active?.maxScore ?? 0,
    }

    return {
      id: dimId,
      name:
        readString(raw, [
          "name",
          "dimensionName",
          "dimension_name",
          "title",
          "label",
        ]) ??
        active?.name ??
        meta.name,
      score:
        readNumber(raw, [
          "score",
          "actualScore",
          "actual_score",
          "points",
          "value",
        ]) ?? 0,
      maxScore:
        readNumber(raw, [
          "maxScore",
          "max_score",
          "fullScore",
          "totalScore",
        ]) ??
        active?.maxScore ??
        meta.defaultMaxScore,
      feedback: readString(raw, ["feedback", "comment", "reason"]) ?? "",
      evidence: normalizeEvidence(raw.evidence ?? raw.quote ?? raw.quotes),
    }
  })
}

function normalizeKimiOutput(
  parsed: any,
  activeDimensions?: ActiveDimension[],
): any {
  parsed.dimensions = normalizeDimensions(parsed.dimensions, activeDimensions)

  if (parsed.dimensions.length === 0 && activeDimensions?.length) {
    parsed.dimensions = activeDimensions.map(dimension => ({
      id: dimension.id,
      name: dimension.name,
      score: 0,
      maxScore: dimension.maxScore,
      feedback: "Evaluator 未返回该维度的评分。",
      evidence: undefined,
    }))
  } else {
    parsed.dimensions = parsed.dimensions.filter(
      (dimension: any) => dimension.id || dimension.name !== "未知维度",
    )
  }

  const dimensions = parsed.dimensions as any[]

  if (parsed.hardGates && typeof parsed.hardGates === "object") {
    const normalized: Record<string, any> = {}

    for (const [key, value] of Object.entries(parsed.hardGates)) {
      const normalizedKey = normalizeDimKey(key)
      normalized[normalizedKey] = hydrateHardGate(
        key,
        value,
        activeDimensions,
      )
    }

    for (const coreDim of ["dim_1_1", "dim_1_4", "dim_2_3"]) {
      if (!normalized[coreDim]) {
        const dimId = dimKeyToId(coreDim)
        normalized[coreDim] =
          dimensionToHardGate(dimId, dimensions, activeDimensions) ??
          hydrateHardGate(coreDim, {}, activeDimensions)
      }
    }

    parsed.hardGates = normalized
  } else {
    parsed.hardGates = {
      dim_1_1:
        dimensionToHardGate("1.1", dimensions, activeDimensions) ??
        hydrateHardGate("1.1", {}, activeDimensions),
      dim_1_4:
        dimensionToHardGate("1.4", dimensions, activeDimensions) ??
        hydrateHardGate("1.4", {}, activeDimensions),
      dim_2_3:
        dimensionToHardGate("2.3", dimensions, activeDimensions) ??
        hydrateHardGate("2.3", {}, activeDimensions),
    }
  }

  parsed.revisionSuggestions = Array.isArray(parsed.revisionSuggestions)
    ? parsed.revisionSuggestions
    : []
  parsed.verdictReason = parsed.verdictReason ?? ""
  parsed.overallFeedback = parsed.overallFeedback ?? ""
  parsed.overallScore = parsed.overallScore ?? 0
  parsed.verdict = parsed.verdict ?? "needs_revision"

  const gates = parsed.hardGates
  const hardGatePassed =
    gates.dim_1_1.passed && gates.dim_1_4.passed && gates.dim_2_3.passed

  if (!hardGatePassed && parsed.verdict === "pass") {
    parsed.verdict = "needs_revision"
    parsed.verdictReason =
      parsed.verdictReason ||
      "三核心硬门槛存在未过线项，已按规则从 pass 校正为 needs_revision。"
  }

  return parsed
}

function extractJsonStringField(chunk: string, field: string): string | undefined {
  const match = chunk.match(new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`))

  if (!match) {
    return undefined
  }

  try {
    return JSON.parse(`"${match[1]}"`)
  } catch {
    return match[1]
  }
}

function extractJsonNumberField(chunk: string, field: string): number | undefined {
  const match = chunk.match(new RegExp(`"${field}"\\s*:\\s*(\\d+(?:\\.\\d+)?)`))
  return match ? parseFloat(match[1]) : undefined
}

function rescueDimensions(text: string): any[] {
  const chunks =
    text.match(/\{[^{}]*"id"\s*:\s*"[12]\.\d"[^{}]*\}/g) ?? []

  return chunks
    .map(chunk => {
      try {
        return JSON.parse(chunk)
      } catch {
        const id = extractJsonStringField(chunk, "id")

        if (!id) {
          return null
        }

        return {
          id,
          name: extractJsonStringField(chunk, "name"),
          score: extractJsonNumberField(chunk, "score"),
          maxScore: extractJsonNumberField(chunk, "maxScore"),
          feedback: extractJsonStringField(chunk, "feedback"),
          evidence: extractJsonStringField(chunk, "evidence"),
        }
      }
    })
    .filter(Boolean)
}

function safeParseEvaluation(
  text: string,
  evaluationRule?: EvaluationRule,
): EvaluationResult {
  let attempt = text.trim()

  if (attempt.startsWith("```")) {
    attempt = attempt.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "")
  }

  const firstBrace = attempt.indexOf("{")
  const lastBrace = attempt.lastIndexOf("}")

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    attempt = attempt.slice(firstBrace, lastBrace + 1)
  }

  try {
    const parsed = JSON.parse(attempt)
    const normalized = normalizeKimiOutput(
      parsed,
      evaluationRule?.activeDimensions,
    )
    return EvaluationResultSchema.parse(normalized)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn("[evaluator] full parse failed:", message)
  }

  const scoreMatch = text.match(/"overallScore"\s*:\s*(\d+(?:\.\d+)?)/)
  const verdictMatch = text.match(
    /"verdict"\s*:\s*"(pass|needs_revision|rejected)"/,
  )
  const verdictReasonMatch = text.match(/"verdictReason"\s*:\s*"([^"]+)"/)
  const dimensionsRescued = rescueDimensions(text)
  const hardGatesRescued: Record<string, any> = {}

  for (const dimId of ["1.1", "1.4", "2.3"]) {
    const dottedDim = dimId.replace(".", "\\.")
    const normalizedDim = normalizeDimKey(dimId)
    const pattern = new RegExp(
      `"(?:${dottedDim}|${normalizedDim})"\\s*:\\s*\\{[\\s\\S]*?"score"\\s*:\\s*(\\d+(?:\\.\\d+)?)[\\s\\S]*?"passed"\\s*:\\s*(true|false)`,
    )
    const match = text.match(pattern)

    if (match) {
      const key = normalizeDimKey(dimId)
      hardGatesRescued[key] = hydrateHardGate(dimId, {
        score: parseFloat(match[1]),
        passed: match[2] === "true",
      })
    }
  }

  const hasRescuedData =
    Boolean(scoreMatch) ||
    Object.keys(hardGatesRescued).length > 0 ||
    dimensionsRescued.length > 0

  if (hasRescuedData) {
    console.warn("[evaluator] recovered partial fields via regex")

    const rescued = normalizeKimiOutput({
      overallScore: scoreMatch ? parseFloat(scoreMatch[1]) : 0,
      verdict: verdictMatch?.[1] ?? "needs_revision",
      verdictReason:
        verdictReasonMatch?.[1] ??
        "Evaluator 输出被截断，已抢救部分字段。建议重新评估。",
      hardGates: hardGatesRescued,
      dimensions: dimensionsRescued,
      overallFeedback: `⚠️ Evaluator 输出被截断（可能是 token 上限），已从原始文本中抢救以下字段。完整结果请重试。\n\n**原始输出片段**（前 500 字）:\n\n${text.slice(0, 500)}...`,
      revisionSuggestions: [],
    }, evaluationRule?.activeDimensions)

    try {
      return EvaluationResultSchema.parse(rescued)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn("[evaluator] rescue also failed schema:", message)
    }
  }

  console.warn("[evaluator] all parse attempts failed, returning rejection fallback")

  return EvaluationResultSchema.parse({
    overallScore: 0,
    verdict: "rejected",
    verdictReason: "Evaluator 输出严重异常，请人类直接审核",
    hardGates: {
      dim_1_1: hydrateHardGate("1.1", {}),
      dim_1_4: hydrateHardGate("1.4", {}),
      dim_2_3: hydrateHardGate("2.3", {}),
    },
    dimensions: [],
    overallFeedback: `Evaluator 返回格式严重异常，原始输出：\n\n${text.slice(0, 1000)}`,
    revisionSuggestions: [],
  })
}

export async function runEvaluator(params: {
  prdMarkdown: string
  evaluationRule: EvaluationRule
  signal?: AbortSignal
}): Promise<{
  output: EvaluationResult
  tokens: { input: number; output: number }
  durationMs: number
}> {
  const start = Date.now()

  const { text, usage } = await generateText({
    model: getModel("evaluator"),
    system: EVALUATOR_SYSTEM_PROMPT,
    prompt: buildEvaluatorPrompt(params),
    maxOutputTokens: 8000,
    abortSignal: params.signal,
  })

  const output = safeParseEvaluation(text, params.evaluationRule)

  return {
    output,
    tokens: {
      input: usage?.inputTokens ?? 0,
      output: usage?.outputTokens ?? 0,
    },
    durationMs: Date.now() - start,
  }
}
