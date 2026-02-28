import React from 'react';
import { X } from 'lucide-react';
import KPIMonitorAIPanel from './KPIMonitorAIPanel';
import { cn } from '@/lib/utils';

interface AIFloatingModalProps {
  open: boolean;
  onClose: () => void;
}

const AIFloatingModal: React.FC<AIFloatingModalProps> = ({ open, onClose }) => {
  return (
    <div
      className={cn(
        'fixed top-0 right-0 h-full w-[400px] z-[9998] flex flex-col bg-card border-l border-border shadow-[-4px_0_24px_rgba(0,0,0,0.08)]',
        'transition-transform duration-250 ease-out',
        open ? 'translate-x-0' : 'translate-x-full'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 shrink-0">
        <span className="text-xs font-bold text-foreground uppercase tracking-wider">QOEBIT AI</span>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {open && <KPIMonitorAIPanel onClose={onClose} />}
      </div>
    </div>
  );
};

export default AIFloatingModal;
