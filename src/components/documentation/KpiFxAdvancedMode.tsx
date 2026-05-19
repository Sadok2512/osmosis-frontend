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
  // Optional editable metadata bound from parent wizard.
  code?: string; setCode?: (v: string) => void;
  name?: string; setName?: (v: string) => void;
  vendor?: string; setVendor?: (v: string) => void;
  tech?: string; setTech?: (v: string) => void;
  category?: string; setCategory?: (v: string) => void;
  unit?: string;
}

interface FxResult { kind: 'ok' | 'warn' | 'err'; html: string; }
type RightTab = 'patterns' | 'keys' | 'examples' | 'test';


// ─────────────────────────────────────────────────────────────────────
// Full real-world telecom examples shown in the Examples tab.
// ─────────────────────────────────────────────────────────────────────

interface ExampleDef { id: string; label: string; useCase: string; fx: Record<string, any>; explanation: string; }
const FX_EXAMPLES: ExampleDef[] = [
  { id: 'lte_acc', label: 'LTE Accessibility — Worst Cells BH',
    useCase: 'Find the worst LTE cells on Busy Hour RRC accessibility (working days).',
    fx: { fx: '[RRC Setup Success Rate 4G]', statistics: 'MIN', statisticsKpi: '[Traffic DL 4G]', granularity: 'hour', includeHours: '6-22', includeDays: '1-5', sourceNeType: 'cell4G', aggregation: 'MIN' },
    explanation: 'Picks the busiest hour per day on weekdays, selects the worst (MIN) RRC SR per cell.' },
  { id: 'nr_bh_traffic', label: '5G Traffic at Busy Hour',
    useCase: 'Daily 5G DL Traffic at network-level Busy Hour.',
    fx: { fx: '[Traffic DL 5G]', statistics: 'MAX', statisticsKpi: '[Traffic DL 5G]', granularity: 'hour', sourceNeType: 'cell5G', aggregation: 'SUM' },
    explanation: 'Sums cell-level 5G DL traffic at the peak hour per day.' },
  { id: 'prb_sat', label: 'PRB Saturation Count',
    useCase: 'Count of hour-cells where PRB DL utilisation > 80%.',
    fx: { fx: 'IF([PRB Utilisation DL 4G] > 80, 1, 0)', statistics: 'SUM', granularity: 'hour', includeHours: '6-22', sourceNeType: 'cell4G', aggregation: 'SUM' },
    explanation: 'Counts every hour-cell occurrence breaching the PRB threshold during business hours.' },
  { id: 'drop_anom', label: 'Drop Rate Anomalies',
    useCase: 'Anomaly counter when 4G Drop Rate exceeds 2% during night hours.',
    fx: { fx: 'IF([Drop Rate 4G] > 2, 1, 0)', statistics: 'SUM', granularity: 'hour', includeHours: '0-6', sourceNeType: 'cell4G', aggregation: 'SUM' },
    explanation: 'Aggregates night-time drop-rate breaches per cell.' },
  { id: 'cssr_degrad', label: 'CSSR Week-over-Week Degradation',
    useCase: 'CSSR vs same day last week to detect regressions.',
    fx: { fx: '[CSSR]', statistics: 'AVG', samePeriod: 'week', timeshift: 1, granularity: 'day' },
    explanation: 'Daily AVG CSSR, shifted by one week for delta computation.' },
  { id: 'erab_fail', label: 'eRAB Setup Failures — Rolling Median',
    useCase: '5-period rolling median of eRAB setup failure rate on working days.',
    fx: { fx: '[eRAB Setup Failures Rate]', statistics: 'MEDIAN', samePeriod: 'weekWD', granularity: 'default', period: 5 },
    explanation: 'Smooths short-term spikes by taking the median over the last 5 working periods.' },
];

const KpiFxAdvancedMode: React.FC<KpiFxAdvancedModeProps> = ({
  getMeta, onCreated, code, setCode, name, setName, vendor, setVendor,
  tech, setTech, category, setCategory,
}) => {
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
    setResult({ kind: 'warn', html: 'Generated heuristically — review FX and KPI refs before validating.' });
  }, [intent]);

  const loadPattern = useCallback((p: PatternDef) => {
    setFxJson(JSON.stringify(p.fx, null, 2));
    setStatus({ ok: true, msg: '✓ JSON syntax OK' });
    setIntent(p.intent);
  }, []);

  const loadExample = useCallback((e: ExampleDef) => {
    setFxJson(JSON.stringify(e.fx, null, 2));
    setStatus({ ok: true, msg: '✓ JSON syntax OK' });
    setIntent(e.useCase);
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
      if (!r.ok) { setTestOut({ error: d.detail || `HTTP ${r.status}` }); return; }
      setTestOut(d);
    } catch (e: any) {
      setTestOut({ error: e.message });
    } finally { setBusy(false); }
  }, [fxJson, parseNow, testCfg]);

  const create = useCallback(async () => {
    const meta = getMeta();
    if (!meta.kpi_code.trim()) {
      setResult({ kind: 'err', html: '<b>KPI Code required</b> — fill metadata in the header.' });
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

  const explanation = useMemo(() => parsedObj ? explainFx(parsedObj) : null, [parsedObj]);
  const issues = useMemo(() => parsedObj ? validateFx(parsedObj) : [], [parsedObj]);
  const errCount = useMemo(() => issues.filter(i => i.level === 'err').length, [issues]);
  const warnCount = useMemo(() => issues.filter(i => i.level === 'warn').length, [issues]);

  useEffect(() => {
    if (!fullscreen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [fullscreen]);

  // ── Sticky top header ──
  const headerBar = (
    <div className="shrink-0 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/70 px-5 py-3">
      <div className="grid grid-cols-[1.4fr_1.4fr_0.8fr_0.8fr_1.1fr_auto] gap-3 items-end">
        <label className="block">
          <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">KPI Code <span className="text-destructive">*</span></div>
          <input value={code ?? ''} onChange={e => setCode?.(e.target.value)}
            placeholder="FX_BUSY_HOUR_DROP_RATE_4G"
            className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </label>
        <label className="block">
          <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Display Name</div>
          <input value={name ?? ''} onChange={e => setName?.(e.target.value)}
            placeholder="Busy Hour Drop Rate 4G"
            className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </label>
        <label className="block">
          <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Vendor</div>
          <select value={vendor ?? ''} onChange={e => setVendor?.(e.target.value)}
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-foreground text-xs">
            {['ALL','Nokia','Ericsson','Huawei','Samsung'].map(o => <option key={o}>{o}</option>)}
          </select>
        </label>
        <label className="block">
          <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Techno</div>
          <select value={tech ?? ''} onChange={e => setTech?.(e.target.value)}
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-foreground text-xs">
            {['ALL','LTE','NR'].map(o => <option key={o}>{o}</option>)}
          </select>
        </label>
        <label className="block">
          <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Category</div>
          <select value={category ?? ''} onChange={e => setCategory?.(e.target.value)}
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-foreground text-xs">
            {['Accessibility','Retainability','Throughput','Traffic','Mobility','Radio Quality','VoLTE','Latency','Integrity','Other'].map(o => <option key={o}>{o}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={format}
            className="px-2.5 py-1.5 rounded-md border border-border text-[10px] font-bold uppercase tracking-wider hover:bg-muted flex items-center gap-1">
            <Wand2 className="w-3 h-3" /> Format
          </button>
          <button type="button" onClick={validateRemote} disabled={busy}
            className="px-2.5 py-1.5 rounded-md border border-border text-[10px] font-bold uppercase tracking-wider hover:bg-muted disabled:opacity-50 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> Validate
          </button>
          <button type="button" onClick={test} disabled={busy}
            className="px-2.5 py-1.5 rounded-md border border-border text-[10px] font-bold uppercase tracking-wider hover:bg-muted disabled:opacity-50 flex items-center gap-1">
            <FlaskConical className="w-3 h-3" /> Test KPI
          </button>
          <button type="button" onClick={create} disabled={busy}
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider hover:opacity-90 disabled:opacity-50 flex items-center gap-1">
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Create KPI
          </button>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px]">
        <span className={status.ok ? 'text-emerald-500' : 'text-amber-500'}>{status.msg}</span>
        <span className="text-muted-foreground">·</span>
        <span className={errCount ? 'text-destructive' : 'text-muted-foreground'}>{errCount} errors</span>
        <span className={warnCount ? 'text-amber-500' : 'text-muted-foreground'}>{warnCount} warnings</span>
        {parsedObj && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              complexity: {Object.keys(parsedObj).length <= 3 ? '🟢 low' : Object.keys(parsedObj).length <= 6 ? '🟡 medium' : '🔴 high'}
              {' '}({Object.keys(parsedObj).length} keys)
            </span>
          </>
        )}
      </div>
    </div>
  );

  // ── LEFT — Operational intent + explain + validate ──
  const leftCol = (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto p-4 gap-4 bg-muted/20">
      <div>
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
          <Sparkles className="w-3 h-3 text-primary" /> What do you want to calculate?
        </div>
        <textarea
          value={intent}
          onChange={e => setIntent(e.target.value)}
          placeholder={'e.g. Number of 4G cells with Drop Rate > 2% between 02h and 04h excluding weekends'}
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/30"
          style={{ minHeight: 180 }}
        />
        <button type="button" onClick={generate}
          className="w-full mt-2 px-2.5 py-2 rounded-md bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider hover:bg-primary/20 flex items-center justify-center gap-1">
          <Wand2 className="w-3 h-3" /> Generate FX
        </button>
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
          <ScrollText className="w-3 h-3" /> Explanation
        </div>
        <div className="p-3 rounded-lg bg-card border border-border text-xs text-foreground leading-relaxed min-h-[60px]">
          {!parsedObj && <span className="text-muted-foreground">FX JSON invalid or empty. Generate or write JSON to see the explanation.</span>}
          {parsedObj && explanation && (
            <>
              <div>{explanation.sentence}</div>
              {explanation.features.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {explanation.features.map((f, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-mono">{f}</span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
          <ShieldCheck className="w-3 h-3" /> Validation
        </div>
        <div className="space-y-1.5">
          {!parsedObj && <div className="text-[11px] text-muted-foreground">JSON invalid — fix syntax first.</div>}
          {parsedObj && issues.length === 0 && <div className="text-[11px] text-emerald-500">✓ All client-side checks pass.</div>}
          {parsedObj && issues.map((i, idx) => (
            <div key={idx} className={`p-2 rounded-md border-l-2 text-[11px] ${
              i.level === 'ok' ? 'border-emerald-500 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400'
              : i.level === 'warn' ? 'border-amber-500 bg-amber-500/5 text-amber-600 dark:text-amber-400'
              : 'border-destructive bg-destructive/5 text-destructive'
            }`}>
              {i.level === 'ok' ? '✔' : i.level === 'warn' ? '⚠' : '✖'} {i.msg}
            </div>
          ))}
        </div>
      </div>

      {result && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Last action</div>
          <div className={`p-3 rounded-lg text-xs border-l-2 ${
              result.kind === 'ok' ? 'border-emerald-500 bg-emerald-500/5'
              : result.kind === 'warn' ? 'border-amber-500 bg-amber-500/5'
              : 'border-destructive bg-destructive/5'} text-foreground`}
            dangerouslySetInnerHTML={{ __html: result.html }} />
        </div>
      )}
    </div>
  );

  // ── CENTER — Dominant JSON editor ──
  const centerCol = (
    <div className="flex flex-col h-full min-h-0 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-foreground">
          <Code2 className="w-3.5 h-3.5 text-primary" /> formula_fx (JSON)
          <span className="text-destructive">*</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={format} title="Auto-format"
            className="p-1.5 rounded-md border border-border hover:bg-muted"><Wand2 className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={copy} title="Copy"
            className="p-1.5 rounded-md border border-border hover:bg-muted"><ClipboardCopy className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={() => setFullscreen(f => !f)} title="Editor fullscreen"
            className="p-1.5 rounded-md border border-border hover:bg-muted">
            {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      <textarea
        value={fxJson}
        onChange={e => onEdit(e.target.value)}
        spellCheck={false}
        placeholder={`{\n  "fx": "IF([Drop Rate 4G] > 2, 1, 0)",\n  "statistics": "MAX",\n  "granularity": "hour",\n  "includeHours": "2-4",\n  "includeDays": "1-5",\n  "sourceNeType": "cell4G",\n  "aggregation": "SUM"\n}`}
        className="flex-1 min-h-0 w-full px-4 py-3 rounded-xl border border-border bg-[#1e1e2e] text-[#cdd6f4] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
        style={{ lineHeight: 1.6, tabSize: 2 }}
      />
      <div className="mt-2 px-3 py-2 rounded-md bg-muted/40 border border-border text-[10px] text-muted-foreground flex flex-wrap gap-3">
        <span>{status.ok ? '✔ valid JSON' : '✗ invalid JSON'}</span>
        {parsedObj?.statistics && <span>✔ temporal aggregation ({parsedObj.statistics})</span>}
        {parsedObj?.aggregation && <span>✔ spatial aggregation ({parsedObj.aggregation})</span>}
        {parsedObj?.samePeriod && <span>✔ reference period</span>}
        {parsedObj?.period && <span>✔ rolling window</span>}
        {parsedObj && (
          <span>estimated cost: {Object.keys(parsedObj).length <= 3 ? 'low' : Object.keys(parsedObj).length <= 6 ? 'medium' : 'high'}</span>
        )}
      </div>
    </div>
  );

  // ── RIGHT — Assistant tabs ──
  const rightCol = (
    <div className="flex flex-col h-full min-h-0 border-l border-border bg-muted/10">
      <div className="flex items-center gap-1 px-3 pt-3 pb-2 border-b border-border flex-wrap">
        <TabBtn active={tab === 'patterns'} onClick={() => setTab('patterns')} icon={<Lightbulb className="w-3 h-3" />} label="Patterns" />
        <TabBtn active={tab === 'keys'} onClick={() => setTab('keys')} icon={<Puzzle className="w-3 h-3" />} label="Keys" />
        <TabBtn active={tab === 'examples'} onClick={() => setTab('examples')} icon={<ScrollText className="w-3 h-3" />} label="Examples" />
        <TabBtn active={tab === 'test'} onClick={() => setTab('test')} icon={<FlaskConical className="w-3 h-3" />} label="Test Results" />
      </div>
      <div className="flex-1 overflow-y-auto p-3 text-xs">
        {tab === 'patterns' && (
          <div className="grid grid-cols-1 gap-2">
            {FX_PATTERNS.map(p => (
              <button key={p.id} type="button" onClick={() => loadPattern(p)}
                className="text-left p-3 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-colors">
                <div className="text-[12px] font-bold text-foreground">{p.label}</div>
                <div className="text-[10px] text-muted-foreground mt-1 leading-snug">{p.intent}</div>
                <pre className="mt-2 p-2 rounded bg-[#1e1e2e] text-[#cdd6f4] text-[9px] font-mono overflow-x-auto leading-tight">{JSON.stringify(p.fx, null, 2)}</pre>
              </button>
            ))}
          </div>
        )}
        {tab === 'keys' && (
          <div className="space-y-1.5">
            {INSERT_KEYS.map(k => (
              <details key={k.key} className="rounded-md border border-border bg-card open:bg-muted/30">
                <summary className="cursor-pointer p-2 flex items-center justify-between gap-2">
                  <code className="text-[11px] font-bold text-primary">{k.key}</code>
                  <span className="text-[9px] text-muted-foreground font-mono truncate max-w-[140px]">{JSON.stringify(k.sample)}</span>
                </summary>
                <div className="p-2 pt-0 space-y-1.5">
                  <div className="text-[10px] text-muted-foreground">{k.hint}</div>
                  {k.allowed && (
                    <div className="flex flex-wrap gap-1">
                      {k.allowed.map(a => (
                        <span key={a} className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[9px] font-mono">{a}</span>
                      ))}
                    </div>
                  )}
                  <button type="button" onClick={() => insertKey(k)}
                    className="w-full px-2 py-1 rounded border border-dashed border-border hover:border-primary hover:bg-primary/5 text-[10px] font-bold uppercase tracking-wider">
                    Insert into FX
                  </button>
                </div>
              </details>
            ))}
          </div>
        )}
        {tab === 'examples' && (
          <div className="grid grid-cols-1 gap-2">
            {FX_EXAMPLES.map(ex => (
              <div key={ex.id} className="p-3 rounded-lg border border-border bg-card">
                <div className="text-[12px] font-bold text-foreground">{ex.label}</div>
                <div className="text-[10px] text-muted-foreground mt-1 leading-snug">{ex.useCase}</div>
                <pre className="mt-2 p-2 rounded bg-[#1e1e2e] text-[#cdd6f4] text-[9px] font-mono overflow-x-auto leading-tight">{JSON.stringify(ex.fx, null, 2)}</pre>
                <div className="text-[10px] text-muted-foreground mt-2 italic">{ex.explanation}</div>
                <button type="button" onClick={() => loadExample(ex)}
                  className="w-full mt-2 px-2 py-1.5 rounded border border-border hover:border-primary hover:bg-primary/5 text-[10px] font-bold uppercase tracking-wider">
                  Load into editor
                </button>
              </div>
            ))}
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

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-[60] bg-background flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <div className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
            <Code2 className="w-4 h-4 text-primary" /> FX Editor — Fullscreen
          </div>
          <button type="button" onClick={() => setFullscreen(false)}
            className="p-1.5 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 min-h-0">{centerCol}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {headerBar}
      <div className="flex-1 min-h-0 grid grid-cols-[65%_35%]">
        {centerCol}
        {rightCol}
      </div>
    </div>
  );
};

export default memo(KpiFxAdvancedMode);
