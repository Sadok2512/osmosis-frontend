import React from 'react';
import { Box } from 'lucide-react';

interface Map3DToggleProps {
  is3D: boolean;
  onToggle: () => void;
}

const Map3DToggle: React.FC<Map3DToggleProps> = ({ is3D, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    className={`w-10 h-10 flex items-center justify-center gap-0.5 text-[10px] font-black tracking-wider transition-all ${
      is3D
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
    }`}
    title={is3D ? 'Retour vue 2D' : 'Vue 3D'}
    aria-pressed={is3D}
  >
    <Box size={12} strokeWidth={2.4} />
    <span>3D</span>
  </button>
);

export default Map3DToggle;
