import { request } from '@/api/httpClient';
import type {
  AlarmItem,
  CellInfo,
  CmHistoryItem,
  ControlStatus,
  CounterListItem,
  DatabaseConfig,
  NeighborHoItem,
  NeighborHoStats,
  OperatorConfig,
  PaginatedResponse,
  PmCounterItem,
  PmKpiSummary,
  PmStats,
  ResolveCellsResponse,
  ScheduleConfig,
  TopFailingHo,
} from '@/api/types';

export const parserApi = {
  getControlStatus: () => request<ControlStatus>('parser', 'control/status'),
  runServiceNow: (serviceName: string) =>
    request<{ message: string; task_id: string }>('parser', `control/run-now/${serviceName}`, { method: 'POST' }),

  getOperatorConfig: () => request<OperatorConfig>('parser', 'config/operator'),
  saveOperatorConfig: (body: { name: string; country: string; vendors: string[] }) =>
    request<OperatorConfig>('parser', 'config/operator', { method: 'POST', body: JSON.stringify(body) }),
  saveVendorPathsBulk: (body: { vendor_id: string | number; paths: Record<string, string> }) =>
    request('parser', 'config/vendor-paths-bulk', { method: 'POST', body: JSON.stringify(body) }),
  getDatabaseConfig: () => request<DatabaseConfig>('parser', 'config/database'),
  saveDatabaseConfig: (body: DatabaseConfig & { password?: string }) =>
    request('parser', 'config/database', { method: 'POST', body: JSON.stringify(body) }),
  testDatabaseConfig: (body: DatabaseConfig & { password?: string }) =>
    request<{ status: 'ok' | 'error'; message: string }>('parser', 'config/database/test', { method: 'POST', body: JSON.stringify(body) }),
  getSchedules: () => request<ScheduleConfig[]>('parser', 'config/schedules'),

  resolveCells: (cellNames: string[]) =>
    request<ResolveCellsResponse>('parser', 'topo/resolve-cells', { method: 'POST', body: JSON.stringify({ cell_names: cellNames }) }),
  searchCells: (params?: Record<string, unknown>) => request<CellInfo[]>('parser', 'topo/cells', { params }),
  getHierarchy: () => request<Record<string, unknown>>('parser', 'topo/hierarchy'),
  getDistinct: (field: string) => request<string[]>('parser', 'topo/distinct', { params: { field } }),

  getNokiaAlarms: (params?: Record<string, unknown>) => request<PaginatedResponse<AlarmItem>>('parser', 'alarms/nokia', { params }),
  getCmHistory: (params?: Record<string, unknown>) => request<PaginatedResponse<CmHistoryItem>>('parser', 'cm/history', { params }),

  getPmStats: () => request<PmStats>('parser', 'pm/nokia/stats'),
  getPmCounters: (params?: Record<string, unknown>) => request<PaginatedResponse<PmCounterItem>>('parser', 'pm/nokia/counters', { params }),
  getCounterList: () => request<CounterListItem[]>('parser', 'pm/nokia/counter-list'),
  getPmKpiSummary: (params?: Record<string, unknown>) => request<PmKpiSummary[]>('parser', 'pm/nokia/kpi-summary', { params }),

  getNeighborsHo: (params?: Record<string, unknown>) => request<PaginatedResponse<NeighborHoItem>>('parser', 'neighbors/nokia/ho', { params }),
  getNeighborsHoStats: () => request<NeighborHoStats>('parser', 'neighbors/nokia/ho/stats'),
  getTopFailingHo: (params?: Record<string, unknown>) => request<TopFailingHo[]>('parser', 'neighbors/nokia/ho/top-failing', { params }),
};
