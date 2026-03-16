import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { kpiApi } from '@/api/kpiApi';

export default function KpiMonitorPage() {
  const [cellName, setCellName] = useState('PARIS_01_L18A');
  const [kpiCode, setKpiCode] = useState('rrc_sr');
  const [fromDate, setFromDate] = useState('2026-01-01');
  const [toDate, setToDate] = useState('2026-01-15');

  const seriesQuery = useQuery({
    queryKey: ['kpi-series', cellName, kpiCode, fromDate, toDate],
    queryFn: () => kpiApi.getCellKpiSeries(cellName, { kpi_code: kpiCode, from_date: fromDate, to_date: toDate, period: '15MIN' }),
  });

  const definitionsQuery = useQuery({ queryKey: ['kpi-definitions'], queryFn: () => kpiApi.getDefinitions({ limit: 20 }) });
  const computeMutation = useMutation({
    mutationFn: () => kpiApi.computeLiveKpis({ kpi_codes: [kpiCode], cell_names: [cellName], from_date: fromDate, to_date: toDate, aggregation: 'CELL' }),
  });

  return (
    <div>
      <PageHeader title="KPI monitor" description="KPI Engine integration for time series and live compute." />
      <div className="grid gap-6 p-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-slate-800 bg-slate-900/70 text-slate-100">
          <CardHeader>
            <CardTitle>KPI time series</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Input value={cellName} onChange={(e) => setCellName(e.target.value)} placeholder="Cell name" className="border-slate-700 bg-slate-950" />
              <Input value={kpiCode} onChange={(e) => setKpiCode(e.target.value)} placeholder="KPI code" className="border-slate-700 bg-slate-950" />
              <Input value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="border-slate-700 bg-slate-950" />
              <Input value={toDate} onChange={(e) => setToDate(e.target.value)} className="border-slate-700 bg-slate-950" />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => seriesQuery.refetch()}>Refresh series</Button>
              <Button variant="outline" className="border-slate-700 bg-transparent" onClick={() => computeMutation.mutate()}>
                Compute live
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800">
                  <TableHead>Period</TableHead>
                  <TableHead>KPI</TableHead>
                  <TableHead>Anomaly</TableHead>
                  <TableHead>Z-score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(seriesQuery.data?.data || []).map((row) => (
                  <TableRow key={row.period_start} className="border-slate-800">
                    <TableCell>{row.period_start}</TableCell>
                    <TableCell>{row.kpi_value ?? '—'}</TableCell>
                    <TableCell>{row.is_anomaly ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{row.z_score ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card className="border-slate-800 bg-slate-900/70 text-slate-100">
            <CardHeader>
              <CardTitle>Live compute result</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-300">{JSON.stringify(computeMutation.data, null, 2) || 'Run compute live.'}</pre>
            </CardContent>
          </Card>
          <Card className="border-slate-800 bg-slate-900/70 text-slate-100">
            <CardHeader>
              <CardTitle>KPI definitions</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800">
                    <TableHead>Code</TableHead>
                    <TableHead>Family</TableHead>
                    <TableHead>Techno</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(definitionsQuery.data?.items || []).map((item) => (
                    <TableRow key={item.kpi_code} className="border-slate-800">
                      <TableCell>{item.kpi_code}</TableCell>
                      <TableCell>{item.famille || '—'}</TableCell>
                      <TableCell>{item.techno || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
