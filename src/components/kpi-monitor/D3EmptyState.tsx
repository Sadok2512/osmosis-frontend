import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import { DEFAULT_GRID, DEFAULT_CALENDAR } from './GraphSettingsPanel';
import type { WidgetGraphConfig } from './GraphSettingsPanel';
import { BarChart3 } from 'lucide-react';

interface Props {
  height?: number;
  gc?: WidgetGraphConfig;
}

const MARGIN = { top: 20, right: 24, bottom: 36, left: 56 };

/**
 * Empty chart state that renders grid lines + weekend shading
 * so the graph area never looks completely blank.
 */
const D3EmptyState: React.FC<Props> = ({ height = 300, gc }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setContainerWidth(e.contentRect.width);
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = containerWidth;
    const innerW = width - MARGIN.left - MARGIN.right;
    const innerH = height - MARGIN.top - MARGIN.bottom;
    if (innerW <= 0 || innerH <= 0) return;

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    // Time range: last 7 days
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const xScale = d3.scaleTime().domain([weekAgo, now]).range([0, innerW]);
    const yScale = d3.scaleLinear().domain([0, 100]).range([innerH, 0]).nice();

    // Weekend shading
    const calCfg = gc?.calendar || DEFAULT_CALENDAR;
    if (calCfg.highlightWeekends) {
      const weekendColor = calCfg.weekendColor || '#E5E7EB';
      const weekendOpacity = (calCfg.weekendOpacity ?? 10) / 100;
      const cur = new Date(weekAgo);
      cur.setHours(0, 0, 0, 0);
      while (cur <= now) {
        const day = cur.getDay();
        if (day === 0 || day === 6) {
          const dayStart = new Date(cur);
          const dayEnd = new Date(cur);
          dayEnd.setDate(dayEnd.getDate() + 1);
          const x1 = Math.max(0, xScale(dayStart));
          const x2 = Math.min(innerW, xScale(dayEnd));
          if (x2 > x1) {
            g.append('rect')
              .attr('x', x1).attr('y', 0)
              .attr('width', x2 - x1).attr('height', innerH)
              .attr('fill', weekendColor)
              .attr('opacity', weekendOpacity)
              .attr('pointer-events', 'none');
          }
        }
        cur.setDate(cur.getDate() + 1);
      }
    }

    // Grid lines
    const gridCfg = gc?.grid || DEFAULT_GRID;
    if (gridCfg.enabled) {
      const gridOpacity = (gridCfg.opacity ?? 20) / 100;
      const gridType = gridCfg.type || 'both';
      if (gridType === 'horizontal' || gridType === 'both') {
        g.append('g')
          .call(d3.axisLeft(yScale).tickSize(-innerW).tickFormat(() => ''))
          .call(g => g.selectAll('line').attr('stroke', `rgba(128,128,128,${gridOpacity})`).attr('stroke-dasharray', '4,4'))
          .call(g => g.select('.domain').remove());
      }
      if (gridType === 'vertical' || gridType === 'both') {
        g.append('g')
          .attr('transform', `translate(0,${innerH})`)
          .call(d3.axisBottom(xScale).tickSize(-innerH).tickFormat(() => ''))
          .call(g => g.selectAll('line').attr('stroke', `rgba(128,128,128,${gridOpacity})`).attr('stroke-dasharray', '4,4'))
          .call(g => g.select('.domain').remove());
      }
    }

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(xScale).ticks(6).tickFormat(d3.timeFormat('%d/%m') as any))
      .call(g => {
        g.selectAll('text').attr('fill', 'hsl(var(--muted-foreground))').attr('font-size', '10px').attr('opacity', 0.5);
        g.selectAll('line').attr('stroke', 'hsl(var(--border))').attr('opacity', 0.3);
        g.select('.domain').attr('stroke', 'hsl(var(--border))').attr('opacity', 0.3);
      });

    g.append('g')
      .call(d3.axisLeft(yScale).ticks(5))
      .call(g => {
        g.selectAll('text').attr('fill', 'hsl(var(--muted-foreground))').attr('font-size', '10px').attr('opacity', 0.5);
        g.selectAll('line').attr('stroke', 'hsl(var(--border))').attr('opacity', 0.3);
        g.select('.domain').attr('stroke', 'hsl(var(--border))').attr('opacity', 0.3);
      });
  }, [containerWidth, height, gc]);

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
      <svg ref={svgRef} width={containerWidth} height={height} />
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <BarChart3 className="w-8 h-8 text-muted-foreground/20 stroke-[1.2]" />
        <p className="text-xs font-medium text-muted-foreground/40 mt-2">
          Ajoutez un KPI pour afficher le graphique
        </p>
      </div>
    </div>
  );
};

export default D3EmptyState;
