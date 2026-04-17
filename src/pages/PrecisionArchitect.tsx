import { useState } from 'react';
import { ViewMode } from '@/precision-architect/types';
import EditorView from '@/precision-architect/components/EditorView';
import PresentationView from '@/precision-architect/components/PresentationView';
import ViewerView from '@/precision-architect/components/ViewerView';

export default function PrecisionArchitectPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const [projectName, setProjectName] = useState('Network Health · Q4 Report');

  return (
    <div className="precision-architect">
      {viewMode === 'edit' && (
        <EditorView
          projectName={projectName}
          onProjectNameChange={setProjectName}
          onViewModeChange={setViewMode}
        />
      )}
      {viewMode === 'view' && (
        <ViewerView projectName={projectName} onViewModeChange={setViewMode} />
      )}
      {viewMode === 'presentation' && (
        <PresentationView onViewModeChange={setViewMode} />
      )}
    </div>
  );
}
