import { supabase } from '@/integrations/supabase/client';

export interface ParameterChange {
  id: number;
  change_date: string;
  change_type: string;
  change_scope: string;
  param_name: string;
  old_value: string | null;
  new_value: string | null;
  site_name: string | null;
  cell_name: string | null;
  dr: string | null;
  dor: string | null;
  plaque: string | null;
  zone_arcep: string | null;
  vendor: string | null;
  techno: string | null;
  description: string | null;
}

export interface ParameterChangeFilters {
  change_scope?: string[];
  change_type?: string[];
  date_from?: string;
  date_to?: string;
  site_name?: string;
  plaque?: string;
  dr?: string;
  dor?: string;
}

export const fetchParameterChanges = async (filters: ParameterChangeFilters): Promise<ParameterChange[]> => {
  let query = (supabase as any).from('parameter_changes').select('*').order('change_date', { ascending: true });

  if (filters.date_from) query = query.gte('change_date', filters.date_from);
  if (filters.date_to) query = query.lte('change_date', filters.date_to);
  if (filters.change_scope?.length && !filters.change_scope.includes('all')) {
    query = query.in('change_scope', filters.change_scope);
  }
  if (filters.change_type?.length && !filters.change_type.includes('all')) {
    query = query.in('change_type', filters.change_type);
  }
  if (filters.site_name) query = query.eq('site_name', filters.site_name);
  if (filters.plaque) query = query.eq('plaque', filters.plaque);
  if (filters.dr) query = query.eq('dr', filters.dr);
  if (filters.dor) query = query.eq('dor', filters.dor);

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching parameter changes:', error);
    return [];
  }
  return (data || []) as ParameterChange[];
};

/** Convert parameter changes into milestone format for the store */
export const changesToMilestones = (changes: ParameterChange[]) => {
  const COLORS: Record<string, string> = {
    parameter_tuning: '#f59e0b',
    feature_toggle: '#3b82f6',
    software_upgrade: '#8b5cf6',
  };

  return changes.map(c => ({
    id: `param_change_${c.id}`,
    date: c.change_date.split('T')[0],
    label: `${c.change_type === 'software_upgrade' ? 'SW' : c.change_type === 'feature_toggle' ? 'Feature' : 'Param'}: ${c.param_name}`,
    color: COLORS[c.change_type] || '#6b7280',
  }));
};
