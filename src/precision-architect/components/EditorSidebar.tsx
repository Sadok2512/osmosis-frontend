import { useState } from 'react';
import {
  X,
  ChevronDown,
  ChevronRight,
  Check as Apply,
  RefreshCcw as Reset,
  Save,
  Settings2,
  Palette,
  LayoutGrid,
  PanelTop,
  SlidersHorizontal,
  Sparkles,
  Eye,
  EyeOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePAReportStore } from '../stores/paReportStore';
import { DEFAULT_DASHBOARD_THEME, type DashboardTheme, type PAPage } from '../types';
import { toast } from 'sonner';

interface EditorSidebarProps {
  onClose: () => void;
}

type SectionKey = 'general' | 'appearance' | 'layout' | 'header' | 'behavior' | 'advanced';

interface DashboardConfig {
  // General
  name: string;
  description: string;
  reportType: string;
  // Appearance — extends DashboardTheme
  textColor: string;
  backgroundColor: string;
  cardColor: string;
  titleColor: string;
  accentColor: string;
  fontFamily: 'inter' | 'roboto' | 'system' | 'mono';
  borderRadius: number;
  // Layout
  pageWidth: 'fixed' | 'full';
  spacing: number;
  columns: number;
  padding: number;
  // Header
  showLogo: boolean;
  logoUrl: string;
  operatorName: string;
  showDate: boolean;
  headerAlign: 'left' | 'center' | 'right';
  headerBg: string;
  // Behavior
  showSectionNav: boolean;
  showFilters: boolean;
  hideEmptySections: boolean;
  defaultViewMode: 'edit' | 'view' | 'presentation';
  // Advanced
  visibility: 'private' | 'public';
  themePreset: 'custom' | 'light' | 'dark' | 'premium';
}

const DEFAULT_CONFIG: DashboardConfig = {
  name: '',
  description: '',
  reportType: '',
  textColor: '#0f172a',
  backgroundColor: '#f8fafc',
  cardColor: '#ffffff',
  titleColor: '#00685f',
  accentColor: DEFAULT_DASHBOARD_THEME.accentColor,
  fontFamily: 'inter',
  borderRadius: 16,
  pageWidth: 'fixed',
  spacing: 16,
  columns: 12,
  padding: 32,
  showLogo: true,
  logoUrl: '',
  operatorName: 'Network Manager',
  showDate: true,
  headerAlign: 'left',
  headerBg: '#ffffff',
  showSectionNav: true,
  showFilters: true,
  hideEmptySections: false,
  defaultViewMode: 'edit',
  visibility: 'private',
  themePreset: 'custom',
};

function readConfigFromPage(page: PAPage | undefined, projectName: string): DashboardConfig {
  const theme = page?.theme ?? DEFAULT_DASHBOARD_THEME;
  return {
    ...DEFAULT_CONFIG,
    name: projectName,
    accentColor: theme.accentColor,
    backgroundColor:
      theme.background === 'dark' ? '#0f172a' : theme.background === 'gradient' ? '#1a1a2e' : '#f8fafc',
    titleColor: theme.accentColor,
  };
}

interface CollapsibleSectionProps {
  id: SectionKey;
  title: string;
  icon: typeof Settings2;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function CollapsibleSection({ title, icon: Icon, open, onToggle, children }: CollapsibleSectionProps) {
  return (
    <section className="border border-outline-variant/15 rounded-xl bg-white overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-container-low transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Icon className="w-4 h-4 text-primary" />
          <span className="text-xs font-black uppercase tracking-widest text-on-surface">{title}</span>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-on-surface-variant" /> : <ChevronRight className="w-4 h-4 text-on-surface-variant" />}
      </button>
      {open && <div className="px-4 pb-4 pt-1 space-y-3 border-t border-outline-variant/10">{children}</div>}
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/70 block mb-1.5">{children}</label>;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-9 h-9 rounded-lg border border-outline-variant/30 cursor-pointer bg-transparent"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-outline-variant/30 bg-surface-container-low focus:outline-none focus:border-primary"
        />
      </div>
    </div>
  );
}

function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="w-full flex items-center justify-between py-2 px-3 rounded-lg hover:bg-surface-container-low transition-colors"
    >
      <span className="text-xs font-bold text-on-surface">{label}</span>
      <div className={cn("w-9 h-5 rounded-full p-0.5 transition-colors", value ? "bg-primary" : "bg-outline-variant/40")}>
        <div className={cn("w-4 h-4 bg-white rounded-full shadow-sm transition-transform", value && "translate-x-4")} />
      </div>
    </button>
  );
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="grid gap-1 p-1 bg-surface-container-low rounded-lg" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "text-[10px] font-black uppercase tracking-widest py-2 rounded-md transition-all",
            value === o.value ? "bg-white text-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function EditorSidebar({ onClose }: EditorSidebarProps) {
  const projectName = usePAReportStore((s) => s.projectName);
  const setProjectName = usePAReportStore((s) => s.setProjectName);
  const pages = usePAReportStore((s) => s.pages);
  const activePageId = usePAReportStore((s) => s.activePageId);
  const setPages = usePAReportStore((s) => s.setPages);
  const markSaved = usePAReportStore((s) => s.markSaved);

  const activePage = pages.find((p) => p.id === activePageId);

  const [config, setConfig] = useState<DashboardConfig>(() => readConfigFromPage(activePage, projectName));
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    general: true,
    appearance: true,
    layout: false,
    header: false,
    behavior: false,
    advanced: false,
  });

  const toggle = (k: SectionKey) => setOpenSections((s) => ({ ...s, [k]: !s[k] }));
  const update = <K extends keyof DashboardConfig>(k: K, v: DashboardConfig[K]) => setConfig((c) => ({ ...c, [k]: v }));

  const applyConfig = () => {
    setProjectName(config.name || projectName);
    const newTheme: DashboardTheme = {
      background:
        config.backgroundColor === '#0f172a' || config.themePreset === 'dark'
          ? 'dark'
          : config.themePreset === 'premium'
            ? 'gradient'
            : 'light',
      accentColor: config.accentColor,
      pageTitle: config.name,
      pageSubtitle: config.description,
      showPageHeader: !!(config.name || config.description),
    };
    setPages((prev) => prev.map((p) => (p.id === activePageId ? { ...p, theme: newTheme } : p)));
    toast.success('Dashboard settings applied');
  };

  const saveAll = () => {
    applyConfig();
    markSaved();
    toast.success('Dashboard saved');
  };

  const resetAll = () => {
    setConfig(readConfigFromPage(activePage, projectName));
    toast.info('Settings reset');
  };

  return (
    <aside className="w-[400px] bg-surface-container-low h-full shadow-2xl z-50 border-l border-outline-variant/20 flex flex-col">
      <header className="flex items-center justify-between px-6 py-5 border-b border-outline-variant/10 bg-white">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">Configuring</p>
          <h3 className="text-lg font-black font-headline text-on-surface">Dashboard Report</h3>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant" aria-label="Close panel">
          <X className="w-5 h-5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
        {/* GENERAL */}
        <CollapsibleSection id="general" title="General" icon={Settings2} open={openSections.general} onToggle={() => toggle('general')}>
          <div>
            <FieldLabel>Dashboard / Report Name</FieldLabel>
            <input
              type="text"
              value={config.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="Network Health · Q4 Report"
              className="w-full px-3 py-2 text-sm rounded-lg border border-outline-variant/30 bg-white focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <FieldLabel>Subtitle / Description</FieldLabel>
            <textarea
              value={config.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="Optional description shown under the title"
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg border border-outline-variant/30 bg-white focus:outline-none focus:border-primary resize-none"
            />
          </div>
          <div>
            <FieldLabel>Report type</FieldLabel>
            <input
              type="text"
              value={config.reportType}
              onChange={(e) => update('reportType', e.target.value)}
              placeholder="e.g. Quarterly review"
              className="w-full px-3 py-2 text-sm rounded-lg border border-outline-variant/30 bg-white focus:outline-none focus:border-primary"
            />
          </div>
        </CollapsibleSection>

        {/* APPEARANCE */}
        <CollapsibleSection id="appearance" title="Appearance" icon={Palette} open={openSections.appearance} onToggle={() => toggle('appearance')}>
          <ColorField label="Title color" value={config.titleColor} onChange={(v) => update('titleColor', v)} />
          <ColorField label="Text color" value={config.textColor} onChange={(v) => update('textColor', v)} />
          <ColorField label="Background color" value={config.backgroundColor} onChange={(v) => update('backgroundColor', v)} />
          <ColorField label="Card / section color" value={config.cardColor} onChange={(v) => update('cardColor', v)} />
          <ColorField label="Accent color" value={config.accentColor} onChange={(v) => update('accentColor', v)} />
          <div>
            <FieldLabel>Font family</FieldLabel>
            <SegmentedControl
              value={config.fontFamily}
              onChange={(v) => update('fontFamily', v)}
              options={[
                { value: 'inter', label: 'Inter' },
                { value: 'roboto', label: 'Roboto' },
                { value: 'system', label: 'System' },
                { value: 'mono', label: 'Mono' },
              ]}
            />
          </div>
          <div>
            <FieldLabel>Border radius — {config.borderRadius}px</FieldLabel>
            <input
              type="range"
              min={0}
              max={32}
              value={config.borderRadius}
              onChange={(e) => update('borderRadius', Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
        </CollapsibleSection>

        {/* LAYOUT */}
        <CollapsibleSection id="layout" title="Layout" icon={LayoutGrid} open={openSections.layout} onToggle={() => toggle('layout')}>
          <div>
            <FieldLabel>Page width</FieldLabel>
            <SegmentedControl
              value={config.pageWidth}
              onChange={(v) => update('pageWidth', v)}
              options={[
                { value: 'fixed', label: 'Fixed' },
                { value: 'full', label: 'Full' },
              ]}
            />
          </div>
          <div>
            <FieldLabel>Spacing — {config.spacing}px</FieldLabel>
            <input type="range" min={0} max={48} value={config.spacing} onChange={(e) => update('spacing', Number(e.target.value))} className="w-full accent-primary" />
          </div>
          <div>
            <FieldLabel>Columns (desktop) — {config.columns}</FieldLabel>
            <input type="range" min={4} max={16} value={config.columns} onChange={(e) => update('columns', Number(e.target.value))} className="w-full accent-primary" />
          </div>
          <div>
            <FieldLabel>Page padding — {config.padding}px</FieldLabel>
            <input type="range" min={0} max={80} value={config.padding} onChange={(e) => update('padding', Number(e.target.value))} className="w-full accent-primary" />
          </div>
        </CollapsibleSection>

        {/* HEADER */}
        <CollapsibleSection id="header" title="Header" icon={PanelTop} open={openSections.header} onToggle={() => toggle('header')}>
          <ToggleField label="Show logo" value={config.showLogo} onChange={(v) => update('showLogo', v)} />
          <div>
            <FieldLabel>Logo URL</FieldLabel>
            <input
              type="text"
              value={config.logoUrl}
              onChange={(e) => update('logoUrl', e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-outline-variant/30 bg-white focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <FieldLabel>Operator name</FieldLabel>
            <input
              type="text"
              value={config.operatorName}
              onChange={(e) => update('operatorName', e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-outline-variant/30 bg-white focus:outline-none focus:border-primary"
            />
          </div>
          <ToggleField label="Show date" value={config.showDate} onChange={(v) => update('showDate', v)} />
          <div>
            <FieldLabel>Header alignment</FieldLabel>
            <SegmentedControl
              value={config.headerAlign}
              onChange={(v) => update('headerAlign', v)}
              options={[
                { value: 'left', label: 'Left' },
                { value: 'center', label: 'Center' },
                { value: 'right', label: 'Right' },
              ]}
            />
          </div>
          <ColorField label="Header background" value={config.headerBg} onChange={(v) => update('headerBg', v)} />
        </CollapsibleSection>

        {/* BEHAVIOR */}
        <CollapsibleSection id="behavior" title="Behavior" icon={SlidersHorizontal} open={openSections.behavior} onToggle={() => toggle('behavior')}>
          <ToggleField label="Show section navigation" value={config.showSectionNav} onChange={(v) => update('showSectionNav', v)} />
          <ToggleField label="Show filters" value={config.showFilters} onChange={(v) => update('showFilters', v)} />
          <ToggleField label="Hide empty sections" value={config.hideEmptySections} onChange={(v) => update('hideEmptySections', v)} />
          <div>
            <FieldLabel>Default view mode</FieldLabel>
            <SegmentedControl
              value={config.defaultViewMode}
              onChange={(v) => update('defaultViewMode', v)}
              options={[
                { value: 'edit', label: 'Edit' },
                { value: 'view', label: 'View' },
                { value: 'presentation', label: 'Present' },
              ]}
            />
          </div>
        </CollapsibleSection>

        {/* ADVANCED */}
        <CollapsibleSection id="advanced" title="Advanced" icon={Sparkles} open={openSections.advanced} onToggle={() => toggle('advanced')}>
          <div>
            <FieldLabel>Theme preset</FieldLabel>
            <SegmentedControl
              value={config.themePreset}
              onChange={(v) => update('themePreset', v)}
              options={[
                { value: 'custom', label: 'Custom' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'premium', label: 'Premium' },
              ]}
            />
          </div>
          <div>
            <FieldLabel>Visibility</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => update('visibility', 'private')}
                className={cn(
                  "flex items-center justify-center gap-2 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-widest border-2 transition-all",
                  config.visibility === 'private'
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-outline-variant/30 text-on-surface-variant hover:border-primary/30"
                )}
              >
                <EyeOff className="w-3.5 h-3.5" />
                Private
              </button>
              <button
                onClick={() => update('visibility', 'public')}
                className={cn(
                  "flex items-center justify-center gap-2 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-widest border-2 transition-all",
                  config.visibility === 'public'
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-outline-variant/30 text-on-surface-variant hover:border-primary/30"
                )}
              >
                <Eye className="w-3.5 h-3.5" />
                Public
              </button>
            </div>
          </div>
        </CollapsibleSection>
      </div>

      {/* Sticky actions */}
      <div className="flex gap-2 p-4 border-t border-outline-variant/10 bg-white">
        <button
          onClick={resetAll}
          className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest border-2 border-outline-variant/30 text-on-surface-variant rounded-xl hover:bg-surface-container-low transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <Reset className="w-3.5 h-3.5" />
          Reset
        </button>
        <button
          onClick={applyConfig}
          className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest border-2 border-primary text-primary rounded-xl hover:bg-primary/5 transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <Apply className="w-3.5 h-3.5" />
          Apply
        </button>
        <button
          onClick={saveAll}
          className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest bg-primary text-on-primary rounded-xl shadow-lg shadow-primary/30 transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <Save className="w-3.5 h-3.5" />
          Save
        </button>
      </div>
    </aside>
  );
}
