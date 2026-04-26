import { generatePRDText } from "@/lib/llm/generate"
import type { PRDGeneration } from "@/lib/types/prd"

/**
 * A 档：模拟 PM 直接把需求丢给 ChatGPT 的最朴素用法
 * 关键：只给 rawContent，一句话指令，不给任何模板或约束
 */
export async function generateBare(
  rawContent: string,
  signal?: AbortSignal,
): Promise<PRDGeneration> {
  const start = Date.now()

  try {
    const { text, inputTokens, outputTokens } = await generatePRDText({
      maxOutputTokens: 1200,
      signal,
      prompt: `请根据下面的需求描述写一份精简版 PRD 文档。
输出使用 Markdown，重点覆盖背景与目标、用户故事、核心功能、风险与约束。
请控制篇幅，适合 MVP 评审快速阅读。

需求描述：
${rawContent}`,
    })

    const durationMs = Date.now() - start
    console.info("[generateBare]", {
      durationMs,
      inputTokens,
      outputTokens,
    })

    return {
      tier: "bare",
      content: text,
      tokenUsage: { input: inputTokens, output: outputTokens },
      durationMs,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成失败"
    const durationMs = Date.now() - start

    console.error("[generateBare:error]", {
      durationMs,
      message,
    })

    return {
      tier: "bare",
      content: "",
      tokenUsage: { input: 0, output: 0 },
      durationMs,
      error: message,
    }
  }
}
