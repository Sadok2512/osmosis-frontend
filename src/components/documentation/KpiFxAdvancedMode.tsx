/**
 * KpiFxAdvancedMode — Expert FX KPI authoring workspace.
 *
 * UX principle: the user starts from an operational intent ("what do you
 * want to calculate?"), not from JSON syntax. The FX JSON remains the
 * source of truth and is always editable; assisted authoring (NL → FX,
 * pattern library, insert-key chips) only mutates the JSON.
 *
 * Layout (grid 1fr / 360px):
 *   LEFT  — Intent textarea + actions, then JSON editor + toolbar + bottom actions.
 *   RIGHT — Tabbed assistant: Patterns · Keys · Explain · Validate · Test.
 *
 * All async network IO is debounced or button-gated. State lives locally
 * to keep the parent wizard cheap (cf. perf note in the previous version).
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check, ClipboardCopy, Code2, Copy, FlaskConical, Lightbulb, Loader2,
  Maximize2, Minimize2, Play, Puzzle, ScrollText, ShieldCheck, Sparkles, Wand2, X,
} from 'lucide-react';
import { getApiHeaders, getVpsUrl } from '@/lib/apiConfig';

// ─────────────────────────────────────────────────────────────────────
// FX vocabulary — kept in sync with backend kpi-engine schemas.
// ─────────────────────────────────────────────────────────────────────

const ALLOWED_KEYS = [
  'fx', 'timeshift', 'dateTime', 'granularity', 'includeDays', 'includeHours',
  'statistics', 'statisticsKpi', 'period', 'samePeriod', 'sourceNeType', 'aggregation',
] as const;

const GRANULARITY_VALUES = ['default', 'one_min', 'five_min', 'quarter', 'half', 'hour', 'day', 'week', 'month'];
const STAT_VALUES = ['SUM', 'MAX', 'MIN', 'AVG', 'MEDIAN', 'STDDEVPOP'];
const SAME_PERIOD_VALUES = ['contiguous', 'contiguousWD', 'day', 'dayWD', 'week', 'weekWD', 'month'];

interface PatternDef {
  id: string; label: string; intent: string; fx: Record<string, any>;
}

const FX_PATTERNS: PatternDef[] = [
  { id: 'busy_hour', label: 'Busy Hour',
    intent: 'Pick the busiest hour by traffic and return the target KPI value at that hour.',
    fx: { fx: '[Drop Rate 4G]', statistics: 'MAX', statisticsKpi: '[Traffic DL 4G]', granularity: 'hour', includeHours: '6-22' } },
  { id: 'night', label: 'Night KPI',
    intent: 'Average target KPI between 0h and 6h.',
    fx: { fx: '[Drop Rate 4G]', statistics: 'AVG', granularity: 'hour', includeHours: '0-6' } },
  { id: 'outlier_count', label: 'Outlier Count',
    intent: 'Count distinct cells where KPI breaches a threshold.',
    fx: { fx: 'IF([Drop Rate 4G] > 2, 1, 0)', statistics: 'MAX', granularity: 'hour', includeHours: '2-4', includeDays: '1-5', sourceNeType: 'cell4G', aggregation: 'SUM' } },
  { id: 'occurrences', label: 'Hour-Cell Occurrences',
    intent: 'Count every hour-cell occurrence where KPI breaches a threshold.',
    fx: { fx: 'IF([Drop Rate 4G] > 2, 1, 0)', statistics: 'SUM', granularity: 'hour', includeHours: '2-4', includeDays: '1-5', sourceNeType: 'cell4G', aggregation: 'SUM' } },
  { id: 'rolling_median', label: 'Rolling Median',
    intent: '5-period rolling median on working days.',
    fx: { fx: '[eRAB Setup Failures Rate]', statistics: 'MEDIAN', samePeriod: 'weekWD', granularity: 'default', period: 5 } },
  { id: 'wow', label: 'Week-over-Week',
    intent: 'Compare current value vs same period last week.',
    fx: { fx: '[CSSR]', statistics: 'AVG', samePeriod: 'week', timeshift: 1, granularity: 'day' } },
  { id: 'spatial_rollup', label: 'Spatial Rollup',
    intent: 'Sum a cell-level KPI up to eNodeB level.',
    fx: { fx: '[Traffic DL 4G]', sourceNeType: 'cell4G', aggregation: 'SUM' } },
  { id: 'spatial_expand', label: 'Spatial Expand',
    intent: 'Spread an eNodeB-level KPI across its cells.',
    fx: { fx: '[Traffic DL 4G - eNodeB]', sourceNeType: 'enodeb', aggregation: 'SUM' } },
  { id: 'working_baseline', label: 'Working Day Baseline',
    intent: 'Average on working days only as reference baseline.',
    fx: { fx: '[CSSR]', statistics: 'AVG', samePeriod: 'dayWD', granularity: 'day' } },
  { id: 'top_worst', label: 'Top Worst Cells',
    intent: 'Rank cells by KPI worst values for outlier hunting.',
    fx: { fx: '[Drop Rate 4G]', statistics: 'MAX', sourceNeType: 'cell4G', aggregation: 'MAX' } },
  { id: 'anomaly', label: 'Anomaly Counter',
    intent: 'Count anomalies above 3σ over rolling window.',
    fx: { fx: 'IF([Drop Rate 4G] > 3, 1, 0)', statistics: 'SUM', granularity: 'hour', includeHours: '0-23' } },
];

interface InsertKeyDef { key: string; sample: any; hint: string; allowed?: string[]; }
const INSERT_KEYS: InsertKeyDef[] = [
  { key: 'granularity',   sample: 'hour',                 hint: 'Time bucket size', allowed: GRANULARITY_VALUES },
  { key: 'statistics',    sample: 'AVG',                  hint: 'Temporal aggregation function', allowed: STAT_VALUES },
  { key: 'statisticsKpi', sample: '[Traffic DL 4G]',      hint: 'Ref KPI for Busy Hour — requires statistics MAX or MIN' },
  { key: 'includeHours',  sample: '0-6',                  hint: 'Hour range H-H (0-23)' },
  { key: 'includeDays',   sample: '1-5',                  hint: 'Day range or list, 1=Mon … 7=Sun' },
  { key: 'timeshift',     sample: 1,                      hint: 'Positive int — offset N periods backwards' },
  { key: 'dateTime',      sample: '2026-05-18T00:00:00Z', hint: 'ISO 8601 anchor timestamp' },
  { key: 'period',        sample: 5,                      hint: 'Rolling window — number of previous periods' },
  { key: 'samePeriod',    sample: 'weekWD',               hint: 'Reference period selector', allowed: SAME_PERIOD_VALUES },
  { key: 'sourceNeType',  sample: 'cell4G',               hint: 'Source topology level' },
  { key: 'aggregation',   sample: 'SUM',                  hint: 'Spatial aggregation function', allowed: STAT_VALUES },
];

// ─────────────────────────────────────────────────────────────────────
// NL → FX heuristic generator (best-effort, fully local).
// Detects common operational patterns to bootstrap the JSON; the user
// stays in control via the editor.
// ─────────────────────────────────────────────────────────────────────

function generateFxFromIntent(text: string): Record<string, any> {
  const s = text.toLowerCase();
  const fx: Record<string, any> = {};

  // Bracketed KPI ref or guessed KPI
  const kpiRef = text.match(/\[[^\]]+\]/)?.[0]
    ?? (/(drop\s*rate|cssr|erab|throughput|prb|rsrp|rsrq|sinr|traffic|volte|handover|ho\b)/i.exec(text)?.[0]);
  const kpiToken = kpiRef ? (kpiRef.startsWith('[') ? kpiRef : `[${kpiRef.trim()}]`) : '[KPI]';

  // Threshold detection
  const thr = s.match(/(>=|<=|>|<|=)\s*([\d.]+)\s*(%|ms|mbps|kbps)?/);
  const techno = /5g|nr\b/.test(s) ? 'NR' : /4g|lte/.test(s) ? 'LTE' : null;

  if (thr) {
    fx.fx = `IF(${kpiToken} ${thr[1]} ${thr[2]}, 1, 0)`;
  } else {
    fx.fx = kpiToken;
  }

  // Hour window — "between 2h and 4h" / "2-4"
  const hours = s.match(/(?:between\s*)?(\d{1,2})\s*(?:h|:00)?\s*(?:and|et|-|à|to)\s*(\d{1,2})\s*(?:h|:00)?/);
  if (hours) {
    fx.granularity = 'hour';
    fx.includeHours = `${parseInt(hours[1], 10)}-${parseInt(hours[2], 10)}`;
  } else if (/night|nuit/.test(s)) {
    fx.granularity = 'hour'; fx.includeHours = '0-6';
  } else if (/busy\s*hour|heure\s*chargée/.test(s)) {
    fx.granularity = 'hour'; fx.includeHours = '6-22';
    fx.statistics = 'MAX'; fx.statisticsKpi = '[Traffic DL 4G]';
  }

  // Days
  if (/exclud\w*\s+(weekend|wknd|samedi|dimanche)|working\s*day|jour\s*ouvr|weekday/.test(s)) {
    fx.includeDays = '1-5';
  }

  // Rolling
  const rolling = s.match(/(\d+)\s*[- ]?(day|jour|period|periode)\s*(rolling|glissant|median)/);
  if (rolling) {
    fx.period = parseInt(rolling[1], 10);
    fx.statistics = 'MEDIAN';
    fx.samePeriod = 'weekWD';
  }

  // Same day last week
  if (/(same\s+day\s+last\s+week|semaine\s+dernière|week[- ]?over[- ]?week|wow)/.test(s)) {
    fx.samePeriod = 'week'; fx.timeshift = 1;
  }

  // Distinct cells → spatial aggregation
  if (/(number of|count|nombre de)\s+(\w+\s+)*cells?/i.test(text) || /distinct/.test(s)) {
    fx.sourceNeType = techno === 'NR' ? 'cell5G' : 'cell4G';
    fx.aggregation = 'SUM';
    if (!fx.statistics) fx.statistics = 'MAX';
  }

  // Aggregation explicit
  if (/\bavg|average|moyen/.test(s) && !fx.statistics) fx.statistics = 'AVG';
  if (/\bmax|maximum/.test(s) && !fx.statistics) fx.statistics = 'MAX';
  if (/\bmin|minimum/.test(s) && !fx.statistics) fx.statistics = 'MIN';
  if (/\bsum|somme|total/.test(s) && !fx.statistics) fx.statistics = 'SUM';

  return fx;
}

// ─────────────────────────────────────────────────────────────────────
// FX → human-readable explanation.
// ─────────────────────────────────────────────────────────────────────

function explainFx(obj: Record<string, any>): {
  sentence: string;
  features: string[];
} {
  if (!obj || typeof obj !== 'object') return { sentence: '—', features: [] };
  const parts: string[] = [];
  const features: string[] = [];

  const isCounter = typeof obj.fx === 'string' && /IF\s*\(/i.test(obj.fx);
  if (isCounter) {
    parts.push('Counts events matching the condition');
  } else {
    parts.push(`Computes ${obj.fx ?? '[KPI]'}`);
  }

  if (obj.sourceNeType) {
    parts.push(`at ${obj.sourceNeType} level`);
    features.push('spatial scope: ' + obj.sourceNeType);
  }
  if (obj.granularity && obj.granularity !== 'default') {
    parts.push(`on a ${obj.granularity} bucket`);
  }
  if (obj.includeHours) {
    parts.push(`during hours ${obj.includeHours}`);
    features.push('hour window');
  }
  if (obj.includeDays) {
    parts.push(`on days ${obj.includeDays}${/1-5/.test(String(obj.includeDays)) ? ' (working days)' : ''}`);
    features.push('day filter');
  }
  if (obj.statistics) {
    parts.push(`aggregated temporally with ${obj.statistics}`);
  }
  if (obj.statisticsKpi) {
    parts.push(`using ${obj.statisticsKpi} as the Busy-Hour selector`);
    features.push('Busy Hour selector');
  }
  if (obj.samePeriod) {
    parts.push(`compared on samePeriod=${obj.samePeriod}`);
    features.push('reference period: ' + obj.samePeriod);
  }
  if (typeof obj.timeshift === 'number' && obj.timeshift !== 0) {
    parts.push(`shifted by ${obj.timeshift} period(s)`);
    features.push('timeshift');
  }
  if (typeof obj.period === 'number') {
    parts.push(`over a ${obj.period}-period rolling window`);
    features.push(`rolling window (${obj.period})`);
  }
  if (obj.aggregation) {
    parts.push(`then aggregated spatially with ${obj.aggregation}`);
    features.push('spatial agg: ' + obj.aggregation);
  }

  return { sentence: parts.join(', ') + '.', features };
}

// ─────────────────────────────────────────────────────────────────────
// Client-side validation rules (mirrors backend constraints).
// ─────────────────────────────────────────────────────────────────────

interface ValidIssue { level: 'ok' | 'warn' | 'err'; msg: string; }

function validateFx(obj: any): ValidIssue[] {
  const out: ValidIssue[] = [];
  if (!obj || typeof obj !== 'object') {
    out.push({ level: 'err', msg: 'formula_fx must be a JSON object' });
    return out;
  }
  if (!obj.fx || typeof obj.fx !== 'string' || !obj.fx.trim()) {
    out.push({ level: 'err', msg: 'fx key is required and must be a non-empty string' });
  } else {
    out.push({ level: 'ok', msg: 'fx present' });
  }
  for (const k of Object.keys(obj)) {
    if (!(ALLOWED_KEYS as readonly string[]).includes(k)) {
      out.push({ level: 'err', msg: `unknown key "${k}" — not in allowed FX vocabulary` });
    }
  }
  if (obj.granularity && !GRANULARITY_VALUES.includes(obj.granularity)) {
    out.push({ level: 'err', msg: `granularity "${obj.granularity}" invalid` });
  } else if (obj.granularity) {
    out.push({ level: 'ok', msg: `granularity ${obj.granularity} valid` });
  }
  if (obj.statistics && !STAT_VALUES.includes(obj.statistics)) {
    out.push({ level: 'err', msg: `statistics "${obj.statistics}" invalid` });
  }
  if (obj.aggregation && !STAT_VALUES.includes(obj.aggregation)) {
    out.push({ level: 'err', msg: `aggregation "${obj.aggregation}" invalid` });
  }
  if (obj.samePeriod && !SAME_PERIOD_VALUES.includes(obj.samePeriod)) {
    out.push({ level: 'err', msg: `samePeriod "${obj.samePeriod}" invalid` });
  }
  if (obj.statisticsKpi && !['MAX', 'MIN'].includes(obj.statistics)) {
    out.push({ level: 'err', msg: 'statisticsKpi requires statistics MAX or MIN' });
  }
  if (obj.includeHours && !/^\d{1,2}-\d{1,2}$/.test(String(obj.includeHours))) {
    out.push({ level: 'warn', msg: 'includeHours should be in "H-H" format (0-23)' });
  } else if (obj.includeHours) {
    out.push({ level: 'ok', msg: 'includeHours valid' });
  }
  if (typeof obj.timeshift === 'number' && obj.timeshift < 0) {
    out.push({ level: 'err', msg: 'timeshift must be a positive integer' });
  }
  // Forbidden patterns
  if (typeof obj.fx === 'string' && /\beval\b|;|--/.test(obj.fx)) {
    out.push({ level: 'err', msg: 'fx contains forbidden token (eval / SQL separator)' });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// UI primitives
// ─────────────────────────────────────────────────────────────────────

const TabBtn: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({ active, onClick, icon, label }) => (
  <button type="button" onClick={onClick}
    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors ${
      active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
    }`}>
    {icon}{label}
  </button>
);

// ─────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────

interface KpiFxAdvancedModeProps {
  getMeta: () => {
    kpi_code: string; nom_ihm: string; famille: string;
    unites: string; vendor: string; techno: string;
  };
  onCreated?: (created: any) => void;
}

interface FxResult { kind: 'ok' | 'warn' | 'err'; html: string; }
type RightTab = 'patterns' | 'keys' | 'explain' | 'validate' | 'test';

const KpiFxAdvancedMode: React.FC<KpiFxAdvancedModeProps> = ({ getMeta, onCreated }) => {
  const [intent, setIntent] = useState('');
  const [fxJson, setFxJson] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; msg: string }>({ ok: false, msg: '— empty —' });
  const [result, setResult] = useState<FxResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<RightTab>('patterns');
  const [fullscreen, setFullscreen] = useState(false);
  const [testCfg, setTestCfg] = useState({ date_from: '', date_to: '', vendor: '', scope: '', granularity: 'hour' });
  const [testOut, setTestOut] = useState<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fxUrl = (path: string) => getVpsUrl('kpi', path);

  const parseNow = useCallback((src: string) => {
    const v = src.trim(); if (!v) return null;
    try { return JSON.parse(v); } catch { return null; }
  }, []);

  const parsedObj = useMemo(() => parseNow(fxJson), [fxJson, parseNow]);

  const onEdit = useCallback((v: string) => {
    setFxJson(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const t = v.trim();
      if (!t) { setStatus({ ok: false, msg: '— empty —' }); return; }
      try { JSON.parse(t); setStatus({ ok: true, msg: '✓ JSON syntax OK' }); }
      catch (e: any) { setStatus({ ok: false, msg: '✗ ' + (e.message || '?').split('\n')[0] }); }
    }, 180);
  }, []);

  const format = useCallback(() => {
    const obj = parseNow(fxJson);
    if (!obj) { setResult({ kind: 'err', html: '✗ Cannot format — JSON invalid.' }); return; }
    setFxJson(JSON.stringify(obj, null, 2));
    setStatus({ ok: true, msg: '✓ JSON syntax OK' });
  }, [fxJson, parseNow]);

  const copy = useCallback(() => {
    navigator.clipboard?.writeText(fxJson).then(
      () => setResult({ kind: 'ok', html: '✓ JSON copied to clipboard.' }),
      () => setResult({ kind: 'err', html: '✗ Clipboard unavailable.' }),
    );
  }, [fxJson]);

  const generate = useCallback(() => {
    if (!intent.trim()) {
      setResult({ kind: 'warn', html: 'Describe what you want to calculate first.' });
      return;
    }
    const obj = generateFxFromIntent(intent);
    setFxJson(JSON.stringify(obj, null, 2));
    setStatus({ ok: true, msg: '✓ JSON syntax OK' });
    setTab('explain');
    setResult({ kind: 'warn', html: 'Generated heuristically — review FX and KPI refs before validating.' });
  }, [intent]);

  const explainNow = useCallback(() => {
    if (!parsedObj) { setResult({ kind: 'err', html: '✗ JSON invalid.' }); return; }
    setTab('explain');
  }, [parsedObj]);

  const loadPattern = useCallback((p: PatternDef) => {
    setFxJson(JSON.stringify(p.fx, null, 2));
    setStatus({ ok: true, msg: '✓ JSON syntax OK' });
    setIntent(p.intent);
    setTab('explain');
  }, []);

  const insertKey = useCallback((k: InsertKeyDef) => {
    const cur = fxJson.trim();
    let obj: Record<string, any> = {};
    if (cur) {
      const parsed = parseNow(cur);
      if (!parsed) { setResult({ kind: 'err', html: `✗ JSON invalid — fix syntax before inserting "${k.key}".` }); return; }
      obj = parsed;
    } else {
      obj = { fx: '[KPI]' };
    }
    obj[k.key] = k.sample;
    setFxJson(JSON.stringify(obj, null, 2));
    setStatus({ ok: true, msg: '✓ JSON syntax OK' });
  }, [fxJson, parseNow]);

  // Backend validate
  const validateRemote = useCallback(async () => {
    const obj = parseNow(fxJson);
    if (!obj) { setResult({ kind: 'err', html: '✗ JSON invalid — fix syntax first.' }); return; }
    setBusy(true);
    try {
      const r = await fetch(fxUrl('/kpi/fx/validate'), {
        method: 'POST', headers: { ...getApiHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ formula_fx: obj }),
      });
      const d = await r.json();
      if (!r.ok) {
        const errs = (d.detail?.errors || []).map((e: any) =>
          `<li><code>${(e.loc || []).join('.') || '(root)'}</code>: ${e.msg}</li>`).join('');
        setResult({ kind: 'err', html: `<b>HTTP ${r.status}</b><ul>${errs}</ul><i>${d.detail?.hint || ''}</i>` });
        return;
      }
      const feat = Object.entries(d.detected_features || {})
        .filter(([, v]) => v === true || (Array.isArray(v) && v.length))
        .map(([k, v]) => `${k}${Array.isArray(v) ? ': ' + (v as string[]).join(', ') : ''}`).join(' · ');
      const warns = (d.warnings || []).map((w: string) => `<div>⚠ ${w}</div>`).join('');
      const refs = Object.entries(d.resolved_refs || {})
        .map(([k, v]: any) => v.found ? `✓ <code>${k}</code>` : `✗ <code>${k}</code>`).join(' · ');
      setResult({ kind: warns ? 'warn' : 'ok',
        html: `<b>✓ Backend validation</b>${warns ? '<br>' + warns : ''}<br><b>Features:</b> ${feat || '—'}<br><b>Refs:</b> ${refs || '—'}` });
    } catch (e: any) {
      setResult({ kind: 'err', html: `Network error: ${e.message}` });
    } finally { setBusy(false); }
  }, [fxJson, parseNow]);

  const test = useCallback(async () => {
    const obj = parseNow(fxJson);
    if (!obj) { setResult({ kind: 'err', html: '✗ JSON invalid.' }); return; }
    setBusy(true); setTab('test'); setTestOut(null);
    try {
      const r = await fetch(fxUrl('/kpi/fx/test'), {
        method: 'POST', headers: { ...getApiHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ formula_fx: obj, ...testCfg }),
      });
      const d = await r.json();
      if (!r.ok) {
        setTestOut({ error: d.detail || `HTTP ${r.status}` });
        return;
      }
      setTestOut(d);
    } catch (e: any) {
      setTestOut({ error: e.message });
    } finally { setBusy(false); }
  }, [fxJson, parseNow, testCfg]);

  const create = useCallback(async () => {
    const meta = getMeta();
    if (!meta.kpi_code.trim()) {
      setResult({ kind: 'err', html: '<b>KPI Code required</b> — fill metadata above.' });
      return;
    }
    const obj = parseNow(fxJson);
    if (!obj) { setResult({ kind: 'err', html: '✗ JSON invalid.' }); return; }
    setBusy(true);
    try {
      const r = await fetch(fxUrl('/kpi/fx'), {
        method: 'POST', headers: { ...getApiHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kpi_code: meta.kpi_code,
          nom_ihm: meta.nom_ihm || null,
          famille: meta.famille || null,
          unites: meta.unites || null,
          vendor: meta.vendor && meta.vendor !== 'ALL' ? meta.vendor : null,
          techno: meta.techno && meta.techno !== 'ALL' ? meta.techno : null,
          formula_fx: obj, is_active: false,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        const errs = r.status === 409
          ? `exists: ${d.detail}`
          : (d.detail?.errors || []).map((e: any) => `<li>${e.msg}</li>`).join('');
        setResult({ kind: 'err', html: `<b>HTTP ${r.status}</b>${r.status === 409 ? ' — ' + errs : `<ul>${errs}</ul>`}` });
        return;
      }
      setResult({ kind: 'ok',
        html: `<b>✓ Created</b> id=<code>${d.id}</code> kpi_code=<code>${d.kpi_code}</code> status=<b>${d.status}</b>` });
      if (onCreated) onCreated(d);
    } catch (e: any) {
      setResult({ kind: 'err', html: `Network error: ${e.message}` });
    } finally { setBusy(false); }
  }, [fxJson, parseNow, getMeta, onCreated]);

  // ── Derived panels ──
  const explanation = useMemo(() => parsedObj ? explainFx(parsedObj) : null, [parsedObj]);
  const issues = useMemo(() => parsedObj ? validateFx(parsedObj) : [], [parsedObj]);
  const issueCount = useMemo(() => issues.filter(i => i.level === 'err').length, [issues]);

  const resultBlock = useMemo(() => {
    if (!result) return null;
    const cls = result.kind === 'ok' ? 'border-emerald-500 bg-emerald-500/5'
      : result.kind === 'warn' ? 'border-amber-500 bg-amber-500/5'
      : 'border-destructive bg-destructive/5';
    return (
      <div className={`mt-3 p-3 rounded-lg text-xs border-l-2 ${cls} text-foreground`}
           dangerouslySetInnerHTML={{ __html: result.html }} />
    );
  }, [result]);

  // ESC to leave fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [fullscreen]);

  // ── Right panel content ──
  const rightPanel = (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-1 px-2 pt-2 pb-2 border-b border-border flex-wrap">
        <TabBtn active={tab === 'patterns'} onClick={() => setTab('patterns')} icon={<Lightbulb className="w-3 h-3" />} label="Patterns" />
        <TabBtn active={tab === 'keys'} onClick={() => setTab('keys')} icon={<Puzzle className="w-3 h-3" />} label="Keys" />
        <TabBtn active={tab === 'explain'} onClick={() => setTab('explain')} icon={<ScrollText className="w-3 h-3" />} label="Explain" />
        <TabBtn active={tab === 'validate'} onClick={() => setTab('validate')} icon={<ShieldCheck className="w-3 h-3" />} label={`Validate${issueCount ? ` (${issueCount})` : ''}`} />
        <TabBtn active={tab === 'test'} onClick={() => setTab('test')} icon={<FlaskConical className="w-3 h-3" />} label="Test" />
      </div>
      <div className="flex-1 overflow-y-auto p-3 text-xs">
        {tab === 'patterns' && (
          <div className="grid grid-cols-1 gap-2">
            {FX_PATTERNS.map(p => (
              <button key={p.id} type="button" onClick={() => loadPattern(p)}
                className="text-left p-2.5 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-colors">
                <div className="text-[11px] font-bold text-foreground">{p.label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{p.intent}</div>
              </button>
            ))}
          </div>
        )}
        {tab === 'keys' && (
          <div className="space-y-1.5">
            {INSERT_KEYS.map(k => (
              <button key={k.key} type="button" onClick={() => insertKey(k)}
                className="w-full text-left p-2 rounded-md border border-dashed border-border hover:border-primary hover:bg-muted transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <code className="text-[11px] font-bold text-primary">{k.key}</code>
                  <span className="text-[9px] text-muted-foreground font-mono truncate max-w-[140px]">{JSON.stringify(k.sample)}</span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{k.hint}</div>
                {k.allowed && (
                  <div className="text-[9px] text-muted-foreground/70 mt-1 font-mono">{k.allowed.join(' · ')}</div>
                )}
              </button>
            ))}
          </div>
        )}
        {tab === 'explain' && (
          <div className="space-y-3">
            {!parsedObj && <div className="text-muted-foreground">FX JSON invalid or empty. Generate or write JSON to see the explanation.</div>}
            {parsedObj && explanation && (
              <>
                <div className="p-3 rounded-lg bg-muted/40 border border-border leading-relaxed text-foreground">
                  {explanation.sentence}
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Detected features</div>
                  {explanation.features.length === 0
                    ? <div className="text-muted-foreground text-[11px]">— none</div>
                    : <div className="flex flex-wrap gap-1.5">
                        {explanation.features.map((f, i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-mono">{f}</span>
                        ))}
                      </div>}
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Estimated complexity</div>
                  <div className="text-[11px]">
                    {Object.keys(parsedObj).length <= 3 ? '🟢 Low' : Object.keys(parsedObj).length <= 6 ? '🟡 Medium' : '🔴 High'}
                    <span className="text-muted-foreground"> · {Object.keys(parsedObj).length} keys</span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        {tab === 'validate' && (
          <div className="space-y-1.5">
            {!parsedObj && <div className="text-muted-foreground">JSON invalid — fix syntax first.</div>}
            {parsedObj && issues.length === 0 && <div className="text-emerald-500">✓ All client-side checks pass.</div>}
            {parsedObj && issues.map((i, idx) => (
              <div key={idx} className={`p-2 rounded-md border-l-2 text-[11px] ${
                i.level === 'ok' ? 'border-emerald-500 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400'
                : i.level === 'warn' ? 'border-amber-500 bg-amber-500/5 text-amber-600 dark:text-amber-400'
                : 'border-destructive bg-destructive/5 text-destructive'
              }`}>
                {i.level === 'ok' ? '✔' : i.level === 'warn' ? '⚠' : '✖'} {i.msg}
              </div>
            ))}
            <button type="button" onClick={validateRemote} disabled={busy || !parsedObj}
              className="w-full mt-2 px-2 py-1.5 rounded-md border border-border text-[10px] font-bold uppercase tracking-wider hover:bg-muted disabled:opacity-50 flex items-center justify-center gap-1">
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />} Run backend validation
            </button>
          </div>
        )}
        {tab === 'test' && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Date from
                <input type="date" value={testCfg.date_from} onChange={e => setTestCfg(s => ({ ...s, date_from: e.target.value }))}
                  className="mt-1 w-full px-2 py-1 rounded border border-border bg-background text-foreground text-[11px] font-mono" />
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Date to
                <input type="date" value={testCfg.date_to} onChange={e => setTestCfg(s => ({ ...s, date_to: e.target.value }))}
                  className="mt-1 w-full px-2 py-1 rounded border border-border bg-background text-foreground text-[11px] font-mono" />
              </label>
            </div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
              Vendor
              <select value={testCfg.vendor} onChange={e => setTestCfg(s => ({ ...s, vendor: e.target.value }))}
                className="mt-1 w-full px-2 py-1 rounded border border-border bg-background text-foreground text-[11px]">
                <option value="">All</option><option>Nokia</option><option>Ericsson</option><option>Huawei</option><option>Samsung</option>
              </select>
            </label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
              Region / Cluster / Site / Cell filter
              <input value={testCfg.scope} onChange={e => setTestCfg(s => ({ ...s, scope: e.target.value }))}
                placeholder="e.g. region=IDF or cell=ENB12345-1"
                className="mt-1 w-full px-2 py-1 rounded border border-border bg-background text-foreground text-[11px] font-mono" />
            </label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
              Granularity
              <select value={testCfg.granularity} onChange={e => setTestCfg(s => ({ ...s, granularity: e.target.value }))}
                className="mt-1 w-full px-2 py-1 rounded border border-border bg-background text-foreground text-[11px]">
                {GRANULARITY_VALUES.map(g => <option key={g}>{g}</option>)}
              </select>
            </label>
            <button type="button" onClick={test} disabled={busy || !parsedObj}
              className="w-full px-2 py-1.5 rounded-md bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1">
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} Run test
            </button>
            {testOut && (
              <div className="mt-2 p-2 rounded-md border border-border bg-muted/30 text-[10px]">
                {testOut.error
                  ? <div className="text-destructive">✗ {String(testOut.error)}</div>
                  : <>
                      <div className="grid grid-cols-2 gap-1 mb-2">
                        <div><span className="text-muted-foreground">duration:</span> <b>{testOut.duration_ms ?? '—'} ms</b></div>
                        <div><span className="text-muted-foreground">cardinality:</span> <b>{testOut.preview?.scope_cardinality ?? '—'}</b></div>
                        <div><span className="text-muted-foreground">null ratio:</span> <b>{testOut.preview?.null_ratio ?? '—'}</b></div>
                        <div><span className="text-muted-foreground">rows:</span> <b>{testOut.preview?.rows?.length ?? 0}</b></div>
                      </div>
                      {testOut.execution_plan?.steps && (
                        <details>
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Execution plan</summary>
                          <pre className="mt-1 text-[9px] whitespace-pre-wrap break-all">{JSON.stringify(testOut.execution_plan, null, 2)}</pre>
                        </details>
                      )}
                      {testOut.preview?.rows && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Sample rows</summary>
                          <pre className="mt-1 text-[9px] whitespace-pre-wrap break-all">{JSON.stringify(testOut.preview.rows.slice(0, 10), null, 2)}</pre>
                        </details>
                      )}
                    </>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // ── Main editor area ──
  const editorArea = (
    <div className="flex flex-col h-full min-h-0">
      {/* Intent */}
      <div className="mb-3">
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-primary" /> What do you want to calculate?
        </label>
        <textarea
          value={intent}
          onChange={e => setIntent(e.target.value)}
          placeholder={'e.g. Number of 4G cells with Drop Rate > 2% between 02h and 04h excluding weekends'}
          className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-foreground text-xs resize-y focus:outline-none focus:ring-2 focus:ring-primary/30"
          style={{ minHeight: 60 }}
        />
        <div className="flex gap-2 mt-2">
          <button type="button" onClick={generate}
            className="px-2.5 py-1.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider hover:bg-primary/20 flex items-center gap-1">
            <Wand2 className="w-3 h-3" /> Generate FX
          </button>
          <button type="button" onClick={explainNow} disabled={!parsedObj}
            className="px-2.5 py-1.5 rounded-md border border-border text-[10px] font-bold uppercase tracking-wider hover:bg-muted disabled:opacity-50 flex items-center gap-1">
            <ScrollText className="w-3 h-3" /> Explain FX
          </button>
        </div>
      </div>

      {/* JSON editor */}
      <div className="flex-1 flex flex-col min-h-0">
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
          <span className="flex items-center gap-1.5"><Code2 className="w-3 h-3" /> formula_fx (JSON) <span className="text-destructive">*</span></span>
          <span className={`font-normal text-[10px] ${status.ok ? 'text-emerald-500' : 'text-amber-500'}`}>{status.msg}</span>
        </label>
        <div className="relative flex-1 min-h-0 mt-1">
          <textarea
            value={fxJson}
            onChange={e => onEdit(e.target.value)}
            spellCheck={false}
            placeholder={`{\n  "fx": "IF([Drop Rate 4G] > 2, 1, 0)",\n  "statistics": "MAX",\n  "granularity": "hour",\n  "includeHours": "2-4",\n  "includeDays": "1-5",\n  "sourceNeType": "cell4G",\n  "aggregation": "SUM"\n}`}
            className="w-full h-full px-3 py-2.5 rounded-xl border border-border bg-[#1e1e2e] text-[#cdd6f4] text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            style={{ minHeight: fullscreen ? '60vh' : 240, lineHeight: 1.5 }}
          />
          <div className="absolute top-2 right-2 flex gap-1">
            <button type="button" onClick={format} title="Format"
              className="p-1.5 rounded bg-background/80 hover:bg-background border border-border"><Wand2 className="w-3 h-3" /></button>
            <button type="button" onClick={copy} title="Copy"
              className="p-1.5 rounded bg-background/80 hover:bg-background border border-border"><Copy className="w-3 h-3" /></button>
            <button type="button" onClick={() => setFullscreen(f => !f)} title="Fullscreen"
              className="p-1.5 rounded bg-background/80 hover:bg-background border border-border">
              {fullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button type="button" onClick={validateRemote} disabled={busy}
            className="px-2.5 py-1.5 rounded-lg border border-border text-[10px] font-bold uppercase tracking-wider hover:bg-muted disabled:opacity-50 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> Validate
          </button>
          <button type="button" onClick={test} disabled={busy}
            className="px-2.5 py-1.5 rounded-lg border border-border text-[10px] font-bold uppercase tracking-wider hover:bg-muted disabled:opacity-50 flex items-center gap-1">
            <FlaskConical className="w-3 h-3" /> Test KPI
          </button>
          <div className="flex-1" />
          <button type="button" onClick={create} disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider hover:opacity-90 disabled:opacity-50 flex items-center gap-1">
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Create KPI
          </button>
        </div>
        {resultBlock}
      </div>
    </div>
  );

  // ── Render ──
  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <div className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
            <Code2 className="w-4 h-4 text-primary" /> FX KPI Author — Fullscreen
          </div>
          <button type="button" onClick={() => setFullscreen(false)}
            className="p-1.5 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 grid grid-cols-[1fr_360px] gap-4 p-4 min-h-0">
          {editorArea}
          <div className="border border-border rounded-lg overflow-hidden min-h-0">{rightPanel}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[1fr_360px] gap-4" style={{ minHeight: 520 }}>
      {editorArea}
      <div className="border border-border rounded-lg overflow-hidden min-h-0 flex flex-col" style={{ maxHeight: 640 }}>
        {rightPanel}
      </div>
    </div>
  );
};

export default memo(KpiFxAdvancedMode);
