/**
 * Standard color palette displayed below color pickers across Precision Architect.
 * Click a swatch to apply it instantly. Used in EditorSidebar, PremiumWidgetSettingsPanel,
 * ChartSettingsPanel, etc. — anywhere a `<input type="color">` appears.
 */
export const STANDARD_COLORS: { name: string; value: string }[] = [
  // Brand
  { name: 'Brand Primary', value: '#00685f' },
  { name: 'Brand Accent', value: '#6bd8cb' },
  // Neutrals
  { name: 'Black', value: '#000000' },
  { name: 'Slate', value: '#0f172a' },
  { name: 'Charcoal', value: '#1f2937' },
  { name: 'Graphite', value: '#374151' },
  { name: 'Gray', value: '#6b7280' },
  { name: 'Silver', value: '#9ca3af' },
  { name: 'Mist', value: '#d1d5db' },
  { name: 'Cloud', value: '#f3f4f6' },
  { name: 'White', value: '#ffffff' },
  // Reds / Oranges
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Yellow', value: '#eab308' },
  // Greens
  { name: 'Lime', value: '#84cc16' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Teal', value: '#14b8a6' },
  // Blues / Purples
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Sky', value: '#0ea5e9' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Fuchsia', value: '#d946ef' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Rose', value: '#f43f5e' },
];

interface Props {
  value?: string;
  onChange: (color: string) => void;
  /** Compact mode renders smaller swatches, useful inside dense panels. */
  compact?: boolean;
}

/**
 * Renders a horizontal wrap-grid of standard color swatches.
 * The currently-selected swatch (case-insensitive hex match) is highlighted with a ring.
 */
export default function ColorSwatchPalette({ value, onChange, compact = false }: Props) {
  const normalized = (value ?? '').toLowerCase();
  const sizeClass = compact ? 'w-4 h-4' : 'w-5 h-5';
  const gapClass = compact ? 'gap-1' : 'gap-1.5';

  return (
    <div className={`flex flex-wrap ${gapClass} mt-1.5`}>
      {STANDARD_COLORS.map((c) => {
        const selected = c.value.toLowerCase() === normalized;
        return (
          <button
            key={c.value}
            type="button"
            title={`${c.name} · ${c.value}`}
            onClick={() => onChange(c.value)}
            className={`${sizeClass} rounded-md border border-black/10 cursor-pointer transition-transform hover:scale-110 active:scale-95 ${
              selected ? 'ring-2 ring-primary ring-offset-1' : ''
            }`}
            style={{ backgroundColor: c.value }}
            aria-label={c.name}
          />
        );
      })}
    </div>
  );
}
