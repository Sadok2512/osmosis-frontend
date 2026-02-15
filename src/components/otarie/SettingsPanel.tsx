import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Settings, Server, Wifi, WifiOff, Clock, Building2, Users, Tag,
  CalendarDays, Activity, CheckCircle2, XCircle, RefreshCw, Zap,
  Globe, Database, Shield, Heart, ArrowRight, Play, BarChart3, Palette, Moon, Sun, Monitor,
  Upload, FileSpreadsheet, Trash2, MapPin, Radio, Antenna, Signal, Gauge, Waves, Search
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { invalidateSitesCache } from '@/services/mockData';
import type { SidebarTheme, AccentColor } from '../../pages/Index';

interface SettingsPanelProps {
  sidebarTheme: SidebarTheme;
  setSidebarTheme: (t: SidebarTheme) => void;
  accentColor: AccentColor;
  setAccentColor: (c: AccentColor) => void;
}

interface LatencyResult {
  endpoint: string;
  label: string;
  status: 'idle' | 'testing' | 'success' | 'error';
  latency?: number;
  message?: string;
}

const ENDPOINTS: { url: string; label: string; icon: React.ReactNode }[] = [
  { url: 'https://httpbin.org/get', label: 'API Gateway (httpbin)', icon: <Globe size={16} /> },
  { url: 'https://jsonplaceholder.typicode.com/posts/1', label: 'REST API (JSONPlaceholder)', icon: <Server size={16} /> },
  { url: 'https://api.github.com', label: 'GitHub API', icon: <Database size={16} /> },
];

const SIDEBAR_THEMES: { id: SidebarTheme; label: string; icon: React.ReactNode; preview: string }[] = [
  { id: 'dark', label: 'Dark', icon: <Moon size={16} />, preview: 'bg-[hsl(220,50%,12%)]' },
  { id: 'grey', label: 'Grey', icon: <Monitor size={16} />, preview: 'bg-[hsl(220,10%,40%)]' },
  { id: 'light', label: 'Light', icon: <Sun size={16} />, preview: 'bg-[hsl(220,20%,95%)]' },
];

const ACCENT_COLORS: { id: AccentColor; label: string; color: string }[] = [
  { id: 'default', label: 'Teal', color: 'bg-[hsl(170,70%,35%)]' },
  { id: 'orange', label: 'Orange', color: 'bg-[hsl(25,95%,53%)]' },
  { id: 'red', label: 'Red', color: 'bg-[hsl(0,72%,51%)]' },
  { id: 'pink', label: 'Pink', color: 'bg-[hsl(330,81%,60%)]' },
  { id: 'purple', label: 'Purple', color: 'bg-[hsl(262,83%,58%)]' },
  { id: 'indigo', label: 'Indigo', color: 'bg-[hsl(239,84%,67%)]' },
  { id: 'cyan', label: 'Cyan', color: 'bg-[hsl(187,92%,39%)]' },
  { id: 'emerald', label: 'Emerald', color: 'bg-[hsl(160,84%,39%)]' },
  { id: 'amber', label: 'Amber', color: 'bg-[hsl(38,92%,50%)]' },
];

const DEFAULT_COLORS = ['#ef4444','#f59e0b','#3b82f6','#10b981'];

const DIMENSIONS_CONFIG: { icon: React.ReactNode; title: string; values: string[] }[] = [
  { icon: <Globe className="w-4 h-4" />, title: 'ORF NETWORK', values: ['Nationale','Vendor','DOR','Plaque','Site','Cellule'] },
  { icon: <Zap className="w-4 h-4" />, title: 'CAPABILITY', values: ['5G_Capable','Non_5G_Capable'] },
  { icon: <Shield className="w-4 h-4" />, title: 'ARCEP ZONE', values: ['Top15','Intermédiaire','Rural','AXE','TGV'] },
  { icon: <Activity className="w-4 h-4" />, title: 'APPLICATION', values: ['Social','Streaming','WEB'] },
  { icon: <Server className="w-4 h-4" />, title: 'SERVICE PROVIDER', values: ['Google','Meta','Microsoft','Amazone','Other'] },
  { icon: <Antenna className="w-4 h-4" />, title: 'RAT', values: ['5G_SA','5G_NSA','4G','3G','2G','WiFi'] },
  { icon: <MapPin className="w-4 h-4" />, title: 'DOR', values: ['Île-de-France','Nord-Est','Ouest','Sud-Est','Sud-Ouest'] },
  { icon: <Building2 className="w-4 h-4" />, title: 'POP', values: ['CNM','CNL'] },
  { icon: <Waves className="w-4 h-4" />, title: 'BANDE', values: ['NR_3500','NR_700','LTE2600','LTE2100','LTE1800','LTE800','LTE700'] },
  { icon: <Wifi className="w-4 h-4" />, title: 'DEVICE BRAND', values: ['iPhone','Samsung','Other'] },
  { icon: <Monitor className="w-4 h-4" />, title: 'OS', values: ['Android','iOS','Other'] },
  { icon: <Users className="w-4 h-4" />, title: 'CLIENT', values: ['FWA','Mobile'] },
  { icon: <Tag className="w-4 h-4" />, title: 'VENDOR', values: ['Ericsson','Nokia','Ransharing','Samsung'] },
];

const METRICS_CONFIG: { name: string; id: string; numColors: number; thresholds: number[]; colors: string[] }[] = [
  { name: 'Nb Sessions', id: 'session_nbr', numColors: 4, thresholds: [30,60,85,95], colors: ['#ef4444','#f59e0b','#3b82f6','#10b981'] },
  { name: 'Volume Total', id: 'volume_totale', numColors: 4, thresholds: [30,60,85,95], colors: ['#ef4444','#f59e0b','#3b82f6','#10b981'] },
  { name: 'Débit DL', id: 'debit_dl', numColors: 4, thresholds: [3,8,30,100], colors: ['#ef4444','#f59e0b','#3b82f6','#10b981'] },
  { name: 'Débit UL', id: 'debit_ul', numColors: 4, thresholds: [1,3,10,50], colors: ['#ef4444','#f59e0b','#3b82f6','#10b981'] },
  { name: 'RTT Setup Avg', id: 'rtt_setup_avg', numColors: 4, thresholds: [50,100,200,500], colors: ['#10b981','#3b82f6','#f59e0b','#ef4444'] },
  { name: 'RTT Setup 40ms', id: 'rtt_setup_40', numColors: 1, thresholds: [40], colors: ['#f59e0b'] },
  { name: 'Loss DL Rate', id: 'loss_dl_rate', numColors: 4, thresholds: [0.5,1,3,5], colors: ['#10b981','#3b82f6','#f59e0b','#ef4444'] },
  { name: 'Loss DL 3%', id: 'loss_dl_3', numColors: 1, thresholds: [3], colors: ['#ef4444'] },
  { name: 'TCP Retr Rate 3%', id: 'tcp_retr_rate_3', numColors: 1, thresholds: [3], colors: ['#ef4444'] },
  { name: 'QoE Index', id: 'qoe_index', numColors: 4, thresholds: [40,60,80,95], colors: ['#ef4444','#f59e0b','#3b82f6','#10b981'] },
];

const SettingsPanel: React.FC<SettingsPanelProps> = ({ sidebarTheme, setSidebarTheme, accentColor, setAccentColor }) => {
  const [results, setResults] = useState<LatencyResult[]>(
    ENDPOINTS.map(e => ({ endpoint: e.url, label: e.label, status: 'idle' }))
  );
  const [isTestingAll, setIsTestingAll] = useState(false);
  const [systemTime, setSystemTime] = useState(new Date());
  const [topoImporting, setTopoImporting] = useState(false);
  const [topoStatus, setTopoStatus] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);
  const [topoCount, setTopoCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [settingsTab, setSettingsTab] = useState<'style' | 'data' | 'system'>('style');
  const [metricSearch, setMetricSearch] = useState('');

  // Dimension toggle state — each dimension category has an array of selected values
  const [selectedDimensions, setSelectedDimensions] = useState<Record<string, string[]>>(() => {
    const dims: Record<string, string[]> = {};
    DIMENSIONS_CONFIG.forEach(d => { dims[d.title] = [...d.values]; });
    return dims;
  });

  // Metrics with editable colors
  const [metricsConfig, setMetricsConfig] = useState(METRICS_CONFIG.map(m => ({ ...m })));

  const toggleDimensionValue = (title: string, value: string) => {
    setSelectedDimensions(prev => {
      const current = prev[title] || [];
      const next = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value];
      return { ...prev, [title]: next };
    });
  };

  const toggleAllDimension = (title: string, values: string[]) => {
    setSelectedDimensions(prev => {
      const allSelected = values.every(v => (prev[title] || []).includes(v));
      return { ...prev, [title]: allSelected ? [] : [...values] };
    });
  };

  const updateMetricColor = (metricIdx: number, colorIdx: number, newColor: string) => {
    setMetricsConfig(prev => prev.map((m, i) => {
      if (i !== metricIdx) return m;
      const newColors = [...m.colors];
      newColors[colorIdx] = newColor;
      return { ...m, colors: newColors };
    }));
  };

  const updateMetricThreshold = (metricIdx: number, thresholdIdx: number, newVal: number) => {
    setMetricsConfig(prev => prev.map((m, i) => {
      if (i !== metricIdx) return m;
      const newThresholds = [...m.thresholds];
      newThresholds[thresholdIdx] = newVal;
      return { ...m, thresholds: newThresholds };
    }));
  };

  const filteredMetrics = metricsConfig.filter(m =>
    m.name.toLowerCase().includes(metricSearch.toLowerCase()) ||
    m.id.toLowerCase().includes(metricSearch.toLowerCase())
  );

  const totalSelectedDims = Object.values(selectedDimensions).reduce((s, arr) => s + arr.length, 0);

  useEffect(() => {
    const interval = setInterval(() => setSystemTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Load topo count
  useEffect(() => {
    supabase.from('topo').select('id', { count: 'exact', head: true }).then(({ count }) => {
      setTopoCount(count ?? 0);
    });
  }, []);

  const testEndpoint = useCallback(async (index: number) => {
    setResults(prev => prev.map((r, i) => i === index ? { ...r, status: 'testing' } : r));
    const start = performance.now();
    try {
      const res = await fetch(ENDPOINTS[index].url, { mode: 'cors', cache: 'no-store' });
      const latency = Math.round(performance.now() - start);
      setResults(prev => prev.map((r, i) =>
        i === index ? { ...r, status: res.ok ? 'success' : 'error', latency, message: res.ok ? `${res.status} OK` : `HTTP ${res.status}` } : r
      ));
    } catch (err: any) {
      const latency = Math.round(performance.now() - start);
      setResults(prev => prev.map((r, i) =>
        i === index ? { ...r, status: 'error', latency, message: err.message || 'Network error' } : r
      ));
    }
  }, []);

  const testAll = async () => {
    setIsTestingAll(true);
    for (let i = 0; i < ENDPOINTS.length; i++) {
      await testEndpoint(i);
    }
    setIsTestingAll(false);
  };

  const avgLatency = results.filter(r => r.latency != null).reduce((sum, r) => sum + (r.latency || 0), 0) / (results.filter(r => r.latency != null).length || 1);
  const successCount = results.filter(r => r.status === 'success').length;

  const getLatencyColor = (ms?: number) => {
    if (ms == null) return 'text-muted-foreground';
    if (ms < 200) return 'text-emerald-500';
    if (ms < 500) return 'text-amber-500';
    return 'text-red-500';
  };

  const getLatencyBg = (ms?: number) => {
    if (ms == null) return 'bg-muted';
    if (ms < 200) return 'bg-emerald-500/10';
    if (ms < 500) return 'bg-amber-500/10';
    return 'bg-red-500/10';
  };

  const handleTopoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTopoImporting(true);
    setTopoStatus({ message: 'Lecture du fichier Excel...', type: 'info' });

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonRows: any[] = XLSX.utils.sheet_to_json(sheet);

      setTopoStatus({ message: `${jsonRows.length} lignes lues. Import en cours...`, type: 'info' });

      // Map Excel columns to DB columns
      const rows = jsonRows.map((r: any) => {
        // Handle Excel date serial numbers
        const parseDate = (val: any) => {
          if (!val) return null;
          if (typeof val === 'number') {
            const d = XLSX.SSF.parse_date_code(val);
            if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
          }
          return String(val);
        };
        return {
          code_nidt: r['Code NIDT'] || '',
          nom_site: r['Nom Site'] || '',
          region: r['Région'] || null,
          longitude: r['longitude'] ? parseFloat(r['longitude']) : null,
          latitude: r['latitude'] ? parseFloat(r['latitude']) : null,
          nom_cellule: r['Nom Cellule'] || '',
          techno: r['Techno'] || null,
          bande: r['Bande'] || null,
          constructeur: r['Constructeur'] || null,
          azimut: r['Azimut'] != null ? parseInt(r['Azimut']) : null,
          date_mes: parseDate(r['Date MES']),
          date_fn8: parseDate(r['Date FN8']),
          plaque: r['Plaque'] || null,
          hba: r['HBA'] != null ? parseInt(r['HBA']) : null,
          tac: r['TAC'] != null ? parseInt(r['TAC']) : null,
        };
      });

      // Call edge function
      const { data: result, error } = await supabase.functions.invoke('import-topo', {
        body: { rows, clear_before: true },
      });

      if (error) throw error;

      setTopoCount(result.inserted);
      invalidateSitesCache();
      setTopoStatus({ message: `✓ ${result.inserted} cellules importées avec succès. Rechargez la carte pour voir les nouvelles données.`, type: 'success' });
    } catch (err: any) {
      setTopoStatus({ message: `Erreur: ${err.message}`, type: 'error' });
    } finally {
      setTopoImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleClearTopo = async () => {
    if (!confirm('Supprimer toutes les données topologiques ?')) return;
    setTopoImporting(true);
    try {
      const { error } = await supabase.from('topo').delete().neq('id', 0);
      if (error) throw error;
      setTopoCount(0);
      setTopoStatus({ message: 'Données topologiques supprimées', type: 'info' });
    } catch (err: any) {
      setTopoStatus({ message: `Erreur: ${err.message}`, type: 'error' });
    } finally {
      setTopoImporting(false);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border px-10 py-8 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Settings className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-foreground uppercase">Paramètres Système</h1>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Configuration & Diagnostics • OTARIE Platform</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-xl">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-black text-primary uppercase tracking-wider">V1.0 Beta • Orange France</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 rounded-xl">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-black text-emerald-600 uppercase tracking-wider">Connected</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-2 px-10 pt-4 pb-0 bg-card border-b border-border sticky top-[104px] z-10">
        {([
          { id: 'style' as const, label: 'Style UI', icon: <Palette className="w-4 h-4" /> },
          { id: 'data' as const, label: 'Data Model', icon: <Database className="w-4 h-4" /> },
          { id: 'system' as const, label: 'System Core', icon: <Settings className="w-4 h-4" /> },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSettingsTab(tab.id)}
            className={`flex items-center gap-2 px-6 py-3 rounded-t-xl text-[11px] font-black uppercase tracking-widest transition-all ${
              settingsTab === tab.id
                ? 'bg-background text-foreground border border-border border-b-0 -mb-px'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-10 space-y-10 pb-32">
        {/* ===== STYLE UI TAB ===== */}
        {settingsTab === 'style' && (<>
        {/* System Info + Appearance Side by Side */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* System Info */}
          <div className="bg-card rounded-3xl border border-border p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Server className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-[13px] font-black text-foreground uppercase tracking-wider">Informations Système</h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Identité & version de la plateforme</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <InfoCard icon={<Building2 className="w-5 h-5" />} label="Organisation" value="Orange France" sublabel="Opérateur Télécom" accentColor="text-orange-500" bgColor="bg-orange-500/10" />
              <InfoCard icon={<Users className="w-5 h-5" />} label="Équipe" value="PSN Team" sublabel="Performance & Service Network" accentColor="text-primary" bgColor="bg-primary/10" />
              <InfoCard icon={<Tag className="w-5 h-5" />} label="Version" value="V1.0 Beta" sublabel="Build 2026.02.15" accentColor="text-purple-500" bgColor="bg-purple-500/10" />
              <InfoCard icon={<CalendarDays className="w-5 h-5" />} label="Date Système" value={systemTime.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })} sublabel={systemTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} accentColor="text-cyan-500" bgColor="bg-cyan-500/10" />
            </div>
          </div>

          {/* Appearance */}
          <div className="bg-card rounded-3xl border border-border p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Palette className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-[13px] font-black text-foreground uppercase tracking-wider">Apparence</h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Personnaliser le thème et les couleurs</p>
              </div>
            </div>

            {/* Sidebar Theme */}
            <div className="mb-6">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3">Thème Sidebar</p>
              <div className="flex gap-3">
                {SIDEBAR_THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSidebarTheme(t.id)}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all flex-1 ${
                      sidebarTheme === t.id
                        ? 'border-primary bg-primary/5 shadow-lg'
                        : 'border-border hover:border-primary/40 bg-card'
                    }`}
                  >
                    <div className={`w-12 h-16 rounded-lg ${t.preview} border border-border/50 shadow-inner flex flex-col items-center justify-center gap-1`}>
                      <div className={`w-6 h-0.5 rounded-full ${t.id === 'light' ? 'bg-black/20' : 'bg-white/30'}`} />
                      <div className={`w-4 h-0.5 rounded-full ${t.id === 'light' ? 'bg-black/10' : 'bg-white/15'}`} />
                    </div>
                    <span className={`text-[9px] font-black uppercase tracking-wider ${sidebarTheme === t.id ? 'text-primary' : 'text-muted-foreground'}`}>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* App Color */}
            <div>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3">Couleur App</p>
              <div className="grid grid-cols-3 gap-2">
                {ACCENT_COLORS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setAccentColor(c.id)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border-2 transition-all ${
                      accentColor === c.id
                        ? 'border-foreground/50 bg-muted shadow-lg'
                        : 'border-border hover:border-foreground/30 bg-card'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-full ${c.color} shadow-sm flex-shrink-0`} />
                    <span className={`text-[9px] font-black uppercase tracking-wider ${accentColor === c.id ? 'text-foreground' : 'text-muted-foreground'}`}>{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Topologie Réseau Import */}
        <div className="bg-card rounded-3xl border border-border p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-[13px] font-black text-foreground uppercase tracking-wider">Topologie Réseau</h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Importer les données de sites et cellules</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {topoCount !== null && (
                <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-xl">
                  <Database className="w-4 h-4 text-primary" />
                  <span className="text-[11px] font-black text-primary">{topoCount.toLocaleString()} cellules</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleTopoUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={topoImporting}
              className="flex items-center gap-3 px-6 py-3 bg-primary text-primary-foreground rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-primary/90 transition-all disabled:opacity-50 shadow-lg"
            >
              {topoImporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {topoImporting ? 'Import en cours...' : 'Importer Fichier Excel'}
            </button>
            {topoCount !== null && topoCount > 0 && (
              <button
                onClick={handleClearTopo}
                disabled={topoImporting}
                className="flex items-center gap-2 px-4 py-3 bg-red-500/10 text-red-500 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Vider
              </button>
            )}
          </div>

          {topoStatus && (
            <div className={`mt-4 px-4 py-3 rounded-xl text-[11px] font-bold ${
              topoStatus.type === 'success' ? 'bg-emerald-500/10 text-emerald-600' :
              topoStatus.type === 'error' ? 'bg-red-500/10 text-red-500' :
              'bg-primary/10 text-primary'
            }`}>
              {topoStatus.message}
            </div>
          )}
        </div>
        </>)}

        {/* ===== DATA MODEL TAB ===== */}
        {settingsTab === 'data' && (<>
        <div className="bg-card rounded-3xl border border-border p-8 shadow-sm">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Database className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-[13px] font-black text-foreground uppercase tracking-wider">Schéma Analytique Dynamique</h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Dimensions réseau, segments & métriques radio</p>
              </div>
            </div>
            <div className="bg-muted/40 rounded-2xl border border-border/50 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                {Object.entries(selectedDimensions).filter(([,v]) => v.length > 0).slice(0,7).map(([title], i) => (
                  <React.Fragment key={title}>
                    {i > 0 && <span className="text-muted-foreground text-[10px]">›</span>}
                    <span className="px-3 py-1 rounded-lg bg-primary/15 text-[10px] font-black text-primary uppercase tracking-wider">{title}</span>
                  </React.Fragment>
                ))}
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-foreground">{totalSelectedDims}</span>
                <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Fields Active</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LEFT: Dimensions with toggles */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="w-4 h-4 text-primary" />
                <span className="text-[11px] font-black text-foreground uppercase tracking-widest">Dimensions</span>
                <span className="text-[9px] font-bold text-muted-foreground ml-auto">{totalSelectedDims} sélectionnés</span>
              </div>
              {DIMENSIONS_CONFIG.map((dim) => {
                const selected = selectedDimensions[dim.title] || [];
                const allSelected = dim.values.every(v => selected.includes(v));
                return (
                  <div key={dim.title} className="bg-muted/30 rounded-2xl border border-border/50 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <button
                        onClick={() => toggleAllDimension(dim.title, dim.values)}
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                          allSelected ? 'bg-primary border-primary' : 'border-muted-foreground/40 hover:border-primary'
                        }`}
                      >
                        {allSelected && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                      </button>
                      <div className="text-primary">{dim.icon}</div>
                      <span className="text-[10px] font-black text-foreground uppercase tracking-widest">{dim.title}</span>
                      <span className="text-[9px] font-bold text-muted-foreground ml-auto">{selected.length}/{dim.values.length}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {dim.values.map((v) => {
                        const isSelected = selected.includes(v);
                        return (
                          <button
                            key={v}
                            onClick={() => toggleDimensionValue(dim.title, v)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                              isSelected
                                ? 'bg-primary/15 border border-primary/40 text-primary'
                                : 'bg-card border border-border/50 text-muted-foreground/50 line-through hover:text-muted-foreground hover:border-border'
                            }`}
                          >
                            {v}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* RIGHT: Radio Metrics with search + editable colors */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Radio className="w-4 h-4 text-primary" />
                <span className="text-[11px] font-black text-foreground uppercase tracking-widest">Métriques Radio</span>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Rechercher une métrique..."
                  value={metricSearch}
                  onChange={e => setMetricSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-muted/40 border border-border/50 text-[11px] font-bold text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-all"
                />
              </div>

              {filteredMetrics.length === 0 && (
                <div className="text-center py-8 text-[11px] font-bold text-muted-foreground">Aucune métrique trouvée</div>
              )}

              {filteredMetrics.map((metric) => {
                const origIdx = metricsConfig.findIndex(m => m.id === metric.id);
                return (
                  <div key={metric.id} className="p-4 rounded-2xl bg-muted/30 border border-border/50 hover:border-primary/30 transition-all">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Gauge className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-black text-foreground uppercase tracking-tight">{metric.name}</p>
                        <p className="text-[9px] font-bold text-muted-foreground font-mono uppercase">{metric.id}</p>
                      </div>
                      <span className="text-[9px] font-black text-muted-foreground bg-muted rounded-lg px-2 py-1">
                        {metric.numColors} couleur{metric.numColors > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {metric.thresholds.map((t, i) => (
                        <div key={i} className="flex-1 text-center">
                          <input
                            type="number"
                            value={t}
                            onChange={e => updateMetricThreshold(origIdx, i, parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 rounded-lg bg-card border border-border/50 text-[10px] font-black text-foreground text-center focus:outline-none focus:border-primary/50 mb-1"
                          />
                          <div className="relative w-full h-3 rounded-full cursor-pointer overflow-hidden" style={{ backgroundColor: metric.colors[i] }}>
                            <input
                              type="color"
                              value={metric.colors[i]}
                              onChange={e => updateMetricColor(origIdx, i, e.target.value)}
                              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        </>)}

        {/* ===== SYSTEM CORE TAB ===== */}
        {settingsTab === 'system' && (<>
        {/* Platform Details */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 bg-card rounded-3xl border border-border p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-[13px] font-black text-foreground uppercase tracking-wider">Informations Plateforme</h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Détails techniques du système</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <DetailRow label="Plateforme" value="OTARIE QoE Observatory" />
              <DetailRow label="Environnement" value="Production" badge="PROD" badgeColor="bg-emerald-500" />
              <DetailRow label="Framework" value="React 18 + TypeScript" />
              <DetailRow label="Cartographie" value="Leaflet 4.2.1" />
              <DetailRow label="Analytique" value="Recharts 2.15" />
              <DetailRow label="Organisation" value="Orange France — DSI/DTRS" />
              <DetailRow label="Région Cible" value="France Métropolitaine" />
              <DetailRow label="Protocole" value="HTTPS / TLS 1.3" />
            </div>
          </div>

          {/* Quick Stats */}
          <div className="bg-gradient-to-br from-sidebar to-sidebar-accent rounded-3xl p-8 text-white shadow-xl border border-sidebar-border">
            <div className="flex items-center gap-3 mb-8">
              <Heart className="w-5 h-5 text-sidebar-primary" />
              <h3 className="text-[13px] font-black uppercase tracking-wider">Santé Système</h3>
            </div>
            <div className="space-y-6">
              <HealthMetric label="Uptime" value="99.97%" color="text-emerald-400" />
              <HealthMetric label="Latence Moy." value={avgLatency > 0 ? `${Math.round(avgLatency)}ms` : '—'} color={avgLatency < 200 ? 'text-emerald-400' : avgLatency < 500 ? 'text-amber-400' : 'text-red-400'} />
              <HealthMetric label="Endpoints OK" value={`${successCount}/${ENDPOINTS.length}`} color={successCount === ENDPOINTS.length ? 'text-emerald-400' : 'text-amber-400'} />
              <HealthMetric label="Dernière MàJ" value="15 fév. 2026" color="text-sidebar-primary" />
            </div>
          </div>
        </div>

        {/* Backend Connectivity Test */}
        <div className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Activity className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-[13px] font-black text-foreground uppercase tracking-wider">Test Connectivité Backend</h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Diagnostiquer la latence et disponibilité des APIs</p>
              </div>
            </div>
            <button
              onClick={testAll}
              disabled={isTestingAll}
              className="flex items-center gap-3 px-6 py-3 bg-primary text-primary-foreground rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-primary/90 transition-all disabled:opacity-50 shadow-lg"
            >
              {isTestingAll ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {isTestingAll ? 'Test en cours...' : 'Lancer Tous les Tests'}
            </button>
          </div>

          <div className="divide-y divide-border">
            {results.map((result, idx) => (
              <div key={idx} className="px-8 py-5 flex items-center justify-between group hover:bg-muted/30 transition-all">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                    result.status === 'success' ? 'bg-emerald-500/10 text-emerald-500' :
                    result.status === 'error' ? 'bg-red-500/10 text-red-500' :
                    result.status === 'testing' ? 'bg-primary/10 text-primary' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {result.status === 'testing' ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : result.status === 'success' ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : result.status === 'error' ? (
                      <XCircle className="w-5 h-5" />
                    ) : (
                      ENDPOINTS[idx].icon
                    )}
                  </div>
                  <div>
                    <h4 className="text-[12px] font-black text-foreground uppercase tracking-tight">{result.label}</h4>
                    <p className="text-[10px] font-medium text-muted-foreground mt-0.5 font-mono">{result.endpoint}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {result.latency != null && (
                    <div className={`px-4 py-2 rounded-xl ${getLatencyBg(result.latency)}`}>
                      <span className={`text-[13px] font-black tracking-tight ${getLatencyColor(result.latency)}`}>
                        {result.latency}ms
                      </span>
                    </div>
                  )}
                  {result.message && (
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${
                      result.status === 'success' ? 'text-emerald-500' : 'text-red-500'
                    }`}>{result.message}</span>
                  )}
                  <button
                    onClick={() => testEndpoint(idx)}
                    disabled={result.status === 'testing'}
                    className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${result.status === 'testing' ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Latency Summary Bar */}
          {results.some(r => r.latency != null) && (
            <div className="px-8 py-5 bg-muted/30 border-t border-border flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-muted-foreground" />
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Résumé</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-[11px] font-bold text-muted-foreground">
                    Moy: <span className={`font-black ${getLatencyColor(avgLatency)}`}>{Math.round(avgLatency)}ms</span>
                  </span>
                  <span className="text-[11px] font-bold text-muted-foreground">
                    Min: <span className="font-black text-emerald-500">{Math.min(...results.filter(r => r.latency != null).map(r => r.latency!))}ms</span>
                  </span>
                  <span className="text-[11px] font-bold text-muted-foreground">
                    Max: <span className="font-black text-red-500">{Math.max(...results.filter(r => r.latency != null).map(r => r.latency!))}ms</span>
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${successCount === ENDPOINTS.length ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <span className="text-[10px] font-black uppercase tracking-wider text-foreground">
                  {successCount === ENDPOINTS.length ? 'Tous Opérationnels' : `${successCount}/${ENDPOINTS.length} OK`}
                </span>
              </div>
            </div>
          )}
        </div>
        </>)}
      </div>
    </div>
  );
};

const InfoCard = ({ icon, label, value, sublabel, accentColor, bgColor }: {
  icon: React.ReactNode; label: string; value: string; sublabel: string; accentColor: string; bgColor: string;
}) => (
  <div className="bg-card rounded-3xl border border-border p-7 shadow-sm hover:shadow-xl transition-all group">
    <div className={`w-12 h-12 rounded-2xl ${bgColor} flex items-center justify-center ${accentColor} mb-5 group-hover:scale-110 transition-transform`}>
      {icon}
    </div>
    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">{label}</p>
    <p className={`text-xl font-black tracking-tight ${accentColor}`}>{value}</p>
    <p className="text-[10px] font-bold text-muted-foreground mt-1">{sublabel}</p>
  </div>
);

const DetailRow = ({ label, value, badge, badgeColor }: { label: string; value: string; badge?: string; badgeColor?: string }) => (
  <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/30 border border-border/50">
    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{label}</span>
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-bold text-foreground">{value}</span>
      {badge && <span className={`px-2 py-0.5 rounded text-[8px] font-black text-white ${badgeColor}`}>{badge}</span>}
    </div>
  </div>
);

const HealthMetric = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div className="flex items-center justify-between">
    <span className="text-[11px] font-bold text-white/60 uppercase tracking-wider">{label}</span>
    <span className={`text-[15px] font-black tracking-tight ${color}`}>{value}</span>
  </div>
);

export default SettingsPanel;
