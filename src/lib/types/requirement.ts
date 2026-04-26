import { z } from "zod"

export const RequirementSourceSchema = z.enum(["text", "chat"])
export type RequirementSource = z.infer<typeof RequirementSourceSchema>

export const NormalizedContentSchema = z.object({
  summary: z.string().describe("一句话概括这个需求"),
  userStory: z.string().describe("谁 + 在什么场景 + 想达到什么目的"),
  painPoints: z.array(z.string()).describe("识别出的用户痛点"),
  constraints: z.array(z.string()).describe("已知约束：时间/资源/合规/技术"),
  openQuestions: z.array(z.string()).describe("PM 应该继续问清楚的问题"),
  confidence: z.enum(["high", "medium", "low"]).describe("信息充分度自评"),
})
export type NormalizedContent = z.infer<typeof NormalizedContentSchema>

export const RequirementDraftSchema = z.object({
  id: z.string(),
  source: RequirementSourceSchema,
  rawContent: z.string(),
  normalizedContent: NormalizedContentSchema,
  createdAt: z.string(),
  metadata: z
    .object({
      chatParticipants: z.array(z.string()).optional(),
      originalLength: z.number().optional(),
    })
    .optional(),
})
export type RequirementDraft = z.infer<typeof RequirementDraftSchema>

// 前端 store / API 交互用的"未归一化"草稿
export interface RawInput {
  source: RequirementSource
  rawContent: string
}
