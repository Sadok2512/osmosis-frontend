import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { parserApi } from '@/api/parserApi';

export default function TopologyPage() {
  const [search, setSearch] = useState('');
  const [cellNames, setCellNames] = useState('PARIS_01_L18A');
  const cellsQuery = useQuery({ queryKey: ['topo-cells', search], queryFn: () => parserApi.searchCells({ search, limit: 50 }) });
  const hierarchyQuery = useQuery({ queryKey: ['topo-hierarchy'], queryFn: parserApi.getHierarchy });
  const resolveMutation = useMutation({ mutationFn: parserApi.resolveCells });

  const hierarchyPreview = useMemo(() => JSON.stringify(hierarchyQuery.data || {}, null, 2).slice(0, 2000), [hierarchyQuery.data]);

  return (
    <div>
      <PageHeader title="Topology" description="Cell search, hierarchy, and cell resolution from topo_data." />
      <div className="grid gap-6 p-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-slate-800 bg-slate-900/70 text-slate-100">
          <CardHeader>
            <CardTitle>Search cells</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by cell or site" className="border-slate-700 bg-slate-950" />
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800">
                  <TableHead>Cell</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Plaque</TableHead>
                  <TableHead>DOR</TableHead>
                  <TableHead>Band</TableHead>
                  <TableHead>Techno</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(cellsQuery.data || []).map((cell) => (
                  <TableRow key={`${cell.cell_name}-${cell.lncel_id}`} className="border-slate-800">
                    <TableCell>{cell.cell_name}</TableCell>
                    <TableCell>{cell.site_name || '—'}</TableCell>
                    <TableCell>{cell.plaque || '—'}</TableCell>
                    <TableCell>{cell.dor || '—'}</TableCell>
                    <TableCell>{cell.band || '—'}</TableCell>
                    <TableCell>{cell.techno || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-slate-800 bg-slate-900/70 text-slate-100">
            <CardHeader>
              <CardTitle>Resolve cells</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea value={cellNames} onChange={(e) => setCellNames(e.target.value)} className="min-h-32 border-slate-700 bg-slate-950" />
              <Button onClick={() => resolveMutation.mutate(cellNames.split(/\s|,|;|\n/).filter(Boolean))}>Resolve</Button>
              {resolveMutation.data ? (
                <div className="space-y-2 text-sm text-slate-300">
                  <div>Resolved: {resolveMutation.data.total}</div>
                  <div>Not found: {resolveMutation.data.not_found.join(', ') || 'None'}</div>
                </div>
              ) : null}
            </CardContent>
          </Card>
          <Card className="border-slate-800 bg-slate-900/70 text-slate-100">
            <CardHeader>
              <CardTitle>Hierarchy preview</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-300">{hierarchyPreview}</pre>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
