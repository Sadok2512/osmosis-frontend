import React, { useCallback } from 'react';
import { KpiTimeSeriesPoint, KpiCatalogEntry } from './types';
import { KPI_CATALOG_MAP } from './kpiCatalog';
import { useKpiMonitorStore, Milestone } from '../../stores/kpiMonitorStore';
import PremiumGraphCard from './PremiumGraphCard';
import D3TimeSeries from './D3TimeSeries';
import { BarChart3 } from 'lucide-react';
import D3EmptyState from './D3EmptyState';
import type { WidgetGraphConfig, WidgetAxisConfig, WidgetThreshold } from './GraphSettingsPanel';

interface Props {
  data: KpiTimeSeriesPoint[];
  height?: number;
  catalogMap?: Record<string, KpiCatalogEntry>;
  title?: string;
  badge?: string;
  granularity?: string;
  onExportPNG?: () => void;
  onExportCSV?: () => void;
  onRefresh?: () => void;
  onExpand?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  graphConfig?: WidgetGraphConfig;
  axisConfig?: WidgetAxisConfig;
  thresholds?: WidgetThreshold[];
  thresholdsEnabled?: boolean;
  editMode?: boolean;
  onToggleEditMode?: () => void;
  configPanel?: React.ReactNode;
  bottomPanel?: React.ReactNode;
  onAxisConfigChange?: (c: WidgetAxisConfig) => void;
  onGraphConfigChange?: (c: WidgetGraphConfig) => void;
}

const EChartsTimeSeries: React.FC<Props> = ({
  data, height = 460, catalogMap: externalMap,
  title, badge, granularity, onExportPNG: externalExportPNG,
  onExportCSV, onRefresh, onExpand, onDuplicate, onDelete,
  graphConfig: gc, axisConfig: ac, thresholds: thresholdList, thresholdsEnabled,
  editMode, onToggleEditMode, configPanel, bottomPanel,
  onAxisConfigChange, onGraphConfigChange,
}) => {
  const { selectedKpis, milestones: storeMilestones, showMilestones: storeShowMilestones } = useKpiMonitorStore();
  const catMap = externalMap || KPI_CATALOG_MAP;

  const handleExportPNG = useCallback(() => {
    // D3 SVG export
    const svgEl = document.querySelector('.d3-ts-container svg') as SVGSVGElement | null;
    if (!svgEl) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgEl);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      ctx.scale(2, 2);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `${title || 'chart'}.png`;
      a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));
  }, [title]);

  const totalSeries = new Set(data.map(d => d.split_value === 'ALL' ? d.kpi_key : `${d.kpi_key} — ${d.split_value}`)).size;
  const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <PremiumGraphCard
      title={title || 'KPI Time Series'}
      badge={badge}
      granularity={granularity}
      seriesCount={totalSeries}
      lastUpdated={now}
      onExportPNG={externalExportPNG || handleExportPNG}
      onExportCSV={onExportCSV}
      onRefresh={onRefresh}
      onExpand={onExpand}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
      editMode={editMode}
      onToggleEditMode={onToggleEditMode}
      configPanel={configPanel}
      bottomPanel={bottomPanel}
      axisConfig={ac}
      onAxisConfigChange={onAxisConfigChange}
      graphConfig={gc}
      onGraphConfigChange={onGraphConfigChange}
    >
      {data.length === 0 ? (
        <D3EmptyState height={height - 80} gc={gc} />
      ) : (
        <div className="d3-ts-container">
          <D3TimeSeries
            data={data}
            height={height - 80}
            catalogMap={catMap}
            gc={gc}
            ac={ac}
            thresholds={thresholdList}
            thresholdsEnabled={thresholdsEnabled}
            milestones={storeMilestones}
            showMilestones={storeShowMilestones}
          />
        </div>
      )}
    </PremiumGraphCard>
  );
};

export default EChartsTimeSeries;
