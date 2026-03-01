import React, { useState, useEffect, useCallback } from 'react';
import { X, RotateCcw, Check, Lock, Globe } from 'lucide-react';
import { DashboardSettings, DashboardTheme, useDashboardSettingsStore } from '@/stores/dashboardSettingsStore';
import { cn } from '@/lib/utils';

const TECHNOLOGIES = ['Nokia 4G', 'Nokia 5G', 'Ericsson 4G', 'Ericsson 5G'];

const COLOR_SWATCHES = [
  '#ffffff', '#f8fafc', '#f1f5f9', '#e2e8f0',
  '#0f172a', '#1e293b', '#334155', '#475569',
  '#3b82f6', '#2563eb', '#6366f1', '#8b5cf6',
  '#10b981', '#f59e0b', '#ef4444', '#ec4899',
];

interface Props {
  open: boolean;
  onClose: () => void;
  dashboardId: string;
  dashboardName: string;
}

const DashboardSettingsPopup: React.FC<Props> = ({ open, onClose, dashboardId, dashboardName }) => {
  const store = useDashboardSettingsStore();
  const saved = store.getSettings(dashboardId, dashboardName);

  // Local draft
  const [draft, setDraft] = useState<DashboardSettings>({ ...saved });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (open) {
      const s = store.getSettings(dashboardId, dashboardName);
      setDraft({ ...s, name: s.name || dashboardName });
      setDirty(false);
    }
  }, [open, dashboardId, dashboardName]);

  const update = <K extends keyof DashboardSettings>(key: K, val: DashboardSettings[K]) => {
    setDraft(prev => ({ ...prev, [key]: val }));
    setDirty(true);
  };

  const updateTheme = (partial: Partial<DashboardTheme>) => {
    setDraft(prev => ({ ...prev, theme: { ...prev.theme, ...partial } }));
    setDirty(true);
  };

  const toggleTech = (tech: string) => {
    const next = draft.technologies.includes(tech)
      ? draft.technologies.filter(t => t !== tech)
      : [...draft.technologies, tech];
    update('technologies', next);
  };

  const handleSave = () => {
    if (!draft.name.trim()) return;
    store.updateSettings(dashboardId, draft);
    setDirty(false);
    onClose();
  };

  const handleResetTheme = () => {
    updateTheme({ backgroundColor: '', titleTextColor: '' });
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && !e.shiftKey && draft.name.trim()) handleSave();
  }, [draft, onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  if (!open) return null;

  const nameValid = draft.name.trim().length > 0 && draft.name.length <= 80;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] pb-4 overflow-y-auto bg-black/40 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-[480px] max-h-[84vh] overflow-hidden flex flex-col my-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <h2 className="text-sm font-bold text-foreground">Dashboard Settings</h2>
          <div className="flex items-center gap-2">
            {dirty && <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" title="Unsaved changes" />}
            <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Section 1: Identity */}
          <section className="space-y-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Identité</h3>
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Nom *</label>
              <input
                value={draft.name}
                onChange={e => update('name', e.target.value.slice(0, 80))}
                className={cn(
                  "w-full px-3 py-2 rounded-xl border bg-background text-sm text-foreground outline-none transition-all",
                  nameValid ? "border-border focus:ring-2 focus:ring-primary/20 focus:border-primary/40" : "border-destructive"
                )}
                placeholder="Nom du dashboard"
              />
              {draft.name.length > 0 && (
                <span className="text-[10px] text-muted-foreground">{draft.name.length}/80</span>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Description</label>
              <textarea
                value={draft.description}
                onChange={e => update('description', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground outline-none resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                placeholder="Description optionnelle..."
              />
            </div>
          </section>

          {/* Section 2: Visibility */}
          <section className="space-y-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Visibilité</h3>
            <div className="flex items-center rounded-xl border border-border bg-muted/30 p-1 w-fit">
              <button
                onClick={() => update('visibility', 'private')}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                  draft.visibility === 'private'
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Lock className="w-3 h-3" /> Privé
              </button>
              <button
                onClick={() => update('visibility', 'public')}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                  draft.visibility === 'public'
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Globe className="w-3 h-3" /> Public
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              {draft.visibility === 'private'
                ? "Ce dashboard est visible uniquement par vous."
                : "Ce dashboard sera visible par tous les membres de l'équipe."}
            </p>
          </section>

          {/* Section 3: Technologies */}
          <section className="space-y-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Technologie</h3>
            <div className="grid grid-cols-2 gap-2">
              {TECHNOLOGIES.map(tech => {
                const selected = draft.technologies.includes(tech);
                return (
                  <button
                    key={tech}
                    onClick={() => toggleTech(tech)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all",
                      selected
                        ? "border-primary/40 bg-primary/5 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-border hover:bg-muted/30"
                    )}
                  >
                    <div className={cn(
                      "w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-all",
                      selected ? "bg-primary border-primary" : "border-border/80 bg-background"
                    )}>
                      {selected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                    </div>
                    {tech}
                  </button>
                );
              })}
            </div>
            {draft.technologies.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {draft.technologies.map(t => (
                  <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-medium">
                    {t}
                    <button onClick={() => toggleTech(t)} className="hover:text-destructive transition-colors">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Section 4: Theme */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Thème</h3>
              <button onClick={handleResetTheme} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            </div>

            {/* Background color */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Couleur de fond (canvas)</label>
              <div className="flex items-center gap-2 flex-wrap">
                {COLOR_SWATCHES.map(c => (
                  <button
                    key={c}
                    onClick={() => updateTheme({ backgroundColor: c })}
                    className={cn(
                      "w-6 h-6 rounded-lg border-2 transition-all hover:scale-110",
                      draft.theme.backgroundColor === c ? "border-primary ring-2 ring-primary/20" : "border-border/50"
                    )}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
                <input
                  type="color"
                  value={draft.theme.backgroundColor || '#ffffff'}
                  onChange={e => updateTheme({ backgroundColor: e.target.value })}
                  className="w-6 h-6 rounded-lg border border-border cursor-pointer"
                  title="Custom color"
                />
              </div>
            </div>

            {/* Title text color */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Couleur du titre</label>
              <div className="flex items-center gap-2 flex-wrap">
                {COLOR_SWATCHES.map(c => (
                  <button
                    key={c}
                    onClick={() => updateTheme({ titleTextColor: c })}
                    className={cn(
                      "w-6 h-6 rounded-lg border-2 transition-all hover:scale-110",
                      draft.theme.titleTextColor === c ? "border-primary ring-2 ring-primary/20" : "border-border/50"
                    )}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
                <input
                  type="color"
                  value={draft.theme.titleTextColor || '#0f172a'}
                  onChange={e => updateTheme({ titleTextColor: e.target.value })}
                  className="w-6 h-6 rounded-lg border border-border cursor-pointer"
                  title="Custom color"
                />
              </div>
            </div>

            {/* Live preview */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-muted-foreground font-medium">Aperçu</label>
              <div
                className="rounded-xl border border-border p-4 flex items-center gap-3 transition-all"
                style={{ backgroundColor: draft.theme.backgroundColor || undefined }}
              >
                <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-primary text-[10px] font-bold">📊</span>
                </div>
                <span
                  className="text-sm font-bold transition-colors"
                  style={{ color: draft.theme.titleTextColor || undefined }}
                >
                  {draft.name || 'Dashboard'}
                </span>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-border/50 bg-muted/10">
          <div className="flex items-center gap-2">
            {dirty ? (
              <span className="flex items-center gap-1.5 text-[10px] text-orange-500 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400" /> Modifications non sauvegardées
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground">Enregistré</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-xl text-xs text-muted-foreground hover:bg-muted transition-colors font-medium">
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={!nameValid}
              className="px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardSettingsPopup;
