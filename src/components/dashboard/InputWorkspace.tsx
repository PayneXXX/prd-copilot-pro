"use client"

import { useState } from "react"
import { toast } from "sonner"

import { WorkspaceHeader } from "@/components/dashboard/WorkspaceHeader"
import type { RequirementDraft, RequirementSource } from "@/lib/types/requirement"
import { safeFetchJson } from "@/lib/utils/safe-fetch"
import { cn } from "@/lib/utils"
import { useSession } from "@/store/session-store"

type NormalizeResponse =
  | { ok: true; draft: RequirementDraft; tokens?: { input: number; output: number } }
  | { ok: false; error: string }

const TEXT_PLACEHOLDER =
  "用自然语言描述你的需求，例如：我们的骑手 App 有一个订单列表页，骑手反馈顶部筛选不好用，想改进一下..."
const CHAT_PLACEHOLDER = `粘贴钉钉/飞书/微信聊天记录，例如：

张三 2026-04-20 14:32
老板今天说骑手投诉列表页找不到取消订单的单子，咱们得优化下

李四 2026-04-20 14:35
那是因为筛选默认不含"已取消"，要改默认值吗？

张三 2026-04-20 14:37
我觉得要，但还得加个入口能看历史全部订单...`

export function InputWorkspace() {
  const { draft, setDraft } = useSession()
  const [activeTab, setActiveTab] = useState<RequirementSource>("text")
  const [textValue, setTextValue] = useState("")
  const [chatValue, setChatValue] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentValue = activeTab === "text" ? textValue : chatValue
  const canSubmit = currentValue.trim().length >= 10 && !loading

  async function handleNormalize() {
    setLoading(true)
    setError(null)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 65_000)

    const result = await safeFetchJson<NormalizeResponse>("/api/normalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: activeTab, rawContent: currentValue }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    setLoading(false)

    if (!result.ok) {
      const msg =
        result.kind === "abort"
          ? "归一化请求超过 65 秒。可能是中转站短请求异常，请查看终端日志并重试。"
          : result.message
      setError(msg)
      toast.error("归一化失败", { description: msg })
      return
    }

    if (!result.data.ok) {
      setError(result.data.error)
      toast.error("归一化失败", { description: result.data.error })
      return
    }

    setDraft(result.data.draft, result.data.tokens)
    toast.success("归一化完成 · 已进入 Planner 步骤")
  }

  return (
    <div className="mx-auto max-w-[720px]">
      <WorkspaceHeader
        kicker="第一章"
        roman="Ⅰ"
        title="需求输入"
        subtitle="用文字描述或粘贴聊天记录，AI 会归一化为结构化需求。越具体越好——目标用户、场景、痛点、约束。"
      />

      <div className="flex gap-0 border-b border-[var(--border-hairline)]">
        <TabButton
          active={activeTab === "text"}
          onClick={() => setActiveTab("text")}
        >
          文字描述
        </TabButton>
        <TabButton
          active={activeTab === "chat"}
          onClick={() => setActiveTab("chat")}
        >
          聊天记录
        </TabButton>
      </div>

      <div className="mt-6">
        {activeTab === "text" ? (
          <textarea
            value={textValue}
            onChange={e => setTextValue(e.target.value)}
            placeholder={TEXT_PLACEHOLDER}
            disabled={loading}
            className="input-editorial min-h-[280px] resize-y leading-[1.7]"
          />
        ) : (
          <textarea
            value={chatValue}
            onChange={e => setChatValue(e.target.value)}
            placeholder={CHAT_PLACEHOLDER}
            disabled={loading}
            className="input-editorial min-h-[280px] resize-y font-mono text-[13px] leading-[1.7]"
            style={{
              fontFamily:
                "var(--font-jetbrains-mono), ui-monospace, monospace",
            }}
          />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="caption-label">
          {currentValue.length}
          {" / "}
          {currentValue.trim().length >= 10 ? "已就绪" : "至少 10 字"}
        </span>
        <button
          type="button"
          onClick={handleNormalize}
          disabled={!canSubmit}
          className="btn-editorial"
        >
          {loading ? "归一化中…" : "归一化需求 →"}
        </button>
      </div>

      {error && (
        <div
          className="mt-8 border-l-2 px-4 py-3 text-[13px]"
          style={{
            borderColor: "var(--status-error)",
            background: "var(--accent-subtle)",
            color: "var(--status-error)",
          }}
        >
          {error}
        </div>
      )}

      <div className="mt-12">
        <DraftView draft={draft} loading={loading} />
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative px-5 py-3 text-[13px] tracking-wide transition-colors",
        active
          ? "text-[var(--text-primary)]"
          : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
      )}
    >
      {children}
      {active && (
        <span
          className="absolute -bottom-px left-0 right-0 h-[2px]"
          style={{ background: "var(--accent-base)" }}
        />
      )}
    </button>
  )
}

function DraftView({
  draft,
  loading,
}: {
  draft: RequirementDraft | null
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="caption-label">
        Normalizer Agent 正在梳理需求 · 这一步通常 5–15 秒
      </div>
    )
  }

  if (!draft) {
    return (
      <div className="caption-label">
        归一化结果会出现在此处
      </div>
    )
  }

  const { normalizedContent } = draft
  const confidenceLabel = {
    high: "信息充分",
    medium: "有待补充",
    low: "信息不足",
  }[normalizedContent.confidence]

  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between border-b border-[var(--border-strong)] pb-3">
        <span className="kicker">归一化结果</span>
        <span className="caption-label">{confidenceLabel}</span>
      </div>

      <Field label="概要">{normalizedContent.summary}</Field>
      <Field label="用户故事">{normalizedContent.userStory}</Field>
      <ListField label="痛点" items={normalizedContent.painPoints} />
      <ListField label="约束" items={normalizedContent.constraints} />
      <ListField
        label="PM 应继续追问"
        items={normalizedContent.openQuestions}
        accent
      />
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="caption-label pb-2">{label}</div>
      <p className="text-[15px] leading-[1.7] text-[var(--text-primary)]">
        {children}
      </p>
    </div>
  )
}

function ListField({
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
      {items.length === 0 ? (
        <p className="text-[13px] italic text-[var(--text-tertiary)]">无</p>
      ) : (
        <ol className="space-y-2">
          {items.map((item, index) => (
            <li
              key={`${label}-${index}`}
              className="flex gap-3 text-[14px] leading-[1.65]"
            >
              <span
                className="shrink-0 tabular-nums"
                style={{
                  fontFamily: "var(--font-newsreader), Georgia, serif",
                  color: accent
                    ? "var(--accent-base)"
                    : "var(--text-tertiary)",
                  fontStyle: "italic",
                }}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <span
                className={cn(
                  accent
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)]",
                )}
              >
                {item}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
