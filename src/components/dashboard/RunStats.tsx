"use client"

import { selectCostBreakdown, useSession } from "@/store/session-store"

export function RunStats() {
  const totalTokens = useSession(state => state.totalTokens)
  const totalDurationMs = useSession(state => state.totalDurationMs)
  const totalCost = useSession(state => selectCostBreakdown(state).total)

  const totalTokensCount = totalTokens.input + totalTokens.output
  const seconds = totalDurationMs / 1000

  const formattedSeconds =
    seconds >= 60
      ? `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(0)}s`
      : seconds.toFixed(1)
  const secondsUnit = seconds >= 60 ? "" : "s"

  return (
    <div className="border-t border-[var(--border-hairline)] pt-4">
      <div className="caption-label pb-2">本次运行</div>
      <div className="data-row">
        <span className="label">Tokens</span>
        <span className="value tnum">
          {totalTokensCount.toLocaleString()}
        </span>
      </div>
      <div className="data-row">
        <span className="label">耗时</span>
        <span className="value tnum">
          {formattedSeconds}
          {secondsUnit && <sup>{secondsUnit}</sup>}
        </span>
      </div>
      <div className="data-row">
        <span className="label">成本</span>
        <span className="value tnum">
          {totalCost.toFixed(4)}
          <sup>USD</sup>
        </span>
      </div>
    </div>
  )
}
