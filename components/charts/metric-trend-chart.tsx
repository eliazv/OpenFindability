"use client";

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import type { TrendPoint } from "@/lib/insights";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

function formatDateLabel(date: string) {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

export function MetricTrendChart({
  data,
  label,
  color = "var(--chart-1)",
  valueFormatter,
}: {
  data: TrendPoint[];
  label: string;
  color?: string;
  valueFormatter?: (value: number) => string;
}) {
  const chartConfig = {
    value: { label, color },
  } satisfies ChartConfig;

  const gradientId = `fillMetricTrend-${label.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full">
      <AreaChart data={data} margin={{ left: 0, right: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.8} />
            <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={formatDateLabel} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              indicator="dot"
              labelFormatter={(value) => formatDateLabel(String(value))}
              formatter={(value) => (
                <div className="flex w-full items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: "var(--color-value)" }} />
                    <span className="text-muted-foreground">{label}</span>
                  </div>
                  <span className="text-foreground font-mono font-medium tabular-nums">
                    {typeof value === "number" ? (valueFormatter ? valueFormatter(value) : value.toLocaleString("it-IT")) : value}
                  </span>
                </div>
              )}
            />
          }
        />
        <Area dataKey="value" type="natural" fill={`url(#${gradientId})`} stroke="var(--color-value)" />
      </AreaChart>
    </ChartContainer>
  );
}
