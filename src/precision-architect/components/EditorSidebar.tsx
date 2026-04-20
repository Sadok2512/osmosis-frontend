import { useEffect, useState } from 'react';
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
import { DEFAULT_DASHBOARD_THEME, type DashboardTheme } from '../types';
import { toast } from 'sonner';

interface EditorSidebarProps {
  onClose: () => void;
}

type SectionKey = 'general' | 'appearance' | 'layout' | 'header' | 'behavior' | 'advanced';

interface DraftConfig {
  // General
  name: string;
  description: string;
  // Appearance
  textColor: string;
  backgroundColor: string;
  cardColor: string;
  titleColor: string;
  accentColor: string;
  borderRadius: number;
  // Layout
  pageWidth: 'fixed' | 'full';
  spacing: number;
  padding: number;
  // Header
  showLogo: boolean;
  logoUrl: string;
  operatorName: string;
  showDate: boolean;
  headerAlign: 'left' | 'center' | 'right';
  // Behavior
  hideEmptySections: boolean;
  // Advanced
  visibility: 'private' | 'public';
  themePreset: 'custom' | 'light' | 'dark' | 'premium';
}

function presetToBackground(preset: DraftConfig['themePreset'], explicit: string): { background: DashboardTheme['background']; bgColor?: string } {
  if (preset === 'dark') return { background: 'dark', bgColor: '#0f172a' };
  if (preset === 'premium') return { background: 'gradient', bgColor: '#1a1a2e' };
  if (preset === 'light') return { background: 'light', bgColor: '#f8fafc' };
  return { background: 'light', bgColor: explicit };
}

function readDraft(projectName: string, theme: DashboardTheme): DraftConfig {
  const t = { ...DEFAULT_DASHBOARD_THEME, ...theme };
  return {
    name: t.pageTitle || projectName,
    description: t.pageSubtitle ?? '',
    textColor: t.textColor ?? '#0f172a',
    backgroundColor: t.backgroundColor ?? (t.background === 'dark' ? '#0f172a' : t.background === 'gradient' ? '#1a1a2e' : '#f8fafc'),
    cardColor: t.cardColor ?? '#ffffff',
    titleColor: t.titleColor ?? t.accentColor,
    accentColor: t.accentColor,
    borderRadius: t.borderRadius ?? 16,
    pageWidth: t.pageWidth ?? 'fixed',
    spacing: t.spacing ?? 16,
    padding: t.pagePadding ?? 32,
    showLogo: t.showLogo ?? true,
    logoUrl: t.logoUrl ?? '',
    operatorName: t.operatorName ?? 'Network Manager',
    showDate: t.showDate ?? true,
    headerAlign: t.headerAlign ?? 'left',
    hideEmptySections: false,
    visibility: 'private',
    themePreset: t.background === 'dark' ? 'dark' : t.background === 'gradient' ? 'premium' : 'custom',
  };
}

function CollapsibleSection({
  title,
  icon: Icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: typeof Settings2;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-outline-variant/15 rounded-xl bg-white overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-container-low transition-colors">
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
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-9 h-9 rounded-lg border border-outline-variant/30 cursor-pointer bg-transparent" />
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-outline-variant/30 bg-surface-container-low focus:outline-none focus:border-primary" />
      </div>
    </div>
  );
}

function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className="w-full flex items-center justify-between py-2 px-3 rounded-lg hover:bg-surface-container-low transition-colors">
      <span className="text-xs font-bold text-on-surface">{label}</span>
      <div className={cn('w-9 h-5 rounded-full p-0.5 transition-colors', value ? 'bg-primary' : 'bg-outline-variant/40')}>
        <div className={cn('w-4 h-4 bg-white rounded-full shadow-sm transition-transform', value && 'translate-x-4')} />
      </div>
    </button>
  );
}

function SegmentedControl<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="grid gap-1 p-1 bg-surface-container-low rounded-lg" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn('text-[10px] font-black uppercase tracking-widest py-2 rounded-md transition-all', value === o.value ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface')}
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
  const activeTheme = activePage?.theme ?? DEFAULT_DASHBOARD_THEME;

  const [draft, setDraft] = useState<DraftConfig>(() => readDraft(projectName, activeTheme));
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    general: true,
    appearance: true,
    layout: false,
    header: false,
    behavior: false,
    advanced: false,
  });

  // Reset the draft when the user switches active page so the panel reflects the
  // new page's saved theme (otherwise stale fields hide the issue).
  useEffect(() => {
    setDraft(readDraft(projectName, activeTheme));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePageId]);

  const toggle = (k: SectionKey) => setOpenSections((s) => ({ ...s, [k]: !s[k] }));
  const update = <K extends keyof DraftConfig>(k: K, v: DraftConfig[K]) => setDraft((c) => ({ ...c, [k]: v }));

  const buildTheme = (d: DraftConfig): DashboardTheme => {
    const { background, bgColor } = presetToBackground(d.themePreset, d.backgroundColor);
    return {
      background,
      backgroundColor: d.themePreset === 'custom' ? d.backgroundColor : bgColor,
      accentColor: d.accentColor,
      pageTitle: d.name,
      pageSubtitle: d.description,
      showPageHeader: !!(d.name || d.description),
      textColor: d.textColor,
      cardColor: d.cardColor,
      titleColor: d.titleColor,
      pageWidth: d.pageWidth,
      pagePadding: d.padding,
      spacing: d.spacing,
      borderRadius: d.borderRadius,
      headerAlign: d.headerAlign,
      operatorName: d.operatorName,
      logoUrl: d.logoUrl,
      showLogo: d.showLogo,
      showDate: d.showDate,
    };
  };

  const applyConfig = () => {
    const theme = buildTheme(draft);
    if (draft.name && draft.name !== projectName) setProjectName(draft.name);
    setPages((prev) => prev.map((p) => (p.id === activePageId ? { ...p, theme } : p)));
    toast.success('Dashboard settings applied');
  };

  const saveAll = () => {
    applyConfig();
    markSaved();
    toast.success('Dashboard saved');
  };

  const resetAll = () => {
    setDraft(readDraft(projectName, DEFAULT_DASHBOARD_THEME));
    setPages((prev) => prev.map((p) => (p.id === activePageId ? { ...p, theme: { ...DEFAULT_DASHBOARD_THEME } } : p)));
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
        <CollapsibleSection title="General" icon={Settings2} open={openSections.general} onToggle={() => toggle('general')}>
          <div>
            <FieldLabel>Dashboard / Report Name</FieldLabel>
            <input type="text" value={draft.name} onChange={(e) => update('name', e.target.value)} placeholder="Network Health · Q4 Report" className="w-full px-3 py-2 text-sm rounded-lg border border-outline-variant/30 bg-white focus:outline-none focus:border-primary" />
          </div>
          <div>
            <FieldLabel>Subtitle / Description</FieldLabel>
            <textarea value={draft.description} onChange={(e) => update('description', e.target.value)} placeholder="Optional description shown under the title" rows={2} className="w-full px-3 py-2 text-sm rounded-lg border border-outline-variant/30 bg-white focus:outline-none focus:border-primary resize-none" />
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Appearance" icon={Palette} open={openSections.appearance} onToggle={() => toggle('appearance')}>
          <ColorField label="Title color" value={draft.titleColor} onChange={(v) => update('titleColor', v)} />
          <ColorField label="Text color" value={draft.textColor} onChange={(v) => update('textColor', v)} />
          <ColorField label="Background color" value={draft.backgroundColor} onChange={(v) => update('backgroundColor', v)} />
          <ColorField label="Card / section color" value={draft.cardColor} onChange={(v) => update('cardColor', v)} />
          <ColorField label="Accent color" value={draft.accentColor} onChange={(v) => update('accentColor', v)} />
          <div>
            <FieldLabel>Border radius — {draft.borderRadius}px</FieldLabel>
            <input type="range" min={0} max={32} value={draft.borderRadius} onChange={(e) => update('borderRadius', Number(e.target.value))} className="w-full accent-primary" />
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Layout" icon={LayoutGrid} open={openSections.layout} onToggle={() => toggle('layout')}>
          <div>
            <FieldLabel>Page width</FieldLabel>
            <SegmentedControl value={draft.pageWidth} onChange={(v) => update('pageWidth', v)} options={[{ value: 'fixed', label: 'Fixed' }, { value: 'full', label: 'Full' }]} />
          </div>
          <div>
            <FieldLabel>Spacing — {draft.spacing}px</FieldLabel>
            <input type="range" min={0} max={48} value={draft.spacing} onChange={(e) => update('spacing', Number(e.target.value))} className="w-full accent-primary" />
          </div>
          <div>
            <FieldLabel>Page padding — {draft.padding}px</FieldLabel>
            <input type="range" min={0} max={80} value={draft.padding} onChange={(e) => update('padding', Number(e.target.value))} className="w-full accent-primary" />
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Header" icon={PanelTop} open={openSections.header} onToggle={() => toggle('header')}>
          <ToggleField label="Show logo" value={draft.showLogo} onChange={(v) => update('showLogo', v)} />
          <div>
            <FieldLabel>Logo URL</FieldLabel>
            <input type="text" value={draft.logoUrl} onChange={(e) => update('logoUrl', e.target.value)} placeholder="https://..." className="w-full px-3 py-2 text-sm rounded-lg border border-outline-variant/30 bg-white focus:outline-none focus:border-primary" />
          </div>
          <div>
            <FieldLabel>Operator name</FieldLabel>
            <input type="text" value={draft.operatorName} onChange={(e) => update('operatorName', e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg border border-outline-variant/30 bg-white focus:outline-none focus:border-primary" />
          </div>
          <ToggleField label="Show date" value={draft.showDate} onChange={(v) => update('showDate', v)} />
          <div>
            <FieldLabel>Header alignment</FieldLabel>
            <SegmentedControl value={draft.headerAlign} onChange={(v) => update('headerAlign', v)} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]} />
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Behavior" icon={SlidersHorizontal} open={openSections.behavior} onToggle={() => toggle('behavior')}>
          <ToggleField label="Hide empty sections" value={draft.hideEmptySections} onChange={(v) => update('hideEmptySections', v)} />
        </CollapsibleSection>

        <CollapsibleSection title="Advanced" icon={Sparkles} open={openSections.advanced} onToggle={() => toggle('advanced')}>
          <div>
            <FieldLabel>Theme preset</FieldLabel>
            <SegmentedControl value={draft.themePreset} onChange={(v) => update('themePreset', v)} options={[{ value: 'custom', label: 'Custom' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'premium', label: 'Premium' }]} />
          </div>
          <div>
            <FieldLabel>Visibility</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => update('visibility', 'private')} className={cn('flex items-center justify-center gap-2 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-widest border-2 transition-all', draft.visibility === 'private' ? 'border-primary bg-primary/5 text-primary' : 'border-outline-variant/30 text-on-surface-variant hover:border-primary/30')}>
                <EyeOff className="w-3.5 h-3.5" />
                Private
              </button>
              <button onClick={() => update('visibility', 'public')} className={cn('flex items-center justify-center gap-2 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-widest border-2 transition-all', draft.visibility === 'public' ? 'border-primary bg-primary/5 text-primary' : 'border-outline-variant/30 text-on-surface-variant hover:border-primary/30')}>
                <Eye className="w-3.5 h-3.5" />
                Public
              </button>
            </div>
          </div>
        </CollapsibleSection>
      </div>

      <div className="flex gap-2 p-4 border-t border-outline-variant/10 bg-white">
        <button onClick={resetAll} className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest border-2 border-outline-variant/30 text-on-surface-variant rounded-xl hover:bg-surface-container-low transition-all active:scale-95 flex items-center justify-center gap-2">
          <Reset className="w-3.5 h-3.5" />
          Reset
        </button>
        <button onClick={applyConfig} className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest border-2 border-primary text-primary rounded-xl hover:bg-primary/5 transition-all active:scale-95 flex items-center justify-center gap-2">
          <Apply className="w-3.5 h-3.5" />
          Apply
        </button>
        <button onClick={saveAll} className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest bg-primary text-on-primary rounded-xl shadow-lg shadow-primary/30 transition-all active:scale-95 flex items-center justify-center gap-2">
          <Save className="w-3.5 h-3.5" />
          Save
        </button>
      </div>
    </aside>
  );
}
