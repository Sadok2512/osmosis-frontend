import React from 'react';
import { X, Database, GitBranch, Clock, Cpu } from 'lucide-react';
import type { CounterEntry } from './kpiCatalogTypes';

interface CounterModalProps {
  counter: CounterEntry;
  onClose: () => void;
}

const CounterModal: React.FC<CounterModalProps> = ({ counter, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg mx-4 rounded-2xl bg-card border border-border shadow-2xl animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Database className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Counter Details</h3>
              <p className="text-xs text-muted-foreground font-mono">{counter.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Description</label>
            <p className="mt-1 text-sm text-foreground">{counter.description || 'No description available'}</p>
          </div>

          {/* Vendor Mapping */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Cpu className="w-3 h-3" /> Vendor Mapping
            </label>
            <div className="mt-2 space-y-1.5">
              {Object.entries(counter.vendor_mapping).map(([vendor, mapping]) => (
                <div key={vendor} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50">
                  <span className="text-xs font-semibold text-foreground">{vendor}</span>
                  <span className="text-xs font-mono text-muted-foreground">{mapping}</span>
                </div>
              ))}
              {Object.keys(counter.vendor_mapping).length === 0 && (
                <p className="text-xs text-muted-foreground italic">No vendor mapping defined</p>
              )}
            </div>
          </div>

          {counter.formula && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <GitBranch className="w-3 h-3" /> Formula
              </label>
              <div className="mt-2 px-4 py-3 rounded-xl bg-muted/50 font-mono text-xs text-foreground">
                {counter.formula}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Database className="w-3 h-3" /> Source System
              </label>
              <p className="mt-1 text-sm font-medium text-foreground">{counter.source_system}</p>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> Granularity
              </label>
              <p className="mt-1 text-sm font-medium text-foreground">{counter.granularity}</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-muted text-sm font-medium text-foreground hover:bg-muted/80 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default CounterModal;
