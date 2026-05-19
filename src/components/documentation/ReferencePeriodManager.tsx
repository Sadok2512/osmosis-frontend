import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar, CalendarRange, Clock, Filter, Globe2, Pencil, Pin, Plus, RefreshCw,
  RotateCcw, Search, Star, Trash2, User, X,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  listReferencePeriods, createReferencePeriod, updateReferencePeriod,
  disableReferencePeriod, resolveReferencePeriodRange,
} from '@/precision-architect/lib/referencePeriods';
import type { CompareMode, ReferencePeriod, ReferencePeriodRule } from '@/precision-architect/types';

const PINNED_STORAGE_KEY = 'osmosis_reference_periods_pinned_v1';
const PAGE_SIZE = 20;
const PALETTE = [
  '#0ea5e9', '#22c55e', '#a855f7', '#f59e0b', '#ef4444',
  '#14b8a6', '#6366f1', '#ec4899', '#84cc16', '#f97316',
];

type TypeKey = 'relative' | 'absolute' | 'recurring';

function classifyType(p: ReferencePeriod): TypeKey {
  const t = (p.type || (p.rule as any)?.type || '').toString();
  if (t === 'custom') return 'absolute';
  if (t === 'relative') return 'relative';
  // month_to_date, previous_month, quarter_to_date → recurring calendar logic
  return 'recurring';
}

function ruleSummary(rule: ReferencePeriodRule): string {
  switch (rule.type) {
    case 'relative':       return `Last ${rule.value} ${rule.unit} → now`;
    case 'month_to_date':  return 'Month-to-date';
    case 'previous_month': return 'Previous calendar month';
    case 'quarter_to_date':return 'Quarter-to-date';
    case 'custom':         return `${rule.from} → ${rule.to}`;
    default:               return JSON.stringify(rule).slice(0, 60);
  }
}

function loadPinned(): Set<string> {
  try {
    const raw = localStorage.getItem(PINNED_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}

function savePinned(pinned: Set<string>) {
  try { localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify([...pinned])); }
  catch { /* ignore */ }
}

/* ── Summary card ──────────────────────────────────────────────────── */

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'primary' | 'emerald' | 'blue' | 'violet';
}

const TONE_STYLES: Record<SummaryCardProps['tone'], { iconBg: string; iconColor: string; valueText: string }> = {
  primary: { iconBg: 'bg-primary/10',         iconColor: 'text-primary',         valueText: 'text-foreground' },
  emerald: { iconBg: 'bg-emerald-500/10',     iconColor: 'text-emerald-600',     valueText: 'text-foreground' },
  blue:    { iconBg: 'bg-sky-500/10',         iconColor: 'text-sky-600',         valueText: 'text-foreground' },
  violet:  { iconBg: 'bg-violet-500/10',      iconColor: 'text-violet-600',      valueText: 'text-foreground' },
};

const SummaryCard: React.FC<SummaryCardProps> = ({ icon, label, value, tone }) => {
  const s = TONE_STYLES[tone];
  return (
    <Card className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className={cn('mb-4 flex h-11 w-11 items-center justify-center rounded-xl', s.iconBg)}>
        <span className={s.iconColor}>{icon}</span>
      </div>
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className={cn('mt-2 text-3xl font-black tracking-tight tabular-nums', s.valueText)}>{value}</p>
    </Card>
  );
};

/* ── Edit / create dialog ─────────────────────────────────────────── */

interface EditDialogProps {
  open: boolean;
  initial: ReferencePeriod | null;
  onClose: () => void;
  onSaved: (p: ReferencePeriod) => void;
}

const RULE_TYPES: { value: ReferencePeriodRule['type']; label: string }[] = [
  { value: 'relative',        label: 'Relative (rolling window)' },
  { value: 'month_to_date',   label: 'Month-to-date' },
  { value: 'previous_month',  label: 'Previous month' },
  { value: 'quarter_to_date', label: 'Quarter-to-date' },
  { value: 'custom',          label: 'Absolute (custom range)' },
];

const REL_UNITS: { value: 'hours'|'days'|'weeks'|'months'; label: string }[] = [
  { value: 'hours',  label: 'hours' },
  { value: 'days',   label: 'days' },
  { value: 'weeks',  label: 'weeks' },
  { value: 'months', label: 'months' },
];

const COMPARE_MODES: { value: CompareMode; label: string; help: string }[] = [
  { value: 'overlay',  label: 'Overlay',  help: 'Plot the reference series on top of the current one.' },
  { value: 'delta',    label: 'Delta %',  help: 'Show percent change vs. the reference.' },
  { value: 'trend',    label: 'Trend',    help: 'Use the reference as a moving trend line.' },
  { value: 'baseline', label: 'Baseline', help: 'Use the reference as a static baseline for thresholding.' },
];

const EditDialog: React.FC<EditDialogProps> = ({ open, initial, onClose, onSaved }) => {
  const isCreate = !initial;
  const [id, setId]                       = useState('');
  const [name, setName]                   = useState('');
  const [description, setDescription]     = useState('');
  const [color, setColor]                 = useState<string>(PALETTE[0]);
  const [ruleType, setRuleType]           = useState<ReferencePeriodRule['type']>('relative');
  const [relValue, setRelValue]           = useState('7');
  const [relUnit, setRelUnit]             = useState<'hours'|'days'|'weeks'|'months'>('days');
  const [absFrom, setAbsFrom]             = useState('');
  const [absTo,   setAbsTo]               = useState('');
  const [enabled, setEnabled]             = useState(true);
  const [isDefault, setIsDefault]         = useState(false);
  const [compareMode, setCompareMode]     = useState<CompareMode>('overlay');
  const [saving, setSaving]               = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setId(initial.id);
      setName(initial.name);
      setDescription(initial.description || '');
      setColor(initial.color || PALETTE[0]);
      setEnabled(initial.enabled !== false);
      setIsDefault(Boolean(initial.isDefault));
      setCompareMode((initial.compareMode as CompareMode) || 'overlay');
      const r = initial.rule;
      setRuleType(r.type);
      if (r.type === 'relative') {
        setRelValue(String(r.value));
        setRelUnit(r.unit);
      } else if (r.type === 'custom') {
        setAbsFrom(r.from || '');
        setAbsTo(r.to || '');
      }
    } else {
      const ts = Date.now();
      setId(`period_${ts}`);
      setName('');
      setDescription('');
      setColor(PALETTE[ts % PALETTE.length]);
      setRuleType('relative');
      setRelValue('7');
      setRelUnit('days');
      setAbsFrom('');
      setAbsTo('');
      setEnabled(true);
      setIsDefault(false);
      setCompareMode('overlay');
    }
  }, [open, initial]);

  const buildRule = (): ReferencePeriodRule | null => {
    switch (ruleType) {
      case 'relative': {
        const v = Number(relValue);
        if (!Number.isFinite(v) || v <= 0) return null;
        return { type: 'relative', value: v, unit: relUnit, end: 'now' };
      }
      case 'month_to_date':   return { type: 'month_to_date'   };
      case 'previous_month':  return { type: 'previous_month'  };
      case 'quarter_to_date': return { type: 'quarter_to_date' };
      case 'custom': {
        if (!absFrom || !absTo) return null;
        return { type: 'custom', from: absFrom, to: absTo };
      }
    }
  };

  const submit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    const rule = buildRule();
    if (!rule) {
      toast({ title: 'Invalid rule', description: 'Check the period configuration.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload: ReferencePeriod = {
        id: isCreate ? id.trim() || `period_${Date.now()}` : initial!.id,
        name: trimmedName,
        rule,
        description: description.trim() || undefined,
        color,
        enabled,
        isDefault,
        compareMode,
      };
      const saved = isCreate
        ? await createReferencePeriod(payload)
        : await updateReferencePeriod(initial!.id, payload);
      onSaved(saved);
      onClose();
      toast({ title: isCreate ? 'Period created' : 'Period updated', description: saved.name });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message || 'Backend error.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? 'Create Reference Period' : 'Edit Reference Period'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Identifier</label>
              <Input value={id} onChange={(e) => setId(e.target.value)} disabled={!isCreate} className="mt-1" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Description</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" placeholder="Short description…" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Rule type</label>
              <Select value={ruleType} onValueChange={(v) => setRuleType(v as ReferencePeriodRule['type'])}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RULE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Color</label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {PALETTE.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn(
                      'h-7 w-7 rounded-md border-2 transition',
                      color === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'
                    )}
                    style={{ background: c }}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
          </div>

          {ruleType === 'relative' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Value</label>
                <Input type="number" min={1} value={relValue} onChange={(e) => setRelValue(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Unit</label>
                <Select value={relUnit} onValueChange={(v) => setRelUnit(v as any)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REL_UNITS.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {ruleType === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">From (ISO)</label>
                <Input value={absFrom} onChange={(e) => setAbsFrom(e.target.value)} placeholder="2026-01-01T00:00:00" className="mt-1" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">To (ISO)</label>
                <Input value={absTo} onChange={(e) => setAbsTo(e.target.value)} placeholder="2026-01-08T00:00:00" className="mt-1" />
              </div>
            </div>
          )}

          {/* ── Preview ──────────────────────────────────────────── */}
          {(() => {
            const previewRule = buildRule();
            let label = 'Invalid rule';
            let fromTxt = '—';
            let toTxt   = '—';
            if (previewRule) {
              try {
                const r = resolveReferencePeriodRange({
                  id: id || 'preview',
                  name: name || 'preview',
                  rule: previewRule,
                });
                fromTxt = r.from.replace('T', ' ').slice(0, 16);
                toTxt   = r.to.replace('T', ' ').slice(0, 16);
                label   = r.label || name || 'Generated range';
              } catch { /* keep defaults */ }
            }
            return (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Generated range</p>
                <p className="mt-1 font-mono text-xs text-foreground">
                  <span className="text-muted-foreground">From</span>{' '}
                  <span className="font-bold">{fromTxt}</span>{' '}
                  <span className="text-muted-foreground">to</span>{' '}
                  <span className="font-bold">{toTxt}</span>
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">{label}</p>
              </div>
            );
          })()}

          {/* ── Compare Mode ─────────────────────────────────────── */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Compare mode</label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {COMPARE_MODES.map(m => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setCompareMode(m.value)}
                  className={cn(
                    'flex flex-col gap-1 rounded-lg border px-3 py-2 text-left transition',
                    compareMode === m.value
                      ? 'border-primary bg-primary/10 shadow-sm'
                      : 'border-border bg-card hover:bg-muted/40'
                  )}
                  title={m.help}
                >
                  <span className={cn('text-xs font-bold', compareMode === m.value ? 'text-primary' : 'text-foreground')}>
                    {m.label}
                  </span>
                  <span className="text-[10px] leading-tight text-muted-foreground">{m.help}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 pt-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              <span>Active</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
              <span>Global (shared with all users)</span>
            </label>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : isCreate ? 'Create' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ── Main page ────────────────────────────────────────────────────── */

const ReferencePeriodManager: React.FC = () => {
  const [periods, setPeriods] = useState<ReferencePeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | TypeKey>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage] = useState(1);
  const [pinned, setPinned] = useState<Set<string>>(() => loadPinned());
  const [editing, setEditing] = useState<{ open: boolean; initial: ReferencePeriod | null }>({ open: false, initial: null });

  const load = async () => {
    setLoading(true);
    try {
      const list = await listReferencePeriods();
      setPeriods(list);
    } catch (e: any) {
      toast({ title: 'Load failed', description: e?.message || 'Backend error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const togglePin = (id: string) => {
    setPinned(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      savePinned(next);
      return next;
    });
  };

  const handleSaved = (saved: ReferencePeriod) => {
    setPeriods(prev => {
      const i = prev.findIndex(p => p.id === saved.id);
      if (i < 0) return [...prev, saved];
      const copy = prev.slice();
      copy[i] = { ...copy[i], ...saved };
      return copy;
    });
  };

  const handleDelete = async (p: ReferencePeriod) => {
    if (!window.confirm(`Disable "${p.name}"? It will be hidden from selectors but kept in the database.`)) return;
    try {
      await disableReferencePeriod(p.id);
      await load();
      toast({ title: 'Period disabled', description: p.name });
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e?.message || 'Backend error', variant: 'destructive' });
    }
  };

  const toggleActive = async (p: ReferencePeriod) => {
    try {
      const saved = await updateReferencePeriod(p.id, { enabled: !(p.enabled !== false) });
      handleSaved(saved);
    } catch (e: any) {
      toast({ title: 'Update failed', description: e?.message || 'Backend error', variant: 'destructive' });
    }
  };

  const summary = useMemo(() => {
    const total = periods.length;
    const active = periods.filter(p => p.enabled !== false).length;
    const global = periods.filter(p => p.isDefault).length;
    const user = total - global;
    return { total, active, global, user };
  }, [periods]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = periods.slice();
    if (q) {
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
      );
    }
    if (typeFilter !== 'all') list = list.filter(p => classifyType(p) === typeFilter);
    if (statusFilter === 'active')   list = list.filter(p => p.enabled !== false);
    if (statusFilter === 'inactive') list = list.filter(p => p.enabled === false);
    // Pinned first, then by order, then by name
    list.sort((a, b) => {
      const pa = pinned.has(a.id) ? 0 : 1;
      const pb = pinned.has(b.id) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      const oa = a.order ?? 999;
      const ob = b.order ?? 999;
      if (oa !== ob) return oa - ob;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [periods, search, typeFilter, statusFilter, pinned]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { if (page > totalPages) setPage(1); }, [totalPages, page]);

  const hasFilters = search.trim() !== '' || typeFilter !== 'all' || statusFilter !== 'all';

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[linear-gradient(135deg,hsl(var(--background))_0%,hsl(var(--muted))_52%,hsl(var(--background))_100%)] px-3 py-3 sm:px-5 sm:py-4">
      {/* Header */}
      <div className="mb-4 rounded-xl border border-white/80 bg-white/78 px-6 py-5 shadow-[0_18px_60px_rgba(15,118,110,0.08)] backdrop-blur-xl">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-primary">OSMOSIS</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-foreground sm:text-3xl">Reference Period Manager</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Reusable temporal baselines for KPI benchmarking, alarm comparison and dashboard reports. Shared across the platform — NOC, RF optimization, BI Studio and Netview.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={load} className="h-10 gap-2">
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button onClick={() => setEditing({ open: true, initial: null })} className="h-10 gap-2 shadow-md shadow-primary/20">
              <Plus className="h-4 w-4" /> Create Reference Period
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-1">
        {/* Summary cards */}
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard icon={<CalendarRange className="h-5 w-5" />} label="Total References" value={summary.total}  tone="primary" />
          <SummaryCard icon={<Clock className="h-5 w-5" />}         label="Active References" value={summary.active} tone="emerald" />
          <SummaryCard icon={<Globe2 className="h-5 w-5" />}        label="Global References" value={summary.global} tone="blue"    />
          <SummaryCard icon={<User className="h-5 w-5" />}          label="User References"   value={summary.user}   tone="violet"  />
        </div>

        {/* Toolbar */}
        <Card className="mb-4 rounded-xl border border-border bg-card p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, identifier or description…"
                className="h-10 pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
              <SelectTrigger className="h-10 w-[180px]"><Filter className="mr-2 h-3.5 w-3.5" /><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="relative">Relative</SelectItem>
                <SelectItem value="absolute">Absolute</SelectItem>
                <SelectItem value="recurring">Recurring</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="h-10 w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button variant="ghost" onClick={() => { setSearch(''); setTypeFilter('all'); setStatusFilter('all'); }} className="h-10 gap-2">
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </Button>
            )}
          </div>
        </Card>

        {/* Table */}
        <Card className="rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="w-10 px-3 py-3 text-left"></th>
                  <th className="px-3 py-3 text-left">Name</th>
                  <th className="px-3 py-3 text-left">Type</th>
                  <th className="px-3 py-3 text-left">Date range / logic</th>
                  <th className="px-3 py-3 text-left">Scope</th>
                  <th className="px-3 py-3 text-left">Created by</th>
                  <th className="px-3 py-3 text-left">Status</th>
                  <th className="px-3 py-3 text-left">Color</th>
                  <th className="w-32 px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="px-6 py-16 text-center text-sm text-muted-foreground">Loading…</td></tr>
                ) : pageItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-20 text-center">
                      <Calendar className="mx-auto h-10 w-10 text-primary/40" />
                      <p className="mt-3 text-base font-bold text-foreground">No reference period</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {hasFilters ? 'No match for current filters.' : 'Create your first reference period to start comparing time ranges.'}
                      </p>
                    </td>
                  </tr>
                ) : pageItems.map(p => {
                  const t = classifyType(p);
                  const isPinned = pinned.has(p.id);
                  const isActive = p.enabled !== false;
                  let resolvedLabel: string | null = null;
                  try {
                    const r = resolveReferencePeriodRange(p);
                    resolvedLabel = `${r.from.slice(0,10)} → ${r.to.slice(0,10)}`;
                  } catch { /* ignore */ }
                  return (
                    <tr key={p.id} className="border-t border-border transition-colors hover:bg-muted/40">
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => togglePin(p.id)}
                          className={cn('transition-colors', isPinned ? 'text-amber-500' : 'text-muted-foreground/40 hover:text-amber-500')}
                          aria-label={isPinned ? 'Unpin' : 'Pin'}
                          title={isPinned ? 'Unpin' : 'Pin'}
                        >
                          <Star className={cn('h-4 w-4', isPinned && 'fill-current')} />
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <div className="min-w-0">
                          <p className="truncate font-bold text-foreground">{p.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{p.id}</p>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="outline" className={cn(
                          'text-[10px] uppercase tracking-wider',
                          t === 'relative'  && 'border-sky-300 bg-sky-50 text-sky-700',
                          t === 'absolute'  && 'border-violet-300 bg-violet-50 text-violet-700',
                          t === 'recurring' && 'border-emerald-300 bg-emerald-50 text-emerald-700',
                        )}>
                          {t}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-foreground/90">
                        <div className="text-xs">{ruleSummary(p.rule)}</div>
                        {resolvedLabel && <div className="text-[10px] text-muted-foreground">{resolvedLabel}</div>}
                      </td>
                      <td className="px-3 py-3">
                        {p.isDefault ? (
                          <Badge className="border-primary/30 bg-primary/10 text-primary">
                            <Globe2 className="mr-1 h-3 w-3" /> Global
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            <User className="mr-1 h-3 w-3" /> User
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        <div>{p.createdBy || 'system'}</div>
                        {p.compareMode && p.compareMode !== 'overlay' && (
                          <div className="mt-0.5 inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                            {p.compareMode}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => toggleActive(p)}
                          className={cn(
                            'inline-flex h-6 w-11 items-center rounded-full transition-colors',
                            isActive ? 'bg-emerald-500' : 'bg-muted'
                          )}
                          aria-label={isActive ? 'Deactivate' : 'Activate'}
                          title={isActive ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                        >
                          <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', isActive ? 'translate-x-5' : 'translate-x-1')} />
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <div className="h-5 w-5 rounded-md border border-border" style={{ background: p.color || '#94a3b8' }} title={p.color || 'no color'} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setEditing({ open: true, initial: p })} className="h-8 px-2">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(p)} className="h-8 px-2 text-destructive hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filtered.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
                {pinned.size > 0 && <span className="ml-2"><Pin className="inline h-3 w-3" /> {pinned.size} pinned</span>}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>Prev</Button>
                <span className="min-w-[60px] text-center font-bold text-foreground">{page} / {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <EditDialog
        open={editing.open}
        initial={editing.initial}
        onClose={() => setEditing({ open: false, initial: null })}
        onSaved={handleSaved}
      />
    </div>
  );
};

export default ReferencePeriodManager;
