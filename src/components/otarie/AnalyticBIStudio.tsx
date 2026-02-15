import React, { useState, useCallback } from 'react';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { Plus, Save, FolderOpen, Sparkles, LayoutGrid } from 'lucide-react';
import { Filters } from '../../types';
import { ChartConfig, DashboardChart, Dashboard, createDefaultChart } from '../bi/biTypes';
import BIChartCard from '../bi/BIChartCard';
import ChartConfigPanel from '../bi/ChartConfigPanel';
import AIAssistantPanel from '../bi/AIAssistantPanel';

const COLS = 12;
const ROW_HEIGHT = 80;

const AnalyticBIStudio: React.FC<{ filters: Filters }> = ({ filters }) => {
  const [charts, setCharts] = useState<DashboardChart[]>(() => {
    // Load saved dashboard
    try {
      const saved = localStorage.getItem('bi_dashboard');
      if (saved) return JSON.parse(saved);
    } catch {}
    // Default: 2 starter charts
    return [
      { config: createDefaultChart('chart_1'), layout: { x: 0, y: 0, w: 6, h: 4 } },
      {
        config: {
          ...createDefaultChart('chart_2'),
          title: 'Throughput DL',
          yMetrics: [{
            kpi: 'debit_dl' as any, aggregation: 'AVG', axis: 'left' as const,
            chartType: 'area' as const, color: 'hsl(160, 84%, 39%)', showMovingAvg: false, smoothCurve: true,
          }],
        },
        layout: { x: 6, y: 0, w: 6, h: 4 },
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

  const layout = charts.map((c, i) => ({
    i: c.config.id,
    x: c.layout.x, y: c.layout.y,
    w: c.layout.w, h: c.layout.h,
    minW: 3, minH: 2,
  }));

  const onLayoutChange = (newLayout: any[]) => {
    setCharts(prev => prev.map(c => {
      const l = newLayout.find(n => n.i === c.config.id);
      if (!l) return c;
      return { ...c, layout: { x: l.x, y: l.y, w: l.w, h: l.h } };
    }));
  };

  const addChart = () => {
    const id = `chart_${Date.now()}`;
    const maxY = charts.reduce((max, c) => Math.max(max, c.layout.y + c.layout.h), 0);
    setCharts(prev => [...prev, { config: createDefaultChart(id), layout: { x: 0, y: maxY, w: 6, h: 4 } }]);
  };

  const duplicateChart = (id: string) => {
    const source = charts.find(c => c.config.id === id);
    if (!source) return;
    const newId = `chart_${Date.now()}`;
    const maxY = charts.reduce((max, c) => Math.max(max, c.layout.y + c.layout.h), 0);
    setCharts(prev => [...prev, {
      config: { ...source.config, id: newId, title: source.config.title + ' (copy)' },
      layout: { ...source.layout, y: maxY },
    }]);
  };

  const deleteChart = (id: string) => {
    setCharts(prev => prev.filter(c => c.config.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const updateChartConfig = (id: string, config: ChartConfig) => {
    setCharts(prev => prev.map(c => c.config.id === id ? { ...c, config } : c));
  };

  const saveDashboard = () => {
    localStorage.setItem('bi_dashboard', JSON.stringify(charts));
  };

  const loadDashboard = () => {
    try {
      const saved = localStorage.getItem('bi_dashboard');
      if (saved) setCharts(JSON.parse(saved));
    } catch {}
  };

  const editingChart = charts.find(c => c.config.id === editingId);

  // Actual grid width excludes the side panel
  const gridWidth = containerWidth;

  return (
    <div className="flex-1 flex overflow-hidden bg-background">
      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/50">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Analytic BI Studio</span>
            <span className="text-[10px] text-muted-foreground font-mono ml-2">{charts.length} chart(s)</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={addChart} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity">
              <Plus className="w-3 h-3" /> Add Chart
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
          {charts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[50vh] gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <LayoutGrid className="w-8 h-8 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">Click <strong>Add Chart</strong> to start building your dashboard</p>
            </div>
          ) : (
            <GridLayout
              className="layout"
              layout={layout}
              cols={COLS}
              rowHeight={ROW_HEIGHT}
              width={gridWidth}
              onLayoutChange={onLayoutChange}
              draggableHandle=".drag-handle"
              compactType="vertical"
              isResizable
              isDraggable
              margin={[12, 12]}
            >
              {charts.map(c => (
                <div key={c.config.id}>
                  <BIChartCard
                    config={c.config}
                    onEdit={() => { setEditingId(c.config.id); setShowAI(false); }}
                    onDuplicate={() => duplicateChart(c.config.id)}
                    onDelete={() => deleteChart(c.config.id)}
                  />
                </div>
              ))}
            </GridLayout>
          )}
        </div>
      </div>

      {/* Side panel */}
      {editingChart && (
        <ChartConfigPanel
          config={editingChart.config}
          onChange={cfg => updateChartConfig(editingChart.config.id, cfg)}
          onClose={() => setEditingId(null)}
        />
      )}
      {showAI && (
        <AIAssistantPanel
          charts={charts.map(c => c.config)}
          onClose={() => setShowAI(false)}
          onApplySuggestion={() => {}}
        />
      )}
    </div>
  );
};

export default AnalyticBIStudio;
