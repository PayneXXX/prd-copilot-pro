"use client"

import { useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { toast } from "sonner"

import { WorkspaceHeader } from "@/components/dashboard/WorkspaceHeader"
import type { GeneratorOutput } from "@/lib/types/generator"
import type { PlannerOutput } from "@/lib/types/planner"
import { safeFetchJson } from "@/lib/utils/safe-fetch"
import {
  selectActivePlannerOutput,
  selectAggregatedHumanFeedback,
  useSession,
} from "@/store/session-store"

type GenerateResponse =
  | {
      ok: true
      generatorOutput: GeneratorOutput
      tokens: { input: number; output: number }
      durationMs: number
    }
  | { ok: false; error: string }

type RegenerateResponse = GenerateResponse

export function GeneratorWorkspace() {
  const {
    draft,
    generatorOutput,
    prdEditingContent,
    prdVersions,
    plannerUserFeedback,
    plannerQuestionAnswers,
    generatorUserFeedback,
    updateEditingContent,
    setGeneratorResult,
    setStepFeedback,
    addPrdVersion,
    finalizeAndExport,
    submitToEvaluator,
  } = useSession()
  const plannerOutput = useSession(selectActivePlannerOutput)
  const aggregatedHumanFeedback = useSession(selectAggregatedHumanFeedback)
  const [loading, setLoading] = useState(false)

  async function runGenerator() {
    if (!draft || !plannerOutput) return

    setLoading(true)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 200_000)

    const result = await safeFetchJson<GenerateResponse>("/api/generate-prd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draft,
        plannerOutput,
        plannerUserFeedback,
        plannerQuestionAnswers,
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    setLoading(false)

    if (!result.ok) {
      const msg =
        result.kind === "abort"
          ? "Generator 请求超过 200 秒，请查看终端日志并重试。"
          : result.message
      toast.error("Generator 失败", { description: msg })
      return
    }

    if (!result.data.ok) {
      toast.error("Generator 失败", { description: result.data.error })
      return
    }

    setGeneratorResult(
      result.data.generatorOutput,
      result.data.tokens,
      result.data.durationMs,
    )
    if (prdVersions.length === 0) {
      addPrdVersion({
        content: result.data.generatorOutput.prdMarkdown,
        source: "generator",
      })
    }
    toast.success("PRD 初稿已生成 · 请编辑或导出")
  }

  async function regenerateWithFeedback() {
    if (!plannerOutput || !prdEditingContent.trim()) return

    if (!aggregatedHumanFeedback.trim()) {
      toast.warning("先写一点反馈，再让 Generator 按反馈重新生成")
      return
    }

    setLoading(true)
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
          aggregatedHumanFeedback,
        }),
        signal: controller.signal,
      },
    )
    clearTimeout(timeout)
    setLoading(false)

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
        humanFeedback: aggregatedHumanFeedback,
      },
    })
    toast.success(`已生成 ${`v${prdVersions.length + 1}`} · 当前 PRD 已替换`)
  }

  function handleExport() {
    const blob = new Blob([prdEditingContent], {
      type: "text/markdown;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-")
    anchor.href = url
    anchor.download = `prd-${timestamp}.md`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)

    finalizeAndExport()
    toast.success("PRD 已导出 · 本次会话结束")
  }

  function handleSubmit() {
    submitToEvaluator()
    toast.info("已提交给 Evaluator 评分")
  }

  if (!plannerOutput) {
    return (
      <div className="mx-auto max-w-[720px]">
        <WorkspaceHeader
          kicker="第三章"
          roman="Ⅲ"
          title="撰写"
          subtitle=""
        />
        <p className="caption-label">请先完成「Planner 规划」步骤</p>
      </div>
    )
  }

  if (!generatorOutput) {
    return (
      <PreGenerator
        plannerOutput={plannerOutput}
        loading={loading}
        onRun={runGenerator}
      />
    )
  }

  return (
    <div className="mx-auto max-w-[1040px]">
      <WorkspaceHeader
        kicker="第三章"
        roman="Ⅲ"
        title="撰写"
        subtitle="左编辑右预览。所有修改实时生效。改好后选一个出口——提交评分或直接导出。"
      />

      {generatorOutput.parseStatus !== "ok" && (
        <ParseStatusBanner
          status={generatorOutput.parseStatus}
          onRegenerate={runGenerator}
          loading={loading}
        />
      )}

      <FormatStatsBar output={generatorOutput} />

      <div className="mt-6 grid h-[68vh] grid-cols-1 gap-0 lg:grid-cols-2">
        <textarea
          value={prdEditingContent}
          onChange={e => updateEditingContent(e.target.value)}
          className="h-full w-full resize-none border-r-0 border-[var(--border-hairline)] bg-[var(--bg-card)] p-5 text-[13.5px] leading-[1.7] outline-none focus:border-[var(--accent-base)] lg:border-r"
          style={{
            fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
            border: "1px solid var(--border-hairline)",
            borderRadius: 0,
          }}
          placeholder="PRD 内容..."
        />
        <div
          className="h-full w-full overflow-y-auto bg-[var(--bg-subtle)] p-6"
          style={{
            border: "1px solid var(--border-hairline)",
            borderLeft: "none",
            borderRadius: 0,
          }}
        >
          <article className="prose prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {prdEditingContent || "*（左侧编辑后这里会实时预览）*"}
            </ReactMarkdown>
          </article>
        </div>
      </div>

      {(generatorOutput.assumptions.length > 0 ||
        generatorOutput.openQuestions.length > 0) && (
        <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-2">
          {generatorOutput.assumptions.length > 0 && (
            <NotesList
              label="Generator 关键假设"
              items={generatorOutput.assumptions}
            />
          )}
          {generatorOutput.openQuestions.length > 0 && (
            <NotesList
              label="待决问题"
              items={generatorOutput.openQuestions}
              accent
            />
          )}
        </div>
      )}

      <FeedbackPanel
        value={generatorUserFeedback}
        onChange={value => setStepFeedback("generator", value)}
      />

      <ExitBar
        loading={loading}
        onRegenerate={regenerateWithFeedback}
        onSubmit={handleSubmit}
        onExport={handleExport}
      />
    </div>
  )
}

function PreGenerator({
  plannerOutput,
  loading,
  onRun,
}: {
  plannerOutput: PlannerOutput
  loading: boolean
  onRun: () => void
}) {
  const totalWords = plannerOutput.writingPlan.outline.reduce(
    (sum, item) => sum + item.estimatedWords,
    0,
  )

  return (
    <div className="mx-auto max-w-[720px]">
      <WorkspaceHeader
        kicker="第三章"
        roman="Ⅲ"
        title="撰写"
        subtitle="Generator 将严格按 Planner 规划撰写 PRD 初稿。完成后你可以在线修改，然后选择直接导出或提交评分。"
      />

      {/* Visible Planner outline — addressing the user's #1 pain */}
      <section className="mb-12">
        <div className="border-b border-[var(--border-strong)] pb-2">
          <span className="caption-label">即将按以下规划撰写</span>
        </div>

        <div className="pt-2">
          <div className="data-row">
            <span className="label">章节数</span>
            <span className="value tnum">
              {plannerOutput.writingPlan.outline.length}
              <sup>章</sup>
            </span>
          </div>
          <div className="data-row">
            <span className="label">风险点</span>
            <span className="value tnum">
              {plannerOutput.writingPlan.risks.length}
              <sup>条</sup>
            </span>
          </div>
          <div className="data-row">
            <span className="label">建议字数</span>
            <span className="value tnum">
              {totalWords.toLocaleString()}
              <sup>字</sup>
            </span>
          </div>
        </div>

        {plannerOutput.writingPlan.risks.length > 0 && (
          <div className="mt-8 border-t border-[var(--border-hairline)] pt-5">
            <div className="caption-label pb-3">
              风险提醒 · Generator 必须体现
            </div>
            <ol className="space-y-3">
              {plannerOutput.writingPlan.risks.map((risk, index) => (
                <li
                  key={`${risk}-${index}`}
                  className="flex gap-3 text-[13px] leading-[1.65] text-[var(--text-secondary)]"
                >
                  <span
                    className="shrink-0 italic text-[var(--accent-base)]"
                    style={{
                      fontFamily: "var(--font-newsreader), Georgia, serif",
                    }}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{risk}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <ol className="mt-8 space-y-5">
          {plannerOutput.writingPlan.outline.map((section, index) => (
            <li
              key={`${section.section}-${index}`}
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
                <h3 className="heading-h2">{section.section}</h3>
                <span className="ml-auto caption-label">
                  约 {section.estimatedWords} 字
                </span>
              </div>
              <p className="mt-1 text-[12.5px] leading-[1.6] text-[var(--text-secondary)]">
                {section.purpose}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <div className="border-t border-[var(--border-hairline)] pt-6">
        <p className="text-[13px] text-[var(--text-secondary)]">
          {loading
            ? "撰写中 · Generator 按上述规划逐章生成 · 预计 60–120 秒"
            : "撰写预计 60–120 秒 · 期间请勿离开页面"}
        </p>
        <div className="mt-6">
          <button
            type="button"
            onClick={onRun}
            disabled={loading}
            className="btn-editorial"
          >
            {loading ? "撰写中…" : "启动 Generator →"}
          </button>
        </div>
      </div>
    </div>
  )
}

function FeedbackPanel({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <section className="mt-12 border-t border-[var(--border-hairline)] pt-6">
      <div className="caption-label pb-3">对当前 PRD 的反馈（可选）</div>
      <p className="pb-3 text-[12.5px] italic text-[var(--text-tertiary)]">
        写下你对当前 PRD 的修改意见、对关键假设/待决问题的回应，或希望下一版调整的方向。
        点击"按反馈重新生成"时，这些内容会和 Planner 阶段反馈一起进入 Generator。
      </p>
      <textarea
        value={value}
        onChange={event => onChange(event.target.value)}
        rows={5}
        placeholder="例如：验收标准要更细；把管理后台拆成二期；不要假设已有统一权限系统..."
        className="input-editorial resize-y text-[14px] leading-[1.7]"
      />
    </section>
  )
}

function ParseStatusBanner({
  status,
  onRegenerate,
  loading,
}: {
  status: string
  onRegenerate: () => void
  loading: boolean
}) {
  const labels: Record<string, string> = {
    protocol_violation: "Generator 输出协议异常 · 当前显示的是降级内容",
    metadata_missing: "Generator 元数据缺失 · 自检统计可能不准确",
    fallback_raw_text: "Generator 退化为纯文本输出 · 结构化字段缺失",
  }
  const label = labels[status] ?? `Generator 输出异常 (${status})`

  return (
    <div
      className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b-2 px-5 py-3 text-[13px]"
      style={{
        background: "var(--accent-subtle)",
        borderColor: "var(--accent-base)",
        color: "var(--status-error)",
      }}
    >
      <div className="flex items-baseline gap-3">
        <span className="caption-label" style={{ color: "var(--accent-base)" }}>
          异常
        </span>
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onRegenerate}
          disabled={loading}
          className="btn-text"
          style={{ color: "var(--accent-base)" }}
        >
          重新生成
        </button>
        <span className="text-[var(--text-tertiary)]">·</span>
        <span className="caption-label" style={{ color: "var(--text-secondary)" }}>
          或在右侧手动修订
        </span>
      </div>
    </div>
  )
}

function FormatStatsBar({ output }: { output: GeneratorOutput }) {
  if (!output.formatStats) return null
  const s = output.formatStats

  const items = [
    { value: s.tableCount, unit: "表格" },
    { value: s.listCount, unit: "列表" },
    { value: s.mermaidBlockCount, unit: "流程图" },
    { value: s.paragraphCount, unit: "段落" },
    { value: s.totalWordCount, unit: "字" },
  ]

  return (
    <div className="mt-6 flex border-y border-[var(--border-hairline)]">
      {items.map((item, index) => (
        <div
          key={index}
          className="flex flex-1 items-baseline justify-center gap-2 px-4 py-3"
          style={{
            borderRight:
              index < items.length - 1
                ? "1px solid var(--border-hairline)"
                : "none",
          }}
        >
          <span
            className="editorial-num text-[20px]"
            style={{ fontWeight: 500 }}
          >
            {item.value.toLocaleString()}
          </span>
          <span className="caption-label">{item.unit}</span>
        </div>
      ))}
    </div>
  )
}

function NotesList({
  label,
  items,
  accent,
}: {
  label: string
  items: string[]
  accent?: boolean
}) {
  return (
    <div>
      <div className="caption-label pb-2">{label}</div>
      <ol className="space-y-2">
        {items.map((item, index) => (
          <li
            key={`${item}-${index}`}
            className="flex gap-3 border-t border-[var(--border-hairline)] pt-2 text-[13px] leading-[1.65]"
          >
            <span
              className="shrink-0 italic"
              style={{
                fontFamily: "var(--font-newsreader), Georgia, serif",
                color: accent
                  ? "var(--accent-base)"
                  : "var(--text-tertiary)",
                fontSize: "13px",
              }}
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="text-[var(--text-secondary)]">{item}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function ExitBar({
  loading,
  onRegenerate,
  onSubmit,
  onExport,
}: {
  loading: boolean
  onRegenerate: () => void
  onSubmit: () => void
  onExport: () => void
}) {
  return (
    <div className="mt-12 border-t border-[var(--border-hairline)] pt-6">
      <p className="caption-label pb-4">下一步 · 选一个出口</p>
      <div className="grid grid-cols-1 gap-0 md:grid-cols-3">
        <button
          type="button"
          onClick={onRegenerate}
          disabled={loading}
          className="flex flex-col items-start gap-1 border border-[var(--border-hairline)] bg-[var(--bg-card)] px-6 py-5 text-left transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="text-[14px] font-medium text-[var(--text-primary)]">
            {loading ? "重新生成中…" : "按反馈重新生成"}
          </span>
          <span className="text-[12px] text-[var(--text-secondary)]">
            吸收人类反馈，生成新版本
          </span>
        </button>
        <button
          type="button"
          onClick={onSubmit}
          className="flex flex-col items-start gap-1 border border-[var(--border-hairline)] bg-[var(--text-primary)] px-6 py-5 text-left text-[var(--text-on-accent)] transition-colors hover:bg-[var(--accent-base)] md:border-l-0"
        >
          <span className="text-[14px] font-medium">提交给 Evaluator 评分</span>
          <span className="text-[12px] opacity-75">
            想让 Kimi K2 按 Rubric 检查一遍
          </span>
        </button>
        <button
          type="button"
          onClick={onExport}
          className="flex flex-col items-start gap-1 border border-[var(--border-hairline)] bg-[var(--bg-card)] px-6 py-5 text-left transition-colors hover:bg-[var(--bg-hover)] md:border-l-0"
        >
          <span className="text-[14px] font-medium text-[var(--text-primary)]">
            直接导出 .md 文件
          </span>
          <span className="text-[12px] text-[var(--text-secondary)]">
            这版已经可用，结束本次会话
          </span>
        </button>
      </div>
    </div>
  )
}
