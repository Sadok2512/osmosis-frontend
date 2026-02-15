import React, { useState, useCallback } from 'react';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { Plus, Save, FolderOpen, Sparkles, LayoutGrid, Type } from 'lucide-react';
import { Filters } from '../../types';
import { ChartConfig, DashboardChart, createDefaultChart } from '../bi/biTypes';
import BIChartCard from '../bi/BIChartCard';
import BITextWidget, { TextWidgetConfig, createDefaultTextWidget } from '../bi/BITextWidget';
import ChartConfigPanel from '../bi/ChartConfigPanel';
import AIAssistantPanel from '../bi/AIAssistantPanel';

const COLS = 12;
const ROW_HEIGHT = 80;

type WidgetItem =
  | { kind: 'chart'; config: ChartConfig; layout: { x: number; y: number; w: number; h: number } }
  | { kind: 'text'; config: TextWidgetConfig; layout: { x: number; y: number; w: number; h: number } };

const AnalyticBIStudio: React.FC<{ filters: Filters }> = ({ filters }) => {
  const [widgets, setWidgets] = useState<WidgetItem[]>(() => {
    try {
      const saved = localStorage.getItem('bi_dashboard_v2');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      {
        kind: 'chart' as const,
        config: {
          ...createDefaultChart('chart_1'),
          title: 'DMS DL ≥ 8 Mbps',
          yMetrics: [{ kpi: 'dms_dl_8' as any, aggregation: 'AVG', axis: 'left' as const, chartType: 'line' as const, color: 'hsl(262, 83%, 58%)', showMovingAvg: false, smoothCurve: true }],
          advanced: { thresholds: [{ value: 65, label: 'Seuil', color: 'hsl(0, 72%, 60%)' }], highlightAnomalies: false, sortByValue: false, topN: null, showLegend: false },
        },
        layout: { x: 0, y: 0, w: 6, h: 4 },
      },
      {
        kind: 'chart' as const,
        config: {
          ...createDefaultChart('chart_2'),
          title: 'QoE Index',
          yMetrics: [{ kpi: 'qoe_index' as any, aggregation: 'AVG', axis: 'left' as const, chartType: 'line' as const, color: 'hsl(210, 100%, 56%)', showMovingAvg: false, smoothCurve: true }],
          advanced: { thresholds: [{ value: 70, label: 'Seuil', color: 'hsl(0, 72%, 60%)' }], highlightAnomalies: false, sortByValue: false, topN: null, showLegend: false },
        },
        layout: { x: 6, y: 0, w: 6, h: 4 },
      },
      {
        kind: 'chart' as const,
        config: { ...createDefaultChart('chart_3'), title: 'Throughput DL', yMetrics: [{ kpi: 'debit_dl' as any, aggregation: 'AVG', axis: 'left' as const, chartType: 'area' as const, color: 'hsl(160, 84%, 39%)', showMovingAvg: false, smoothCurve: true }] },
        layout: { x: 0, y: 4, w: 4, h: 4 },
      },
      {
        kind: 'chart' as const,
        config: { ...createDefaultChart('chart_4'), title: 'RTT Data', yMetrics: [{ kpi: 'rtt_data_avg' as any, aggregation: 'AVG', axis: 'left' as const, chartType: 'bar' as const, color: 'hsl(25, 95%, 53%)', showMovingAvg: false, smoothCurve: false }] },
        layout: { x: 4, y: 4, w: 4, h: 4 },
      },
      {
        kind: 'chart' as const,
        config: { ...createDefaultChart('chart_5'), title: 'Sessions', yMetrics: [{ kpi: 'session_nbr' as any, aggregation: 'SUM', axis: 'left' as const, chartType: 'kpi_card' as const, color: 'hsl(187, 92%, 39%)', showMovingAvg: false, smoothCurve: false }] },
        layout: { x: 8, y: 4, w: 4, h: 4 },
      },
    ];
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAI, setShowAI] = useState(false);
  const [containerWidth, setContainerWidth] = useState(1200);

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const getId = (w: WidgetItem) => w.config.id;

  const layout = widgets.map(w => ({
    i: getId(w),
    x: w.layout.x, y: w.layout.y,
    w: w.layout.w, h: w.layout.h,
    minW: w.kind === 'text' ? 2 : 3,
    minH: w.kind === 'text' ? 1 : 2,
  }));

  const onLayoutChange = (newLayout: any[]) => {
    setWidgets(prev => prev.map(w => {
      const l = newLayout.find(n => n.i === getId(w));
      if (!l) return w;
      return { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } };
    }));
  };

  const getMaxY = () => widgets.reduce((max, w) => Math.max(max, w.layout.y + w.layout.h), 0);

  const addChart = () => {
    const id = `chart_${Date.now()}`;
    setWidgets(prev => [...prev, { kind: 'chart', config: createDefaultChart(id), layout: { x: 0, y: getMaxY(), w: 6, h: 4 } }]);
  };

  const addText = () => {
    const id = `text_${Date.now()}`;
    setWidgets(prev => [...prev, { kind: 'text', config: createDefaultTextWidget(id), layout: { x: 0, y: getMaxY(), w: 4, h: 2 } }]);
  };

  const duplicateWidget = (id: string) => {
    const source = widgets.find(w => getId(w) === id);
    if (!source) return;
    const newId = `${source.kind}_${Date.now()}`;
    if (source.kind === 'chart') {
      setWidgets(prev => [...prev, {
        kind: 'chart',
        config: { ...source.config, id: newId, title: source.config.title + ' (copy)' },
        layout: { ...source.layout, y: getMaxY() },
      }]);
    } else {
      setWidgets(prev => [...prev, {
        kind: 'text',
        config: { ...(source.config as TextWidgetConfig), id: newId },
        layout: { ...source.layout, y: getMaxY() },
      }]);
    }
  };

  const deleteWidget = (id: string) => {
    setWidgets(prev => prev.filter(w => getId(w) !== id));
    if (editingId === id) setEditingId(null);
  };

  const updateChartConfig = (id: string, config: ChartConfig) => {
    setWidgets(prev => prev.map(w => getId(w) === id && w.kind === 'chart' ? { ...w, config } : w));
  };

  const updateTextConfig = (id: string, config: TextWidgetConfig) => {
    setWidgets(prev => prev.map(w => getId(w) === id && w.kind === 'text' ? { ...w, config } : w));
  };

  const saveDashboard = () => {
    localStorage.setItem('bi_dashboard_v2', JSON.stringify(widgets));
  };

  const loadDashboard = () => {
    try {
      const saved = localStorage.getItem('bi_dashboard_v2');
      if (saved) setWidgets(JSON.parse(saved));
    } catch {}
  };

  const editingChart = widgets.find(w => getId(w) === editingId && w.kind === 'chart');
  const chartCount = widgets.filter(w => w.kind === 'chart').length;
  const textCount = widgets.filter(w => w.kind === 'text').length;

  return (
    <div className="flex-1 flex overflow-hidden bg-background">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/50">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Analytic BI Studio</span>
            <span className="text-[10px] text-muted-foreground font-mono ml-2">{chartCount} chart(s){textCount > 0 ? ` · ${textCount} text(s)` : ''}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={addChart} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity">
              <Plus className="w-3 h-3" /> Add Chart
            </button>
            <button onClick={addText} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-secondary text-secondary-foreground text-xs font-medium hover:opacity-90 transition-opacity">
              <Type className="w-3 h-3" /> Add Text
            </button>
            <button onClick={saveDashboard} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-muted text-foreground text-xs hover:bg-muted/80">
              <Save className="w-3 h-3" /> Save
            </button>
            <button onClick={loadDashboard} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-muted text-foreground text-xs hover:bg-muted/80">
              <FolderOpen className="w-3 h-3" /> Load
            </button>
            <button onClick={() => { setShowAI(!showAI); setEditingId(null); }}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${showAI ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/80'}`}>
              <Sparkles className="w-3 h-3" /> AI Assistant
            </button>
          </div>
        </div>

        {/* Grid */}
        <div ref={containerRef} className="flex-1 overflow-auto p-4">
          {widgets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[50vh] gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <LayoutGrid className="w-8 h-8 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">Click <strong>Add Chart</strong> or <strong>Add Text</strong> to start</p>
            </div>
          ) : (
            <GridLayout
              className="layout"
              layout={layout}
              cols={COLS}
              rowHeight={ROW_HEIGHT}
              width={containerWidth}
              onLayoutChange={onLayoutChange}
              draggableHandle=".drag-handle"
              compactType="vertical"
              isResizable
              isDraggable
              margin={[12, 12]}
            >
              {widgets.map(w => (
                <div key={getId(w)}>
                  {w.kind === 'chart' ? (
                    <BIChartCard
                      config={w.config as ChartConfig}
                      onEdit={() => { setEditingId(getId(w)); setShowAI(false); }}
                      onDuplicate={() => duplicateWidget(getId(w))}
                      onDelete={() => deleteWidget(getId(w))}
                    />
                  ) : (
                    <BITextWidget
                      config={w.config as TextWidgetConfig}
                      onChange={cfg => updateTextConfig(getId(w), cfg)}
                      onDelete={() => deleteWidget(getId(w))}
                    />
                  )}
                </div>
              ))}
            </GridLayout>
          )}
        </div>
      </div>

      {/* Side panel */}
      {editingChart && editingChart.kind === 'chart' && (
        <ChartConfigPanel
          config={editingChart.config as ChartConfig}
          onChange={cfg => updateChartConfig(getId(editingChart), cfg)}
          onClose={() => setEditingId(null)}
        />
      )}
      {showAI && (
        <AIAssistantPanel
          charts={widgets.filter(w => w.kind === 'chart').map(w => w.config as ChartConfig)}
          onClose={() => setShowAI(false)}
          onApplySuggestion={() => {}}
        />
      )}
    </div>
  );
};

export default AnalyticBIStudio;
