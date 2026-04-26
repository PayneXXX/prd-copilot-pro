"use client"

import type { ReactNode } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { RequirementDraft } from "@/lib/types/requirement"

interface DraftPreviewProps {
  draft: RequirementDraft | null
  loading: boolean
  error: string | null
}

const CONFIDENCE_LABEL: Record<string, { text: string; color: string }> = {
  high: { text: "信息充分", color: "text-green-600" },
  medium: { text: "有待补充", color: "text-amber-600" },
  low: { text: "信息不足", color: "text-red-600" },
}

export function DraftPreview({ draft, loading, error }: DraftPreviewProps) {
  if (loading) {
    return (
      <Card className="h-full">
        <CardContent className="flex h-full items-center justify-center text-muted-foreground">
          正在让 Normalizer Agent 梳理你的需求...
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="h-full border-red-200">
        <CardContent className="pt-6 text-sm text-red-600">
          归一化失败：{error}
        </CardContent>
      </Card>
    )
  }

  if (!draft) {
    return (
      <Card className="h-full">
        <CardContent className="flex h-full items-center justify-center text-sm text-muted-foreground">
          在左侧输入需求后，点"归一化"，结构化结果会出现在这里。
        </CardContent>
      </Card>
    )
  }

  const normalizedContent = draft.normalizedContent
  const confidence = CONFIDENCE_LABEL[normalizedContent.confidence]

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>归一化结果</span>
          <span className={`text-sm font-normal ${confidence.color}`}>
            {confidence.text}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <Section label="概要">{normalizedContent.summary}</Section>
        <Section label="用户故事">{normalizedContent.userStory}</Section>
        <ListSection label="痛点" items={normalizedContent.painPoints} />
        <ListSection label="约束" items={normalizedContent.constraints} />
        <ListSection
          label="⭐ PM 应追问"
          items={normalizedContent.openQuestions}
          emphasize
        />
        <details className="border-t pt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            查看原始 JSON（ID: {draft.id.slice(0, 16)}...）
          </summary>
          <pre className="mt-2 max-h-60 overflow-auto rounded bg-muted p-3 text-xs">
            {JSON.stringify(draft, null, 2)}
          </pre>
        </details>
      </CardContent>
    </Card>
  )
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      <div>{children}</div>
    </div>
  )
}

function ListSection({
  label,
  items,
  emphasize,
}: {
  label: string
  items: string[]
  emphasize?: boolean
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground">（无）</div>
      ) : (
        <ul className={`list-disc space-y-1 pl-5 ${emphasize ? "text-foreground" : ""}`}>
          {items.map((item, index) => (
            <li key={`${label}-${index}`}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
