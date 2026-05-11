import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AdminUser } from '@/services/adminAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { Plus, Loader2, Bot, BarChart3, Settings, FileText, Database, Upload, Trash2, Eye, Blocks, Save, RotateCcw, MessageSquareText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

interface Agent { id: string; name: string; description: string; is_active: boolean; base_prompt: string; model_config_id: string | null; created_at: string; }
interface LLMConfig { id: string; provider: string; model_name: string; system_prompt_prefix: string; }
interface Module { id: string; name: string; is_active: boolean; }
interface AgentSkill { id: string; agent_id: string; name: string; description: string | null; skill_type: string; is_active: boolean; created_at: string; updated_at: string; }

function parseSkillMetadata(content: string, filename: string) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  const metadata: Record<string, string> = {};
  if (match) {
    for (const line of match[1].split(/\r?\n/)) {
      const item = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (item) metadata[item[1]] = item[2].replace(/^['"]|['"]$/g, '').trim();
    }
  }
  const body = match ? content.slice(match[0].length) : content;
  const heading = body.split(/\r?\n/).find(line => line.startsWith('# '))?.slice(2).trim();
  const name = metadata.name || heading || filename.replace(/\.[^.]+$/, '');
  const description = metadata.description || body.split(/\r?\n/).find(line => line.trim() && !line.startsWith('#'))?.trim() || '';
  return { name, description };
}

function skillIdFromName(name: string) {
  let id = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!id) id = 'UPLOADED_SKILL';
  if (/^[0-9]/.test(id)) id = `SKILL_${id}`;
  return id.slice(0, 60);
}

export default function AdminAgentsPage({ currentUser }: { currentUser: AdminUser }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [configs, setConfigs] = useState<LLMConfig[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newAgent, setNewAgent] = useState({ name: '', description: '' });

  const isAdmin = currentUser.role === 'admin';

  const load = async () => {
    setLoading(true);
    const [a, c, m] = await Promise.all([
      supabase.from('admin_agents').select('*').order('created_at', { ascending: false }),
      supabase.from('llm_model_configs').select('id, provider, model_name, system_prompt_prefix'),
      supabase.from('admin_modules').select('id, name, is_active'),
    ]);
    const agentsList = (a.data || []) as any[];
    setAgents(agentsList);
    setConfigs((c.data || []) as any);
    setModules((m.data || []) as any);
    if (!selectedAgent && agentsList.length > 0) setSelectedAgent(agentsList[0].id);
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

  const handleDeleteAgent = async (agent: Agent) => {
    const { error } = await supabase.from('admin_agents').delete().eq('id', agent.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Agent deleted' });
    if (selectedAgent === agent.id) setSelectedAgent('');
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

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const currentAgent = agents.find(a => a.id === selectedAgent);

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
        <div className="text-center py-16">
          <Bot className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-muted-foreground">No agents yet. Create your first agent to get started.</p>
        </div>
      ) : (
        <Tabs value={selectedAgent} onValueChange={setSelectedAgent}>
          <TabsList className="flex-wrap h-auto gap-1">
            {agents.map(a => (
              <TabsTrigger key={a.id} value={a.id} className="gap-2">
                <Bot className="w-4 h-4" />
                {a.name}
                {!a.is_active && <span className="text-[10px] bg-destructive/20 text-destructive px-1 rounded">OFF</span>}
              </TabsTrigger>
            ))}
          </TabsList>

          {agents.map(agent => (
            <TabsContent key={agent.id} value={agent.id} className="mt-6">
              <AgentDetail
                agent={agent}
                configs={configs}
                modules={modules}
                isAdmin={isAdmin}
                onToggle={toggleActive}
                onSavePrompt={updatePrompt}
                onChangeConfig={updateConfig}
                onDelete={handleDeleteAgent}
                onReload={load}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

function AgentDetail({ agent, configs, modules, isAdmin, onToggle, onSavePrompt, onChangeConfig, onDelete, onReload }: {
  agent: Agent; configs: LLMConfig[]; modules: Module[]; isAdmin: boolean;
  onToggle: (a: Agent) => void; onSavePrompt: (a: Agent, p: string) => void; onChangeConfig: (a: Agent, c: string) => void;
  onDelete: (a: Agent) => void; onReload: () => void;
}) {
  const [prompt, setPrompt] = useState(agent.base_prompt);
  const [promptDirty, setPromptDirty] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [runs, setRuns] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [agentModules, setAgentModules] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const skillInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingSkill, setUploadingSkill] = useState(false);

  useEffect(() => {
    setPrompt(agent.base_prompt);
    setPromptDirty(false);
    Promise.all([
      supabase.from('agent_runs').select('*').eq('agent_id', agent.id).order('started_at', { ascending: false }).limit(50),
      supabase.from('admin_documents').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false }),
      supabase.from('agent_skills').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false }),
      supabase.from('agent_modules').select('module_id').eq('agent_id', agent.id),
    ]).then(([r, d, s, m]) => {
      setRuns((r.data || []) as any);
      setDocs((d.data || []) as any);
      setSkills((s.data || []) as any);
      setAgentModules((m.data || []).map((x: any) => x.module_id));
    });
  }, [agent.id]);

  const totalRuns = runs.length;
  const successRuns = runs.filter((r: any) => r.status === 'success').length;
  const avgLatency = totalRuns ? Math.round(runs.reduce((s: number, r: any) => s + (r.latency_ms || 0), 0) / totalRuns) : 0;
  const totalTokensIn = runs.reduce((s: number, r: any) => s + (r.tokens_in || 0), 0);
  const totalTokensOut = runs.reduce((s: number, r: any) => s + (r.tokens_out || 0), 0);
  const totalCost = runs.reduce((s: number, r: any) => s + (r.cost_estimate || 0), 0);
  const lastRun = runs[0]?.started_at ? new Date(runs[0].started_at).toLocaleString() : '—';

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    
    for (const file of Array.from(files)) {
      const path = `agents/${agent.id}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage.from('rag-files').upload(path, file);
      if (uploadErr) {
        toast({ title: 'Upload failed', description: uploadErr.message, variant: 'destructive' });
        continue;
      }
      await supabase.from('admin_documents').insert({
        agent_id: agent.id,
        filename: file.name,
        storage_path: path,
        mime_type: file.type || 'application/octet-stream',
      } as any);
    }

    toast({ title: 'Documents uploaded' });
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    // Refresh docs
    const { data } = await supabase.from('admin_documents').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false });
    setDocs((data || []) as any);
  };

  const handleDeleteDoc = async (doc: any) => {
    await supabase.storage.from('rag-files').remove([doc.storage_path]);
    await supabase.from('admin_documents').delete().eq('id', doc.id);
    toast({ title: 'Document deleted' });
    const { data } = await supabase.from('admin_documents').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false });
    setDocs((data || []) as any);
  };

  const refreshSkills = async () => {
    const { data } = await supabase.from('agent_skills').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false });
    setSkills((data || []) as any);
  };

  const handleSkillUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.name !== 'SKILL.md' && !file.name.endsWith('.md')) {
      toast({ title: 'Invalid file', description: 'Upload a SKILL.md file.', variant: 'destructive' });
      return;
    }

    setUploadingSkill(true);
    try {
      const content = await file.text();
      const metadata = parseSkillMetadata(content, file.name);
      const skillId = skillIdFromName(metadata.name);
      const formData = new FormData();
      formData.append('file', file, file.name);
      const res = await fetch('/api/v1/skills/import', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || payload.detail || `HTTP ${res.status}`);
      if (Array.isArray(payload.errors) && payload.errors.length > 0) {
        throw new Error(payload.errors.join('; '));
      }

      const existing = await supabase
        .from('agent_skills')
        .select('id')
        .eq('agent_id', agent.id)
        .eq('name', skillId)
        .maybeSingle();
      const record = {
        agent_id: agent.id,
        name: skillId,
        description: metadata.description,
        skill_type: 'qoe-skill',
        is_active: true,
        updated_at: new Date().toISOString(),
      };
      const { error } = existing.data?.id
        ? await supabase.from('agent_skills').update(record as any).eq('id', existing.data.id)
        : await supabase.from('agent_skills').insert(record as any);
      if (error) throw error;

      toast({ title: 'Skill uploaded', description: `${skillId} imported into the skill engine.` });
      await refreshSkills();
    } catch (err: any) {
      toast({ title: 'Skill upload failed', description: err?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setUploadingSkill(false);
      if (skillInputRef.current) skillInputRef.current.value = '';
    }
  };

  const toggleSkill = async (skill: AgentSkill) => {
    const { error } = await supabase.from('agent_skills').update({ is_active: !skill.is_active, updated_at: new Date().toISOString() } as any).eq('id', skill.id);
    if (error) {
      toast({ title: 'Skill update failed', description: error.message, variant: 'destructive' });
      return;
    }
    await refreshSkills();
  };

  const toggleModule = async (moduleId: string) => {
    if (agentModules.includes(moduleId)) {
      await supabase.from('agent_modules').delete().eq('agent_id', agent.id).eq('module_id', moduleId);
      setAgentModules(prev => prev.filter(m => m !== moduleId));
    } else {
      await supabase.from('agent_modules').insert({ agent_id: agent.id, module_id: moduleId } as any);
      setAgentModules(prev => [...prev, moduleId]);
    }
    toast({ title: 'Module assignment updated' });
  };

  const currentConfig = configs.find(c => c.id === agent.model_config_id);
  const composedPrompt = [
    currentConfig?.system_prompt_prefix ? `[System Prefix]\n${currentConfig.system_prompt_prefix}` : '',
    `[Agent Prompt]\n${prompt || '(empty)'}`,
    `[Memory Context]\n(User memory items will be injected here at runtime)`,
    `[RAG Documents]\n(${docs.length} documents available for retrieval)`,
    `[User Message]\n(User message will appear here)`,
  ].filter(Boolean).join('\n\n---\n\n');

  return (
    <Tabs defaultValue="performance">
      <TabsList>
        <TabsTrigger value="performance" className="gap-1"><BarChart3 className="w-4 h-4" />Performance</TabsTrigger>
        <TabsTrigger value="prompt" className="gap-1"><MessageSquareText className="w-4 h-4" />Prompt</TabsTrigger>
        <TabsTrigger value="settings" className="gap-1"><Settings className="w-4 h-4" />Settings</TabsTrigger>
        <TabsTrigger value="modules" className="gap-1"><Blocks className="w-4 h-4" />Modules</TabsTrigger>
        <TabsTrigger value="skills" className="gap-1"><Blocks className="w-4 h-4" />Skills</TabsTrigger>
        <TabsTrigger value="documents" className="gap-1"><FileText className="w-4 h-4" />Documents</TabsTrigger>
        <TabsTrigger value="memory" className="gap-1"><Database className="w-4 h-4" />Memory</TabsTrigger>
      </TabsList>

      {/* Performance Tab */}
      <TabsContent value="performance" className="mt-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Runs', value: totalRuns },
            { label: 'Success Rate', value: totalRuns ? `${((successRuns/totalRuns)*100).toFixed(1)}%` : '—' },
            { label: 'Avg Latency', value: `${avgLatency}ms` },
            { label: 'Tokens In', value: totalTokensIn.toLocaleString() },
            { label: 'Tokens Out', value: totalTokensOut.toLocaleString() },
            { label: 'Est. Cost', value: `$${totalCost.toFixed(4)}` },
            { label: 'Last Run', value: lastRun },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-lg p-4">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-lg font-bold text-foreground mt-1">{s.value}</div>
            </div>
          ))}
        </div>
        {runs.length > 0 && (
          <div className="mt-6 rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Latency</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.slice(0, 10).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge variant={r.status === 'success' ? 'default' : r.status === 'error' ? 'destructive' : 'secondary'}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{r.latency_ms}ms</TableCell>
                    <TableCell>{r.tokens_in}/{r.tokens_out}</TableCell>
                    <TableCell>${(r.cost_estimate || 0).toFixed(4)}</TableCell>
                    <TableCell>{r.score ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(r.started_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>

      {/* Prompt Tab */}
      <TabsContent value="prompt" className="mt-4 space-y-6">
        {isAdmin ? (
          <>
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-foreground">Base Prompt</label>
                  {promptDirty && (
                    <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-500">Modified</Badge>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
                  <Eye className="w-4 h-4 mr-1" />Preview Composed
                </Button>
              </div>
              <Textarea
                value={prompt}
                onChange={e => { setPrompt(e.target.value); setPromptDirty(e.target.value !== agent.base_prompt); }}
                rows={16}
                className="font-mono text-xs"
              />
              <div className="flex items-center gap-2 mt-3">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" disabled={!promptDirty || savingPrompt}>
                      {savingPrompt ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                      Confirm &amp; Save Prompt
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Save prompt for "{agent.name}"?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will update the agent's base prompt immediately. The new prompt will be used for all future agent runs.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={async () => {
                        setSavingPrompt(true);
                        await onSavePrompt(agent, prompt);
                        setPromptDirty(false);
                        setSavingPrompt(false);
                        onReload();
                      }}>Confirm &amp; Apply</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button variant="ghost" size="sm" disabled={!promptDirty} onClick={() => { setPrompt(agent.base_prompt); setPromptDirty(false); }}>
                  <RotateCcw className="w-4 h-4 mr-1" />Reset
                </Button>
              </div>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground text-center py-6">Admin access required to edit prompts.</p>
        )}

        {/* Prompt Preview Dialog */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
            <DialogHeader><DialogTitle>Composed Prompt Preview</DialogTitle></DialogHeader>
            <pre className="whitespace-pre-wrap text-xs font-mono bg-secondary/30 p-4 rounded-lg border border-border text-foreground">
              {composedPrompt}
            </pre>
          </DialogContent>
        </Dialog>
      </TabsContent>

      {/* Settings Tab */}
      <TabsContent value="settings" className="mt-4 space-y-6">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-foreground">Active</span>
          <Switch checked={agent.is_active} onCheckedChange={() => isAdmin && onToggle(agent)} disabled={!isAdmin} />
        </div>

        {isAdmin && (
          <div>
            <label className="text-sm font-medium text-foreground">LLM Config</label>
            <Select value={agent.model_config_id || ''} onValueChange={v => onChangeConfig(agent, v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select config" /></SelectTrigger>
              <SelectContent>
                {configs.map(c => <SelectItem key={c.id} value={c.id}>{c.provider} / {c.model_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </TabsContent>

      {/* Modules Tab */}
      <TabsContent value="modules" className="mt-4">
        <p className="text-sm text-muted-foreground mb-4">Assign modules to this agent. Only active modules can be assigned.</p>
        {modules.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">No modules available. Create modules first.</p>
        ) : (
          <div className="grid gap-3">
            {modules.map(m => (
              <div key={m.id} className="flex items-center justify-between bg-card border border-border rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={agentModules.includes(m.id)}
                    onCheckedChange={() => isAdmin && toggleModule(m.id)}
                    disabled={!isAdmin || !m.is_active}
                  />
                  <div>
                    <span className="font-medium text-foreground">{m.name}</span>
                    {!m.is_active && <Badge variant="secondary" className="ml-2 text-[10px]">Inactive</Badge>}
                  </div>
                </div>
                {agentModules.includes(m.id) && <Badge>Assigned</Badge>}
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      {/* Skills Tab — restyled 2026-05-11 to match the Sentinel ML pages
          (SentinelMLDetector pattern: white card + slate palette + sticky
          header + status pills + inline upload button). */}
      <TabsContent value="skills" className="mt-4">
        <section className="flex flex-col bg-white rounded-lg border border-slate-200 overflow-hidden">
          <header className="p-3 border-b border-slate-200 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <Blocks className="w-4 h-4 text-indigo-500" />
                Agent skills
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {skills.length} skill{skills.length > 1 ? 's' : ''} installed
                {skills.length > 0 && ` · ${skills.filter(s => s.is_active).length} active`}
              </p>
            </div>
            {isAdmin && (
              <>
                <input ref={skillInputRef} type="file" className="hidden" onChange={handleSkillUpload} accept=".md" />
                <button
                  type="button"
                  onClick={() => skillInputRef.current?.click()}
                  disabled={uploadingSkill}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                >
                  {uploadingSkill
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Upload className="w-3.5 h-3.5" />}
                  Upload SKILL.md
                </button>
              </>
            )}
          </header>

          <div className="flex-1 overflow-auto">
            {skills.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm text-slate-500">No skills installed for this agent.</p>
                {isAdmin && (
                  <p className="text-xs text-slate-400 mt-1">
                    Upload a SKILL.md file to register one under the server skill root.
                  </p>
                )}
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0 z-10">
                  <tr className="text-left text-[11px] text-slate-500 uppercase tracking-wider">
                    <th className="px-3 py-2 font-semibold">Name</th>
                    <th className="px-3 py-2 font-semibold">Description</th>
                    <th className="px-3 py-2 font-semibold">Type</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    {isAdmin && <th className="px-3 py-2 font-semibold text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {skills.map((skill) => (
                    <tr key={skill.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-800">{skill.name}</td>
                      <td className="px-3 py-2 text-slate-600 max-w-md truncate" title={skill.description || ''}>
                        {skill.description || '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded bg-slate-100 text-slate-700 border border-slate-200">
                          {skill.skill_type}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={
                          'inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded ' +
                          (skill.is_active
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-200 text-slate-600')
                        }>
                          {skill.is_active ? 'actif' : 'pause'}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-3 py-2 text-right">
                          <Switch checked={skill.is_active} onCheckedChange={() => toggleSkill(skill)} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </TabsContent>

      {/* Documents Tab */}
      <TabsContent value="documents" className="mt-4">
        {isAdmin && (
          <div className="mb-4">
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileUpload} accept=".pdf,.docx,.pptx,.xlsx,.txt,.md,.csv" />
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
              Upload Documents
            </Button>
            <p className="text-xs text-muted-foreground mt-1">Supports PDF, DOCX, PPTX, XLSX, TXT, MD, CSV</p>
          </div>
        )}
        {docs.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">No documents uploaded for this agent.</p>
        ) : (
          <div className="rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filename</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Created</TableHead>
                  {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((d: any) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.filename}</TableCell>
                    <TableCell className="text-muted-foreground">{d.mime_type}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(d.created_at).toLocaleDateString()}</TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete "{d.filename}"?</AlertDialogTitle>
                              <AlertDialogDescription>This will permanently remove this document from the agent.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteDoc(d)}>Delete</AlertDialogAction>
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
        )}
      </TabsContent>

      {/* Memory Tab */}
      <TabsContent value="memory" className="mt-4">
        <AgentMemoryView agentId={agent.id} />
      </TabsContent>
    </Tabs>
  );
}

function AgentMemoryView({ agentId }: { agentId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase.from('memory_items').select('*').eq('agent_id', agentId).order('created_at', { ascending: false }).limit(100)
      .then(r => setItems((r.data || []) as any));
  }, [agentId]);

  const filtered = items.filter(i =>
    i.content?.toLowerCase().includes(search.toLowerCase()) ||
    JSON.stringify(i.tags)?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Input placeholder="Search memory items..." value={search} onChange={e => setSearch(e.target.value)} className="pl-3" />
      </div>
      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-6">No memory items for this agent.</p>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Content</TableHead>
                <TableHead>Importance</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m: any) => (
                <TableRow key={m.id}>
                  <TableCell className="max-w-xs truncate">{m.content}</TableCell>
                  <TableCell>{m.importance}</TableCell>
                  <TableCell className="text-xs">{Array.isArray(m.tags) ? m.tags.join(', ') : String(m.tags || '')}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
