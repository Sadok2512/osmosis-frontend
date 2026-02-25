import React, { useState } from 'react';
import { Database, CheckCircle, XCircle, Loader2, Play, Table2, Sparkles, Server, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { getApiUrl, getApiHeaders, isLocalMode } from '@/lib/apiConfig';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface DbConfig {
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
  schema: string;
}

interface LLMConfig {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
}

interface TableInfo {
  name: string;
  rowCount: number;
  columns: { name: string; type: string; nullable: boolean }[];
}

type TestStatus = 'idle' | 'loading' | 'success' | 'error';

const TABLE_DEFINITIONS = [
  {
    name: 'topo',
    description: 'Network topology & cell inventory',
    columns: [
      'id BIGSERIAL PRIMARY KEY',
      'code_nidt TEXT NOT NULL',
      'nom_site TEXT NOT NULL',
      'nom_cellule TEXT NOT NULL',
      'latitude DOUBLE PRECISION',
      'longitude DOUBLE PRECISION',
      'azimut INTEGER',
      'hba INTEGER',
      'techno TEXT',
      'bande TEXT',
      'constructeur TEXT',
      'plaque TEXT',
      'region TEXT',
      'tac INTEGER',
      'date_mes DATE',
      'date_fn8 DATE',
      'created_at TIMESTAMPTZ DEFAULT now()',
    ],
  },
  {
    name: 'dashboards',
    description: 'BI dashboard configurations',
    columns: [
      'id TEXT PRIMARY KEY',
      'name TEXT NOT NULL',
      'description TEXT DEFAULT \'\'',
      'widgets JSONB DEFAULT \'[]\'',
      'is_shared BOOLEAN DEFAULT true',
      'created_at TIMESTAMPTZ DEFAULT now()',
      'updated_at TIMESTAMPTZ DEFAULT now()',
    ],
  },
  {
    name: 'rag_documents',
    description: 'RAG knowledge base chunks',
    columns: [
      'id UUID PRIMARY KEY DEFAULT gen_random_uuid()',
      'filename TEXT NOT NULL',
      'content TEXT NOT NULL',
      'chunk_index INTEGER DEFAULT 0',
      'embedding VECTOR(768)',
      'metadata JSONB DEFAULT \'{}\'',
      'created_at TIMESTAMPTZ DEFAULT now()',
    ],
  },
  {
    name: 'qoe_metrics',
    description: 'QoE KPIs par cellule + service + jour',
    columns: [
      'id BIGSERIAL PRIMARY KEY',
      'cell_id TEXT NOT NULL',
      'site_id TEXT',
      'dt DATE NOT NULL',
      'service TEXT NOT NULL DEFAULT \'ALL\'',
      'techno TEXT',
      'bande TEXT',
      'qoe_score_avg DOUBLE PRECISION',
      'p50_thr_dn_mbps DOUBLE PRECISION',
      'p50_thr_up_mbps DOUBLE PRECISION',
      'p95_rtt_ms DOUBLE PRECISION',
      'dms_dl_3 DOUBLE PRECISION',
      'dms_dl_8 DOUBLE PRECISION',
      'dms_dl_30 DOUBLE PRECISION',
      'dms_ul_3 DOUBLE PRECISION',
      'loss_dn_sum DOUBLE PRECISION',
      'traffic_dn_bytes DOUBLE PRECISION',
      'traffic_up_bytes DOUBLE PRECISION',
      'sessions INTEGER',
      'window_full_ratio DOUBLE PRECISION',
      'retransmission_rate DOUBLE PRECISION',
      'tcp_loss_rate DOUBLE PRECISION',
      'out_of_order_rate DOUBLE PRECISION',
      'created_at TIMESTAMPTZ DEFAULT now()',
      'UNIQUE(cell_id, dt, service)',
    ],
  },
];

const BackendAdmin: React.FC = () => {
  const [dbConfig, setDbConfig] = useState<DbConfig>({
    host: 'localhost',
    port: '5432',
    database: 'postgres',
    user: 'postgres',
    password: '',
    schema: 'public',
  });

  const [llmConfig, setLlmConfig] = useState<LLMConfig>(() => {
    const saved = localStorage.getItem('qoebit_llm_config');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    return {
      provider: 'lovable',
      apiKey: '',
      model: 'google/gemini-3-flash-preview',
      baseUrl: 'https://ai.gateway.lovable.dev/v1',
    };
  });

  // Persist LLM config to localStorage whenever it changes
  React.useEffect(() => {
    localStorage.setItem('qoebit_llm_config', JSON.stringify(llmConfig));
  }, [llmConfig]);

  const [dbTestStatus, setDbTestStatus] = useState<TestStatus>('idle');
  const [dbTestMsg, setDbTestMsg] = useState('');
  const [llmTestStatus, setLlmTestStatus] = useState<TestStatus>('idle');
  const [llmTestMsg, setLlmTestMsg] = useState('');
  const [createStatus, setCreateStatus] = useState<TestStatus>('idle');
  const [createMsg, setCreateMsg] = useState('');
  const [tableInfos, setTableInfos] = useState<TableInfo[]>([]);
  const [queryStatus, setQueryStatus] = useState<TestStatus>('idle');
  const [showPassword, setShowPassword] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const buildConnString = () =>
    `postgresql://${dbConfig.user}:${dbConfig.password}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`;

  // ─── Test DB Connection ───
  const testDbConnection = async () => {
    setDbTestStatus('loading');
    setDbTestMsg('');
    try {
      // We test by hitting a lightweight query via edge function
      const res = await fetch(getApiUrl('backend-admin'), {
          method: 'POST',
          headers: getApiHeaders(),
          body: JSON.stringify({ action: 'test_connection', config: dbConfig }),
        });
      const data = await res.json();
      if (data.success) {
        setDbTestStatus('success');
        setDbTestMsg(`Connecté — PostgreSQL v${data.version || '?'}`);
        toast.success('Connexion PostgreSQL réussie');
      } else {
        setDbTestStatus('error');
        setDbTestMsg(data.error || 'Échec de connexion');
        toast.error('Échec de connexion');
      }
    } catch (e: any) {
      setDbTestStatus('error');
      setDbTestMsg(e.message);
      toast.error(e.message);
    }
  };

  // ─── Create Tables ───
  const createTables = async () => {
    setCreateStatus('loading');
    setCreateMsg('');
    try {
      const res = await fetch(getApiUrl('backend-admin'), {
          method: 'POST',
          headers: getApiHeaders(),
          body: JSON.stringify({ action: 'create_tables', config: dbConfig }),
        });
      const data = await res.json();
      if (data.success) {
        setCreateStatus('success');
        setCreateMsg(`${data.tables_created || 3} tables créées avec succès`);
        toast.success('Tables créées avec succès');
      } else {
        setCreateStatus('error');
        setCreateMsg(data.error || 'Erreur lors de la création');
        toast.error(data.error);
      }
    } catch (e: any) {
      setCreateStatus('error');
      setCreateMsg(e.message);
    }
  };

  // ─── Query Table Status ───
  const queryTableStatus = async () => {
    setQueryStatus('loading');
    setTableInfos([]);
    try {
      const res = await fetch(getApiUrl('backend-admin'), {
          method: 'POST',
          headers: getApiHeaders(),
          body: JSON.stringify({ action: 'query_tables', config: dbConfig }),
        });
      const data = await res.json();
      if (data.success) {
        setQueryStatus('success');
        setTableInfos(data.tables || []);
        toast.success('État des tables récupéré');
      } else {
        setQueryStatus('error');
        toast.error(data.error);
      }
    } catch (e: any) {
      setQueryStatus('error');
      toast.error(e.message);
    }
  };

  // ─── Test LLM ───
  const testLLM = async () => {
    setLlmTestStatus('loading');
    setLlmTestMsg('');
    try {
      const res = await fetch(`${llmConfig.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${llmConfig.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
          'X-Title': 'QOEBIT Admin Test',
        },
        body: JSON.stringify({
          model: llmConfig.model,
          messages: [{ role: 'user', content: 'Réponds uniquement "OK" si tu fonctionnes.' }],
          max_tokens: 10,
        }),
      });
      const data = await res.json();
      if (data.choices?.[0]?.message?.content) {
        setLlmTestStatus('success');
        setLlmTestMsg(`Modèle: ${llmConfig.model} — Réponse: "${data.choices[0].message.content.trim()}"`);
        toast.success('LLM fonctionne correctement');
      } else {
        setLlmTestStatus('error');
        setLlmTestMsg(data.error?.message || JSON.stringify(data.error || data));
        toast.error('Erreur LLM');
      }
    } catch (e: any) {
      setLlmTestStatus('error');
      setLlmTestMsg(e.message);
      toast.error(e.message);
    }
  };

  const StatusBadge = ({ status, msg }: { status: TestStatus; msg: string }) => {
    if (status === 'idle') return null;
    if (status === 'loading') return <Badge variant="outline" className="gap-1"><Loader2 className="w-3 h-3 animate-spin" />Test en cours...</Badge>;
    if (status === 'success') return <Badge className="gap-1 bg-primary/20 text-primary border-primary/30"><CheckCircle className="w-3 h-3" />{msg}</Badge>;
    return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />{msg}</Badge>;
  };

  return (
    <div className="h-full overflow-auto bg-background p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Server className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Backend Administration</h1>
          <p className="text-xs text-muted-foreground">Configuration PostgreSQL, tables et LLM pour déploiement autonome</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ─── PostgreSQL Config ─── */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" />
              Connexion PostgreSQL
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Host</Label>
                <Input value={dbConfig.host} onChange={e => setDbConfig(p => ({ ...p, host: e.target.value }))} placeholder="localhost" className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs">Port</Label>
                <Input value={dbConfig.port} onChange={e => setDbConfig(p => ({ ...p, port: e.target.value }))} placeholder="5432" className="h-8 text-xs" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Database</Label>
              <Input value={dbConfig.database} onChange={e => setDbConfig(p => ({ ...p, database: e.target.value }))} placeholder="postgres" className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">User</Label>
              <Input value={dbConfig.user} onChange={e => setDbConfig(p => ({ ...p, user: e.target.value }))} placeholder="postgres" className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Password</Label>
              <div className="relative">
                <Input type={showPassword ? 'text' : 'password'} value={dbConfig.password} onChange={e => setDbConfig(p => ({ ...p, password: e.target.value }))} className="h-8 text-xs pr-8" />
                <button onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs">Schema</Label>
              <Input value={dbConfig.schema} onChange={e => setDbConfig(p => ({ ...p, schema: e.target.value }))} placeholder="public" className="h-8 text-xs" />
            </div>

            <div className="pt-2 space-y-2">
              <StatusBadge status={dbTestStatus} msg={dbTestMsg} />
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" onClick={testDbConnection} disabled={dbTestStatus === 'loading'} className="gap-1.5 text-xs">
                  {dbTestStatus === 'loading' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                  Tester Connexion
                </Button>
                <Button size="sm" variant="outline" onClick={createTables} disabled={createStatus === 'loading'} className="gap-1.5 text-xs">
                  {createStatus === 'loading' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Table2 className="w-3 h-3" />}
                  Créer Tables
                </Button>
                <Button size="sm" variant="outline" onClick={queryTableStatus} disabled={queryStatus === 'loading'} className="gap-1.5 text-xs">
                  {queryStatus === 'loading' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  État Tables
                </Button>
              </div>
              <StatusBadge status={createStatus} msg={createMsg} />
            </div>
          </CardContent>
        </Card>

        {/* ─── LLM Config ─── */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Configuration LLM
              <Badge variant="outline" className="text-[10px] ml-auto">
                {llmConfig.apiKey ? 'OpenRouter' : 'Lovable AI'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md bg-muted/50 border border-border p-2 text-[10px] text-muted-foreground">
              💡 Par défaut, l'assistant utilise <strong>Lovable AI</strong> (clé auto-configurée). Pour utiliser <strong>OpenRouter</strong>, renseignez une API Key ci-dessous.
            </div>
            <div>
              <Label className="text-xs">Base URL</Label>
              <Input value={llmConfig.baseUrl} onChange={e => setLlmConfig(p => ({ ...p, baseUrl: e.target.value }))} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">API Key (optionnelle — OpenRouter)</Label>
              <div className="relative">
                <Input type={showApiKey ? 'text' : 'password'} value={llmConfig.apiKey} onChange={e => setLlmConfig(p => ({ ...p, apiKey: e.target.value }))} placeholder="Laisser vide pour Lovable AI" className="h-8 text-xs pr-8" />
                <button onClick={() => setShowApiKey(!showApiKey)} className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground">
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs">Model</Label>
              <select
                value={llmConfig.model}
                onChange={e => setLlmConfig(p => ({ ...p, model: e.target.value }))}
                className="w-full h-8 text-xs rounded-md border border-border bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <optgroup label="Google Gemini">
                  <option value="google/gemini-2.5-pro-preview">Gemini 2.5 Pro Preview</option>
                  <option value="google/gemini-2.5-flash-preview">Gemini 2.5 Flash Preview</option>
                  <option value="google/gemini-2.5-flash-preview:thinking">Gemini 2.5 Flash Thinking</option>
                </optgroup>
                <optgroup label="Anthropic Claude">
                  <option value="anthropic/claude-sonnet-4">Claude Sonnet 4</option>
                  <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                  <option value="anthropic/claude-3.5-haiku">Claude 3.5 Haiku</option>
                </optgroup>
                <optgroup label="OpenAI">
                  <option value="openai/gpt-5.3-codex">GPT-5.3 Codex</option>
                  <option value="openai/gpt-4o">GPT-4o</option>
                  <option value="openai/gpt-4o-mini">GPT-4o Mini</option>
                  <option value="openai/o3-mini">O3 Mini</option>
                </optgroup>
                <optgroup label="Meta Llama">
                  <option value="meta-llama/llama-4-maverick">Llama 4 Maverick</option>
                  <option value="meta-llama/llama-3.3-70b-instruct">Llama 3.3 70B</option>
                </optgroup>
                <optgroup label="DeepSeek">
                  <option value="deepseek/deepseek-r1">DeepSeek R1</option>
                  <option value="deepseek/deepseek-chat-v3-0324">DeepSeek V3</option>
                </optgroup>
                <optgroup label="Qwen">
                  <option value="qwen/qwen-2.5-72b-instruct">Qwen 2.5 72B</option>
                  <option value="qwen/qwq-32b">QwQ 32B</option>
                </optgroup>
                <optgroup label="Mistral">
                  <option value="mistralai/mistral-large-2411">Mistral Large</option>
                  <option value="mistralai/codestral-2501">Codestral</option>
                </optgroup>
              </select>
            </div>

            <div className="pt-2 space-y-2">
              <StatusBadge status={llmTestStatus} msg={llmTestMsg} />
              <Button size="sm" onClick={testLLM} disabled={llmTestStatus === 'loading'} className="gap-1.5 text-xs">
                {llmTestStatus === 'loading' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Tester LLM
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Table Definitions ─── */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Table2 className="w-4 h-4 text-primary" />
            Schéma des Tables (sera créé)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {TABLE_DEFINITIONS.map(t => (
              <div key={t.name} className="rounded-lg border border-border p-3 bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-xs font-mono">{t.name}</Badge>
                  <span className="text-[10px] text-muted-foreground">{t.description}</span>
                </div>
                <div className="space-y-0.5">
                  {t.columns.map((col, i) => {
                    const parts = col.split(' ');
                    return (
                      <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
                        <span className="text-foreground font-semibold">{parts[0]}</span>
                        <span className="text-muted-foreground">{parts.slice(1).join(' ')}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ─── Table Status Results ─── */}
      {tableInfos.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" />
              État Actuel des Tables
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {tableInfos.map(t => (
                <div key={t.name} className="rounded-lg border border-border p-3 bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className="text-xs font-mono">{t.name}</Badge>
                    <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">{t.rowCount} rows</Badge>
                  </div>
                  <div className="space-y-0.5">
                    {t.columns.map((col, i) => (
                      <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
                        <span className="text-foreground font-semibold">{col.name}</span>
                        <span className="text-muted-foreground">{col.type}</span>
                        {col.nullable && <span className="text-destructive/70">nullable</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BackendAdmin;
