import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Database } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ParameterRow } from './parameterHubApi';

interface RawDataViewProps {
  rows: ParameterRow[];
}

type SortKey = keyof ParameterRow;
type SortDir = 'asc' | 'desc';

const COLUMNS: { key: SortKey; label: string; width?: string }[] = [
  { key: 'parameter', label: 'Parameter' },
  { key: 'value', label: 'Value' },
  { key: 'site_name', label: 'Site' },
  { key: 'cell_name', label: 'Cell' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'bande', label: 'Band' },
  { key: 'plaque', label: 'Plaque' },
  { key: 'dor', label: 'DOR' },
  { key: 'zone_arcep', label: 'Zone ARCEP' },
];

function toCsv(rows: ParameterRow[]): string {
  const header = COLUMNS.map((c) => c.label).join(',');
  const lines = rows.map((r) =>
    COLUMNS.map((c) => {
      const v = r[c.key];
      if (v == null) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    }).join(','),
  );
  return [header, ...lines].join('\n');
}

export const RawDataView: React.FC<RawDataViewProps> = ({ rows }) => {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('parameter');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = rows;
    if (q) {
      arr = arr.filter((r) =>
        COLUMNS.some((c) => String(r[c.key] ?? '').toLowerCase().includes(q)),
      );
    }
    arr = [...arr].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (av === bv) return 0;
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [rows, search, sortKey, sortDir]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const slice = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setSortDir('asc');
    }
  };

  const downloadCsv = () => {
    const csv = toCsv(filtered);
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
          {filtered.length.toLocaleString()} / {rows.length.toLocaleString()} rows
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
              {COLUMNS.map((c) => (
                <TableHead
                  key={c.key as string}
                  onClick={() => toggleSort(c.key)}
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {slice.map((r, i) => (
              <TableRow key={`${r.parameter}-${r.cell_name ?? r.site_name ?? ''}-${i}`}>
                {COLUMNS.map((c) => (
                  <TableCell key={c.key as string} className="text-xs whitespace-nowrap py-2">
                    {c.key === 'value' ? (
                      <span className="font-mono text-foreground">{String(r[c.key] ?? '—')}</span>
                    ) : (
                      <span className="text-foreground/90">{String(r[c.key] ?? '—')}</span>
                    )}
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
