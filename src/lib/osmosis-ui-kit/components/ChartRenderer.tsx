import React, { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { Visualization } from "../lib/types";
import { colors } from "../lib/theme";

interface Props {
  viz: Visualization;
}

export function ChartRenderer({ viz }: Props) {
  const [unit, setUnit] = useState<"percent" | "absolute">("percent");
  const hasToggle = !!viz.unit_toggle && viz.unit_toggle.length > 1;

  const option = useMemo(() => buildChartOption(viz, unit), [viz, unit]);

  return (
    <div
      style={{
        background: "var(--bg-primary)",
        border: "0.5px solid var(--border-tertiary)",
        borderRadius: 8,
        padding: 14,
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{viz.title}</div>
          {viz.subtitle && (
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
              {viz.subtitle}
            </div>
          )}
        </div>
        {hasToggle && (
          <div style={{ display: "flex", gap: 4 }}>
            {viz.unit_toggle!.map((u) => (
              <button
                key={u}
                onClick={() => setUnit(u)}
                style={{
                  background: unit === u ? colors.brand.primary : "var(--bg-secondary)",
                  color: unit === u ? "white" : "var(--text-secondary)",
                  border: unit === u ? "none" : "0.5px solid var(--border-tertiary)",
                  padding: "4px 10px",
                  borderRadius: 4,
                  fontSize: 11,
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                {u === "percent" ? "%" : "abs"}
              </button>
            ))}
          </div>
        )}
      </div>

      <ReactECharts option={option} style={{ height: 280, width: "100%" }} />
    </div>
  );
}

function buildChartOption(viz: Visualization, unit: "percent" | "absolute") {
  const baseColors = viz.series.map((s, i) => s.color || colors.categorical[i % colors.categorical.length]);
  const highlights = viz.highlights || [];

  const isStacked = viz.type === "stacked_bar";
  const isBar = viz.type === "stacked_bar" || viz.type === "grouped_bar";
  const isLine = viz.type === "line" || viz.type === "area";
  const isPie = viz.type === "pie" || viz.type === "donut";

  const xAxisLabels = viz.x_axis.data;
  // Mark anomalous categories with a different label style
  const formattedLabels = xAxisLabels.map((label) => {
    if (highlights.includes(label)) {
      return `{warn|${label}}`;
    }
    return label;
  });

  if (isPie) {
    return {
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      legend: { bottom: 0, textStyle: { fontSize: 11 } },
      series: [
        {
          type: "pie",
          radius: viz.type === "donut" ? ["45%", "70%"] : "70%",
          center: ["50%", "45%"],
          data: viz.series.map((s, i) => ({
            name: s.name,
            value: s.data[0],
            itemStyle: { color: baseColors[i] },
          })),
          label: { fontSize: 11 },
        },
      ],
    };
  }

  return {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: {
      bottom: 0,
      textStyle: { fontSize: 11, color: "#5F5E5A" },
      icon: "roundRect",
      itemWidth: 10,
      itemHeight: 10,
    },
    grid: { left: 40, right: 16, top: 16, bottom: 50, containLabel: true },
    xAxis: {
      type: "category",
      data: formattedLabels,
      axisLabel: {
        fontSize: 10,
        color: "#5F5E5A",
        rich: {
          warn: { color: "#BA7517", fontWeight: 500 },
        },
      },
      axisLine: { lineStyle: { color: "#E5E5E0" } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: { fontSize: 10, color: "#888780", formatter: unit === "percent" ? "{value}%" : "{value}" },
      splitLine: { lineStyle: { color: "#E5E5E0", type: "dashed" } },
    },
    series: viz.series.map((s, i) => ({
      name: s.name,
      type: isBar ? "bar" : "line",
      stack: isStacked ? "total" : undefined,
      areaStyle: viz.type === "area" ? { opacity: 0.3 } : undefined,
      smooth: isLine,
      data: s.data,
      itemStyle: { color: baseColors[i] },
      lineStyle: isLine ? { width: 2 } : undefined,
      symbol: isLine ? "circle" : undefined,
      symbolSize: 5,
      barWidth: isBar ? "60%" : undefined,
    })),
  };
}
