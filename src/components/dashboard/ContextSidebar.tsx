"use client"

import { useState } from "react"
import { useShallow } from "zustand/react/shallow"

import type { PrdVersion } from "@/lib/types/feedback"
import {
  selectActivePlannerOutput,
  selectFullContext,
  useSession,
} from "@/store/session-store"

type SectionKey =
  | "requirement"
  | "planner"
  | "writing"
  | "prd"
  | "evaluation"
  | "revisions"
  | "versions"

interface SectionProps {
  k: SectionKey
  label: string
  meta?: string
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
  hasContent: boolean
}

function Section({
  label,
  meta,
  expanded,
  onToggle,
  children,
  hasContent,
}: SectionProps) {
  return (
    <div className="border-b border-[var(--border-hairline)] py-4">
      <button
        type="button"
        onClick={hasContent ? onToggle : undefined}
        disabled={!hasContent}
        className="flex w-full items-baseline justify-between text-left"
      >
        <span className="caption-label">{label}</span>
        <span className="flex items-center gap-2">
          {meta && (
            <span className="text-[11px] tabular-nums text-[var(--text-secondary)]">
              {meta}
            </span>
          )}
          {hasContent && (
            <span className="text-[10px] text-[var(--text-tertiary)]">
              {expanded ? "—" : "+"}
            </span>
          )}
        </span>
      </button>
      {hasContent && expanded && (
        <div className="mt-3 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
          {children}
        </div>
      )}
      {!hasContent && (
        <div className="mt-2 text-[11px] italic text-[var(--text-tertiary)]">
          —
        </div>
      )}
    </div>
  )
}

export function ContextSidebar() {
  const ctx = useSession(useShallow(selectFullContext))
  const plannerOutput = useSession(selectActivePlannerOutput)
  const prdVersions = useSession(state => state.prdVersions)

  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
    requirement: true,
    planner: true,
    writing: true,
    prd: true,
    evaluation: true,
    revisions: false,
    versions: true,
  })

  function toggle(k: SectionKey) {
    setExpanded(prev => ({ ...prev, [k]: !prev[k] }))
  }

  const outlineCount = plannerOutput?.writingPlan.outline.length ?? 0
  const riskCount = plannerOutput?.writingPlan.risks.length ?? 0
  const estimatedWords = plannerOutput
    ? plannerOutput.writingPlan.outline.reduce(
        (sum, item) => sum + item.estimatedWords,
        0,
      )
    : 0

  return (
    <aside className="sticky top-0 hidden h-screen w-[320px] shrink-0 overflow-y-auto border-l border-[var(--border-hairline)] px-6 py-10 xl:block">
      <div className="caption-label pb-3">本期文档 · 上下文</div>

      <Section
        k="requirement"
        label="Ⅰ 需求摘要"
        meta={ctx.requirementSummary ? "1 条" : undefined}
        expanded={expanded.requirement}
        onToggle={() => toggle("requirement")}
        hasContent={!!ctx.requirementSummary}
      >
        <p>{ctx.requirementSummary}</p>
      </Section>

      <Section
        k="planner"
        label="Ⅱ Planner 判定"
        meta={ctx.needType ?? undefined}
        expanded={expanded.planner}
        onToggle={() => toggle("planner")}
        hasContent={!!ctx.needType}
      >
        <div className="data-row">
          <span className="label">需求类型</span>
          <span className="value">{ctx.needType}</span>
        </div>
        {ctx.weights && (
          <>
            <div className="data-row">
              <span className="label">硬指标层</span>
              <span className="value tnum">
                {ctx.weights.hardMetrics}
                <sup>%</sup>
              </span>
            </div>
            <div className="data-row">
              <span className="label">品味层</span>
              <span className="value tnum">
                {ctx.weights.taste}
                <sup>%</sup>
              </span>
            </div>
          </>
        )}
      </Section>

      <Section
        k="writing"
        label="Ⅲ 写作规划"
        meta={outlineCount ? `${outlineCount} 章` : undefined}
        expanded={expanded.writing}
        onToggle={() => toggle("writing")}
        hasContent={outlineCount > 0}
      >
        <div className="data-row">
          <span className="label">章节</span>
          <span className="value tnum">
            {outlineCount}
            <sup>章</sup>
          </span>
        </div>
        <div className="data-row">
          <span className="label">风险点</span>
          <span className="value tnum">
            {riskCount}
            <sup>条</sup>
          </span>
        </div>
        <div className="data-row">
          <span className="label">建议字数</span>
          <span className="value tnum">
            {estimatedWords.toLocaleString()}
            <sup>字</sup>
          </span>
        </div>
      </Section>

      <Section
        k="prd"
        label="Ⅳ 当前 PRD"
        meta={ctx.prdLength ? `${ctx.prdLength} 字` : undefined}
        expanded={expanded.prd}
        onToggle={() => toggle("prd")}
        hasContent={ctx.prdLength > 0}
      >
        <div className="data-row">
          <span className="label">字数（含 Markdown）</span>
          <span className="value tnum">
            {ctx.prdLength.toLocaleString()}
            <sup>字</sup>
          </span>
        </div>
      </Section>

      <Section
        k="evaluation"
        label="Ⅴ 最新评分"
        meta={
          ctx.latestScore !== null ? `${ctx.latestScore} / 100` : undefined
        }
        expanded={expanded.evaluation}
        onToggle={() => toggle("evaluation")}
        hasContent={ctx.latestScore !== null}
      >
        <div className="flex items-baseline gap-3 py-2">
          <span
            className="editorial-num text-[40px] leading-none"
            style={{ fontWeight: 500 }}
          >
            {ctx.latestScore}
          </span>
          <span className="text-[12px] text-[var(--text-tertiary)]">
            / 100
          </span>
        </div>
        {ctx.latestVerdict && (
          <div className="caption-label pt-1">{ctx.latestVerdict}</div>
        )}
      </Section>

      <Section
        k="revisions"
        label="Ⅵ 返工记录"
        meta={ctx.reviseCount ? `${ctx.reviseCount} 次` : undefined}
        expanded={expanded.revisions}
        onToggle={() => toggle("revisions")}
        hasContent={ctx.reviseCount > 0}
      >
        <div className="data-row">
          <span className="label">已返工</span>
          <span className="value tnum">
            {ctx.reviseCount}
            <sup>次</sup>
          </span>
        </div>
      </Section>

      <Section
        k="versions"
        label="Ⅶ PRD 版本"
        meta={prdVersions.length ? `${prdVersions.length} 个` : undefined}
        expanded={expanded.versions}
        onToggle={() => toggle("versions")}
        hasContent={prdVersions.length > 0}
      >
        <div className="space-y-3">
          {prdVersions.map(version => (
            <VersionRow key={version.id} version={version} />
          ))}
        </div>
      </Section>
    </aside>
  )
}

const VERSION_SOURCE_LABEL: Record<PrdVersion["source"], string> = {
  generator: "Generator",
  "revision-evaluator": "评估返工",
  "revision-feedback": "反馈重生",
  "human-edit": "人类编辑",
}

function VersionRow({ version }: { version: PrdVersion }) {
  function download() {
    const blob = new Blob([version.content], {
      type: "text/markdown;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `prd-${version.id}.md`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="border-t border-[var(--border-hairline)] pt-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="caption-label">{version.id}</span>
        <button type="button" className="btn-text" onClick={download}>
          下载
        </button>
      </div>
      <div className="mt-1 text-[11px] text-[var(--text-tertiary)]">
        {VERSION_SOURCE_LABEL[version.source]} ·{" "}
        {version.content.length.toLocaleString()} 字
      </div>
      <div className="mt-1 text-[11px] text-[var(--text-tertiary)]">
        {new Date(version.createdAt).toLocaleString("zh-CN", {
          hour12: false,
        })}
      </div>
    </div>
  )
}
