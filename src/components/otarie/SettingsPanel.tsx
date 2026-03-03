import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Settings, Server, Wifi, WifiOff, Clock, Building2, Users, Tag,
  CalendarDays, Activity, CheckCircle2, XCircle, RefreshCw, Zap,
  Globe, Database, Shield, Heart, ArrowRight, Play, BarChart3, Palette, Moon, Sun, Monitor,
  Upload, FileSpreadsheet, Trash2, MapPin, Radio, Antenna, Signal, Gauge, Waves, Search,
  X, ChevronDown, ChevronRight, Eye, EyeOff, Check, Bell
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { topoApi } from '@/lib/localDb';
import { getApiUrl, getApiHeaders, isLocalMode } from '@/lib/apiConfig';
import { invalidateSitesCache } from '@/services/mockData';
import { useCSVData, type CSVDataset } from '@/components/bi/CSVDataStore';
import type { SidebarTheme, AccentColor } from '../../pages/Index';

interface SettingsPanelProps {
  sidebarTheme: SidebarTheme;
  setSidebarTheme: (t: SidebarTheme) => void;
  accentColor: AccentColor;
  setAccentColor: (c: AccentColor) => void;
  enabledModules: Record<string, boolean>;
  setEnabledModules: (m: Record<string, boolean>) => void;
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

type MetricCategory = 'Traffic' | 'RTT' | 'Loss' | 'TCP' | 'DMS' | 'Sessions' | 'Mobility' | 'RAT Time' | 'QoE';

const METRIC_CATEGORIES: { id: MetricCategory; label: string; icon: React.ReactNode }[] = [
  { id: 'Traffic', label: 'Traffic & Volume', icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'RTT', label: 'Round-Trip Time', icon: <Clock className="w-4 h-4" /> },
  { id: 'Loss', label: 'Packet Loss', icon: <XCircle className="w-4 h-4" /> },
  { id: 'TCP', label: 'TCP Performance', icon: <Activity className="w-4 h-4" /> },
  { id: 'DMS', label: 'DMS Compliance', icon: <Shield className="w-4 h-4" /> },
  { id: 'Sessions', label: 'Sessions', icon: <Users className="w-4 h-4" /> },
  { id: 'Mobility', label: 'Mobility & Fallback', icon: <Antenna className="w-4 h-4" /> },
  { id: 'RAT Time', label: 'RAT Time', icon: <Signal className="w-4 h-4" /> },
  { id: 'QoE', label: 'Quality & QoE', icon: <Gauge className="w-4 h-4" /> },
];

const METRICS_CONFIG: { name: string; id: string; numColors: number; thresholds: number[]; colors: string[]; category: MetricCategory }[] = [
  { name: 'Volume Totale', id: 'volume_totale', category: 'Traffic', numColors: 4, thresholds: [30,60,85,95], colors: ['#ef4444','#f59e0b','#3b82f6','#10b981'] },
  { name: 'Débit DL', id: 'debit_dl', category: 'Traffic', numColors: 4, thresholds: [3,8,30,100], colors: ['#ef4444','#f59e0b','#3b82f6','#10b981'] },
  { name: 'Débit UL', id: 'debit_ul', category: 'Traffic', numColors: 4, thresholds: [1,3,10,50], colors: ['#ef4444','#f59e0b','#3b82f6','#10b981'] },
  { name: 'DL/UL Ratio', id: 'dl_ul_ratio', category: 'Traffic', numColors: 4, thresholds: [1,3,5,10], colors: ['#ef4444','#f59e0b','#3b82f6','#10b981'] },
  { name: 'Débit DL Max', id: 'debit_dl_max', category: 'Traffic', numColors: 4, thresholds: [10,30,100,300], colors: ['#ef4444','#f59e0b','#3b82f6','#10b981'] },
  { name: 'Débit UL Max', id: 'debit_ul_max', category: 'Traffic', numColors: 4, thresholds: [5,10,50,100], colors: ['#ef4444','#f59e0b','#3b82f6','#10b981'] },
  { name: 'RTT Setup Avg', id: 'rtt_setup_avg', category: 'RTT', numColors: 4, thresholds: [40,80,150,300], colors: ['#10b981','#3b82f6','#f59e0b','#ef4444'] },
  { name: 'RTT Data Avg', id: 'rtt_data_avg', category: 'RTT', numColors: 4, thresholds: [40,80,150,300], colors: ['#10b981','#3b82f6','#f59e0b','#ef4444'] },
  { name: 'RTT Setup <40ms', id: 'rtt_setup_40', category: 'RTT', numColors: 1, thresholds: [40], colors: ['#10b981'] },
  { name: 'RTT Setup 40-80', id: 'rtt_setup_40_80', category: 'RTT', numColors: 1, thresholds: [80], colors: ['#3b82f6'] },
  { name: 'RTT Setup 80-150', id: 'rtt_setup_80_150', category: 'RTT', numColors: 1, thresholds: [150], colors: ['#f59e0b'] },
  { name: 'RTT Setup 150-300', id: 'rtt_setup_150_300', category: 'RTT', numColors: 1, thresholds: [300], colors: ['#ef4444'] },
  { name: 'RTT Setup >300', id: 'rtt_setup_300', category: 'RTT', numColors: 1, thresholds: [300], colors: ['#dc2626'] },
  { name: 'RTT Data <40ms', id: 'rtt_data_40', category: 'RTT', numColors: 1, thresholds: [40], colors: ['#10b981'] },
  { name: 'RTT Data 40-80', id: 'rtt_data_40_80', category: 'RTT', numColors: 1, thresholds: [80], colors: ['#3b82f6'] },
  { name: 'RTT Data 80-150', id: 'rtt_data_80_150', category: 'RTT', numColors: 1, thresholds: [150], colors: ['#f59e0b'] },
  { name: 'RTT Data 150-300', id: 'rtt_data_150_300', category: 'RTT', numColors: 1, thresholds: [300], colors: ['#ef4444'] },
  { name: 'RTT Data >300', id: 'rtt_data_300', category: 'RTT', numColors: 1, thresholds: [300], colors: ['#dc2626'] },
  { name: 'Loss DL Rate', id: 'loss_dl_rate', category: 'Loss', numColors: 4, thresholds: [1,3,5,10], colors: ['#10b981','#3b82f6','#f59e0b','#ef4444'] },
  { name: 'Loss UL Rate', id: 'loss_ul_rate', category: 'Loss', numColors: 4, thresholds: [1,3,5,10], colors: ['#10b981','#3b82f6','#f59e0b','#ef4444'] },
  { name: 'Loss UL <1%', id: 'loss_ul_1', category: 'Loss', numColors: 1, thresholds: [1], colors: ['#10b981'] },
  { name: 'Loss UL <3%', id: 'loss_ul_3', category: 'Loss', numColors: 1, thresholds: [3], colors: ['#3b82f6'] },
  { name: 'Loss UL <5%', id: 'loss_ul_5', category: 'Loss', numColors: 1, thresholds: [5], colors: ['#f59e0b'] },
  { name: 'Loss UL <10%', id: 'loss_ul_10', category: 'Loss', numColors: 1, thresholds: [10], colors: ['#ef4444'] },
  { name: 'Loss DL <1%', id: 'loss_dl_1', category: 'Loss', numColors: 1, thresholds: [1], colors: ['#10b981'] },
  { name: 'Loss DL <3%', id: 'loss_dl_3', category: 'Loss', numColors: 1, thresholds: [3], colors: ['#3b82f6'] },
  { name: 'Loss DL <5%', id: 'loss_dl_5', category: 'Loss', numColors: 1, thresholds: [5], colors: ['#f59e0b'] },
  { name: 'Loss DL <10%', id: 'loss_dl_10', category: 'Loss', numColors: 1, thresholds: [10], colors: ['#ef4444'] },
  { name: 'TCP Retr <1%', id: 'tcp_retr_rate_1', category: 'TCP', numColors: 1, thresholds: [1], colors: ['#10b981'] },
  { name: 'TCP Retr <3%', id: 'tcp_retr_rate_3', category: 'TCP', numColors: 1, thresholds: [3], colors: ['#3b82f6'] },
  { name: 'TCP Retr <5%', id: 'tcp_retr_rate_5', category: 'TCP', numColors: 1, thresholds: [5], colors: ['#f59e0b'] },
  { name: 'TCP Retr <10%', id: 'tcp_retr_rate_10', category: 'TCP', numColors: 1, thresholds: [10], colors: ['#ef4444'] },
  { name: 'Out of Order Nbr', id: 'out_of_order_nbr', category: 'TCP', numColors: 4, thresholds: [10,50,200,1000], colors: ['#10b981','#3b82f6','#f59e0b','#ef4444'] },
  { name: 'Out of Order Rate', id: 'out_of_order_rate', category: 'TCP', numColors: 4, thresholds: [0.5,1,3,5], colors: ['#10b981','#3b82f6','#f59e0b','#ef4444'] },
  { name: 'Window Full Nbr', id: 'wind_full_nbr', category: 'TCP', numColors: 4, thresholds: [10,50,200,1000], colors: ['#10b981','#3b82f6','#f59e0b','#ef4444'] },
  { name: 'Window Full Rate', id: 'wind_full_rate', category: 'TCP', numColors: 4, thresholds: [5,15,30,50], colors: ['#10b981','#3b82f6','#f59e0b','#ef4444'] },
  { name: 'DMS DL >30 Mbps', id: 'dms_dl_30', category: 'DMS', numColors: 4, thresholds: [10,30,50,75], colors: ['#ef4444','#f59e0b','#3b82f6','#10b981'] },
  { name: 'DMS DL >8 Mbps', id: 'dms_dl_8', category: 'DMS', numColors: 4, thresholds: [30,50,70,90], colors: ['#ef4444','#f59e0b','#3b82f6','#10b981'] },
  { name: 'DMS DL >3 Mbps', id: 'dms_dl_3', category: 'DMS', numColors: 4, thresholds: [50,70,85,95], colors: ['#ef4444','#f59e0b','#3b82f6','#10b981'] },
  { name: 'DMS UL >5 Mbps', id: 'dms_ul_5', category: 'DMS', numColors: 4, thresholds: [20,40,60,80], colors: ['#ef4444','#f59e0b','#3b82f6','#10b981'] },
  { name: 'DMS UL >3 Mbps', id: 'dms_ul_3', category: 'DMS', numColors: 4, thresholds: [30,50,70,90], colors: ['#ef4444','#f59e0b','#3b82f6','#10b981'] },
  { name: 'DMS UL >1 Mbps', id: 'dms_ul_1', category: 'DMS', numColors: 4, thresholds: [50,70,85,95], colors: ['#ef4444','#f59e0b','#3b82f6','#10b981'] },
  { name: 'Sessions 3G/2G', id: 'session_3g2g_nbr', category: 'Sessions', numColors: 4, thresholds: [100,500,2000,10000], colors: ['#ef4444','#f59e0b','#3b82f6','#10b981'] },
  { name: 'Sessions 4G', id: 'session_4g_nbr', category: 'Sessions', numColors: 4, thresholds: [100,500,2000,10000], colors: ['#ef4444','#f59e0b','#3b82f6','#10b981'] },
  { name: 'Sessions 5G', id: 'session_5g_nbr', category: 'Sessions', numColors: 4, thresholds: [100,500,2000,10000], colors: ['#ef4444','#f59e0b','#3b82f6','#10b981'] },
  { name: 'Nb Sessions', id: 'session_nbr', category: 'Sessions', numColors: 4, thresholds: [100,500,2000,10000], colors: ['#ef4444','#f59e0b','#3b82f6','#10b981'] },
  { name: 'Durée Moy Session', id: 'session_dur_moy', category: 'Sessions', numColors: 4, thresholds: [10,30,60,120], colors: ['#ef4444','#f59e0b','#3b82f6','#10b981'] },
  { name: 'Session DCR', id: 'session_dcr', category: 'Sessions', numColors: 4, thresholds: [0.5,1,3,5], colors: ['#10b981','#3b82f6','#f59e0b','#ef4444'] },
  { name: 'Fallback 5G→4G Rate', id: 'fallback_5G_to_4G_rate', category: 'Mobility', numColors: 4, thresholds: [1,3,5,10], colors: ['#10b981','#3b82f6','#f59e0b','#ef4444'] },
  { name: 'Fallback 4G→3G/2G Rate', id: 'fallback_4G_to_3G2G_rate', category: 'Mobility', numColors: 4, thresholds: [1,3,5,10], colors: ['#10b981','#3b82f6','#f59e0b','#ef4444'] },
  { name: 'Instability Rate', id: 'instability_rate', category: 'Mobility', numColors: 4, thresholds: [1,3,5,10], colors: ['#10b981','#3b82f6','#f59e0b','#ef4444'] },
  { name: 'Nbr Fallback 5G→4G', id: 'nbr_fullback_5g_4g', category: 'Mobility', numColors: 4, thresholds: [10,50,200,1000], colors: ['#10b981','#3b82f6','#f59e0b','#ef4444'] },
  { name: 'Nbr Fallback 4G→3G/2G', id: 'nbr_fullback_4g_3g2g', category: 'Mobility', numColors: 4, thresholds: [10,50,200,1000], colors: ['#10b981','#3b82f6','#f59e0b','#ef4444'] },
  { name: 'Time RAT 5G %', id: 'time_rat_5g_%', category: 'RAT Time', numColors: 4, thresholds: [20,40,60,80], colors: ['#ef4444','#f59e0b','#3b82f6','#10b981'] },
  { name: 'Time RAT 4G %', id: 'time_rat_4g_%', category: 'RAT Time', numColors: 4, thresholds: [20,40,60,80], colors: ['#ef4444','#f59e0b','#3b82f6','#10b981'] },
  { name: 'Time RAT 3G/2G %', id: 'time_rat_3G2G_%', category: 'RAT Time', numColors: 4, thresholds: [1,5,10,20], colors: ['#10b981','#3b82f6','#f59e0b','#ef4444'] },
  { name: 'Bad Session Rate', id: 'bad_session_rate', category: 'QoE', numColors: 4, thresholds: [1,3,5,10], colors: ['#10b981','#3b82f6','#f59e0b','#ef4444'] },
  { name: 'Bad Session Nbr', id: 'bad_session_nbr', category: 'QoE', numColors: 4, thresholds: [10,50,200,1000], colors: ['#10b981','#3b82f6','#f59e0b','#ef4444'] },
  { name: 'QoE Index', id: 'qoe_index', category: 'QoE', numColors: 4, thresholds: [40,60,80,95], colors: ['#ef4444','#f59e0b','#3b82f6','#10b981'] },
  { name: '5G Capable Rate', id: '5G_capable_rate', category: 'QoE', numColors: 4, thresholds: [20,40,60,80], colors: ['#ef4444','#f59e0b','#3b82f6','#10b981'] },
  { name: '5GUE Attached 4G Rate', id: '5gue_attached_4G_rate', category: 'QoE', numColors: 4, thresholds: [5,15,30,50], colors: ['#10b981','#3b82f6','#f59e0b','#ef4444'] },
];

const MODULE_DEFS: { id: string; label: string; description: string; icon: React.ReactNode }[] = [
  { id: 'dashboard_overview', label: 'Dashboard Overview', description: 'Vue d\'ensemble des KPIs globaux', icon: <BarChart3 className="w-5 h-5" /> },
  { id: 'list', label: 'Live Monitor Map', description: 'Carte temps-réel des sites & cellules', icon: <Globe className="w-5 h-5" /> },
  { id: 'sites', label: 'Network Topology', description: 'Topologie réseau et inventaire sites', icon: <Server className="w-5 h-5" /> },
  { id: 'traffic', label: 'Analytic BI Studio', description: 'Tableaux de bord analytiques personnalisés', icon: <BarChart3 className="w-5 h-5" /> },
  { id: 'alerts', label: 'Alerts & RCA Monitor', description: 'Détection d\'anomalies et analyse causale', icon: <Bell className="w-5 h-5" /> },
  { id: 'detector', label: 'Detector Console', description: 'Console de détection ML avancée', icon: <Shield className="w-5 h-5" /> },
  { id: 'ai_assistant', label: 'QOEBIT AI', description: 'Assistant IA pour l\'analyse QoE', icon: <Zap className="w-5 h-5" /> },
  { id: 'radio_profile', label: 'Radio Profile', description: 'Profil de propagation RF et terrain', icon: <Radio className="w-5 h-5" /> },
  { id: 'topologie', label: 'Topologie Réseau', description: 'Gestion topologique du réseau', icon: <Antenna className="w-5 h-5" /> },
  { id: 'rag', label: 'RAG Knowledge Base', description: 'Base de connaissances documentaire', icon: <Database className="w-5 h-5" /> },
  { id: 'docs', label: 'Documentation', description: 'Documentation technique de la plateforme', icon: <FileSpreadsheet className="w-5 h-5" /> },
  { id: 'backend_admin', label: 'Backend Admin', description: 'Administration et configuration backend', icon: <Database className="w-5 h-5" /> },
];

const SettingsPanel: React.FC<SettingsPanelProps> = ({ sidebarTheme, setSidebarTheme, accentColor, setAccentColor, enabledModules, setEnabledModules }) => {
  const { datasets: csvDatasets, addDataset: addCsvDataset, removeDataset: removeCsvDataset } = useCSVData();
  const [results, setResults] = useState<LatencyResult[]>(
    ENDPOINTS.map(e => ({ endpoint: e.url, label: e.label, status: 'idle' }))
  );
  const [isTestingAll, setIsTestingAll] = useState(false);
  const [systemTime, setSystemTime] = useState(new Date());
  const [topoImporting, setTopoImporting] = useState(false);
  const [topoStatus, setTopoStatus] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);
  const [topoCount, setTopoCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvStatus, setCsvStatus] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);
  const [settingsTab, setSettingsTab] = useState<'style' | 'data' | 'system' | 'modules'>('style');
  const [metricSearch, setMetricSearch] = useState('');
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(() => new Set(METRICS_CONFIG.map(m => m.id)));
  const [editingMetric, setEditingMetric] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<MetricCategory>>(new Set());
  const [defaultTopoTech, setDefaultTopoTech] = useState<'ALL' | '4G' | '5G'>(() => (localStorage.getItem('qoebit_default_topo_tech') as any) || 'ALL');
  const [defaultMapStyle, setDefaultMapStyle] = useState<string>(() => localStorage.getItem('qoebit_default_map_style') || 'street');

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

  const toggleMetric = (id: string) => {
    setSelectedMetrics(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleCategoryMetrics = (category: MetricCategory) => {
    const categoryMetrics = metricsConfig.filter(m => m.category === category);
    const allSelected = categoryMetrics.every(m => selectedMetrics.has(m.id));
    setSelectedMetrics(prev => {
      const next = new Set(prev);
      categoryMetrics.forEach(m => { if (allSelected) next.delete(m.id); else next.add(m.id); });
      return next;
    });
  };

  const toggleCollapseCategory = (cat: MetricCategory) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
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

  const editingMetricData = editingMetric ? metricsConfig.find(m => m.id === editingMetric) : null;
  const editingMetricIdx = editingMetric ? metricsConfig.findIndex(m => m.id === editingMetric) : -1;

  const totalSelectedDims = Object.values(selectedDimensions).reduce((s, arr) => s + arr.length, 0);

  useEffect(() => {
    const interval = setInterval(() => setSystemTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Load topo count
  useEffect(() => {
    topoApi.count().then(count => {
      setTopoCount(count ?? 0);
    }).catch(() => setTopoCount(0));
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
          code_nidt: r['site_code'] || r['Code NIDT'] || r['code_nidt'] || '',
          nom_site: r['site_name'] || r['Nom Site'] || r['nom_site'] || '',
          region: r['nom_dr'] || r['Région'] || r['region'] || null,
          longitude: (r['longitude'] != null ? parseFloat(r['longitude']) : null),
          latitude: (r['latitude'] != null ? parseFloat(r['latitude']) : null),
          nom_cellule: r['cell_name'] || r['Nom Cellule'] || r['nom_cellule'] || '',
          techno: r['bande'] ? (String(r['bande']).toUpperCase().includes('NR') ? '5G' : String(r['bande']).toUpperCase().includes('LTE') ? '4G' : r['bande']) : (r['Techno'] || r['techno'] || null),
          bande: r['bande'] || r['Bande'] || null,
          constructeur: r['vendor'] || r['Constructeur'] || r['constructeur'] || null,
          azimut: r['azimut'] != null ? parseInt(r['azimut']) : (r['Azimut'] != null ? parseInt(r['Azimut']) : null),
          date_mes: parseDate(r['date_mest'] || r['Date MES'] || r['date_mes']),
          date_fn8: parseDate(r['date_fn8'] || r['Date FN8']),
          plaque: r['cluster'] || r['Plaque'] || r['plaque'] || null,
          hba: r['hba'] != null ? parseFloat(r['hba']) : (r['HBA'] != null ? parseInt(r['HBA']) : null),
          tac: r['NrTAC'] != null ? parseInt(r['NrTAC']) : (r['TAC'] != null ? parseInt(r['TAC']) : null),
        };
      });

      // Call API (local or cloud)
      const res = await fetch(getApiUrl('import-topo'), {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ rows, clear_before: true }),
      });
      const result = await res.json();
      if (result.error && !result.inserted) throw new Error(result.error);
      if (result.errors?.length) console.warn('[import-topo] Batch errors:', result.errors);

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
      await topoApi.remove();
      setTopoCount(0);
      setTopoStatus({ message: 'Données topologiques supprimées', type: 'info' });
    } catch (err: any) {
      setTopoStatus({ message: `Erreur: ${err.message}`, type: 'error' });
    } finally {
      setTopoImporting(false);
    }
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setCsvStatus({ message: 'Fichier trop volumineux (max 20 Mo)', type: 'error' });
      return;
    }
    setCsvUploading(true);
    setCsvStatus({ message: 'Lecture du fichier CSV...', type: 'info' });
    try {
      const text = await file.text();
      const lines = text.trim().split(/\r?\n/);
      if (lines.length < 2) throw new Error('Fichier vide ou invalide');
      const sep = lines[0].includes(';') ? ';' : ',';
      const columns = lines[0].split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
      const rows: Record<string, any>[] = [];
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(sep).map(v => v.trim().replace(/^"|"$/g, ''));
        const row: Record<string, any> = {};
        columns.forEach((col, ci) => {
          const val = values[ci] ?? '';
          const num = Number(val);
          row[col] = val !== '' && !isNaN(num) ? num : val;
        });
        rows.push(row);
      }
      const ds: CSVDataset = {
        id: `csv_${Date.now()}`,
        filename: file.name,
        columns,
        rows,
        uploadedAt: new Date().toISOString(),
      };
      addCsvDataset(ds);
      setCsvStatus({ message: `✓ "${file.name}" chargé : ${rows.length} lignes, ${columns.length} colonnes`, type: 'success' });
    } catch (err: any) {
      setCsvStatus({ message: `Erreur: ${err.message}`, type: 'error' });
    } finally {
      setCsvUploading(false);
      if (csvInputRef.current) csvInputRef.current.value = '';
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
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Configuration & Diagnostics • QOEBIT Platform</p>
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
          { id: 'modules' as const, label: 'Modules', icon: <Eye className="w-4 h-4" /> },
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

        {/* Topo Technology & Map Style */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Technology Switch */}
          <div className="bg-card rounded-3xl border border-border p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Antenna className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-[13px] font-black text-foreground uppercase tracking-wider">Technologie Topo</h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Filtre technologie par défaut sur la carte</p>
              </div>
            </div>
            <div className="flex gap-3">
              {(['ALL', '4G', '5G'] as const).map((tech) => (
                <button
                  key={tech}
                  onClick={() => {
                    localStorage.setItem('qoebit_default_topo_tech', tech);
                    setDefaultTopoTech(tech);
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl border-2 transition-all text-[12px] font-black uppercase tracking-wider ${
                    defaultTopoTech === tech
                      ? 'border-primary bg-primary/10 text-primary shadow-lg'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  {tech === 'ALL' && <Globe className="w-4 h-4" />}
                  {tech === '4G' && <Signal className="w-4 h-4" />}
                  {tech === '5G' && <Antenna className="w-4 h-4" />}
                  {tech}
                </button>
              ))}
            </div>
          </div>

          {/* Map Style Selector */}
          <div className="bg-card rounded-3xl border border-border p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-[13px] font-black text-foreground uppercase tracking-wider">Style de Carte</h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Fond de carte par défaut</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {([
                { id: 'street', label: 'Street', icon: <Globe className="w-4 h-4" />, preview: 'bg-[hsl(210,20%,95%)]' },
                { id: 'satellite', label: 'Satellite', icon: <Globe className="w-4 h-4" />, preview: 'bg-[hsl(210,30%,20%)]' },
                { id: 'dark', label: 'Dark', icon: <Moon className="w-4 h-4" />, preview: 'bg-[hsl(220,40%,13%)]' },
                { id: 'light', label: 'Light', icon: <Sun className="w-4 h-4" />, preview: 'bg-[hsl(210,15%,97%)]' },
              ] as const).map((style) => (
                <button
                  key={style.id}
                  onClick={() => {
                    localStorage.setItem('qoebit_default_map_style', style.id);
                    setDefaultMapStyle(style.id);
                  }}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all ${
                    defaultMapStyle === style.id
                      ? 'border-primary bg-primary/5 shadow-lg'
                      : 'border-border hover:border-primary/40 bg-card'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg ${style.preview} border border-border/50 shadow-inner flex items-center justify-center`}>
                    <span className={`${style.id === 'dark' || style.id === 'satellite' ? 'text-white/50' : 'text-black/30'}`}>{style.icon}</span>
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-wider ${defaultMapStyle === style.id ? 'text-primary' : 'text-muted-foreground'}`}>{style.label}</span>
                </button>
              ))}
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

        {/* QoE Data CSV Upload — compact inline */}
        <div className="bg-card rounded-2xl border border-border px-6 py-4 shadow-sm">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileSpreadsheet className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="text-[12px] font-semibold text-foreground">Données QoE</h3>
                <p className="text-[10px] text-muted-foreground">Importer des fichiers CSV pour le BI Studio</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input ref={csvInputRef} type="file" accept=".csv,.txt" onChange={handleCsvUpload} className="hidden" />
              <button
                onClick={() => csvInputRef.current?.click()}
                disabled={csvUploading}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-primary/90 transition-all disabled:opacity-50"
              >
                {csvUploading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {csvUploading ? 'Import...' : 'Importer CSV'}
              </button>
              {csvDatasets.length > 0 && (
                <>
                  <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-lg">{csvDatasets.length} fichier(s)</span>
                  <button
                    onClick={() => { csvDatasets.forEach(d => removeCsvDataset(d.id)); setCsvStatus({ message: 'Fichiers supprimés', type: 'info' }); }}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                    title="Supprimer tous les fichiers"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>

          {csvStatus && (
            <div className={`mt-3 px-3 py-2 rounded-lg text-[10px] font-medium ${
              csvStatus.type === 'success' ? 'bg-emerald-500/10 text-emerald-600' :
              csvStatus.type === 'error' ? 'bg-red-500/10 text-red-500' :
              'bg-primary/10 text-primary'
            }`}>
              {csvStatus.message}
            </div>
          )}

          {csvDatasets.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {csvDatasets.map((ds) => (
                <div key={ds.id} className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5">
                  <FileSpreadsheet className="w-3 h-3 text-primary" />
                  <span className="text-[10px] font-medium text-foreground">{ds.filename}</span>
                  <span className="text-[9px] text-muted-foreground">{ds.rows.length}r · {ds.columns.length}c</span>
                  <button onClick={() => removeCsvDataset(ds.id)} className="p-0.5 hover:text-red-500 text-muted-foreground">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        </>)}
        {settingsTab === 'data' && (<>
        <div className="bg-card rounded-3xl border border-border p-8 shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-8">

            {/* LEFT: Dimensions */}
            <div className="space-y-6 border-r border-border/50 pr-6">
              {DIMENSIONS_CONFIG.map((dim) => {
                const selected = selectedDimensions[dim.title] || [];
                return (
                  <div key={dim.title}>
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="text-primary">{dim.icon}</div>
                      <span className="text-xs font-bold text-foreground uppercase tracking-wider">{dim.title}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {dim.values.map((v) => {
                        const isSelected = selected.includes(v);
                        return (
                          <button
                            key={v}
                            onClick={() => toggleDimensionValue(dim.title, v)}
                            className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                              isSelected
                                ? 'bg-foreground text-background'
                                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                            }`}
                          >
                            <span className="uppercase text-[11px] tracking-wide">{v}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* RIGHT: Metrics Definition Grid */}
            <div>
              <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="text-muted-foreground">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-foreground uppercase tracking-wider">Metrics Definition Grid</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedMetrics(new Set(metricsConfig.map(m => m.id)))}
                    className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[11px] font-semibold hover:bg-primary/20 transition-all"
                  >
                    Tout sélectionner
                  </button>
                  <button
                    onClick={() => setSelectedMetrics(new Set())}
                    className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-[11px] font-semibold hover:bg-muted/80 transition-all"
                  >
                    Tout désélectionner
                  </button>
                  <div className="relative ml-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Filter metrics..."
                      value={metricSearch}
                      onChange={e => setMetricSearch(e.target.value)}
                      className="pl-9 pr-4 py-2 rounded-lg bg-muted/40 border border-border/50 text-xs font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-all w-48"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-0 divide-y divide-border/40">
                {filteredMetrics.map((metric) => {
                  const isActive = selectedMetrics.has(metric.id);
                  return (
                    <div key={metric.id} className={`flex items-center gap-4 py-3.5 px-2 transition-all ${!isActive ? 'opacity-40' : ''}`}>
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleMetric(metric.id)}
                        className={`w-7 h-7 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                          isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-primary/20'
                        }`}
                      >
                        {isActive && <Check className="w-3.5 h-3.5" />}
                      </button>

                      {/* Name & ID */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>{metric.name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{metric.id.toUpperCase()}</p>
                      </div>

                      {/* Color preview mini-bar */}
                      <div className="flex rounded overflow-hidden h-3 w-28 flex-shrink-0">
                        {metric.colors.map((c, i) => (
                          <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                        ))}
                      </div>

                      {/* Category badge */}
                      <span className="text-[10px] font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-md flex-shrink-0">{metric.category}</span>

                      {/* Edit popup trigger */}
                      <button
                        onClick={() => setEditingMetric(metric.id)}
                        className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all flex-shrink-0"
                        title="Éditer seuils & couleurs"
                      >
                        <Palette className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {filteredMetrics.length === 0 && (
                <div className="text-center py-12 text-sm text-muted-foreground">Aucune métrique trouvée</div>
              )}
            </div>
          </div>

          {/* === Color Edit Popup/Modal === */}
          {editingMetricData && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setEditingMetric(null)}>
              <div className="bg-card rounded-2xl border border-border shadow-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-base font-bold text-foreground">{editingMetricData.name}</h3>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{editingMetricData.id}</p>
                  </div>
                  <button onClick={() => setEditingMetric(null)} className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-all">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs font-medium text-muted-foreground mb-4">
                  {editingMetricData.numColors} plage{editingMetricData.numColors > 1 ? 's' : ''} de couleur
                </p>

                <div className="space-y-3">
                  {editingMetricData.thresholds.map((t, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                      <div className="relative w-9 h-9 rounded-lg cursor-pointer overflow-hidden border border-border/50 flex-shrink-0" style={{ backgroundColor: editingMetricData.colors[i] }}>
                        <input
                          type="color"
                          value={editingMetricData.colors[i]}
                          onChange={e => updateMetricColor(editingMetricIdx, i, e.target.value)}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Seuil {i + 1}</label>
                        <input
                          type="number"
                          value={t}
                          onChange={e => updateMetricThreshold(editingMetricIdx, i, parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-1.5 rounded-md bg-card border border-border text-xs font-semibold text-foreground focus:outline-none focus:border-primary/50"
                        />
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground">{editingMetricData.colors[i]}</span>
                    </div>
                  ))}
                </div>

                {/* Preview bar */}
                <div className="mt-4">
                  <p className="text-[10px] font-medium text-muted-foreground mb-2">Aperçu</p>
                  <div className="flex rounded-lg overflow-hidden h-5">
                    {editingMetricData.colors.map((c, i) => (
                      <div key={i} className="flex-1 flex items-center justify-center text-[9px] font-semibold text-white" style={{ backgroundColor: c }}>
                        {editingMetricData.thresholds[i]}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 mt-5">
                  <button
                    onClick={() => setEditingMetric(null)}
                    className="flex-1 py-2.5 bg-muted text-muted-foreground rounded-lg text-xs font-semibold hover:bg-muted/80 transition-all"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={() => setEditingMetric(null)}
                    className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-all"
                  >
                    ✓ Confirmer
                  </button>
                </div>
              </div>
            </div>
          )}
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
              <DetailRow label="Plateforme" value="QOEBIT QoE Observatory" />
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

        {/* ===== MODULES TAB ===== */}
        {settingsTab === 'modules' && (<>
        <div className="bg-card rounded-3xl border border-border p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Eye className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-[13px] font-black text-foreground uppercase tracking-wider">Gestion des Modules</h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Activer / Désactiver les modules de la sidebar</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const allOn: Record<string, boolean> = {};
                  MODULE_DEFS.forEach(m => { allOn[m.id] = true; });
                  setEnabledModules(allOn);
                }}
                className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider bg-primary/10 text-primary hover:bg-primary/20 transition-all"
              >
                Tout Activer
              </button>
              <button
                onClick={() => {
                  const allOff: Record<string, boolean> = {};
                  MODULE_DEFS.forEach(m => { allOff[m.id] = false; });
                  setEnabledModules(allOff);
                }}
                className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider bg-muted text-muted-foreground hover:bg-muted/80 transition-all"
              >
                Tout Désactiver
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {MODULE_DEFS.map((mod) => {
              const isOn = enabledModules[mod.id] !== false;
              return (
                <button
                  key={mod.id}
                  onClick={() => setEnabledModules({ ...enabledModules, [mod.id]: !isOn })}
                  className={`flex items-center gap-4 p-5 rounded-2xl border transition-all text-left group ${
                    isOn
                      ? 'bg-primary/5 border-primary/30 hover:border-primary/50'
                      : 'bg-muted/30 border-border opacity-60 hover:opacity-80'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                    isOn ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  }`}>
                    {mod.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[12px] font-black uppercase tracking-wider ${isOn ? 'text-foreground' : 'text-muted-foreground'}`}>{mod.label}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{mod.description}</p>
                  </div>
                  <div className={`w-10 h-6 rounded-full flex items-center px-0.5 transition-all shrink-0 ${
                    isOn ? 'bg-primary justify-end' : 'bg-muted-foreground/30 justify-start'
                  }`}>
                    <div className="w-5 h-5 rounded-full bg-white shadow-sm" />
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-6 text-center">
            Les modules désactivés n'apparaîtront plus dans la barre latérale. Le module Settings reste toujours accessible.
          </p>
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
