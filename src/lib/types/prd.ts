export type GenerationTier = "bare" | "structured" | "copilot"

export const TIER_LABEL: Record<GenerationTier, string> = {
  bare: "A · 裸 Prompt",
  structured: "B · 结构化 Prompt",
  copilot: "C · Copilot 协作",
}

export interface PRDGeneration {
  tier: GenerationTier
  content: string
  tokenUsage: {
    input: number
    output: number
  }
  durationMs: number
  trace?: {
    planner?: { output: string; tokens: { input: number; output: number } }
    outliner?: { output: string; tokens: { input: number; output: number } }
    drafter?: { output: string; tokens: { input: number; output: number } }
  }
  error?: string
}

export interface GenerateResponse {
  ok: boolean
  draftId: string
  generations: PRDGeneration[]
  totalDurationMs: number
}
