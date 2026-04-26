import { NextResponse } from "next/server"
import { z } from "zod"

import { ROLE_MODELS } from "@/config/models"
import { runEvaluator } from "@/lib/agents/evaluator"
import type { ApiError } from "@/lib/types/api-error"
import { EvaluationRuleSchema } from "@/lib/types/planner"
import { makeTimer } from "@/lib/utils/logger"

export const runtime = "nodejs"
export const maxDuration = 300

const RequestSchema = z.object({
  prdMarkdown: z.string().min(10),
  evaluationRule: EvaluationRuleSchema,
})

export async function POST(req: Request) {
  const timer = makeTimer("evaluate")

  timer.tick("1. request received")

  if (!process.env.SILICONFLOW_API_KEY) {
    timer.tick("X. missing siliconflow key")

    return NextResponse.json(
      {
        ok: false,
        type: "missing_api_key",
        error: "SILICONFLOW_API_KEY 未配置",
        provider: "siliconflow",
        model: ROLE_MODELS.evaluator.modelId,
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
          model: ROLE_MODELS.evaluator.modelId,
        } satisfies ApiError,
        { status: 400 },
      )
    }

    timer.tick("3. schema validated")
    timer.tick("4. calling evaluator", {
      prdLength: parsed.data.prdMarkdown.length,
      activeDimensionCount: parsed.data.evaluationRule.activeDimensions.length,
    })

    const result = await runEvaluator({
      prdMarkdown: parsed.data.prdMarkdown,
      evaluationRule: parsed.data.evaluationRule,
    })

    timer.tick("5. evaluator returned", {
      verdict: result.output.verdict,
      overallScore: result.output.overallScore,
      inputTokens: result.tokens.input,
      outputTokens: result.tokens.output,
      durationMs: result.durationMs,
    })

    timer.tick("6. response sent", { totalMs: timer.total() })

    return NextResponse.json({
      ok: true,
      evaluation: result.output,
      tokens: result.tokens,
      durationMs: result.durationMs,
    })
  } catch (error) {
    console.error("[/api/evaluate] error:", error)

    const message = error instanceof Error ? error.message : "Evaluator 运行失败"
    timer.tick("X. error", { message, totalMs: timer.total() })

    return NextResponse.json(
      {
        ok: false,
        type: "upstream_error",
        error: message || "Evaluator 运行失败",
        provider: "siliconflow",
        model: ROLE_MODELS.evaluator.modelId,
      } satisfies ApiError,
      { status: 500 },
    )
  }
}
