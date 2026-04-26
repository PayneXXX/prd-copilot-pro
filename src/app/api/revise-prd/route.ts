import { NextResponse } from "next/server"
import { z } from "zod"

import { ROLE_MODELS } from "@/config/models"
import { runGeneratorRevision } from "@/lib/agents/generator"
import type { ApiError } from "@/lib/types/api-error"
import { EvaluationResultSchema } from "@/lib/types/evaluator"
import { WritingPlanSchema } from "@/lib/types/planner"
import { makeTimer } from "@/lib/utils/logger"

export const runtime = "nodejs"
export const maxDuration = 180

const RequestSchema = z.object({
  originalPrd: z.string().min(10),
  evaluation: EvaluationResultSchema,
  writingPlan: WritingPlanSchema,
  evaluatorUserFeedback: z.string().optional().default(""),
})

export async function POST(req: Request) {
  const timer = makeTimer("revise-prd")
  let timeout: ReturnType<typeof setTimeout> | undefined
  let timedOut = false

  timer.tick("1. request received")

  if (!process.env.SILICONFLOW_API_KEY) {
    timer.tick("X. missing siliconflow key")

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

    timer.tick("3. schema validated")

    const controller = new AbortController()
    timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 180_000)

    timer.tick("4. calling generator revision", {
      prdLength: parsed.data.originalPrd.length,
      suggestionCount: parsed.data.evaluation.revisionSuggestions.length,
    })

    const result = await runGeneratorRevision({
      originalPrd: parsed.data.originalPrd,
      evaluation: parsed.data.evaluation,
      writingPlan: parsed.data.writingPlan,
      evaluatorUserFeedback: parsed.data.evaluatorUserFeedback,
      signal: controller.signal,
    })
    clearTimeout(timeout)
    timeout = undefined

    timer.tick("5. revision returned", {
      prdLength: result.output.prdMarkdown.length,
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

    console.error("[/api/revise-prd] error:", error)

    if (timedOut || (error instanceof Error && error.name === "AbortError")) {
      timer.tick("X. revision aborted by timeout", { totalMs: timer.total() })

      return NextResponse.json(
        {
          ok: false,
          type: "upstream_timeout",
          error: "Generator 修订超时（180秒）",
          provider: "siliconflow",
          model: ROLE_MODELS.generator.modelId,
        } satisfies ApiError,
        { status: 504 },
      )
    }

    const message = error instanceof Error ? error.message : "Generator 修订失败"
    timer.tick("X. error", { message, totalMs: timer.total() })

    return NextResponse.json(
      {
        ok: false,
        type: "upstream_error",
        error: message || "Generator 修订失败",
        provider: "siliconflow",
        model: ROLE_MODELS.generator.modelId,
      } satisfies ApiError,
      { status: 500 },
    )
  }
}
