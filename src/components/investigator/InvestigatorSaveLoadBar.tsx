import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MoreHorizontal, FolderOpen, Copy, Trash2, Plus, Clock,
  FlaskConical, Check, Loader2, Download, FileJson, FileSpreadsheet, FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  listInvestigators,
  createInvestigator,
  updateInvestigator,
  deleteInvestigator,
  type SavedInvestigator,
} from '@/services/investigatorService';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'idle';

interface Props {
  investigatorId: string | null;
  investigatorName: string;
  onNameChange: (name: string) => void;
  getContext: () => any;
  onLoad: (inv: SavedInvestigator) => void;
  onNewInvestigator: () => void;
  onIdChange: (id: string) => void;
  hasUnsavedChanges: boolean;
  onMarkSaved: () => void;
  onExportSession?: () => void;
  onExportData?: () => void;
  onExportPDF?: () => void;
}

const InvestigatorSaveLoadBar: React.FC<Props> = ({
  investigatorId,
  investigatorName,
  onNameChange,
  getContext,
  onLoad,
  onNewInvestigator,
  onIdChange,
  hasUnsavedChanges,
  onMarkSaved,
  onExportSession,
  onExportData,
  onExportPDF,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(investigatorName);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [loadModalOpen, setLoadModalOpen] = useState(false);
  const [saveAsModalOpen, setSaveAsModalOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [saveAsVisibility, setSaveAsVisibility] = useState<'private' | 'public'>('private');
  const [savedList, setSavedList] = useState<SavedInvestigator[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const saveAsInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => { setEditValue(investigatorName); }, [investigatorName]);

  // ═══ Auto-save logic (debounced 2s) ═══
  const doSave = useCallback(async () => {
    if (!isMountedRef.current) return;
    setSaveStatus('saving');
    try {
      const ctx = getContext();
      if (investigatorId) {
        await updateInvestigator(investigatorId, investigatorName, ctx);
      } else {
        const created = await createInvestigator(investigatorName, ctx);
        if (isMountedRef.current) {
          onIdChange(created.id);
        }
      }
      if (isMountedRef.current) {
        setSaveStatus('saved');
        setLastSavedAt(new Date());
        onMarkSaved();
      }
    } catch (err) {
      console.error('[AutoSave] error:', err);
      if (isMountedRef.current) setSaveStatus('unsaved');
    }
  }, [investigatorId, investigatorName, getContext, onIdChange, onMarkSaved]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    setSaveStatus('unsaved');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSave();
    }, 2000);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [hasUnsavedChanges, doSave]);

  // ═══ Inline name editing ═══
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

  // ═══ Load modal ═══
  const openLoadModal = async () => {
    setLoadModalOpen(true);
    setIsLoadingList(true);
    try {
      const list = await listInvestigators();
      setSavedList(list);
    } catch { toast.error('Erreur de chargement'); }
    setIsLoadingList(false);
  };

  const handleLoadItem = (inv: SavedInvestigator) => {
    onLoad(inv);
    setLoadModalOpen(false);
    setSaveStatus('saved');
    setLastSavedAt(new Date(inv.updated_at));
    toast.success(`Investigator "${inv.name}" chargé`);
  };

  const handleDeleteItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteInvestigator(id);
      setSavedList(prev => prev.filter(i => i.id !== id));
      toast.success('Supprimé');
    } catch { toast.error('Erreur'); }
  };

  // ═══ Save As ═══
  const openSaveAs = () => {
    setSaveAsName(`${investigatorName} (copie)`);
    setSaveAsVisibility('private');
    setSaveAsModalOpen(true);
    setTimeout(() => saveAsInputRef.current?.select(), 100);
  };

  const handleSaveAs = async () => {
    const name = saveAsName.trim();
    if (!name) return;
    setSaveAsModalOpen(false);
    setSaveStatus('saving');
    try {
      const ctx = getContext();
      const created = await createInvestigator(name, ctx, saveAsVisibility);
      // Stay on the same tab: rebind current instance to the new saved entity
      // (rename + attach id) instead of opening a new tab.
      onNameChange(created.name);
      onIdChange(created.id);
      onMarkSaved();
      setSaveStatus('saved');
      setLastSavedAt(new Date());
      // Refresh saved list so the new entry shows up in the dashboard list
      setSavedList(prev => [created, ...prev.filter(i => i.id !== created.id)]);
      toast.success(`"${name}" créé (${saveAsVisibility === 'public' ? 'public' : 'privé'})`);
    } catch {
      toast.error('Erreur');
      setSaveStatus('unsaved');
    }
  };

  // ═══ New ═══
  const handleNew = () => {
    if (hasUnsavedChanges) {
      // Quick confirm
      if (!window.confirm('Changements non sauvegardés. Continuer ?')) return;
    }
    onNewInvestigator();
    setSaveStatus('idle');
    setLastSavedAt(null);
  };

  // ═══ Status text ═══
  const statusText = (() => {
    switch (saveStatus) {
      case 'saving': return 'Saving…';
      case 'saved':
        if (lastSavedAt) {
          const secs = Math.floor((Date.now() - lastSavedAt.getTime()) / 1000);
          if (secs < 10) return 'Saved just now';
          if (secs < 60) return `Saved ${secs}s ago`;
          const mins = Math.floor(secs / 60);
          return `Saved ${mins}m ago`;
        }
        return 'Saved';
      case 'unsaved': return 'Unsaved changes';
      default: return null;
    }
  })();

  // Refresh status text periodically
  const [, setTick] = useState(0);
  useEffect(() => {
    if (saveStatus !== 'saved' || !lastSavedAt) return;
    const iv = setInterval(() => setTick(t => t + 1), 15000);
    return () => clearInterval(iv);
  }, [saveStatus, lastSavedAt]);

  const fmtDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('fr-FR', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return d; }
  };

  return (
    <>
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Workspace icon */}
        <div className="p-1.5 bg-primary/10 rounded-lg shrink-0">
          <FlaskConical className="w-4 h-4 text-primary" />
        </div>

        {/* Inline editable name */}
        {isEditing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={handleFinishEdit}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); handleFinishEdit(); }
              if (e.key === 'Escape') setIsEditing(false);
            }}
            className="text-sm font-bold text-foreground bg-transparent border-b-2 border-primary/50 focus:border-primary outline-none px-1 py-0.5 max-w-[300px] min-w-[120px]"
            autoFocus
          />
        ) : (
          <button
            onClick={handleStartEdit}
            className="text-sm font-bold text-foreground hover:text-primary transition-colors truncate max-w-[300px] px-1 py-0.5 rounded hover:bg-muted/40"
            title="Click to rename"
          >
            {investigatorName}
          </button>
        )}

        {/* Save status */}
        {statusText && (
          <div className="flex items-center gap-1.5 shrink-0">
            {saveStatus === 'saving' && <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" />}
            {saveStatus === 'saved' && <Check className="w-3 h-3 text-emerald-500" />}
            {saveStatus === 'unsaved' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
            <span className={cn(
              'text-[10px] font-medium whitespace-nowrap',
              saveStatus === 'saved' && 'text-emerald-500/80',
              saveStatus === 'saving' && 'text-muted-foreground',
              saveStatus === 'unsaved' && 'text-amber-500',
            )}>
              {statusText}
            </span>
          </div>
        )}

        {/* ••• Actions menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem onClick={handleNew} className="gap-2 text-xs font-medium">
              <Plus className="w-3.5 h-3.5" />
              New Investigator
            </DropdownMenuItem>
            <DropdownMenuItem onClick={openSaveAs} className="gap-2 text-xs font-medium">
              <Copy className="w-3.5 h-3.5" />
              Save As…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={openLoadModal} className="gap-2 text-xs font-medium">
              <FolderOpen className="w-3.5 h-3.5" />
              Load Investigator
            </DropdownMenuItem>
            {onExportPDF && (
              <>
                <DropdownMenuSeparator />
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5">
                  <Download className="w-3 h-3" /> Export
                </div>
                <DropdownMenuItem onClick={onExportPDF} className="gap-2 text-xs font-medium">
                  <FileText className="w-3.5 h-3.5" />
                  Visual report (.pdf)
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ═══ Load Modal ═══ */}
      <Dialog open={loadModalOpen} onOpenChange={setLoadModalOpen}>
        <DialogContent className="max-w-md p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="text-sm font-bold">Load Investigator</DialogTitle>
          </DialogHeader>
          <div className="border-t border-border/40 max-h-[400px] overflow-y-auto">
            {isLoadingList ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-xs gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading…
              </div>
            ) : savedList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                <FolderOpen className="w-10 h-10 opacity-20" />
                <span className="text-xs">No saved investigators</span>
              </div>
            ) : (
              savedList.map(inv => (
                <div
                  key={inv.id}
                  onClick={() => handleLoadItem(inv)}
                  className={cn(
                    'flex items-center gap-3 px-5 py-3 hover:bg-muted/40 cursor-pointer transition-colors border-b border-border/10 group',
                    investigatorId === inv.id && 'bg-primary/5'
                  )}
                >
                  <div className="p-1.5 rounded bg-primary/10 shrink-0">
                    <FlaskConical className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-foreground truncate">{inv.name}</div>
                    <div className="flex items-center gap-1 text-[9px] text-muted-foreground mt-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      {fmtDate(inv.updated_at)}
                    </div>
                  </div>
                  {investigatorId === inv.id && (
                    <span className="text-[9px] text-primary font-bold shrink-0">Current</span>
                  )}
                  <button
                    onClick={(e) => handleDeleteItem(inv.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all shrink-0"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ Save As Modal ═══ */}
      <Dialog open={saveAsModalOpen} onOpenChange={setSaveAsModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Save As</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Input
              ref={saveAsInputRef}
              value={saveAsName}
              onChange={e => setSaveAsName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveAs(); }}
              placeholder="Investigator name"
              className="text-sm"
              autoFocus
            />

            {/* Visibility toggle */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSaveAsVisibility('private')}
                className={cn(
                  'flex-1 px-3 py-2 text-xs font-semibold rounded-md border transition-all',
                  saveAsVisibility === 'private'
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'bg-transparent border-border text-muted-foreground hover:bg-muted/40'
                )}
              >
                🔒 Private
              </button>
              <button
                type="button"
                onClick={() => setSaveAsVisibility('public')}
                className={cn(
                  'flex-1 px-3 py-2 text-xs font-semibold rounded-md border transition-all',
                  saveAsVisibility === 'public'
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'bg-transparent border-border text-muted-foreground hover:bg-muted/40'
                )}
              >
                🌐 Public
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground -mt-1">
              {saveAsVisibility === 'public'
                ? 'Visible par tous les utilisateurs.'
                : 'Visible uniquement par vous.'}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setSaveAsModalOpen(false)}
                className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAs}
                disabled={!saveAsName.trim()}
                className="px-4 py-1.5 text-xs font-bold bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default InvestigatorSaveLoadBar;
