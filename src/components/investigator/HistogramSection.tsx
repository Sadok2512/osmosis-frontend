import React, { useState, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import { BarChart3, ChevronRight, Search, RefreshCw, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HistogramDef {
  id: number;
  name: string;
  vendor: string;
  techno: string;
  category: string;
  source: string;
  counter_pattern: string;
  bin_count: number | null;
  unit: string;
  chart_type: string;
  description: string;
}

interface HistogramBin {
  index: number;
  label: string;
  count: number;
  counter?: string;
}

interface Props {
  dateFrom: string;
  dateTo: string;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899'];

const HistogramSection: React.FC<Props> = ({ dateFrom, dateTo }) => {
  const [catalog, setCatalog] = useState<HistogramDef[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [bins, setBins] = useState<HistogramBin[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [siteName, setSiteName] = useState('');
  const [filterVendor, setFilterVendor] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [search, setSearch] = useState('');
  const [histName, setHistName] = useState('');
  const [histUnit, setHistUnit] = useState('');

  // Load catalog
  useEffect(() => {
    setLoadingCatalog(true);
    fetch(getApiUrl('pm/histograms/catalog'), { headers: getApiHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(data => { setCatalog(data); setLoadingCatalog(false); })
      .catch(() => setLoadingCatalog(false));
  }, []);

  // Fetch histogram data
  useEffect(() => {
    if (!selectedId) { setBins([]); return; }
    setLoading(true);
    fetch(getApiUrl('pm/histograms/data'), {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({
        histogram_id: selectedId,
        site_name: siteName || undefined,
        date_from: dateFrom,
        date_to: dateTo,
      }),
    })
      .then(r => r.ok ? r.json() : { bins: [] })
      .then(data => {
        setBins(data.bins || []);
        setHistName(data.name || '');
        setHistUnit(data.unit || '');
        setLoading(false);
      })
      .catch(() => { setBins([]); setLoading(false); });
  }, [selectedId, siteName, dateFrom, dateTo]);

  // Categories
  const categories = useMemo(() => {
    const cats = new Map<string, number>();
    let items = catalog;
    if (filterVendor) items = items.filter(h => h.vendor === filterVendor);
    for (const h of items) cats.set(h.category || 'Other', (cats.get(h.category || 'Other') || 0) + 1);
    return cats;
  }, [catalog, filterVendor]);

  const vendors = useMemo(() => {
    const vs = new Set<string>();
    for (const h of catalog) vs.add(h.vendor);
    return Array.from(vs).sort();
  }, [catalog]);

  // Filtered list
  const filtered = useMemo(() => {
    let items = catalog;
    if (filterVendor) items = items.filter(h => h.vendor === filterVendor);
    if (filterCategory) items = items.filter(h => h.category === filterCategory);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(h => h.name.toLowerCase().includes(q) || h.counter_pattern?.toLowerCase().includes(q));
    }
    return items;
  }, [catalog, filterVendor, filterCategory, search]);

  // Chart
  const chartOption = bins.length > 0 ? {
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: 'rgba(15,23,42,0.95)',
      borderColor: 'rgba(255,255,255,0.08)',
      textStyle: { color: '#f8fafc', fontSize: 10 },
    },
    grid: { left: 60, right: 20, top: 10, bottom: 50 },
    xAxis: {
      type: 'category' as const,
      data: bins.map(b => b.label),
      axisLabel: { color: '#6b7280', fontSize: 8, rotate: bins.length > 20 ? 45 : 0, interval: bins.length > 50 ? Math.floor(bins.length / 20) : 0 },
      axisLine: { lineStyle: { color: '#374151' } },
    },
    yAxis: {
      type: 'value' as const,
      name: histUnit || 'Count',
      nameTextStyle: { color: '#6b7280', fontSize: 9 },
      axisLabel: {
        color: '#6b7280', fontSize: 9,
        formatter: (v: number) => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : v.toString(),
      },
      splitLine: { lineStyle: { color: 'rgba(55,65,81,0.3)' } },
    },
    series: [{
      type: 'bar' as const,
      data: bins.map((b, i) => ({
        value: b.count,
        itemStyle: { color: COLORS[0], borderRadius: [2, 2, 0, 0] },
      })),
      barMaxWidth: 40,
    }],
  } : null;

  return (
    <section className="space-y-4">
      <div className="flex gap-4" style={{ minHeight: 400 }}>
        {/* Left: Histogram catalog */}
        <div className="w-[280px] shrink-0 rounded-xl border border-border/60 bg-card overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-3 py-2.5 border-b border-border/40 bg-muted/20">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-3.5 h-3.5 text-cyan-500" />
              <span className="text-[11px] font-bold text-foreground">Histogrammes</span>
              <span className="text-[9px] text-muted-foreground ml-auto">{catalog.length}</span>
            </div>
            {/* Vendor filter */}
            <div className="flex gap-1 mb-1.5">
              <button
                onClick={() => { setFilterVendor(''); setFilterCategory(''); }}
                className={cn('px-2 py-0.5 rounded text-[9px] font-bold transition-all', !filterVendor ? 'bg-cyan-600 text-white' : 'bg-muted text-muted-foreground hover:text-foreground')}
              >Tous</button>
              {vendors.map(v => (
                <button
                  key={v}
                  onClick={() => { setFilterVendor(v); setFilterCategory(''); }}
                  className={cn('px-2 py-0.5 rounded text-[9px] font-bold transition-all', filterVendor === v ? 'bg-cyan-600 text-white' : 'bg-muted text-muted-foreground hover:text-foreground')}
                >{v}</button>
              ))}
            </div>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher..."
                className="w-full pl-7 pr-2 py-1 rounded border border-border bg-background text-[10px] outline-none focus:ring-1 focus:ring-cyan-500/30"
              />
            </div>
          </div>

          {/* Category + items */}
          <div className="flex-1 overflow-y-auto">
            {loadingCatalog ? (
              <div className="flex items-center justify-center h-20 text-[10px] text-muted-foreground animate-pulse">Chargement...</div>
            ) : (
              <>
                {/* Categories */}
                {!filterCategory && Array.from(categories.entries()).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat)}
                    className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-medium text-foreground hover:bg-muted/30 border-b border-border/20 transition-colors"
                  >
                    <span className="truncate">{cat}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[9px] text-muted-foreground">{count}</span>
                      <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
                    </div>
                  </button>
                ))}

                {/* Items in selected category */}
                {filterCategory && (
                  <>
                    <button
                      onClick={() => setFilterCategory('')}
                      className="w-full text-left px-3 py-1.5 text-[10px] text-cyan-600 font-bold hover:underline border-b border-border/20"
                    >
                      ← {filterCategory}
                    </button>
                    {filtered.map(h => (
                      <button
                        key={h.id}
                        onClick={() => setSelectedId(h.id)}
                        className={cn(
                          'w-full text-left px-3 py-2 border-b border-border/10 transition-all',
                          selectedId === h.id ? 'bg-cyan-500/10 border-l-2 border-l-cyan-500' : 'hover:bg-muted/20'
                        )}
                      >
                        <p className="text-[10px] font-semibold text-foreground truncate">{h.name}</p>
                        <p className="text-[9px] text-muted-foreground truncate">{h.counter_pattern}</p>
                        <div className="flex gap-1 mt-0.5">
                          <span className={cn('text-[8px] px-1 py-0.5 rounded font-medium', h.vendor === 'Ericsson' ? 'bg-blue-500/10 text-blue-400' : 'bg-orange-500/10 text-orange-400')}>{h.vendor}</span>
                          <span className="text-[8px] px-1 py-0.5 rounded bg-muted text-muted-foreground">{h.source}</span>
                          {h.unit && <span className="text-[8px] px-1 py-0.5 rounded bg-cyan-500/10 text-cyan-500">{h.unit}</span>}
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right: Chart */}
        <div className="flex-1 rounded-xl border border-border/60 bg-card overflow-hidden flex flex-col">
          {/* Toolbar */}
          <div className="px-4 py-2.5 border-b border-border/40 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={siteName}
                onChange={e => setSiteName(e.target.value)}
                placeholder="Site name (optional)"
                className="w-[180px] px-2 py-1 rounded border border-border bg-background text-[10px] outline-none focus:ring-1 focus:ring-cyan-500/30"
              />
            </div>
            {histName && (
              <span className="text-[11px] font-bold text-foreground ml-auto">{histName}</span>
            )}
            {histUnit && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-500 font-medium">{histUnit}</span>
            )}
            {bins.length > 0 && (
              <span className="text-[9px] text-muted-foreground">{bins.length} bins</span>
            )}
          </div>

          {/* Chart area */}
          <div className="flex-1 p-4">
            {loading ? (
              <div className="flex items-center justify-center h-full gap-2 text-muted-foreground text-xs">
                <RefreshCw className="w-4 h-4 animate-spin" /> Chargement...
              </div>
            ) : chartOption ? (
              <ReactECharts option={chartOption} style={{ height: '100%', minHeight: 300 }} />
            ) : selectedId ? (
              <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                Aucune donnée pour la période sélectionnée
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <BarChart3 className="w-12 h-12 text-cyan-500/20" />
                <p className="text-sm font-semibold text-muted-foreground">Sélectionnez un histogramme</p>
                <p className="text-[10px] text-muted-foreground max-w-md">
                  Choisissez une catégorie puis un histogramme pour afficher la distribution des compteurs PM
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HistogramSection;
