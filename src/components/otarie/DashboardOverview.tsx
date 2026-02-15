import React, { useState, useMemo } from 'react';
import { LayoutDashboard, Clock, Eye, ChevronLeft, Table2, Search, User, BarChart2, Type, ImageIcon, Map as MapIcon, LayoutGrid, List } from 'lucide-react';
import { SavedDashboard } from '../bi/DashboardManager';
import { WidgetItem } from '../bi/dashboardTypes';
import { TableWidgetConfig } from '../bi/BITableWidget';
import { KPI_UNITS } from '../bi/biTypes';
import { getDimensionValues } from '../bi/mockBIData';
import BIChartRenderer from '../bi/BIChartRenderer';

const LS_KEY = 'bi_dashboards_v3';

function loadAllDashboards(): SavedDashboard[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

/** Read-only renderer for a single text widget */
const ReadOnlyText: React.FC<{ config: any }> = ({ config }) => (
  <div
    className="w-full h-full flex items-start p-3 overflow-auto rounded-xl"
    style={{
      backgroundColor: config.bgColor || 'transparent',
      color: config.color || 'hsl(var(--foreground))',
      fontSize: config.fontSize || 14,
      fontWeight: config.fontWeight || 'normal',
      fontStyle: config.fontStyle || 'normal',
      textAlign: config.textAlign || 'left',
    }}
  >
    <span className="whitespace-pre-wrap">{config.content}</span>
  </div>
);

/** Read-only renderer for image widget */
const ReadOnlyImage: React.FC<{ config: any }> = ({ config }) => (
  <div className="w-full h-full flex items-center justify-center rounded-xl overflow-hidden"
    style={{ backgroundColor: config.bgColor || 'transparent' }}>
    {config.src ? (
      <img src={config.src} alt={config.alt || 'Image'}
        className="max-w-full max-h-full"
        style={{ objectFit: config.objectFit || 'contain', borderRadius: config.borderRadius || 0 }} />
    ) : (
      <span className="text-xs text-muted-foreground">No image</span>
    )}
  </div>
);

/** Read-only renderer for map widget - simplified static placeholder */
const ReadOnlyMap: React.FC<{ config: any }> = ({ config }) => (
  <div className="w-full h-full flex items-center justify-center rounded-xl bg-muted/30 border border-border">
    <div className="text-center text-muted-foreground">
      <LayoutDashboard className="w-8 h-8 mx-auto mb-2 opacity-40" />
      <p className="text-xs font-medium">{config.title || 'Map Widget'}</p>
      <p className="text-[10px] opacity-60">Carte interactive (lecture seule)</p>
    </div>
  </div>
);

/** Read-only table renderer */
const ReadOnlyTable: React.FC<{ config: TableWidgetConfig }> = ({ config }) => {
  // Simple seeded random for stable data
  const rng = (() => { let s = config.id.charCodeAt(0) * 100 + config.kpis.length; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();
  const dimValues = getDimensionValues(config.dimension);
  const kpiRanges: Record<string, [number, number]> = {
    volume_totale: [50, 500], debit_dl: [10, 150], debit_ul: [5, 80], dms_dl_3: [60, 99], dms_dl_8: [40, 95], dms_dl_30: [10, 70],
    dms_ul_1: [70, 99], dms_ul_3: [50, 95], dms_ul_5: [30, 85], qoe_index: [500, 900], rtt_setup_avg: [10, 80], rtt_data_avg: [15, 100],
    loss_dl_rate: [0, 5], loss_ul_rate: [0, 5], session_nbr: [1000, 50000], session_dcr: [0, 5],
  };
  const data = dimValues.map(dim => {
    const row: Record<string, any> = { dimension: dim };
    for (const kpi of config.kpis) { const [min, max] = kpiRanges[kpi] || [0, 100]; row[kpi] = +(min + rng() * (max - min)).toFixed(2); }
    return row;
  });

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30 shrink-0">
        <Table2 className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-semibold text-foreground">{config.title}</span>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left" style={{ fontSize: config.fontSize || 11 }}>
          <thead className="sticky top-0 bg-muted/60">
            <tr>
              <th className="px-3 py-1.5 font-bold text-foreground border-b border-border">{config.dimension}</th>
              {config.kpis.map(kpi => (
                <th key={kpi} className="px-3 py-1.5 font-bold text-foreground border-b border-border text-right whitespace-nowrap">
                  {kpi.replace(/_/g, ' ')}{KPI_UNITS[kpi] ? ` (${KPI_UNITS[kpi]})` : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className={config.striped && i % 2 === 1 ? 'bg-muted/20' : ''}>
                <td className="px-3 py-1 font-medium text-foreground border-b border-border/50">{row.dimension}</td>
                {config.kpis.map(kpi => (
                  <td key={kpi} className="px-3 py-1 text-right font-mono border-b border-border/50">{row[kpi]?.toLocaleString('fr-FR')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/** Read-only widget renderer */
const ReadOnlyWidget: React.FC<{ widget: WidgetItem }> = ({ widget }) => {
  switch (widget.kind) {
    case 'chart':
      return (
        <div className="w-full h-full">
          <BIChartRenderer config={widget.config} />
        </div>
      );
    case 'text':
      return <ReadOnlyText config={widget.config} />;
    case 'image':
      return <ReadOnlyImage config={widget.config} />;
    case 'map':
      return <ReadOnlyMap config={widget.config} />;
    case 'table':
      return <ReadOnlyTable config={widget.config as TableWidgetConfig} />;
    default:
      return null;
  }
};

const DashboardOverview: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const dashboards = useMemo(() => loadAllDashboards(), []);

  const filtered = useMemo(() => {
    if (!search.trim()) return dashboards;
    const q = search.toLowerCase();
    return dashboards.filter(d => d.name.toLowerCase().includes(q));
  }, [dashboards, search]);

  const selected = useMemo(() => dashboards.find(d => d.id === selectedId), [dashboards, selectedId]);

  const getWidgetBreakdown = (db: SavedDashboard) => {
    const counts = { chart: 0, text: 0, map: 0, image: 0, table: 0 };
    db.widgets.forEach(w => { if (w.kind in counts) counts[w.kind as keyof typeof counts]++; });
    return counts;
  };

  if (selected) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedId(null)}
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <LayoutDashboard className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-sm font-bold text-foreground">{selected.name}</h2>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Dernière modification : {new Date(selected.updatedAt).toLocaleString('fr-FR')}
                <span className="ml-2 px-1.5 py-0.5 rounded bg-muted text-[9px] font-semibold uppercase tracking-wider">Lecture seule</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <User className="w-3.5 h-3.5" />
            <span className="font-semibold text-foreground">PSN TEAM</span>
          </div>
        </div>

        {/* Widgets grid */}
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-12 gap-4" style={{ gridAutoRows: '80px' }}>
            {selected.widgets.map((widget, idx) => {
              const w = Math.min(widget.layout.w, 12);
              const h = widget.layout.h;
              return (
                <div
                  key={idx}
                  className="bg-card border border-border rounded-xl overflow-hidden shadow-sm min-w-0"
                  style={{
                    gridColumn: `span ${w}`,
                    gridRow: `span ${h}`,
                  }}
                >
                  <ReadOnlyWidget widget={widget} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Header with search */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <LayoutDashboard className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Dashboard Overview</h1>
            <p className="text-[11px] text-muted-foreground">Consultation des dashboards • Lecture seule</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rechercher un dashboard..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-2 rounded-lg border border-border bg-background text-xs text-foreground w-[220px] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
            />
          </div>
          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-border overflow-hidden">
            <button onClick={() => setViewMode('grid')}
              className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}
              title="Grille">
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setViewMode('list')}
              className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}
              title="Liste">
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
          {/* User */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
            <User className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground">PSN TEAM</span>
          </div>
        </div>
      </div>

      {/* Dashboard grid */}
      <div className="flex-1 overflow-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <LayoutDashboard className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-sm font-semibold text-foreground mb-1">
              {dashboards.length === 0 ? 'Aucun dashboard disponible' : 'Aucun résultat'}
            </h3>
            <p className="text-xs text-muted-foreground max-w-xs">
              {dashboards.length === 0
                ? "Créez des dashboards dans l'Analytic BI Studio pour les retrouver ici en lecture seule."
                : 'Essayez un autre terme de recherche.'}
            </p>
          </div>
        ) : (
          viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map(db => {
                const counts = getWidgetBreakdown(db);
                return (
                  <button
                    key={db.id}
                    onClick={() => setSelectedId(db.id)}
                    className="group text-left bg-card border border-border rounded-xl p-5 hover:border-primary/40 hover:shadow-lg transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                        <LayoutDashboard className="w-4 h-4 text-primary" />
                      </div>
                      <Eye className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <h3 className="text-sm font-semibold text-foreground mb-1 truncate">{db.name}</h3>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1 mb-1">
                      <Clock className="w-3 h-3" />
                      {new Date(db.updatedAt).toLocaleString('fr-FR')}
                    </p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1 mb-3">
                      <User className="w-3 h-3" />
                      PSN TEAM
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                        {db.widgets.length} widget{db.widgets.length > 1 ? 's' : ''}
                      </span>
                      {counts.chart > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium flex items-center gap-0.5">
                          <BarChart2 className="w-2.5 h-2.5" /> {counts.chart}
                        </span>
                      )}
                      {counts.table > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium flex items-center gap-0.5">
                          <Table2 className="w-2.5 h-2.5" /> {counts.table}
                        </span>
                      )}
                      {counts.map > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium flex items-center gap-0.5">
                          <MapIcon className="w-2.5 h-2.5" /> {counts.map}
                        </span>
                      )}
                      {counts.text > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium flex items-center gap-0.5">
                          <Type className="w-2.5 h-2.5" /> {counts.text}
                        </span>
                      )}
                      {counts.image > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium flex items-center gap-0.5">
                          <ImageIcon className="w-2.5 h-2.5" /> {counts.image}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            /* List view */
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_160px_120px_200px_60px] gap-2 px-4 py-2.5 bg-muted/40 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                <span>Nom</span>
                <span>Dernière modification</span>
                <span>Utilisateur</span>
                <span>Widgets</span>
                <span className="text-center">Action</span>
              </div>
              {/* Rows */}
              {filtered.map(db => {
                const counts = getWidgetBreakdown(db);
                return (
                  <button
                    key={db.id}
                    onClick={() => setSelectedId(db.id)}
                    className="w-full grid grid-cols-[1fr_160px_120px_200px_60px] gap-2 items-center px-4 py-3 border-b border-border/50 hover:bg-muted/30 transition-colors text-left group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <LayoutDashboard className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <span className="text-xs font-semibold text-foreground truncate">{db.name}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3 shrink-0" />
                      {new Date(db.updatedAt).toLocaleString('fr-FR')}
                    </span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <User className="w-3 h-3 shrink-0" />
                      PSN TEAM
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                        {db.widgets.length} total
                      </span>
                      {counts.chart > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium flex items-center gap-0.5">
                          <BarChart2 className="w-2.5 h-2.5" /> {counts.chart}
                        </span>
                      )}
                      {counts.table > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium flex items-center gap-0.5">
                          <Table2 className="w-2.5 h-2.5" /> {counts.table}
                        </span>
                      )}
                      {counts.map > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium flex items-center gap-0.5">
                          <MapIcon className="w-2.5 h-2.5" /> {counts.map}
                        </span>
                      )}
                      {counts.text > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium flex items-center gap-0.5">
                          <Type className="w-2.5 h-2.5" /> {counts.text}
                        </span>
                      )}
                      {counts.image > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium flex items-center gap-0.5">
                          <ImageIcon className="w-2.5 h-2.5" /> {counts.image}
                        </span>
                      )}
                    </div>
                    <div className="flex justify-center">
                      <Eye className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default DashboardOverview;
