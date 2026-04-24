import { useState, useMemo, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart2, Search, ChevronLeft, ChevronRight, Plus, X, Palette, Settings2, Loader2, Radio } from 'lucide-react';
import { getVpsProxyUrl, getVpsProxyHeaders } from '@/lib/apiConfig';

// ── Types ──
export type ViewType = 'kpi_overlay' | 'topology_search' | 'parameter' | 'coverage';
export type AnalysisLevel = 'site' | 'cell' | 'band';

export interface KpiThreshold {
  min: number;
  max: number;
  color: string;
}

export interface KpiOverlayItem {
  kpiKey: string;
  label: string;
  thresholds: KpiThreshold[];
}

export interface ViewConfig {
  name: string;
  type: ViewType;
  // KPI Overlay
  technology?: '4G' | '5G';
  level?: AnalysisLevel;
  kpis?: KpiOverlayItem[];
  dateFrom?: string;
  dateTo?: string;
  // Topology Search
  topoFilters?: Record<string, string>;
  // Parameter
  paramFilters?: Record<string, string>;
  // Coverage Prediction
  coverageBand?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (config: ViewConfig) => void;
  saving?: boolean;
  availableKpis?: { key: string; label: string; famille?: string; techno?: string; threshold_warning?: number | null; threshold_critical?: number | null }[];
}

const DEFAULT_THRESHOLDS: KpiThreshold[] = [
  { min: 0, max: 10, color: '#ef4444' },
  { min: 10, max: 50, color: '#f59e0b' },
  { min: 50, max: 100, color: '#22c55e' },
];

const TOPO_FILTER_KEYS = [
  { key: 'pci', label: 'PCI' },
  { key: 'eci', label: 'ECI' },
  { key: 'tac', label: 'TAC' },
  { key: 'earfcn', label: 'EARFCN' },
  { key: 'nrarfcn', label: 'NRARFCN' },
  { key: 'code_nidt', label: 'Code NIDT' },
  { key: 'nom_site', label: 'Nom Site' },
  { key: 'nom_cellule', label: 'Nom Cellule' },
];

const PARAM_FILTER_KEYS = [
  { key: 'parameter', label: 'Paramètre' },
  { key: 'site_name', label: 'Site' },
  { key: 'cell_name', label: 'Cellule' },
  { key: 'bande', label: 'Bande' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'value', label: 'Valeur' },
];

export function CreateViewModal({ open, onOpenChange, onSave, saving, availableKpis = [] }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [viewType, setViewType] = useState<ViewType | null>(null);
  const [name, setName] = useState('');

  // KPI Overlay state
  const [technology, setTechnology] = useState<'4G' | '5G'>('4G');
  const [level, setLevel] = useState<AnalysisLevel>('cell');
  const [selectedKpis, setSelectedKpis] = useState<KpiOverlayItem[]>([]);
  const [kpiSearch, setKpiSearch] = useState('');

  // Topology Search state
  const [topoFilters, setTopoFilters] = useState<Record<string, string>>({});
  const [activeTopoKeys, setActiveTopoKeys] = useState<string[]>(['pci']);

  // KPI date range
  const [kpiDateFrom, setKpiDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [kpiDateTo, setKpiDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  // Parameter state
  const [paramFilters, setParamFilters] = useState<Record<string, string>>({});
  const [activeParamKeys, setActiveParamKeys] = useState<string[]>(['parameter']);
  const [paramSearchQuery, setParamSearchQuery] = useState('');
  const [paramSearchResults, setParamSearchResults] = useState<string[]>([]);
  const [paramSearchLoading, setParamSearchLoading] = useState(false);
  const [paramListOpen, setParamListOpen] = useState(false);

  // Debounced parameter search from backend
  useEffect(() => {
    if (!paramSearchQuery || paramSearchQuery.length < 2) {
      setParamSearchResults([]);
      return;
    }
    setParamSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const url = getVpsProxyUrl('parser', `/api/v1/topo/param-list?search=${encodeURIComponent(paramSearchQuery)}&object_type=CELL&limit=50`);
        const resp = await fetch(url, { headers: getVpsProxyHeaders() });
        if (resp.ok) {
          const data = await resp.json();
          const items = Array.isArray(data) ? data : [];
          setParamSearchResults(items.map((v: any) => typeof v === 'string' ? v : v.name || v.value || '').filter(Boolean));
        }
      } catch { setParamSearchResults([]); }
      finally { setParamSearchLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [paramSearchQuery]);

  // Reset when closing
  const handleOpenChange = (o: boolean) => {
    if (!o) {
      setStep(1);
      setViewType(null);
      setName('');
      setTechnology('4G');
      setLevel('cell');
      setSelectedKpis([]);
      setKpiSearch('');
      setTopoFilters({});
      setActiveTopoKeys(['pci']);
      setParamFilters({});
      setActiveParamKeys(['parameter']);
      setCoverageBand('');
    }
    onOpenChange(o);
  };

  // Filtered KPIs by techno
  const filteredKpis = useMemo(() => {
    const technoLower = technology.toLowerCase();
    let kpis = availableKpis.filter(k =>
      !k.techno || k.techno.toLowerCase() === technoLower || k.techno.toLowerCase() === 'all'
    );
    if (kpiSearch.trim()) {
      const q = kpiSearch.toLowerCase();
      kpis = kpis.filter(k => k.label.toLowerCase().includes(q) || k.key.toLowerCase().includes(q));
    }
    return kpis;
  }, [availableKpis, technology, kpiSearch]);

  // Group by famille
  const groupedKpis = useMemo(() => {
    const groups: Record<string, typeof filteredKpis> = {};
    for (const k of filteredKpis) {
      const g = k.famille || 'Autres';
      if (!groups[g]) groups[g] = [];
      groups[g].push(k);
    }
    return groups;
  }, [filteredKpis]);

  const addKpi = (kpi: typeof availableKpis[0]) => {
    if (selectedKpis.find(s => s.kpiKey === kpi.key)) return;
    const thresholds: KpiThreshold[] = kpi.threshold_warning != null && kpi.threshold_critical != null
      ? [
          { min: 0, max: kpi.threshold_critical, color: '#ef4444' },
          { min: kpi.threshold_critical, max: kpi.threshold_warning, color: '#f59e0b' },
          { min: kpi.threshold_warning, max: 100, color: '#22c55e' },
        ]
      : [...DEFAULT_THRESHOLDS];
    setSelectedKpis(prev => [...prev, { kpiKey: kpi.key, label: kpi.label, thresholds }]);
  };

  const removeKpi = (key: string) => {
    setSelectedKpis(prev => prev.filter(k => k.kpiKey !== key));
  };

  const updateThreshold = (kpiKey: string, idx: number, field: 'min' | 'max' | 'color', value: string | number) => {
    setSelectedKpis(prev => prev.map(k => {
      if (k.kpiKey !== kpiKey) return k;
      const thresholds = k.thresholds.map((t, i) => i === idx ? { ...t, [field]: value } : t);
      return { ...k, thresholds };
    }));
  };

  const effectiveName = name.trim() || (
    viewType === 'kpi_overlay'
      ? `KPI ${technology} – ${selectedKpis.map(k => k.label).join(', ') || 'Overlay'}`
      : viewType === 'parameter'
        ? `Param – ${paramFilters['parameter'] || 'Search'}`
        : viewType === 'coverage'
          ? `Coverage ${technology}`
          : `Topo Search`
  );

  const [coverageBand, setCoverageBand] = useState<string>('');

  const isValid = (
    (viewType === 'kpi_overlay' && selectedKpis.length > 0) ||
    (viewType === 'topology_search' && Object.values(topoFilters).some(v => v.trim())) ||
    (viewType === 'parameter' && Boolean(paramFilters.parameter?.trim())) ||
    (viewType === 'coverage' && Boolean(coverageBand))
  );

  const handleSave = () => {
    if (!viewType || !isValid) return;
    const config: ViewConfig = { name: effectiveName, type: viewType };
    if (viewType === 'kpi_overlay') {
      config.technology = technology;
      config.level = level;
      config.kpis = selectedKpis;
      config.dateFrom = kpiDateFrom;
      config.dateTo = kpiDateTo;
    } else if (viewType === 'topology_search') {
      config.topoFilters = Object.fromEntries(
        Object.entries(topoFilters).filter(([, v]) => v.trim())
      );
    } else if (viewType === 'parameter') {
      config.paramFilters = Object.fromEntries(
        Object.entries(paramFilters).filter(([, v]) => v.trim())
      );
    } else if (viewType === 'coverage') {
      config.technology = technology;
      config.coverageBand = coverageBand;
    }
    onSave(config);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto p-0">
        {/* Progress bar */}
        <div className="flex items-center gap-0 px-6 pt-5 pb-0">
          <div className={`flex-1 h-1 rounded-full transition-colors ${step >= 1 ? 'bg-primary' : 'bg-muted'}`} />
          <div className="w-1" />
          <div className={`flex-1 h-1 rounded-full transition-colors ${step >= 2 ? 'bg-primary' : 'bg-muted'}`} />
        </div>

        <div className="px-6 pb-6 pt-3">
          {/* ── STEP 1: Type Selection ── */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-black tracking-tight">Nouvelle vue</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Choisissez le type de vue à créer</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* KPI Overlay */}
                <button
                  onClick={() => setViewType('kpi_overlay')}
                  className={`group relative flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all ${
                    viewType === 'kpi_overlay'
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/40 hover:bg-muted/50'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                    viewType === 'kpi_overlay' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground group-hover:text-primary'
                  }`}>
                    <BarChart2 size={24} />
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold">KPI Overlay</div>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                      Performances réseau sur la carte avec codes couleur
                    </p>
                  </div>
                  {viewType === 'kpi_overlay' && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                      <span className="text-[10px] font-bold">✓</span>
                    </div>
                  )}
                </button>

                {/* Topology Search */}
                <button
                  onClick={() => setViewType('topology_search')}
                  className={`group relative flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all ${
                    viewType === 'topology_search'
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/40 hover:bg-muted/50'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                    viewType === 'topology_search' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground group-hover:text-primary'
                  }`}>
                    <Search size={24} />
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold">Topology Search</div>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                      Recherchez des éléments spécifiques de la topologie
                    </p>
                  </div>
                  {viewType === 'topology_search' && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                      <span className="text-[10px] font-bold">✓</span>
                    </div>
                  )}
                </button>

                {/* Parameter */}
                <button
                  onClick={() => setViewType('parameter')}
                  className={`group relative flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all ${
                    viewType === 'parameter'
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/40 hover:bg-muted/50'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                    viewType === 'parameter' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground group-hover:text-primary'
                  }`}>
                    <Settings2 size={24} />
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold">Parameter</div>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                      Recherchez et filtrez les paramètres CM du réseau
                    </p>
                  </div>
                  {viewType === 'parameter' && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                      <span className="text-[10px] font-bold">✓</span>
                    </div>
                  )}
                </button>

                {/* Coverage Prediction */}
                <button
                  onClick={() => setViewType('coverage')}
                  className={`group relative flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all ${
                    viewType === 'coverage'
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/40 hover:bg-muted/50'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                    viewType === 'coverage' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground group-hover:text-primary'
                  }`}>
                    <Radio size={24} />
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold">Coverage Prediction</div>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                      Simulation de couverture RSRP par bande fréquence
                    </p>
                  </div>
                  {viewType === 'coverage' && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                      <span className="text-[10px] font-bold">✓</span>
                    </div>
                  )}
                </button>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => setStep(2)}
                  disabled={!viewType}
                  className="gap-1.5"
                >
                  Continuer
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 2: KPI Overlay ── */}
          {step === 2 && viewType === 'kpi_overlay' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button onClick={() => setStep(1)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                  <ChevronLeft size={16} className="text-muted-foreground" />
                </button>
                <div>
                  <h2 className="text-base font-black tracking-tight flex items-center gap-2">
                    <BarChart2 size={16} className="text-primary" /> KPI Overlay
                  </h2>
                  <p className="text-[10px] text-muted-foreground">Configurez l'overlay de performance réseau</p>
                </div>
              </div>

              {/* View name */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Nom de la vue *</label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Performance 4G Sud-Ouest"
                  className="text-sm"
                />
              </div>

              {/* Technology + Level */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Technologie *</label>
                  <div className="flex gap-1">
                    {(['4G', '5G'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => { setTechnology(t); setSelectedKpis([]); }}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                          technology === t
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Niveau d'analyse *</label>
                  <Select value={level} onValueChange={v => setLevel(v as AnalysisLevel)}>
                    <SelectTrigger className="text-xs h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="site">Site</SelectItem>
                      <SelectItem value="cell">Cellule</SelectItem>
                      <SelectItem value="band">Bande</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Date Range */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Période d'analyse *</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] text-muted-foreground">Date début</label>
                    <Input type="date" value={kpiDateFrom} onChange={e => setKpiDateFrom(e.target.value)} className="text-xs h-9" />
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground">Date fin</label>
                    <Input type="date" value={kpiDateTo} onChange={e => setKpiDateTo(e.target.value)} className="text-xs h-9" />
                  </div>
                </div>
              </div>

              {/* KPI Selection */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">KPIs sélectionnés ({selectedKpis.length})</label>
                {selectedKpis.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedKpis.map(k => (
                      <Badge key={k.kpiKey} variant="default" className="gap-1 text-[10px] pr-1">
                        {k.label}
                        <button onClick={() => removeKpi(k.kpiKey)} className="hover:text-destructive ml-0.5">
                          <X size={10} />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <Input
                  placeholder="Rechercher un KPI..."
                  value={kpiSearch}
                  onChange={e => setKpiSearch(e.target.value)}
                  className="text-xs h-8 mb-1"
                />
                <div className="max-h-36 overflow-y-auto border border-border rounded-lg">
                  {Object.entries(groupedKpis).map(([famille, kpis]) => (
                    <div key={famille}>
                      <div className="px-2 py-1 bg-muted/50 text-[9px] font-bold text-muted-foreground uppercase tracking-wider sticky top-0">{famille}</div>
                      {kpis.map(k => {
                        const isSelected = selectedKpis.some(s => s.kpiKey === k.key);
                        return (
                          <button
                            key={k.key}
                            onClick={() => isSelected ? removeKpi(k.key) : addKpi(k)}
                            className={`w-full text-left px-2 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                              isSelected ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted/50'
                            }`}
                          >
                            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                              isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-input'
                            }`}>
                              {isSelected && <span className="text-[8px] font-bold">✓</span>}
                            </div>
                            <span className="truncate">{k.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  {Object.keys(groupedKpis).length === 0 && (
                    <div className="p-4 text-center text-xs text-muted-foreground">Aucun KPI disponible pour {technology}</div>
                  )}
                </div>
              </div>

              {/* Threshold config for selected KPIs */}
              {selectedKpis.length > 0 && (
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                    <Palette size={10} className="inline mr-1" />
                    Seuils et couleurs
                  </label>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {selectedKpis.map(kpi => (
                      <div key={kpi.kpiKey} className="border border-border rounded-lg p-2.5">
                        <div className="text-[10px] font-bold text-foreground mb-1.5">{kpi.label}</div>
                        {/* Gradient preview */}
                        <div className="h-2 rounded-full mb-2 flex overflow-hidden">
                          {kpi.thresholds.map((t, i) => (
                            <div key={i} style={{ backgroundColor: t.color, flex: (t.max - t.min) || 1 }} />
                          ))}
                        </div>
                        <div className="space-y-1">
                          {kpi.thresholds.map((t, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <input
                                type="color"
                                value={t.color}
                                onChange={e => updateThreshold(kpi.kpiKey, i, 'color', e.target.value)}
                                className="w-5 h-5 rounded border-0 cursor-pointer p-0"
                              />
                              <Input
                                type="number"
                                value={t.min}
                                onChange={e => updateThreshold(kpi.kpiKey, i, 'min', parseFloat(e.target.value) || 0)}
                                className="w-16 h-6 text-[10px] px-1.5"
                                placeholder="Min"
                              />
                              <span className="text-[9px] text-muted-foreground">→</span>
                              <Input
                                type="number"
                                value={t.max}
                                onChange={e => updateThreshold(kpi.kpiKey, i, 'max', parseFloat(e.target.value) || 0)}
                                className="w-16 h-6 text-[10px] px-1.5"
                                placeholder="Max"
                              />
                              {kpi.thresholds.length > 1 && (
                                <button
                                  onClick={() => setSelectedKpis(prev => prev.map(k =>
                                    k.kpiKey === kpi.kpiKey ? { ...k, thresholds: k.thresholds.filter((_, j) => j !== i) } : k
                                  ))}
                                  className="p-0.5 hover:text-destructive text-muted-foreground"
                                >
                                  <X size={10} />
                                </button>
                              )}
                            </div>
                          ))}
                          <button
                            onClick={() => setSelectedKpis(prev => prev.map(k =>
                              k.kpiKey === kpi.kpiKey
                                ? { ...k, thresholds: [...k.thresholds, { min: k.thresholds[k.thresholds.length - 1]?.max || 0, max: 100, color: '#3b82f6' }] }
                                : k
                            ))}
                            className="text-[9px] text-primary font-bold flex items-center gap-0.5 hover:underline"
                          >
                            <Plus size={9} /> Ajouter un seuil
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t border-border">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                  <ChevronLeft size={14} className="mr-1" /> Retour
                </Button>
                <Button onClick={handleSave} disabled={!isValid || saving} className="flex-1">
                  {saving ? 'Création...' : 'Créer la vue'}
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Topology Search ── */}
          {step === 2 && viewType === 'topology_search' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button onClick={() => setStep(1)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                  <ChevronLeft size={16} className="text-muted-foreground" />
                </button>
                <div>
                  <h2 className="text-base font-black tracking-tight flex items-center gap-2">
                    <Search size={16} className="text-primary" /> Topology Search
                  </h2>
                  <p className="text-[10px] text-muted-foreground">Recherchez des éléments spécifiques dans la topologie</p>
                </div>
              </div>

              {/* View name */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Nom de la vue *</label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Recherche PCI 150-200"
                  className="text-sm"
                />
              </div>

              {/* Topo filters */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Filtres topologiques</label>
                <div className="space-y-2">
                  {activeTopoKeys.map(key => {
                    const def = TOPO_FILTER_KEYS.find(t => t.key === key);
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-foreground w-24 shrink-0">{def?.label || key}</span>
                        <Input
                          value={topoFilters[key] || ''}
                          onChange={e => setTopoFilters(prev => ({ ...prev, [key]: e.target.value }))}
                          placeholder={`Valeur ${def?.label || key}...`}
                          className="text-xs h-8 flex-1"
                        />
                        <button
                          onClick={() => {
                            setActiveTopoKeys(prev => prev.filter(k => k !== key));
                            setTopoFilters(prev => { const n = { ...prev }; delete n[key]; return n; });
                          }}
                          className="p-1 hover:text-destructive text-muted-foreground"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Add filter */}
                {TOPO_FILTER_KEYS.filter(t => !activeTopoKeys.includes(t.key)).length > 0 && (
                  <Select
                    onValueChange={key => setActiveTopoKeys(prev => [...prev, key])}
                  >
                    <SelectTrigger className="text-xs h-8 mt-2 w-48">
                      <SelectValue placeholder="+ Ajouter un filtre" />
                    </SelectTrigger>
                    <SelectContent>
                      {TOPO_FILTER_KEYS
                        .filter(t => !activeTopoKeys.includes(t.key))
                        .map(t => (
                          <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t border-border">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                  <ChevronLeft size={14} className="mr-1" /> Retour
                </Button>
                <Button onClick={handleSave} disabled={!isValid || saving} className="flex-1">
                  {saving ? 'Création...' : 'Créer la vue'}
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Parameter ── */}
          {step === 2 && viewType === 'parameter' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button onClick={() => setStep(1)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                  <ChevronLeft size={16} className="text-muted-foreground" />
                </button>
                <div>
                  <h2 className="text-base font-black tracking-tight flex items-center gap-2">
                    <Settings2 size={16} className="text-primary" /> Parameter
                  </h2>
                  <p className="text-[10px] text-muted-foreground">Filtrez et affichez les paramètres CM du réseau</p>
                </div>
              </div>

              {/* View name */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Nom de la vue *</label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Param maxTxPower Band 700"
                  className="text-sm"
                />
              </div>

              {/* Param filters */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Filtres paramètres</label>
                <div className="space-y-2">
                  {activeParamKeys.map(key => {
                    const def = PARAM_FILTER_KEYS.find(t => t.key === key);
                    const isParamKey = key === 'parameter';
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-foreground w-24 shrink-0">{def?.label || key}</span>
                        {isParamKey ? (
                          <div className="flex-1 relative">
                            <div className="flex items-center gap-1">
                              <Input
                                value={paramFilters[key] || paramSearchQuery}
                                onChange={e => {
                                  const v = e.target.value;
                                  setParamSearchQuery(v);
                                  setParamFilters(prev => ({ ...prev, [key]: v }));
                                  setParamListOpen(true);
                                }}
                                onFocus={() => { if (paramSearchQuery.length >= 2) setParamListOpen(true); }}
                                placeholder="Tapez pour rechercher (ex: pMax, LNCEL)..."
                                className="text-xs h-8 flex-1 font-mono"
                              />
                              {paramSearchLoading && <Loader2 size={14} className="animate-spin text-muted-foreground shrink-0" />}
                            </div>
                            {paramListOpen && paramSearchResults.length > 0 && (
                              <div className="absolute z-50 top-9 left-0 right-0 bg-popover border border-border rounded-lg shadow-xl max-h-52 overflow-y-auto">
                                {paramSearchResults.map(p => (
                                  <button
                                    key={p}
                                    onClick={() => {
                                      setParamFilters(prev => ({ ...prev, parameter: p }));
                                      setParamSearchQuery(p);
                                      setParamListOpen(false);
                                    }}
                                    className={`w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-accent transition-colors ${
                                      paramFilters.parameter === p ? 'bg-primary/10 text-primary font-bold' : 'text-foreground'
                                    }`}
                                  >
                                    {p}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <Input
                            value={paramFilters[key] || ''}
                            onChange={e => setParamFilters(prev => ({ ...prev, [key]: e.target.value }))}
                            placeholder={`Valeur ${def?.label || key}...`}
                            className="text-xs h-8 flex-1"
                          />
                        )}
                        <button
                          onClick={() => {
                            setActiveParamKeys(prev => prev.filter(k => k !== key));
                            setParamFilters(prev => { const n = { ...prev }; delete n[key]; return n; });
                            if (isParamKey) { setParamSearchQuery(''); setParamSearchResults([]); }
                          }}
                          className="p-1 hover:text-destructive text-muted-foreground"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Add filter */}
                {PARAM_FILTER_KEYS.filter(t => !activeParamKeys.includes(t.key)).length > 0 && (
                  <Select
                    onValueChange={key => setActiveParamKeys(prev => [...prev, key])}
                  >
                    <SelectTrigger className="text-xs h-8 mt-2 w-48">
                      <SelectValue placeholder="+ Ajouter un filtre" />
                    </SelectTrigger>
                    <SelectContent>
                      {PARAM_FILTER_KEYS
                        .filter(t => !activeParamKeys.includes(t.key))
                        .map(t => (
                          <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t border-border">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                  <ChevronLeft size={14} className="mr-1" /> Retour
                </Button>
                <Button onClick={handleSave} disabled={!isValid || saving} className="flex-1">
                  {saving ? 'Création...' : 'Créer la vue'}
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Coverage Prediction ── */}
          {step === 2 && viewType === 'coverage' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button onClick={() => setStep(1)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                  <ChevronLeft size={16} className="text-muted-foreground" />
                </button>
                <div>
                  <h2 className="text-base font-black tracking-tight flex items-center gap-2">
                    <Radio size={16} className="text-primary" /> Coverage Prediction
                  </h2>
                  <p className="text-[10px] text-muted-foreground">Simulation de couverture RSRP par bande de fréquence</p>
                </div>
              </div>

              {/* View name */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Nom de la vue *</label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Coverage LTE800 Centre"
                  className="text-sm"
                />
              </div>

              {/* Technology */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Technologie</label>
                <div className="flex gap-2">
                  {(['4G', '5G'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setTechnology(t)}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all border ${
                        technology === t
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted/30 text-muted-foreground border-border hover:border-primary/40'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Band selection */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Bande de fréquence *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(technology === '5G'
                    ? ['NR_700', 'NR_2100', 'NR_3500']
                    : ['LTE700', 'LTE800', 'LTE1800', 'LTE2100', 'LTE2600']
                  ).map(b => (
                    <button
                      key={b}
                      onClick={() => setCoverageBand(b)}
                      className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border ${
                        coverageBand === b
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted/30 text-foreground border-border hover:border-primary/40'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
                <Input
                  value={coverageBand}
                  onChange={e => setCoverageBand(e.target.value)}
                  placeholder="Ou saisissez une bande personnalisée"
                  className="text-xs h-8 mt-2 font-mono"
                />
              </div>

              <div className="text-[10px] text-muted-foreground bg-muted/30 rounded-lg p-2.5 border border-border/50">
                💡 La simulation calculera la couverture RSRP de toutes les cellules de cette bande dans le périmètre du dashboard actif (modèle COST-231 Hata).
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t border-border">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                  <ChevronLeft size={14} className="mr-1" /> Retour
                </Button>
                <Button onClick={handleSave} disabled={!isValid || saving} className="flex-1">
                  {saving ? 'Création...' : 'Créer la vue'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
