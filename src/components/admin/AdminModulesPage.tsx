import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Plus, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export default function AdminModulesPage() {
  const [modules, setModules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newMod, setNewMod] = useState({ name: '', description: '' });

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('admin_modules').select('*').order('created_at', { ascending: false });
    setModules((data || []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newMod.name) return;
    await supabase.from('admin_modules').insert({ name: newMod.name, description: newMod.description } as any);
    toast({ title: 'Module created' });
    setDialogOpen(false);
    setNewMod({ name: '', description: '' });
    load();
  };

  const toggleActive = async (mod: any) => {
    await supabase.from('admin_modules').update({ is_active: !mod.is_active } as any).eq('id', mod.id);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Modules</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />New Module</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Module</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <Input placeholder="Module name" value={newMod.name} onChange={e => setNewMod(p => ({ ...p, name: e.target.value }))} />
              <Input placeholder="Description" value={newMod.description} onChange={e => setNewMod(p => ({ ...p, description: e.target.value }))} />
              <Button onClick={handleCreate} className="w-full">Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : modules.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No modules</TableCell></TableRow>
            ) : modules.map((m: any) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.name}</TableCell>
                <TableCell className="text-muted-foreground">{m.description}</TableCell>
                <TableCell><Switch checked={m.is_active} onCheckedChange={() => toggleActive(m)} /></TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
