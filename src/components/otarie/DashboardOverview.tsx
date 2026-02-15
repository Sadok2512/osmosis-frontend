import React, { useState, useMemo } from 'react';
import { LayoutDashboard, Clock, Eye, ChevronLeft } from 'lucide-react';
import { SavedDashboard } from '../bi/DashboardManager';
import { WidgetItem } from '../bi/dashboardTypes';
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
    default:
      return null;
  }
};

const DashboardOverview: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dashboards = useMemo(() => loadAllDashboards(), []);

  const selected = useMemo(() => dashboards.find(d => d.id === selectedId), [dashboards, selectedId]);

  if (selected) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-card">
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
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-border bg-card">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <LayoutDashboard className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">Dashboard Overview</h1>
          <p className="text-[11px] text-muted-foreground">Consultation des dashboards • Lecture seule</p>
        </div>
      </div>

      {/* Dashboard list */}
      <div className="flex-1 overflow-auto p-6">
        {dashboards.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <LayoutDashboard className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-sm font-semibold text-foreground mb-1">Aucun dashboard disponible</h3>
            <p className="text-xs text-muted-foreground max-w-xs">
              Créez des dashboards dans l'Analytic BI Studio pour les retrouver ici en lecture seule.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {dashboards.map(db => (
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
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(db.updatedAt).toLocaleString('fr-FR')}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                    {db.widgets.length} widget{db.widgets.length > 1 ? 's' : ''}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardOverview;
