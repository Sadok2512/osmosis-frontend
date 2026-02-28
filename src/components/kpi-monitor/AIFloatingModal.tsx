import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Maximize2, GripHorizontal } from 'lucide-react';
import KPIMonitorAIPanel from './KPIMonitorAIPanel';

interface AIFloatingModalProps {
  open: boolean;
  onClose: () => void;
}

const AIFloatingModal: React.FC<AIFloatingModalProps> = ({ open, onClose }) => {
  const [pos, setPos] = useState({ x: window.innerWidth - 420, y: 80 });
  const [size, setSize] = useState({ w: 400, h: 520 });
  const [minimized, setMinimized] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    setDragging(true);
  }, [pos]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - size.w, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragOffset.current.y)),
      });
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging, size.w]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed z-[9998] shadow-2xl rounded-2xl border border-border overflow-hidden flex flex-col bg-card"
      style={{
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: minimized ? 44 : size.h,
        transition: dragging ? 'none' : 'height 0.2s ease',
      }}
    >
      {/* Drag handle header */}
      <div
        onMouseDown={onMouseDown}
        className="flex items-center justify-between px-3 py-2 bg-card border-b border-border cursor-move shrink-0 select-none"
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="w-3.5 h-3.5 text-muted-foreground/50" />
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">QOEBIT AI</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setMinimized(!minimized)} className="p-1 rounded hover:bg-muted transition-colors">
            {minimized ? <Maximize2 className="w-3 h-3 text-muted-foreground" /> : <Minus className="w-3 h-3 text-muted-foreground" />}
          </button>
        </div>
      </div>
      {/* Body */}
      {!minimized && (
        <div className="flex-1 overflow-hidden">
          <KPIMonitorAIPanel onClose={onClose} />
        </div>
      )}
    </div>,
    document.body
  );
};

export default AIFloatingModal;
