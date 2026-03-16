import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { parserApi } from '@/api/parserApi';

export default function CmHistoryPage() {
  const [site, setSite] = useState('');
  const [parameter, setParameter] = useState('');
  const query = useQuery({ queryKey: ['cm-history', site, parameter], queryFn: () => parserApi.getCmHistory({ site, parameter, page: 1, limit: 50 }) });

  return (
    <div>
      <PageHeader title="CM history" description="Configuration changes from cm_history_nokia." />
      <div className="p-6">
        <Card className="border-slate-800 bg-slate-900/70 text-slate-100">
          <CardHeader>
            <CardTitle>Recent changes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Input value={site} onChange={(e) => setSite(e.target.value)} placeholder="Site name" className="border-slate-700 bg-slate-950" />
              <Input value={parameter} onChange={(e) => setParameter(e.target.value)} placeholder="Parameter" className="border-slate-700 bg-slate-950" />
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800">
                  <TableHead>Changed at</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Parameter</TableHead>
                  <TableHead>Old value</TableHead>
                  <TableHead>New value</TableHead>
                  <TableHead>User</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(query.data?.items || []).map((item) => (
                  <TableRow key={String(item.id)} className="border-slate-800">
                    <TableCell>{item.changed_at}</TableCell>
                    <TableCell>{item.site_name || '—'}</TableCell>
                    <TableCell>{item.parameter_name || '—'}</TableCell>
                    <TableCell>{item.old_value || '—'}</TableCell>
                    <TableCell>{item.new_value || '—'}</TableCell>
                    <TableCell>{item.netact_user || '—'}</TableCell>
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
