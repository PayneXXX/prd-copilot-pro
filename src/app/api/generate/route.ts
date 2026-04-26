import { NextResponse } from "next/server"
import { z } from "zod"

import { generateBare } from "@/lib/agents/bare-generator"
import { generateCopilot } from "@/lib/agents/copilot-pipeline"
import { generateStructured } from "@/lib/agents/structured-generator"
import { MODELS } from "@/config/models"
import type { ApiError } from "@/lib/types/api-error"
import { RequirementDraftSchema } from "@/lib/types/requirement"
import type { GenerateResponse, PRDGeneration } from "@/lib/types/prd"
import { makeTimer } from "@/lib/utils/logger"

export const runtime = "nodejs"
export const maxDuration = 180

const RequestSchema = z.object({
  draft: RequirementDraftSchema,
})

export async function POST(req: Request) {
  const timer = makeTimer("generate")
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
        model: MODELS.MAIN,
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
          model: MODELS.MAIN,
        } satisfies ApiError,
        { status: 400 },
      )
    }

    timer.tick("3. schema validated")

    const { draft } = parsed.data
    const start = Date.now()
    const controller = new AbortController()
    timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 180_000)

    timer.tick("4. calling three-tier generators", {
      rawContentLen: draft.rawContent.length,
      confidence: draft.normalizedContent.confidence,
    })

    const [bareResult, structuredResult, copilotResult] =
      await Promise.allSettled([
        generateBare(draft.rawContent, controller.signal),
        generateStructured(draft.rawContent, controller.signal),
        generateCopilot(draft.normalizedContent, controller.signal),
      ])
    clearTimeout(timeout)
    timeout = undefined

    if (timedOut) {
      timer.tick("X. three-tier generation aborted by timeout", {
        totalMs: timer.total(),
      })

      return NextResponse.json(
        {
          ok: false,
          type: "upstream_timeout",
          error:
            "三档生成执行超时（180秒）。这通常是中转站长请求问题，请查看终端日志。",
          provider: "anthropic",
          model: MODELS.MAIN,
        } satisfies ApiError,
        { status: 504 },
      )
    }

    const unwrap = (
      result: PromiseSettledResult<PRDGeneration>,
      tier: PRDGeneration["tier"],
    ): PRDGeneration => {
      if (result.status === "fulfilled") {
        return result.value
      }

      return {
        tier,
        content: "",
        tokenUsage: { input: 0, output: 0 },
        durationMs: 0,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : "未知错误",
      }
    }

    const response: GenerateResponse = {
      ok: true,
      draftId: draft.id,
      generations: [
        unwrap(bareResult, "bare"),
        unwrap(structuredResult, "structured"),
        unwrap(copilotResult, "copilot"),
      ],
      totalDurationMs: Date.now() - start,
    }

    timer.tick("5. three-tier generators returned", {
      totalDurationMs: response.totalDurationMs,
      generations: response.generations.map(generation => ({
        tier: generation.tier,
        durationMs: generation.durationMs,
        tokenUsage: generation.tokenUsage,
        hasError: Boolean(generation.error),
      })),
    })

    console.info("[/api/generate] completed", {
      draftId: draft.id,
      totalDurationMs: response.totalDurationMs,
      generations: response.generations.map(generation => ({
        tier: generation.tier,
        durationMs: generation.durationMs,
        tokenUsage: generation.tokenUsage,
        hasError: Boolean(generation.error),
        hasTrace: Boolean(generation.trace),
      })),
    })

    timer.tick("6. response sent", { totalMs: timer.total() })

    return NextResponse.json(response)
  } catch (error) {
    if (timeout) {
      clearTimeout(timeout)
    }

    console.error("[/api/generate] error:", error)

    if (timedOut || (error instanceof Error && error.name === "AbortError")) {
      timer.tick("X. three-tier generation aborted by timeout", {
        totalMs: timer.total(),
      })

      return NextResponse.json(
        {
          ok: false,
          type: "upstream_timeout",
          error:
            "三档生成执行超时（180秒）。这通常是中转站长请求问题，请查看终端日志。",
          provider: "anthropic",
          model: MODELS.MAIN,
        } satisfies ApiError,
        { status: 504 },
      )
    }

    const message = error instanceof Error ? error.message : "生成失败"
    timer.tick("X. error", { message, totalMs: timer.total() })

    return NextResponse.json(
      {
        ok: false,
        type: "upstream_error",
        error: message || "生成失败",
        provider: "anthropic",
        model: MODELS.MAIN,
      } satisfies ApiError,
      { status: 500 },
    )
  }
}
