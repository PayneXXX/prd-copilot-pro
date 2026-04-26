import { z } from "zod"

// Planner 的输出之一：评估规则（给 Evaluator 用）
export const EvaluationRuleSchema = z.object({
  rubricVersion: z.string().describe("引用的 Rubric 版本"),
  needType: z
    .enum(["lightweight_api", "complex_agent", "perception"])
    .describe("识别出的需求类型"),
  needTypeReason: z.string().describe("为什么判定为这个类型（一句话）"),
  weights: z.object({
    hardMetrics: z.number().min(0).max(100).describe("硬指标层权重"),
    taste: z.number().min(0).max(100).describe("品味层权重"),
  }),
  activeDimensions: z
    .array(
      z.object({
        id: z.string().describe("维度 ID，如 1.1, 2.3"),
        name: z.string(),
        maxScore: z.number().describe("本次任务下该维度的最高分"),
        focus: z.string().describe("本次任务在这个维度上需要特别关注什么"),
      }),
    )
    .describe("本次评估激活的维度列表，含权重调整后的分值"),
  passThreshold: z
    .number()
    .default(70)
    .describe("及格线：低于此分 Evaluator 打回重做"),
})
export type EvaluationRule = z.infer<typeof EvaluationRuleSchema>

// Planner 的输出之二：写作规划（给 Generator 用）
export const WritingPlanSchema = z.object({
  outline: z.array(
    z.object({
      section: z.string().describe("章节标题"),
      purpose: z.string().describe("本章节要回答的核心问题"),
      keyPoints: z.array(z.string()).describe("本章节必须覆盖的要点"),
      estimatedWords: z.number().describe("建议字数，避免 Generator 超纲"),
    }),
  ),
  overallGuidance: z.string().describe("写作全局指引（风格/语调/重点）"),
  risks: z.array(z.string()).describe("PM 视角下本次撰写要警惕的风险点"),
})
export type WritingPlan = z.infer<typeof WritingPlanSchema>

// Planner 向用户提出的待确认问题
export const PlannerQuestionSchema = z.object({
  id: z.string().describe("问题 ID，使用稳定且唯一的 slug，如 'q1' 或 'tech-stack'"),
  category: z
    .enum(["technical", "business", "scope", "ux"])
    .describe("问题所属分类"),
  question: z.string().describe("提给用户的问题正文（一句话）"),
  hint: z
    .string()
    .optional()
    .describe("给用户的背景提示：为什么这个问题对 PRD 重要"),
})
export type PlannerQuestion = z.infer<typeof PlannerQuestionSchema>

// Planner 的完整输出
export const PlannerOutputSchema = z.object({
  writingPlan: WritingPlanSchema,
  evaluationRule: EvaluationRuleSchema,
  plannerNote: z.string().describe("Planner 对本次任务的整体判断和说明，给用户看"),
  plannerQuestions: z
    .array(PlannerQuestionSchema)
    .max(5)
    .default([])
    .describe(
      "需要向用户追问的关键技术或业务细节，最多 5 条，归一化阶段已覆盖的可以为空数组",
    ),
})
export type PlannerOutput = z.infer<typeof PlannerOutputSchema>
