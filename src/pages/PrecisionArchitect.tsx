import { useState } from 'react';
import { ViewMode, PAPage } from '@/precision-architect/types';
import EditorView from '@/precision-architect/components/EditorView';
import PresentationView from '@/precision-architect/components/PresentationView';
import ViewerView from '@/precision-architect/components/ViewerView';

export default function PrecisionArchitectPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const [projectName, setProjectName] = useState('Network Health · Q4 Report');
  const [pages, setPages] = useState<PAPage[]>([
    { id: 'page-1', name: 'Network Health', widgets: [], sections: [] },
  ]);
  const [activePageId, setActivePageId] = useState<string>('page-1');

  return (
    <div className="precision-architect">
      {viewMode === 'edit' && (
        <EditorView
          projectName={projectName}
          onProjectNameChange={setProjectName}
          onViewModeChange={setViewMode}
          pages={pages}
          setPages={setPages}
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
