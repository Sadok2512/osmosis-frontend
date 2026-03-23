import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import * as d3 from 'd3';
import { KpiTimeSeriesPoint, KpiCatalogEntry, GraphType } from './types';
import { KPI_CATALOG_MAP } from './kpiCatalog';
import { useKpiMonitorStore, Milestone } from '../../stores/kpiMonitorStore';
import { DEFAULT_GRID, DEFAULT_CALENDAR } from './GraphSettingsPanel';
import type { WidgetGraphConfig, WidgetAxisConfig, WidgetThreshold } from './GraphSettingsPanel';
import { getAxisSideConfig } from './normalizeConfig';

interface Props {
  data: KpiTimeSeriesPoint[];
  height?: number;
  catalogMap?: Record<string, KpiCatalogEntry>;
  gc?: WidgetGraphConfig;
  ac?: WidgetAxisConfig;
  thresholds?: WidgetThreshold[];
  thresholdsEnabled?: boolean;
  milestones?: Milestone[];
  showMilestones?: boolean;
}

const PREMIUM_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
];

const MARGIN = { top: 20, right: 24, bottom: 36, left: 56 };
const LEGEND_HEIGHT = 32;

const DASH_MAP: Record<string, string> = { solid: '0', dashed: '6,4', dotted: '2,3' };

const D3TimeSeries: React.FC<Props> = ({ data, height: rawHeight = 380, catalogMap: externalMap, gc, ac, thresholds, thresholdsEnabled, milestones, showMilestones }) => {
  const showLegend = gc?.showLegend ?? true;
  const legendPos = gc?.legendPosition ?? 'bottom';
  const legendH = showLegend ? LEGEND_HEIGHT : 0;
  const height = rawHeight - legendH;
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { selectedKpis } = useKpiMonitorStore();
  const catMap = externalMap || KPI_CATALOG_MAP;
  const [containerWidth, setContainerWidth] = useState(600);

  // Observe container width
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

  // Build series data
  const { seriesArr, allTs } = useMemo(() => {
    const seriesMap = new Map<string, { kpiKey: string; name: string; points: Map<string, number> }>();
    for (const pt of data) {
      const name = pt.split_value === 'ALL' ? pt.kpi_key : `${pt.kpi_key} — ${pt.split_value}`;
      if (!seriesMap.has(name)) seriesMap.set(name, { kpiKey: pt.kpi_key, name, points: new Map() });
      seriesMap.get(name)!.points.set(pt.ts, pt.value);
    }
    const allTs = [...new Set(data.map(d => d.ts))].sort();
    const seriesArr = [...seriesMap.values()];
    return { seriesArr, allTs };
  }, [data]);

  // Render D3
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    const tooltip = d3.select(tooltipRef.current);
    svg.selectAll('*').remove();

    const width = containerWidth;
    const innerW = width - MARGIN.left - MARGIN.right;
    const innerH = height - MARGIN.top - MARGIN.bottom;
    if (innerW <= 0 || innerH <= 0) return;

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    // Defs for gradients
    const defs = svg.append('defs');

    // X Scale
    const xDomain = allTs.map(t => new Date(t));
    const xScale = d3.scaleTime().domain(d3.extent(xDomain) as [Date, Date]).range([0, innerW]);

    // Separate left/right series
    const leftKpis = selectedKpis.filter(k => k.axis === 'left');
    const rightKpis = selectedKpis.filter(k => k.axis === 'right');
    const rightKeys = new Set(rightKpis.map(k => k.kpi_key));

    const leftSeries = seriesArr.filter(s => !rightKeys.has(s.kpiKey));
    const rightSeries = seriesArr.filter(s => rightKeys.has(s.kpiKey));

    const getExtent = (arr: typeof seriesArr) => {
      let min = Infinity, max = -Infinity;
      for (const s of arr) for (const v of s.points.values()) { if (v < min) min = v; if (v > max) max = v; }
      return min === Infinity ? [0, 100] : [Math.min(0, min), max * 1.1];
    };

    // Dual axis config
    const leftCfg = ac ? getAxisSideConfig(ac, 'left') : null;
    const rightCfg = ac ? getAxisSideConfig(ac, 'right') : null;

    const yLeftDomain = leftCfg?.min !== undefined && leftCfg.min !== 'auto' && leftCfg?.max !== undefined && leftCfg.max !== 'auto'
      ? [leftCfg.min as number, leftCfg.max as number]
      : getExtent(leftSeries.length > 0 ? leftSeries : seriesArr);
    const yLeft = d3.scaleLinear().domain(leftCfg?.invert ? [yLeftDomain[1], yLeftDomain[0]] : yLeftDomain).range([innerH, 0]).nice();

    const yRightDomain = rightCfg?.min !== undefined && rightCfg.min !== 'auto' && rightCfg?.max !== undefined && rightCfg.max !== 'auto'
      ? [rightCfg.min as number, rightCfg.max as number]
      : getExtent(rightSeries);
    const yRight = rightSeries.length > 0
      ? d3.scaleLinear().domain(rightCfg?.invert ? [yRightDomain[1], yRightDomain[0]] : yRightDomain).range([innerH, 0]).nice()
      : null;

    // ── 1. Weekend highlighting (behind everything) ──
    const calCfg = gc?.calendar || DEFAULT_CALENDAR;
    if (calCfg.highlightWeekends) {
      const [xMin, xMax] = xScale.domain();
      const weekendColor = calCfg.weekendColor || '#E5E7EB';
      const weekendOpacity = (calCfg.weekendOpacity ?? 10) / 100;
      // Find all weekend day boundaries in the range
      const cur = new Date(xMin);
      cur.setHours(0, 0, 0, 0);
      while (cur <= xMax) {
        const day = cur.getDay();
        if (day === 0 || day === 6) { // Sunday=0, Saturday=6
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

    // ── 2. Grid lines ──
    const gridCfg = gc?.grid || DEFAULT_GRID;
    if (gridCfg.enabled) {
      const gridOpacity = (gridCfg.opacity ?? 20) / 100;
      const gridType = gridCfg.type || 'both';
      if (gridType === 'horizontal' || gridType === 'both') {
        g.append('g')
          .attr('class', 'grid-y')
          .call(d3.axisLeft(yLeft).tickSize(-innerW).tickFormat(() => ''))
          .call(g => g.selectAll('line').attr('stroke', `rgba(128,128,128,${gridOpacity})`).attr('stroke-dasharray', '4,4'))
          .call(g => g.select('.domain').remove());
      }
      if (gridType === 'vertical' || gridType === 'both') {
        g.append('g')
          .attr('class', 'grid-x')
          .attr('transform', `translate(0,${innerH})`)
          .call(d3.axisBottom(xScale).tickSize(-innerH).tickFormat(() => ''))
          .call(g => g.selectAll('line').attr('stroke', `rgba(128,128,128,${gridOpacity * 0.7})`).attr('stroke-dasharray', '2,4'))
          .call(g => g.select('.domain').remove());
      }
    }

    // Axes formatters
    const makeYFmt = (cfg: typeof leftCfg) => (v: d3.NumberValue) => {
      const n = +v;
      const dec = cfg?.decimals ?? 2;
      const unit = cfg?.unit || '';
      if (unit) return n.toFixed(dec) + ' ' + unit;
      if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
      if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'k';
      return n % 1 === 0 ? n.toString() : n.toFixed(dec);
    };

    g.append('g')
      .call(d3.axisLeft(yLeft).ticks(6).tickFormat(makeYFmt(leftCfg)))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('text').attr('fill', '#9ca3af').style('font-size', '10px').style('font-family', 'Inter, system-ui, sans-serif'))
      .call(g => g.selectAll('.tick line').remove());

    if (leftCfg?.title) {
      g.append('text').attr('transform', 'rotate(-90)').attr('y', -44).attr('x', -innerH / 2)
        .attr('text-anchor', 'middle').attr('fill', '#9ca3af').style('font-size', '10px').text(leftCfg.title);
    }

    if (yRight) {
      g.append('g')
        .attr('transform', `translate(${innerW},0)`)
        .call(d3.axisRight(yRight).ticks(5).tickFormat(makeYFmt(rightCfg)))
        .call(g => g.select('.domain').remove())
        .call(g => g.selectAll('text').attr('fill', '#9ca3af').style('font-size', '10px'))
        .call(g => g.selectAll('.tick line').remove());

      if (rightCfg?.title) {
        g.append('text').attr('transform', 'rotate(90)').attr('y', -innerW - 16).attr('x', innerH / 2)
          .attr('text-anchor', 'middle').attr('fill', '#9ca3af').style('font-size', '10px').text(rightCfg.title);
      }
    }

    // X Axis
    const xFmt = ac?.xFormat || 'short';
    const xTickFmt = (d: Date | d3.NumberValue) => {
      const dt = d instanceof Date ? d : new Date(+d);
      if (xFmt === 'date') return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
      if (xFmt === 'datetime') return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      if (xFmt === 'full') return dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
      return dt.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' });
    };

    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(xScale).ticks(Math.min(allTs.length, 10)).tickFormat(xTickFmt as any))
      .call(g => g.select('.domain').attr('stroke', 'rgba(0,0,0,0.08)'))
      .call(g => g.selectAll('text').attr('fill', '#9ca3af').style('font-size', '10px').style('font-family', 'Inter, system-ui, sans-serif')
        .attr('transform', allTs.length > 30 ? 'rotate(-35)' : '').style('text-anchor', allTs.length > 30 ? 'end' : 'middle'))
      .call(g => g.selectAll('.tick line').remove());

    // Draw series — per-series style support
    const globalLineW = gc?.lineWidth ?? 2.5;
    const isSmooth = gc?.smooth ?? true;
    const globalShowSym = gc?.showSymbols ?? false;

    let colorIdx = 0;
    for (const s of seriesArr) {
      const kpiSel = selectedKpis.find(k => k.kpi_key === s.kpiKey);

      // Skip hidden series
      if (kpiSel?.visible === false) { colorIdx++; continue; }

      const cat = catMap[s.kpiKey];
      const color = kpiSel?.color || cat?.color || PREMIUM_COLORS[colorIdx % PREMIUM_COLORS.length];
      const yScale = rightKeys.has(s.kpiKey) && yRight ? yRight : yLeft;
      const chartType = kpiSel?.graphType || 'line';

      // Per-series style (with global fallback)
      const seriesLineW = kpiSel?.lineWidth ?? globalLineW;
      const seriesLineStyle = kpiSel?.lineStyle || 'solid';
      const seriesShowSym = kpiSel?.showMarkers ?? globalShowSym;
      const seriesOpacity = kpiSel?.opacity ?? 1;
      const dashArray = DASH_MAP[seriesLineStyle] || '0';

      const pointData = allTs
        .map(ts => ({ ts: new Date(ts), value: s.points.get(ts) ?? null }))
        .filter(d => d.value !== null) as { ts: Date; value: number }[];

      if (chartType === 'bar') {
        const barW = Math.max(2, innerW / allTs.length * 0.6);
        g.selectAll(`.bar-${colorIdx}`)
          .data(pointData)
          .join('rect')
          .attr('x', d => xScale(d.ts) - barW / 2)
          .attr('y', d => yScale(d.value))
          .attr('width', barW)
          .attr('height', d => Math.max(0, innerH - yScale(d.value)))
          .attr('fill', color)
          .attr('opacity', seriesOpacity * 0.7)
          .attr('rx', 2);
      } else if (chartType === 'scatter') {
        g.selectAll(`.dot-${colorIdx}`)
          .data(pointData)
          .join('circle')
          .attr('cx', d => xScale(d.ts))
          .attr('cy', d => yScale(d.value))
          .attr('r', 4)
          .attr('fill', color)
          .attr('opacity', seriesOpacity)
          .attr('stroke', '#fff')
          .attr('stroke-width', 1.5);
      } else {
        // Line / Area
        const curve = isSmooth ? d3.curveCatmullRom.alpha(0.5) : d3.curveLinear;
        const lineGen = d3.line<{ ts: Date; value: number }>()
          .x(d => xScale(d.ts))
          .y(d => yScale(d.value))
          .curve(curve);

        if (chartType === 'area' || chartType === 'stacked_area') {
          const gradId = `grad-d3-${colorIdx}`;
          const grad = defs.append('linearGradient').attr('id', gradId).attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1);
          grad.append('stop').attr('offset', '0%').attr('stop-color', color).attr('stop-opacity', 0.15 * seriesOpacity);
          grad.append('stop').attr('offset', '100%').attr('stop-color', color).attr('stop-opacity', 0.01);

          const areaGen = d3.area<{ ts: Date; value: number }>()
            .x(d => xScale(d.ts))
            .y0(innerH)
            .y1(d => yScale(d.value))
            .curve(curve);

          g.append('path').datum(pointData).attr('fill', `url(#${gradId})`).attr('d', areaGen);
        }

        // Line with per-series style
        g.append('path')
          .datum(pointData)
          .attr('fill', 'none')
          .attr('stroke', color)
          .attr('stroke-width', seriesLineW)
          .attr('stroke-linecap', 'round')
          .attr('stroke-linejoin', 'round')
          .attr('stroke-dasharray', dashArray)
          .attr('opacity', seriesOpacity)
          .attr('d', lineGen)
          .style('filter', `drop-shadow(0 3px 6px ${color}30)`);

        // Dots (per-series override)
        if (seriesShowSym) {
          g.selectAll(`.sym-${colorIdx}`)
            .data(pointData)
            .join('circle')
            .attr('cx', d => xScale(d.ts))
            .attr('cy', d => yScale(d.value))
            .attr('r', 3)
            .attr('fill', '#fff')
            .attr('stroke', color)
            .attr('stroke-width', 2);
        }
      }
      colorIdx++;
    }

    // Thresholds — per-axis support
    if (thresholdsEnabled && thresholds) {
      for (const t of thresholds) {
        if (t.visible === false) continue;
        const scale = (t.axis === 'right' && yRight) ? yRight : yLeft;
        const y = scale(t.value);
        if (y < 0 || y > innerH) continue;
        const dash = DASH_MAP[t.style] || (t.style === 'dashed' ? '6,4' : '0');
        g.append('line')
          .attr('x1', 0).attr('x2', innerW)
          .attr('y1', y).attr('y2', y)
          .attr('stroke', t.color)
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', dash);
        g.append('text')
          .attr('x', t.axis === 'right' ? 4 : innerW - 4)
          .attr('y', y - 4)
          .attr('text-anchor', t.axis === 'right' ? 'start' : 'end')
          .attr('fill', t.color)
          .style('font-size', '9px')
          .style('font-weight', '600')
          .text(t.label);
      }
    }

    // Milestones — vertical date markers
    if (showMilestones && milestones) {
      for (const m of milestones) {
        if (m.visible === false) continue;
        const mDate = new Date(m.date);
        const mx = xScale(mDate);
        if (mx < 0 || mx > innerW) continue;
        g.append('line')
          .attr('x1', mx).attr('x2', mx)
          .attr('y1', 0).attr('y2', innerH)
          .attr('stroke', m.color || '#3b82f6')
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '4,3')
          .attr('opacity', 0.7);
        // Label background
        const labelW = m.label.length * 5.5 + 12;
        g.append('rect')
          .attr('x', mx - labelW / 2).attr('y', -2)
          .attr('width', labelW).attr('height', 16)
          .attr('rx', 4)
          .attr('fill', m.color || '#3b82f6')
          .attr('opacity', 0.85);
        g.append('text')
          .attr('x', mx).attr('y', 10)
          .attr('text-anchor', 'middle')
          .attr('fill', '#fff')
          .style('font-size', '9px')
          .style('font-weight', '600')
          .text(m.label);
      }
    }

    // Tooltip overlay
    const bisect = d3.bisector<Date, Date>(d => d).left;
    const overlay = g.append('rect')
      .attr('width', innerW).attr('height', innerH)
      .attr('fill', 'none')
      .attr('pointer-events', 'all');

    const crosshair = g.append('line')
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', 'rgba(59,130,246,0.25)')
      .attr('stroke-width', 1)
      .style('display', 'none');

    overlay
      .on('mousemove', (event: MouseEvent) => {
        const [mx] = d3.pointer(event);
        const x0 = xScale.invert(mx);
        const dates = allTs.map(t => new Date(t));
        const idx = bisect(dates, x0, 1);
        const d0 = dates[idx - 1];
        const d1 = dates[idx];
        if (!d0) return;
        const closestDate = d1 && (+x0 - +d0 > +d1 - +x0) ? d1 : d0;
        const cx = xScale(closestDate);
        const tsKey = allTs.find(t => new Date(t).getTime() === closestDate.getTime()) || '';

        crosshair.attr('x1', cx).attr('x2', cx).style('display', null);

        // Build tooltip
        let html = `<div style="margin-bottom:6px;font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase">${closestDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</div>`;
        let ci = 0;
        for (const s of seriesArr) {
          const val = s.points.get(tsKey);
          if (val == null) { ci++; continue; }
          const kpiSel = selectedKpis.find(k => k.kpi_key === s.kpiKey);
          const cat = catMap[s.kpiKey];
          const c = kpiSel?.color || cat?.color || PREMIUM_COLORS[ci % PREMIUM_COLORS.length];
          html += `<div style="display:flex;align-items:center;gap:8px;padding:2px 0">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c};box-shadow:0 0 6px ${c}"></span>
            <span style="flex:1;color:#cbd5e1;font-size:11px">${s.name}</span>
            <span style="font-weight:700;color:#f8fafc;font-size:11px;font-variant-numeric:tabular-nums">${val.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}</span>
          </div>`;
          ci++;
        }

        tooltip
          .style('display', 'block')
          .style('left', `${Math.min(mx + MARGIN.left + 12, width - 200)}px`)
          .style('top', `${MARGIN.top + 12}px`)
          .html(html);
      })
      .on('mouseleave', () => {
        crosshair.style('display', 'none');
        tooltip.style('display', 'none');
      });

    // Entry animation
    svg.selectAll('path[fill="none"][stroke]')
      .each(function () {
        const path = this as SVGPathElement;
        const length = path.getTotalLength();
        d3.select(path)
          .attr('stroke-dasharray', `${length} ${length}`)
          .attr('stroke-dashoffset', length)
          .transition().duration(800).ease(d3.easeCubicInOut)
          .attr('stroke-dashoffset', 0)
          .on('end', function () { d3.select(this).attr('stroke-dasharray', null); });
      });

  }, [data, seriesArr, allTs, containerWidth, height, selectedKpis, catMap, gc, ac, thresholds, thresholdsEnabled, milestones, showMilestones]);

    return (
    <div ref={containerRef} className="relative w-full" style={{ height: rawHeight }}>
      {/* Legend top */}
      {showLegend && legendPos === 'top' && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 overflow-hidden" style={{ maxHeight: LEGEND_HEIGHT }}>
          {seriesArr.map((s, i) => {
            const kpiSel = selectedKpis.find(k => k.kpi_key === s.kpiKey);
            if (kpiSel?.visible === false) return null;
            const cat = catMap[s.kpiKey];
            const color = kpiSel?.color || cat?.color || PREMIUM_COLORS[i % PREMIUM_COLORS.length];
            return (
              <div key={s.name} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}40` }} />
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">{s.name}</span>
              </div>
            );
          })}
        </div>
      )}
      <svg ref={svgRef} width={containerWidth} height={height} className="overflow-visible" />
      {/* Legend bottom */}
      {showLegend && legendPos === 'bottom' && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 overflow-hidden" style={{ maxHeight: LEGEND_HEIGHT }}>
          {seriesArr.map((s, i) => {
            const kpiSel = selectedKpis.find(k => k.kpi_key === s.kpiKey);
            if (kpiSel?.visible === false) return null;
            const cat = catMap[s.kpiKey];
            const color = kpiSel?.color || cat?.color || PREMIUM_COLORS[i % PREMIUM_COLORS.length];
            return (
              <div key={s.name} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}40` }} />
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">{s.name}</span>
              </div>
            );
          })}
        </div>
      )}
      <div
        ref={tooltipRef}
        className="absolute pointer-events-none z-50"
        style={{
          display: 'none',
          backgroundColor: 'rgba(15,23,42,0.96)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10,
          padding: '14px 18px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.24)',
          backdropFilter: 'blur(12px)',
          maxWidth: 260,
        }}
      />
    </div>
  );
};

export default D3TimeSeries;
