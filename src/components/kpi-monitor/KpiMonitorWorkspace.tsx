import React, { useEffect, useState } from 'react';
import { BarChart3, BookOpenText } from 'lucide-react';
import { cn } from '@/lib/utils';
import KPIMonitorPage from './KPIMonitorPage';
import KpiReferenceWorkspace from './KpiReferenceWorkspace';

type WorkspaceTab = 'dashboard' | 'reference';
const STORAGE_KEY = 'osmosis_kpi_monitor_workspace_v1';

const KpiMonitorWorkspace: React.FC = () => {
  const [tab, setTab] = useState<WorkspaceTab>('reference');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, tab);
  }, [tab]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="border-b border-border bg-card/95 px-6 py-3 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-3">
          {[
            {
              id: 'reference' as const,
              label: 'KPI Reference',
              description: 'Référentiel KPI Réseau',
              icon: <BookOpenText className="h-4 w-4" />,
            },
            {
              id: 'dashboard' as const,
              label: 'KPI Dashboards',
              description: 'Monitor and widget canvas',
              icon: <BarChart3 className="h-4 w-4" />,
            },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                'flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all',
                tab === item.id
                  ? 'border-primary/30 bg-primary/8 text-primary shadow-sm'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/20 hover:text-foreground'
              )}
            >
              <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', tab === item.id ? 'bg-primary/10' : 'bg-muted/60')}>
                {item.icon}
              </span>
              <span>
                <span className="block text-xs font-black uppercase tracking-[0.14em]">{item.label}</span>
                <span className="mt-1 block text-[11px] font-medium opacity-80">{item.description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === 'reference' ? <KpiReferenceWorkspace /> : <KPIMonitorPage />}
      </div>
    </div>
  );
};

export default KpiMonitorWorkspace;