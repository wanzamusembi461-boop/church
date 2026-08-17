import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { LoadingState, EmptyState } from '@/components/ui/Loading';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate, startOfMonth, endOfMonth } from '@/lib/utils';
import { AlertTriangle, Search } from 'lucide-react';

interface Defaulter {
  member_id: string;
  member_name: string;
  phone: string;
  category_name: string;
  expected: number;
  paid: number;
  outstanding: number;
  last_payment: string | null;
  days_overdue: number;
}

export function Defaulters() {
  const [defaulters, setDefaulters] = useState<Defaulter[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => { loadCategories(); loadDefaulters(); }, [categoryFilter]);

  async function loadCategories() {
    const { data } = await supabase.from('contribution_categories').select('id, name').eq('is_active', true).order('name');
    setCategories(data || []);
  }

  async function loadDefaulters() {
    setLoading(true);
    const now = new Date();
    const ms = startOfMonth(now).toISOString();
    const me = endOfMonth(now).toISOString();

    let reqQuery = supabase.from('contribution_requirements').select('member_id, expected_amount, category_id, category:contribution_categories(name), member:members(full_name, phone_number, is_active)').eq('is_active', true);
    if (categoryFilter !== 'all') reqQuery = reqQuery.eq('category_id', categoryFilter);
    const { data: requirements } = await reqQuery;

    if (!requirements || requirements.length === 0) { setDefaulters([]); setLoading(false); return; }

    const { data: txs } = await supabase.from('transactions').select('member_id, category_id, amount, transaction_date').eq('status', 'completed').gte('transaction_date', ms).lte('transaction_date', me);

    const paidMap = new Map<string, { amount: number; date: string | null }>();
    (txs || []).forEach((t: any) => {
      const key = `${t.member_id}_${t.category_id}`;
      const existing = paidMap.get(key);
      if (existing) { existing.amount += Number(t.amount); if (t.transaction_date && (!existing.date || t.transaction_date > existing.date)) existing.date = t.transaction_date; }
      else paidMap.set(key, { amount: Number(t.amount), date: t.transaction_date || null });
    });

    const defList: Defaulter[] = [];
    (requirements as any[]).forEach((r: any) => {
      if (!r.member?.is_active) return;
      const key = `${r.member_id}_${r.category_id}`;
      const paid = paidMap.get(key)?.amount || 0;
      const expected = Number(r.expected_amount);
      if (paid < expected) {
        const lastPayment = paidMap.get(key)?.date || null;
        const daysOverdue = lastPayment ? 0 : Math.floor((Date.now() - startOfMonth(now).getTime()) / (1000 * 60 * 60 * 24));
        defList.push({
          member_id: r.member_id, member_name: r.member.full_name, phone: r.member.phone_number,
          category_name: r.category?.name || 'Unknown', expected, paid, outstanding: expected - paid,
          last_payment: lastPayment, days_overdue: daysOverdue,
        });
      }
    });

    defList.sort((a, b) => b.outstanding - a.outstanding);
    setDefaulters(defList);
    setLoading(false);
  }

  const filtered = defaulters.filter(d =>
    !search || d.member_name.toLowerCase().includes(search.toLowerCase()) || d.phone.includes(search)
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input className="input pl-10" placeholder="Search by name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="all">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4"><p className="text-xs text-neutral-500">Total Defaulters</p><p className="text-xl font-semibold text-error-600">{filtered.length}</p></div>
        <div className="card p-4"><p className="text-xs text-neutral-500">Total Outstanding</p><p className="text-xl font-semibold text-warning-600">{formatCurrency(filtered.reduce((s, d) => s + d.outstanding, 0))}</p></div>
        <div className="card p-4"><p className="text-xs text-neutral-500">Categories Affected</p><p className="text-xl font-semibold">{new Set(filtered.map(d => d.category_name)).size}</p></div>
      </div>

      <div className="card">
        {loading ? <LoadingState /> : filtered.length === 0 ? (
          <EmptyState icon={<AlertTriangle className="w-12 h-12" />} title="No defaulters" description="All active members with contribution requirements have met their obligations this month." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Member</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Category</th>
                  <th className="text-right px-4 py-3 font-medium">Expected</th>
                  <th className="text-right px-4 py-3 font-medium">Paid</th>
                  <th className="text-right px-4 py-3 font-medium">Outstanding</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Last Payment</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filtered.map((d, i) => (
                  <tr key={i} className="hover:bg-neutral-50">
                    <td className="px-4 py-3"><p className="font-medium text-neutral-900">{d.member_name}</p><p className="text-xs text-neutral-400">{d.phone}</p></td>
                    <td className="px-4 py-3 hidden sm:table-cell text-neutral-600">{d.category_name}</td>
                    <td className="px-4 py-3 text-right text-neutral-600">{formatCurrency(d.expected)}</td>
                    <td className="px-4 py-3 text-right text-success-600">{formatCurrency(d.paid)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-error-600">{formatCurrency(d.outstanding)}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-neutral-500 text-xs">{d.last_payment ? formatDate(d.last_payment) : 'Never'}</td>
                    <td className="px-4 py-3"><Badge variant={d.paid === 0 ? 'error' : 'warning'}>{d.paid === 0 ? 'Unpaid' : 'Partial'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
