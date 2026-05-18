/**
 * KpiFxAdvancedMode — JSON editor isolé pour le mode Advanced (FX).
 *
 * Pourquoi séparé du wizard : tout le state lié au JSON éditeur
 * (fxJson, validation, résultat, busy) vit ici. Le wizard parent reçoit
 * seulement les meta props (kpi_code, name, vendor, techno, category)
 * en read-only et un onCreated callback. Sans cette extraction, chaque
 * keystroke dans le textarea déclenchait un re-render de tout le wizard
 * (header + footer + autres steps mémoïsés). UX devenait visiblement
 * lourde au-delà de quelques dizaines de caractères.
 */
import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Check, Code2, Lightbulb, Loader2, Play, Puzzle, Wand2 } from 'lucide-react';
import { getApiHeaders, getVpsUrl } from '@/lib/apiConfig';

// ── FX Patterns + valid enum lists (shared with backend kpi-engine) ──
const FX_PATTERNS: Record<string, Record<string, any>> = {
  busy_hour: { fx: '[Drop Rate 4G]', statistics: 'MAX', statisticsKpi: '[Traffic DL 4G]', granularity: 'hour', includeHours: '6-22' },
  night:     { fx: '[Drop Rate 4G]', statistics: 'AVG', granularity: 'hour', includeHours: '0-6' },
  outlier:   { fx: 'IF([Drop Rate 4G] > 3, 1, 0)', statistics: 'SUM', granularity: 'hour', includeHours: '0-6' },
  rolling:   { fx: '[eRAB Setup Failures Rate]', statistics: 'MEDIAN', samePeriod: 'weekWD', granularity: 'default', period: 5 },
  spatial:   { fx: '[Traffic DL 4G - eNodeB]', sourceNeType: 'enodeb', aggregation: 'SUM' },
};

const PATTERN_LABELS: Record<string, string> = {
  busy_hour: 'Busy Hour',
  night: 'Night KPI',
  outlier: 'Outlier Count',
  rolling: 'Rolling Median',
  spatial: 'Spatial Expand',
};

const FX_INSERT_KEYS: Array<{ key: string; sample: any; hint: string }> = [
  { key: 'granularity',   sample: 'hour',                 hint: 'default | one_min | five_min | quarter | half | hour | day | week | month' },
  { key: 'statistics',    sample: 'AVG',                  hint: 'SUM | MAX | MIN | AVG | MEDIAN | STDDEVPOP' },
  { key: 'statisticsKpi', sample: '[Traffic DL 4G]',      hint: 'Ref KPI for Busy Hour — requires statistics MAX or MIN' },
  { key: 'includeHours',  sample: '0-6',                  hint: 'Hour range H-H (0-23)' },
  { key: 'includeDays',   sample: 'Mon,Tue,Wed,Thu,Fri',  hint: 'Comma list of Mon..Sun' },
  { key: 'timeshift',     sample: 1,                      hint: 'Positive int — offset periods' },
  { key: 'dateTime',      sample: '2026-05-18T00:00:00Z', hint: 'ISO 8601 anchor' },
  { key: 'period',        sample: 5,                      hint: 'Rolling window — number of previous periods' },
  { key: 'samePeriod',    sample: 'weekWD',               hint: 'contiguous | contiguousWD | day | dayWD | week | weekWD | month' },
  { key: 'sourceNeType',  sample: 'enodeb',               hint: 'Source topology level: enodeb | cell | site | …' },
  { key: 'aggregation',   sample: 'SUM',                  hint: 'Spatial aggregation function' },
];

// ── Snippet panel — memoized so it doesn't re-render on every keystroke ──

const SnippetPanel = memo<{
  onLoadPattern: (name: string) => void;
  onInsertKey: (key: string, sample: any) => void;
}>(({ onLoadPattern, onInsertKey }) => (
  <div className="space-y-3">
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
        <Lightbulb className="w-3 h-3 text-amber-500" /> Patterns
      </div>
      <div className="flex flex-col gap-1">
        {Object.keys(FX_PATTERNS).map(p => (
          <button key={p} type="button" onClick={() => onLoadPattern(p)}
            className="px-2 py-1 rounded-md border border-border text-[10px] font-bold uppercase tracking-wider text-left hover:bg-muted">
            {PATTERN_LABELS[p]}
          </button>
        ))}
      </div>
    </div>
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
        <Puzzle className="w-3 h-3 text-primary" /> Insert Key
      </div>
      <div className="flex flex-col gap-1">
        {FX_INSERT_KEYS.map(k => (
          <button key={k.key} type="button" onClick={() => onInsertKey(k.key, k.sample)} title={k.hint}
            className="px-2 py-1 rounded-md border border-dashed border-border text-[10px] font-mono text-left hover:bg-muted">
            {k.key}
          </button>
        ))}
      </div>
    </div>
  </div>
));
SnippetPanel.displayName = 'SnippetPanel';


// ── Main component ────────────────────────────────────────────────────


interface KpiFxAdvancedModeProps {
  /** Live refs to the meta state held by the parent wizard. Read-only
   * here — the parent owns the meta inputs so switching modes preserves
   * user input. Passing as a callable accessor avoids re-rendering this
   * component when the parent meta state changes. */
  getMeta: () => {
    kpi_code: string;
    nom_ihm: string;
    famille: string;
    unites: string;
    vendor: string;
    techno: string;
  };
  /** Called after a successful POST /kpi/fx — parent can refresh catalog
   * list or close the modal. */
  onCreated?: (created: any) => void;
}

interface FxResult { kind: 'ok' | 'warn' | 'err'; html: string; }

const KpiFxAdvancedMode: React.FC<KpiFxAdvancedModeProps> = ({ getMeta, onCreated }) => {
  // State LOCAL au composant — pas de re-render du wizard parent à chaque
  // keystroke. C'est le point clé de la perf.
  const [fxJson, setFxJson] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; msg: string }>({ ok: false, msg: '— empty —' });
  const [result, setResult] = useState<FxResult | null>(null);
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fxUrl = (path: string) => getVpsUrl('kpi', path);

  // Parse JSON pour vrai (action) — utilisé par les boutons. Cheap.
  const parseNow = useCallback((src: string) => {
    const v = src.trim();
    if (!v) return null;
    try { return JSON.parse(v); } catch { return null; }
  }, []);

  // OnChange du textarea : update state immédiatement (controlled input)
  // mais validate de façon débouncée pour ne pas spammer setStatus.
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
    const out = JSON.stringify(obj, null, 2);
    setFxJson(out);
    setStatus({ ok: true, msg: '✓ JSON syntax OK' });
    setResult(null);
  }, [fxJson, parseNow]);

  const loadPattern = useCallback((name: string) => {
    const pat = FX_PATTERNS[name];
    if (!pat) return;
    setFxJson(JSON.stringify(pat, null, 2));
    setStatus({ ok: true, msg: '✓ JSON syntax OK' });
    setResult({ kind: 'warn', html: `Loaded <b>${name}</b>. Adapt <code>[kpi_code]</code> refs to existing catalog KPIs.` });
  }, []);

  const insertKey = useCallback((key: string, sample: any) => {
    const cur = fxJson.trim();
    let obj: Record<string, any> = {};
    if (cur) {
      const parsed = parseNow(cur);
      if (!parsed) {
        setResult({ kind: 'err', html: `✗ JSON invalid — fix syntax before inserting <code>${key}</code>.` });
        return;
      }
      obj = parsed;
    }
    obj[key] = sample;
    setFxJson(JSON.stringify(obj, null, 2));
    setStatus({ ok: true, msg: '✓ JSON syntax OK' });
  }, [fxJson, parseNow]);

  const validate = useCallback(async () => {
    const obj = parseNow(fxJson);
    if (!obj) { setResult({ kind: 'err', html: '✗ JSON invalid — fix syntax first.' }); return; }
    setBusy(true);
    try {
      const r = await fetch(fxUrl('/kpi/fx/validate'), {
        method: 'POST',
        headers: { ...getApiHeaders(), 'Content-Type': 'application/json' },
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
        html: `<b>✓ Valid</b>${warns ? '<br>' + warns : ''}<br><b>Features:</b> ${feat || '—'}<br><b>Refs:</b> ${refs || '—'}` });
    } catch (e: any) {
      setResult({ kind: 'err', html: `Network error: ${e.message}` });
    } finally { setBusy(false); }
  }, [fxJson, parseNow]);

  const test = useCallback(async () => {
    const obj = parseNow(fxJson);
    if (!obj) { setResult({ kind: 'err', html: '✗ JSON invalid.' }); return; }
    setBusy(true);
    try {
      const r = await fetch(fxUrl('/kpi/fx/test'), {
        method: 'POST',
        headers: { ...getApiHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ formula_fx: obj }),
      });
      const d = await r.json();
      if (!r.ok) {
        const errs = (d.detail?.errors || []).map((e: any) => `<li>${e.msg}</li>`).join('');
        setResult({ kind: 'err', html: `<b>HTTP ${r.status}</b><ul>${errs}</ul>` });
        return;
      }
      const steps = (d.execution_plan?.steps || []).map((s: any) =>
        `<li><b>${s.stage}</b>: ${JSON.stringify(s).replace(/[<>]/g, '')}</li>`).join('');
      setResult({ kind: 'ok',
        html: `<b>✓ Plan</b> (${d.duration_ms} ms)<br><ol style="margin:6px 0;padding-left:18px">${steps}</ol><i>${d.preview?.note || ''}</i>` });
    } catch (e: any) {
      setResult({ kind: 'err', html: `Network error: ${e.message}` });
    } finally { setBusy(false); }
  }, [fxJson, parseNow]);

  const create = useCallback(async () => {
    const meta = getMeta();
    if (!meta.kpi_code.trim()) {
      setResult({ kind: 'err', html: '<b>KPI Code required</b> — fill it via the Simple tab first, then switch back to Advanced.' });
      return;
    }
    const obj = parseNow(fxJson);
    if (!obj) { setResult({ kind: 'err', html: '✗ JSON invalid.' }); return; }
    setBusy(true);
    try {
      const r = await fetch(fxUrl('/kpi/fx'), {
        method: 'POST',
        headers: { ...getApiHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kpi_code: meta.kpi_code,
          nom_ihm: meta.nom_ihm || null,
          famille: meta.famille || null,
          unites: meta.unites || null,
          vendor: meta.vendor && meta.vendor !== 'ALL' ? meta.vendor : null,
          techno: meta.techno && meta.techno !== 'ALL' ? meta.techno : null,
          formula_fx: obj,
          is_active: false,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (r.status === 409) {
          setResult({ kind: 'err', html: `<b>HTTP 409</b> — exists: ${d.detail}` });
        } else {
          const errs = (d.detail?.errors || []).map((e: any) => `<li>${e.msg}</li>`).join('');
          setResult({ kind: 'err', html: `<b>HTTP ${r.status}</b><ul>${errs}</ul>` });
        }
        return;
      }
      setResult({ kind: 'ok',
        html: `<b>✓ Created</b> id=<code>${d.id}</code> kpi_code=<code>${d.kpi_code}</code> status=<b>${d.status}</b>` });
      if (onCreated) onCreated(d);
    } catch (e: any) {
      setResult({ kind: 'err', html: `Network error: ${e.message}` });
    } finally { setBusy(false); }
  }, [fxJson, parseNow, getMeta, onCreated]);

  // Result panel mémoïsé sur son contenu pour éviter de re-render à chaque keystroke.
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

  return (
    <div className="grid grid-cols-[1fr_200px] gap-4">
      {/* LEFT — editor */}
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
          <span>formula_fx (JSON) <span className="text-destructive">*</span></span>
          <span className={`font-normal text-[10px] ${status.ok ? 'text-emerald-500' : 'text-amber-500'}`}>{status.msg}</span>
        </label>
        <textarea
          value={fxJson}
          onChange={e => onEdit(e.target.value)}
          spellCheck={false}
          placeholder={`{\n  "fx": "[Drop Rate 4G]",\n  "statistics": "MAX",\n  "statisticsKpi": "[Traffic DL 4G]",\n  "granularity": "hour",\n  "includeHours": "6-22"\n}`}
          className="w-full mt-1 px-3 py-2.5 rounded-xl border border-border bg-[#1e1e2e] text-[#cdd6f4] text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
          style={{ minHeight: 240, lineHeight: 1.5 }}
        />
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button type="button" onClick={format} disabled={busy}
            className="px-2.5 py-1.5 rounded-lg border border-border text-[10px] font-bold uppercase tracking-wider hover:bg-muted disabled:opacity-50 flex items-center gap-1">
            <Wand2 className="w-3 h-3" /> Format
          </button>
          <button type="button" onClick={validate} disabled={busy}
            className="px-2.5 py-1.5 rounded-lg border border-border text-[10px] font-bold uppercase tracking-wider hover:bg-muted disabled:opacity-50 flex items-center gap-1">
            <Check className="w-3 h-3" /> Validate
          </button>
          <button type="button" onClick={test} disabled={busy}
            className="px-2.5 py-1.5 rounded-lg border border-border text-[10px] font-bold uppercase tracking-wider hover:bg-muted disabled:opacity-50 flex items-center gap-1">
            <Play className="w-3 h-3" /> Test KPI
          </button>
          <div className="flex-1" />
          <button type="button" onClick={create} disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider hover:opacity-90 disabled:opacity-50 flex items-center gap-1">
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Create KPI
          </button>
        </div>
        {resultBlock}
      </div>

      {/* RIGHT — snippet panel (memoized) */}
      <SnippetPanel onLoadPattern={loadPattern} onInsertKey={insertKey} />
    </div>
  );
};

export default memo(KpiFxAdvancedMode);
