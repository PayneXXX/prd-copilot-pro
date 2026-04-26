import { NextResponse } from "next/server"
import { z } from "zod"

import { ROLE_MODELS } from "@/config/models"
import { runGeneratorWithFeedback } from "@/lib/agents/generator"
import type { ApiError } from "@/lib/types/api-error"
import { WritingPlanSchema } from "@/lib/types/planner"
import { makeTimer } from "@/lib/utils/logger"

export const runtime = "nodejs"
export const maxDuration = 180

const RequestSchema = z.object({
  originalPrd: z.string().min(10),
  writingPlan: WritingPlanSchema,
  aggregatedHumanFeedback: z.string().optional().default(""),
  evaluatorSuggestions: z.array(z.string()).optional().default([]),
})

export async function POST(req: Request) {
  const timer = makeTimer("regen-feedback")
  let timeout: ReturnType<typeof setTimeout> | undefined
  let timedOut = false

  timer.tick("1. request received")

  if (!process.env.SILICONFLOW_API_KEY) {
    timer.tick("X. missing api key, abort")

    return NextResponse.json(
      {
        ok: false,
        type: "missing_api_key",
        error: "SILICONFLOW_API_KEY 未配置",
        provider: "siliconflow",
        model: ROLE_MODELS.generator.modelId,
      } satisfies ApiError,
      { status: 500 },
    )
  }

  try {
    const body = await req.json()
    timer.tick("2. body parsed", { size: JSON.stringify(body).length })

    const parsed = RequestSchema.safeParse(body)

    if (!parsed.success) {
      timer.tick("X. schema validation failed")

      return NextResponse.json(
        {
          ok: false,
          type: "schema_validation_failed",
          error: "输入参数校验失败",
          detail: parsed.error.flatten(),
          provider: "siliconflow",
          model: ROLE_MODELS.generator.modelId,
        } satisfies ApiError,
        { status: 400 },
      )
    }

    const {
      originalPrd,
      writingPlan,
      aggregatedHumanFeedback,
      evaluatorSuggestions,
    } = parsed.data

    timer.tick("3. schema validated")
    timer.tick("4. calling generator with feedback", {
      originalPrdLen: originalPrd.length,
      feedbackLen: aggregatedHumanFeedback.length,
      evaluatorSuggestionCount: evaluatorSuggestions.length,
    })

    const controller = new AbortController()
    timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 180_000)

    const result = await runGeneratorWithFeedback({
      originalPrd,
      writingPlan,
      aggregatedHumanFeedback,
      evaluatorSuggestions,
      signal: controller.signal,
    })

    clearTimeout(timeout)
    timeout = undefined

    timer.tick("5. generator returned", {
      prdLength: result.output.prdMarkdown.length,
      parseStatus: result.output.parseStatus,
      inputTokens: result.tokens.input,
      outputTokens: result.tokens.output,
      durationMs: result.durationMs,
    })

    timer.tick("6. response sent", { totalMs: timer.total() })

    return NextResponse.json({
      ok: true,
      generatorOutput: result.output,
      tokens: result.tokens,
      durationMs: result.durationMs,
    })
  } catch (error) {
    if (timeout) {
      clearTimeout(timeout)
    }

    console.error("[/api/regenerate-feedback] error:", error)

    if (timedOut || (error instanceof Error && error.name === "AbortError")) {
      timer.tick("X. generator feedback aborted by timeout", {
        totalMs: timer.total(),
      })

      return NextResponse.json(
        {
          ok: false,
          type: "upstream_timeout",
          error: "按反馈重新生成超时（180秒）。请稍后重试。",
          provider: "siliconflow",
          model: ROLE_MODELS.generator.modelId,
        } satisfies ApiError,
        { status: 504 },
      )
    }

    const message =
      error instanceof Error ? error.message : "按反馈重新生成失败"
    timer.tick("X. error", { message, totalMs: timer.total() })

    return NextResponse.json(
      {
        ok: false,
        type: "upstream_error",
        error: message || "按反馈重新生成失败",
        provider: "siliconflow",
        model: ROLE_MODELS.generator.modelId,
      } satisfies ApiError,
      { status: 500 },
    )
  }
}
