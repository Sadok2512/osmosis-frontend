import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';

interface PAEChartProps {
  variant?: 'editor' | 'presentation';
  height?: number | string;
  data?: { time: string; value: number; secondary?: number }[];
  primaryColor?: string;
  secondaryColor?: string;
  showSecondary?: boolean;
}

const defaultData = Array.from({ length: 24 }, (_, i) => {
  const base = 320 + Math.sin(i / 3) * 60 + Math.cos(i / 2) * 30;
  return {
    time: `${String(i).padStart(2, '0')}:00`,
    value: Math.round(base + Math.random() * 40),
    secondary: Math.round(base * 0.65 + Math.random() * 25),
  };
});

const PAEChart: React.FC<PAEChartProps> = ({
  variant = 'editor',
  height = '100%',
  data = defaultData,
  primaryColor = '#00685f',
  secondaryColor = '#6bd8cb',
  showSecondary = true,
}) => {
  const isPresentation = variant === 'presentation';

  const option = useMemo(() => {
    const labelColor = isPresentation ? 'rgba(255,255,255,0.55)' : '#565e74';
    const splitLine = isPresentation ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

    return {
      grid: {
        top: isPresentation ? 24 : 16,
        right: 16,
        bottom: 28,
        left: 44,
      },
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: isPresentation ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.98)',
        borderColor: 'rgba(0,0,0,0.06)',
        borderWidth: 1,
        textStyle: {
          color: isPresentation ? '#f8fafc' : '#0f172a',
          fontSize: 11,
          fontWeight: 600,
        },
        axisPointer: {
          type: 'line' as const,
          lineStyle: { color: primaryColor, type: 'dashed' as const, width: 1 },
        },
      },
      xAxis: {
        type: 'category' as const,
        data: data.map(d => d.time),
        boundaryGap: false,
        axisLine: { lineStyle: { color: splitLine } },
        axisTick: { show: false },
        axisLabel: { fontSize: 9, color: labelColor, fontWeight: 700 },
      },
      yAxis: {
        type: 'value' as const,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { fontSize: 9, color: labelColor, fontWeight: 700 },
        splitLine: { lineStyle: { color: splitLine, type: 'dashed' as const } },
      },
      series: [
        {
          name: 'Throughput',
          type: 'line' as const,
          smooth: true,
          showSymbol: false,
          data: data.map(d => d.value),
          lineStyle: {
            color: primaryColor,
            width: isPresentation ? 3 : 2.5,
            shadowColor: isPresentation ? `${primaryColor}80` : 'transparent',
            shadowBlur: isPresentation ? 12 : 0,
          },
          itemStyle: { color: primaryColor },
          areaStyle: {
            color: {
              type: 'linear' as const,
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: `${primaryColor}55` },
                { offset: 1, color: `${primaryColor}00` },
              ],
            },
          },
          emphasis: { focus: 'series' as const },
        },
        ...(showSecondary ? [{
          name: 'Baseline',
          type: 'line' as const,
          smooth: true,
          showSymbol: false,
          data: data.map(d => d.secondary ?? 0),
          lineStyle: {
            color: secondaryColor,
            width: 1.5,
            type: 'dashed' as const,
          },
          itemStyle: { color: secondaryColor },
        }] : []),
      ],
      animationDuration: isPresentation ? 1600 : 900,
      animationEasing: 'cubicOut' as const,
    };
  }, [data, isPresentation, primaryColor, secondaryColor, showSecondary]);

  return (
    <ReactECharts
      option={option}
      style={{ height, width: '100%' }}
      opts={{ renderer: 'canvas' }}
      notMerge
    />
  );
};

export default PAEChart;
