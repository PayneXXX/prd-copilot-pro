import { anthropic, siliconflow } from "@/lib/llm/client"

export const ROLE_MODELS = {
  normalizer: {
    provider: "anthropic" as const,
    modelId: "claude-opus-4-6",
  },
  planner: {
    provider: "anthropic" as const,
    modelId: "claude-opus-4-6",
  },
  generator: {
    provider: "siliconflow" as const,
    modelId: "Pro/zai-org/GLM-5.1",
  },
  evaluator: {
    provider: "siliconflow" as const,
    modelId: "Pro/moonshotai/Kimi-K2.6",
  },
} as const

export type Role = keyof typeof ROLE_MODELS

export function getModel(role: Role) {
  const config = ROLE_MODELS[role]

  if (config.provider === "anthropic") {
    return anthropic(config.modelId)
  }

  return siliconflow(config.modelId)
}

export const MODEL_PRICING = {
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-opus-4-7": { input: 15, output: 75 },
  "Pro/zai-org/GLM-5.1": { input: 2, output: 8 },
  "Pro/moonshotai/Kimi-K2.6": { input: 4, output: 16 },
} as const

export const MODELS = {
  MAIN: "claude-opus-4-6",
  BARE: "claude-opus-4-6",
  JUDGE: "Pro/moonshotai/Kimi-K2.6",
} as const

export type ModelId = keyof typeof MODEL_PRICING
