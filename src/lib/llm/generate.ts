import type { AnthropicLanguageModelOptions } from "@ai-sdk/anthropic"
import { generateText } from "ai"
import { MODELS } from "@/config/models"

import { anthropic } from "./client"

export interface GenerateParams {
  system?: string
  prompt: string
  model?: string
  maxOutputTokens?: number
  signal?: AbortSignal
}

export interface GenerateResult {
  text: string
  inputTokens: number
  outputTokens: number
}

/**
 * 统一文本生成入口，所有 Agent 都走这个函数
 * - 不使用 temperature（Anthropic Opus 系列不支持）
 * - 统一 token 字段命名
 */
export async function generatePRDText(
  params: GenerateParams,
): Promise<GenerateResult> {
  const {
    system,
    prompt,
    model = MODELS.MAIN,
    maxOutputTokens = 1600,
    signal,
  } = params
  const { text, usage } = await generateText({
    model: anthropic(model),
    system,
    prompt,
    maxOutputTokens,
    abortSignal: signal,
    providerOptions: {
      anthropic: {
        effort: "low",
      } satisfies AnthropicLanguageModelOptions,
    },
  })

  return {
    text,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
  }
}
