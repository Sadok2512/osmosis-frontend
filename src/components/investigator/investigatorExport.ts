// ─────────────────────────────────────────────────────────────────────────────
// OSMOSIS Investigator — Export utilities
//
// Three export flavors triggered from the SaveLoad bar (••• menu):
//
//   1. Session JSON  — full workspace context (slots, filters, periods, KPIs,
//                      counters, splits, layout, jalons…) — reloadable later.
//   2. Data CSV ZIP  — scrapes every ECharts instance currently mounted in the
//                      Investigator DOM and dumps each chart series to a CSV
//                      bundled in a single zip archive.
//   3. Visual PDF    — DOM capture (html2canvas → jsPDF) of the main graph
//                      section, with branded header.
// ─────────────────────────────────────────────────────────────────────────────

import * as echarts from 'echarts';
import JSZip from 'jszip';
import { toast } from 'sonner';
import { exportElementToPDF } from '@/lib/exportUtils';

const sanitize = (s: string) =>
  (s || 'investigator')
    .replace(/[^a-z0-9-_]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'investigator';

const stamp = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
};

// ═══ 1. Session JSON ════════════════════════════════════════════════════════
export function exportSessionJSON(name: string, context: unknown) {
  try {
    const payload = {
      kind: 'osmosis-investigator-session',
      version: 1,
      exportedAt: new Date().toISOString(),
      name,
      context,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    triggerDownload(blob, `${sanitize(name)}_${stamp()}.session.json`);
    toast.success('Session exportée (JSON)');
  } catch (err) {
    console.error('[Export] session error', err);
    toast.error('Échec export session');
  }
}

// ═══ 2. Data CSV (ZIP) ══════════════════════════════════════════════════════
type EChartsLike = {
  getDom: () => HTMLElement;
  getOption: () => any;
};

function collectChartInstances(root: HTMLElement): EChartsLike[] {
  // ReactECharts mounts a wrapper div; the actual ECharts root is the one
  // tagged with `_echarts_instance_`.
  const nodes = Array.from(
    root.querySelectorAll<HTMLElement>('[_echarts_instance_]')
  );
  const out: EChartsLike[] = [];
  for (const n of nodes) {
    try {
      const inst = echarts.getInstanceByDom(n) as unknown as EChartsLike | undefined;
      if (inst) out.push(inst);
    } catch {
      /* ignore */
    }
  }
  return out;
}

function chartTitle(opt: any, idx: number): string {
  const t = opt?.title;
  const raw = Array.isArray(t) ? t[0]?.text : t?.text;
  return sanitize(raw || `chart_${idx + 1}`);
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Convert an ECharts option to a wide-format CSV (x ; serie1 ; serie2 …). */
function optionToCsv(opt: any): string {
  const series: any[] = Array.isArray(opt?.series) ? opt.series : [];
  if (series.length === 0) return '';

  // Try to use the categorical X axis labels if present.
  const xAxis = Array.isArray(opt?.xAxis) ? opt.xAxis[0] : opt?.xAxis;
  const xCategories: string[] | null =
    xAxis && Array.isArray(xAxis.data) ? xAxis.data.map(String) : null;

  // Build a row map: key = x value, columns = series names.
  const rowMap = new Map<string, Record<string, unknown>>();
  const seriesNames: string[] = [];

  series.forEach((s, i) => {
    const name = String(s?.name ?? `series_${i + 1}`);
    seriesNames.push(name);
    const data: any[] = Array.isArray(s?.data) ? s.data : [];
    data.forEach((point, idx) => {
      let x: any;
      let y: any;
      if (Array.isArray(point)) {
        x = point[0];
        y = point[1];
      } else if (point && typeof point === 'object') {
        const v = (point as any).value;
        if (Array.isArray(v)) {
          x = v[0];
          y = v[1];
        } else {
          x = (point as any).name ?? idx;
          y = v;
        }
      } else {
        x = xCategories?.[idx] ?? idx;
        y = point;
      }
      const key = String(x);
      if (!rowMap.has(key)) rowMap.set(key, { __x: x });
      rowMap.get(key)![name] = y;
    });
  });

  // Sort rows: try chronological, fallback lexical.
  const rows = Array.from(rowMap.values());
  rows.sort((a, b) => {
    const ax = a.__x;
    const bx = b.__x;
    const an = typeof ax === 'number' ? ax : Date.parse(String(ax));
    const bn = typeof bx === 'number' ? bx : Date.parse(String(bx));
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
    return String(ax).localeCompare(String(bx));
  });

  const header = ['x', ...seriesNames].map(csvEscape).join(',');
  const lines = rows.map(r =>
    [r.__x, ...seriesNames.map(n => r[n])].map(csvEscape).join(',')
  );
  return [header, ...lines].join('\n');
}

export async function exportDataZip(name: string, root: HTMLElement | null) {
  if (!root) {
    toast.error('Aucune zone à exporter');
    return;
  }
  const charts = collectChartInstances(root);
  if (charts.length === 0) {
    toast.error('Aucun graphique à exporter');
    return;
  }

  try {
    const zip = new JSZip();
    let added = 0;
    charts.forEach((c, i) => {
      let opt: any;
      try {
        opt = c.getOption();
      } catch {
        return;
      }
      const csv = optionToCsv(opt);
      if (!csv) return;
      const title = chartTitle(opt, i);
      // Avoid filename collisions.
      let fname = `${String(i + 1).padStart(2, '0')}_${title}.csv`;
      if (zip.file(fname)) fname = `${String(i + 1).padStart(2, '0')}_${title}_${i}.csv`;
      zip.file(fname, csv);
      added += 1;
    });

    if (added === 0) {
      toast.error('Aucune série exploitable trouvée');
      return;
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    triggerDownload(blob, `${sanitize(name)}_${stamp()}.data.zip`);
    toast.success(`Données exportées (${added} graphique${added > 1 ? 's' : ''})`);
  } catch (err) {
    console.error('[Export] data zip error', err);
    toast.error('Échec export données');
  }
}

// ═══ 3. Visual PDF ══════════════════════════════════════════════════════════
export async function exportVisualPDF(name: string, root: HTMLElement | null) {
  if (!root) {
    toast.error('Aucune zone à capturer');
    return;
  }
  try {
    await exportElementToPDF(root, `${sanitize(name)}_${stamp()}`, {
      dashboardName: name || 'OSMOSIS Investigator',
    });
    toast.success('PDF généré');
  } catch (err) {
    console.error('[Export] PDF error', err);
    toast.error('Échec export PDF');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
