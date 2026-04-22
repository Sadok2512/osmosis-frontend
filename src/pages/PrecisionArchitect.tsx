import { useEffect } from 'react';
import EditorView from '@/precision-architect/components/EditorView';
import PresentationView from '@/precision-architect/components/PresentationView';
import ViewerView from '@/precision-architect/components/ViewerView';
import { usePAReportStore } from '@/precision-architect/stores/paReportStore';

export default function PrecisionArchitectPage() {
  const projectName = usePAReportStore((s) => s.projectName);
  const setProjectName = usePAReportStore((s) => s.setProjectName);
  const pages = usePAReportStore((s) => s.pages);
  const setPages = usePAReportStore((s) => s.setPages);
  const activePageId = usePAReportStore((s) => s.activePageId);
  const setActivePageId = usePAReportStore((s) => s.setActivePageId);
  const viewMode = usePAReportStore((s) => s.viewMode);
  const setViewMode = usePAReportStore((s) => s.setViewMode);
  const loadDashboardsFromCloud = usePAReportStore((s) => s.loadDashboardsFromCloud);
  const switchDashboard = usePAReportStore((s) => s.switchDashboard);

  // Honour cross-module deep-link: when DashboardOverview asks to open a
  // specific PA dashboard, hydrate from cloud then switch to it.
  useEffect(() => {
    const requestedId = (() => {
      try { return localStorage.getItem('osmosis_open_dashboard_id'); } catch { return null; }
    })();
    if (!requestedId) return;
    let cancelled = false;
    (async () => {
      await loadDashboardsFromCloud();
      if (cancelled) return;
      const exists = usePAReportStore.getState().dashboards.some((d) => d.id === requestedId);
      if (exists) {
        switchDashboard(requestedId);
        setViewMode('edit');
      }
      try { localStorage.removeItem('osmosis_open_dashboard_id'); } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [loadDashboardsFromCloud, switchDashboard, setViewMode]);

  return (
    <div className="precision-architect">
      {viewMode === 'edit' && (
        <EditorView
          projectName={projectName}
          onProjectNameChange={setProjectName}
          onViewModeChange={setViewMode}
          pages={pages}
          setPages={setPages as any}
          activePageId={activePageId}
          setActivePageId={setActivePageId}
        />
      )}
      {viewMode === 'view' && (
        <ViewerView
          projectName={projectName}
          onViewModeChange={setViewMode}
          pages={pages}
          activePageId={activePageId}
          setActivePageId={setActivePageId}
        />
      )}
      {viewMode === 'presentation' && (
        <PresentationView onViewModeChange={setViewMode} />
      )}
    </div>
  );
}
