import { Trash2 } from 'lucide-react';
import { PASection } from '../types';
import { cn } from '@/lib/utils';

interface Props {
  section: PASection;
  editable: boolean;
  isActive?: boolean;
  onChange?: (patch: Partial<PASection>) => void;
  onRemove?: () => void;
}

/**
 * Editable text section. Displayed inline in the canvas and anchored
 * via id={`section-${section.id}`} so the sidebar can scroll to it.
 */
export default function SectionBlock({ section, editable, isActive, onChange, onRemove }: Props) {
  return (
    <section
      id={`section-${section.id}`}
      className={cn(
        "scroll-mt-24 bg-white rounded-2xl border p-6 shadow-sm transition-colors",
        isActive ? "border-primary/40 ring-1 ring-primary/20" : "border-outline-variant/10"
      )}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">
            {editable ? (
              <input
                value={section.name}
                onChange={(e) => onChange?.({ name: e.target.value })}
                placeholder="Section name"
                className="bg-transparent w-full border-none focus:outline-none focus:ring-0 p-0 text-[10px] font-black uppercase tracking-widest text-primary placeholder:text-primary/40"
              />
            ) : (
              section.name
            )}
          </p>
          {editable ? (
            <input
              value={section.title}
              onChange={(e) => onChange?.({ title: e.target.value })}
              placeholder="Add title"
              className="bg-transparent w-full border-none focus:outline-none focus:ring-0 p-0 text-2xl font-black font-headline tracking-tight text-on-surface placeholder:text-on-surface-variant/40"
            />
          ) : (
            <h3 className="text-2xl font-black font-headline tracking-tight text-on-surface">
              {section.title || section.name}
            </h3>
          )}
        </div>
        {editable && onRemove && (
          <button
            onClick={onRemove}
            className="shrink-0 p-2 text-on-surface-variant hover:text-error hover:bg-error/10 rounded-lg transition-colors"
            aria-label="Remove section"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {editable ? (
        <textarea
          value={section.description}
          onChange={(e) => onChange?.({ description: e.target.value })}
          placeholder="Add description, message or notes…"
          rows={3}
          className="w-full bg-surface-container-low/40 rounded-xl border border-outline-variant/10 focus:border-primary/40 focus:outline-none focus:ring-0 p-3 text-sm text-on-surface placeholder:text-on-surface-variant/50 resize-y leading-relaxed"
        />
      ) : (
        section.description ? (
          <p className="text-sm text-on-surface-variant whitespace-pre-wrap leading-relaxed">
            {section.description}
          </p>
        ) : null
      )}
    </section>
  );
}
