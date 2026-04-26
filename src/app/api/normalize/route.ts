import { generateObject } from "ai"
import { NextResponse } from "next/server"
import { z } from "zod"

import { MODELS } from "@/config/models"
import {
  NORMALIZER_SYSTEM_PROMPT,
  buildNormalizerUserPrompt,
} from "@/lib/agents/normalizer"
import { anthropic } from "@/lib/llm/client"
import {
  NormalizedContentSchema,
  RequirementDraftSchema,
} from "@/lib/types/requirement"
import type { ApiError } from "@/lib/types/api-error"
import { makeTimer } from "@/lib/utils/logger"

export const runtime = "nodejs"
export const maxDuration = 60

const RequestSchema = z.object({
  source: z.enum(["text", "chat"]),
  rawContent: z.string().min(1).max(10000),
})

export async function POST(req: Request) {
  const timer = makeTimer("normalize")
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

    const { source, rawContent } = parsed.data
    timer.tick("4. calling anthropic", {
      source,
      contentLen: rawContent.length,
    })

    const { object, usage } = await generateObject({
      model: anthropic(MODELS.MAIN),
      schema: NormalizedContentSchema,
      system: NORMALIZER_SYSTEM_PROMPT,
      prompt: buildNormalizerUserPrompt({ source, rawContent }),
    })
    timer.tick("5. anthropic returned", {
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
    })

    const draft = {
      id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      source,
      rawContent,
      normalizedContent: object,
      createdAt: new Date().toISOString(),
      metadata: {
        originalLength: rawContent.length,
      },
    }

    const validated = RequirementDraftSchema.parse(draft)

    timer.tick("6. response sent", { totalMs: timer.total() })

    return NextResponse.json({
      ok: true,
      draft: validated,
      usage,
    })
  } catch (error) {
    console.error("[/api/normalize] error:", error)

    const message = error instanceof Error ? error.message : "归一化失败"
    timer.tick("X. error", { message, totalMs: timer.total() })

    return NextResponse.json(
      {
        ok: false,
        type: "upstream_error",
        error: message || "归一化失败",
        provider: "anthropic",
        model: MODELS.MAIN,
      } satisfies ApiError,
      { status: 500 },
    )
  }
}
