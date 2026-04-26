import { z } from "zod"

export const DimensionScoreSchema = z.object({
  id: z.string().describe("维度 ID，如 1.1、2.3"),
  name: z.string().describe("维度名称"),
  score: z.number().min(0).describe("本次实际得分"),
  maxScore: z.number().describe("本维度满分（从 Planner evaluationRule 继承）"),
  feedback: z.string().describe("评分的具体依据，100-200 字"),
  evidence: z.string().optional().describe("引用 PRD 中的原文片段支持评分"),
})
export type DimensionScore = z.infer<typeof DimensionScoreSchema>

export const HardGateSchema = z.object({
  id: z.string(),
  name: z.string(),
  score: z.number(),
  maxScore: z.number(),
  threshold: z.number().describe("过线分（60% of maxScore）"),
  passed: z.boolean().describe("是否过线"),
  feedback: z.string(),
})
export type HardGate = z.infer<typeof HardGateSchema>

export const EvaluationResultSchema = z.object({
  overallScore: z.number().min(0).max(100).describe("加权总分"),
  verdict: z
    .enum(["pass", "needs_revision", "rejected"])
    .describe(
      "pass: 所有硬门槛通过 + 总分 ≥ passThreshold; needs_revision: 可修复问题; rejected: 严重不合格",
    ),
  verdictReason: z.string().describe("为什么是这个 verdict，1-2 句话"),
  hardGates: z
    .object({
      dim_1_1: HardGateSchema,
      dim_1_4: HardGateSchema,
      dim_2_3: HardGateSchema,
    })
    .describe("三核心维度硬门槛"),
  dimensions: z.array(DimensionScoreSchema).describe("所有激活维度的详细打分"),
  overallFeedback: z.string().describe("给 PM 看的总评 Markdown，可含表格/列表"),
  revisionSuggestions: z
    .array(z.string())
    .describe("给 Generator 看的具体返工建议，每条是一个明确动作"),
})
export type EvaluationResult = z.infer<typeof EvaluationResultSchema>
