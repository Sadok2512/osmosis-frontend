import { useMutation, useQuery } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import StatCard from '@/components/shared/StatCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { parserApi } from '@/api/parserApi';
import { useToast } from '@/components/ui/use-toast';

const quickServices = ['TOPO_RELOAD', 'PM_NOKIA', 'CM_NOKIA', 'FM_NOKIA', 'PURGE_OLD_DATA'];

export default function DashboardPage() {
  const { toast } = useToast();
  const statusQuery = useQuery({ queryKey: ['control-status'], queryFn: parserApi.getControlStatus, refetchInterval: 15000 });
  const runMutation = useMutation({
    mutationFn: parserApi.runServiceNow,
    onSuccess: (data, serviceName) => toast({ title: `${serviceName} triggered`, description: data.task_id }),
    onError: (error) => toast({ title: 'Run failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' }),
  });

  const status = statusQuery.data;

  return (
    <div>
      <PageHeader title="Platform dashboard" description="Health and scheduler overview from QOEBIT Parser." />
      <div className="space-y-6 p-6">
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard label="Platform running" value={status?.platform_running ? 'Yes' : 'No'} />
          <StatCard label="CPU" value={`${status?.server.cpu_percent ?? 0}%`} />
          <StatCard label="RAM" value={`${status?.server.ram_percent ?? 0}%`} />
          <StatCard label="Disk" value={`${status?.server.disk_percent ?? 0}%`} />
        </div>

        <Card className="border-slate-800 bg-slate-900/70 text-slate-100">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Quick run</CardTitle>
            <div className="flex flex-wrap gap-2">
              {quickServices.map((service) => (
                <Button key={service} variant="outline" className="border-slate-700 bg-transparent" onClick={() => runMutation.mutate(service)}>
                  <Play className="mr-2 h-4 w-4" /> {service}
                </Button>
              ))}
            </div>
          </CardHeader>
        </Card>

        <Card className="border-slate-800 bg-slate-900/70 text-slate-100">
          <CardHeader>
            <CardTitle>Services</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800">
                  <TableHead>Service</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead>Files today</TableHead>
                  <TableHead>Errors today</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(status?.services || []).map((service) => (
                  <TableRow key={service.service_name} className="border-slate-800">
                    <TableCell>{service.service_name}</TableCell>
                    <TableCell>{service.status}</TableCell>
                    <TableCell>{service.last_run_at || '—'}</TableCell>
                    <TableCell>{service.files_today ?? 0}</TableCell>
                    <TableCell>{service.errors_today ?? 0}</TableCell>
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
