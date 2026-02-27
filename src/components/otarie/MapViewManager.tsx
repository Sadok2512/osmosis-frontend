import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Save, FolderOpen, Trash2, Star, Plus, X, Map } from 'lucide-react';
import { toast } from 'sonner';

export interface MapViewSettings {
  center: [number, number];
  zoom: number;
  mapLayer: 'light' | 'dark' | 'satellite';
  mapKpi: string;
  mapTechnoFilter: string;
  enabledBands: string[];
  sectorColorMode: 'topo' | 'kpi';
  mapDisplayMode: 'sites' | 'points' | 'heatmap';
  showBandPanel: boolean;
  showLegend: boolean;
  showRightPanel: boolean;
  panelCollapsed: boolean;
  localVendor: string;
  localDor: string;
  localPlaque: string;
  localSite: string;
  beamVisibility?: number;
}

interface MapView {
  id: string;
  name: string;
  description: string;
  settings: MapViewSettings;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

interface Props {
  currentSettings: MapViewSettings;
  onLoadView: (settings: MapViewSettings) => void;
}

const MapViewManager: React.FC<Props> = ({ currentSettings, onLoadView }) => {
  const [views, setViews] = useState<MapView[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  useEffect(() => {
    fetchViews();
  }, []);

  const fetchViews = async () => {
    const { data, error } = await supabase
      .from('map_views')
      .select('*')
      .order('is_default', { ascending: false })
      .order('updated_at', { ascending: false });
    if (!error && data) {
      setViews(data.map((d: any) => ({ ...d, settings: d.settings as MapViewSettings })));
    }
  };

  const handleSave = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('map_views').insert({
      name: newName.trim(),
      settings: currentSettings as any,
    });
    if (error) {
      toast.error('Erreur sauvegarde');
    } else {
      toast.success(`Vue "${newName}" sauvegardée`);
      setNewName('');
      setShowSaveInput(false);
      fetchViews();
    }
    setSaving(false);
  };

  const handleLoad = (view: MapView) => {
    onLoadView(view.settings);
    toast.success(`Vue "${view.name}" chargée`);
    setShowPanel(false);
  };

  const handleDelete = async (id: string, name: string) => {
    const { error } = await supabase.from('map_views').delete().eq('id', id);
    if (!error) {
      toast.success(`Vue "${name}" supprimée`);
      fetchViews();
    }
  };

  const handleSetDefault = async (id: string) => {
    // Clear all defaults first
    await supabase.from('map_views').update({ is_default: false }).neq('id', '');
    await supabase.from('map_views').update({ is_default: true }).eq('id', id);
    fetchViews();
    toast.success('Vue par défaut définie');
  };

  const handleOverwrite = async (view: MapView) => {
    const { error } = await supabase
      .from('map_views')
      .update({ settings: currentSettings as any, updated_at: new Date().toISOString() })
      .eq('id', view.id);
    if (!error) {
      toast.success(`Vue "${view.name}" mise à jour`);
      fetchViews();
    }
  };

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setShowPanel(!showPanel)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${
          showPanel
            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
            : 'bg-card/80 backdrop-blur border-border text-muted-foreground hover:text-foreground hover:bg-muted/60'
        }`}
        title="Map Views"
      >
        <Map size={12} />
        Views
        {views.length > 0 && (
          <span className="ml-0.5 w-4 h-4 rounded-full bg-primary/20 text-primary text-[9px] font-black flex items-center justify-center">
            {views.length}
          </span>
        )}
      </button>

      {/* Panel dropdown */}
      {showPanel && (
        <div className="absolute top-full mt-1.5 right-0 z-[2000] w-72 bg-card border border-border rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Map size={14} className="text-primary" />
              <span className="text-[12px] font-extrabold text-foreground uppercase tracking-wider">Map Views</span>
            </div>
            <button onClick={() => setShowPanel(false)} className="p-1 rounded hover:bg-muted text-muted-foreground">
              <X size={14} />
            </button>
          </div>

          {/* Save new */}
          <div className="px-3 py-2.5 border-b border-border/50">
            {showSaveInput ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  placeholder="Nom de la vue..."
                  className="flex-1 bg-muted border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary"
                />
                <button
                  onClick={handleSave}
                  disabled={saving || !newName.trim()}
                  className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
                >
                  <Save size={12} />
                </button>
                <button
                  onClick={() => { setShowSaveInput(false); setNewName(''); }}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSaveInput(true)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 text-[11px] font-semibold text-muted-foreground hover:text-primary transition-colors"
              >
                <Plus size={12} />
                Sauvegarder la vue actuelle
              </button>
            )}
          </div>

          {/* Saved views list */}
          <div className="max-h-64 overflow-y-auto">
            {views.length === 0 ? (
              <div className="px-4 py-6 text-center text-[11px] text-muted-foreground/60">
                Aucune vue sauvegardée
              </div>
            ) : (
              views.map(view => (
                <div
                  key={view.id}
                  className="group px-3 py-2.5 border-b border-border/30 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {/* Load button */}
                    <button
                      onClick={() => handleLoad(view)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="flex items-center gap-1.5">
                        {view.is_default && <Star size={10} className="text-amber-500 fill-amber-500 shrink-0" />}
                        <span className="text-[12px] font-semibold text-foreground truncate">{view.name}</span>
                      </div>
                      <div className="text-[9px] text-muted-foreground/60 mt-0.5">
                        {new Date(view.updated_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </button>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => handleOverwrite(view)}
                        title="Mettre à jour avec la vue actuelle"
                        className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Save size={11} />
                      </button>
                      <button
                        onClick={() => handleSetDefault(view.id)}
                        title="Définir comme vue par défaut"
                        className={`p-1 rounded hover:bg-amber-500/10 transition-colors ${view.is_default ? 'text-amber-500' : 'text-muted-foreground hover:text-amber-500'}`}
                      >
                        <Star size={11} />
                      </button>
                      <button
                        onClick={() => handleDelete(view.id, view.name)}
                        title="Supprimer"
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer info */}
          {views.length > 0 && (
            <div className="px-3 py-2 bg-muted/20 border-t border-border/30">
              <div className="text-[9px] text-muted-foreground/50 text-center">
                {views.length} vue{views.length > 1 ? 's' : ''} • Cliquer pour charger
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MapViewManager;
