import { supabase } from '@/lib/supabase';
import type { AuditLog } from '@/types';

export async function logAudit(
  action: string,
  entityType?: string,
  entityId?: string,
  details?: string,
  beforeValues?: Record<string, unknown>,
  afterValues?: Record<string, unknown>
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const entry: Partial<AuditLog> = {
      actor_id: user?.id,
      actor_name: user?.email,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
      before_values: beforeValues,
      after_values: afterValues,
    };
    await supabase.from('audit_logs').insert(entry);
  } catch {
    // Audit logging should not block operations
  }
}
