import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Database, CheckCircle, XCircle, Loader2, Play, Table2, Sparkles, Server, Eye, EyeOff, RefreshCw, Upload, FileSpreadsheet, PlugZap, Activity, Clock } from 'lucide-react';
import { getApiUrl, getApiHeaders, isLocalMode } from '@/lib/apiConfig';
// Local-only mode: no supabase import needed
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import OdccAdminPanel from '@/components/odcc/OdccAdminPanel';

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

const MODULE_TABLE_MAP = [
  {
    module: 'Sites Monitor',
    icon: '🗺️',
    tables: ['topo'],
    description: 'Cartographie réseau, sites & cellules',
    apiEndpoints: ['/api/topo/sites', '/api/topo'],
  },
  {
    module: 'Analytic QOE',
    icon: '📊',
    tables: ['qoe_metric', 'dashboards'],
    description: 'Dashboards BI, KPIs QoE (table qoe_metric)',
    apiEndpoints: ['/api/bi-query', '/api/bi-distinct', '/api/dashboards'],
  },
  {
    module: 'KPI Monitor',
    icon: '📈',
    tables: ['qoe_metric', 'kpi_catalog'],
    description: 'Supervision temps réel des KPIs réseau',
    apiEndpoints: ['/api/bi-query', '/api/bi-date-range'],
  },
  {
    module: 'Radio Profile',
    icon: '📡',
    tables: ['topo'],
    description: 'Profil terrain, propagation, LOS/Fresnel',
    apiEndpoints: ['/api/topo'],
  },
  {
    module: 'Parameters',
    icon: '⚙️',
    tables: ['parameter_dump'],
    description: 'Dump CM, paramètres réseau',
    apiEndpoints: ['/api/dump-parameter'],
  },
  {
    module: 'OSMOSIS Assistant',
    icon: '🤖',
    tables: ['rag_documents', 'qoe_metric'],
    description: 'Assistant IA RAG + contexte QoE',
    apiEndpoints: ['/api/qoe-assistant', '/api/rag-embed'],
  },
  {
    module: 'Map Views',
    icon: '🌍',
    tables: ['map_views'],
    description: 'Vues cartographiques sauvegardées',
    apiEndpoints: ['/api/map-views'],
  },
  {
    module: 'ODCC',
    icon: '🎯',
    tables: ['ml_detector_config', 'ml_anomalies', 'ml_detector_runs'],
    description: 'Detectors créés par les opérateurs + anomalies détectées',
    apiEndpoints: ['/ml-api/detectors', '/ml-api/anomalies'],
  },
];

interface ConnectionLog {
  timestamp: string;
  module: string;
  table: string;
  status: 'ok' | 'error';
  latency: number;
  message: string;
}

const BackendAdmin: React.FC = () => {
  const [dbConfig, setDbConfig] = useState<DbConfig>({
    host: 'localhost',
    port: '5432',
    database: 'RAN_OP',
    user: 'postgres',
    password: '',
    schema: 'public',
  });

  const [llmConfig, setLlmConfig] = useState<LLMConfig>(() => {
    const saved = localStorage.getItem('osmosis_llm_config');
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
    localStorage.setItem('osmosis_llm_config', JSON.stringify(llmConfig));
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
  const [dumpImporting, setDumpImporting] = useState(false);
  const [dumpStatus, setDumpStatus] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);
  const dumpFileRef = useRef<HTMLInputElement>(null);
  const [connectionLogs, setConnectionLogs] = useState<ConnectionLog[]>([]);
  const [liveTableInfos, setLiveTableInfos] = useState<Record<string, { rows: number; cols: number; status: 'ok' | 'error' | 'loading' }>>({});

  // ─── Check all module tables on mount ───
  const checkModuleTables = useCallback(async () => {
    const allTables = [...new Set(MODULE_TABLE_MAP.flatMap(m => m.tables))];
    const newInfos: typeof liveTableInfos = {};
    const newLogs: ConnectionLog[] = [];

    for (const table of allTables) {
      newInfos[table] = { rows: 0, cols: 0, status: 'loading' };
    }
    setLiveTableInfos({ ...newInfos });

    await Promise.all(allTables.map(async (table) => {
      const start = performance.now();
      try {
        const res = await fetch(`${import.meta.env.VITE_LOCAL_API || 'http://localhost:3001'}/api/table-info/${table}`);
        const latency = Math.round(performance.now() - start);
        if (res.ok) {
          const data = await res.json();
          newInfos[table] = { rows: data.rowCount ?? 0, cols: data.columnCount ?? 0, status: 'ok' };
          newLogs.push({ timestamp: new Date().toLocaleTimeString(), module: '', table, status: 'ok', latency, message: `${data.rowCount ?? 0} rows, ${data.columnCount ?? 0} cols` });
        } else {
          newInfos[table] = { rows: 0, cols: 0, status: 'error' };
          newLogs.push({ timestamp: new Date().toLocaleTimeString(), module: '', table, status: 'error', latency, message: `HTTP ${res.status}` });
        }
      } catch (err: any) {
        const latency = Math.round(performance.now() - start);
        newInfos[table] = { rows: 0, cols: 0, status: 'error' };
        newLogs.push({ timestamp: new Date().toLocaleTimeString(), module: '', table, status: 'error', latency, message: err.message });
      }
    }));

    setLiveTableInfos({ ...newInfos });
    setConnectionLogs(prev => [...newLogs, ...prev].slice(0, 50));
  }, []);

  useEffect(() => { checkModuleTables(); }, [checkModuleTables]);

  // ─── Import dump_parameter CSV/XLSX ───
  const handleDumpImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDumpImporting(true);
    setDumpStatus({ message: `Lecture de ${file.name}...`, type: 'info' });

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const jsonRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (jsonRows.length === 0) {
        setDumpStatus({ message: 'Fichier vide ou format non reconnu', type: 'error' });
        setDumpImporting(false);
        return;
      }

      // Normalize column names (lowercase, trim)
      const normalized = jsonRows.map(row => {
        const out: any = {};
        for (const [key, val] of Object.entries(row)) {
          out[key.trim().toLowerCase()] = val;
        }
        return out;
      });

      setDumpStatus({ message: `Envoi de ${normalized.length} lignes...`, type: 'info' });

      const clearBefore = (document.getElementById('dump-clear') as HTMLInputElement)?.checked || false;

      // Send in chunks of 2000 to avoid payload limits
      const CHUNK = 2000;
      let totalInserted = 0;
      for (let i = 0; i < normalized.length; i += CHUNK) {
        const chunk = normalized.slice(i, i + CHUNK);
        const url = getApiUrl('import-dump');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (!isLocalMode()) {
          headers['Authorization'] = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;
        }

        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            rows: chunk,
            clear_before: clearBefore && i === 0,
            config: isLocalMode() ? dbConfig : undefined,
          }),
        });
        const result = await res.json();
        if (!result.success) {
          setDumpStatus({ message: `Erreur: ${result.error}`, type: 'error' });
          setDumpImporting(false);
          return;
        }
        totalInserted += result.inserted || chunk.length;
        setDumpStatus({ message: `${totalInserted}/${normalized.length} lignes importées...`, type: 'info' });
      }

      setDumpStatus({ message: `✅ ${totalInserted} paramètres importés depuis ${file.name}`, type: 'success' });
      toast.success(`${totalInserted} paramètres importés`);
    } catch (err: any) {
      setDumpStatus({ message: `Erreur: ${err.message}`, type: 'error' });
      toast.error(err.message);
    } finally {
      setDumpImporting(false);
      if (dumpFileRef.current) dumpFileRef.current.value = '';
    }
  };

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
        setCreateMsg(`${data.tables_created || 5} tables créées avec succès`);
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
          'X-Title': 'OSMOSIS Admin Test',
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
              <Input value={dbConfig.database} onChange={e => setDbConfig(p => ({ ...p, database: e.target.value }))} placeholder="RAN_OP" className="h-8 text-xs" />
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

      {/* ─── Import dump_parameter CSV ─── */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Upload className="w-4 h-4 text-primary" />
            Import CSV — dump_parameter
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md bg-muted/50 border border-border p-2 text-[10px] text-muted-foreground">
            📂 Importez un fichier CSV/XLSX contenant les paramètres réseau (CM dump).
            Les colonnes attendues : <strong>dn, cell_dn, cell_name, site_name, parameter, value, version, vendor, bande, plaque, omc, dor, dr, ur, city, zone_arcep, enodeb_id, mrbts_id, gnodeb_id, freq_downlink, tgv, latitude, longitude</strong>.
            Le mapping est automatique (insensible à la casse).
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              ref={dumpFileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleDumpImport}
            />
            <Button size="sm" variant="outline" onClick={() => dumpFileRef.current?.click()} disabled={dumpImporting} className="gap-1.5 text-xs">
              {dumpImporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileSpreadsheet className="w-3 h-3" />}
              {dumpImporting ? 'Import en cours...' : 'Choisir fichier CSV/XLSX'}
            </Button>
            <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <input type="checkbox" id="dump-clear" className="rounded" />
              Vider la table avant import
            </label>
          </div>
          {dumpStatus && (
            <Badge variant={dumpStatus.type === 'success' ? 'default' : dumpStatus.type === 'error' ? 'destructive' : 'outline'}
              className={`text-xs ${dumpStatus.type === 'success' ? 'bg-primary/20 text-primary border-primary/30' : ''}`}>
              {dumpStatus.type === 'success' ? <CheckCircle className="w-3 h-3 mr-1" /> :
               dumpStatus.type === 'error' ? <XCircle className="w-3 h-3 mr-1" /> : null}
              {dumpStatus.message}
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* ─── Module → Table Connectivity ─── */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <PlugZap className="w-4 h-4 text-primary" />
            Connectivité Modules → Tables
            <Button size="sm" variant="ghost" onClick={checkModuleTables} className="ml-auto gap-1 text-xs h-6">
              <RefreshCw className="w-3 h-3" /> Refresh
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {MODULE_TABLE_MAP.map(mod => {
              const allOk = mod.tables.every(t => liveTableInfos[t]?.status === 'ok');
              const anyError = mod.tables.some(t => liveTableInfos[t]?.status === 'error');
              const anyLoading = mod.tables.some(t => liveTableInfos[t]?.status === 'loading');
              return (
                <div key={mod.module} className={`rounded-lg border p-3 ${allOk ? 'border-primary/30 bg-primary/5' : anyError ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-muted/30'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base">{mod.icon}</span>
                    <span className="text-xs font-semibold text-foreground">{mod.module}</span>
                    <span className="ml-auto">
                      {anyLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" /> :
                       allOk ? <CheckCircle className="w-3.5 h-3.5 text-primary" /> :
                       <XCircle className="w-3.5 h-3.5 text-destructive" />}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-2">{mod.description}</p>
                  <div className="space-y-1">
                    {mod.tables.map(table => {
                      const info = liveTableInfos[table];
                      return (
                        <div key={table} className="flex items-center justify-between text-[10px] font-mono bg-background/50 rounded px-2 py-1 border border-border/50">
                          <div className="flex items-center gap-1.5">
                            <Table2 className="w-3 h-3 text-muted-foreground" />
                            <span className="text-foreground font-semibold">{table}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {info?.status === 'loading' ? (
                              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                            ) : info?.status === 'ok' ? (
                              <>
                                <Badge variant="outline" className="text-[9px] h-4 px-1">{info.rows.toLocaleString()} rows</Badge>
                                <Badge variant="outline" className="text-[9px] h-4 px-1">{info.cols} cols</Badge>
                                <CheckCircle className="w-3 h-3 text-primary" />
                              </>
                            ) : (
                              <>
                                <Badge variant="destructive" className="text-[9px] h-4 px-1">N/A</Badge>
                                <XCircle className="w-3 h-3 text-destructive" />
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {mod.apiEndpoints.map(ep => (
                      <Badge key={ep} variant="outline" className="text-[8px] h-4 px-1 font-mono text-muted-foreground">{ep}</Badge>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ─── Connection Logs ─── */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Logs de Connexion
            <Badge variant="outline" className="text-[10px] ml-auto">{connectionLogs.length} entrées</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {connectionLogs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Aucun log — cliquez Refresh ci-dessus</p>
          ) : (
            <div className="max-h-48 overflow-auto rounded border border-border bg-muted/20">
              <table className="w-full text-[10px] font-mono">
                <thead className="sticky top-0 bg-muted border-b border-border">
                  <tr>
                    <th className="text-left px-2 py-1 text-muted-foreground">Heure</th>
                    <th className="text-left px-2 py-1 text-muted-foreground">Table</th>
                    <th className="text-left px-2 py-1 text-muted-foreground">Status</th>
                    <th className="text-right px-2 py-1 text-muted-foreground">Latence</th>
                    <th className="text-left px-2 py-1 text-muted-foreground">Détail</th>
                  </tr>
                </thead>
                <tbody>
                  {connectionLogs.map((log, i) => (
                    <tr key={i} className={`border-b border-border/30 ${log.status === 'error' ? 'bg-destructive/5' : ''}`}>
                      <td className="px-2 py-1 text-muted-foreground"><Clock className="w-3 h-3 inline mr-1" />{log.timestamp}</td>
                      <td className="px-2 py-1 text-foreground font-semibold">{log.table}</td>
                      <td className="px-2 py-1">
                        {log.status === 'ok' ? <CheckCircle className="w-3 h-3 text-primary inline" /> : <XCircle className="w-3 h-3 text-destructive inline" />}
                      </td>
                      <td className="px-2 py-1 text-right text-muted-foreground">{log.latency}ms</td>
                      <td className="px-2 py-1 text-muted-foreground">{log.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── ODCC — Operator Detection Control Console ─── */}
      <OdccAdminPanel />

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
