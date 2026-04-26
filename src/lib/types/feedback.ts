/**
 * 反馈与版本追踪相关的类型。
 *
 * 设计意图：把"人类在每个阶段的反馈"和"PRD 历史版本"作为一等数据建模，
 * 让下游 agent 调用和 ContextSidebar 展示有统一的数据来源。
 */

export type FeedbackStep = "planner" | "generator" | "evaluator" | "review"

/** 单条 PRD 版本快照 */
export interface PrdVersion {
  /** 版本号显示用 ID，如 "v1" / "v2" */
  id: string
  /** PRD Markdown 全文 */
  content: string
  /** 此版本来自哪条路径 */
  source:
    | "generator" // Generator 第一次产出
    | "revision-evaluator" // 经 Evaluator 反馈返工
    | "revision-feedback" // 经人类反馈重新生成
    | "human-edit" // Review 阶段人类直接编辑
  /** ISO 时间戳 */
  createdAt: string
  /** v2 及以后才有：本次生成时使用的反馈上下文 */
  feedbackContext?: {
    humanFeedback?: string
    evaluatorSuggestions?: string[]
  }
}

/** "auto" = 用户选择把这个问题交给 Generator 自行决定 */
export type PlannerQuestionAnswer = string | "auto"
