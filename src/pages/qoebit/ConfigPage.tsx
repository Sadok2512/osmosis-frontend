import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parserApi } from '@/api/parserApi';
import { useToast } from '@/components/ui/use-toast';

export default function ConfigPage() {
  const { toast } = useToast();
  const operatorQuery = useQuery({ queryKey: ['operator-config'], queryFn: parserApi.getOperatorConfig });
  const dbQuery = useQuery({ queryKey: ['db-config'], queryFn: parserApi.getDatabaseConfig });
  const schedulesQuery = useQuery({ queryKey: ['schedules'], queryFn: parserApi.getSchedules });

  const [operatorName, setOperatorName] = useState('');
  const [country, setCountry] = useState('');
  const [dbHost, setDbHost] = useState('');
  const [dbPort, setDbPort] = useState('5432');
  const [dbName, setDbName] = useState('RAN_OP');
  const [dbUser, setDbUser] = useState('postgres');
  const [dbPassword, setDbPassword] = useState('');

  const operatorMutation = useMutation({
    mutationFn: () => parserApi.saveOperatorConfig({ name: operatorName, country, vendors: ['Nokia'] }),
    onSuccess: () => toast({ title: 'Operator saved' }),
  });
  const dbTestMutation = useMutation({
    mutationFn: () => parserApi.testDatabaseConfig({ host: dbHost, port: Number(dbPort), db_name: dbName, username: dbUser, password: dbPassword }),
    onSuccess: (data) => toast({ title: `Database test: ${data.status}`, description: data.message }),
  });

  return (
    <div>
      <PageHeader title="Configuration" description="Operator and database settings exposed by QOEBIT Parser." />
      <div className="grid gap-6 p-6 xl:grid-cols-3">
        <Card className="border-slate-800 bg-slate-900/70 text-slate-100">
          <CardHeader><CardTitle>Operator</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-slate-400">Current: {operatorQuery.data?.name || '—'} / {operatorQuery.data?.country || '—'}</div>
            <Input value={operatorName} onChange={(e) => setOperatorName(e.target.value)} placeholder="Operator name" className="border-slate-700 bg-slate-950" />
            <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" className="border-slate-700 bg-slate-950" />
            <Button onClick={() => operatorMutation.mutate()}>Save operator</Button>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/70 text-slate-100">
          <CardHeader><CardTitle>Database</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-slate-400">Current: {dbQuery.data?.host || '—'}:{dbQuery.data?.port || '—'} / {dbQuery.data?.db_name || '—'}</div>
            <Input value={dbHost} onChange={(e) => setDbHost(e.target.value)} placeholder="Host" className="border-slate-700 bg-slate-950" />
            <Input value={dbPort} onChange={(e) => setDbPort(e.target.value)} placeholder="Port" className="border-slate-700 bg-slate-950" />
            <Input value={dbName} onChange={(e) => setDbName(e.target.value)} placeholder="Database name" className="border-slate-700 bg-slate-950" />
            <Input value={dbUser} onChange={(e) => setDbUser(e.target.value)} placeholder="Username" className="border-slate-700 bg-slate-950" />
            <Input value={dbPassword} onChange={(e) => setDbPassword(e.target.value)} placeholder="Password" type="password" className="border-slate-700 bg-slate-950" />
            <Button variant="outline" className="border-slate-700 bg-transparent" onClick={() => dbTestMutation.mutate()}>Test connection</Button>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/70 text-slate-100">
          <CardHeader><CardTitle>Schedules</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-slate-300">
              {(schedulesQuery.data || []).map((item) => (
                <li key={String(item.id)} className="rounded-lg border border-slate-800 p-3">
                  <div className="font-medium">{item.service_name}</div>
                  <div className="text-slate-400">{item.run_time} · {item.is_active ? 'active' : 'inactive'}</div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
