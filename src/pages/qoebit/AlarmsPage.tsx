import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { parserApi } from '@/api/parserApi';

export default function AlarmsPage() {
  const [site, setSite] = useState('');
  const [severity, setSeverity] = useState('');
  const query = useQuery({ queryKey: ['alarms', site, severity], queryFn: () => parserApi.getNokiaAlarms({ site, severity, page: 1, limit: 50 }) });

  return (
    <div>
      <PageHeader title="FM alarms" description="Nokia FM alarms filtered through the QOEBIT Parser." />
      <div className="p-6">
        <Card className="border-slate-800 bg-slate-900/70 text-slate-100">
          <CardHeader>
            <CardTitle>Alarm stream</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Input value={site} onChange={(e) => setSite(e.target.value)} placeholder="Site name" className="border-slate-700 bg-slate-950" />
              <Input value={severity} onChange={(e) => setSeverity(e.target.value)} placeholder="Severity" className="border-slate-700 bg-slate-950" />
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800">
                  <TableHead>Time</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Problem</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(query.data?.items || []).map((item) => (
                  <TableRow key={String(item.id)} className="border-slate-800">
                    <TableCell>{item.alarm_time}</TableCell>
                    <TableCell>{item.site_name || '—'}</TableCell>
                    <TableCell>{item.alarm_severity || '—'}</TableCell>
                    <TableCell>{item.alarm_type || '—'}</TableCell>
                    <TableCell>{item.specific_problem || '—'}</TableCell>
                    <TableCell>{item.alarm_status || '—'}</TableCell>
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
