import React, { useState } from 'react';
import { Plus, X, Pencil, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AnalysisTabInstance } from './useAnalysisTabs';

interface Props {
  tabs: AnalysisTabInstance[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onRename: (id: string, label: string) => void;
  accentColor?: string; // e.g. 'blue' 'orange'
}

const AnalysisTabBar: React.FC<Props> = ({ tabs, activeId, onSelect, onAdd, onRemove, onRename, accentColor = 'blue' }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const startRename = (t: AnalysisTabInstance) => {
    setEditingId(t.id);
    setEditValue(t.label);
  };

  const commitRename = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  if (tabs.length <= 1) return null;

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 bg-muted/20 border-b border-border/30 overflow-x-auto">
      {tabs.map((t) => {
        const isActive = t.id === activeId;
        return (
          <div
            key={t.id}
            className={cn(
              'group flex items-center gap-1 px-3 py-1.5 rounded-t-md text-[10px] font-semibold cursor-pointer transition-all select-none',
              isActive
                ? 'bg-background text-foreground border border-b-0 border-border/60 shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
            )}
            onClick={() => onSelect(t.id)}
          >
            {editingId === t.id ? (
              <form onSubmit={(e) => { e.preventDefault(); commitRename(); }} className="flex items-center gap-1">
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitRename}
                  className="w-24 bg-transparent border-b border-primary/50 text-[10px] outline-none px-0.5"
                  onClick={(e) => e.stopPropagation()}
                />
                <Check className="w-3 h-3 text-green-500" />
              </form>
            ) : (
              <>
                <span className="max-w-[120px] truncate">{t.label}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); startRename(t); }}
                  className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                  title="Renommer"
                >
                  <Pencil className="w-2.5 h-2.5" />
                </button>
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemove(t.id); }}
                    className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                    title="Fermer"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
      <button
        onClick={onAdd}
        className="flex items-center gap-1 px-2 py-1.5 rounded-md text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all"
        title="Nouvel onglet"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
};

export default AnalysisTabBar;
