import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AdminUser } from '@/services/adminAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { Plus, Loader2, Bot, BarChart3, Settings, FileText, Database } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Agent { id: string; name: string; description: string; is_active: boolean; base_prompt: string; model_config_id: string | null; created_at: string; }
interface LLMConfig { id: string; provider: string; model_name: string; }

export default function AdminAgentsPage({ currentUser }: { currentUser: AdminUser }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [configs, setConfigs] = useState<LLMConfig[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newAgent, setNewAgent] = useState({ name: '', description: '' });

  const isAdmin = currentUser.role === 'admin';

  const load = async () => {
    setLoading(true);
    const [a, c] = await Promise.all([
      supabase.from('admin_agents').select('*').order('created_at', { ascending: false }),
      supabase.from('llm_model_configs').select('id, provider, model_name'),
    ]);
    setAgents((a.data || []) as any);
    setConfigs((c.data || []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newAgent.name) return;
    const { error } = await supabase.from('admin_agents').insert({ name: newAgent.name, description: newAgent.description } as any);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Agent created' });
    setDialogOpen(false);
    setNewAgent({ name: '', description: '' });
    load();
  };

  const toggleActive = async (agent: Agent) => {
    await supabase.from('admin_agents').update({ is_active: !agent.is_active } as any).eq('id', agent.id);
    load();
  };

  const updatePrompt = async (agent: Agent, prompt: string) => {
    await supabase.from('admin_agents').update({ base_prompt: prompt } as any).eq('id', agent.id);
    toast({ title: 'Prompt saved' });
  };

  const updateConfig = async (agent: Agent, configId: string) => {
    await supabase.from('admin_agents').update({ model_config_id: configId } as any).eq('id', agent.id);
    toast({ title: 'Config updated' });
    load();
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Agents</h1>
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />New Agent</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Agent</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <Input placeholder="Agent name" value={newAgent.name} onChange={e => setNewAgent(p => ({ ...p, name: e.target.value }))} />
                <Input placeholder="Description" value={newAgent.description} onChange={e => setNewAgent(p => ({ ...p, description: e.target.value }))} />
                <Button onClick={handleCreate} className="w-full">Create</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {agents.length === 0 ? (
        <p className="text-muted-foreground text-center py-10">No agents yet.</p>
      ) : (
        <Tabs value={selectedAgent?.id || agents[0]?.id} onValueChange={id => setSelectedAgent(agents.find(a => a.id === id) || null)}>
          <TabsList className="flex-wrap h-auto gap-1">
            {agents.map(a => (
              <TabsTrigger key={a.id} value={a.id} className="gap-2">
                <Bot className="w-4 h-4" />
                {a.name}
                {!a.is_active && <span className="text-[10px] bg-red-500/20 text-red-500 px-1 rounded">OFF</span>}
              </TabsTrigger>
            ))}
          </TabsList>

          {agents.map(agent => (
            <TabsContent key={agent.id} value={agent.id} className="mt-6">
              <AgentDetail agent={agent} configs={configs} isAdmin={isAdmin} onToggle={toggleActive} onSavePrompt={updatePrompt} onChangeConfig={updateConfig} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

function AgentDetail({ agent, configs, isAdmin, onToggle, onSavePrompt, onChangeConfig }: {
  agent: Agent; configs: LLMConfig[]; isAdmin: boolean;
  onToggle: (a: Agent) => void; onSavePrompt: (a: Agent, p: string) => void; onChangeConfig: (a: Agent, c: string) => void;
}) {
  const [prompt, setPrompt] = useState(agent.base_prompt);
  const [runs, setRuns] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);

  useEffect(() => {
    setPrompt(agent.base_prompt);
    supabase.from('agent_runs').select('*').eq('agent_id', agent.id).order('started_at', { ascending: false }).limit(50)
      .then(r => setRuns((r.data || []) as any));
    supabase.from('admin_documents').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false })
      .then(r => setDocs((r.data || []) as any));
  }, [agent.id]);

  const totalRuns = runs.length;
  const successRuns = runs.filter((r: any) => r.status === 'success').length;
  const avgLatency = totalRuns ? Math.round(runs.reduce((s: number, r: any) => s + (r.latency_ms || 0), 0) / totalRuns) : 0;
  const totalTokensIn = runs.reduce((s: number, r: any) => s + (r.tokens_in || 0), 0);
  const totalTokensOut = runs.reduce((s: number, r: any) => s + (r.tokens_out || 0), 0);
  const totalCost = runs.reduce((s: number, r: any) => s + (r.cost_estimate || 0), 0);

  return (
    <Tabs defaultValue="performance">
      <TabsList>
        <TabsTrigger value="performance" className="gap-1"><BarChart3 className="w-4 h-4" />Performance</TabsTrigger>
        <TabsTrigger value="settings" className="gap-1"><Settings className="w-4 h-4" />Settings</TabsTrigger>
        <TabsTrigger value="documents" className="gap-1"><FileText className="w-4 h-4" />Documents</TabsTrigger>
        <TabsTrigger value="memory" className="gap-1"><Database className="w-4 h-4" />Memory</TabsTrigger>
      </TabsList>

      <TabsContent value="performance" className="mt-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Total Runs', value: totalRuns },
            { label: 'Success Rate', value: totalRuns ? `${((successRuns/totalRuns)*100).toFixed(1)}%` : '—' },
            { label: 'Avg Latency', value: `${avgLatency}ms` },
            { label: 'Tokens In', value: totalTokensIn.toLocaleString() },
            { label: 'Tokens Out', value: totalTokensOut.toLocaleString() },
            { label: 'Est. Cost', value: `$${totalCost.toFixed(4)}` },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-lg p-4">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-xl font-bold text-foreground mt-1">{s.value}</div>
            </div>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="settings" className="mt-4 space-y-4">
        <div className="flex items-center gap-4">
          <span className="text-sm text-foreground">Active</span>
          <Switch checked={agent.is_active} onCheckedChange={() => isAdmin && onToggle(agent)} disabled={!isAdmin} />
        </div>
        {isAdmin && (
          <>
            <div>
              <label className="text-sm font-medium text-foreground">LLM Config</label>
              <Select value={agent.model_config_id || ''} onValueChange={v => onChangeConfig(agent, v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select config" /></SelectTrigger>
                <SelectContent>
                  {configs.map(c => <SelectItem key={c.id} value={c.id}>{c.provider} / {c.model_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Base Prompt</label>
              <Textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={8} className="mt-1 font-mono text-xs" />
              <Button onClick={() => onSavePrompt(agent, prompt)} className="mt-2" size="sm">Save Prompt</Button>
            </div>
          </>
        )}
      </TabsContent>

      <TabsContent value="documents" className="mt-4">
        {docs.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">No documents uploaded for this agent.</p>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Filename</TableHead><TableHead>Type</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
            <TableBody>
              {docs.map((d: any) => (
                <TableRow key={d.id}>
                  <TableCell>{d.filename}</TableCell>
                  <TableCell>{d.mime_type}</TableCell>
                  <TableCell>{new Date(d.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TabsContent>

      <TabsContent value="memory" className="mt-4">
        <AgentMemoryView agentId={agent.id} />
      </TabsContent>
    </Tabs>
  );
}

function AgentMemoryView({ agentId }: { agentId: string }) {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    supabase.from('memory_items').select('*').eq('agent_id', agentId).order('created_at', { ascending: false }).limit(100)
      .then(r => setItems((r.data || []) as any));
  }, [agentId]);

  if (items.length === 0) return <p className="text-muted-foreground text-center py-6">No memory items for this agent.</p>;
  return (
    <Table>
      <TableHeader><TableRow><TableHead>Content</TableHead><TableHead>Importance</TableHead><TableHead>Tags</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
      <TableBody>
        {items.map((m: any) => (
          <TableRow key={m.id}>
            <TableCell className="max-w-xs truncate">{m.content}</TableCell>
            <TableCell>{m.importance}</TableCell>
            <TableCell>{JSON.stringify(m.tags)}</TableCell>
            <TableCell>{new Date(m.created_at).toLocaleDateString()}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
