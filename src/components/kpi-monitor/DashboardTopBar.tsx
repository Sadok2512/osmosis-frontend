import React, { useState } from 'react';
import { useDashboardManager } from '../bi/DashboardManager';
import {
  Plus, Save, FileDown, Copy, FolderOpen, Eye, Globe, Lock,
  MoreHorizontal, Sparkles, FileSpreadsheet, BarChart3, Map as MapIcon,
  Table2, Type, ImageIcon, Grid3X3, Move, ChevronDown,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import GlobalFilterBar from './GlobalFilterBar';

interface DashboardTopBarProps {
  dm: ReturnType<typeof useDashboardManager>;
  onSave: () => void;
  onExportPDF: () => void;
  onShowPrintPreview: () => void;
  onToggleAI: () => void;
  showAI: boolean;
  onToggleCSV: () => void;
  csvCount: number;
  // Add widget callbacks
  onAddChart: () => void;
  onAddMap: () => void;
  onAddText: () => void;
  onAddImage: () => void;
  onAddTable: () => void;
  // Layout
  layoutMode: 'grid' | 'free';
  onToggleLayout: () => void;
  // Create
  onCreateNew: () => void;
}

const DashboardTopBar: React.FC<DashboardTopBarProps> = ({
  dm, onSave, onExportPDF, onShowPrintPreview, onToggleAI, showAI,
  onToggleCSV, csvCount,
  onAddChart, onAddMap, onAddText, onAddImage, onAddTable,
  layoutMode, onToggleLayout, onCreateNew,
}) => {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');

  const startEditName = () => {
    setNameValue(dm.activeTab?.name || '');
    setEditingName(true);
  };

  const commitName = () => {
    if (nameValue.trim() && dm.activeTab) {
      dm.renameTab(dm.activeTab.id, nameValue.trim());
    }
    setEditingName(false);
  };

  return (
    <div className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-md">
      {/* Row 1: Dashboard identity + actions */}
      <div className="flex items-center justify-between px-4 py-2 gap-4">
        {/* LEFT: Name + description + badge */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            {editingName ? (
              <input
                className="text-sm font-bold text-foreground bg-transparent border-b-2 border-primary outline-none px-0 py-0.5 w-[240px]"
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onBlur={commitName}
                onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false); }}
                autoFocus
              />
            ) : (
              <h1
                className="text-sm font-bold text-foreground cursor-pointer hover:text-primary transition-colors truncate max-w-[300px]"
                onClick={startEditName}
                title="Cliquez pour renommer"
              >
                {dm.activeTab?.name || 'KPI Monitor'}
              </h1>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              <input
                type="text"
                placeholder="Ajouter une description..."
                value={dm.activeTab?.description || ''}
                onChange={e => dm.activeTab && dm.updateDescription(dm.activeTab.id, e.target.value)}
                className="text-[10px] text-muted-foreground bg-transparent border-none outline-none w-[180px] placeholder:text-muted-foreground/40"
              />
              <button
                onClick={() => dm.activeTab && dm.toggleShared(dm.activeTab.id)}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold transition-colors hover:bg-muted"
              >
                {dm.activeTab?.isShared ? (
                  <><Globe className="w-2.5 h-2.5 text-primary" /><span className="text-primary">Public</span></>
                ) : (
                  <><Lock className="w-2.5 h-2.5 text-muted-foreground" /><span className="text-muted-foreground">Privé</span></>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* CENTER: Add widget buttons */}
        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
          {[
            { icon: Plus, label: 'Chart', onClick: onAddChart },
            { icon: MapIcon, label: 'Map', onClick: onAddMap },
            { icon: Table2, label: 'Table', onClick: onAddTable },
            { icon: Type, label: 'Text', onClick: onAddText },
            { icon: ImageIcon, label: 'Image', onClick: onAddImage },
          ].map(btn => (
            <button
              key={btn.label}
              onClick={btn.onClick}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-muted-foreground hover:bg-card hover:text-foreground transition-all"
            >
              <btn.icon className="w-3.5 h-3.5" /> {btn.label}
            </button>
          ))}
        </div>

        {/* RIGHT: Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* AI button */}
          <button
            onClick={onToggleAI}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
              showAI
                ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                : 'bg-primary/10 text-primary hover:bg-primary/20'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" /> QOEBIT
          </button>

          {/* Layout toggle */}
          <div className="flex items-center gap-0 rounded-lg border border-border bg-muted/40 p-0.5">
            <button
              onClick={() => layoutMode !== 'grid' && onToggleLayout()}
              className={`p-1.5 rounded-md transition-all ${layoutMode === 'grid' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              title="Grid"
            >
              <Grid3X3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => layoutMode !== 'free' && onToggleLayout()}
              className={`p-1.5 rounded-md transition-all ${layoutMode === 'free' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              title="Free"
            >
              <Move className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onSave}><Save className="w-3.5 h-3.5 mr-2" /> Sauvegarder</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { dm.duplicateDashboard(dm.activeTabId); }}><Copy className="w-3.5 h-3.5 mr-2" /> Dupliquer</DropdownMenuItem>
              <DropdownMenuItem onClick={() => dm.setShowList(!dm.showList)}><FolderOpen className="w-3.5 h-3.5 mr-2" /> Charger</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onShowPrintPreview}><Eye className="w-3.5 h-3.5 mr-2" /> Aperçu</DropdownMenuItem>
              <DropdownMenuItem onClick={onExportPDF}><FileDown className="w-3.5 h-3.5 mr-2" /> Export PDF</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onToggleCSV}>
                <FileSpreadsheet className="w-3.5 h-3.5 mr-2" /> Données {csvCount > 0 && `(${csvCount})`}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCreateNew}><Plus className="w-3.5 h-3.5 mr-2" /> Nouveau</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Row 2: Global filter bar */}
      <GlobalFilterBar />
    </div>
  );
};

export default DashboardTopBar;
