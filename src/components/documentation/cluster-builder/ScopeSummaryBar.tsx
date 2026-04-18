import React from 'react';
import { Radio, Loader2, AlertTriangle, CloudOff } from 'lucide-react';

interface ScopeSummaryBarProps {
  conditionCount: number;
  loading: boolean;
  cells?: number;
  sites?: number;
  variant?: 'sticky' | 'inline';
  error?: boolean;
}

const ScopeSummaryBar: React.FC<ScopeSummaryBarProps> = ({
  conditionCount,
  loading,
  cells,
  sites,
  variant = 'sticky',
  error = false,
}) => {
  const empty = !loading && !error && cells === 0 && sites === 0;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${
        error
          ? 'border-destructive/30 bg-destructive/5'
          : empty
            ? 'border-amber-300 bg-amber-50'
            : 'border-primary/20 bg-primary/5'
      } ${variant === 'sticky' ? 'sticky top-0 z-10 backdrop-blur-sm' : ''}`}
    >
      {error ? (
        <CloudOff className="w-4 h-4 text-destructive shrink-0" />
      ) : empty ? (
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
      ) : (
        <Radio className="w-4 h-4 text-primary shrink-0" />
      )}

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <span className="text-muted-foreground">
          <strong className="text-foreground">{conditionCount}</strong> topology filter{conditionCount !== 1 ? 's' : ''}
        </span>
        <span className="text-muted-foreground/40">·</span>
        {loading ? (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> Computing scope…
          </span>
        ) : error ? (
          <span className="text-destructive font-semibold">
            Backend unavailable — scope cannot be computed right now. You can still continue.
          </span>
        ) : cells != null && sites != null ? (
          <>
            <span className="text-foreground">
              <strong className="text-primary">{cells.toLocaleString('fr-FR')}</strong> cells
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-foreground">
              <strong className="text-primary">{sites.toLocaleString('fr-FR')}</strong> sites
            </span>
            {empty && (
              <span className="text-amber-700 font-semibold ml-1">
                — no matches, please revise filters
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground italic">Add a topology filter to compute scope</span>
        )}
      </div>
    </div>
  );
};

export default ScopeSummaryBar;
