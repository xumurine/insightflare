"use client";

import { type ComponentType, useMemo } from "react";
import { Label, PolarRadiusAxis, RadialBar, RadialBarChart } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart";
import { numberFormat, percentFormat } from "@/lib/dashboard/format";
import type { Locale } from "@/lib/i18n/config";

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--muted-foreground)",
] as const;

export interface ShareRadialCardItem {
  key: string;
  label: string;
  value: number;
  isOther?: boolean;
  color?: string;
  icon?: ComponentType<{ className?: string }>;
}

interface ShareRadialCardProps {
  title: string;
  items: ShareRadialCardItem[];
  locale: Locale;
  valueLabel: string;
}

export function ShareRadialCard({
  title,
  items,
  locale,
  valueLabel,
}: ShareRadialCardProps) {
  const totalValue = useMemo(
    () => items.reduce((sum, item) => sum + item.value, 0),
    [items],
  );

  const resolvedItems = useMemo(
    () =>
      items.map((item, index) => ({
        ...item,
        color:
          item.color ??
          (item.isOther
            ? "var(--muted-foreground)"
            : CHART_COLORS[index % CHART_COLORS.length]),
      })),
    [items],
  );

  const chartConfig = useMemo(() => {
    const config: ChartConfig = {};
    for (const item of resolvedItems) {
      config[item.key] = {
        label: item.label,
        color: item.color,
      };
    }
    return config;
  }, [resolvedItems]);

  const chartData = useMemo(() => {
    const row: Record<string, number> = {};
    for (const item of resolvedItems) {
      row[item.key] = item.value;
    }
    return [row];
  }, [resolvedItems]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center">
          <ChartContainer
            config={chartConfig}
            className="mx-auto aspect-[2/1] w-full"
          >
            <RadialBarChart
              data={chartData}
              endAngle={180}
              innerRadius="60%"
              outerRadius="100%"
            >
              <ChartTooltip
                cursor={false}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0];
                  const key = String(item.dataKey ?? "");
                  const value = Number(item.value ?? 0);
                  const share = totalValue > 0 ? value / totalValue : 0;
                  const resolvedItem = resolvedItems.find(
                    (entry) => entry.key === key,
                  );
                  const label = String(chartConfig[key]?.label ?? key);
                  const color = chartConfig[key]?.color;
                  const ItemIcon = resolvedItem?.icon;

                  return (
                    <div className="grid min-w-[10rem] gap-1 rounded-none border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-[2px]"
                          style={{ backgroundColor: color }}
                        />
                        {ItemIcon ? (
                          <ItemIcon className="size-3.5 shrink-0 text-muted-foreground" />
                        ) : null}
                        <span className="font-medium">{label}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">
                          {numberFormat(locale, value)} {valueLabel}
                        </span>
                        <span className="font-mono font-medium tabular-nums">
                          {percentFormat(locale, share)}
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
              <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
                <Label
                  content={({ viewBox }) => {
                    if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) {
                      return null;
                    }
                    const cx = viewBox.cx || 0;
                    const cy = viewBox.cy || 0;
                    const width = 200;
                    const height = 60;
                    return (
                      <foreignObject
                        x={cx - width / 2}
                        y={cy - height + 4}
                        width={width}
                        height={height}
                      >
                        <div className="flex h-full flex-col items-center justify-end">
                          <span className="text-center text-[clamp(1rem,3cqi,1.75rem)] font-bold leading-tight text-foreground">
                            {numberFormat(locale, totalValue)}
                          </span>
                          <span className="text-[clamp(0.625rem,1.5cqi,0.75rem)] text-muted-foreground">
                            {valueLabel}
                          </span>
                        </div>
                      </foreignObject>
                    );
                  }}
                />
              </PolarRadiusAxis>
              {resolvedItems.map((item) => (
                <RadialBar
                  key={item.key}
                  dataKey={item.key}
                  stackId="share"
                  fill={item.color}
                  className="stroke-transparent stroke-2"
                />
              ))}
            </RadialBarChart>
          </ChartContainer>

          <div className="-mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            {resolvedItems.map((item) => {
              const share = totalValue > 0 ? item.value / totalValue : 0;
              const ItemIcon = item.icon;
              return (
                <div
                  key={item.key}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <span
                    className="size-2.5 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: item.color }}
                  />
                  {ItemIcon ? (
                    <ItemIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : null}
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-mono tabular-nums text-foreground">
                    {percentFormat(locale, share)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
