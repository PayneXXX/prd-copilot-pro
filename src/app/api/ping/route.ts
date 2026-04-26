import { NextResponse } from "next/server"
import { generateText } from "ai"

import { MODELS } from "@/config/models"
import { anthropic } from "@/lib/llm/client"
import type { ApiError } from "@/lib/types/api-error"
import { makeTimer } from "@/lib/utils/logger"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  const timer = makeTimer("ping")
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 180_000)

  timer.tick("1. request received")

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY

    if (!apiKey || apiKey.includes("在这里填")) {
      timer.tick("X. missing api key, abort")
      throw new Error("ANTHROPIC_API_KEY 未配置，请先在 .env.local 中填入真实 key。")
    }

    timer.tick("2. calling anthropic", { model: MODELS.MAIN })

    const { text, usage } = await generateText({
      model: anthropic(MODELS.MAIN),
      prompt: `用一句话确认你当前使用的模型是 ${MODELS.MAIN}，并说"PRD Copilot Pro 已就绪"。`,
      abortSignal: controller.signal,
    })
    clearTimeout(timeout)

    timer.tick("3. anthropic returned", {
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
    })
    timer.tick("4. response sent", { totalMs: timer.total() })

    return NextResponse.json({
      ok: true,
      model: MODELS.MAIN,
      reply: text,
      usage,
    })
  } catch (error) {
    clearTimeout(timeout)

    if (error instanceof Error && error.name === "AbortError") {
      timer.tick("X. ping aborted by timeout", { totalMs: timer.total() })

      return NextResponse.json(
        {
          ok: false,
          type: "upstream_timeout",
          error: "Ping 执行超时（180秒）。请检查中转站状态。",
          provider: "anthropic",
          model: MODELS.MAIN,
        } satisfies ApiError,
        { status: 504 },
      )
    }

    const message = error instanceof Error ? error.message : "Unknown error"
    timer.tick("X. error", { message, totalMs: timer.total() })

    return NextResponse.json(
      {
        ok: false,
        type: message.includes("ANTHROPIC_API_KEY 未配置")
          ? "missing_api_key"
          : "upstream_error",
        error: message,
        provider: "anthropic",
        model: MODELS.MAIN,
      } satisfies ApiError,
      { status: 500 },
    )
  }
}
