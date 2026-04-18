import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Database } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ParameterRow } from './parameterHubApi';

interface RawDataViewProps {
  rows: ParameterRow[];
}

type SortDir = 'asc' | 'desc';

const DIM_COLUMNS: { key: keyof ParameterRow; label: string }[] = [
  { key: 'site_name', label: 'Site' },
  { key: 'cell_name', label: 'Cell' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'bande', label: 'Band' },
  { key: 'plaque', label: 'Plaque' },
  { key: 'dor', label: 'DOR' },
  { key: 'zone_arcep', label: 'Zone ARCEP' },
];

interface PivotRow {
  site_name: string;
  cell_name: string;
  vendor: string;
  bande: string;
  plaque: string;
  dor: string;
  zone_arcep: string;
  values: Record<string, string>; // parameter -> value
}

function buildPivot(rows: ParameterRow[]): { pivoted: PivotRow[]; parameters: string[] } {
  const paramSet = new Set<string>();
  const map = new Map<string, PivotRow>();
  for (const r of rows) {
    const param = String(r.parameter ?? '');
    if (param) paramSet.add(param);
    const key = `${r.site_name ?? ''}||${r.cell_name ?? ''}`;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        site_name: String(r.site_name ?? '—'),
        cell_name: String(r.cell_name ?? '—'),
        vendor: String(r.vendor ?? '—'),
        bande: String(r.bande ?? '—'),
        plaque: String(r.plaque ?? '—'),
        dor: String(r.dor ?? '—'),
        zone_arcep: String(r.zone_arcep ?? '—'),
        values: {},
      };
      map.set(key, entry);
    }
    if (param) entry.values[param] = String(r.value ?? '—');
  }
  const parameters = [...paramSet].sort();
  return { pivoted: [...map.values()], parameters };
}

function toCsv(rows: PivotRow[], parameters: string[]): string {
  const header = [...DIM_COLUMNS.map((c) => c.label), ...parameters].join(',');
  const escape = (v: unknown) => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const lines = rows.map((r) =>
    [
      ...DIM_COLUMNS.map((c) => escape(r[c.key as keyof PivotRow])),
      ...parameters.map((p) => escape(r.values[p] ?? '')),
    ].join(','),
  );
  return [header, ...lines].join('\n');
}

export const RawDataView: React.FC<RawDataViewProps> = ({ rows }) => {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string>('site_name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const { pivoted, parameters } = useMemo(() => buildPivot(rows), [rows]);

  const allColumns = useMemo(
    () => [...DIM_COLUMNS.map((c) => c.key as string), ...parameters],
    [parameters],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = pivoted;
    if (q) {
      arr = arr.filter((r) => {
        for (const c of DIM_COLUMNS) {
          if (String(r[c.key as keyof PivotRow] ?? '').toLowerCase().includes(q)) return true;
        }
        for (const p of parameters) {
          if (String(r.values[p] ?? '').toLowerCase().includes(q)) return true;
        }
        return false;
      });
    }
    arr = [...arr].sort((a, b) => {
      const isParam = parameters.includes(sortKey);
      const av = isParam ? (a.values[sortKey] ?? '') : (a as any)[sortKey] ?? '';
      const bv = isParam ? (b.values[sortKey] ?? '') : (b as any)[sortKey] ?? '';
      if (av === bv) return 0;
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [pivoted, parameters, search, sortKey, sortDir]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const slice = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const toggleSort = (k: string) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setSortDir('asc');
    }
  };

  const downloadCsv = () => {
    const csv = toCsv(filtered, parameters);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parameter-hub-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <Database className="w-10 h-10 opacity-30 mb-3" />
        <p className="text-sm font-medium">No rows</p>
        <p className="text-xs mt-1">Adjust filters and click Apply.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="Filter rows…"
          className="h-9 max-w-sm text-sm"
        />
        <Badge variant="secondary" className="text-[11px]">
          {filtered.length.toLocaleString()} cells · {parameters.length} param{parameters.length > 1 ? 's' : ''}
        </Badge>
        <div className="flex-1" />
        <button
          onClick={downloadCsv}
          className="inline-flex items-center gap-1.5 px-3 h-9 text-xs font-medium rounded-md border border-border bg-background hover:bg-accent text-foreground"
        >
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      <div className="overflow-auto max-h-[60vh]">
        <Table>
          <TableHeader className="bg-muted/40 sticky top-0 z-10">
            <TableRow>
              {DIM_COLUMNS.map((c) => (
                <TableHead
                  key={c.key as string}
                  onClick={() => toggleSort(c.key as string)}
                  className="cursor-pointer select-none whitespace-nowrap text-xs font-semibold text-foreground"
                >
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    {sortKey === c.key &&
                      (sortDir === 'asc' ? (
                        <ArrowUp className="w-3 h-3" />
                      ) : (
                        <ArrowDown className="w-3 h-3" />
                      ))}
                  </span>
                </TableHead>
              ))}
              {parameters.map((p) => (
                <TableHead
                  key={p}
                  onClick={() => toggleSort(p)}
                  className="cursor-pointer select-none whitespace-nowrap text-xs font-semibold text-primary border-l border-border"
                  title={p}
                >
                  <span className="inline-flex items-center gap-1">
                    {p}
                    {sortKey === p &&
                      (sortDir === 'asc' ? (
                        <ArrowUp className="w-3 h-3" />
                      ) : (
                        <ArrowDown className="w-3 h-3" />
                      ))}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {slice.map((r, i) => (
              <TableRow key={`${r.site_name}-${r.cell_name}-${i}`}>
                {DIM_COLUMNS.map((c) => (
                  <TableCell key={c.key as string} className="text-xs whitespace-nowrap py-2 text-foreground/90">
                    {String(r[c.key as keyof PivotRow] ?? '—')}
                  </TableCell>
                ))}
                {parameters.map((p) => (
                  <TableCell
                    key={p}
                    className="text-xs whitespace-nowrap py-2 font-mono text-foreground border-l border-border"
                  >
                    {r.values[p] ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/20 text-xs text-muted-foreground">
        <span>
          Page {safePage + 1} / {pages}
        </span>
        <div className="flex gap-2">
          <button
            disabled={safePage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="px-2 h-7 rounded border border-border bg-background disabled:opacity-40"
          >
            Prev
          </button>
          <button
            disabled={safePage >= pages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="px-2 h-7 rounded border border-border bg-background disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default RawDataView;
