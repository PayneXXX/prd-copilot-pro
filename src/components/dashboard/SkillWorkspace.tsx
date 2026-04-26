"use client"

import { useMemo } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { toast } from "sonner"

import { WorkspaceHeader } from "@/components/dashboard/WorkspaceHeader"
import { selectHumanFeedbackEntries, useSession } from "@/store/session-store"

interface SkillDimension {
  id: string
  title: string
  principle: string
  reusableRules: string[]
  triggerKeywords: string[]
}

const SKILL_DIMENSIONS: SkillDimension[] = [
  {
    id: "goals",
    title: "业务目标与指标口径",
    principle:
      "PRD 中所有目标都必须写成可验收的指标对，并补充口径、分母、统计窗口和归因边界。",
    reusableRules: [
      "写业务目标时使用“基线 → 目标 → 统计口径 → 观测窗口”的四段式结构。",
      "如果目标值暂缺，必须显式标注“[假设]”并把口径补充进 openQuestions。",
      "避免只写“提升效率/降低成本”，必须说明谁的效率、哪类成本、如何统计。",
    ],
    triggerKeywords: ["指标", "目标", "口径", "基线", "分母", "数据", "量化"],
  },
  {
    id: "acceptance",
    title: "验收标准与边界用例",
    principle:
      "PRD 的验收标准必须覆盖主路径、边界条件、异常流、回滚条件，不能只覆盖 happy path。",
    reusableRules: [
      "验收用例用表格表达：场景 / 前置条件 / 操作 / 期望结果 / 责任方。",
      "每个关键功能至少补 1 条边界用例和 1 条异常用例。",
      "性能或稳定性风险必须写回滚阈值，例如 P95/P99、错误率、告警次数。",
    ],
    triggerKeywords: ["验收", "测试", "用例", "边界", "回滚", "异常", "P95", "P99"],
  },
  {
    id: "decisions",
    title: "决策确定性与取舍记录",
    principle:
      "遇到方案分歧时，PRD 必须拍板推荐方案，并记录不选其他方案的原因和切换条件。",
    reusableRules: [
      "争议点必须用 Plan A / Plan B 对比表表达，而不是散文式讨论。",
      "推荐方案要写清楚：推荐理由、代价、触发切换条件、谁最终确认。",
      "未拍板的问题不要藏在正文里，统一进入“待决问题/风险”清单。",
    ],
    triggerKeywords: ["方案", "拍板", "取舍", "Plan", "决策", "优先级", "范围"],
  },
  {
    id: "structure",
    title: "信息降噪与结构化表达",
    principle:
      "PRD 不是叙事稿；判定逻辑、字段、流程、异常分支优先用表格、列表或流程图表达。",
    reusableRules: [
      "状态/条件判定必须表格化，流程必须列表化或 Mermaid 化。",
      "删除“本章节将介绍/综上所述”等无信息过场句。",
      "同一个事实只在一个章节展开，其他章节引用结论，避免重复铺陈。",
    ],
    triggerKeywords: ["表格", "流程", "结构", "冗余", "重复", "散文", "可读"],
  },
  {
    id: "technical-boundary",
    title: "技术边界与运行保障",
    principle:
      "涉及系统能力时，PRD 要说明对象边界、输入输出、依赖、降级策略和运行时责任。",
    reusableRules: [
      "定义核心对象时写清：职责、输入、输出、生命周期、存储形态。",
      "外部依赖必须写超时、重试、降级、人工接管或安全中止机制。",
      "如果存在平台/多 Agent/多模块协作，必须画清调用边界和责任归属。",
    ],
    triggerKeywords: ["接口", "依赖", "超时", "降级", "Agent", "Skill", "平台", "边界"],
  },
  {
    id: "audience",
    title: "读者视角隔离",
    principle:
      "同一份 PRD 要让业务方能拍板、研发能开工、测试能验收，各类信息不能混在一起。",
    reusableRules: [
      "业务背景、产品方案、研发约束、测试验收分章节表达。",
      "面向研发的字段/接口/状态机不要散落在业务叙述里。",
      "面向决策层的风险和取舍要放在显眼位置，不要埋在实现细节中。",
    ],
    triggerKeywords: ["研发", "业务", "测试", "读者", "角色", "视角", "沟通"],
  },
]

export function SkillWorkspace() {
  const entries = useSession(selectHumanFeedbackEntries)
  const evaluations = useSession(state => state.evaluations)

  const matchedDimensions = useMemo(() => {
    const feedbackText = entries.map(entry => entry.text).join("\n")

    if (!feedbackText.trim()) {
      return SKILL_DIMENSIONS
    }

    const matched = SKILL_DIMENSIONS.filter(dimension =>
      dimension.triggerKeywords.some(keyword => feedbackText.includes(keyword)),
    )

    return matched.length > 0 ? matched : SKILL_DIMENSIONS.slice(0, 4)
  }, [entries])

  const skillMarkdown = useMemo(
    () => buildSkillMarkdown(matchedDimensions, entries, evaluations),
    [matchedDimensions, entries, evaluations],
  )

  function copySkill() {
    navigator.clipboard.writeText(skillMarkdown)
    toast.success("Skill Markdown 已复制")
  }

  function downloadSkill() {
    const blob = new Blob([skillMarkdown], {
      type: "text/markdown;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    const timestamp = new Date().toISOString().slice(0, 10)
    anchor.href = url
    anchor.download = `prd-writing-skill-${timestamp}.md`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    toast.success("Skill 文档已下载")
  }

  return (
    <div className="mx-auto max-w-[1040px]">
      <WorkspaceHeader
        kicker="第六章"
        roman="Ⅵ"
        title="沉淀"
        subtitle="把本次人类反馈提炼成可复用 PRD 写作 Skill。这里不保留项目专名，只沉淀下次还能复用的写作规则。"
      />

      <section className="border-y border-[var(--border-hairline)] py-4">
        <div className="grid grid-cols-1 gap-0 md:grid-cols-3">
          <Stat label="反馈来源">{entries.length} 段</Stat>
          <Stat label="沉淀维度">{matchedDimensions.length} 个</Stat>
          <Stat label="评估记录">{evaluations.length} 次</Stat>
        </div>
      </section>

      {entries.length > 0 ? (
        <section className="mt-12">
          <div className="border-b border-[var(--border-strong)] pb-2">
            <span className="caption-label">人类反馈来源</span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {entries.map(entry => (
              <div
                key={entry.step}
                className="border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4"
              >
                <div className="caption-label pb-2">{entry.label}</div>
                <p className="text-[13px] leading-[1.7] text-[var(--text-secondary)]">
                  {entry.text}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="mt-12 border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-5">
          <div className="caption-label pb-2">暂无人类反馈</div>
          <p className="text-[13px] leading-[1.7] text-[var(--text-secondary)]">
            当前会话没有记录 Planner / Generator / Evaluator / Review
            阶段的自由反馈，因此先展示默认 PRD 写作 Skill 基线。后续写入反馈后，这里会自动收敛到更贴近你习惯的维度。
          </p>
        </section>
      )}

      <section className="mt-12">
        <div className="border-b border-[var(--border-strong)] pb-2">
          <span className="caption-label">沉淀出的可复用维度</span>
        </div>
        <div className="mt-4 space-y-8">
          {matchedDimensions.map((dimension, index) => (
            <SkillDimensionCard
              key={dimension.id}
              index={index}
              dimension={dimension}
            />
          ))}
        </div>
      </section>

      <section className="mt-12">
        <div className="border-b border-[var(--border-strong)] pb-2">
          <span className="caption-label">Skill Markdown 预览</span>
        </div>
        <div
          className="mt-4 max-h-[62vh] overflow-y-auto bg-[var(--bg-card)] p-6"
          style={{ border: "1px solid var(--border-hairline)" }}
        >
          <article className="prose prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {skillMarkdown}
            </ReactMarkdown>
          </article>
        </div>
      </section>

      <div className="mt-12 border-t border-[var(--border-hairline)] pt-6">
        <p className="caption-label pb-4">保存 Skill</p>
        <div className="grid grid-cols-1 gap-0 md:grid-cols-2">
          <button
            type="button"
            className="flex flex-col items-start gap-1 border border-[var(--border-hairline)] bg-[var(--text-primary)] px-5 py-5 text-left text-[var(--text-on-accent)] transition-colors hover:bg-[var(--accent-base)]"
            onClick={copySkill}
          >
            <span className="text-[14px] font-medium">复制 Markdown</span>
            <span className="text-[12px] opacity-75">
              粘贴到 Skills 目录或知识库
            </span>
          </button>
          <button
            type="button"
            className="flex flex-col items-start gap-1 border border-[var(--border-hairline)] bg-[var(--bg-card)] px-5 py-5 text-left transition-colors hover:bg-[var(--bg-hover)] md:border-l-0"
            onClick={downloadSkill}
          >
            <span className="text-[14px] font-medium text-[var(--text-primary)]">
              下载 .md 文件
            </span>
            <span className="text-[12px] text-[var(--text-secondary)]">
              保存为可复用 PRD 写作 Skill
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

function SkillDimensionCard({
  index,
  dimension,
}: {
  index: number
  dimension: SkillDimension
}) {
  return (
    <div className="border-t border-[var(--border-hairline)] pt-4">
      <div className="flex items-baseline gap-3">
        <span className="caption-label">{String(index + 1).padStart(2, "0")}</span>
        <h3 className="heading-h2">{dimension.title}</h3>
      </div>
      <p className="mt-2 text-[14px] leading-[1.7] text-[var(--text-secondary)]">
        {dimension.principle}
      </p>
      <ol className="mt-3 space-y-2">
        {dimension.reusableRules.map((rule, ruleIndex) => (
          <li
            key={rule}
            className="flex gap-3 text-[13px] leading-[1.65] text-[var(--text-secondary)]"
          >
            <span className="caption-label">{ruleIndex + 1}</span>
            <span>{rule}</span>
          </li>
        ))}
      </ol>
    </div>
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
    <div className="data-row">
      <span className="label">{label}</span>
      <span className="value tnum">{children}</span>
    </div>
  )
}

function buildSkillMarkdown(
  dimensions: SkillDimension[],
  entries: ReturnType<typeof selectHumanFeedbackEntries>,
  evaluations: ReturnType<typeof useSession.getState>["evaluations"],
) {
  const feedbackSource =
    entries.length > 0
      ? entries
          .map(entry => `- ${entry.label}：${entry.text.replace(/\n/g, " ")}`)
          .join("\n")
      : "- 本次会话没有显式人类反馈，使用默认 PRD 写作基线。"
  const latestEvaluation = evaluations[evaluations.length - 1]
  const evaluationSignal = latestEvaluation
    ? `- 最新 Evaluator 评分：${latestEvaluation.result.overallScore}/100，verdict=${latestEvaluation.result.verdict}`
    : "- 本次未产生 Evaluator 评分。"

  return `---
name: prd-writing-feedback-skill
description: 从人类反馈中沉淀出的通用 PRD 写作规则
author: Payne Xiao
version: v0.1
---

# PRD Writing Feedback Skill

这份 Skill 只保留可跨项目复用的 PRD 写作规则，不记录具体项目名、业务对象或一次性方案。

## 输入信号

${feedbackSource}
${evaluationSignal}

## 可复用写作维度

${dimensions
  .map(
    dimension => `### ${dimension.title}

**原则**：${dimension.principle}

${dimension.reusableRules.map(rule => `- ${rule}`).join("\n")}
`,
  )
  .join("\n")}

## 使用方式

- Planner 阶段：用这些维度检查写作规划是否覆盖目标、验收、决策、结构、技术边界和读者视角。
- Generator 阶段：把命中的维度作为写作约束，不要只在评估阶段才补救。
- Evaluator 阶段：若 PRD 未满足某个维度，反馈必须写成可执行修改动作。
`
}
