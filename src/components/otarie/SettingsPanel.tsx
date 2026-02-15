import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Settings, Server, Wifi, WifiOff, Clock, Building2, Users, Tag,
  CalendarDays, Activity, CheckCircle2, XCircle, RefreshCw, Zap,
  Globe, Database, Shield, Heart, ArrowRight, Play, BarChart3, Palette, Moon, Sun, Monitor,
  Upload, FileSpreadsheet, Trash2, MapPin, Radio, Antenna, Signal, Gauge, Waves
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

      <div className="p-10 space-y-10 pb-32">
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

        {/* Data Model & Radio Parameters */}
        <div className="bg-card rounded-3xl border border-border p-8 shadow-sm">
          {/* Header with dynamic schema breadcrumb */}
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
            {/* Schema breadcrumb bar */}
            <div className="bg-muted/40 rounded-2xl border border-border/50 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                {['date_part','cellule','site','5g_sa','streaming','fwa','plaque'].map((tag, i) => (
                  <React.Fragment key={tag}>
                    {i > 0 && <span className="text-muted-foreground text-[10px]">›</span>}
                    <span className="px-3 py-1 rounded-lg bg-primary/15 text-[10px] font-black text-primary uppercase tracking-wider">{tag}</span>
                  </React.Fragment>
                ))}
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-foreground">14</span>
                <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Fields in Pipeline</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LEFT: Dimensions */}
            <div className="space-y-5">
              {/* ORF NETWORK */}
              <DimensionCard
                icon={<Globe className="w-4 h-4" />}
                title="ORF NETWORK"
                values={['Nationale','Vendor','DOR','Plaque','Site','Cellule']}
              />
              {/* 5G Capability */}
              <DimensionCard
                icon={<Zap className="w-4 h-4" />}
                title="CAPABILITY"
                values={['5G_Capable','Non_5G_Capable']}
              />
              {/* ARCEP Zone */}
              <DimensionCard
                icon={<Shield className="w-4 h-4" />}
                title="ARCEP ZONE"
                values={['Top15','Intermédiaire','Rural','AXE','TGV']}
              />
              {/* Application */}
              <DimensionCard
                icon={<Activity className="w-4 h-4" />}
                title="APPLICATION"
                values={['Social','Streaming','WEB']}
              />
              {/* Service Provider */}
              <DimensionCard
                icon={<Server className="w-4 h-4" />}
                title="SERVICE PROVIDER"
                values={['Google','Meta','Microsoft','Amazone','Other']}
              />
              {/* RAT */}
              <DimensionCard
                icon={<Antenna className="w-4 h-4" />}
                title="RAT"
                values={['5G_SA','5G_NSA','4G','3G','2G','WiFi']}
              />
              {/* DOR */}
              <DimensionCard
                icon={<MapPin className="w-4 h-4" />}
                title="DOR"
                values={['Île-de-France','Nord-Est','Ouest','Sud-Est','Sud-Ouest']}
              />
              {/* POP */}
              <DimensionCard
                icon={<Building2 className="w-4 h-4" />}
                title="POP"
                values={['CNM','CNL']}
              />
              {/* Bande */}
              <DimensionCard
                icon={<Waves className="w-4 h-4" />}
                title="BANDE"
                values={['NR_3500','NR_700','LTE2600','LTE2100','LTE1800','LTE800','LTE700']}
              />
              {/* Device Brand */}
              <DimensionCard
                icon={<Wifi className="w-4 h-4" />}
                title="DEVICE BRAND"
                values={['iPhone','Samsung','Other']}
              />
              {/* OS */}
              <DimensionCard
                icon={<Monitor className="w-4 h-4" />}
                title="OS"
                values={['Android','iOS','Other']}
              />
              {/* Client */}
              <DimensionCard
                icon={<Users className="w-4 h-4" />}
                title="CLIENT"
                values={['FWA','Mobile']}
              />
              {/* Vendor */}
              <DimensionCard
                icon={<Tag className="w-4 h-4" />}
                title="VENDOR"
                values={['Ericsson','Nokia','Ransharing','Samsung']}
              />
            </div>

            {/* RIGHT: Radio Metrics */}
            <div className="space-y-5">
              <div className="flex items-center gap-2 mb-2">
                <Radio className="w-4 h-4 text-primary" />
                <span className="text-[11px] font-black text-foreground uppercase tracking-widest">Métriques Radio & Performance</span>
              </div>

              {[
                { name: 'Nb Sessions', id: 'SESSION_NBR', thresholds: [30,60,85,95], colors: ['bg-red-500','bg-amber-500','bg-blue-500','bg-emerald-500'] },
                { name: 'Volume Total', id: 'VOLUME_TOTALE', thresholds: [30,60,85,95], colors: ['bg-red-500','bg-amber-500','bg-blue-500','bg-emerald-500'] },
                { name: 'Volume DL Moy', id: 'VOLUME_DL_MOY', thresholds: [30,60,85,95], colors: ['bg-red-500','bg-red-400','bg-amber-500','bg-emerald-500'] },
                { name: 'Volume UL Moy', id: 'VOLUME_UL_MOY', thresholds: [30,60,85,95], colors: ['bg-red-500','bg-amber-500','bg-blue-500','bg-emerald-500'] },
                { name: 'Débit DL', id: 'DEBIT_DL', thresholds: [30,60,85,95], colors: ['bg-red-500','bg-amber-500','bg-blue-500','bg-emerald-500'] },
                { name: 'Débit UL', id: 'DEBIT_UL', thresholds: [30,60,85,95], colors: ['bg-muted','bg-muted','bg-muted','bg-muted'] },
                { name: 'RTT Moyen', id: 'RTT_AVG', thresholds: [50,100,200,500], colors: ['bg-emerald-500','bg-blue-500','bg-amber-500','bg-red-500'] },
                { name: 'Packet Loss DL', id: 'LOSS_DL', thresholds: [0.5,1,3,5], colors: ['bg-emerald-500','bg-blue-500','bg-amber-500','bg-red-500'] },
                { name: 'TCP Retransmission', id: 'RETRANS_RATE', thresholds: [1,3,5,10], colors: ['bg-emerald-500','bg-blue-500','bg-amber-500','bg-red-500'] },
                { name: 'Window Full Ratio', id: 'WIN_FULL_RATIO', thresholds: [5,15,30,50], colors: ['bg-emerald-500','bg-blue-500','bg-amber-500','bg-red-500'] },
                { name: 'DMS DL 3 Mbps', id: 'DMS_DL_3', thresholds: [50,70,85,95], colors: ['bg-red-500','bg-amber-500','bg-blue-500','bg-emerald-500'] },
                { name: 'DMS DL 8 Mbps', id: 'DMS_DL_8', thresholds: [30,50,70,90], colors: ['bg-red-500','bg-amber-500','bg-blue-500','bg-emerald-500'] },
                { name: 'DMS DL 30 Mbps', id: 'DMS_DL_30', thresholds: [10,30,50,75], colors: ['bg-red-500','bg-amber-500','bg-blue-500','bg-emerald-500'] },
                { name: 'DMS UL 3 Mbps', id: 'DMS_UL_3', thresholds: [30,55,75,90], colors: ['bg-red-500','bg-amber-500','bg-blue-500','bg-emerald-500'] },
                { name: 'QoE Score', id: 'QOE_SCORE', thresholds: [40,60,80,95], colors: ['bg-red-500','bg-amber-500','bg-blue-500','bg-emerald-500'] },
              ].map((metric) => (
                <MetricRow key={metric.id} metric={metric} />
              ))}
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

const DimensionCard = ({ icon, title, values }: { icon: React.ReactNode; title: string; values: string[] }) => (
  <div className="bg-muted/30 rounded-2xl border border-border/50 p-5">
    <div className="flex items-center gap-2 mb-4">
      <div className="text-primary">{icon}</div>
      <span className="text-[10px] font-black text-foreground uppercase tracking-widest">{title}</span>
    </div>
    <div className="flex flex-wrap gap-2">
      {values.map((v) => (
        <span key={v} className="px-3 py-1.5 rounded-lg bg-card border border-border/50 text-[10px] font-bold text-muted-foreground uppercase tracking-wider hover:border-primary/40 hover:text-primary transition-all cursor-default">
          {v}
        </span>
      ))}
    </div>
  </div>
);

const MetricRow = ({ metric }: { metric: { name: string; id: string; thresholds: number[]; colors: string[] } }) => (
  <div className="flex items-center gap-4 p-4 rounded-2xl bg-muted/30 border border-border/50 hover:border-primary/30 transition-all group">
    <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
      <CheckCircle2 className="w-4 h-4 text-primary" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[11px] font-black text-foreground uppercase tracking-tight">{metric.name}</p>
      <p className="text-[9px] font-bold text-muted-foreground font-mono uppercase">{metric.id}</p>
    </div>
    <div className="flex items-center gap-2">
      {metric.thresholds.map((t, i) => (
        <div key={i} className="text-center">
          <div className="px-3 py-1 rounded-lg bg-card border border-border/50 mb-1">
            <span className="text-[10px] font-black text-foreground">{t}</span>
          </div>
          <div className={`h-1 rounded-full ${metric.colors[i]}`} />
        </div>
      ))}
    </div>
  </div>
);

export default SettingsPanel;
