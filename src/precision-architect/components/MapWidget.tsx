import { Plus, Minus, LocateFixed } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MapWidgetProps {
  title: string;
  clusters: {
    name: string;
    status: 'optimal' | 'warning' | 'critical';
    label: string;
  }[];
}

export default function MapWidget({ title, clusters }: MapWidgetProps) {
  return (
    <div className="bg-surface-container-low rounded-lg overflow-hidden relative min-h-[450px] border border-outline-variant/10 shadow-sm">
      <div className="absolute inset-0 z-0">
        <img
          alt="Network Map"
          className="w-full h-full object-cover opacity-40 mix-blend-multiply"
          referrerPolicy="no-referrer"
          src="https://picsum.photos/seed/network-map/1200/800?blur=2"
        />
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
          <circle cx="20%" cy="30%" r="4" fill="#00685f" />
          <circle cx="70%" cy="20%" r="4" fill="#ba1a1a" />
          <circle cx="50%" cy="60%" r="4" fill="#924628" />
          <path d="M 20% 30% L 50% 60% L 70% 20%" stroke="#00685f" fill="none" strokeWidth="2" strokeDasharray="4" />
        </svg>
      </div>

      <div className="absolute top-6 left-6 z-10 glass-panel p-6 rounded-lg w-64">
        <h3 className="text-sm font-bold font-headline mb-4 text-on-surface">{title}</h3>
        <div className="space-y-4">
          {clusters.map((cluster) => (
            <div key={cluster.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "w-2 h-2 rounded-full",
                  cluster.status === 'optimal' ? "bg-primary animate-pulse" :
                  cluster.status === 'warning' ? "bg-tertiary" : "bg-error"
                )} />
                <span className="text-xs font-medium text-on-surface">{cluster.name}</span>
              </div>
              <span className="text-xs font-bold text-on-surface-variant">{cluster.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-6 right-6 z-10 flex flex-col gap-2">
        <button className="p-2 bg-white rounded-lg shadow-md hover:bg-surface transition-colors">
          <Plus className="w-5 h-5 text-on-surface-variant" />
        </button>
        <button className="p-2 bg-white rounded-lg shadow-md hover:bg-surface transition-colors">
          <Minus className="w-5 h-5 text-on-surface-variant" />
        </button>
        <button className="p-2 bg-white rounded-lg shadow-md hover:bg-surface transition-colors mt-2">
          <LocateFixed className="w-5 h-5 text-on-surface-variant" />
        </button>
      </div>
    </div>
  );
}
