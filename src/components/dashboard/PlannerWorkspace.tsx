"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { WorkspaceHeader } from "@/components/dashboard/WorkspaceHeader"
import type { PlannerQuestionAnswer } from "@/lib/types/feedback"
import type {
  EvaluationRule,
  PlannerOutput,
  PlannerQuestion,
  WritingPlan,
} from "@/lib/types/planner"
import { safeFetchJson } from "@/lib/utils/safe-fetch"
import { cn } from "@/lib/utils"
import { useSession } from "@/store/session-store"

type PlanResponse =
  | {
      ok: true
      plannerOutput: PlannerOutput
      tokens: { input: number; output: number }
      durationMs: number
    }
  | { ok: false; error: string }

const NEED_TYPE_LABEL: Record<EvaluationRule["needType"], string> = {
  lightweight_api: "lightweight_api · 轻量级 API",
  complex_agent: "complex_agent · 复杂 Agent",
  perception: "perception · 底层感知",
}

const QUESTION_CATEGORY_LABEL: Record<PlannerQuestion["category"], string> = {
  technical: "技术",
  business: "业务",
  scope: "范围",
  ux: "体验",
}

export function PlannerWorkspace() {
  const draft = useSession(state => state.draft)
  const plannerOutput = useSession(state => state.plannerOutput)
  const plannerEdits = useSession(state => state.plannerEdits)
  const plannerQuestionAnswers = useSession(
    state => state.plannerQuestionAnswers,
  )
  const plannerUserFeedback = useSession(state => state.plannerUserFeedback)
  const setPlannerResult = useSession(state => state.setPlannerResult)
  const updatePlannerEdits = useSession(state => state.updatePlannerEdits)
  const setPlannerQuestionAnswer = useSession(
    state => state.setPlannerQuestionAnswer,
  )
  const setStepFeedback = useSession(state => state.setStepFeedback)
  const setStep = useSession(state => state.setStep)

  const [loading, setLoading] = useState(false)

  async function runPlanner() {
    if (!draft) return

    setLoading(true)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 200_000)

    const result = await safeFetchJson<PlanResponse>("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    setLoading(false)

    if (!result.ok) {
      const msg =
        result.kind === "abort"
          ? "Planner 请求超过 200 秒，请查看终端日志并重试。"
          : result.message
      toast.error("Planner 失败", { description: msg })
      return
    }

    if (!result.data.ok) {
      toast.error("Planner 失败", { description: result.data.error })
      return
    }

    setPlannerResult(
      result.data.plannerOutput,
      result.data.tokens,
      result.data.durationMs,
    )
    toast.success("Planner 完成 · 请审视并按需修改")
  }

  if (!draft) {
    return (
      <div className="mx-auto max-w-[720px]">
        <WorkspaceHeader
          kicker="第二章"
          roman="Ⅱ"
          title="规划"
          subtitle=""
        />
        <p className="caption-label">请先完成「需求输入」步骤</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[720px]">
      <WorkspaceHeader
        kicker="第二章"
        roman="Ⅱ"
        title="规划"
        subtitle="Planner 读取归一化需求 + 系统内置 Rubric Skill，产出写作规划、评估规则，以及 PRD 撰写前的待确认问题。规划生成后所有字段你都可以修改。"
      />

      <section className="space-y-3 pb-10">
        <div className="caption-label">承接自第一章</div>
        <p className="text-[15px] leading-[1.7]">
          {draft.normalizedContent.summary}
        </p>
      </section>

      {!plannerOutput && !loading && (
        <div className="border-t border-[var(--border-hairline)] pt-8">
          <p className="text-[13px] leading-[1.7] text-[var(--text-secondary)]">
            这一步会读取 Rubric 并定制评估规则 · 预计 30–150 秒
          </p>
          <div className="mt-6">
            <button
              type="button"
              onClick={runPlanner}
              className="btn-editorial"
            >
              启动 Planner →
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="border-t border-[var(--border-hairline)] pt-8">
          <div className="caption-label pb-2">规划中</div>
          <p className="text-[15px] leading-[1.7] text-[var(--text-secondary)]">
            Planner 正在读取 Rubric 并定制本次评估规则。预计 30–150 秒，请勿离开页面。
          </p>
        </div>
      )}

      {plannerOutput && (
        <PlannerEditor
          original={plannerOutput}
          initialEdits={plannerEdits ?? plannerOutput}
          initialAnswers={plannerQuestionAnswers}
          initialFeedback={plannerUserFeedback}
          onCommit={({ edits, answers, feedback }) => {
            updatePlannerEdits(edits)
            for (const [id, answer] of Object.entries(answers)) {
              setPlannerQuestionAnswer(id, answer)
            }
            setStepFeedback("planner", feedback)
            setStep("generator")
            toast.success("已保存修改 · 进入第三章撰写")
          }}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// PlannerEditor — 把整段编辑产物本地暂存，"保存修改 + 进入撰写"统一 commit
// ────────────────────────────────────────────────────────────────────────────

interface CommitPayload {
  edits: PlannerOutput
  answers: Record<string, PlannerQuestionAnswer>
  feedback: string
}

function PlannerEditor({
  original,
  initialEdits,
  initialAnswers,
  initialFeedback,
  onCommit,
}: {
  original: PlannerOutput
  initialEdits: PlannerOutput
  initialAnswers: Record<string, PlannerQuestionAnswer>
  initialFeedback: string
  onCommit: (payload: CommitPayload) => void
}) {
  // 整体 plannerOutput 的本地工作副本
  const [working, setWorking] = useState<PlannerOutput>(initialEdits)
  const [answers, setAnswers] =
    useState<Record<string, PlannerQuestionAnswer>>(initialAnswers)
  const [feedback, setFeedback] = useState<string>(initialFeedback)

  // 当原始 plannerOutput 切换（重新跑了 planner）时重置工作副本
  useEffect(() => {
    setWorking(initialEdits)
  }, [initialEdits])

  const dirty = useMemo(() => {
    return JSON.stringify(working) !== JSON.stringify(original)
  }, [working, original])

  function patchPlan(patch: Partial<WritingPlan>) {
    setWorking(prev => ({
      ...prev,
      writingPlan: { ...prev.writingPlan, ...patch },
    }))
  }

  function patchRule(patch: Partial<EvaluationRule>) {
    setWorking(prev => ({
      ...prev,
      evaluationRule: { ...prev.evaluationRule, ...patch },
    }))
  }

  return (
    <div className="space-y-12">
      {/* Section 1 · Planner Note */}
      <section>
        <div className="caption-label pb-3">Planner Note · 整体判断</div>
        <textarea
          value={working.plannerNote}
          onChange={e =>
            setWorking(prev => ({ ...prev, plannerNote: e.target.value }))
          }
          rows={4}
          className="input-editorial resize-y leading-[1.7]"
          style={{
            fontFamily: "var(--font-newsreader), Georgia, serif",
            fontStyle: "italic",
          }}
        />
      </section>

      {/* Section 2 · 评估规则 */}
      <section>
        <div className="border-b border-[var(--border-strong)] pb-2">
          <span className="caption-label">评估规则</span>
        </div>

        <div className="mt-4 space-y-4">
          <FieldRow label="需求类型">
            <select
              value={working.evaluationRule.needType}
              onChange={e =>
                patchRule({
                  needType: e.target.value as EvaluationRule["needType"],
                })
              }
              className="input-editorial w-auto py-2 text-[13px]"
            >
              {(
                Object.keys(NEED_TYPE_LABEL) as EvaluationRule["needType"][]
              ).map(t => (
                <option key={t} value={t}>
                  {NEED_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </FieldRow>

          <FieldRow label="判定理由">
            <textarea
              value={working.evaluationRule.needTypeReason}
              onChange={e => patchRule({ needTypeReason: e.target.value })}
              rows={2}
              className="input-editorial resize-y text-[13px]"
            />
          </FieldRow>

          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="硬指标层 %"
              value={working.evaluationRule.weights.hardMetrics}
              onChange={v =>
                patchRule({
                  weights: {
                    ...working.evaluationRule.weights,
                    hardMetrics: v,
                  },
                })
              }
            />
            <NumberField
              label="品味层 %"
              value={working.evaluationRule.weights.taste}
              onChange={v =>
                patchRule({
                  weights: {
                    ...working.evaluationRule.weights,
                    taste: v,
                  },
                })
              }
            />
          </div>

          <NumberField
            label="过线分（passThreshold）"
            value={working.evaluationRule.passThreshold}
            onChange={v => patchRule({ passThreshold: v })}
          />

          <DimensionListEditor
            value={working.evaluationRule.activeDimensions}
            onChange={list => patchRule({ activeDimensions: list })}
          />
        </div>
      </section>

      {/* Section 3 · 写作规划 */}
      <section>
        <div className="border-b border-[var(--border-strong)] pb-2">
          <span className="caption-label">写作规划</span>
        </div>

        <div className="mt-4">
          <div className="caption-label pb-1">全局指引</div>
          <textarea
            value={working.writingPlan.overallGuidance}
            onChange={e => patchPlan({ overallGuidance: e.target.value })}
            rows={3}
            className="input-editorial resize-y text-[14px] leading-[1.7]"
          />
        </div>

        <div className="mt-6">
          <OutlineEditor
            value={working.writingPlan.outline}
            onChange={list => patchPlan({ outline: list })}
          />
        </div>

        <div className="mt-8">
          <RisksEditor
            value={working.writingPlan.risks}
            onChange={list => patchPlan({ risks: list })}
          />
        </div>
      </section>

      {/* Section 4 · Planner 提问 */}
      {working.plannerQuestions.length > 0 && (
        <section>
          <div className="border-b border-[var(--border-strong)] pb-2">
            <span className="caption-label">
              Planner 待你确认 · {working.plannerQuestions.length} 题
            </span>
          </div>
          <p className="mt-3 text-[12.5px] italic text-[var(--text-tertiary)]">
            每题可作答，也可点"交给 Generator 决定"——后者会让 Generator 在撰写时自行选择并标注假设。
          </p>

          <ol className="mt-6 space-y-6">
            {working.plannerQuestions.map((q, index) => (
              <QuestionRow
                key={q.id}
                index={index}
                question={q}
                answer={answers[q.id] ?? ""}
                onAnswer={value =>
                  setAnswers(prev => ({ ...prev, [q.id]: value }))
                }
              />
            ))}
          </ol>
        </section>
      )}

      {/* Section 5 · 自由反馈 */}
      <section>
        <div className="border-b border-[var(--border-strong)] pb-2">
          <span className="caption-label">对本次规划的整体反馈（可选）</span>
        </div>
        <p className="mt-3 text-[12.5px] italic text-[var(--text-tertiary)]">
          你对规划/规则的整体看法、希望 Generator 注意的方向、未列入提问但想强调的细节都可以写在这里。
        </p>
        <textarea
          value={feedback}
          onChange={e => setFeedback(e.target.value)}
          rows={5}
          placeholder="可以为空。但若你写了任何内容，Generator 会把它当成必读上下文。"
          className="input-editorial mt-3 resize-y text-[14px] leading-[1.7]"
        />
      </section>

      {/* Action */}
      <div className="border-t border-[var(--border-hairline)] pt-6">
        <p className="caption-label pb-3">下一步 · 第三章 · 撰写</p>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => onCommit({ edits: working, answers, feedback })}
            className="btn-editorial"
          >
            保存修改 · 进入撰写 →
          </button>
          {dirty && (
            <span className="caption-label" style={{ color: "var(--accent-base)" }}>
              已修改未保存
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// 子组件
// ────────────────────────────────────────────────────────────────────────────

function FieldRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="caption-label pb-1">{label}</div>
      {children}
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <FieldRow label={label}>
      <input
        type="number"
        value={value}
        onChange={e => {
          const next = Number(e.target.value)
          onChange(Number.isFinite(next) ? next : 0)
        }}
        className="input-editorial w-32 py-2 text-[13px] tnum"
      />
    </FieldRow>
  )
}

function DimensionListEditor({
  value,
  onChange,
}: {
  value: EvaluationRule["activeDimensions"]
  onChange: (list: EvaluationRule["activeDimensions"]) => void
}) {
  function patch(index: number, p: Partial<(typeof value)[number]>) {
    const next = value.map((item, i) =>
      i === index ? { ...item, ...p } : item,
    )
    onChange(next)
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  function add() {
    onChange([
      ...value,
      { id: "", name: "新维度", maxScore: 0, focus: "" },
    ])
  }

  return (
    <div>
      <div className="caption-label pb-2 pt-2">激活维度</div>
      <div className="space-y-3">
        {value.map((dim, index) => (
          <div
            key={index}
            className="border-t border-[var(--border-hairline)] pt-3"
          >
            <div className="grid grid-cols-[80px_1fr_80px_auto] gap-2">
              <input
                value={dim.id}
                onChange={e => patch(index, { id: e.target.value })}
                placeholder="ID"
                className="input-editorial py-2 text-[13px] tnum"
                style={{
                  fontFamily: "var(--font-newsreader), Georgia, serif",
                }}
              />
              <input
                value={dim.name}
                onChange={e => patch(index, { name: e.target.value })}
                placeholder="维度名称"
                className="input-editorial py-2 text-[13px]"
              />
              <input
                type="number"
                value={dim.maxScore}
                onChange={e =>
                  patch(index, { maxScore: Number(e.target.value) || 0 })
                }
                placeholder="满分"
                className="input-editorial py-2 text-[13px] tnum"
              />
              <button
                type="button"
                onClick={() => remove(index)}
                className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--accent-base)]"
                aria-label="删除"
              >
                删除
              </button>
            </div>
            <textarea
              value={dim.focus}
              onChange={e => patch(index, { focus: e.target.value })}
              rows={2}
              placeholder="本次任务在该维度上需要特别关注什么"
              className="input-editorial mt-2 resize-y text-[12.5px] leading-[1.6]"
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        className="btn-text mt-3"
      >
        + 添加维度
      </button>
    </div>
  )
}

function OutlineEditor({
  value,
  onChange,
}: {
  value: WritingPlan["outline"]
  onChange: (list: WritingPlan["outline"]) => void
}) {
  function patch(index: number, p: Partial<(typeof value)[number]>) {
    onChange(value.map((item, i) => (i === index ? { ...item, ...p } : item)))
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  function add() {
    onChange([
      ...value,
      {
        section: "新章节",
        purpose: "",
        keyPoints: [],
        estimatedWords: 300,
      },
    ])
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= value.length) return
    const next = [...value]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <div>
      <div className="caption-label pb-2">章节大纲</div>
      <ol className="space-y-5">
        {value.map((section, index) => (
          <li
            key={index}
            className="border-t border-[var(--border-hairline)] pt-3"
          >
            <div className="flex items-baseline gap-3">
              <span
                className="tabular-nums text-[var(--text-tertiary)]"
                style={{
                  fontFamily: "var(--font-newsreader), Georgia, serif",
                  fontStyle: "italic",
                  fontSize: "13px",
                }}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <input
                value={section.section}
                onChange={e => patch(index, { section: e.target.value })}
                placeholder="章节标题"
                className="input-editorial flex-1 py-2 text-[14px] font-medium"
              />
              <input
                type="number"
                value={section.estimatedWords}
                onChange={e =>
                  patch(index, {
                    estimatedWords: Number(e.target.value) || 0,
                  })
                }
                className="input-editorial w-24 py-2 text-[12.5px] tnum"
                placeholder="字数"
              />
              <div className="flex shrink-0 items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  className="hover:text-[var(--text-primary)]"
                  aria-label="上移"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  className="hover:text-[var(--text-primary)]"
                  aria-label="下移"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="hover:text-[var(--accent-base)]"
                >
                  删除
                </button>
              </div>
            </div>

            <textarea
              value={section.purpose}
              onChange={e => patch(index, { purpose: e.target.value })}
              rows={2}
              placeholder="本章节要回答的核心问题"
              className="input-editorial mt-2 resize-y text-[13px] leading-[1.6]"
            />

            <KeyPointsEditor
              value={section.keyPoints}
              onChange={list => patch(index, { keyPoints: list })}
            />
          </li>
        ))}
      </ol>
      <button type="button" onClick={add} className="btn-text mt-3">
        + 添加章节
      </button>
    </div>
  )
}

function KeyPointsEditor({
  value,
  onChange,
}: {
  value: string[]
  onChange: (list: string[]) => void
}) {
  return (
    <div className="mt-2">
      <div className="caption-label pb-1">必须覆盖的要点</div>
      <ul className="space-y-1">
        {value.map((point, index) => (
          <li key={index} className="flex items-center gap-2">
            <span className="text-[var(--text-tertiary)]">·</span>
            <input
              value={point}
              onChange={e =>
                onChange(
                  value.map((p, i) => (i === index ? e.target.value : p)),
                )
              }
              className="input-editorial flex-1 py-1.5 text-[12.5px]"
              placeholder="要点"
            />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
              className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--accent-base)]"
            >
              删除
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onChange([...value, ""])}
        className="btn-text mt-2"
      >
        + 添加要点
      </button>
    </div>
  )
}

function RisksEditor({
  value,
  onChange,
}: {
  value: string[]
  onChange: (list: string[]) => void
}) {
  return (
    <div>
      <div className="caption-label pb-2">风险提醒</div>
      <ol className="space-y-2">
        {value.map((risk, index) => (
          <li key={index} className="flex items-start gap-3">
            <span
              className="shrink-0 italic text-[var(--accent-base)]"
              style={{
                fontFamily: "var(--font-newsreader), Georgia, serif",
                fontSize: "13px",
              }}
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <textarea
              value={risk}
              onChange={e =>
                onChange(
                  value.map((r, i) => (i === index ? e.target.value : r)),
                )
              }
              rows={2}
              className="input-editorial flex-1 resize-y text-[13px] leading-[1.6]"
              placeholder="风险描述"
            />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
              className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--accent-base)] pt-2"
            >
              删除
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={() => onChange([...value, ""])}
        className="btn-text mt-2"
      >
        + 添加风险
      </button>
    </div>
  )
}

function QuestionRow({
  index,
  question,
  answer,
  onAnswer,
}: {
  index: number
  question: PlannerQuestion
  answer: PlannerQuestionAnswer
  onAnswer: (value: PlannerQuestionAnswer) => void
}) {
  const isAuto = answer === "auto"
  const textValue = isAuto ? "" : (answer ?? "")

  return (
    <li className="border-t border-[var(--border-hairline)] pt-4">
      <div className="flex items-baseline gap-3">
        <span
          className="shrink-0 italic text-[var(--accent-base)]"
          style={{
            fontFamily: "var(--font-newsreader), Georgia, serif",
            fontSize: "14px",
          }}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="flex-1">
          <div className="flex items-baseline gap-3">
            <span className="caption-label">
              {QUESTION_CATEGORY_LABEL[question.category]}
            </span>
            <span className="text-[14px] font-medium leading-[1.5]">
              {question.question}
            </span>
          </div>
          {question.hint && (
            <p className="mt-1 text-[12px] italic leading-[1.6] text-[var(--text-tertiary)]">
              {question.hint}
            </p>
          )}
        </div>
      </div>

      <div className="ml-9 mt-3 space-y-2">
        <textarea
          value={textValue}
          onChange={e => onAnswer(e.target.value)}
          disabled={isAuto}
          rows={2}
          placeholder={
            isAuto
              ? "已选择交给 Generator 决定，Generator 撰写时会自行选择并显式标注假设。"
              : "你的答案…"
          }
          className={cn(
            "input-editorial resize-y text-[13px] leading-[1.6]",
            isAuto && "opacity-50",
          )}
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onAnswer(isAuto ? "" : "auto")}
            className={cn(
              "text-[11px] uppercase tracking-[0.08em] transition-colors",
              isAuto
                ? "text-[var(--accent-base)]"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
            )}
          >
            {isAuto ? "✓ 已交给 Generator 决定" : "交给 Generator 决定"}
          </button>
        </div>
      </div>
    </li>
  )
}
