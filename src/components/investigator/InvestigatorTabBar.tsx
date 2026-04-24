import React, { useRef, useState, useEffect } from 'react';
import { Plus, X, FlaskConical, MoreHorizontal, Copy, Trash2, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InvestigatorInstance } from '@/stores/investigatorWorkspaceStore';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

interface Props {
  instances: InvestigatorInstance[];
  activeInstanceId: string | null;
  onActivate: (id: string) => void;
  onAdd: () => void;
  onClose: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onCloseOthers: (id: string) => void;
}

const InvestigatorTabBar: React.FC<Props> = ({
  instances, activeInstanceId, onActivate, onAdd, onClose, onRename, onDuplicate, onCloseOthers,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) setTimeout(() => inputRef.current?.select(), 50);
  }, [editingId]);

  const startRename = (inst: InvestigatorInstance) => {
    setEditingId(inst.instanceId);
    setEditValue(inst.name);
  };

  const finishRename = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="flex items-center gap-0.5 px-1 py-1 shrink-0 overflow-hidden">
      <div
        ref={scrollRef}
        className="flex items-end gap-0.5 overflow-x-auto scrollbar-hide flex-1 min-w-0"
      >
        {instances.map(inst => {
          const isActive = inst.instanceId === activeInstanceId;
          const isEditing = editingId === inst.instanceId;

          return (
            <ContextMenu key={inst.instanceId}>
              <ContextMenuTrigger asChild>
                <div
                  onClick={() => !isEditing && onActivate(inst.instanceId)}
                  onDoubleClick={() => startRename(inst)}
                  className={cn(
                    'group relative flex items-center gap-1.5 pl-3 pr-1.5 py-2 rounded-t-lg text-[11px] font-semibold cursor-pointer transition-all max-w-[220px] min-w-[120px] select-none',
                    isActive
                      ? 'bg-background text-foreground font-bold border border-b-0 border-primary/40 ring-1 ring-primary/20 shadow-sm z-10 -mb-px'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent'
                  )}
                >
                  {isActive && (
                    <span
                      className="w-2.5 h-2.5 rounded-full bg-primary shrink-0 animate-[tab-pulse_1.2s_ease-in-out_infinite] shadow-[0_0_6px_hsl(var(--primary)/0.6)]"
                      aria-label="active"
                    />
                  )}

                  {isEditing ? (
                    <input
                      ref={inputRef}
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={finishRename}
                      onKeyDown={e => {
                        if (e.key === 'Enter') finishRename();
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="bg-transparent border-b border-primary/50 outline-none text-[11px] font-semibold min-w-[60px] max-w-[140px] px-0.5"
                      autoFocus
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span className="truncate">{inst.name}</span>
                  )}

                  {inst.hasUnsavedChanges && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="Unsaved changes" />
                  )}

                  <button
                    onClick={e => { e.stopPropagation(); onClose(inst.instanceId); }}
                    className={cn(
                      'p-0.5 rounded hover:bg-destructive/10 hover:text-destructive transition-all shrink-0',
                      isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-60'
                    )}
                    title="Close"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </ContextMenuTrigger>

              <ContextMenuContent className="w-48">
                <ContextMenuItem onClick={() => startRename(inst)} className="text-xs gap-2">
                  <MoreHorizontal className="w-3.5 h-3.5" /> Rename
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onDuplicate(inst.instanceId)} className="text-xs gap-2">
                  <Copy className="w-3.5 h-3.5" /> Duplicate
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => onClose(inst.instanceId)} className="text-xs gap-2">
                  <X className="w-3.5 h-3.5" /> Close
                </ContextMenuItem>
                {instances.length > 1 && (
                  <ContextMenuItem onClick={() => onCloseOthers(inst.instanceId)} className="text-xs gap-2">
                    <Trash2 className="w-3.5 h-3.5" /> Close Others
                  </ContextMenuItem>
                )}
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>

      {/* Add tab button */}
      <button
        onClick={onAdd}
        className="p-1.5 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors shrink-0 mb-0.5"
        title="New Investigator"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export default InvestigatorTabBar;
