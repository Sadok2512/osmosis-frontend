import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { RefreshCw, Loader2, Activity } from 'lucide-react';

const TABLES = [
  'admin_users', 'admin_agents', 'admin_modules', 'agent_modules',
  'llm_model_configs', 'memory_items', 'admin_documents', 'agent_runs', 'ping_stats',
  'topo', 'kpi_qoe_aggregated', 'ml_features', 'parameter_dump', 'parameter_changes',
  'dashboards', 'rag_documents', 'agent_feedback', 'agent_memory', 'kpi_catalog', 'map_views',
];

interface TableStat { table_name: string; row_count: number; checked_at: string; }

export default function AdminHealthPage() {
  const [stats, setStats] = useState<TableStat[]>([]);
  const [loading, setLoading] = useState(false);

  const ping = async () => {
    setLoading(true);
    const results: TableStat[] = [];
    const now = new Date().toISOString();

    for (const table of TABLES) {
      try {
        const { count, error } = await supabase.from(table as any).select('*', { count: 'exact', head: true });
        results.push({ table_name: table, row_count: error ? -1 : (count || 0), checked_at: now });
      } catch {
        results.push({ table_name: table, row_count: -1, checked_at: now });
      }
    }

    setStats(results);
    toast({ title: 'Health check complete', description: `${results.length} tables scanned` });
    setLoading(false);
  };

  const totalRows = stats.reduce((s, t) => s + Math.max(0, t.row_count), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Database Health</h1>
          {stats.length > 0 && <p className="text-sm text-muted-foreground mt-1">{totalRows.toLocaleString()} total rows across {stats.length} tables</p>}
        </div>
        <Button onClick={ping} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Ping All Tables
        </Button>
      </div>

      {stats.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Activity className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>Click "Ping All Tables" to scan database health</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Table</TableHead>
                <TableHead className="text-right">Row Count</TableHead>
                <TableHead>Last Checked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.sort((a, b) => b.row_count - a.row_count).map(s => (
                <TableRow key={s.table_name}>
                  <TableCell className="font-mono text-sm">{s.table_name}</TableCell>
                  <TableCell className="text-right">
                    {s.row_count < 0 ? (
                      <span className="text-destructive">Error</span>
                    ) : (
                      <span className="font-semibold">{s.row_count.toLocaleString()}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(s.checked_at).toLocaleTimeString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
