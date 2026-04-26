import { NextResponse } from "next/server"
import { z } from "zod"

import { ROLE_MODELS } from "@/config/models"
import { runPlanner } from "@/lib/agents/planner"
import type { ApiError } from "@/lib/types/api-error"
import { RequirementDraftSchema } from "@/lib/types/requirement"
import { makeTimer } from "@/lib/utils/logger"

export const runtime = "nodejs"
export const maxDuration = 180

const RequestSchema = z.object({
  draft: RequirementDraftSchema,
})

export async function POST(req: Request) {
  const timer = makeTimer("plan")
  let timeout: ReturnType<typeof setTimeout> | undefined
  let timedOut = false

  timer.tick("1. request received")

  if (!process.env.ANTHROPIC_API_KEY) {
    timer.tick("X. missing api key, abort")

    return NextResponse.json(
      {
        ok: false,
        type: "missing_api_key",
        error: "ANTHROPIC_API_KEY 未配置",
        provider: "anthropic",
        model: ROLE_MODELS.planner.modelId,
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
          provider: "anthropic",
          model: ROLE_MODELS.planner.modelId,
        } satisfies ApiError,
        { status: 400 },
      )
    }

    timer.tick("3. schema validated")

    const { draft } = parsed.data
    timer.tick("4. calling planner", {
      rawContentLen: draft.rawContent.length,
      confidence: draft.normalizedContent.confidence,
    })

    const controller = new AbortController()
    timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 180_000)

    const result = await runPlanner({
      normalizedContent: draft.normalizedContent,
      rawContent: draft.rawContent,
      signal: controller.signal,
    })
    clearTimeout(timeout)
    timeout = undefined

    timer.tick("5. planner returned", {
      inputTokens: result.tokens.input,
      outputTokens: result.tokens.output,
      durationMs: result.durationMs,
    })

    timer.tick("6. response sent", { totalMs: timer.total() })

    return NextResponse.json({
      ok: true,
      draftId: draft.id,
      plannerOutput: result.output,
      tokens: result.tokens,
      durationMs: result.durationMs,
    })
  } catch (error) {
    if (timeout) {
      clearTimeout(timeout)
    }

    console.error("[/api/plan] error:", error)

    if (timedOut || (error instanceof Error && error.name === "AbortError")) {
      timer.tick("X. planner aborted by timeout", { totalMs: timer.total() })

      return NextResponse.json(
        {
          ok: false,
          type: "upstream_timeout",
          error:
            "Planner 执行超时（180秒）。这通常是中转站长请求问题，请重试或查看 ERROR_LOG。",
          provider: "anthropic",
          model: ROLE_MODELS.planner.modelId,
        } satisfies ApiError,
        { status: 504 },
      )
    }

    const message = error instanceof Error ? error.message : "Planner 运行失败"
    timer.tick("X. error", { message, totalMs: timer.total() })

    return NextResponse.json(
      {
        ok: false,
        type: "upstream_error",
        error: message || "Planner 运行失败",
        provider: "anthropic",
        model: ROLE_MODELS.planner.modelId,
      } satisfies ApiError,
      { status: 500 },
    )
  }
}
