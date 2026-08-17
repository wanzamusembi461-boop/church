import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { LoadingState, EmptyState } from '@/components/ui/Loading';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Transaction } from '@/types';
import { Wallet, Search } from 'lucide-react';

export function MemberContributions() {
  const { member } = useAuth();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { loadTxs(); }, []);

  async function loadTxs() {
    if (!member) return;
    const { data } = await supabase.from('transactions').select('*, category:contribution_categories(name)').eq('member_id', member.id).order('transaction_date', { ascending: false });
    setTxs((data || []) as Transaction[]);
    setLoading(false);
  }

  const filtered = txs.filter(t => !search || (t.reference || '').toLowerCase().includes(search.toLowerCase()) || (t.category?.name || '').toLowerCase().includes(search.toLowerCase()));

  const total = filtered.filter(t => t.status === 'completed').reduce((s, t) => s + Number(t.amount), 0);

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <p className="text-xs text-neutral-500">Total Contributions</p>
        <p className="text-2xl font-semibold text-success-600">{formatCurrency(total)}</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input className="input pl-10" placeholder="Search by reference or category..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <EmptyState icon={<Wallet className="w-12 h-12" />} title="No contributions" description="Your contribution history will appear here." />
        ) : (
          <div className="divide-y divide-neutral-100">
            {filtered.map((tx) => (
              <div key={tx.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-900">{tx.category?.name || 'Contribution'}</p>
                  <p className="text-xs text-neutral-400">{formatDate(tx.transaction_date || tx.created_at)}</p>
                  <p className="text-xs text-neutral-400 font-mono">{tx.reference || '—'}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${tx.status === 'reversed' ? 'text-error-600' : 'text-success-600'}`}>{tx.status === 'reversed' ? '-' : ''}{formatCurrency(Number(tx.amount))}</p>
                  <span className={`text-xs ${tx.status === 'completed' ? 'text-success-600' : 'text-error-600'}`}>{tx.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
