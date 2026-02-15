import React, { useState, useEffect, useMemo } from 'react';
import { fetchSites, fetchSiteDetails, fetchCellTimeSeries } from '../../services/mockData';
import { SiteSummary, SiteDetail, Filters, KPIType, TimeSeriesPoint } from '../../types';
import {
  Search, Download, RefreshCw, ChevronLeft, MapPin,
  Zap, Network, Database, Activity, ArrowRight,
  Filter, ChevronDown, SlidersHorizontal, ChevronRight, LayoutGrid, List
} from 'lucide-react';
import { getQoEColor, VENDORS, DORS, DEPARTMENTS, PLAQUES, RATS } from '../../constants';

interface SitesMonitorProps {
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
  onCellSelect: (cellId: string) => void;
}

const SitesMonitor: React.FC<SitesMonitorProps> = ({ filters, onFilterChange, onCellSelect }) => {
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [siteDetail, setSiteDetail] = useState<SiteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [localSearch, setLocalSearch] = useState('');

  useEffect(() => {
    const loadSites = async () => {
      setLoading(true);
      const data = await fetchSites(filters);
      setSites(data || []);
      setLoading(false);
    };
    loadSites();
  }, [filters]);

  useEffect(() => {
    if (selectedSiteId) {
      const loadDetail = async () => {
        setDetailLoading(true);
        const data = await fetchSiteDetails(selectedSiteId);
        setSiteDetail(data);
        setDetailLoading(false);
      };
      loadDetail();
    } else {
      setSiteDetail(null);
    }
  }, [selectedSiteId]);

  const filteredSites = useMemo(() => {
    return sites.filter(s => {
      const matchesSearch = s.site_name.toLowerCase().includes(localSearch.toLowerCase()) || s.site_id.toLowerCase().includes(localSearch.toLowerCase());
      const matchesDor = filters.dor === 'ALL' || s.dor === filters.dor;
      const matchesPlaque = filters.plaque === 'ALL' || s.plaque === filters.plaque;
      const matchesVendor = filters.vendor === 'ALL' || s.vendor === filters.vendor;
      const matchesDep = filters.department === 'ALL' || s.department === filters.department;
      const matchesRat = filters.rat === 'ALL' || s.cells.some(c => c.techno === filters.rat);
      return matchesSearch && matchesDor && matchesPlaque && matchesVendor && matchesDep && matchesRat;
    });
  }, [sites, localSearch, filters]);

  const updateFilter = (key: keyof Filters, value: any) => {
    onFilterChange({ ...filters, [key]: value });
  };

  if (loading) return (
    <div className="flex-1 flex flex-col items-center justify-center h-full gap-3 bg-slate-50">
      <RefreshCw className="w-10 h-10 text-blue-600 animate-spin" />
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading sites...</p>
    </div>
  );

  if (selectedSiteId && detailLoading) return (
    <div className="flex-1 flex flex-col items-center justify-center h-full gap-4 bg-slate-50">
      <RefreshCw className="w-12 h-12 text-blue-600 animate-spin" />
      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Loading site detail...</p>
    </div>
  );

  // Drill-down view
  if (siteDetail) {
    return (
      <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden h-full">
        <div className="px-10 py-6 border-b border-slate-200 flex items-center justify-between bg-white z-20 shadow-sm shrink-0">
          <div className="flex items-center gap-8">
            <button onClick={() => setSelectedSiteId(null)} className="w-12 h-12 bg-slate-900 text-white rounded-[1.25rem] flex items-center justify-center hover:bg-slate-800 transition-all shadow-lg">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">{siteDetail.site_name}</h2>
                <div className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[9px] font-black uppercase tracking-widest">{siteDetail.vendor}</div>
              </div>
              <div className="flex items-center gap-2.5 mt-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <MapPin className="w-3.5 h-3.5" />
                <span>{siteDetail.site_id} • {siteDetail.dor} • {siteDetail.plaque}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">QoE Site Avg</div>
            <div className="text-3xl font-black tracking-tighter" style={{ color: getQoEColor(siteDetail.qoe_score_avg) }}>{siteDetail.qoe_score_avg.toFixed(1)}%</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-10 space-y-10">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MiniStat label="Cells" value={siteDetail.cell_count.toString()} icon={<Network size={16} />} color="text-blue-600" />
            <MiniStat label="Thr. DL" value={`${siteDetail.p50_thr_dn_mbps.toFixed(1)}M`} icon={<Zap size={16} />} color="text-emerald-600" />
            <MiniStat label="Vol DL" value={`${(siteDetail.traffic_dn_bytes / 1e12).toFixed(1)}T`} icon={<Database size={16} />} color="text-purple-600" />
            <MiniStat label="Latence" value={`${siteDetail.p95_rtt_ms.toFixed(0)}ms`} icon={<Activity size={16} />} color="text-amber-600" />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-widest">Cell Inventory</h4>
              <span className="text-[9px] font-black px-2 py-0.5 bg-blue-50 text-blue-600 rounded">{siteDetail.cells.length} sectors</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {siteDetail.cells.map(cell => (
                <div key={cell.cell_id} onClick={() => onCellSelect(cell.cell_id)}
                  className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm hover:border-blue-600 transition-all cursor-pointer group hover:shadow-2xl">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-[11px] font-black text-slate-400 tracking-widest">{cell.cell_id.split('_').pop()}</div>
                    <div className={`px-2 py-0.5 rounded text-[8px] font-black text-white ${cell.techno === '5G' ? 'bg-purple-600' : 'bg-blue-600'}`}>{cell.techno}</div>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-[15px] font-black text-slate-800 tracking-tighter">QoE: {cell.qoe_score_avg.toFixed(1)}%</div>
                      <div className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-widest">{cell.bande} MHz • {cell.azimut}°</div>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl text-slate-400 group-hover:text-blue-600 group-hover:bg-blue-50 transition-all"><ArrowRight size={18} /></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Sites list
  return (
    <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden h-full">
      <div className="px-10 py-6 bg-white border-b border-slate-200 z-30 shadow-sm shrink-0">
        <div className="flex flex-col gap-6 max-w-[1600px] mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-lg">
                <SlidersHorizontal size={20} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tighter uppercase">Network Sites Monitor</h2>
                <p className="text-[9px] font-black text-blue-600 uppercase tracking-[0.2em] mt-1">Select a site to view its cells</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-5 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-black">
                <span className="text-slate-400 mr-2 uppercase tracking-widest">Sites:</span>
                <span className="text-blue-600">{filteredSites.length}</span>
              </div>
              <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
                <button onClick={() => setViewMode('grid')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-400'}`}><LayoutGrid size={18} /></button>
                <button onClick={() => setViewMode('table')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'table' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-400'}`}><List size={18} /></button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <div className="relative col-span-1 xl:col-span-2">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <input type="text" placeholder="Search Site ID, Site name..." value={localSearch} onChange={(e) => setLocalSearch(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-black uppercase tracking-tight outline-none focus:ring-4 focus:ring-blue-500/5 focus:bg-white transition-all" />
            </div>
            <FilterSelect label="Vendor" value={filters.vendor} options={VENDORS} onChange={(v: string) => updateFilter('vendor', v)} />
            <FilterSelect label="DOR" value={filters.dor} options={DORS} onChange={(v: string) => updateFilter('dor', v)} />
            <FilterSelect label="Department" value={filters.department} options={DEPARTMENTS} onChange={(v: string) => updateFilter('department', v)} />
            <FilterSelect label="Rat" value={filters.rat} options={RATS} onChange={(v: string) => updateFilter('rat', v)} />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-10 space-y-8 pb-32">
        {filteredSites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-slate-300 opacity-50">
            <Search size={48} className="mb-4" />
            <span className="text-[10px] font-black uppercase tracking-widest">No matching nodes found</span>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            {filteredSites.map(site => (
              <div key={site.site_id} onClick={() => setSelectedSiteId(site.site_id)}
                className="group bg-white border border-slate-200 rounded-[2.5rem] p-7 shadow-sm transition-all duration-300 hover:shadow-2xl hover:border-blue-400 hover:-translate-y-1 cursor-pointer">
                <div className="flex items-center justify-between mb-8">
                  <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 group-hover:bg-blue-600 group-hover:text-white transition-all">
                    <MapPin size={24} />
                  </div>
                  <div className="text-right">
                    <div className="text-[16px] font-black tracking-tighter" style={{ color: getQoEColor(site.qoe_score_avg) }}>{site.qoe_score_avg.toFixed(1)}%</div>
                    <div className="text-[8px] font-black text-slate-300 uppercase tracking-widest mt-0.5">Site QoE</div>
                  </div>
                </div>
                <h4 className="text-[15px] font-black text-slate-800 tracking-tight uppercase mb-2 truncate group-hover:text-blue-600 transition-colors">{site.site_name}</h4>
                <div className="flex items-center gap-2 mb-8">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{site.site_id}</span>
                  <div className="w-1 h-1 rounded-full bg-slate-200" />
                  <span className="text-[9px] font-black text-slate-400 uppercase">{site.vendor}</span>
                </div>
                <div className="pt-6 border-t border-slate-50 flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight">{site.cell_count} CELLS</span>
                  <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-300 group-hover:bg-blue-600 group-hover:text-white transition-all"><ArrowRight size={16} /></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 sticky top-0 z-10">
                <tr>
                  <th className="px-10 py-6">Site Identity</th>
                  <th className="px-6 py-6 text-center">Vendor</th>
                  <th className="px-6 py-6 text-center">Cells</th>
                  <th className="px-6 py-6 text-center">QoE Score</th>
                  <th className="px-10 py-6 text-right">Drill down</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSites.map(site => (
                  <tr key={site.site_id} onClick={() => setSelectedSiteId(site.site_id)} className="group hover:bg-blue-50/30 transition-all cursor-pointer">
                    <td className="px-10 py-6">
                      <div className="text-[14px] font-black text-slate-800 uppercase tracking-tight">{site.site_name}</div>
                      <div className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-widest">{site.site_id} • {site.dor}</div>
                    </td>
                    <td className="px-6 py-6 text-center">
                      <span className="px-2.5 py-1 bg-slate-900 text-white rounded-lg text-[8px] font-black uppercase">{site.vendor}</span>
                    </td>
                    <td className="px-6 py-6 text-center font-black text-slate-500 text-[11px]">{site.cell_count}</td>
                    <td className="px-6 py-6 text-center">
                      <div className="text-lg font-black tracking-tighter" style={{ color: getQoEColor(site.qoe_score_avg) }}>{site.qoe_score_avg.toFixed(1)}%</div>
                    </td>
                    <td className="px-10 py-6 text-right">
                      <span className="text-[10px] font-black uppercase text-slate-400 group-hover:text-blue-600">View <ChevronRight size={14} className="inline" /></span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const MiniStat = ({ label, value, icon, color }: any) => (
  <div className="bg-white p-6 rounded-[2rem] border border-slate-200 flex flex-col items-center justify-center shadow-sm">
    <div className={`p-3 bg-slate-50 rounded-2xl mb-3 ${color}`}>{icon}</div>
    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</span>
    <span className="text-xl font-black text-slate-900 tracking-tighter">{value}</span>
  </div>
);

const FilterSelect = ({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) => (
  <div className="flex flex-col gap-2">
    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase outline-none focus:border-blue-300 transition-all shadow-sm">
      {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  </div>
);

export default SitesMonitor;
