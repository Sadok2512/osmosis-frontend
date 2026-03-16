import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/shared/PageHeader';
import StatCard from '@/components/shared/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { parserApi } from '@/api/parserApi';

export default function NeighborsPage() {
  const [srcLncelId, setSrcLncelId] = useState('');
  const statsQuery = useQuery({ queryKey: ['ho-stats'], queryFn: parserApi.getNeighborsHoStats });
  const topFailingQuery = useQuery({ queryKey: ['ho-top-failing'], queryFn: () => parserApi.getTopFailingHo({ limit: 20 }) });
  const listQuery = useQuery({ queryKey: ['ho-list', srcLncelId], queryFn: () => parserApi.getNeighborsHo({ src_lncel_id: srcLncelId, page: 1, limit: 50 }) });

  return (
    <div>
      <PageHeader title="HO neighbors" description="Neighbor handover analytics from pm_nokia_neighbors_ho." />
      <div className="space-y-6 p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Rows" value={statsQuery.data?.total_rows ?? 0} />
          <StatCard label="Global HO SR" value={`${statsQuery.data?.global_ho_sr ?? 0}%`} />
          <StatCard label="Source cells" value={statsQuery.data?.src_cells ?? 0} />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="border-slate-800 bg-slate-900/70 text-slate-100">
            <CardHeader>
              <CardTitle>Search HO links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input value={srcLncelId} onChange={(e) => setSrcLncelId(e.target.value)} placeholder="Source LNCEL ID" className="border-slate-700 bg-slate-950" />
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800">
                    <TableHead>Time</TableHead>
                    <TableHead>Src cell</TableHead>
                    <TableHead>Target ECI</TableHead>
                    <TableHead>HO SR out</TableHead>
                    <TableHead>Ping pong</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(listQuery.data?.items || []).map((row, idx) => (
                    <TableRow key={`${row.end_time}-${idx}`} className="border-slate-800">
                      <TableCell>{row.end_time}</TableCell>
                      <TableCell>{String(row.src_lncel_id ?? '—')}</TableCell>
                      <TableCell>{String(row.target_eci ?? '—')}</TableCell>
                      <TableCell>{row.ho_sr_out ?? '—'}</TableCell>
                      <TableCell>{row.ho_ping_pong ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/70 text-slate-100">
            <CardHeader>
              <CardTitle>Top failing links</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800">
                    <TableHead>Src LNCEL</TableHead>
                    <TableHead>Target ECI</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Success</TableHead>
                    <TableHead>SR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(topFailingQuery.data || []).map((row, idx) => (
                    <TableRow key={`${row.src_lncel_id}-${row.target_eci}-${idx}`} className="border-slate-800">
                      <TableCell>{String(row.src_lncel_id)}</TableCell>
                      <TableCell>{String(row.target_eci)}</TableCell>
                      <TableCell>{row.total_att}</TableCell>
                      <TableCell>{row.total_succ}</TableCell>
                      <TableCell>{row.ho_sr}%</TableCell>
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
