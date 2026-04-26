import { NextResponse } from "next/server"
import { z } from "zod"

import { ROLE_MODELS } from "@/config/models"
import { runGenerator } from "@/lib/agents/generator"
import type { ApiError } from "@/lib/types/api-error"
import { PlannerOutputSchema } from "@/lib/types/planner"
import { RequirementDraftSchema } from "@/lib/types/requirement"
import { makeTimer } from "@/lib/utils/logger"

export const runtime = "nodejs"
export const maxDuration = 180

const RequestSchema = z.object({
  draft: RequirementDraftSchema,
  plannerOutput: PlannerOutputSchema,
  plannerUserFeedback: z.string().optional().default(""),
  plannerQuestionAnswers: z
    .record(z.string(), z.union([z.string(), z.literal("auto")]))
    .optional()
    .default({}),
})

export async function POST(req: Request) {
  const timer = makeTimer("gen-prd")
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

    timer.tick("3. schema validated")

    const {
      draft,
      plannerOutput,
      plannerUserFeedback,
      plannerQuestionAnswers,
    } = parsed.data
    timer.tick("4. calling generator", {
      rawContentLen: draft.rawContent.length,
      outlineCount: plannerOutput.writingPlan.outline.length,
      hasPlannerFeedback: plannerUserFeedback.trim().length > 0,
      answeredQuestions: Object.keys(plannerQuestionAnswers).length,
    })

    const controller = new AbortController()
    timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 180_000)

    const result = await runGenerator({
      normalizedContent: draft.normalizedContent,
      rawContent: draft.rawContent,
      plannerOutput,
      plannerUserFeedback,
      plannerQuestionAnswers,
      signal: controller.signal,
    })
    clearTimeout(timeout)
    timeout = undefined

    timer.tick("5. generator returned", {
      prdLength: result.output.prdMarkdown.length,
      sectionsCount: result.output.sectionsGenerated.length,
      inputTokens: result.tokens.input,
      outputTokens: result.tokens.output,
      durationMs: result.durationMs,
    })

    timer.tick("6. response sent", { totalMs: timer.total() })

    return NextResponse.json({
      ok: true,
      draftId: draft.id,
      generatorOutput: result.output,
      tokens: result.tokens,
      durationMs: result.durationMs,
    })
  } catch (error) {
    if (timeout) {
      clearTimeout(timeout)
    }

    console.error("[/api/generate-prd] error:", error)

    if (timedOut || (error instanceof Error && error.name === "AbortError")) {
      timer.tick("X. generator aborted by timeout", { totalMs: timer.total() })

      return NextResponse.json(
        {
          ok: false,
          type: "upstream_timeout",
          error:
            "Generator 执行超时（180秒）。这通常是上游长请求问题，请查看 ERROR_LOG 最新事件。",
          provider: "siliconflow",
          model: ROLE_MODELS.generator.modelId,
        } satisfies ApiError,
        { status: 504 },
      )
    }

    const message = error instanceof Error ? error.message : "Generator 运行失败"
    timer.tick("X. error", { message, totalMs: timer.total() })

    return NextResponse.json(
      {
        ok: false,
        type: "upstream_error",
        error: message || "Generator 运行失败",
        provider: "siliconflow",
        model: ROLE_MODELS.generator.modelId,
      } satisfies ApiError,
      { status: 500 },
    )
  }
}
