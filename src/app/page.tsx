"use client"

import Link from "next/link"

import { Brand } from "@/components/dashboard/Brand"
import { ContextSidebar } from "@/components/dashboard/ContextSidebar"
import { EvaluatorWorkspace } from "@/components/dashboard/EvaluatorWorkspace"
import { GeneratorWorkspace } from "@/components/dashboard/GeneratorWorkspace"
import { InputWorkspace } from "@/components/dashboard/InputWorkspace"
import { PlannerWorkspace } from "@/components/dashboard/PlannerWorkspace"
import { ReviewWorkspace } from "@/components/dashboard/ReviewWorkspace"
import { RunStats } from "@/components/dashboard/RunStats"
import { SkillWorkspace } from "@/components/dashboard/SkillWorkspace"
import { Stepper } from "@/components/dashboard/Stepper"
import { useSession } from "@/store/session-store"

export default function Home() {
  const currentStep = useSession(state => state.currentStep)
  const reset = useSession(state => state.reset)

  return (
    <div className="flex min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)]">
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-[var(--border-hairline)] px-6 py-10">
        <Brand />
        <Stepper />
        <div className="mt-6">
          <RunStats />
        </div>

        <div className="mt-auto flex flex-col items-start gap-3 pt-8">
          <Link href="/experiment">
            <button type="button" className="btn-text">
              实验模式 / 三档对照
            </button>
          </Link>
          <button type="button" className="btn-text" onClick={reset}>
            重置会话
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1080px] px-10 py-16">
          {currentStep === "input" && <InputWorkspace />}
          {currentStep === "planner" && <PlannerWorkspace />}
          {currentStep === "generator" && <GeneratorWorkspace />}
          {currentStep === "evaluator" && <EvaluatorWorkspace />}
          {currentStep === "review" && <ReviewWorkspace />}
          {currentStep === "skill" && <SkillWorkspace />}
        </div>
      </main>

      <ContextSidebar />
    </div>
  )
}
