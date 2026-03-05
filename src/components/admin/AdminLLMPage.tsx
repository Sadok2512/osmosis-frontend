import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Plus, Loader2, Save, Star } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';

interface LLMConfig {
  id: string; provider: string; model_name: string; temperature: number;
  top_p: number; max_tokens: number; system_prompt_prefix: string; is_default: boolean; updated_at: string;
}

export default function AdminLLMPage() {
  const [configs, setConfigs] = useState<LLMConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<LLMConfig | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newConfig, setNewConfig] = useState({ provider: 'lovable-ai', model_name: 'google/gemini-3-flash-preview', temperature: 0.7, top_p: 1, max_tokens: 4096, system_prompt_prefix: '' });

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('llm_model_configs').select('*').order('updated_at', { ascending: false });
    setConfigs((data || []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    await supabase.from('llm_model_configs').insert(newConfig as any);
    toast({ title: 'Config created' });
    setDialogOpen(false);
    load();
  };

  const handleSave = async (c: LLMConfig) => {
    await supabase.from('llm_model_configs').update({
      provider: c.provider, model_name: c.model_name, temperature: c.temperature,
      top_p: c.top_p, max_tokens: c.max_tokens, system_prompt_prefix: c.system_prompt_prefix,
      updated_at: new Date().toISOString(),
    } as any).eq('id', c.id);
    toast({ title: 'Config saved' });
    setEditing(null);
    load();
  };

  const setDefault = async (c: LLMConfig) => {
    // Remove all defaults first
    await supabase.from('llm_model_configs').update({ is_default: false } as any).neq('id', '');
    await supabase.from('llm_model_configs').update({ is_default: true } as any).eq('id', c.id);
    toast({ title: 'Default updated' });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">LLM Settings</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />New Config</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>New LLM Configuration</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <Input placeholder="Provider" value={newConfig.provider} onChange={e => setNewConfig(p => ({ ...p, provider: e.target.value }))} />
              <Input placeholder="Model name" value={newConfig.model_name} onChange={e => setNewConfig(p => ({ ...p, model_name: e.target.value }))} />
              <div>
                <label className="text-sm">Temperature: {newConfig.temperature}</label>
                <Slider value={[newConfig.temperature]} onValueChange={v => setNewConfig(p => ({ ...p, temperature: v[0] }))} min={0} max={2} step={0.1} className="mt-1" />
              </div>
              <Input type="number" placeholder="Max tokens" value={newConfig.max_tokens} onChange={e => setNewConfig(p => ({ ...p, max_tokens: +e.target.value }))} />
              <Textarea placeholder="System prompt prefix" value={newConfig.system_prompt_prefix} onChange={e => setNewConfig(p => ({ ...p, system_prompt_prefix: e.target.value }))} />
              <Button onClick={handleCreate} className="w-full">Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : configs.map(c => (
          <div key={c.id} className="bg-card border border-border rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-foreground">{c.provider} / {c.model_name}</h3>
                {c.is_default && <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full flex items-center gap-1"><Star className="w-3 h-3" />Default</span>}
              </div>
              <div className="flex gap-2">
                {!c.is_default && <Button variant="outline" size="sm" onClick={() => setDefault(c)}>Set Default</Button>}
                <Button variant="outline" size="sm" onClick={() => setEditing(editing?.id === c.id ? null : c)}>
                  {editing?.id === c.id ? 'Cancel' : 'Edit'}
                </Button>
              </div>
            </div>
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>Temp: {c.temperature}</span>
              <span>Top-P: {c.top_p}</span>
              <span>Max Tokens: {c.max_tokens}</span>
            </div>
            {editing?.id === c.id && (
              <div className="space-y-3 pt-2 border-t border-border">
                <Input value={editing.provider} onChange={e => setEditing({ ...editing, provider: e.target.value })} placeholder="Provider" />
                <Input value={editing.model_name} onChange={e => setEditing({ ...editing, model_name: e.target.value })} placeholder="Model" />
                <div>
                  <label className="text-sm">Temperature: {editing.temperature}</label>
                  <Slider value={[editing.temperature]} onValueChange={v => setEditing({ ...editing, temperature: v[0] })} min={0} max={2} step={0.1} className="mt-1" />
                </div>
                <Input type="number" value={editing.max_tokens} onChange={e => setEditing({ ...editing, max_tokens: +e.target.value })} />
                <Textarea value={editing.system_prompt_prefix} onChange={e => setEditing({ ...editing, system_prompt_prefix: e.target.value })} rows={3} />
                <Button onClick={() => handleSave(editing)} size="sm"><Save className="w-4 h-4 mr-2" />Save</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
