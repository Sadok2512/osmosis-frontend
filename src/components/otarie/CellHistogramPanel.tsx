/**
 * Cell Histogram Panel — shows PRB DL/UL, RACH bins, UL Interference
 * distribution charts in the site/cell detail sidebar.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { BarChart3, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';

interface HistogramConfig {
  id: string;
  name: string;
  vendor: string;
  techno: string;
  category: string;
  unit: string;
}

interface HistogramBin {
  index: number;
  label: string;
  count: number;
}

interface Props {
  siteName?: string;
  cellName?: string;
  vendor?: string;
  techno?: string;
  dateFrom?: string;
  dateTo?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  PRB: '#3b82f6',
  RACH: '#f59e0b',
  Interference: '#ef4444',
};

const CellHistogramPanel: React.FC<Props> = ({ siteName, cellName, vendor, techno, dateFrom, dateTo }) => {
  const [catalog, setCatalog] = useState<HistogramConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [histData, setHistData] = useState<Record<string, HistogramBin[]>>({});
  const [histLoading, setHistLoading] = useState<Set<string>>(new Set());

  // Fetch histogram catalog
  const [catalogLoading, setCatalogLoading] = useState(true);
  useEffect(() => {
    setCatalogLoading(true);
    const fetchCatalog = async () => {
      try {
        const params = new URLSearchParams();
        if (vendor) params.set('vendor', vendor);
        const url = getApiUrl(`pm/histograms/catalog?${params}`);
        console.log('[Histogram] Fetching catalog:', url);
        const res = await fetch(url, { headers: getApiHeaders() });
        if (res.ok) {
          const data = await res.json();
          console.log('[Histogram] Catalog loaded:', data?.length, 'items');
          setCatalog(Array.isArray(data) ? data : []);
        } else {
          console.warn('[Histogram] Catalog fetch failed:', res.status, await res.text().catch(() => ''));
        }
      } catch (err) {
        console.warn('[Histogram] Catalog error:', err);
      }
      setCatalogLoading(false);
    };
    fetchCatalog();
  }, [vendor]);

  // Filter catalog by techno
  const filteredCatalog = useMemo(() => {
    if (!techno) return catalog;
    const t = techno.toUpperCase();
    const rat = t.includes('5G') || t === 'NR' ? '5G' : t.includes('3G') || t === 'UMTS' ? '3G' : t.includes('2G') || t === 'GSM' ? '2G' : '4G';
    return catalog.filter(h => h.techno === rat || h.techno === 'all');
  }, [catalog, techno]);

  // Group by category
  const grouped = useMemo(() => {
    const groups = new Map<string, HistogramConfig[]>();
    for (const h of filteredCatalog) {
      const cat = h.category || 'Other';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(h);
    }
    return groups;
  }, [filteredCatalog]);

  const fetchHistData = async (histId: string) => {
    if (histData[histId] || histLoading.has(histId)) return;
    setHistLoading(prev => new Set(prev).add(histId));
    try {
      const url = getApiUrl('pm/histograms/data');
      const body: any = {
        histogram_id: histId,
        date_from: dateFrom || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
        date_to: dateTo || new Date().toISOString().slice(0, 10),
      };
      if (siteName) body.site_name = siteName;
      // Don't filter by cellName — histogram data is site-level
      console.log('[Histogram] Fetching data:', { histId, ...body });
      const res = await fetch(url, {
        method: 'POST',
        headers: { ...getApiHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        console.log('[Histogram] Data loaded:', histId, data.bins?.length, 'bins');
        setHistData(prev => ({ ...prev, [histId]: data.bins || [] }));
      } else {
        console.warn('[Histogram] Data fetch failed:', res.status);
        setHistData(prev => ({ ...prev, [histId]: [] }));
      }
    } catch (err) {
      console.warn('[Histogram] Data error:', err);
      setHistData(prev => ({ ...prev, [histId]: [] }));
    }
    setHistLoading(prev => { const n = new Set(prev); n.delete(histId); return n; });
  };

  const toggleExpand = (histId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(histId)) { next.delete(histId); }
      else { next.add(histId); fetchHistData(histId); }
      return next;
    });
  };

  if (catalogLoading) {
    // Still loading or fetch failed — show placeholder
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-primary" />
          <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Distributions RF</span>
          <Loader2 size={10} className="animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }
  if (filteredCatalog.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <BarChart3 size={14} className="text-primary" />
        <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Analyse RF Spatiale</span>
      </div>

      {[...grouped.entries()].map(([category, histograms]) => (
        <div key={category} className="space-y-1">
          <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70 pl-1">{category}</div>
          {histograms.map(h => {
            const isOpen = expanded.has(h.id);
            const bins = histData[h.id];
            const isLoading = histLoading.has(h.id);
            const maxCount = bins ? Math.max(...bins.map(b => b.count), 1) : 1;
            const color = CATEGORY_COLORS[category] || '#6366f1';

            return (
              <div key={h.id} className="rounded-lg border border-border/40 overflow-hidden">
                <button
                  onClick={() => toggleExpand(h.id)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10px] font-semibold text-foreground hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    <span>{h.name}</span>
                    <span className="text-muted-foreground/50 font-normal">({h.unit})</span>
                  </div>
                  {isLoading ? <Loader2 size={10} className="animate-spin text-muted-foreground" /> :
                    isOpen ? <ChevronUp size={10} className="text-muted-foreground" /> : <ChevronDown size={10} className="text-muted-foreground" />}
                </button>

                {isOpen && bins && bins.length > 0 && (
                  <div className="px-2.5 pb-2 space-y-0.5">
                    {bins.map(bin => (
                      <div key={bin.index} className="flex items-center gap-1.5 text-[9px]">
                        <span className="w-16 truncate text-muted-foreground font-mono shrink-0">{bin.label}</span>
                        <div className="flex-1 h-3 bg-muted/30 rounded-sm overflow-hidden">
                          <div
                            className="h-full rounded-sm transition-all duration-300"
                            style={{
                              width: `${Math.max(1, (bin.count / maxCount) * 100)}%`,
                              backgroundColor: color,
                              opacity: 0.8,
                            }}
                          />
                        </div>
                        <span className="w-16 text-right font-mono font-bold text-foreground shrink-0">
                          {bin.count >= 1e6 ? `${(bin.count / 1e6).toFixed(1)}M` :
                           bin.count >= 1e3 ? `${(bin.count / 1e3).toFixed(1)}K` :
                           bin.count.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {isOpen && bins && bins.length === 0 && !isLoading && (
                  <div className="px-2.5 pb-2 text-[9px] text-muted-foreground italic">No data available</div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default CellHistogramPanel;
