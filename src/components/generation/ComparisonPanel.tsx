"use client"

import { GenerationColumn } from "./GenerationColumn"

import type { GenerateResponse } from "@/lib/types/prd"

interface Props {
  response: GenerateResponse | null
  loading: boolean
}

export function ComparisonPanel({ response, loading }: Props) {
  if (loading) {
    return (
      <div className="rounded-lg border p-8 text-center text-muted-foreground">
        <div className="mb-2">🚀 三档并行生成中...</div>
        <div className="text-xs">
          A 档裸 Prompt · B 档结构化 · C 档 Copilot 三步链（预计 20-40 秒）
        </div>
      </div>
    )
  }

  if (!response) {
    return null
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Draft ID: {response.draftId.slice(0, 20)}...</span>
        <span>整体耗时 {(response.totalDurationMs / 1000).toFixed(1)}s</span>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {response.generations.map(generation => (
          <GenerationColumn key={generation.tier} generation={generation} />
        ))}
      </div>
    </div>
  )
}
