import { supabase } from '@/integrations/supabase/client';

export interface SavedInvestigator {
  id: string;
  name: string;
  context: any;
  created_at: string;
  updated_at: string;
}

/** List all saved investigators (newest first) */
export async function listInvestigators(): Promise<SavedInvestigator[]> {
  const { data, error } = await supabase
    .from('investigators')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []) as SavedInvestigator[];
}

/** Save a new investigator */
export async function createInvestigator(name: string, context: any): Promise<SavedInvestigator> {
  const { data, error } = await supabase
    .from('investigators')
    .insert({ name, context })
    .select()
    .single();
  if (error) throw error;
  return data as SavedInvestigator;
}

/** Update an existing investigator */
export async function updateInvestigator(id: string, name: string, context: any): Promise<SavedInvestigator> {
  const { data, error } = await supabase
    .from('investigators')
    .update({ name, context, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as SavedInvestigator;
}

/** Delete an investigator */
export async function deleteInvestigator(id: string): Promise<void> {
  const { error } = await supabase
    .from('investigators')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

/** Load a single investigator */
export async function loadInvestigator(id: string): Promise<SavedInvestigator> {
  const { data, error } = await supabase
    .from('investigators')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as SavedInvestigator;
}
