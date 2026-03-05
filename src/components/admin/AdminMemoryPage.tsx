import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AdminUser } from '@/services/adminAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Plus, Search, Trash2, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export default function AdminMemoryPage({ currentUser }: { currentUser: AdminUser }) {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newItem, setNewItem] = useState({ content: '', tags: '', importance: 1 });
  const isAdmin = currentUser.role === 'admin';

  const load = async () => {
    setLoading(true);
    let query = supabase.from('memory_items').select('*').order('created_at', { ascending: false }).limit(200);
    if (!isAdmin) query = query.eq('user_id', currentUser.id);
    const { data } = await query;
    setItems((data || []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newItem.content) return;
    const tags = newItem.tags ? newItem.tags.split(',').map(t => t.trim()) : [];
    await supabase.from('memory_items').insert({
      content: newItem.content,
      tags: JSON.stringify(tags),
      importance: newItem.importance,
      user_id: currentUser.id,
    } as any);
    toast({ title: 'Memory item created' });
    setDialogOpen(false);
    setNewItem({ content: '', tags: '', importance: 1 });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this memory item?')) return;
    await supabase.from('memory_items').delete().eq('id', id);
    toast({ title: 'Deleted' });
    load();
  };

  const filtered = items.filter(i => 
    i.content?.toLowerCase().includes(search.toLowerCase()) ||
    JSON.stringify(i.tags)?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Memory Sessions</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Add Memory</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Memory Item</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <Textarea placeholder="Content" value={newItem.content} onChange={e => setNewItem(p => ({ ...p, content: e.target.value }))} />
              <Input placeholder="Tags (comma separated)" value={newItem.tags} onChange={e => setNewItem(p => ({ ...p, tags: e.target.value }))} />
              <Input type="number" placeholder="Importance (1-10)" value={newItem.importance} onChange={e => setNewItem(p => ({ ...p, importance: +e.target.value }))} min={1} max={10} />
              <Button onClick={handleCreate} className="w-full">Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search memory..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Content</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Importance</TableHead>
              <TableHead>Created</TableHead>
              {isAdmin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No memory items</TableCell></TableRow>
            ) : filtered.map((m: any) => (
              <TableRow key={m.id}>
                <TableCell className="max-w-xs truncate">{m.content}</TableCell>
                <TableCell className="text-xs">{Array.isArray(m.tags) ? m.tags.join(', ') : String(m.tags)}</TableCell>
                <TableCell>{m.importance}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</TableCell>
                {isAdmin && (
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(m.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
