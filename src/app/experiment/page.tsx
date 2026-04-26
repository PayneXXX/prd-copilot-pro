"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"

import { ComparisonPanel } from "@/components/generation/ComparisonPanel"
import { ChatInput } from "@/components/input/ChatInput"
import { DraftPreview } from "@/components/input/DraftPreview"
import { TextInput } from "@/components/input/TextInput"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { RequirementDraft, RequirementSource } from "@/lib/types/requirement"
import type { GenerateResponse } from "@/lib/types/prd"

export default function Home() {
  const [activeTab, setActiveTab] = useState<RequirementSource>("text")
  const [textValue, setTextValue] = useState("")
  const [chatValue, setChatValue] = useState("")
  const [draft, setDraft] = useState<RequirementDraft | null>(null)
  const [genResponse, setGenResponse] = useState<GenerateResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentValue = activeTab === "text" ? textValue : chatValue
  const canSubmit = currentValue.trim().length >= 10 && !loading && !generating

  async function handleNormalize() {
    setLoading(true)
    setError(null)
    setDraft(null)
    setGenResponse(null)

    try {
      const response = await fetch("/api/normalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: activeTab,
          rawContent: currentValue,
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "未知错误")
      }

      setDraft(data.draft)

      toast.success("归一化完成", {
        description: `Token 使用：input ${data.usage?.inputTokens ?? "-"} / output ${data.usage?.outputTokens ?? "-"}`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误"

      setDraft(null)
      setGenResponse(null)
      setError(message)
      toast.error("归一化失败", { description: message })
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerate() {
    if (!draft) {
      return
    }

    setGenerating(true)
    setGenResponse(null)

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
      })

      const data = await response.json()

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "未知错误")
      }

      setGenResponse(data)
      toast.success("三档生成完成", {
        description: `整体耗时 ${(data.totalDurationMs / 1000).toFixed(1)}s`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误"

      toast.error("生成失败", { description: message })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">PRD Copilot Pro</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          M2 · 三档 PRD 生成层 · 从归一化需求到对照实验
        </p>
      </header>

      <div className="mb-4 rounded border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
        🧪 实验模式：三档对照生成（主产品路径请
        <Link href="/" className="underline">
          返回首页
        </Link>
        ）
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Tabs
            value={activeTab}
            onValueChange={value => setActiveTab(value as RequirementSource)}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="text">📝 文字描述</TabsTrigger>
              <TabsTrigger value="chat">💬 聊天记录</TabsTrigger>
            </TabsList>
            <TabsContent value="text" className="mt-4">
              <TextInput
                value={textValue}
                onChange={setTextValue}
                disabled={loading}
              />
            </TabsContent>
            <TabsContent value="chat" className="mt-4">
              <ChatInput
                value={chatValue}
                onChange={setChatValue}
                disabled={loading}
              />
            </TabsContent>
          </Tabs>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              当前输入 {currentValue.length} 字
              {currentValue.trim().length > 0 && currentValue.trim().length < 10 ? (
                <span className="ml-2 text-amber-600">（至少 10 字）</span>
              ) : null}
            </span>
            <Button onClick={handleNormalize} disabled={!canSubmit}>
              {loading ? "归一化中..." : "归一化需求"}
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <DraftPreview draft={draft} loading={loading} error={error} />
          {draft ? (
            <Button
              onClick={handleGenerate}
              disabled={generating || loading}
              className="w-full"
            >
              {generating ? "三档并行生成中..." : "🚀 开始三档生成"}
            </Button>
          ) : null}
        </div>
      </div>

      {genResponse || generating ? (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">三档对照结果</h2>
          <ComparisonPanel response={genResponse} loading={generating} />
        </section>
      ) : null}
    </main>
  )
}
