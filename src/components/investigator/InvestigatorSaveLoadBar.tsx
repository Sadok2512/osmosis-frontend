import React, { useState, useEffect, useRef } from 'react';
import { Save, FolderOpen, ChevronDown, Pencil, Trash2, Copy, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  listInvestigators,
  createInvestigator,
  updateInvestigator,
  deleteInvestigator,
  type SavedInvestigator,
} from '@/services/investigatorService';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';

interface Props {
  investigatorId: string | null;
  investigatorName: string;
  onNameChange: (name: string) => void;
  onSave: () => any; // returns context snapshot
  onLoad: (inv: SavedInvestigator) => void;
  onNewInvestigator: () => void;
  hasUnsavedChanges: boolean;
}

const InvestigatorSaveLoadBar: React.FC<Props> = ({
  investigatorId,
  investigatorName,
  onNameChange,
  onSave,
  onLoad,
  onNewInvestigator,
  hasUnsavedChanges,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(investigatorName);
  const [loadOpen, setLoadOpen] = useState(false);
  const [savedList, setSavedList] = useState<SavedInvestigator[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setEditValue(investigatorName); }, [investigatorName]);

  const handleStartEdit = () => {
    setIsEditing(true);
    setEditValue(investigatorName);
    setTimeout(() => inputRef.current?.select(), 50);
  };

  const handleFinishEdit = () => {
    setIsEditing(false);
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== investigatorName) {
      onNameChange(trimmed);
    }
  };

  const handleLoadOpen = async () => {
    setLoadOpen(true);
    setIsLoading(true);
    try {
      const list = await listInvestigators();
      setSavedList(list);
    } catch { toast.error('Failed to load investigators'); }
    setIsLoading(false);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteInvestigator(id);
      setSavedList(prev => prev.filter(i => i.id !== id));
      toast.success('Investigator supprimé');
    } catch { toast.error('Erreur de suppression'); }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const ctx = onSave();
      if (investigatorId) {
        await updateInvestigator(investigatorId, investigatorName, ctx);
        toast.success('Investigator sauvegardé');
      } else {
        const created = await createInvestigator(investigatorName, ctx);
        // Update parent with new ID
        onLoad(created);
        toast.success('Investigator créé');
      }
    } catch (err) {
      toast.error('Erreur de sauvegarde');
      console.error(err);
    }
    setIsSaving(false);
  };

  const handleSaveAs = async () => {
    setIsSaving(true);
    try {
      const ctx = onSave();
      const newName = `${investigatorName} (copie)`;
      const created = await createInvestigator(newName, ctx);
      onLoad(created);
      toast.success('Copie créée');
    } catch { toast.error('Erreur de sauvegarde'); }
    setIsSaving(false);
  };

  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return d; }
  };

  return (
    <div className="flex items-center gap-3 min-w-0">
      {/* Investigator Name */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {isEditing ? (
          <Input
            ref={inputRef}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={handleFinishEdit}
            onKeyDown={e => { if (e.key === 'Enter') handleFinishEdit(); if (e.key === 'Escape') setIsEditing(false); }}
            className="h-8 text-sm font-bold bg-transparent border-primary/40 focus:border-primary max-w-[280px]"
            autoFocus
          />
        ) : (
          <button
            onClick={handleStartEdit}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted/50 transition-colors min-w-0 group"
            title="Renommer l'investigator"
          >
            <span className="text-sm font-bold text-foreground truncate max-w-[240px]">
              {investigatorName}
            </span>
            <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </button>
        )}
        {hasUnsavedChanges && (
          <span className="text-[9px] text-amber-500 font-semibold whitespace-nowrap">● Non sauvegardé</span>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center gap-1">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all',
            'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
            isSaving && 'opacity-60 cursor-wait'
          )}
        >
          <Save className="w-3.5 h-3.5" />
          {isSaving ? 'Saving…' : 'Save'}
        </button>

        <button
          onClick={handleSaveAs}
          disabled={isSaving}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
          title="Save As (nouvelle copie)"
        >
          <Copy className="w-3 h-3" />
          Save As
        </button>
      </div>

      {/* Load */}
      <Popover open={loadOpen} onOpenChange={(open) => { if (open) handleLoadOpen(); else setLoadOpen(false); }}>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all border border-border/50">
            <FolderOpen className="w-3.5 h-3.5" />
            Load
            <ChevronDown className="w-3 h-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[380px] p-0 max-h-[420px] overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
            <span className="text-xs font-bold text-foreground uppercase tracking-wider">Saved Investigators</span>
            <button
              onClick={() => { setLoadOpen(false); onNewInvestigator(); }}
              className="text-[10px] font-bold text-primary hover:underline"
            >
              + New
            </button>
          </div>
          <div className="overflow-y-auto max-h-[340px]">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">Loading…</div>
            ) : savedList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                <FolderOpen className="w-8 h-8 opacity-30" />
                <span className="text-xs">Aucun investigator sauvegardé</span>
              </div>
            ) : (
              savedList.map(inv => (
                <div
                  key={inv.id}
                  onClick={() => { onLoad(inv); setLoadOpen(false); }}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 hover:bg-muted/40 cursor-pointer transition-colors border-b border-border/20 group',
                    investigatorId === inv.id && 'bg-primary/5 border-l-2 border-l-primary'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-foreground truncate">{inv.name}</div>
                    <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground mt-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      {fmtDate(inv.updated_at)}
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDelete(inv.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 hover:text-red-500 transition-all"
                    title="Supprimer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default InvestigatorSaveLoadBar;
