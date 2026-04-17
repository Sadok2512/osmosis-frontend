import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilterChipProps {
  label: string;
  values: string[];
  onClick?: () => void;
  onClear?: () => void;
  tone?: 'neutral' | 'primary' | 'accent';
  icon?: React.ReactNode;
}

const TONE: Record<NonNullable<FilterChipProps['tone']>, string> = {
  neutral: 'bg-muted/60 text-foreground border-border hover:bg-muted',
  primary: 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/15',
  accent: 'bg-accent/40 text-accent-foreground border-accent hover:bg-accent/60',
};

export const FilterChip: React.FC<FilterChipProps> = ({
  label,
  values,
  onClick,
  onClear,
  tone = 'neutral',
  icon,
}) => {
  const summary =
    values.length === 0 ? 'Any' : values.length === 1 ? values[0] : `${values.length} selected`;
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-medium transition-colors',
        TONE[tone],
      )}
    >
      {icon && <span className="opacity-70">{icon}</span>}
      <button onClick={onClick} className="flex items-center gap-1.5 cursor-pointer">
        <span className="opacity-70">{label}:</span>
        <span className="font-semibold max-w-[160px] truncate" title={values.join(', ')}>
          {summary}
        </span>
      </button>
      {onClear && values.length > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="ml-0.5 -mr-1 w-4 h-4 rounded-full hover:bg-foreground/10 flex items-center justify-center"
          aria-label={`Clear ${label}`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};

export default FilterChip;
