import React, { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, Loader2, CheckCircle, AlertTriangle, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { supabase } from '@/integrations/supabase/client';
import * as XLSX from 'xlsx';

interface KpiRow {
  kpi_key: string;
  display_name: string;
  famille: string;
  priorite: string;
  techno: string;
  unit: string;
  orientation: string;
  definition: string;
  numerator: string;
  denominator: string;
  formula_sql: string;
  nom_bdd: string;
}

// Color palette for families
const FAMILY_COLORS: Record<string, string> = {
  ACCESSIBILITY: '#3b82f6', RETAINABILITY: '#ef4444', MOBILITY: '#f59e0b',
  THROUGHPUT: '#14b8a6', TRAFFIC: '#8b5cf6', Corporate: '#ec4899',
  CAPACITY: '#0ea5e9', AVAILABILITY: '#10b981', INTERFERENCE: '#f97316',
  ENERGY: '#6366f1', UTILIZATION: '#64748b',
};

function parseXlsx(data: ArrayBuffer): KpiRow[] {
  const wb = XLSX.read(data, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // Find header row
  const headerIdx = raw.findIndex(row =>
    row.some((c: any) => typeof c === 'string' && c.toLowerCase().includes('nom kpi'))
  );
  if (headerIdx < 0) throw new Error('Header row with "Nom KPI" not found');

  const headers = raw[headerIdx].map((h: any) => String(h || '').trim());
  const colMap = {
    famille: headers.findIndex((h: string) => /famille/i.test(h)),
    nom_kpi: headers.findIndex((h: string) => /nom\s*kpi/i.test(h)),
    priorite: headers.findIndex((h: string) => /priorit/i.test(h)),
    techno: headers.findIndex((h: string) => /techno/i.test(h)),
    unit: headers.findIndex((h: string) => /unit/i.test(h)),
    orientation: headers.findIndex((h: string) => /orientation/i.test(h)),
    definition: headers.findIndex((h: string) => /d[ée]finition/i.test(h)),
    numerator: headers.findIndex((h: string) => /num[ée]rateur/i.test(h)),
    denominator: headers.findIndex((h: string) => /d[ée]nominateur/i.test(h)),
    formula_sql: headers.findIndex((h: string) => /formule.*sql/i.test(h)),
    nom_bdd: headers.findIndex((h: string) => /nom\s*bdd/i.test(h)),
  };

  const rows: KpiRow[] = [];
  const seen = new Set<string>();

  for (let i = headerIdx + 1; i < raw.length; i++) {
    const r = raw[i];
    if (!r || r.length === 0) continue;
    const nomKpi = String(r[colMap.nom_kpi] || '').trim();
    if (!nomKpi) continue;
    if (seen.has(nomKpi)) continue;
    seen.add(nomKpi);

    rows.push({
      kpi_key: nomKpi,
      display_name: nomKpi,
      famille: String(r[colMap.famille] || '').trim(),
      priorite: String(r[colMap.priorite] || 'Secondaire').trim(),
      techno: String(r[colMap.techno] || '').trim(),
      unit: String(r[colMap.unit] || '').trim(),
      orientation: String(r[colMap.orientation] || '0').trim(),
      definition: String(r[colMap.definition] || '').trim(),
      numerator: String(r[colMap.numerator] || '').trim(),
      denominator: String(r[colMap.denominator] || '').trim(),
      formula_sql: String(r[colMap.formula_sql] || '').trim(),
      nom_bdd: String(r[colMap.nom_bdd] || nomKpi).trim(),
    });
  }
  return rows;
}

function inferValueType(row: KpiRow): string {
  if (row.denominator && row.denominator !== '1' && row.denominator !== '') return 'ratio';
  if (row.unit.toLowerCase().includes('count') || row.orientation === 'MAXIMIZE') return 'counter';
  return 'gauge';
}

const KPICatalogImport: React.FC = () => {
  const [parsedRows, setParsedRows] = useState<KpiRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<{ success: number; errors: number } | null>(null);
  const [filterPrimaire, setFilterPrimaire] = useState(false);
  const [clearBefore, setClearBefore] = useState(false);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    try {
      const rows = parseXlsx(buf);
      setParsedRows(rows);
      setResult(null);
    } catch (err: any) {
      console.error('Parse error:', err);
    }
  }, []);

  const filteredRows = filterPrimaire ? parsedRows.filter(r => r.priorite === 'Primaire') : parsedRows;
  const families = [...new Set(filteredRows.map(r => r.famille).filter(Boolean))].sort();

  const doImport = async () => {
    setImporting(true);
    setResult(null);
    let success = 0;
    let errors = 0;

    if (clearBefore) {
      await supabase.from('kpi_catalog').delete().neq('id', 0);
    }

    const BATCH = 100;
    const rows = filteredRows;
    setProgress({ done: 0, total: rows.length });

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH).map(r => ({
        kpi_key: r.kpi_key,
        display_name: r.display_name,
        famille: r.famille || null,
        priorite: r.priorite || 'Secondaire',
        techno: r.techno || null,
        unit: r.unit || '',
        orientation: r.orientation || '0',
        definition: r.definition || '',
        numerator: r.numerator || '',
        denominator: r.denominator || '',
        formula_sql: r.formula_sql || '',
        nom_bdd: r.nom_bdd || r.kpi_key,
        value_type: inferValueType(r),
        default_agg: r.unit === '%' ? 'avg' : 'sum',
        is_map_supported: r.priorite === 'Primaire',
        color: FAMILY_COLORS[r.famille] || '#64748b',
      }));

      const { error } = await supabase.from('kpi_catalog').upsert(batch, { onConflict: 'kpi_key' });
      if (error) {
        console.error('Batch error:', error);
        errors += batch.length;
      } else {
        success += batch.length;
      }
      setProgress({ done: Math.min(i + BATCH, rows.length), total: rows.length });
    }

    setResult({ success, errors });
    setImporting(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 cursor-pointer hover:bg-primary/20 transition-colors">
          <FileSpreadsheet className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold text-primary">Charger XLSX KPI</span>
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
        </label>
        {parsedRows.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {parsedRows.length} KPIs parsés • {families.length} familles
          </Badge>
        )}
      </div>

      {parsedRows.length > 0 && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            {families.slice(0, 9).map(f => (
              <div key={f} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: FAMILY_COLORS[f] || '#64748b' }} />
                <span className="text-[10px] font-bold truncate">{f}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {filteredRows.filter(r => r.famille === f).length}
                </span>
              </div>
            ))}
          </div>

          {/* Options */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={filterPrimaire} onCheckedChange={setFilterPrimaire} />
              <label className="text-[10px] font-bold text-muted-foreground">Primaires uniquement ({parsedRows.filter(r => r.priorite === 'Primaire').length})</label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={clearBefore} onCheckedChange={setClearBefore} />
              <label className="text-[10px] font-bold text-muted-foreground">
                <Trash2 className="w-3 h-3 inline mr-1" />Réinitialiser avant import
              </label>
            </div>
          </div>

          {/* Import button */}
          <Button onClick={doImport} disabled={importing} className="w-full gap-2">
            {importing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Import {progress.done}/{progress.total}...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Importer {filteredRows.length} KPIs en base
              </>
            )}
          </Button>

          {/* Result */}
          {result && (
            <div className={`flex items-center gap-2 p-3 rounded-xl ${result.errors > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'} border`}>
              {result.errors > 0 ? <AlertTriangle className="w-4 h-4 text-red-500" /> : <CheckCircle className="w-4 h-4 text-emerald-500" />}
              <span className="text-xs font-bold">
                {result.success} importés • {result.errors} erreurs
              </span>
            </div>
          )}

          {/* Preview table */}
          <div className="max-h-60 overflow-auto rounded-lg border border-border">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="bg-muted/50 sticky top-0">
                  <th className="text-left px-2 py-1.5 font-bold">Famille</th>
                  <th className="text-left px-2 py-1.5 font-bold">Nom KPI</th>
                  <th className="text-left px-2 py-1.5 font-bold">Prio</th>
                  <th className="text-left px-2 py-1.5 font-bold">Techno</th>
                  <th className="text-left px-2 py-1.5 font-bold">Unité</th>
                  <th className="text-left px-2 py-1.5 font-bold">Type</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.slice(0, 50).map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-2 py-1">
                      <Badge variant="outline" className="text-[8px]" style={{ borderColor: FAMILY_COLORS[r.famille] || '#64748b' }}>
                        {r.famille || '—'}
                      </Badge>
                    </td>
                    <td className="px-2 py-1 font-mono truncate max-w-[200px]">{r.kpi_key}</td>
                    <td className="px-2 py-1">
                      <Badge variant={r.priorite === 'Primaire' ? 'default' : 'secondary'} className="text-[8px]">
                        {r.priorite}
                      </Badge>
                    </td>
                    <td className="px-2 py-1">{r.techno}</td>
                    <td className="px-2 py-1">{r.unit || '—'}</td>
                    <td className="px-2 py-1">{inferValueType(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredRows.length > 50 && (
              <div className="text-center py-2 text-[10px] text-muted-foreground">
                ... et {filteredRows.length - 50} autres KPIs
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default KPICatalogImport;
