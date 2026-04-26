"use client"

import { cn } from "@/lib/utils"
import { STEPS, useSession, type StepId } from "@/store/session-store"

const ROMAN = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ"]

export function Stepper() {
  const {
    currentStep,
    draft,
    plannerOutput,
    generatorOutput,
    evaluations,
    prdFinalContent,
    setStep,
  } = useSession()

  const currentOrder = STEPS.find(step => step.id === currentStep)!.order

  function getStatus(stepId: StepId): "done" | "current" | "locked" {
    const stepOrder = STEPS.find(step => step.id === stepId)!.order

    if (stepOrder === currentOrder) return "current"
    if (stepOrder < currentOrder) return "done"

    if (stepId === "planner" && draft) return "done"
    if (stepId === "generator" && plannerOutput) return "done"
    if (stepId === "evaluator" && generatorOutput) return "done"
    if (stepId === "review" && evaluations.length > 0) return "done"
    if (stepId === "skill" && prdFinalContent !== null) return "done"

    return "locked"
  }

  function canNavigate(stepId: StepId): boolean {
    const status = getStatus(stepId)
    return status === "done" || status === "current"
  }

  return (
    <nav className="flex flex-col gap-px py-4">
      {STEPS.map((step, index) => {
        const status = getStatus(step.id)
        const navigable = canNavigate(step.id)

        return (
          <button
            key={step.id}
            type="button"
            disabled={!navigable}
            onClick={() => navigable && setStep(step.id)}
            className={cn(
              "group flex items-baseline gap-3 py-2 text-left transition-colors",
              navigable ? "cursor-pointer" : "cursor-not-allowed",
            )}
          >
            <span
              className={cn(
                "w-6 text-center font-medium tabular-nums",
                status === "current" && "text-[var(--accent-base)]",
                status === "done" && "text-[var(--text-secondary)]",
                status === "locked" && "text-[var(--text-tertiary)]",
              )}
              style={{
                fontFamily: "var(--font-newsreader), Georgia, serif",
                fontSize: "13px",
              }}
            >
              {ROMAN[index]}
            </span>
            <span
              className={cn(
                "flex-1 text-[13px] leading-none",
                status === "current" &&
                  "font-medium text-[var(--text-primary)]",
                status === "done" &&
                  "text-[var(--text-secondary)] line-through decoration-[var(--border-hairline)] decoration-1 underline-offset-4",
                status === "locked" && "text-[var(--text-tertiary)]",
              )}
            >
              {step.label}
            </span>
            {status === "current" && (
              <span
                className="h-px w-4 self-center"
                style={{ background: "var(--accent-base)" }}
              />
            )}
          </button>
        )
      })}
    </nav>
  )
}
