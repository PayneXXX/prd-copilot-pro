"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TIER_LABEL, type PRDGeneration } from "@/lib/types/prd"

interface Props {
  generation: PRDGeneration
}

export function GenerationColumn({ generation }: Props) {
  const { tier, content, tokenUsage, durationMs, error, trace } = generation

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{TIER_LABEL[tier]}</CardTitle>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>⏱ {(durationMs / 1000).toFixed(1)}s</span>
          <span>📥 {tokenUsage.input}</span>
          <span>📤 {tokenUsage.output}</span>
          <span>总计 {tokenUsage.input + tokenUsage.output} tokens</span>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        {error ? (
          <div className="text-sm text-red-600">❌ 生成失败：{error}</div>
        ) : (
          <div className="h-[60vh] overflow-y-auto pr-2">
            <article className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content || "（空内容）"}
              </ReactMarkdown>
            </article>

            {trace ? (
              <details className="mt-4 border-t pt-3">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  🔍 查看三步链中间产物（Planner → Outliner → Drafter）
                </summary>
                <div className="mt-2 space-y-3 text-xs">
                  {trace.planner ? (
                    <TraceStep
                      label="① Planner · 章节规划"
                      output={trace.planner.output}
                      tokens={trace.planner.tokens}
                    />
                  ) : null}
                  {trace.outliner ? (
                    <TraceStep
                      label="② Outliner · 详细大纲"
                      output={trace.outliner.output}
                      tokens={trace.outliner.tokens}
                    />
                  ) : null}
                  {trace.drafter ? (
                    <TraceStep
                      label="③ Drafter · 成品 PRD"
                      output={trace.drafter.output}
                      tokens={trace.drafter.tokens}
                    />
                  ) : null}
                </div>
              </details>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TraceStep({
  label,
  output,
  tokens,
}: {
  label: string
  output: string
  tokens: { input: number; output: number }
}) {
  return (
    <div className="rounded bg-muted p-2">
      <div className="mb-1 flex items-center justify-between font-medium">
        <span>{label}</span>
        <span className="font-normal text-muted-foreground">
          {tokens.input} / {tokens.output}
        </span>
      </div>
      <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap text-xs opacity-80">
        {output.slice(0, 500)}
        {output.length > 500 ? "..." : ""}
      </pre>
    </div>
  )
}
