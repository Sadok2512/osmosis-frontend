import React, { useState, useRef } from 'react';
import { Upload, FileText, X, CheckCircle2, AlertCircle } from 'lucide-react';

interface CsvUploadInputProps {
  validValues?: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}

interface ParseResult {
  filename: string;
  rows: number;
  columns: string[];
  selectedColumn: string;
  values: string[];
  validValues: string[];
  invalidValues: string[];
}

/**
 * CSV upload with column detection, mapping, and validation.
 * Accepts CSV/TSV; auto-detects header; lets user pick which column to import.
 */
const CsvUploadInput: React.FC<CsvUploadInputProps> = ({ validValues, selected, onChange }) => {
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parseCsv = (text: string, filename: string): ParseResult => {
    // Detect separator
    const firstLine = text.split('\n')[0] || '';
    const sep = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) throw new Error('Empty file');

    const split = (l: string) => l.split(sep).map(s => s.trim().replace(/^"|"$/g, ''));
    const headerCells = split(lines[0]);
    // Heuristic: header row exists if cells aren't all numeric/empty
    const headerLooksReal = headerCells.some(c => /^[a-zA-Z_]/.test(c));
    const columns = headerLooksReal ? headerCells : headerCells.map((_, i) => `Column ${i + 1}`);
    const dataLines = headerLooksReal ? lines.slice(1) : lines;
    const selectedColumn = columns[0];
    const colIdx = 0;
    const values = dataLines.map(l => split(l)[colIdx]).filter(Boolean);

    let validVals = values;
    let invalidVals: string[] = [];
    if (validValues && validValues.length > 0) {
      const validSet = new Set(validValues.map(v => v.toLowerCase()));
      validVals = [];
      for (const v of values) {
        if (validSet.has(v.toLowerCase())) validVals.push(v);
        else invalidVals.push(v);
      }
    }

    return {
      filename,
      rows: values.length,
      columns,
      selectedColumn,
      values,
      validValues: Array.from(new Set(validVals)),
      invalidValues: invalidVals,
    };
  };

  const onFile = async (file: File) => {
    setError(null);
    if (file.size > 5 * 1024 * 1024) {
      setError('File too large (max 5MB)');
      return;
    }
    try {
      const text = await file.text();
      const res = parseCsv(text, file.name);
      setParseResult(res);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const changeColumn = (col: string) => {
    if (!parseResult) return;
    setParseResult({ ...parseResult, selectedColumn: col });
  };

  const importValues = () => {
    if (!parseResult) return;
    onChange(parseResult.validValues);
  };

  const reset = () => {
    setParseResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-2">
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.tsv,.txt"
        onChange={e => e.target.files?.[0] && onFile(e.target.files[0])}
        className="hidden"
      />

      {!parseResult ? (
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-lg border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-colors text-muted-foreground hover:text-primary"
        >
          <Upload className="w-6 h-6" />
          <span className="text-xs font-semibold">Click to upload CSV/TSV</span>
          <span className="text-[10px] opacity-70">One column expected · max 5MB</span>
        </button>
      ) : (
        <div className="rounded-lg border border-border bg-card p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-foreground truncate flex-1">{parseResult.filename}</span>
            <button onClick={reset} className="p-1 rounded hover:bg-muted">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>

          {parseResult.columns.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">Column</span>
              <select
                value={parseResult.selectedColumn}
                onChange={e => changeColumn(e.target.value)}
                className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs"
              >
                {parseResult.columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          <div className="flex items-center gap-3 text-[11px]">
            <span className="text-muted-foreground">Uploaded: <strong className="text-foreground">{parseResult.rows}</strong></span>
            <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
              <CheckCircle2 className="w-3 h-3" /> {parseResult.validValues.length} valid
            </span>
            {parseResult.invalidValues.length > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-600 font-semibold">
                <AlertCircle className="w-3 h-3" /> {parseResult.invalidValues.length} not found
              </span>
            )}
          </div>

          <div className="rounded bg-muted/30 p-2 max-h-24 overflow-y-auto">
            <div className="flex flex-wrap gap-1">
              {parseResult.validValues.slice(0, 15).map(v => (
                <span key={v} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">{v}</span>
              ))}
              {parseResult.validValues.length > 15 && (
                <span className="text-[10px] text-muted-foreground self-center">+{parseResult.validValues.length - 15} more</span>
              )}
            </div>
          </div>

          <button
            onClick={importValues}
            className="w-full px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-bold hover:opacity-90"
          >
            Import {parseResult.validValues.length} values
          </button>
        </div>
      )}

      {error && (
        <div className="text-[11px] text-destructive flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </div>
      )}

      {selected.length > 0 && !parseResult && (
        <div className="text-[10px] text-muted-foreground italic">
          {selected.length} value{selected.length > 1 ? 's' : ''} loaded from previous import
        </div>
      )}
    </div>
  );
};

export default CsvUploadInput;
