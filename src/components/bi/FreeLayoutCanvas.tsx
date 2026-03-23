import React, { useState, useRef, useCallback, useEffect } from 'react';

const SNAP_THRESHOLD = 6;
const MIN_WIDTH = 180;
const MIN_HEIGHT = 120;

interface FreeRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface GuideLine {
  orientation: 'h' | 'v';
  position: number;
}

interface FreeLayoutCanvasProps {
  items: FreeRect[];
  onLayoutChange: (id: string, rect: Partial<FreeRect>) => void;
  children: React.ReactNode;
  allowOverlap?: boolean;
  editable?: boolean;
}

/** Collect all edge positions from sibling rects */
function getSiblingEdges(rects: FreeRect[], excludeId: string) {
  const hEdges: number[] = [];
  const vEdges: number[] = [];
  for (const r of rects) {
    if (r.id === excludeId) continue;
    hEdges.push(r.y, r.y + r.h, r.y + r.h / 2);
    vEdges.push(r.x, r.x + r.w, r.x + r.w / 2);
  }
  return { hEdges, vEdges };
}

/** Snap a value to the nearest edge if within threshold */
function snapTo(val: number, edges: number[]): { snapped: number; guide: number | null } {
  let best: number | null = null;
  let bestDist = SNAP_THRESHOLD + 1;
  for (const e of edges) {
    const d = Math.abs(val - e);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return best !== null ? { snapped: best, guide: best } : { snapped: val, guide: null };
}

const FreeLayoutCanvas: React.FC<FreeLayoutCanvasProps> = ({ items, onLayoutChange, children, allowOverlap = false, editable = true }) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [guides, setGuides] = useState<GuideLine[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [interactionType, setInteractionType] = useState<'drag' | 'resize' | null>(null);
  const [resizeCorner, setResizeCorner] = useState<string | null>(null);
  const dragStart = useRef<{ mx: number; my: number; rect: FreeRect } | null>(null);

  const clearGuides = useCallback(() => setGuides([]), []);

  const handleDragStart = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = items.find(i => i.id === id);
    if (!rect) return;
    dragStart.current = { mx: e.clientX, my: e.clientY, rect: { ...rect } };
    setActiveId(id);
    setInteractionType('drag');
  }, [items]);

  const handleResizeStart = useCallback((e: React.MouseEvent, id: string, corner: string) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = items.find(i => i.id === id);
    if (!rect) return;
    dragStart.current = { mx: e.clientX, my: e.clientY, rect: { ...rect } };
    setActiveId(id);
    setInteractionType('resize');
    setResizeCorner(corner);
  }, [items]);

  useEffect(() => {
    if (!activeId || !interactionType) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStart.current || !canvasRef.current) return;
      const { mx, my, rect } = dragStart.current;
      const dx = e.clientX - mx;
      const dy = e.clientY - my;
      const { hEdges, vEdges } = getSiblingEdges(items, activeId);
      const newGuides: GuideLine[] = [];

      if (interactionType === 'drag') {
        let newX = rect.x + dx;
        let newY = rect.y + dy;

        // Snap all edges of the dragged widget
        const leftSnap = snapTo(newX, vEdges);
        const rightSnap = snapTo(newX + rect.w, vEdges);
        const centerXSnap = snapTo(newX + rect.w / 2, vEdges);
        const topSnap = snapTo(newY, hEdges);
        const bottomSnap = snapTo(newY + rect.h, hEdges);
        const centerYSnap = snapTo(newY + rect.h / 2, hEdges);

        // Pick best vertical snap
        if (leftSnap.guide !== null) { newX = leftSnap.snapped; newGuides.push({ orientation: 'v', position: leftSnap.guide }); }
        else if (rightSnap.guide !== null) { newX = rightSnap.snapped - rect.w; newGuides.push({ orientation: 'v', position: rightSnap.guide }); }
        else if (centerXSnap.guide !== null) { newX = centerXSnap.snapped - rect.w / 2; newGuides.push({ orientation: 'v', position: centerXSnap.guide }); }

        // Pick best horizontal snap
        if (topSnap.guide !== null) { newY = topSnap.snapped; newGuides.push({ orientation: 'h', position: topSnap.guide }); }
        else if (bottomSnap.guide !== null) { newY = bottomSnap.snapped - rect.h; newGuides.push({ orientation: 'h', position: bottomSnap.guide }); }
        else if (centerYSnap.guide !== null) { newY = centerYSnap.snapped - rect.h / 2; newGuides.push({ orientation: 'h', position: centerYSnap.guide }); }

        // Clamp to canvas
        const canvas = canvasRef.current!;
        newX = Math.max(0, Math.min(newX, canvas.scrollWidth - rect.w));
        newY = Math.max(0, newY);

        onLayoutChange(activeId, { x: Math.round(newX), y: Math.round(newY) });
      } else if (interactionType === 'resize') {
        let { x, y, w, h } = rect;
        const corner = resizeCorner || 'se';

        if (corner.includes('e')) w = Math.max(MIN_WIDTH, w + dx);
        if (corner.includes('s')) h = Math.max(MIN_HEIGHT, h + dy);
        if (corner.includes('w')) { const newW = Math.max(MIN_WIDTH, w - dx); x = x + (w - newW); w = newW; }
        if (corner.includes('n')) { const newH = Math.max(MIN_HEIGHT, h - dy); y = y + (h - newH); h = newH; }

        // Snap resize edges
        if (corner.includes('e')) {
          const rSnap = snapTo(x + w, vEdges);
          if (rSnap.guide !== null) { w = rSnap.snapped - x; newGuides.push({ orientation: 'v', position: rSnap.guide }); }
        }
        if (corner.includes('s')) {
          const bSnap = snapTo(y + h, hEdges);
          if (bSnap.guide !== null) { h = bSnap.snapped - y; newGuides.push({ orientation: 'h', position: bSnap.guide }); }
        }

        onLayoutChange(activeId, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
      }

      setGuides(newGuides);
    };

    const handleMouseUp = () => {
      setActiveId(null);
      setInteractionType(null);
      setResizeCorner(null);
      dragStart.current = null;
      clearGuides();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeId, interactionType, resizeCorner, items, onLayoutChange, clearGuides]);

  // Calculate canvas height based on widget positions
  const canvasHeight = Math.max(
    600,
    items.reduce((max, item) => Math.max(max, item.y + item.h + 40), 0)
  );

  const childArray = React.Children.toArray(children);

  return (
    <div
      ref={canvasRef}
      className="relative w-full select-none"
      style={{ minHeight: canvasHeight }}
    >
      {/* Alignment guides */}
      {guides.map((g, i) => (
        <div
          key={i}
          className="absolute z-50 pointer-events-none"
          style={
            g.orientation === 'v'
              ? { left: g.position, top: 0, width: 1, height: '100%', background: 'hsl(var(--primary) / 0.5)', boxShadow: '0 0 4px hsl(var(--primary) / 0.3)' }
              : { top: g.position, left: 0, height: 1, width: '100%', background: 'hsl(var(--primary) / 0.5)', boxShadow: '0 0 4px hsl(var(--primary) / 0.3)' }
          }
        />
      ))}

      {/* Widgets */}
      {items.map((item, idx) => {
        const child = childArray[idx];
        if (!child) return null;
        const isActive = activeId === item.id;

        return (
          <div
            key={item.id}
            className={`absolute group/widget transition-shadow duration-200 ${isActive ? 'z-40 shadow-2xl ring-2 ring-primary/30' : 'z-10 shadow-md hover:shadow-lg'}`}
            style={{
              left: item.x,
              top: item.y,
              width: item.w,
              height: item.h,
              transition: isActive ? 'none' : 'box-shadow 0.2s ease',
            }}
          >
            {/* Drag handle - full top area */}
            <div
              className="absolute inset-x-0 top-0 h-8 cursor-grab active:cursor-grabbing z-20 drag-handle"
              onMouseDown={e => handleDragStart(e, item.id)}
            />

            {/* Content */}
            <div className="w-full h-full overflow-hidden rounded-xl">
              {child}
            </div>

            {/* Resize corners */}
            {/* SE */}
            <div
              className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-30 opacity-0 group-hover/widget:opacity-100 transition-opacity"
              onMouseDown={e => handleResizeStart(e, item.id, 'se')}
            >
              <div className="absolute bottom-1 right-1 w-2.5 h-2.5 border-b-2 border-r-2 border-primary/50 rounded-br-sm" />
            </div>
            {/* SW */}
            <div
              className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize z-30 opacity-0 group-hover/widget:opacity-100 transition-opacity"
              onMouseDown={e => handleResizeStart(e, item.id, 'sw')}
            >
              <div className="absolute bottom-1 left-1 w-2.5 h-2.5 border-b-2 border-l-2 border-primary/50 rounded-bl-sm" />
            </div>
            {/* NE */}
            <div
              className="absolute top-0 right-0 w-4 h-4 cursor-ne-resize z-30 opacity-0 group-hover/widget:opacity-100 transition-opacity"
              onMouseDown={e => handleResizeStart(e, item.id, 'ne')}
            >
              <div className="absolute top-1 right-1 w-2.5 h-2.5 border-t-2 border-r-2 border-primary/50 rounded-tr-sm" />
            </div>
            {/* NW */}
            <div
              className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize z-30 opacity-0 group-hover/widget:opacity-100 transition-opacity"
              onMouseDown={e => handleResizeStart(e, item.id, 'nw')}
            >
              <div className="absolute top-1 left-1 w-2.5 h-2.5 border-t-2 border-l-2 border-primary/50 rounded-tl-sm" />
            </div>
            {/* Edge resize handles */}
            <div
              className="absolute top-4 bottom-4 right-0 w-2 cursor-e-resize z-30 opacity-0 group-hover/widget:opacity-100 transition-opacity"
              onMouseDown={e => handleResizeStart(e, item.id, 'e')}
            />
            <div
              className="absolute top-4 bottom-4 left-0 w-2 cursor-w-resize z-30 opacity-0 group-hover/widget:opacity-100 transition-opacity"
              onMouseDown={e => handleResizeStart(e, item.id, 'w')}
            />
            <div
              className="absolute left-4 right-4 bottom-0 h-2 cursor-s-resize z-30 opacity-0 group-hover/widget:opacity-100 transition-opacity"
              onMouseDown={e => handleResizeStart(e, item.id, 's')}
            />
            <div
              className="absolute left-4 right-4 top-0 h-2 cursor-n-resize z-30 opacity-0 group-hover/widget:opacity-100 transition-opacity"
              onMouseDown={e => handleResizeStart(e, item.id, 'n')}
            />
          </div>
        );
      })}
    </div>
  );
};

export default FreeLayoutCanvas;
