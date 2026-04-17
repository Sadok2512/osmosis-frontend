import React from 'react';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import { Settings2, ArrowRight, Clock, User, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CMChange {
  cell_name: string;
  site_name: string;
  changed_at: string | null;
  parameter_name: string;
  old_value: string;
  new_value: string;
  change_type: string;
  mo: string | null;
  change_origin: string;
  netact_user: string;
}

interface Props {
  cellNames: string[];
  siteNames?: string[];
  plaques?: string[];
  days?: number;
}

async function fetchCmChanges(params: { cell_names?: string[]; site_names?: string[]; plaques?: string[]; days: number; limit: number }): Promise<CMChange[]> {
  if (!params.cell_names?.length && !params.site_names?.length && !params.plaques?.length) return [];
  const url = getApiUrl('cm/cell-changes');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(params),
    });
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

const CMChangesCard: React.FC<Props> = ({ cellNames, siteNames = [], plaques = [], days = 30 }) => {
  const [changes, setChanges] = React.useState<CMChange[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  const load = async () => {
    setLoading(true);
    const data = await fetchCmChanges({
      cell_names: cellNames.length > 0 ? cellNames : undefined,
      site_names: siteNames.length > 0 ? siteNames : undefined,
      plaques: plaques.length > 0 ? plaques : undefined,
      days,
      limit: 50,
    });
    setChanges(data);
    setLoading(false);
    setLoaded(true);
  };

  React.useEffect(() => {
    const hasFilter = cellNames.length > 0 || siteNames.length > 0 || plaques.length > 0;
    if (hasFilter && !loaded) {
      load();
    }
  }, [cellNames.join(','), siteNames.join(','), plaques.join(',')]);

  // Group by site
  const grouped = changes.reduce<Record<string, CMChange[]>>((acc, c) => {
    const key = c.site_name || c.cell_name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  const changeTypeColor: Record<string, string> = {
    create: 'bg-green-500/15 text-green-500 border-green-500/30',
    update: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
    delete: 'bg-red-500/15 text-red-500 border-red-500/30',
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border/40 bg-muted/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center">
            <Settings2 className="w-4 h-4 text-orange-500" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-foreground uppercase tracking-tight">CM Parameter Changes</h3>
            <p className="text-[9px] text-muted-foreground">Last {days} days — configuration changes on worst cells</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {changes.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-orange-500/15 text-orange-500 border border-orange-500/30">
              {changes.length} change{changes.length !== 1 ? 's' : ''}
            </span>
          )}
          <button onClick={load} disabled={loading} className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {loading && !loaded ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground text-xs gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading CM changes...
        </div>
      ) : changes.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <Settings2 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No parameter changes detected in the last {days} days</p>
        </div>
      ) : (
        <div className="divide-y divide-border/30">
          {Object.entries(grouped).map(([site, siteChanges]) => (
            <div key={site} className="px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold text-primary">{site}</span>
                <span className="text-[9px] text-muted-foreground">({siteChanges.length} changes)</span>
              </div>
              <div className="space-y-1.5">
                {siteChanges.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 text-[10px] py-1 px-2 rounded-md hover:bg-muted/20">
                    {/* Change type badge */}
                    <span className={cn(
                      'px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border shrink-0 mt-0.5',
                      changeTypeColor[c.change_type] || 'bg-muted text-muted-foreground'
                    )}>
                      {c.change_type}
                    </span>

                    {/* Parameter + values */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-foreground font-mono">{c.parameter_name}</span>
                        {c.mo && <span className="text-[8px] text-muted-foreground bg-muted px-1 py-0.5 rounded font-mono">{c.mo}</span>}
                      </div>
                      {c.change_type === 'update' && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-red-400 bg-red-500/10 px-1 py-0.5 rounded text-[9px] max-w-[120px] truncate">{c.old_value || '∅'}</span>
                          <ArrowRight className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                          <span className="font-mono text-green-400 bg-green-500/10 px-1 py-0.5 rounded text-[9px] max-w-[120px] truncate">{c.new_value || '∅'}</span>
                        </div>
                      )}
                    </div>

                    {/* Timestamp + user */}
                    <div className="text-right shrink-0 space-y-0.5">
                      {c.changed_at && (
                        <div className="flex items-center gap-1 text-[9px] text-muted-foreground justify-end">
                          <Clock className="w-2.5 h-2.5" />
                          {c.changed_at.slice(0, 16).replace('T', ' ')}
                        </div>
                      )}
                      {c.netact_user && (
                        <div className="flex items-center gap-1 text-[9px] text-muted-foreground justify-end">
                          <User className="w-2.5 h-2.5" />
                          {c.netact_user}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CMChangesCard;
