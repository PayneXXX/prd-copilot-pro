"use client"

import { toast } from "sonner"

import { WorkspaceHeader } from "@/components/dashboard/WorkspaceHeader"
import type { EvaluationResult, HardGate } from "@/lib/types/evaluator"
import type { GeneratorOutput } from "@/lib/types/generator"
import type { PlannerOutput } from "@/lib/types/planner"
import { safeFetchJson } from "@/lib/utils/safe-fetch"
import {
  selectActivePlannerOutput,
  useSession,
  type EvaluationSnapshot,
} from "@/store/session-store"

type EvaluateResponse =
  | {
      ok: true
      evaluation: EvaluationResult
      tokens: { input: number; output: number }
      durationMs: number
    }
  | { ok: false; error: string }

type ReviseResponse =
  | {
      ok: true
      generatorOutput: GeneratorOutput
      tokens: { input: number; output: number }
      durationMs: number
    }
  | { ok: false; error: string }

const MAX_REVISIONS = 2

const VERDICT_LABEL: Record<EvaluationResult["verdict"], string> = {
  pass: "PASS",
  needs_revision: "NEEDS REVISION",
  rejected: "REJECTED",
}

const VERDICT_COLOR: Record<EvaluationResult["verdict"], string> = {
  pass: "var(--status-success)",
  needs_revision: "var(--status-warning)",
  rejected: "var(--status-error)",
}

export function EvaluatorWorkspace() {
  const {
    prdEditingContent,
    evaluations,
    reviseCount,
    evaluatorLoading,
    generatorRevising,
    evaluatorUserFeedback,
    addEvaluation,
    addPrdVersion,
    incrementReviseCount,
    setGeneratorResult,
    setStepFeedback,
    setEvaluatorLoading,
    setGeneratorRevising,
    setStep,
    revertToReview,
  } = useSession()
  const plannerOutput = useSession(selectActivePlannerOutput)

  const currentEvaluation = evaluations[evaluations.length - 1]
  const isCurrentPrdEvaluated =
    currentEvaluation?.prdAtEvaluation === prdEditingContent

  async function handleStartEvaluation() {
    if (!prdEditingContent || !plannerOutput) return
    setEvaluatorLoading(true)

    const result = await safeFetchJson<EvaluateResponse>("/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prdMarkdown: prdEditingContent,
        evaluationRule: plannerOutput.evaluationRule,
      }),
    })
    setEvaluatorLoading(false)

    if (!result.ok) {
      toast.error("Evaluator 失败", { description: result.message })
      return
    }

    if (!result.data.ok) {
      toast.error("Evaluator 失败", { description: result.data.error })
      return
    }

    console.log("[evaluator] addEvaluation called", {
      prdLen: prdEditingContent.length,
      score: result.data.evaluation.overallScore,
      verdict: result.data.evaluation.verdict,
    })

    addEvaluation({
      prdAtEvaluation: prdEditingContent,
      result: result.data.evaluation,
      tokens: result.data.tokens,
      durationMs: result.data.durationMs,
    })
    toast.success(
      `评估完成 · ${result.data.evaluation.overallScore} 分 · ${result.data.evaluation.verdict}`,
    )
  }

  async function handleRequestRevision() {
    if (!currentEvaluation || !plannerOutput) return
    if (reviseCount >= MAX_REVISIONS) {
      toast.warning("已达返工上限（2 轮），请使用人类审核")
      revertToReview()
      return
    }
    setGeneratorRevising(true)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 200_000)

    const result = await safeFetchJson<ReviseResponse>("/api/revise-prd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalPrd: prdEditingContent,
        evaluation: currentEvaluation.result,
        writingPlan: plannerOutput.writingPlan,
        evaluatorUserFeedback,
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    setGeneratorRevising(false)

    if (!result.ok) {
      const msg =
        result.kind === "abort"
          ? "返工请求超过 200 秒，请查看终端日志并重试。"
          : result.message
      toast.error("返工失败", { description: msg })
      return
    }

    if (!result.data.ok) {
      toast.error("返工失败", { description: result.data.error })
      return
    }

    setGeneratorResult(
      result.data.generatorOutput,
      result.data.tokens,
      result.data.durationMs,
    )
    addPrdVersion({
      content: result.data.generatorOutput.prdMarkdown,
      source: "revision-evaluator",
      feedbackContext: {
        humanFeedback: evaluatorUserFeedback,
        evaluatorSuggestions: currentEvaluation.result.revisionSuggestions,
      },
    })
    incrementReviseCount()
    toast.success(`返工完成（第 ${reviseCount + 1} 轮）· 请再次评估`)
  }

  console.log("[evaluator] render decision", {
    hasEvaluation: Boolean(currentEvaluation),
    isCurrentPrdEvaluated,
    prdLen: prdEditingContent.length,
    evalPrdLen: currentEvaluation?.prdAtEvaluation.length,
  })

  if (!plannerOutput || !prdEditingContent) {
    return (
      <div className="mx-auto max-w-[720px]">
        <WorkspaceHeader
          kicker="第四章"
          roman="Ⅳ"
          title="评分"
          subtitle=""
        />
        <p className="caption-label">请先完成 Generator，并提交 PRD 给 Evaluator</p>
      </div>
    )
  }

  if (evaluatorLoading) {
    return (
      <LoadingState
        title="评分中"
        body="Kimi K2 按 Rubric 打分 · 预计 150–200 秒。期间请勿离开页面。"
      />
    )
  }

  if (generatorRevising) {
    return (
      <LoadingState
        title={`返工中 · 第 ${reviseCount + 1} 轮`}
        body="Generator 按 Evaluator 反馈修订 PRD · 预计 90–150 秒。"
      />
    )
  }

  if (!currentEvaluation || !isCurrentPrdEvaluated) {
    return (
      <PreEvaluator
        plannerOutput={plannerOutput}
        previousScore={currentEvaluation?.result.overallScore}
        onStart={handleStartEvaluation}
      />
    )
  }

  return (
    <div className="mx-auto max-w-[720px]">
      <WorkspaceHeader
        kicker="第四章"
        roman="Ⅳ"
        title="评分"
        subtitle="按 Rubric 给出加权总分与三硬门槛判定。所有维度详情默认展开。"
      />

      <VerdictPanel evaluation={currentEvaluation.result} round={reviseCount} />
      <HardGatesSection evaluation={currentEvaluation.result} />
      <DimensionsSection evaluation={currentEvaluation.result} />
      <RevisionSuggestions evaluation={currentEvaluation.result} />
      {evaluations.length > 1 && <HistorySection evaluations={evaluations} />}
      <EvaluatorFeedback
        value={evaluatorUserFeedback}
        onChange={value => setStepFeedback("evaluator", value)}
      />
      <ActionBar
        evaluation={currentEvaluation.result}
        reviseCount={reviseCount}
        onRevise={handleRequestRevision}
        onEnterReview={() => setStep("review")}
        onForcePass={() => {
          setStep("review")
          toast.warning("已由人类强制放行，进入审核")
        }}
      />
    </div>
  )
}

function LoadingState({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-[720px]">
      <WorkspaceHeader
        kicker="第四章"
        roman="Ⅳ"
        title="评分"
        subtitle=""
      />
      <div className="border-t border-[var(--border-hairline)] pt-6">
        <div className="caption-label pb-2">{title}</div>
        <p className="text-[15px] leading-[1.7] text-[var(--text-secondary)]">
          {body}
        </p>
      </div>
    </div>
  )
}

function PreEvaluator({
  plannerOutput,
  previousScore,
  onStart,
}: {
  plannerOutput: PlannerOutput
  previousScore?: number
  onStart: () => void
}) {
  return (
    <div className="mx-auto max-w-[720px]">
      <WorkspaceHeader
        kicker="第四章"
        roman="Ⅳ"
        title="评分"
        subtitle="Evaluator（Kimi K2）将按 Planner 产出的评估规则对 PRD 打分。三核心维度需各自过线 60%。"
      />

      <section className="mb-10">
        <div className="border-b border-[var(--border-strong)] pb-2">
          <span className="caption-label">评估参数</span>
        </div>
        <div className="pt-2">
          <div className="data-row">
            <span className="label">需求类型</span>
            <span className="value">
              {plannerOutput.evaluationRule.needType}
            </span>
          </div>
          <div className="data-row">
            <span className="label">硬指标层 / 品味层</span>
            <span className="value tnum">
              {plannerOutput.evaluationRule.weights.hardMetrics}
              <sup>%</sup>
              {" / "}
              {plannerOutput.evaluationRule.weights.taste}
              <sup>%</sup>
            </span>
          </div>
          <div className="data-row">
            <span className="label">激活维度</span>
            <span className="value tnum">
              {plannerOutput.evaluationRule.activeDimensions.length}
              <sup>项</sup>
            </span>
          </div>
          <div className="data-row">
            <span className="label">总分过线</span>
            <span className="value tnum">
              {plannerOutput.evaluationRule.passThreshold}
              <sup>分</sup>
            </span>
          </div>
        </div>
      </section>

      {previousScore !== undefined && (
        <div
          className="mb-8 border-l-2 px-4 py-3 text-[13px] leading-[1.7]"
          style={{
            borderColor: "var(--status-warning)",
            background: "var(--bg-subtle)",
            color: "var(--status-warning)",
          }}
        >
          PRD 已根据上一轮反馈发生变化，需要重新评估。上一轮得分：{previousScore} / 100。
        </div>
      )}

      <div className="border-t border-[var(--border-hairline)] pt-6">
        <p className="text-[13px] text-[var(--text-secondary)]">
          长 PRD 评分可能超过 3 分钟 · 当前不会主动中断 · 期间请勿离开页面
        </p>
        <div className="mt-6">
          <button type="button" onClick={onStart} className="btn-editorial">
            启动 Evaluator →
          </button>
        </div>
      </div>
    </div>
  )
}

function VerdictPanel({
  evaluation,
  round,
}: {
  evaluation: EvaluationResult
  round: number
}) {
  const color = VERDICT_COLOR[evaluation.verdict]
  const passedGates =
    [
      evaluation.hardGates.dim_1_1.passed,
      evaluation.hardGates.dim_1_4.passed,
      evaluation.hardGates.dim_2_3.passed,
    ].filter(Boolean).length

  return (
    <section className="border-y border-[var(--border-strong)] py-10">
      <div className="flex items-baseline gap-4">
        <span
          className="editorial-num leading-none"
          style={{ fontSize: "84px", fontWeight: 500 }}
        >
          {evaluation.overallScore}
        </span>
        <span className="text-[20px] text-[var(--text-tertiary)]">／</span>
        <span
          className="editorial-num text-[var(--text-tertiary)]"
          style={{ fontSize: "28px" }}
        >
          100
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className="caption-label" style={{ color }}>
          {VERDICT_LABEL[evaluation.verdict]}
        </span>
        <span className="caption-label">
          三硬门槛 · {passedGates} / 3 过线
        </span>
        {round > 0 && (
          <span className="caption-label">第 {round} 轮返工后</span>
        )}
      </div>
      {evaluation.verdictReason && (
        <p className="mt-4 max-w-[60ch] text-[14px] leading-[1.7] text-[var(--text-secondary)]">
          {evaluation.verdictReason}
        </p>
      )}
    </section>
  )
}

function HardGatesSection({ evaluation }: { evaluation: EvaluationResult }) {
  const gates: HardGate[] = [
    evaluation.hardGates.dim_1_1,
    evaluation.hardGates.dim_1_4,
    evaluation.hardGates.dim_2_3,
  ]

  return (
    <section className="mt-12">
      <div className="border-b border-[var(--border-strong)] pb-2">
        <span className="caption-label">三核心维度 · 硬门槛</span>
      </div>
      <p className="mt-3 text-[12.5px] italic text-[var(--text-tertiary)]">
        任一未过线，无论总分多高都视为未通过。
      </p>

      <div className="mt-4">
        {gates.map(gate => (
          <div
            key={gate.id}
            className="border-t border-[var(--border-hairline)] py-4"
          >
            <div className="flex items-baseline justify-between gap-4">
              <div className="flex items-baseline gap-3">
                <span
                  className="tabular-nums text-[var(--text-tertiary)]"
                  style={{
                    fontFamily: "var(--font-newsreader), Georgia, serif",
                    fontSize: "13px",
                  }}
                >
                  {gate.id}
                </span>
                <span className="text-[14px] font-medium">{gate.name}</span>
              </div>
              <div className="flex items-baseline gap-4">
                <span
                  className="editorial-num"
                  style={{ fontSize: "16px", fontWeight: 500 }}
                >
                  {gate.score}
                  <span className="text-[var(--text-tertiary)]"> / </span>
                  {gate.maxScore}
                </span>
                <span
                  className="caption-label"
                  style={{
                    color: gate.passed
                      ? "var(--status-success)"
                      : "var(--status-error)",
                  }}
                >
                  {gate.passed ? "过线" : "未过线"}
                </span>
              </div>
            </div>
            {gate.feedback && (
              <p className="mt-2 text-[13px] leading-[1.6] text-[var(--text-secondary)]">
                {gate.feedback}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function DimensionsSection({ evaluation }: { evaluation: EvaluationResult }) {
  return (
    <section className="mt-12">
      <div className="border-b border-[var(--border-strong)] pb-2">
        <span className="caption-label">所有维度 · 详细评分</span>
      </div>

      <div className="mt-4">
        {evaluation.dimensions.map(dim => {
          const ratio = dim.maxScore > 0 ? dim.score / dim.maxScore : 0
          const color =
            ratio >= 0.8
              ? "var(--status-success)"
              : ratio >= 0.6
                ? "var(--text-secondary)"
                : "var(--status-error)"

          return (
            <div
              key={dim.id}
              className="border-t border-[var(--border-hairline)] py-4"
            >
              <div className="flex items-baseline justify-between gap-4">
                <div className="flex items-baseline gap-3">
                  <span
                    className="tabular-nums text-[var(--text-tertiary)]"
                    style={{
                      fontFamily: "var(--font-newsreader), Georgia, serif",
                      fontSize: "13px",
                    }}
                  >
                    {dim.id}
                  </span>
                  <span className="text-[14px] font-medium">{dim.name}</span>
                </div>
                <span
                  className="editorial-num"
                  style={{ fontSize: "16px", fontWeight: 500, color }}
                >
                  {dim.score}
                  <span className="text-[var(--text-tertiary)]"> / </span>
                  {dim.maxScore}
                </span>
              </div>
              <p className="mt-2 text-[13px] leading-[1.6] text-[var(--text-secondary)]">
                {dim.feedback}
              </p>
              {dim.evidence && (
                <blockquote
                  className="mt-2 border-l-2 pl-3 text-[12.5px] italic leading-[1.6] text-[var(--text-tertiary)]"
                  style={{ borderColor: "var(--border-hairline)" }}
                >
                  {dim.evidence}
                </blockquote>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function RevisionSuggestions({
  evaluation,
}: {
  evaluation: EvaluationResult
}) {
  if (evaluation.revisionSuggestions.length === 0) return null

  const isPass = evaluation.verdict === "pass"
  const heading = isPass ? "进一步优化建议" : "返工建议"
  const hint = isPass
    ? "以下建议非强制，但采纳后可进一步提升质量。"
    : "以下建议必须处理，Generator 返工时会按此清单修订。"

  return (
    <section className="mt-12">
      <div className="border-b border-[var(--border-strong)] pb-2">
        <span className="caption-label">{heading}</span>
      </div>
      <p className="mt-3 text-[12.5px] italic text-[var(--text-tertiary)]">
        {hint}
      </p>

      <ol className="mt-4 space-y-3">
        {evaluation.revisionSuggestions.map((suggestion, index) => (
          <li
            key={`${index}-${suggestion}`}
            className="flex gap-3 border-t border-[var(--border-hairline)] pt-3 text-[14px] leading-[1.65]"
          >
            <span
              className="shrink-0 italic"
              style={{
                fontFamily: "var(--font-newsreader), Georgia, serif",
                color: "var(--accent-base)",
                fontSize: "14px",
              }}
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="text-[var(--text-primary)]">{suggestion}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function HistorySection({
  evaluations,
}: {
  evaluations: EvaluationSnapshot[]
}) {
  return (
    <section className="mt-12">
      <div className="border-b border-[var(--border-strong)] pb-2">
        <span className="caption-label">评分历史</span>
      </div>
      <div className="mt-2">
        {evaluations.map(evaluation => {
          const label =
            evaluation.round === 0 ? "初评" : `第 ${evaluation.round} 轮返工`
          return (
            <div key={evaluation.createdAt} className="data-row">
              <span className="label">{label}</span>
              <span className="value tnum">
                {evaluation.result.overallScore}
                <sup>分</sup>
                <span className="ml-3 text-[var(--text-tertiary)]">
                  {evaluation.result.verdict}
                </span>
                <span className="ml-3 text-[var(--text-tertiary)]">
                  {(evaluation.durationMs / 1000).toFixed(0)}
                  <sup>s</sup>
                </span>
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function EvaluatorFeedback({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <section className="mt-12 border-t border-[var(--border-hairline)] pt-6">
      <div className="caption-label pb-3">对评分的反馈（可选）</div>
      <p className="pb-3 text-[12.5px] italic text-[var(--text-tertiary)]">
        写下你对评分的疑问、对返工建议的回应，或希望 Generator 返工时额外注意的点。
        点击"要求返工"时，这段反馈会一并传给 Generator。
      </p>
      <textarea
        value={value}
        onChange={event => onChange(event.target.value)}
        rows={5}
        placeholder="例如：1.4 的验收标准我认可，但 1.1 的目标值可以先用假设；返工时不要改核心流程..."
        className="input-editorial resize-y text-[14px] leading-[1.7]"
      />
    </section>
  )
}

function ActionBar({
  evaluation,
  reviseCount,
  onRevise,
  onEnterReview,
  onForcePass,
}: {
  evaluation: EvaluationResult
  reviseCount: number
  onRevise: () => void
  onEnterReview: () => void
  onForcePass: () => void
}) {
  const canRevise = reviseCount < MAX_REVISIONS
  const isPass = evaluation.verdict === "pass"

  return (
    <div className="mt-12 border-t border-[var(--border-hairline)] pt-6">
      <p className="caption-label pb-4">
        下一步 · 返工 {reviseCount} / {MAX_REVISIONS}
      </p>
      <div className="grid grid-cols-1 gap-0 md:grid-cols-3">
        <button
          type="button"
          onClick={onRevise}
          disabled={!canRevise}
          className={`flex flex-col items-start gap-1 border border-[var(--border-hairline)] px-6 py-5 text-left transition-colors ${
            isPass
              ? "bg-[var(--bg-card)] hover:bg-[var(--bg-hover)]"
              : "bg-[var(--text-primary)] text-[var(--text-on-accent)] hover:bg-[var(--accent-base)]"
          } disabled:opacity-40`}
        >
          <span className="text-[14px] font-medium">
            {isPass ? "按建议进一步优化" : "要求返工"}
          </span>
          <span className="text-[12px] opacity-75">
            Generator 按上方建议修订 · 重新评估
          </span>
        </button>
        <button
          type="button"
          onClick={onEnterReview}
          className={`flex flex-col items-start gap-1 border border-[var(--border-hairline)] px-6 py-5 text-left transition-colors md:border-l-0 ${
            isPass
              ? "bg-[var(--text-primary)] text-[var(--text-on-accent)] hover:bg-[var(--accent-base)]"
              : "bg-[var(--bg-card)] hover:bg-[var(--bg-hover)]"
          }`}
        >
          <span className="text-[14px] font-medium">进入人类审核</span>
          <span className="text-[12px] opacity-75">
            {isPass ? "评分合格 · 交给你做最终确认" : "先进入 Review 查看全文"}
          </span>
        </button>
        <button
          type="button"
          onClick={onForcePass}
          className="flex flex-col items-start gap-1 border border-[var(--border-hairline)] bg-[var(--bg-card)] px-6 py-5 text-left transition-colors hover:bg-[var(--bg-hover)] md:border-l-0"
        >
          <span className="text-[14px] font-medium">强制通过</span>
          <span className="text-[12px] opacity-75">
            保留评分记录，由人类最终放行
          </span>
        </button>
      </div>
    </div>
  )
}
