import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, Check, Filter, Radio, Cpu, Layers, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchKpiCatalog } from '@/components/kpi-monitor/api/kpiMonitorApi';

interface FilterSidebarProps {
  filters: Record<string, string[]>;
  onFilterChange: (filters: Record<string, string[]>) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

interface FilterSection {
  id: string;
  label: string;
  icon: React.ElementType;
  options: string[];
}

const STATIC_SECTIONS: Omit<FilterSection, 'options'>[] = [
  { id: 'KPI_TYPE', label: 'KPI Type', icon: Tag },
  { id: 'VENDOR', label: 'Vendor', icon: Cpu },
  { id: 'TECHNO', label: 'Technology', icon: Radio },
  { id: 'CATEGORY', label: 'Category', icon: Layers },
];

const KPI_TYPE_OPTIONS = ['Normalized', 'Raw'];
const VENDOR_OPTIONS = ['Nokia', 'Huawei', 'Ericsson'];
const TECHNO_OPTIONS = ['LTE', 'NR'];

const InvestigatorFilterSidebar: React.FC<FilterSidebarProps> = ({
  filters,
  onFilterChange,
  collapsed,
  onToggleCollapse,
}) => {
  const [categories, setCategories] = useState<string[]>([]);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    KPI_TYPE: true,
    VENDOR: true,
    TECHNO: true,
    CATEGORY: true,
  });

  useEffect(() => {
    fetchKpiCatalog()
      .then((data) => {
        const cats = [...new Set(data.map((k: any) => k.category).filter(Boolean))].sort() as string[];
        setCategories(cats);
      })
      .catch(() => setCategories(['Access', 'Retainability', 'Throughput', 'Traffic', 'TCP', 'Other']));
  }, []);

  const getOptions = (sectionId: string): string[] => {
    switch (sectionId) {
      case 'KPI_TYPE': return KPI_TYPE_OPTIONS;
      case 'VENDOR': return VENDOR_OPTIONS;
      case 'TECHNO': return TECHNO_OPTIONS;
      case 'CATEGORY': return categories;
      default: return [];
    }
  };

  const toggleValue = (sectionId: string, value: string) => {
    const current = filters[sectionId] || [];
    const exists = current.includes(value);
    const updated = exists ? current.filter((v) => v !== value) : [...current, value];
    const newFilters = { ...filters };
    if (updated.length === 0) {
      delete newFilters[sectionId];
    } else {
      newFilters[sectionId] = updated;
    }
    onFilterChange(newFilters);
  };

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const activeCount = Object.values(filters).reduce((sum, vals) => sum + vals.length, 0);

  if (collapsed) {
    return (
      <div className="relative flex flex-col items-center w-[44px] bg-card border-r border-border shrink-0">
        <button
          onClick={onToggleCollapse}
          className="mt-3 p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
          title="Expand filters"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="mt-4 flex flex-col items-center gap-3">
          <Filter className="w-4 h-4 text-primary" />
          {activeCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </div>
        {STATIC_SECTIONS.map((s) => {
          const Icon = s.icon;
          const hasActive = (filters[s.id] || []).length > 0;
          return (
            <button
              key={s.id}
              onClick={onToggleCollapse}
              className={cn(
                'mt-2 p-1.5 rounded-lg transition-colors',
                hasActive ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
              title={s.label}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="relative flex flex-col w-[220px] bg-card border-r border-border shrink-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-primary" />
          <span className="text-[11px] font-bold text-foreground uppercase tracking-wider">Filters</span>
          {activeCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </div>
        <button
          onClick={onToggleCollapse}
          className="p-1 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Filter Sections */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 scrollbar-hide">
        {STATIC_SECTIONS.map((section) => {
          const Icon = section.icon;
          const options = getOptions(section.id);
          const selected = filters[section.id] || [];
          const isExpanded = expandedSections[section.id];

          return (
            <div key={section.id} className="rounded-lg border border-border/40 bg-muted/20 overflow-hidden">
              {/* Section header */}
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center justify-between px-2.5 py-2 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Icon className={cn('w-3.5 h-3.5', selected.length > 0 ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="text-[10px] font-bold text-foreground uppercase tracking-wider">{section.label}</span>
                  {selected.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[8px] font-bold">
                      {selected.length}
                    </span>
                  )}
                </div>
                <ChevronDown className={cn('w-3 h-3 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
              </button>

              {/* Options */}
              {isExpanded && (
                <div className="px-1.5 pb-2 space-y-0.5">
                  {options.length === 0 ? (
                    <div className="px-2 py-1.5 text-[9px] text-muted-foreground animate-pulse">Loading...</div>
                  ) : (
                    options.map((opt) => {
                      const isSelected = selected.includes(opt);
                      return (
                        <button
                          key={opt}
                          onClick={() => toggleValue(section.id, opt)}
                          className={cn(
                            'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[10px] font-medium transition-all',
                            isSelected
                              ? 'bg-primary/10 text-primary'
                              : 'text-foreground hover:bg-muted/50'
                          )}
                        >
                          <div
                            className={cn(
                              'w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0',
                              isSelected ? 'bg-primary border-primary' : 'border-border'
                            )}
                          >
                            {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                          </div>
                          <span className="truncate">{opt}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Clear all */}
      {activeCount > 0 && (
        <div className="px-3 py-2 border-t border-border">
          <button
            onClick={() => onFilterChange({})}
            className="w-full text-[10px] font-bold text-destructive hover:bg-destructive/10 py-1.5 rounded-md transition-colors"
          >
            Clear All Filters
          </button>
        </div>
      )}
    </div>
  );
};

export default InvestigatorFilterSidebar;
