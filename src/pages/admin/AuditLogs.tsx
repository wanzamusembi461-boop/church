import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { LoadingState, EmptyState } from '@/components/ui/Loading';
import { Pagination } from '@/components/ui/Pagination';
import { formatDate } from '@/lib/utils';
import type { AuditLog } from '@/types';
import { ScrollText, Search } from 'lucide-react';

export function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const perPage = 25;

  useEffect(() => { loadLogs(); }, [search, page]);

  async function loadLogs() {
    setLoading(true);
    let query = supabase.from('audit_logs').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (search) query = query.or(`action.ilike.%${search}%,actor_name.ilike.%${search}%,details.ilike.%${search}%`);
    query = query.range((page - 1) * perPage, page * perPage - 1);
    const { data, count } = await query;
    setLogs((data || []) as AuditLog[]);
    setTotal(count || 0); setTotalPages(Math.ceil((count || 0) / perPage));
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input className="input pl-10" placeholder="Search by action, user, or details..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>

      <div className="card">
        {loading ? <LoadingState /> : logs.length === 0 ? (
          <EmptyState icon={<ScrollText className="w-12 h-12" />} title="No audit logs" description="System actions will be logged here for accountability." />
        ) : (
          <>
            <div className="divide-y divide-neutral-100 max-h-[60vh] overflow-y-auto">
              {logs.map((log) => (
                <div key={log.id} className="p-4 hover:bg-neutral-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="inline-flex items-center gap-1 text-xs font-mono font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded">{log.action}</span>
                      </div>
                      <p className="text-sm text-neutral-600">{log.details || '—'}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-neutral-400">
                        <span>By: {log.actor_name || 'System'}</span>
                        <span>{formatDate(log.created_at, true)}</span>
                        {log.entity_type && <span className="capitalize">on: {log.entity_type}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={total} itemsPerPage={perPage} />
          </>
        )}
      </div>
    </div>
  );
}
