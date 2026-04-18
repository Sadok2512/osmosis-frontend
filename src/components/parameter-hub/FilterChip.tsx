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
  neutral:
    'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50 shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
  primary:
    'bg-teal-50 text-teal-800 border-teal-200/80 hover:bg-teal-100/70 shadow-[0_1px_2px_rgba(14,124,102,0.06)]',
  accent:
    'bg-slate-900 text-white border-slate-900 hover:bg-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.12)]',
};

export const FilterChip: React.FC<FilterChipProps> = ({
  label,
  values,
  onClick,
  onClear,
  tone = 'neutral',
  icon,
}) => {
  const active = values.length > 0;
  const summary =
    values.length === 0 ? 'Any' : values.length === 1 ? values[0] : `${values.length} selected`;
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 h-9 pl-3.5 pr-2.5 rounded-full border text-[12.5px] font-medium transition-all duration-150',
        TONE[tone],
        active && tone === 'neutral' && 'border-teal-300 bg-teal-50/60 text-teal-800',
      )}
    >
      {icon && <span className="opacity-70 flex items-center">{icon}</span>}
      <button onClick={onClick} className="flex items-center gap-1.5 cursor-pointer">
        <span className="opacity-60">{label}</span>
        <span className="opacity-30">·</span>
        <span className="font-semibold max-w-[160px] truncate" title={values.join(', ')}>
          {summary}
        </span>
      </button>
      {onClear && active && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="ml-0.5 w-5 h-5 rounded-full hover:bg-slate-900/10 flex items-center justify-center transition-colors"
          aria-label={`Clear ${label}`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};

export default FilterChip;
