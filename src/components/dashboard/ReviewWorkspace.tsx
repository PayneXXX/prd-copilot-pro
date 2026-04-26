"use client"

import { useMemo, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { toast } from "sonner"

import { WorkspaceHeader } from "@/components/dashboard/WorkspaceHeader"
import type { GeneratorOutput } from "@/lib/types/generator"
import type { PrdVersion } from "@/lib/types/feedback"
import { diffPrdLines, type DiffLine } from "@/lib/utils/diff-prd"
import { safeFetchJson } from "@/lib/utils/safe-fetch"
import {
  selectActivePlannerOutput,
  selectAggregatedHumanFeedback,
  useSession,
} from "@/store/session-store"

type RegenerateResponse =
  | {
      ok: true
      generatorOutput: GeneratorOutput
      tokens: { input: number; output: number }
      durationMs: number
    }
  | { ok: false; error: string }

const VERSION_SOURCE_LABEL: Record<PrdVersion["source"], string> = {
  generator: "Generator 初稿",
  "revision-evaluator": "Evaluator 返工",
  "revision-feedback": "反馈重生",
  "human-edit": "人类编辑",
}

export function ReviewWorkspace() {
  const {
    prdEditingContent,
    updateEditingContent,
    evaluations,
    reviseCount,
    prdVersions,
    reviewUserFeedback,
    setStepFeedback,
    setGeneratorResult,
    addPrdVersion,
    setStep,
    finalizeAndExport,
  } = useSession()
  const plannerOutput = useSession(selectActivePlannerOutput)
  const aggregatedFeedback = useSession(selectAggregatedHumanFeedback)
  const [editing, setEditing] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const latestEval = evaluations[evaluations.length - 1]
  const totalDuration = evaluations.reduce(
    (sum, evaluation) => sum + evaluation.durationMs,
    0,
  )
  const latestVersion = prdVersions[prdVersions.length - 1]
  const previousVersion = prdVersions[prdVersions.length - 2]
  const hasComparableVersions = Boolean(previousVersion && latestVersion)
  const diffLines = useMemo(() => {
    if (!previousVersion || !latestVersion) return []
    return diffPrdLines(previousVersion.content, latestVersion.content)
  }, [previousVersion, latestVersion])

  function handleApprove() {
    finalizeAndExport()
    toast.success("PRD 已通过人类审核")
  }

  function handleExportNow() {
    downloadMarkdown(prdEditingContent, "prd-final")
    finalizeAndExport()
    toast.success("PRD 已导出 · 本次会话结束")
  }

  function handleSaveHumanEdit() {
    addPrdVersion({
      content: prdEditingContent,
      source: "human-edit",
      feedbackContext: {
        humanFeedback: reviewUserFeedback,
        evaluatorSuggestions: latestEval?.result.revisionSuggestions,
      },
    })
    setEditing(false)
    toast.success("已保存为新的人工编辑版本")
  }

  async function handleRegenerateWithFeedback() {
    if (!plannerOutput) {
      toast.error("缺少 Planner 规划，无法按反馈重新生成")
      return
    }

    const feedbackForPrompt = aggregatedFeedback.trim()
    if (!feedbackForPrompt) {
      toast.warning("先写一点反馈，再让 Generator 重新生成")
      return
    }

    setRegenerating(true)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 200_000)

    const result = await safeFetchJson<RegenerateResponse>(
      "/api/regenerate-feedback",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalPrd: prdEditingContent,
          writingPlan: plannerOutput.writingPlan,
          aggregatedHumanFeedback: feedbackForPrompt,
          evaluatorSuggestions: latestEval?.result.revisionSuggestions ?? [],
        }),
        signal: controller.signal,
      },
    )

    clearTimeout(timeout)
    setRegenerating(false)

    if (!result.ok) {
      const msg =
        result.kind === "abort"
          ? "按反馈重新生成超过 200 秒，请查看终端日志并重试。"
          : result.message
      toast.error("重新生成失败", { description: msg })
      return
    }

    if (!result.data.ok) {
      toast.error("重新生成失败", { description: result.data.error })
      return
    }

    setGeneratorResult(
      result.data.generatorOutput,
      result.data.tokens,
      result.data.durationMs,
    )
    addPrdVersion({
      content: result.data.generatorOutput.prdMarkdown,
      source: "revision-feedback",
      feedbackContext: {
        humanFeedback: feedbackForPrompt,
        evaluatorSuggestions: latestEval?.result.revisionSuggestions ?? [],
      },
    })
    toast.success("已按反馈生成新版 PRD")
  }

  return (
    <div className="mx-auto max-w-[1040px]">
      <WorkspaceHeader
        kicker="第五章"
        roman="Ⅴ"
        title="审核"
        subtitle="这里不再只给一个编辑器。你可以看评分、看反馈、看版本差异，再决定导出、重评或按反馈重生。"
      />

      <ReviewSummary
        latestEval={latestEval}
        evaluationsCount={evaluations.length}
        reviseCount={reviseCount}
        totalDurationMs={totalDuration}
        currentVersion={latestVersion}
      />

      <FeedbackArchive aggregatedFeedback={aggregatedFeedback} />

      {latestEval && (
        <EvaluationSummary
          verdict={latestEval.result.verdict}
          score={latestEval.result.overallScore}
          suggestions={latestEval.result.revisionSuggestions}
        />
      )}

      <section className="mt-12">
        <div className="border-b border-[var(--border-strong)] pb-2">
          <span className="caption-label">PRD 内容</span>
        </div>

        {editing ? (
          <div className="mt-4">
            <textarea
              value={prdEditingContent}
              onChange={event => updateEditingContent(event.target.value)}
              className="h-[58vh] w-full resize-y bg-[var(--bg-card)] p-5 text-[13.5px] leading-[1.7] outline-none focus:border-[var(--accent-base)]"
              style={{
                fontFamily:
                  "var(--font-jetbrains-mono), ui-monospace, monospace",
                border: "1px solid var(--border-hairline)",
                borderRadius: 0,
              }}
            />
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                className="btn-editorial"
                onClick={handleSaveHumanEdit}
              >
                保存为新版本
              </button>
              <button
                type="button"
                className="btn-text"
                onClick={() => setEditing(false)}
              >
                取消编辑
              </button>
            </div>
          </div>
        ) : hasComparableVersions ? (
          <DiffView
            previous={previousVersion!}
            current={latestVersion!}
            diffLines={diffLines}
          />
        ) : (
          <SingleVersionView content={prdEditingContent} />
        )}
      </section>

      <section className="mt-12 border-t border-[var(--border-hairline)] pt-6">
        <div className="caption-label pb-3">人类审核反馈</div>
        <textarea
          value={reviewUserFeedback}
          onChange={event => setStepFeedback("review", event.target.value)}
          rows={5}
          placeholder="写下最终审核意见、希望新版强化的点，或对 Evaluator 建议的取舍..."
          className="input-editorial resize-y text-[14px] leading-[1.7]"
        />
      </section>

      <div className="mt-12 border-t border-[var(--border-hairline)] pt-6">
        <p className="caption-label pb-4">下一步 · 四个出口</p>
        <div className="grid grid-cols-1 gap-0 md:grid-cols-4">
          <ActionButton
            primary
            title="在 PRD 上直接修改"
            desc="打开编辑器，保存为 human-edit 版本"
            onClick={() => setEditing(true)}
          />
          <ActionButton
            title={regenerating ? "重生中…" : "按反馈重新生成"}
            desc="聚合所有反馈，生成新版本并显示 diff"
            disabled={regenerating}
            onClick={handleRegenerateWithFeedback}
          />
          <ActionButton
            title="直接导出"
            desc="下载当前版本，结束本次会话"
            onClick={handleExportNow}
          />
          <ActionButton
            title="重新评估"
            desc="修改后回到第四章再评一轮"
            onClick={() => setStep("evaluator")}
          />
        </div>
        <div className="mt-4">
          <button type="button" className="btn-text" onClick={handleApprove}>
            通过并进入 Skill 沉淀
          </button>
        </div>
      </div>
    </div>
  )
}

function ReviewSummary({
  latestEval,
  evaluationsCount,
  reviseCount,
  totalDurationMs,
  currentVersion,
}: {
  latestEval: ReturnType<typeof useSession.getState>["evaluations"][number] | undefined
  evaluationsCount: number
  reviseCount: number
  totalDurationMs: number
  currentVersion?: PrdVersion
}) {
  const minutes = Math.floor(totalDurationMs / 60000)
  const seconds = Math.floor((totalDurationMs % 60000) / 1000)

  return (
    <section className="border-y border-[var(--border-hairline)] py-3">
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 text-[13px]">
        <Stat label="当前版本">
          <span className="caption-label">{currentVersion?.id ?? "未记录"}</span>
        </Stat>
        <Stat label="最终评分">
          <span className="editorial-num text-[18px]">
            {latestEval?.result.overallScore ?? "—"}
          </span>
          {latestEval && <span className="text-[var(--text-tertiary)]"> / 100</span>}
        </Stat>
        <Stat label="判定">
          <span className="caption-label">
            {latestEval?.result.verdict ?? "未评估"}
          </span>
        </Stat>
        <Stat label="评估">
          <span className="tnum">
            {evaluationsCount}
            <sup>次</sup>
          </span>
        </Stat>
        <Stat label="返工">
          <span className="tnum">
            {reviseCount}
            <sup>次</sup>
          </span>
        </Stat>
        <Stat label="累计耗时">
          <span className="tnum">
            {minutes > 0 ? `${minutes}m ` : ""}
            {seconds}
            <sup>s</sup>
          </span>
        </Stat>
      </div>
    </section>
  )
}

function FeedbackArchive({ aggregatedFeedback }: { aggregatedFeedback: string }) {
  if (!aggregatedFeedback.trim()) return null

  return (
    <section className="mt-12">
      <div className="border-b border-[var(--border-strong)] pb-2">
        <span className="caption-label">历次反馈聚合</span>
      </div>
      <pre className="mt-4 whitespace-pre-wrap border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4 text-[12.5px] leading-[1.7] text-[var(--text-secondary)]">
        {aggregatedFeedback}
      </pre>
    </section>
  )
}

function EvaluationSummary({
  verdict,
  score,
  suggestions,
}: {
  verdict: string
  score: number
  suggestions: string[]
}) {
  return (
    <section className="mt-12">
      <div className="border-b border-[var(--border-strong)] pb-2">
        <span className="caption-label">Evaluator 摘要</span>
      </div>
      <div className="data-row">
        <span className="label">评分 / 判定</span>
        <span className="value">
          {score} / 100 · {verdict}
        </span>
      </div>
      {suggestions.length > 0 && (
        <ol className="mt-4 space-y-2">
          {suggestions.map((suggestion, index) => (
            <li
              key={`${suggestion}-${index}`}
              className="flex gap-3 border-t border-[var(--border-hairline)] pt-2 text-[13px] leading-[1.65] text-[var(--text-secondary)]"
            >
              <span className="caption-label">{index + 1}</span>
              <span>{suggestion}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function SingleVersionView({ content }: { content: string }) {
  return (
    <div
      className="mt-4 max-h-[70vh] overflow-y-auto bg-[var(--bg-subtle)] p-6"
      style={{ border: "1px solid var(--border-hairline)" }}
    >
      <article className="prose prose-sm max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </article>
    </div>
  )
}

function DiffView({
  previous,
  current,
  diffLines,
}: {
  previous: PrdVersion
  current: PrdVersion
  diffLines: DiffLine[]
}) {
  return (
    <div className="mt-4">
      <div className="mb-3 grid grid-cols-2 gap-3">
        <div className="caption-label">
          左 · {previous.id} · {VERSION_SOURCE_LABEL[previous.source]}
        </div>
        <div className="caption-label">
          右 · {current.id} · {VERSION_SOURCE_LABEL[current.source]}
        </div>
      </div>
      <div
        className="max-h-[70vh] overflow-y-auto border border-[var(--border-hairline)] bg-[var(--bg-card)] text-[12px]"
        style={{ fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace" }}
      >
        {diffLines.map((line, index) => (
          <DiffLineRow key={`${index}-${line.type}`} line={line} />
        ))}
      </div>
    </div>
  )
}

function DiffLineRow({ line }: { line: DiffLine }) {
  const style =
    line.type === "added"
      ? "bg-green-50 text-green-800"
      : line.type === "removed"
        ? "bg-red-50 text-red-800 line-through"
        : "text-[var(--text-secondary)]"
  const marker =
    line.type === "added" ? "+" : line.type === "removed" ? "-" : " "
  const lineNo = line.type === "added" ? line.newLineNo : line.oldLineNo

  return (
    <div className={`grid grid-cols-[48px_24px_1fr] gap-2 px-3 py-1 ${style}`}>
      <span className="select-none text-right text-[var(--text-tertiary)]">
        {lineNo ?? ""}
      </span>
      <span className="select-none">{marker}</span>
      <span className="whitespace-pre-wrap">{line.text || " "}</span>
    </div>
  )
}

function ActionButton({
  title,
  desc,
  primary,
  disabled,
  onClick,
}: {
  title: string
  desc: string
  primary?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex flex-col items-start gap-1 border border-[var(--border-hairline)] px-5 py-5 text-left transition-colors md:border-l-0 first:md:border-l ${
        primary
          ? "bg-[var(--text-primary)] text-[var(--text-on-accent)] hover:bg-[var(--accent-base)]"
          : "bg-[var(--bg-card)] hover:bg-[var(--bg-hover)]"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span className="text-[14px] font-medium">{title}</span>
      <span
        className={`text-[12px] ${
          primary ? "opacity-75" : "text-[var(--text-secondary)]"
        }`}
      >
        {desc}
      </span>
    </button>
  )
}

function Stat({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="caption-label">{label}</span>
      <span className="text-[var(--text-primary)]">{children}</span>
    </div>
  )
}

function downloadMarkdown(content: string, prefix: string) {
  const blob = new Blob([content], {
    type: "text/markdown;charset=utf-8",
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-")
  anchor.download = `${prefix}-${timestamp}.md`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
