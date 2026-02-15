import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { Upload, X, FileSpreadsheet, Check } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export interface CSVDataset {
  id: string;
  filename: string;
  columns: string[];
  rows: Record<string, any>[];
  uploadedAt: string;
}

interface CSVDataContextType {
  datasets: CSVDataset[];
  addDataset: (ds: CSVDataset) => void;
  removeDataset: (id: string) => void;
  getDataset: (id: string) => CSVDataset | undefined;
}

const CSVDataContext = createContext<CSVDataContextType>({
  datasets: [],
  addDataset: () => {},
  removeDataset: () => {},
  getDataset: () => undefined,
});

export const useCSVData = () => useContext(CSVDataContext);

export const CSVDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [datasets, setDatasets] = useState<CSVDataset[]>([]);

  const addDataset = useCallback((ds: CSVDataset) => {
    setDatasets(prev => [...prev, ds]);
  }, []);

  const removeDataset = useCallback((id: string) => {
    setDatasets(prev => prev.filter(d => d.id !== id));
  }, []);

  const getDataset = useCallback((id: string) => {
    return datasets.find(d => d.id === id);
  }, [datasets]);

  return (
    <CSVDataContext.Provider value={{ datasets, addDataset, removeDataset, getDataset }}>
      {children}
    </CSVDataContext.Provider>
  );
};

// ── CSV Parser ──
function parseCSV(text: string): { columns: string[]; rows: Record<string, any>[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { columns: [], rows: [] };

  // Detect separator
  const sep = lines[0].includes(';') ? ';' : ',';
  const columns = lines[0].split(sep).map(c => c.trim().replace(/^"|"$/g, ''));

  const rows: Record<string, any>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = lines[i].split(sep).map(v => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, any> = {};
    columns.forEach((col, ci) => {
      const val = values[ci] ?? '';
      const num = Number(val);
      row[col] = val !== '' && !isNaN(num) ? num : val;
    });
    rows.push(row);
  }

  return { columns, rows };
}

// ── Upload Button Component ──
export const CSVUploadButton: React.FC = () => {
  const { addDataset, datasets } = useCSVData();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum 20 MB', variant: 'destructive' });
      return;
    }

    const text = await file.text();
    const { columns, rows } = parseCSV(text);

    if (columns.length === 0 || rows.length === 0) {
      toast({ title: 'Empty or invalid CSV', description: 'No data found', variant: 'destructive' });
      return;
    }

    const ds: CSVDataset = {
      id: `csv_${Date.now()}`,
      filename: file.name,
      columns,
      rows,
      uploadedAt: new Date().toISOString(),
    };

    addDataset(ds);
    toast({
      title: `"${file.name}" loaded`,
      description: `${rows.length} rows · ${columns.length} columns`,
    });
  }, [addDataset]);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  return (
    <>
      <input ref={inputRef} type="file" accept=".csv,.txt" onChange={onChange} className="hidden" />
      <button
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors bg-muted text-foreground hover:bg-muted/80"
        title={datasets.length > 0 ? `${datasets.length} dataset(s) loaded` : 'Upload CSV data'}
      >
        <Upload className="w-3 h-3" />
        CSV
        {datasets.length > 0 && (
          <span className="ml-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center font-bold">
            {datasets.length}
          </span>
        )}
      </button>
    </>
  );
};

// ── Dataset list panel ──
export const CSVDataPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { datasets, removeDataset } = useCSVData();

  return (
    <div className="w-72 border-l border-border bg-card flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-foreground">Uploaded Data</span>
        <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="w-3 h-3" /></button>
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-2">
        {datasets.length === 0 && (
          <p className="text-[11px] text-muted-foreground text-center py-8">No CSV files uploaded yet</p>
        )}
        {datasets.map(ds => (
          <div key={ds.id} className="bg-muted/50 rounded-lg p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5 text-primary" />
                <span className="text-[11px] font-medium text-foreground truncate max-w-[160px]">{ds.filename}</span>
              </div>
              <button onClick={() => removeDataset(ds.id)} className="p-0.5 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive">
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="flex gap-2 text-[10px] text-muted-foreground">
              <span>{ds.rows.length} rows</span>
              <span>·</span>
              <span>{ds.columns.length} cols</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {ds.columns.slice(0, 8).map(col => (
                <span key={col} className="px-1.5 py-0.5 bg-background rounded text-[9px] text-muted-foreground border border-border">
                  {col}
                </span>
              ))}
              {ds.columns.length > 8 && (
                <span className="px-1.5 py-0.5 text-[9px] text-muted-foreground">+{ds.columns.length - 8}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
