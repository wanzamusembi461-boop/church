import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { LoadingState, EmptyState } from '@/components/ui/Loading';
import { formatCurrency, formatDate, startOfMonth, endOfMonth } from '@/lib/utils';
import type { ContributionCategory, Transaction, Notification } from '@/types';
import { Wallet, TrendingUp, AlertTriangle, Bell, ArrowRight, Eye } from 'lucide-react';

export function MemberDashboard() {
  const { member } = useAuth();
  const [loading, setLoading] = useState(true);
  const [totalContributed, setTotalContributed] = useState(0);
  const [monthContributed, setMonthContributed] = useState(0);
  const [outstanding, setOutstanding] = useState(0);
  const [categories, setCategories] = useState<{ cat: ContributionCategory; expected: number; paid: number }[]>([]);
  const [recentTxs, setRecentTxs] = useState<Transaction[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => { if (member) loadData(); }, [member]);

  async function loadData() {
    setLoading(true);
    const now = new Date();
    const ms = startOfMonth(now).toISOString();
    const me = endOfMonth(now).toISOString();

    const [txRes, monthTxRes, catRes, reqRes, notifRes] = await Promise.all([
      supabase.from('transactions').select('amount').eq('member_id', member!.id).eq('status', 'completed'),
      supabase.from('transactions').select('amount').eq('member_id', member!.id).eq('status', 'completed').gte('transaction_date', ms).lte('transaction_date', me),
      supabase.from('contribution_categories').select('*').eq('is_active', true),
      supabase.from('contribution_requirements').select('category_id, expected_amount').eq('member_id', member!.id).eq('is_active', true),
      supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(5),
    ]);

    const total = (txRes.data || []).reduce((s: number, t: any) => s + Number(t.amount), 0);
    const monthTotal = (monthTxRes.data || []).reduce((s: number, t: any) => s + Number(t.amount), 0);
    setTotalContributed(total);
    setMonthContributed(monthTotal);

    // Categories with progress
    const reqMap = new Map<string, number>();
    (reqRes.data || []).forEach((r: any) => reqMap.set(r.category_id, Number(r.expected_amount)));

    const monthTxs = monthTxRes.data || [];
    const paidMap = new Map<string, number>();
    const { data: allMonthTxs } = await supabase.from('transactions').select('category_id, amount').eq('member_id', member!.id).eq('status', 'completed').gte('transaction_date', ms).lte('transaction_date', me);
    (allMonthTxs || []).forEach((t: any) => { if (t.category_id) paidMap.set(t.category_id, (paidMap.get(t.category_id) || 0) + Number(t.amount)); });

    const catData = (catRes.data || []).map((c: any) => ({
      cat: c as ContributionCategory,
      expected: reqMap.get(c.id) || Number(c.monthly_requirement) || 0,
      paid: paidMap.get(c.id) || 0,
    })).filter(item => item.expected > 0 || item.paid > 0);

    setCategories(catData);

    const outstandingTotal = catData.reduce((s, item) => s + Math.max(0, item.expected - item.paid), 0);
    setOutstanding(outstandingTotal);

    const { data: recentData } = await supabase.from('transactions').select('*, category:contribution_categories(name)').eq('member_id', member!.id).eq('status', 'completed').order('transaction_date', { ascending: false }).limit(5);
    setRecentTxs((recentData || []) as Transaction[]);
    setNotifications((notifRes.data || []) as Notification[]);
    setLoading(false);
  }

  if (loading) return <LoadingState message="Loading your dashboard..." />;

  const cards = [
    { label: 'Total Contributed', value: formatCurrency(totalContributed), icon: Wallet, color: 'bg-success-100 text-success-600' },
    { label: 'This Month', value: formatCurrency(monthContributed), icon: TrendingUp, color: 'bg-primary-100 text-primary-600' },
    { label: 'Outstanding', value: formatCurrency(outstanding), icon: AlertTriangle, color: 'bg-warning-100 text-warning-600' },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-serif font-semibold">Welcome, {member?.full_name?.split(' ')[0]}</h2>
        <p className="text-sm text-neutral-500">{formatDate(new Date())}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <div key={i} className="card p-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${c.color}`}><Icon className="w-5 h-5" /></div>
              <p className="text-xs text-neutral-500">{c.label}</p>
              <p className="text-lg font-semibold text-neutral-900">{c.value}</p>
            </div>
          );
        })}
      </div>

      {/* Contribution overview */}
      <div className="card">
        <div className="p-4 border-b border-neutral-100"><h3 className="text-sm font-semibold">Contribution Overview</h3></div>
        {categories.length === 0 ? (
          <EmptyState title="No active contributions" description="Your contribution categories will appear here once the church sets them up." />
        ) : (
          <div className="divide-y divide-neutral-100">
            {categories.map(({ cat, expected, paid }) => {
              const remaining = Math.max(0, expected - paid);
              const pct = expected > 0 ? Math.min(100, (paid / expected) * 100) : 100;
              return (
                <div key={cat.id} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-neutral-900">{cat.name}</h4>
                    <span className={`text-xs font-medium ${remaining > 0 ? 'text-warning-600' : 'text-success-600'}`}>{remaining > 0 ? `${formatCurrency(remaining)} left` : 'Complete'}</span>
                  </div>
                  <div className="flex justify-between text-xs text-neutral-500 mb-1.5"><span>Paid: {formatCurrency(paid)}</span><span>Expected: {formatCurrency(expected)}</span></div>
                  <div className="h-2 bg-neutral-100 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all ${remaining > 0 ? 'bg-primary-500' : 'bg-success-500'}`} style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent payments */}
      <div className="card">
        <div className="p-4 border-b border-neutral-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Recent Payments</h3>
          <Link to="/member/contributions" className="text-xs text-primary-600 flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></Link>
        </div>
        {recentTxs.length === 0 ? (
          <EmptyState title="No payments yet" description="Your payment history will appear here once contributions are recorded." />
        ) : (
          <div className="divide-y divide-neutral-100">
            {recentTxs.map((tx) => (
              <div key={tx.id} className="p-4 flex items-center justify-between">
                <div><p className="text-sm font-medium text-neutral-900">{tx.category?.name || 'Contribution'}</p><p className="text-xs text-neutral-400">{formatDate(tx.transaction_date || tx.created_at)} · {tx.reference || '—'}</p></div>
                <p className="text-sm font-semibold text-success-600">{formatCurrency(Number(tx.amount))}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="card">
          <div className="p-4 border-b border-neutral-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Notifications</h3>
            <Link to="/member/notifications" className="text-xs text-primary-600 flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></Link>
          </div>
          <div className="divide-y divide-neutral-100">
            {notifications.slice(0, 3).map((n) => (
              <div key={n.id} className="p-4 flex items-start gap-3">
                <Bell className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />
                <div><p className="text-sm font-medium text-neutral-900">{n.title}</p><p className="text-xs text-neutral-500 line-clamp-1">{n.message}</p></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
