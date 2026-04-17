import { Eye, Edit3, Play } from 'lucide-react';
import { ViewMode } from '../types';
import { cn } from '@/lib/utils';
import KPICard from './KPICard';
import MapWidget from './MapWidget';
import TableWidget from './TableWidget';
import { KPI, NodeData } from '../types';

interface ViewerProps {
  projectName: string;
  onViewModeChange: (mode: ViewMode) => void;
}

const KPIS: KPI[] = [
  { label: 'Accessibility', value: '98.2', unit: '%', trend: '+0.4%', status: 'optimal', color: 'primary' },
  { label: 'Retainability', value: '99.1', unit: '%', trend: '+0.1%', status: 'optimal', color: 'primary' },
  { label: 'Latency', value: '12', unit: 'ms', trend: '-2ms', status: 'optimal', color: 'primary' },
  { label: 'Error Rate', value: '0.42', unit: '%', trend: '+0.1%', status: 'warning', color: 'tertiary' },
];

const NODES: NodeData[] = [
  { id: 'NODE-FRA-A1', load: 78, throughput: '412.5 Gb/s', health: 'optimal' },
  { id: 'NODE-LON-B2', load: 92, throughput: '380.1 Gb/s', health: 'warning' },
  { id: 'NODE-PAR-C3', load: 64, throughput: '298.7 Gb/s', health: 'optimal' },
  { id: 'NODE-AMS-D4', load: 41, throughput: '180.4 Gb/s', health: 'optimal' },
  { id: 'NODE-MAD-E5', load: 88, throughput: '350.2 Gb/s', health: 'critical' },
];

export default function ViewerView({ projectName, onViewModeChange }: ViewerProps) {
  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <header className="bg-white/80 backdrop-blur-xl sticky top-0 z-50 flex justify-between items-center w-full px-8 py-4 border-b border-outline-variant/10">
        <div className="flex items-center gap-6">
          <span className="text-xl font-bold text-primary font-headline tracking-tight">Precision Architect</span>
          <div className="h-6 w-px bg-outline-variant/30" />
          <h1 className="font-headline font-bold text-on-surface text-lg">{projectName}</h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-surface-container-high p-1 rounded-full flex items-center shadow-inner">
            <button
              onClick={() => onViewModeChange('edit')}
              className="px-4 py-1.5 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-2"
            >
              <Edit3 className="w-3.5 h-3.5" /> Edit
            </button>
            <button className="px-4 py-1.5 text-sm font-bold bg-white shadow-sm rounded-full text-primary flex items-center gap-2">
              <Eye className="w-3.5 h-3.5" /> View
            </button>
            <button
              onClick={() => onViewModeChange('presentation')}
              className="px-4 py-1.5 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-2"
            >
              <Play className="w-3.5 h-3.5" /> Present
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-8 space-y-6">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-2">Network Health · Live</p>
          <h2 className="text-4xl font-black font-headline tracking-tighter">Operational Overview</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {KPIS.map((k) => <KPICard key={k.label} kpi={k} />)}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <MapWidget
              title="Cluster Distribution"
              clusters={[
                { name: 'EU-West', status: 'optimal', label: '24 nodes' },
                { name: 'US-East', status: 'warning', label: '18 nodes' },
                { name: 'APAC', status: 'critical', label: '12 nodes' },
              ]}
            />
          </div>
          <div>
            <TableWidget title="Top Nodes" data={NODES} />
          </div>
        </div>
      </main>
    </div>
  );
}
