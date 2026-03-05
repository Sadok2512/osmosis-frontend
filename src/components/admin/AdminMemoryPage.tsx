import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AdminUser } from '@/services/adminAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Plus, Search, Trash2, Loader2, Edit2, Save, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';

export default function AdminMemoryPage({ currentUser }: { currentUser: AdminUser }) {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newItem, setNewItem] = useState({ content: '', tags: '', importance: 1 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
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

  const handleUpdate = async (id: string) => {
    await supabase.from('memory_items').update({ content: editContent, updated_at: new Date().toISOString() } as any).eq('id', id);
    toast({ title: 'Memory updated' });
    setEditingId(null);
    load();
  };

  const handleDelete = async (id: string) => {
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
        <div>
          <h1 className="text-2xl font-bold text-foreground">Memory Sessions</h1>
          <p className="text-sm text-muted-foreground mt-1">{items.length} memory items</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Add Memory</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Memory Item</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-sm font-medium text-foreground">Content</label>
                <Textarea placeholder="Memory content..." value={newItem.content} onChange={e => setNewItem(p => ({ ...p, content: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Tags</label>
                <Input placeholder="tag1, tag2, tag3" value={newItem.tags} onChange={e => setNewItem(p => ({ ...p, tags: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Importance (1-10)</label>
                <Input type="number" value={newItem.importance} onChange={e => setNewItem(p => ({ ...p, importance: +e.target.value }))} min={1} max={10} className="mt-1" />
              </div>
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
              <TableHead>Updated</TableHead>
              {(isAdmin) && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No memory items</TableCell></TableRow>
            ) : filtered.map((m: any) => (
              <TableRow key={m.id}>
                <TableCell className="max-w-xs">
                  {editingId === m.id ? (
                    <div className="flex items-center gap-2">
                      <Input value={editContent} onChange={e => setEditContent(e.target.value)} className="text-xs" />
                      <Button variant="ghost" size="icon" onClick={() => handleUpdate(m.id)}><Save className="w-4 h-4 text-green-500" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setEditingId(null)}><X className="w-4 h-4" /></Button>
                    </div>
                  ) : (
                    <span className="truncate block">{m.content}</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(Array.isArray(m.tags) ? m.tags : []).map((t: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">{t}</Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={m.importance >= 7 ? 'destructive' : m.importance >= 4 ? 'default' : 'secondary'}>
                    {m.importance}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(m.updated_at).toLocaleDateString()}</TableCell>
                {isAdmin && (
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => { setEditingId(m.id); setEditContent(m.content); }}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete memory item?</AlertDialogTitle>
                          <AlertDialogDescription>This memory item will be permanently removed.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(m.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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
