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
