import { useEffect, useState } from 'react';
import {
  Users, Wallet, TrendingUp, AlertTriangle, MessageSquare, Bell,
  ArrowUpRight, ArrowDownRight, Calendar
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate, monthKey, monthLabel, startOfMonth, endOfMonth } from '@/lib/utils';
import { LoadingState, CardSkeleton } from '@/components/ui/Loading';

interface DashboardStats {
  totalMembers: number;
  activeMembers: number;
  totalContributions: number;
  contributionsThisMonth: number;
  todayContributions: number;
  outstanding: number;
  defaulters: number;
  unmatched: number;
}

const COLORS = ['#2e6f5e', '#5aa693', '#8cc4b7', '#ef841f', '#f5a03b', '#db6713', '#b64c12'];

export function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [monthlyTrend, setMonthlyTrend] = useState<{ month: string; total: number }[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<{ name: string; total: number }[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    try {
      const now = new Date();
      const monthStart = startOfMonth(now).toISOString();
      const monthEnd = endOfMonth(now).toISOString();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

      // Run queries in parallel
      const [membersRes, activeMembersRes, totalContribRes, monthContribRes, todayContribRes, unmatchedRes, recentTxRes, categoriesRes] = await Promise.all([
        supabase.from('members').select('id', { count: 'exact', head: true }).eq('role', 'member'),
        supabase.from('members').select('id', { count: 'exact', head: true }).eq('role', 'member').eq('is_active', true),
        supabase.from('transactions').select('amount').eq('status', 'completed'),
        supabase.from('transactions').select('amount').eq('status', 'completed').gte('transaction_date', monthStart).lte('transaction_date', monthEnd),
        supabase.from('transactions').select('amount').eq('status', 'completed').gte('transaction_date', todayStart),
        supabase.from('unmatched_transactions').select('id', { count: 'exact', head: true }).eq('status', 'unmatched'),
        supabase.from('transactions').select('*, member:members(full_name, phone_number), category:contribution_categories(name)').eq('status', 'completed').order('created_at', { ascending: false }).limit(8),
        supabase.from('contribution_categories').select('id, name'),
      ]);

      const totalContributions = (totalContribRes.data || []).reduce((sum: number, t: any) => sum + Number(t.amount), 0);
      const contributionsThisMonth = (monthContribRes.data || []).reduce((sum: number, t: any) => sum + Number(t.amount), 0);
      const todayContributions = (todayContribRes.data || []).reduce((sum: number, t: any) => sum + Number(t.amount), 0);

      // Calculate defaulters: members with active requirements where paid < expected for current month
      const { data: requirements } = await supabase
        .from('contribution_requirements')
        .select('member_id, expected_amount, category_id')
        .eq('is_active', true);

      let defaultersCount = 0;
      let outstandingTotal = 0;
      if (requirements && requirements.length > 0) {
        // Get all completed transactions grouped by member+category for this month
        const { data: monthTxs } = await supabase
          .from('transactions')
          .select('member_id, category_id, amount')
          .eq('status', 'completed')
          .gte('transaction_date', monthStart)
          .lte('transaction_date', monthEnd);

        const paidMap = new Map<string, number>();
        (monthTxs || []).forEach((t: any) => {
          const key = `${t.member_id}_${t.category_id}`;
          paidMap.set(key, (paidMap.get(key) || 0) + Number(t.amount));
        });

        for (const req of requirements) {
          const key = `${req.member_id}_${req.category_id}`;
          const paid = paidMap.get(key) || 0;
          const expected = Number(req.expected_amount);
          if (paid < expected) {
            defaultersCount++;
            outstandingTotal += (expected - paid);
          }
        }
      }

      setStats({
        totalMembers: membersRes.count || 0,
        activeMembers: activeMembersRes.count || 0,
        totalContributions,
        contributionsThisMonth,
        todayContributions,
        outstanding: outstandingTotal,
        defaulters: defaultersCount,
        unmatched: unmatchedRes.count || 0,
      });

      setRecentTransactions(recentTxRes.data || []);

      // Monthly trend - last 6 months
      const trends: { month: string; total: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const ms = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
        const me = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
        const { data: mt } = await supabase
          .from('transactions')
          .select('amount')
          .eq('status', 'completed')
          .gte('transaction_date', ms)
          .lte('transaction_date', me);
        const total = (mt || []).reduce((s: number, t: any) => s + Number(t.amount), 0);
        trends.push({ month: monthLabel(monthKey(d)), total });
      }
      setMonthlyTrend(trends);

      // Category breakdown
      const catBreakdown: { name: string; total: number }[] = [];
      for (const cat of categoriesRes.data || []) {
        const { data: catTxs } = await supabase
          .from('transactions')
          .select('amount')
          .eq('category_id', cat.id)
          .eq('status', 'completed');
        const total = (catTxs || []).reduce((s: number, t: any) => s + Number(t.amount), 0);
        if (total > 0) catBreakdown.push({ name: cat.name, total });
      }
      // Add uncategorized
      const { data: uncategorized } = await supabase
        .from('transactions')
        .select('amount')
        .is('category_id', null)
        .eq('status', 'completed');
      const uncTotal = (uncategorized || []).reduce((s: number, t: any) => s + Number(t.amount), 0);
      if (uncTotal > 0) catBreakdown.push({ name: 'Uncategorized', total: uncTotal });
      setCategoryBreakdown(catBreakdown);
    } catch (err) {
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
        <div className="card p-6"><LoadingState message="Loading dashboard..." /></div>
      </div>
    );
  }

  if (!stats) return <LoadingState />;

  const cards = [
    { label: 'Total Members', value: stats.totalMembers.toString(), sub: `${stats.activeMembers} active`, icon: Users, color: 'bg-primary-100 text-primary-600' },
    { label: 'Total Contributions', value: formatCurrency(stats.totalContributions), sub: 'All time', icon: Wallet, color: 'bg-success-100 text-success-600' },
    { label: 'This Month', value: formatCurrency(stats.contributionsThisMonth), sub: formatDate(startOfMonth()) + ' →', icon: TrendingUp, color: 'bg-accent-100 text-accent-600' },
    { label: 'Today', value: formatCurrency(stats.todayContributions), sub: formatDate(new Date()), icon: Calendar, color: 'bg-primary-100 text-primary-600' },
    { label: 'Outstanding', value: formatCurrency(stats.outstanding), sub: 'Unpaid this month', icon: AlertTriangle, color: 'bg-warning-100 text-warning-600' },
    { label: 'Defaulters', value: stats.defaulters.toString(), sub: 'Members behind', icon: AlertTriangle, color: 'bg-error-100 text-error-600' },
    { label: 'Unmatched', value: stats.unmatched.toString(), sub: 'Pending assignment', icon: MessageSquare, color: 'bg-warning-100 text-warning-600' },
    { label: 'Active', value: stats.activeMembers.toString(), sub: 'Of ' + stats.totalMembers, icon: Users, color: 'bg-success-100 text-success-600' },
  ];

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <div key={i} className="card p-4 lg:p-5 animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex items-start justify-between mb-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${c.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
              <p className="text-xs text-neutral-500 mb-1">{c.label}</p>
              <p className="text-lg lg:text-xl font-semibold text-neutral-900 truncate">{c.value}</p>
              <p className="text-xs text-neutral-400 mt-1">{c.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly trend */}
        <div className="card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-neutral-700 mb-4">Monthly Contribution Trend</h3>
          {monthlyTrend.length > 0 && monthlyTrend.some(m => m.total > 0) ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={monthlyTrend}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2e6f5e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2e6f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                <Area type="monotone" dataKey="total" stroke="#2e6f5e" strokeWidth={2} fill="url(#colorTotal)" name="Contributions" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-sm text-neutral-400">No contribution data yet</div>
          )}
        </div>

        {/* Category breakdown */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-neutral-700 mb-4">By Category</h3>
          {categoryBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={categoryBreakdown} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                  {categoryBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-sm text-neutral-400">No category data yet</div>
          )}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="card">
        <div className="p-5 border-b border-neutral-100">
          <h3 className="text-sm font-semibold text-neutral-700">Recent Transactions</h3>
        </div>
        {recentTransactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">Member</th>
                  <th className="text-left px-5 py-3 font-medium hidden sm:table-cell">Category</th>
                  <th className="text-right px-5 py-3 font-medium">Amount</th>
                  <th className="text-left px-5 py-3 font-medium hidden md:table-cell">Reference</th>
                  <th className="text-left px-5 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {recentTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-neutral-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-neutral-900 truncate">{tx.member?.full_name || 'Unknown'}</p>
                      <p className="text-xs text-neutral-400">{tx.member?.phone_number || '—'}</p>
                    </td>
                    <td className="px-5 py-3 hidden sm:table-cell text-neutral-600">{tx.category?.name || 'Uncategorized'}</td>
                    <td className="px-5 py-3 text-right font-semibold text-success-600">{formatCurrency(Number(tx.amount))}</td>
                    <td className="px-5 py-3 hidden md:table-cell text-neutral-500 text-xs font-mono">{tx.reference || '—'}</td>
                    <td className="px-5 py-3 text-neutral-500 text-xs">{formatDate(tx.transaction_date || tx.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-neutral-400">No transactions yet. They will appear here once SMS payments are processed.</div>
        )}
      </div>
    </div>
  );
}
