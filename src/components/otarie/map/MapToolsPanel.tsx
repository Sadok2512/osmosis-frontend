import React from 'react';
import { MapPin, Link2, Ruler, Circle, Pentagon, X, RotateCcw } from 'lucide-react';
import { MapToolType, RING_PRESETS } from './MapToolsTypes';

interface MapToolsPanelProps {
  activeTool: MapToolType;
  onSelectTool: (tool: MapToolType) => void;
  onClear: () => void;
  pointCreationMode: boolean;
  onTogglePointMode: () => void;
  linkCreationMode: boolean;
  onToggleLinkMode: () => void;
  canCreateLink: boolean;
  ringPresetIndex: number;
  onRingPresetChange: (idx: number) => void;
  distanceText?: string;
  polygonInfo?: { perimeter: string; area: string };
}

const TOOLS: { id: MapToolType; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'point', label: 'Point', icon: <MapPin size={14} />, color: 'text-violet-500' },
  { id: 'link', label: 'Lien', icon: <Link2 size={14} />, color: 'text-primary' },
  { id: 'distance', label: 'Distance', icon: <Ruler size={14} />, color: 'text-amber-500' },
  { id: 'rings', label: 'Cercles', icon: <Circle size={14} />, color: 'text-cyan-500' },
  { id: 'polygon', label: 'Zone', icon: <Pentagon size={14} />, color: 'text-emerald-500' },
];

export const MapToolsPanel: React.FC<MapToolsPanelProps> = ({
  activeTool,
  onSelectTool,
  onClear,
  pointCreationMode,
  onTogglePointMode,
  linkCreationMode,
  onToggleLinkMode,
  canCreateLink,
  ringPresetIndex,
  onRingPresetChange,
  distanceText,
  polygonInfo,
}) => {
  const handleToolClick = (toolId: MapToolType) => {
    if (toolId === 'point') {
      onTogglePointMode();
      return;
    }
    if (toolId === 'link') {
      onToggleLinkMode();
      return;
    }
    onSelectTool(activeTool === toolId ? 'none' : toolId);
  };

  const isActive = (id: MapToolType) => {
    if (id === 'point') return pointCreationMode;
    if (id === 'link') return linkCreationMode;
    return activeTool === id;
  };

  const isDisabled = (id: MapToolType) => {
    if (id === 'link') return !canCreateLink;
    return false;
  };

  return (
    <div className="flex flex-col gap-1.5">
      {/* Tool buttons row */}
      <div className="flex items-center gap-1">
        {TOOLS.map(t => (
          <button
            key={t.id}
            onClick={() => handleToolClick(t.id)}
            disabled={isDisabled(t.id)}
            title={t.label}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
              isActive(t.id)
                ? `bg-primary/15 ${t.color} ring-1 ring-primary/30`
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            } disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
        {activeTool !== 'none' && (
          <button
            onClick={onClear}
            title="Effacer"
            className="ml-auto flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold text-destructive hover:bg-destructive/10 transition-colors"
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>

      {/* Contextual info */}
      {activeTool === 'rings' && (
        <div className="flex items-center gap-1 pl-1">
          {RING_PRESETS.map((p, i) => (
            <button
              key={i}
              onClick={() => onRingPresetChange(i)}
              className={`px-2 py-0.5 rounded text-[9px] font-semibold transition-colors ${
                i === ringPresetIndex
                  ? 'bg-cyan-500/20 text-cyan-600'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {distanceText && activeTool === 'distance' && (
        <div className="pl-1 text-[10px] font-mono font-semibold text-amber-600">
          📏 {distanceText}
        </div>
      )}

      {polygonInfo && activeTool === 'polygon' && (
        <div className="pl-1 text-[10px] font-mono font-semibold text-emerald-600">
          📐 P: {polygonInfo.perimeter} · A: {polygonInfo.area}
        </div>
      )}
    </div>
  );
};
