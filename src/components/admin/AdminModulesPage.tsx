import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Plus, Loader2, Trash2, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';

export default function AdminModulesPage() {
  const [modules, setModules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState('');
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
    const { error } = await supabase.from('admin_modules').insert({ name: newMod.name, description: newMod.description } as any);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Module created' });
    setDialogOpen(false);
    setNewMod({ name: '', description: '' });
    load();
  };

  const toggleActive = async (mod: any) => {
    await supabase.from('admin_modules').update({ is_active: !mod.is_active } as any).eq('id', mod.id);
    toast({ title: `Module ${mod.is_active ? 'deactivated' : 'activated'}` });
    load();
  };

  const handleDelete = async (mod: any) => {
    await supabase.from('admin_modules').delete().eq('id', mod.id);
    toast({ title: 'Module deleted' });
    load();
  };

  const filtered = modules.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Modules</h1>
          <p className="text-sm text-muted-foreground mt-1">{modules.filter(m => m.is_active).length} active / {modules.length} total</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />New Module</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Module</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-sm font-medium text-foreground">Name</label>
                <Input placeholder="Module name" value={newMod.name} onChange={e => setNewMod(p => ({ ...p, name: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Description</label>
                <Input placeholder="Description" value={newMod.description} onChange={e => setNewMod(p => ({ ...p, description: e.target.value }))} className="mt-1" />
              </div>
              <Button onClick={handleCreate} className="w-full">Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search modules..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No modules</TableCell></TableRow>
            ) : filtered.map((m: any) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.name}</TableCell>
                <TableCell className="text-muted-foreground max-w-xs truncate">{m.description}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch checked={m.is_active} onCheckedChange={() => toggleActive(m)} />
                    <Badge variant={m.is_active ? 'default' : 'secondary'}>{m.is_active ? 'Active' : 'Inactive'}</Badge>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete "{m.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>This module will be permanently removed and unlinked from all agents.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(m)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
