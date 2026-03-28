import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Settings2, ArrowRight, Clock, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SiteChange {
  id: number;
  change_date: string;
  change_type: string;
  change_scope: string;
  param_name: string;
  old_value: string | null;
  new_value: string | null;
  site_name: string | null;
  cell_name: string | null;
  techno: string | null;
  vendor: string | null;
}

interface Props {
  siteName: string;
  days?: number;
}

const SiteChangesPanel: React.FC<Props> = ({ siteName, days = 90 }) => {
  const [changes, setChanges] = useState<SiteChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const load = async () => {
    if (!siteName) return;
    setLoading(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data, error } = await (supabase as any)
        .from('parameter_changes')
        .select('id, change_date, change_type, change_scope, param_name, old_value, new_value, site_name, cell_name, techno, vendor')
        .ilike('site_name', `%${siteName}%`)
        .gte('change_date', since.toISOString().slice(0, 10))
        .order('change_date', { ascending: false })
        .limit(50);
      if (error) console.error('parameter_changes error:', error);
      setChanges(data || []);
    } catch (e) {
      console.error('Failed to load parameter changes:', e);
      setChanges([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [siteName]);

  const scopeColor: Record<string, string> = {
    parameter_tuning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    feature_toggle: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    software_upgrade: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  };

  const typeColor: Record<string, string> = {
    create: 'bg-emerald-500/15 text-emerald-400',
    update: 'bg-blue-500/15 text-blue-400',
    delete: 'bg-red-500/15 text-red-400',
  };

  const displayed = expanded ? changes : changes.slice(0, 5);

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-3 bg-muted/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-orange-500/10 flex items-center justify-center">
            <Settings2 className="w-3.5 h-3.5 text-orange-500" />
          </div>
          <div>
            <h5 className="text-[10px] font-extrabold text-foreground uppercase tracking-widest">Parameter Changes</h5>
            <p className="text-[9px] text-muted-foreground">Last {days} days</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {changes.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-orange-500/15 text-orange-400 border border-orange-500/30">
              {changes.length}
            </span>
          )}
          <button onClick={load} disabled={loading} className="p-1 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {loading && changes.length === 0 ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground text-[10px] gap-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading...
        </div>
      ) : changes.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <Settings2 className="w-6 h-6 text-muted-foreground/20 mx-auto mb-1" />
          <p className="text-[10px] text-muted-foreground">No changes detected</p>
        </div>
      ) : (
        <div className="divide-y divide-border/30">
          {displayed.map((c) => (
            <div key={c.id} className="px-4 py-2 hover:bg-muted/20 transition-colors">
              <div className="flex items-center gap-2 mb-1">
                <span className={cn('px-1.5 py-0.5 rounded text-[8px] font-bold uppercase', typeColor[c.change_type] || 'bg-muted text-muted-foreground')}>
                  {c.change_type}
                </span>
                <span className={cn('px-1.5 py-0.5 rounded text-[8px] font-medium border', scopeColor[c.change_scope] || 'bg-muted/50 text-muted-foreground border-border')}>
                  {c.change_scope?.replace(/_/g, ' ')}
                </span>
                {c.techno && (
                  <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-primary/10 text-primary">{c.techno}</span>
                )}
              </div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold text-foreground font-mono">{c.param_name}</span>
                  {c.cell_name && (
                    <span className="ml-1.5 text-[9px] text-muted-foreground">{c.cell_name}</span>
                  )}
                  {c.change_type === 'update' && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-mono text-red-400 bg-red-500/10 px-1 py-0.5 rounded text-[9px] max-w-[100px] truncate">{c.old_value || '∅'}</span>
                      <ArrowRight className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                      <span className="font-mono text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded text-[9px] max-w-[100px] truncate">{c.new_value || '∅'}</span>
                    </div>
                  )}
                </div>
                {c.change_date && (
                  <div className="flex items-center gap-1 text-[9px] text-muted-foreground shrink-0">
                    <Clock className="w-2.5 h-2.5" />
                    {c.change_date.slice(0, 10)}
                  </div>
                )}
              </div>
            </div>
          ))}
          {changes.length > 5 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-full px-4 py-2 flex items-center justify-center gap-1 text-[10px] font-semibold text-primary hover:bg-muted/30 transition-colors"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? 'Show less' : `Show all ${changes.length} changes`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default SiteChangesPanel;
