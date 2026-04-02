import React, { useState, useEffect, useMemo } from 'react';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import { Layers, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SliceEntry {
  id: number;
  vendor: string;
  rat: string;
  ne_name: string | null;
  snssai: string;
  sst: number;
  sst_name: string;
  sd_hex: string | null;
  sd_dec: number | null;
  label: string;
  label_src: string;
  fiveqi_values: number[];
  fiveqi_src: string;
  rp_name: string | null;
}

const QI_LABELS: Record<number, string> = {
  1:'Voice',2:'Video Live',3:'Gaming',4:'Video Buf',5:'IMS',6:'Video TCP',
  7:'Interactive',8:'TCP Prem',9:'Default',13:'Oper.13',14:'Oper.14',
  19:'Oper.19',20:'Oper.20',82:'AR/VR',83:'Automation',84:'URLLC',130:'Operator',
};

const SST_COLORS: Record<string, string> = {
  eMBB: 'bg-blue-500/15 text-blue-400',
  URLLC: 'bg-red-500/15 text-red-400',
  MIoT: 'bg-green-500/15 text-green-400',
  V2X: 'bg-purple-500/15 text-purple-400',
};

const SliceMappingSection: React.FC = () => {
  const [data, setData] = useState<SliceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterVendor, setFilterVendor] = useState('');
  const [filterRat, setFilterRat] = useState('');

  useEffect(() => {
    fetch(getApiUrl('pm/slice-mapping'), { headers: getApiHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const vendors = useMemo(() => [...new Set(data.map(d => d.vendor))].sort(), [data]);
  const rats = useMemo(() => [...new Set(data.map(d => d.rat))].sort(), [data]);

  const filtered = useMemo(() => {
    let items = data;
    if (filterVendor) items = items.filter(d => d.vendor === filterVendor);
    if (filterRat) items = items.filter(d => d.rat === filterRat);
    return items;
  }, [data, filterVendor, filterRat]);

  // Group by vendor + rat
  const groups = useMemo(() => {
    const g = new Map<string, SliceEntry[]>();
    for (const d of filtered) {
      const key = `${d.vendor} ${d.rat}`;
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(d);
    }
    return g;
  }, [filtered]);

  return (
    <section className="space-y-4">
      {/* Header + filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-purple-500/10 rounded-lg ring-1 ring-purple-500/20">
            <Layers className="w-4 h-4 text-purple-500" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-foreground uppercase tracking-tight">QoS & Network Slicing Mapping</h2>
            <p className="text-[10px] text-muted-foreground">{data.length} profiles — Nokia PMQAP + Ericsson FLEX + 5G SNSSAI Slices</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-3 h-3 text-muted-foreground" />
          <select value={filterVendor} onChange={e => setFilterVendor(e.target.value)}
            className="h-7 px-2 rounded-md border border-border bg-background text-foreground text-[10px] font-medium">
            <option value="">All Vendors</option>
            {vendors.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={filterRat} onChange={e => setFilterRat(e.target.value)}
            className="h-7 px-2 rounded-md border border-border bg-background text-foreground text-[10px] font-medium">
            <option value="">All RAT</option>
            {rats.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border/60 bg-card p-8 text-center text-xs text-muted-foreground animate-pulse">
          Loading mapping...
        </div>
      ) : (
        <>
          {Array.from(groups.entries()).map(([groupKey, entries]) => {
            const vendor = entries[0].vendor;
            const rat = entries[0].rat;
            const isEricsson = vendor === 'Ericsson';
            const borderColor = isEricsson ? 'border-blue-500/30' : 'border-orange-500/30';
            const headerBg = isEricsson ? 'bg-blue-500/5' : 'bg-orange-500/5';

            return (
              <div key={groupKey} className={cn('rounded-xl border bg-card overflow-hidden', borderColor)}>
                <div className={cn('px-4 py-2.5 border-b border-border/40 flex items-center justify-between', headerBg)}>
                  <div className="flex items-center gap-2">
                    <span className={cn('text-[10px] px-2 py-0.5 rounded font-bold', isEricsson ? 'bg-blue-500/15 text-blue-400' : 'bg-orange-500/15 text-orange-400')}>
                      {vendor}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 font-bold">{rat}</span>
                    <span className="text-[10px] text-muted-foreground">{entries.length} profiles</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="border-b border-border/40 bg-muted/10">
                        <th className="px-3 py-2 text-left font-bold text-muted-foreground uppercase tracking-wider">#</th>
                        <th className="px-3 py-2 text-left font-bold text-muted-foreground uppercase tracking-wider">
                          {rat === 'NR' ? 'SNSSAI' : 'Profile'}
                        </th>
                        {rat === 'NR' && <th className="px-3 py-2 text-left font-bold text-muted-foreground uppercase tracking-wider">SST</th>}
                        {rat === 'NR' && <th className="px-3 py-2 text-left font-bold text-muted-foreground uppercase tracking-wider">SD</th>}
                        <th className="px-3 py-2 text-left font-bold text-muted-foreground uppercase tracking-wider">Label</th>
                        <th className="px-3 py-2 text-left font-bold text-muted-foreground uppercase tracking-wider">QCI / 5QI</th>
                        <th className="px-3 py-2 text-left font-bold text-muted-foreground uppercase tracking-wider">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e, i) => (
                        <tr key={e.id} className="border-b border-border/20 hover:bg-muted/10 transition-colors">
                          <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-1.5 font-mono font-bold">{e.snssai}</td>
                          {rat === 'NR' && (
                            <td className="px-3 py-1.5">
                              <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-bold', SST_COLORS[e.sst_name] || 'bg-muted text-muted-foreground')}>
                                {e.sst_name}
                              </span>
                            </td>
                          )}
                          {rat === 'NR' && (
                            <td className="px-3 py-1.5 font-mono text-muted-foreground">{e.sd_hex || '—'}</td>
                          )}
                          <td className="px-3 py-1.5 font-semibold">{e.label}</td>
                          <td className="px-3 py-1.5">
                            <div className="flex gap-1 flex-wrap">
                              {e.fiveqi_values.map(qi => (
                                <span key={qi} className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-mono font-bold" title={QI_LABELS[qi] || ''}>
                                  {qi}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-1.5">
                            <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-medium',
                              e.fiveqi_src === 'cm_dump' ? 'bg-cyan-500/10 text-cyan-500' :
                              e.fiveqi_src === 'pm_derived' ? 'bg-amber-500/10 text-amber-500' :
                              'bg-muted text-muted-foreground'
                            )}>
                              {e.fiveqi_src}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
};

export default SliceMappingSection;
