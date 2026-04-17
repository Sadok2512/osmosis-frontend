import { ArrowUpRight, Activity, Clock, Zap, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { KPI } from '../types';

interface KPICardProps {
  kpi: KPI;
  className?: string;
}

export default function KPICard({ kpi, className }: KPICardProps) {
  const isOptimal = kpi.status === 'optimal';
  const isWarning = kpi.status === 'warning';

  return (
    <div className={cn(
      "relative overflow-hidden bg-surface-container-lowest p-8 rounded-2xl border border-outline-variant/10 shadow-sm group hover:shadow-lg transition-all",
      className,
    )}>
      <div className="relative z-10">
        <div className="flex justify-between items-start mb-6">
          <h3 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest font-headline">{kpi.label}</h3>
          <div className={cn(
            "w-2.5 h-2.5 rounded-full shadow-sm",
            isOptimal ? "bg-primary shadow-primary/40" : isWarning ? "bg-tertiary" : "bg-error"
          )} />
        </div>
        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-5xl font-black font-headline tracking-tighter text-on-surface">{kpi.value}</span>
          {kpi.unit && <span className="text-sm text-on-surface-variant font-bold">{kpi.unit}</span>}
        </div>
        <div className="flex justify-between items-center">
          {kpi.trend && (
            <div className="flex items-center gap-1 text-xs font-bold text-primary">
              <ArrowUpRight className="w-3.5 h-3.5" />
              {kpi.trend}
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full",
              isOptimal ? "bg-primary" : isWarning ? "bg-tertiary" : "bg-error"
            )} />
            <span className="text-sm font-bold font-headline capitalize">{kpi.status}</span>
          </div>
        </div>
      </div>
      <div className={cn(
        "absolute -right-8 -bottom-8 w-48 h-48 opacity-5 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700",
        isOptimal ? "bg-primary" : isWarning ? "bg-tertiary" : "bg-error"
      )} />
    </div>
  );
}
