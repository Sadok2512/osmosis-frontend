import { NodeData } from '../types';
import { cn } from '@/lib/utils';

interface TableWidgetProps {
  title: string;
  data: NodeData[];
}

export default function TableWidget({ title, data }: TableWidgetProps) {
  return (
    <div className="bg-surface-container-lowest p-8 rounded-lg border border-outline-variant/10 shadow-sm flex flex-col h-full">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold font-headline text-on-surface">{title}</h3>
        <span className="text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/5 px-2 py-1 rounded">Live Data</span>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider border-b border-surface-container">
              <th className="pb-3 px-2">Node ID</th>
              <th className="pb-3 px-2 text-right">Load</th>
              <th className="pb-3 px-2 text-right">Throughput</th>
              <th className="pb-3 px-2 text-right">Health</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container">
            {data.map((node) => (
              <tr key={node.id} className="hover:bg-surface-container-low transition-colors group">
                <td className="py-4 px-2 font-medium text-sm text-on-surface">{node.id}</td>
                <td className="py-4 px-2 text-right font-headline font-bold text-sm text-on-surface">{node.load}%</td>
                <td className="py-4 px-2 text-right text-xs text-on-surface-variant">{node.throughput}</td>
                <td className="py-4 px-2 text-right">
                  <div className={cn(
                    "w-2 h-2 rounded-full inline-block",
                    node.health === 'optimal' ? "bg-primary" : node.health === 'warning' ? "bg-tertiary" : "bg-error"
                  )} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button className="mt-6 w-full py-3 bg-surface-container-high rounded-xl text-xs font-bold uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-highest transition-all active:scale-95">
        View All Connections
      </button>
    </div>
  );
}
