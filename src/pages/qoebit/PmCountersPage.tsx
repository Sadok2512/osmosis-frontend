import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/shared/PageHeader';
import StatCard from '@/components/shared/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { parserApi } from '@/api/parserApi';

export default function PmCountersPage() {
  const [counterName, setCounterName] = useState('');
  const statsQuery = useQuery({ queryKey: ['pm-stats'], queryFn: parserApi.getPmStats });
  const countersQuery = useQuery({ queryKey: ['pm-counters', counterName], queryFn: () => parserApi.getPmCounters({ counter_name: counterName, page: 1, limit: 50 }) });

  return (
    <div>
      <PageHeader title="PM counters" description="15-minute Nokia counters from fact_counters_15min." />
      <div className="space-y-6 p-6">
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard label="Rows" value={statsQuery.data?.total_rows ?? 0} />
          <StatCard label="Sites" value={statsQuery.data?.sites ?? 0} />
          <StatCard label="Cells" value={statsQuery.data?.cells ?? 0} />
          <StatCard label="Counters" value={statsQuery.data?.distinct_counters ?? 0} />
        </div>

        <Card className="border-slate-800 bg-slate-900/70 text-slate-100">
          <CardHeader>
            <CardTitle>Counter browse</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input value={counterName} onChange={(e) => setCounterName(e.target.value)} placeholder="Counter name" className="border-slate-700 bg-slate-950" />
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800">
                  <TableHead>Time</TableHead>
                  <TableHead>MRBTS</TableHead>
                  <TableHead>LNCEL</TableHead>
                  <TableHead>Object type</TableHead>
                  <TableHead>Counter</TableHead>
                  <TableHead>Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(countersQuery.data?.items || []).map((row, idx) => (
                  <TableRow key={`${row.end_time}-${idx}`} className="border-slate-800">
                    <TableCell>{row.end_time}</TableCell>
                    <TableCell>{String(row.mrbts_id ?? '—')}</TableCell>
                    <TableCell>{String(row.lncel_id ?? '—')}</TableCell>
                    <TableCell>{row.obj_type || '—'}</TableCell>
                    <TableCell>{row.counter_name || '—'}</TableCell>
                    <TableCell>{String(row.counter_value ?? '—')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
