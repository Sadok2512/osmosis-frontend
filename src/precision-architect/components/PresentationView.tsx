import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Minimize2,
  Maximize2,
  X,
  LayoutGrid,
  Play,
  Pause,
  ListTree,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ReactGridLayout, WidthProvider } from 'react-grid-layout/legacy';
import 'react-grid-layout/css/styles.css';
import { ViewMode, DEFAULT_DASHBOARD_THEME, type PAPage } from '../types';
import { cn } from '@/lib/utils';
import { usePAReportStore } from '../stores/paReportStore';
import WidgetRenderer from './WidgetRenderer';
import SectionBlock from './SectionBlock';
import ReportHeader from './ReportHeader';

const GridLayout = WidthProvider(ReactGridLayout);

const SLIDE_W = 1920;
const SLIDE_H = 1080;
const COLS = 12;
const ROW_HEIGHT = 60;

interface PresentationViewProps {
  onViewModeChange: (mode: ViewMode) => void;
}

/** Renders a single page at full 1920x1080 resolution. The parent scales it. */
function SlideContent({ page, projectName }: { page: PAPage; projectName: string }) {
  const theme = { ...DEFAULT_DASHBOARD_THEME, ...(page.theme ?? {}) };
  const widgets = page.widgets ?? [];
  const sections = page.sections ?? [];

  const pageBg =
    theme.backgroundColor ||
    (theme.background === 'dark' ? '#0a0c0d' : theme.background === 'gradient' ? '#1a1a2e' : '#f8fafc');
  const isDarkBg = theme.background === 'dark' || theme.background === 'gradient';
  const cardBg = theme.cardColor || (isDarkBg ? '#16181d' : '#ffffff');
  const textColor = theme.textColor || (isDarkBg ? '#ffffff' : '#0f172a');
  const radius = theme.borderRadius ?? 16;
  const spacing = theme.spacing ?? 16;
  const padding = theme.pagePadding ?? 48;

  // Mirror ViewerView ownership: widgets without sectionId render first; section-owned widgets render inside their section.
  const unassignedWidgets = widgets.filter((w) => !w.sectionId);
  const widgetsBySection = new Map<string, typeof widgets>();
  for (const w of widgets) {
    if (!w.sectionId) continue;
    if (!widgetsBySection.has(w.sectionId)) widgetsBySection.set(w.sectionId, []);
    widgetsBySection.get(w.sectionId)!.push(w);
  }

  const buildLayout = (group: typeof widgets) =>
    group.map((w) => ({ i: w.id, x: w.layout.x, y: w.layout.y, w: w.layout.w, h: w.layout.h, static: true }));

  const renderGrid = (group: typeof widgets) => {
    if (group.length === 0) return null;
    return (
      <GridLayout
        className="layout"
        layout={buildLayout(group)}
        cols={COLS}
        rowHeight={ROW_HEIGHT}
        margin={[spacing, spacing]}
        containerPadding={[0, 0]}
        isDraggable={false}
        isResizable={false}
        autoSize
      >
        {group.map((w) => (
          <div
            key={w.id}
            className={w.transparentBg ? 'overflow-hidden' : 'overflow-hidden shadow-lg border border-black/5'}
            style={{ backgroundColor: w.transparentBg ? 'transparent' : cardBg, borderRadius: radius }}
          >
            <div className="w-full h-full p-4">
              <WidgetRenderer widget={w} />
            </div>
          </div>
        ))}
      </GridLayout>
    );
  };

  return (
    <div
      className="slide-content w-full h-full overflow-auto custom-scrollbar"
      style={{ backgroundColor: pageBg, color: textColor, padding }}
    >
      <ReportHeader theme={theme} projectName={projectName} pageName={page.name} size="lg" />

      {widgets.length === 0 && sections.length === 0 ? (
        <div className="h-full w-full flex items-center justify-center opacity-50 mt-12">
          <div className="text-center">
            <p className="text-2xl font-black uppercase tracking-widest mb-2">Empty slide</p>
            <p className="text-base opacity-70">Add widgets in the editor to populate this slide.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6 mt-6">
          {unassignedWidgets.length > 0 && <div className="w-full">{renderGrid(unassignedWidgets)}</div>}

          {sections.length > 0 && (
            <div className="space-y-6">
              {sections.map((s) => {
                const sectionWidgets = widgetsBySection.get(s.id) ?? [];
                return (
                  <div key={s.id} id={`pa-section-${s.id}`} className="space-y-3 scroll-mt-6">
                    <SectionBlock section={s} editable={false} />
                    {sectionWidgets.length > 0 && <div className="w-full">{renderGrid(sectionWidgets)}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Wraps SlideContent at fixed 1920x1080 and scales it to fit any container. */
function ScaledSlide({ page, projectName }: { page: PAPage; projectName: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const compute = () => {
      const { width, height } = el.getBoundingClientRect();
      const s = Math.min(width / SLIDE_W, height / SLIDE_H);
      setScale(s > 0 ? s : 1);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden">
      <div
        className="absolute"
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          left: '50%',
          top: '50%',
          marginLeft: -SLIDE_W / 2,
          marginTop: -SLIDE_H / 2,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        <SlideContent page={page} projectName={projectName} />
      </div>
    </div>
  );
}

export default function PresentationView({ onViewModeChange }: PresentationViewProps) {
  const projectName = usePAReportStore((s) => s.projectName);
  const pages = usePAReportStore((s) => s.pages);
  const activePageId = usePAReportStore((s) => s.activePageId);
  const setActivePageId = usePAReportStore((s) => s.setActivePageId);

  const startIdx = Math.max(
    0,
    pages.findIndex((p) => p.id === activePageId),
  );
  const [index, setIndex] = useState(startIdx);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);
  const [showSectionNav, setShowSectionNav] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const cursorTimer = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const total = pages.length;
  const currentPage = pages[index];

  const goTo = useCallback(
    (i: number) => {
      if (total === 0) return;
      const next = ((i % total) + total) % total;
      setIndex(next);
      setActivePageId(pages[next].id);
    },
    [pages, total, setActivePageId],
  );

  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);

  const scrollToSection = useCallback((sectionId: string) => {
    setActiveSectionId(sectionId);
    // The slide is rendered in a scaled container; the scrollable element is `.slide-content`.
    // Find the section node inside the currently-visible slide and scroll its parent scroller.
    requestAnimationFrame(() => {
      const node = document.getElementById(`pa-section-${sectionId}`);
      if (!node) return;
      // Walk up to find the scrollable slide-content ancestor
      let scroller: HTMLElement | null = node.parentElement;
      while (scroller && !scroller.classList.contains('slide-content')) {
        scroller = scroller.parentElement;
      }
      if (scroller) {
        const offsetTop = node.offsetTop - 24;
        scroller.scrollTo({ top: offsetTop, behavior: 'smooth' });
      } else {
        node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      // Briefly flash a focus ring
      node.classList.add('pa-section-flash');
      window.setTimeout(() => node.classList.remove('pa-section-flash'), 1400);
    });
  }, []);
  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        prev();
      } else if (e.key === 'Escape') {
        if (showSectionNav) setShowSectionNav(false);
        else if (showGrid) setShowGrid(false);
        else if (document.fullscreenElement) document.exitFullscreen();
        else onViewModeChange('view');
      } else if (e.key === 'g' || e.key === 'G') {
        setShowGrid((v) => !v);
      } else if (e.key === 's' || e.key === 'S') {
        setShowSectionNav((v) => !v);
      } else if (e.key === 'f' || e.key === 'F' || e.key === 'F5') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'Home') {
        goTo(0);
      } else if (e.key === 'End') {
        goTo(total - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next, prev, showGrid, total]);

  // Fullscreen change listener
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      rootRef.current?.requestFullscreen().catch(() => {});
    }
  }, []);

  // Auto-hide cursor after inactivity
  useEffect(() => {
    const onMove = () => {
      setCursorVisible(true);
      if (cursorTimer.current) window.clearTimeout(cursorTimer.current);
      cursorTimer.current = window.setTimeout(() => setCursorVisible(false), 2500);
    };
    window.addEventListener('mousemove', onMove);
    onMove();
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (cursorTimer.current) window.clearTimeout(cursorTimer.current);
    };
  }, []);

  // Autoplay
  useEffect(() => {
    if (!autoplay) return;
    const t = window.setInterval(() => next(), 7000);
    return () => window.clearInterval(t);
  }, [autoplay, next]);

  const progress = total > 1 ? ((index + 1) / total) * 100 : 100;

  if (!currentPage) {
    return (
      <div className="h-screen w-full bg-[#0a0c0d] text-white flex items-center justify-center">
        <p>No pages to present.</p>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        'h-screen w-full bg-[#0a0c0d] text-white flex flex-col overflow-hidden relative',
        !cursorVisible && 'cursor-none',
      )}
    >
      {/* Top toolbar — fades when cursor hidden */}
      <AnimatePresence>
        {cursorVisible && (
          <motion.header
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="absolute top-0 left-0 right-0 z-50 flex justify-between items-center px-6 py-4 bg-gradient-to-b from-black/60 to-transparent"
          >
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
              <span className="text-sm font-black uppercase tracking-widest text-white">{projectName}</span>
              <span className="px-3 py-1 rounded-full bg-white/10 text-white/70 text-[10px] font-black tracking-widest uppercase">
                Slide {index + 1} / {total}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSectionNav((v) => !v)}
                className={cn(
                  'h-10 px-3 rounded-lg border flex items-center gap-2 transition-all text-xs font-bold uppercase tracking-wider',
                  showSectionNav
                    ? 'bg-primary border-primary text-white'
                    : 'bg-white/5 border-white/10 hover:bg-white/10 text-white',
                )}
                title="Sections (S)"
              >
                <ListTree className="w-4 h-4" />
                Sections
                <span className="ml-1 px-1.5 py-0.5 rounded bg-white/15 text-[10px]">
                  {(currentPage?.sections ?? []).length}
                </span>
              </button>
              <button
                onClick={() => setShowGrid((v) => !v)}
                className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center transition-all"
                title="Grid view (G)"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setAutoplay((v) => !v)}
                className={cn(
                  'w-10 h-10 rounded-lg border flex items-center justify-center transition-all',
                  autoplay ? 'bg-primary border-primary text-white' : 'bg-white/5 border-white/10 hover:bg-white/10',
                )}
                title="Autoplay"
              >
                {autoplay ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button
                onClick={toggleFullscreen}
                className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center transition-all"
                title="Fullscreen (F)"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                onClick={() => onViewModeChange('view')}
                className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center transition-all"
                title="Exit (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Slide stage */}
      <main className="flex-1 w-full h-full relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPage.id}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="absolute inset-0"
          >
            <ScaledSlide page={currentPage} projectName={projectName} />
          </motion.div>
        </AnimatePresence>

        {/* Side nav arrows */}
        {total > 1 && (
          <>
            <button
              onClick={prev}
              className={cn(
                'absolute left-6 top-1/2 -translate-y-1/2 z-40 w-14 h-14 rounded-full bg-white/5 border border-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/15 transition-all active:scale-90',
                !cursorVisible && 'opacity-0',
              )}
              aria-label="Previous"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={next}
              className={cn(
                'absolute right-6 top-1/2 -translate-y-1/2 z-40 w-14 h-14 rounded-full bg-white/5 border border-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/15 transition-all active:scale-90',
                !cursorVisible && 'opacity-0',
              )}
              aria-label="Next"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}
      </main>

      {/* Bottom progress + thumbnail strip */}
      <AnimatePresence>
        {cursorVisible && total > 1 && (
          <motion.footer
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="absolute bottom-0 left-0 right-0 z-50 px-6 pb-4 pt-10 bg-gradient-to-t from-black/70 to-transparent"
          >
            <div className="max-w-6xl mx-auto">
              <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden mb-4">
                <motion.div
                  className="h-full bg-primary"
                  initial={false}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
              <div className="flex items-center justify-center gap-2">
                {pages.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => goTo(i)}
                    className={cn(
                      'h-1.5 rounded-full transition-all',
                      i === index ? 'w-8 bg-primary' : 'w-1.5 bg-white/30 hover:bg-white/60',
                    )}
                    aria-label={`Go to slide ${i + 1}`}
                  />
                ))}
              </div>
            </div>
          </motion.footer>
        )}
      </AnimatePresence>

      {/* Grid overlay */}
      <AnimatePresence>
        {showGrid && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[60] bg-[#0a0c0d]/95 backdrop-blur-xl overflow-y-auto"
          >
            <div className="max-w-7xl mx-auto p-12">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-primary mb-1">Grid View</p>
                  <h2 className="text-3xl font-black text-white font-headline">{projectName}</h2>
                </div>
                <button
                  onClick={() => setShowGrid(false)}
                  className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-6">
                {pages.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      goTo(i);
                      setShowGrid(false);
                    }}
                    className={cn(
                      'group relative aspect-video rounded-xl overflow-hidden border-2 transition-all hover:scale-[1.02]',
                      i === index ? 'border-primary shadow-2xl shadow-primary/30' : 'border-white/10 hover:border-white/30',
                    )}
                  >
                    <div className="absolute inset-0 bg-white">
                      <ScaledSlide page={p} projectName={projectName} />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-white">
                      <span className="text-xs font-black uppercase tracking-widest">{p.name}</span>
                      <span className="text-[10px] font-black bg-white/20 backdrop-blur px-2 py-1 rounded">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Sections nav — discrete, fixed, overlay */}
      {(currentPage.sections?.length ?? 0) > 0 && (
        <>
          <motion.button
            type="button"
            onClick={() => setShowSectionNav((v) => !v)}
            initial={false}
            animate={{ opacity: cursorVisible || showSectionNav ? (showSectionNav ? 1 : 0.35) : 0 }}
            whileHover={{ opacity: 1, scale: 1.05 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 right-6 z-[70] w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 backdrop-blur-md flex items-center justify-center text-white shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            title="Sections (S)"
            aria-label="Open sections navigation"
            aria-expanded={showSectionNav}
          >
            <ListTree className="w-4 h-4" />
          </motion.button>

          <AnimatePresence>
            {showSectionNav && (
              <>
                {/* Click-outside catcher */}
                <div
                  className="fixed inset-0 z-[68]"
                  onClick={() => setShowSectionNav(false)}
                  aria-hidden
                />
                <motion.div
                  initial={{ opacity: 0, x: 16, scale: 0.96 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 16, scale: 0.96 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="fixed bottom-24 right-20 z-[71] w-72 max-h-[60vh] rounded-xl bg-[#0f1115]/95 backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden flex flex-col"
                  role="dialog"
                  aria-label="Sections"
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary">Navigate</p>
                      <p className="text-sm font-bold text-white truncate">{currentPage.name}</p>
                    </div>
                    <button
                      onClick={() => setShowSectionNav(false)}
                      className="w-7 h-7 rounded-md hover:bg-white/10 flex items-center justify-center text-white/70"
                      aria-label="Close"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
                    {(currentPage.sections ?? []).map((s, i) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          scrollToSection(s.id);
                          setShowSectionNav(false);
                        }}
                        className={cn(
                          'w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors group',
                          activeSectionId === s.id
                            ? 'bg-primary/15 text-white'
                            : 'text-white/80 hover:bg-white/5 hover:text-white',
                        )}
                      >
                        <span className="text-[10px] font-black tabular-nums text-white/40 mt-0.5 w-5">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="text-sm font-semibold truncate flex-1">
                          {s.title || `Section ${i + 1}`}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="px-4 py-2 border-t border-white/10 text-[10px] uppercase tracking-widest text-white/40">
                    Press <kbd className="px-1 py-0.5 bg-white/10 rounded">S</kbd> to toggle · <kbd className="px-1 py-0.5 bg-white/10 rounded">Esc</kbd> to close
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
