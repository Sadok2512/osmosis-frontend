import { useState } from 'react';
import { ViewMode } from './types';
import EditorView from './components/EditorView';
import PresentationView from './components/PresentationView';
import ViewerView from './components/ViewerView';

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
