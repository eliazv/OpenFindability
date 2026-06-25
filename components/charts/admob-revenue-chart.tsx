"use client";

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import type { TrendPoint } from "@/lib/insights";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const chartConfig = {
  value: {
    label: "Ricavi AdMob",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

function formatDateLabel(date: string) {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

export function AdmobRevenueChart({ data, currency }: { data: TrendPoint[]; currency?: string }) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full">
      <AreaChart data={data} margin={{ left: 0, right: 0 }}>
        <defs>
          <linearGradient id="fillAdmobRevenue" x1="0" y1="0" x2="0" y2="1">
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
                    <span className="text-muted-foreground">Ricavi</span>
                  </div>
                  <span className="text-foreground font-mono font-medium tabular-nums">
                    {typeof value === "number"
                      ? value.toLocaleString("it-IT", currency ? { style: "currency", currency } : undefined)
                      : value}
                  </span>
                </div>
              )}
            />
          }
        />
        <Area dataKey="value" type="natural" fill="url(#fillAdmobRevenue)" stroke="var(--color-value)" />
      </AreaChart>
    </ChartContainer>
  );
}
