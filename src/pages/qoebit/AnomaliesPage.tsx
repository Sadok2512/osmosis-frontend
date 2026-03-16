import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { kpiApi } from '@/api/kpiApi';

export default function AnomaliesPage() {
  const [cellName, setCellName] = useState('');
  const [kpiCode, setKpiCode] = useState('');
  const anomaliesQuery = useQuery({ queryKey: ['anomalies', cellName, kpiCode], queryFn: () => kpiApi.getAnomalies({ cell_name: cellName, kpi_code: kpiCode, page: 1, limit: 50 }) });
  const summaryQuery = useQuery({ queryKey: ['anomaly-summary'], queryFn: () => kpiApi.getAnomalySummary({ from_date: '2026-01-01' }) });

  return (
    <div>
      <PageHeader title="Anomalies" description="Detected KPI anomalies from the KPI Engine." />
      <div className="grid gap-6 p-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-slate-800 bg-slate-900/70 text-slate-100">
          <CardHeader>
            <CardTitle>Anomaly list</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Input value={cellName} onChange={(e) => setCellName(e.target.value)} placeholder="Cell name" className="border-slate-700 bg-slate-950" />
              <Input value={kpiCode} onChange={(e) => setKpiCode(e.target.value)} placeholder="KPI code" className="border-slate-700 bg-slate-950" />
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800">
                  <TableHead>Detected at</TableHead>
                  <TableHead>Cell</TableHead>
                  <TableHead>KPI</TableHead>
                  <TableHead>Delta %</TableHead>
                  <TableHead>Severity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(anomaliesQuery.data?.items || []).map((item, idx) => (
                  <TableRow key={`${item.detected_at}-${idx}`} className="border-slate-800">
                    <TableCell>{item.detected_at}</TableCell>
                    <TableCell>{item.cell_name}</TableCell>
                    <TableCell>{item.kpi_code}</TableCell>
                    <TableCell>{item.delta_pct ?? '—'}</TableCell>
                    <TableCell>{item.severity || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/70 text-slate-100">
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800">
                  <TableHead>KPI</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(summaryQuery.data?.summary || []).map((item, idx) => (
                  <TableRow key={`${item.kpi_code}-${idx}`} className="border-slate-800">
                    <TableCell>{item.kpi_code}</TableCell>
                    <TableCell>{item.severity}</TableCell>
                    <TableCell>{item.method}</TableCell>
                    <TableCell>{item.count}</TableCell>
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
