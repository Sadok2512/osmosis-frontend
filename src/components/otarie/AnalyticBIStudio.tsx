import React from 'react';
import { Filters } from '../../types';
import { BarChart2 } from 'lucide-react';

const AnalyticBIStudio: React.FC<{ filters: Filters }> = ({ filters }) => {
  return (
    <div className="flex-1 overflow-auto bg-background p-8">
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-6">
        <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
          <BarChart2 className="w-10 h-10 text-primary" />
        </div>
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Analytic BI Studio</h1>
          <p className="text-sm text-muted-foreground max-w-md">
            Module en construction — les outils d'analyse avancée seront disponibles ici.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AnalyticBIStudio;
