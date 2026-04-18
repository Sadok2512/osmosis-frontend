import React, { useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Database,
  Eye,
  Globe,
  LibraryBig,
  Monitor,
  Moon,
  Palette,
  Radio,
  Server,
  Settings,
  Sun,
  Zap,
} from 'lucide-react';
import type { SidebarTheme, AccentColor } from '../../pages/Index';

interface SettingsPanelProps {
  sidebarTheme: SidebarTheme;
  setSidebarTheme: (t: SidebarTheme) => void;
  accentColor: AccentColor;
  setAccentColor: (c: AccentColor) => void;
  enabledModules: Record<string, boolean>;
  setEnabledModules: (m: Record<string, boolean>) => void;
}

const SIDEBAR_THEMES: { id: SidebarTheme; label: string; icon: React.ReactNode; preview: string }[] = [
  { id: 'dark', label: 'Dark', icon: <Moon className="w-4 h-4" />, preview: 'bg-[hsl(220,50%,12%)]' },
  { id: 'grey', label: 'Grey', icon: <Monitor className="w-4 h-4" />, preview: 'bg-[hsl(220,10%,40%)]' },
  { id: 'light', label: 'Light', icon: <Sun className="w-4 h-4" />, preview: 'bg-[hsl(220,20%,95%)]' },
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

const MODULE_DEFS: { id: string; label: string; description: string; icon: React.ReactNode }[] = [
  { id: 'ai_assistant', label: 'OSMOSIS AI', description: 'Assistant IA pour l\'analyse QoE', icon: <Zap className="w-5 h-5" /> },
  { id: 'dashboard_overview', label: 'Dashboard Overview', description: 'Vue d\'ensemble des KPIs globaux', icon: <BarChart3 className="w-5 h-5" /> },
  { id: 'list', label: 'Live Monitor Map', description: 'Carte temps-réel des sites et cellules', icon: <Globe className="w-5 h-5" /> },
  { id: 'traffic', label: 'Analytic QoE', description: 'Analyse avancée et tableaux de bord', icon: <Activity className="w-5 h-5" /> },
  { id: 'kpi_monitor', label: 'KPI Monitor', description: 'Référentiel KPI réseau existant', icon: <Activity className="w-5 h-5" /> },
  { id: 'kpi_reference2', label: 'KPI Reference 2', description: 'Nouveau référentiel KPI avec flux modernisé', icon: <LibraryBig className="w-5 h-5" /> },
  { id: 'detector', label: 'Detector Console', description: 'Détection avancée et RCA', icon: <Server className="w-5 h-5" /> },
  { id: 'sentinel', label: 'ML Detector', description: 'Détection ML et clustering', icon: <Radio className="w-5 h-5" /> },
  { id: 'radio_profile', label: 'Radio Profile', description: 'Profil radio et couverture', icon: <Radio className="w-5 h-5" /> },
  { id: 'topologie', label: 'Parameters HUB', description: 'Paramètres et topologie', icon: <Server className="w-5 h-5" /> },
  { id: 'ran_query', label: 'RAN Query', description: 'Création et exécution de rapports KPI / counter', icon: <BarChart3 className="w-5 h-5" /> },
  { id: 'docs', label: 'Network References', description: 'Référentiel réseau', icon: <Database className="w-5 h-5" /> },
  { id: 'backend_admin', label: 'Backend Admin', description: 'Administration backend', icon: <Database className="w-5 h-5" /> },
  { id: 'topology', label: 'Topology', description: 'Visualisation réseau', icon: <Globe className="w-5 h-5" /> },
];

const SectionCard: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <section className="rounded-3xl border border-border bg-card p-8 shadow-sm">
    <div className="mb-6">
      <h3 className="text-[13px] font-black uppercase tracking-wider text-foreground">{title}</h3>
      {description && <p className="mt-1 text-[11px] text-muted-foreground">{description}</p>}
    </div>
    {children}
  </section>
);

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  sidebarTheme,
  setSidebarTheme,
  accentColor,
  setAccentColor,
  enabledModules,
  setEnabledModules,
}) => {
  const [tab, setTab] = useState<'style' | 'modules' | 'system'>('style');

  const enabledCount = useMemo(
    () => MODULE_DEFS.filter(mod => enabledModules[mod.id] !== false).length,
    [enabledModules]
  );

  return (
    <div className="flex-1 h-full overflow-y-auto bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-card/95 px-10 py-8 backdrop-blur">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Settings className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tight text-foreground">Paramètres Système</h1>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Configuration visuelle et modules OSMOSIS
              </p>
            </div>
          </div>
          <div className="rounded-2xl bg-primary/10 px-4 py-3 text-right">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Modules actifs</p>
            <p className="text-lg font-black text-foreground">{enabledCount}</p>
          </div>
        </div>
      </div>

      <div className="border-b border-border bg-card px-10 pt-4">
        <div className="flex gap-2">
          {[
            { id: 'style' as const, label: 'Style', icon: <Palette className="w-4 h-4" /> },
            { id: 'modules' as const, label: 'Modules', icon: <Eye className="w-4 h-4" /> },
            { id: 'system' as const, label: 'System', icon: <Monitor className="w-4 h-4" /> },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex items-center gap-2 rounded-t-xl px-5 py-3 text-[11px] font-black uppercase tracking-widest transition-all ${
                tab === item.id
                  ? 'border border-border border-b-0 bg-background text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-6 p-10 pb-24">
        {tab === 'style' && (
          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard title="Sidebar Theme" description="Choisissez le thème de la barre latérale OSMOSIS.">
              <div className="grid gap-3 md:grid-cols-3">
                {SIDEBAR_THEMES.map(theme => (
                  <button
                    key={theme.id}
                    onClick={() => setSidebarTheme(theme.id)}
                    className={`rounded-2xl border p-4 text-left transition-all ${
                      sidebarTheme === theme.id
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <div className={`mb-3 h-20 rounded-xl border border-border/40 ${theme.preview}`} />
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                      {theme.icon}
                      {theme.label}
                    </div>
                  </button>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Accent Color" description="Définissez la couleur d’accent principale de l’interface.">
              <div className="grid gap-3 md:grid-cols-3">
                {ACCENT_COLORS.map(color => (
                  <button
                    key={color.id}
                    onClick={() => setAccentColor(color.id)}
                    className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-all ${
                      accentColor === color.id
                        ? 'border-foreground/40 bg-muted shadow-sm'
                        : 'border-border hover:border-foreground/20'
                    }`}
                  >
                    <div className={`h-8 w-8 rounded-full ${color.color}`} />
                    <span className="text-sm font-bold text-foreground">{color.label}</span>
                  </button>
                ))}
              </div>
            </SectionCard>
          </div>
        )}

        {tab === 'modules' && (
          <SectionCard title="Gestion des Modules" description="Activez ou désactivez les entrées visibles dans la sidebar.">
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <button
                onClick={() => {
                  const next: Record<string, boolean> = {};
                  MODULE_DEFS.forEach(mod => {
                    next[mod.id] = true;
                  });
                  setEnabledModules(next);
                }}
                className="rounded-xl bg-primary/10 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-primary transition-all hover:bg-primary/20"
              >
                Tout Activer
              </button>
              <button
                onClick={() => {
                  const next: Record<string, boolean> = {};
                  MODULE_DEFS.forEach(mod => {
                    next[mod.id] = false;
                  });
                  setEnabledModules(next);
                }}
                className="rounded-xl bg-muted px-4 py-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground transition-all hover:bg-muted/80"
              >
                Tout Désactiver
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {MODULE_DEFS.map(mod => {
                const isEnabled = enabledModules[mod.id] !== false;
                return (
                  <button
                    key={mod.id}
                    onClick={() => setEnabledModules({ ...enabledModules, [mod.id]: !isEnabled })}
                    className={`flex items-center gap-4 rounded-2xl border p-5 text-left transition-all ${
                      isEnabled
                        ? 'border-primary/30 bg-primary/5 hover:border-primary/50'
                        : 'border-border bg-muted/30 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isEnabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {mod.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[12px] font-black uppercase tracking-wider ${isEnabled ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {mod.label}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{mod.description}</p>
                    </div>
                    <div className={`h-6 w-10 rounded-full px-0.5 transition-all ${isEnabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                      <div className={`mt-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${isEnabled ? 'ml-auto' : ''}`} />
                    </div>
                  </button>
                );
              })}
            </div>
          </SectionCard>
        )}

        {tab === 'system' && (
          <div className="grid gap-6 xl:grid-cols-3">
            <SectionCard title="Platform" description="Résumé rapide de la plateforme OSMOSIS.">
              <div className="space-y-4 text-sm">
                <div className="rounded-2xl bg-muted/40 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Framework</p>
                  <p className="mt-2 font-bold text-foreground">React 18 + TypeScript</p>
                </div>
                <div className="rounded-2xl bg-muted/40 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Analytics</p>
                  <p className="mt-2 font-bold text-foreground">Recharts / Telecom dashboards</p>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="UI State" description="Configuration actuellement appliquée.">
              <div className="space-y-4 text-sm">
                <div className="rounded-2xl bg-muted/40 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sidebar Theme</p>
                  <p className="mt-2 font-bold text-foreground">{sidebarTheme}</p>
                </div>
                <div className="rounded-2xl bg-muted/40 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Accent Color</p>
                  <p className="mt-2 font-bold text-foreground">{accentColor}</p>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="KPI Reference 2" description="Nouveau référentiel KPI en frontend, séparé du module KPI Monitor existant.">
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Frontend only</p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  KPI Reference 2 apporte une vue plus propre, un flux list → open → review → edit, et un workspace inférieur dédié sans casser les fonctionnalités existantes.
                </p>
              </div>
            </SectionCard>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsPanel;