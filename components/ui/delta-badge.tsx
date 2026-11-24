// Adapted from dashboardcn (MIT), NoahGdev/dashboardcn@b1ffacbca0f7a0be60135c8665b9e8c267205c48.
// License: docs/reference/dashboardcn-LICENSE.txt.
import * as React from "react"
import { Minus, TrendingDown, TrendingUp } from "lucide-react"

import { cn } from "@/lib/utils"
const formatDelta = (delta: number) => (delta > 0 ? "+" : "") + delta.toLocaleString("it-IT", { style: "percent", maximumFractionDigits: 1 })

export type DeltaDirection = "up" | "down" | "flat"

export function getDeltaDirection(delta: number | undefined): DeltaDirection {
  if (delta === undefined || delta === 0 || !Number.isFinite(delta)) return "flat"
  return delta > 0 ? "up" : "down"
}

const directionIcon: Record<DeltaDirection, React.ElementType> = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
}

export interface DeltaBadgeProps extends React.ComponentProps<"span"> {
  /** Fractional change, e.g. 0.124 for +12.4%. */
  delta: number
  /** Treat a decrease as good and an increase as bad (churn, latency, errors). */
  invert?: boolean
  variant?: "outline" | "soft" | "text"
  showIcon?: boolean
}

function DeltaBadge({
  delta,
  invert = false,
  variant = "outline",
  showIcon = true,
  className,
  children,
  ...props
}: DeltaBadgeProps) {
  const direction = getDeltaDirection(delta)
  const positive = direction === "flat" ? null : (direction === "up") !== invert
  const Icon = directionIcon[direction]

  return (
    <span
      data-slot="delta-badge"
      data-direction={direction}
      data-positive={positive}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium tabular-nums",
        variant === "outline" && "rounded-md border px-1.5 py-0.5",
        variant === "soft" && "rounded-md px-1.5 py-0.5",
        variant === "soft" && positive === true && "bg-emerald-500/10",
        variant === "soft" && positive === false && "bg-red-500/10",
        variant === "soft" && positive === null && "bg-muted",
        positive === true && "text-success",
        positive === false && "text-destructive",
        positive === null && "text-muted-foreground",
        className
      )}
      {...props}
    >
      {showIcon ? <Icon className="size-3" aria-hidden="true" /> : null}
      {children ?? formatDelta(delta)}
    </span>
  )
}

export { DeltaBadge }
