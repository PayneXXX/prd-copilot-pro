import { create } from "zustand"

import { MODEL_PRICING, ROLE_MODELS, type Role } from "@/config/models"
import type { EvaluationResult } from "@/lib/types/evaluator"
import type {
  FeedbackStep,
  PlannerQuestionAnswer,
  PrdVersion,
} from "@/lib/types/feedback"
import type { GeneratorOutput } from "@/lib/types/generator"
import type { PlannerOutput } from "@/lib/types/planner"
import type { RequirementDraft } from "@/lib/types/requirement"

export type StepId =
  | "input"
  | "planner"
  | "generator"
  | "evaluator"
  | "review"
  | "skill"

export interface StepMeta {
  id: StepId
  label: string
  order: number
}

export const STEPS: StepMeta[] = [
  { id: "input", label: "输入需求", order: 1 },
  { id: "planner", label: "Planner 规划", order: 2 },
  { id: "generator", label: "Generator 撰写", order: 3 },
  { id: "evaluator", label: "Evaluator 评分", order: 4 },
  { id: "review", label: "人类审核", order: 5 },
  { id: "skill", label: "Skill 沉淀", order: 6 },
]

export interface EvaluationSnapshot {
  round: number
  prdAtEvaluation: string
  result: EvaluationResult
  tokens: { input: number; output: number }
  durationMs: number
  createdAt: string
}

type TokenUsage = { input: number; output: number }
type TokensByRole = Record<Role, TokenUsage>

export interface SessionState {
  currentStep: StepId
  draft: RequirementDraft | null
  plannerOutput: PlannerOutput | null
  plannerEdits: PlannerOutput | null
  plannerQuestionAnswers: Record<string, PlannerQuestionAnswer>
  plannerTokens: TokenUsage | null
  plannerDurationMs: number | null
  generatorOutput: GeneratorOutput | null
  generatorTokens: TokenUsage | null
  generatorDurationMs: number | null
  prdEditingContent: string
  prdFinalContent: string | null
  prdVersions: PrdVersion[]
  plannerUserFeedback: string
  generatorUserFeedback: string
  evaluatorUserFeedback: string
  reviewUserFeedback: string
  evaluations: EvaluationSnapshot[]
  reviseCount: number
  evaluatorLoading: boolean
  generatorRevising: boolean
  totalTokens: TokenUsage
  tokensByRole: TokensByRole
  totalDurationMs: number
  setStep: (step: StepId) => void
  setDraft: (draft: RequirementDraft, tokens?: TokenUsage) => void
  setPlannerResult: (
    output: PlannerOutput,
    tokens: TokenUsage,
    durationMs: number,
  ) => void
  setGeneratorResult: (
    output: GeneratorOutput,
    tokens: TokenUsage,
    durationMs: number,
  ) => void
  updateEditingContent: (content: string) => void
  finalizeAndExport: () => void
  submitToEvaluator: () => void
  addEvaluation: (
    snapshot: Omit<EvaluationSnapshot, "round" | "createdAt">,
  ) => void
  incrementReviseCount: () => void
  setEvaluatorLoading: (value: boolean) => void
  setGeneratorRevising: (value: boolean) => void
  revertToReview: () => void
  /** Phase 1+: 把用户在 Planner 阶段的整段编辑产物覆盖回 store */
  updatePlannerEdits: (edits: PlannerOutput) => void
  /** Phase 1+: 答 Planner 的某条提问；传入 "auto" 表示交给 Generator 决定 */
  setPlannerQuestionAnswer: (id: string, answer: PlannerQuestionAnswer) => void
  /** Phase 1+: 写下/更新某个步骤的自由反馈 */
  setStepFeedback: (step: FeedbackStep, text: string) => void
  /** Phase 1+: 追加一个 PRD 版本快照 */
  addPrdVersion: (version: Omit<PrdVersion, "id" | "createdAt"> & {
    id?: string
    createdAt?: string
  }) => void
  reset: () => void
}

const initialState = {
  currentStep: "input" as StepId,
  draft: null,
  plannerOutput: null,
  plannerEdits: null,
  plannerQuestionAnswers: {} as Record<string, PlannerQuestionAnswer>,
  plannerTokens: null,
  plannerDurationMs: null,
  generatorOutput: null,
  generatorTokens: null,
  generatorDurationMs: null,
  prdEditingContent: "",
  prdFinalContent: null,
  prdVersions: [] as PrdVersion[],
  plannerUserFeedback: "",
  generatorUserFeedback: "",
  evaluatorUserFeedback: "",
  reviewUserFeedback: "",
  evaluations: [],
  reviseCount: 0,
  evaluatorLoading: false,
  generatorRevising: false,
  totalTokens: { input: 0, output: 0 },
  tokensByRole: {
    normalizer: { input: 0, output: 0 },
    planner: { input: 0, output: 0 },
    generator: { input: 0, output: 0 },
    evaluator: { input: 0, output: 0 },
  },
  totalDurationMs: 0,
}

function nextVersionId(versions: PrdVersion[]): string {
  return `v${versions.length + 1}`
}

function addTokenUsage(current: TokenUsage, next: TokenUsage): TokenUsage {
  return {
    input: current.input + next.input,
    output: current.output + next.output,
  }
}

function addRoleTokens(
  current: TokensByRole,
  role: Role,
  tokens: TokenUsage,
): TokensByRole {
  return {
    ...current,
    [role]: addTokenUsage(current[role], tokens),
  }
}

export const useSession = create<SessionState>(set => ({
  ...initialState,
  setStep: step => set({ currentStep: step }),
  setDraft: (draft, tokens) =>
    set(state => ({
      draft,
      plannerOutput: null,
      plannerEdits: null,
      plannerQuestionAnswers: {},
      plannerTokens: null,
      plannerDurationMs: null,
      generatorOutput: null,
      generatorTokens: null,
      generatorDurationMs: null,
      prdEditingContent: "",
      prdFinalContent: null,
      prdVersions: [],
      plannerUserFeedback: "",
      generatorUserFeedback: "",
      evaluatorUserFeedback: "",
      reviewUserFeedback: "",
      evaluations: [],
      reviseCount: 0,
      evaluatorLoading: false,
      generatorRevising: false,
      totalTokens: tokens ? addTokenUsage(state.totalTokens, tokens) : state.totalTokens,
      tokensByRole: tokens
        ? addRoleTokens(state.tokensByRole, "normalizer", tokens)
        : state.tokensByRole,
      currentStep: "planner",
    })),
  setPlannerResult: (output, tokens, durationMs) =>
    set(state => ({
      plannerOutput: output,
      plannerEdits: null,
      plannerQuestionAnswers: {},
      plannerTokens: tokens,
      plannerDurationMs: durationMs,
      generatorOutput: null,
      generatorTokens: null,
      generatorDurationMs: null,
      prdEditingContent: "",
      prdFinalContent: null,
      prdVersions: [],
      plannerUserFeedback: "",
      generatorUserFeedback: "",
      evaluatorUserFeedback: "",
      reviewUserFeedback: "",
      evaluations: [],
      reviseCount: 0,
      evaluatorLoading: false,
      generatorRevising: false,
      totalTokens: {
        input: state.totalTokens.input + tokens.input,
        output: state.totalTokens.output + tokens.output,
      },
      tokensByRole: addRoleTokens(state.tokensByRole, "planner", tokens),
      totalDurationMs: state.totalDurationMs + durationMs,
      currentStep: "generator",
    })),
  setGeneratorResult: (output, tokens, durationMs) =>
    set(state => ({
      generatorOutput: output,
      generatorTokens: tokens,
      generatorDurationMs: durationMs,
      prdEditingContent: output.prdMarkdown,
      totalTokens: {
        input: state.totalTokens.input + tokens.input,
        output: state.totalTokens.output + tokens.output,
      },
      tokensByRole: addRoleTokens(state.tokensByRole, "generator", tokens),
      totalDurationMs: state.totalDurationMs + durationMs,
    })),
  updateEditingContent: content => set({ prdEditingContent: content }),
  finalizeAndExport: () =>
    set(state => ({
      prdFinalContent: state.prdEditingContent,
      currentStep: "skill",
    })),
  submitToEvaluator: () =>
    set(state => ({
      prdFinalContent: state.prdEditingContent,
      currentStep: "evaluator",
    })),
  addEvaluation: snapshot =>
    set(state => {
      const round = state.evaluations.length

      return {
        evaluations: [
          ...state.evaluations,
          { ...snapshot, round, createdAt: new Date().toISOString() },
        ],
        totalTokens: {
          input: state.totalTokens.input + snapshot.tokens.input,
          output: state.totalTokens.output + snapshot.tokens.output,
        },
        tokensByRole: addRoleTokens(
          state.tokensByRole,
          "evaluator",
          snapshot.tokens,
        ),
        totalDurationMs: state.totalDurationMs + snapshot.durationMs,
      }
    }),
  incrementReviseCount: () =>
    set(state => ({ reviseCount: state.reviseCount + 1 })),
  setEvaluatorLoading: value => set({ evaluatorLoading: value }),
  setGeneratorRevising: value => set({ generatorRevising: value }),
  revertToReview: () => set({ currentStep: "review" }),
  updatePlannerEdits: edits => set({ plannerEdits: edits }),
  setPlannerQuestionAnswer: (id, answer) =>
    set(state => ({
      plannerQuestionAnswers: {
        ...state.plannerQuestionAnswers,
        [id]: answer,
      },
    })),
  setStepFeedback: (step, text) =>
    set(() => {
      switch (step) {
        case "planner":
          return { plannerUserFeedback: text }
        case "generator":
          return { generatorUserFeedback: text }
        case "evaluator":
          return { evaluatorUserFeedback: text }
        case "review":
          return { reviewUserFeedback: text }
      }
    }),
  addPrdVersion: input =>
    set(state => {
      const id = input.id ?? nextVersionId(state.prdVersions)
      const createdAt = input.createdAt ?? new Date().toISOString()
      const version: PrdVersion = {
        id,
        content: input.content,
        source: input.source,
        feedbackContext: input.feedbackContext,
        createdAt,
      }

      return { prdVersions: [...state.prdVersions, version] }
    }),
  reset: () => set(initialState),
}))

export function selectFullContext(state: SessionState) {
  const latestEvaluation = state.evaluations[state.evaluations.length - 1]
  const activePlanner = state.plannerEdits ?? state.plannerOutput

  return {
    requirementSummary: state.draft?.normalizedContent.summary ?? null,
    plannerNote: activePlanner?.plannerNote ?? null,
    needType: activePlanner?.evaluationRule.needType ?? null,
    weights: activePlanner?.evaluationRule.weights ?? null,
    outlineCount: activePlanner?.writingPlan.outline.length ?? 0,
    prdLength: state.prdEditingContent?.length ?? 0,
    latestScore: latestEvaluation?.result.overallScore ?? null,
    latestVerdict: latestEvaluation?.result.verdict ?? null,
    reviseCount: state.reviseCount,
    versionCount: state.prdVersions.length,
  }
}

/**
 * 当前生效的 Planner 输出。优先使用用户编辑后的版本（plannerEdits），
 * 否则回退到 LLM 原始产出（plannerOutput）。
 */
export function selectActivePlannerOutput(
  state: SessionState,
): PlannerOutput | null {
  return state.plannerEdits ?? state.plannerOutput
}

/**
 * 把每个步骤的自由反馈拼成一段给 LLM 看的上下文。
 * 空段会被跳过。返回值可能是空字符串。
 */
export function selectAggregatedHumanFeedback(state: SessionState): string {
  const sections: Array<[string, string]> = [
    ["第二章 · Planner 阶段反馈", state.plannerUserFeedback.trim()],
    ["第三章 · Generator 阶段反馈", state.generatorUserFeedback.trim()],
    ["第四章 · Evaluator 阶段反馈", state.evaluatorUserFeedback.trim()],
    ["第五章 · Review 阶段反馈", state.reviewUserFeedback.trim()],
  ]

  return sections
    .filter(([, text]) => text.length > 0)
    .map(([label, text]) => `### ${label}\n${text}`)
    .join("\n\n")
}

export function selectHumanFeedbackEntries(state: SessionState) {
  return [
    {
      step: "planner" as const,
      label: "Planner 阶段反馈",
      text: state.plannerUserFeedback.trim(),
    },
    {
      step: "generator" as const,
      label: "Generator 阶段反馈",
      text: state.generatorUserFeedback.trim(),
    },
    {
      step: "evaluator" as const,
      label: "Evaluator 阶段反馈",
      text: state.evaluatorUserFeedback.trim(),
    },
    {
      step: "review" as const,
      label: "Review 阶段反馈",
      text: state.reviewUserFeedback.trim(),
    },
  ].filter(entry => entry.text.length > 0)
}

export function selectCostBreakdown(state: SessionState) {
  const byRole = {
    normalizer: calculateRoleCost("normalizer", state.tokensByRole.normalizer),
    planner: calculateRoleCost("planner", state.tokensByRole.planner),
    generator: calculateRoleCost("generator", state.tokensByRole.generator),
    evaluator: calculateRoleCost("evaluator", state.tokensByRole.evaluator),
  }

  return {
    byRole,
    total:
      byRole.normalizer.cost +
      byRole.planner.cost +
      byRole.generator.cost +
      byRole.evaluator.cost,
  }
}

function calculateRoleCost(role: Role, tokens: TokenUsage) {
  const model = ROLE_MODELS[role].modelId
  const pricing = MODEL_PRICING[model]
  const cost = pricing
    ? (tokens.input * pricing.input + tokens.output * pricing.output) / 1_000_000
    : 0

  return {
    model,
    tokens,
    cost,
  }
}
