import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { LoadingState, EmptyState } from '@/components/ui/Loading';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Transaction, ChurchSettings } from '@/types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileText, Download, Printer } from 'lucide-react';

export function MemberStatement() {
  const { member } = useAuth();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [church, setChurch] = useState<ChurchSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    if (!member) return;
    const [txRes, churchRes] = await Promise.all([
      supabase.from('transactions').select('*, category:contribution_categories(name)').eq('member_id', member.id).eq('status', 'completed').order('transaction_date', { ascending: true }),
      supabase.from('church_settings').select('*').limit(1).maybeSingle(),
    ]);
    setTxs((txRes.data || []) as Transaction[]);
    setChurch(churchRes.data as ChurchSettings);
    setLoading(false);
  }

  const filtered = txs.filter(t => {
    if (fromDate && t.transaction_date && t.transaction_date < new Date(fromDate).toISOString()) return false;
    if (toDate && t.transaction_date && t.transaction_date > new Date(toDate + 'T23:59:59').toISOString()) return false;
    return true;
  });

  let runningTotal = 0;
  const rows = filtered.map(t => { runningTotal += Number(t.amount); return { ...t, running: runningTotal }; });
  const total = filtered.reduce((s, t) => s + Number(t.amount), 0);

  function downloadPDF() {
    const doc = new jsPDF();
    const churchName = church?.church_name || 'Church';
    doc.setFontSize(18); doc.text(churchName, 14, 20);
    doc.setFontSize(10); doc.text('Contribution Statement', 14, 28);
    doc.text(`Member: ${member?.full_name}`, 14, 38);
    doc.text(`Phone: ${member?.phone_number}`, 14, 44);
    doc.text(`Period: ${fromDate || 'All time'} to ${toDate || 'Present'}`, 14, 50);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 56);
    autoTable(doc, {
      head: [['Date', 'Category', 'Reference', 'Amount', 'Running Total']],
      body: rows.map(r => [formatDate(r.transaction_date || r.created_at), r.category?.name || '—', r.reference || '—', formatCurrency(Number(r.amount)), formatCurrency(r.running)]),
      startY: 62, styles: { fontSize: 8 }, headStyles: { fillColor: [46, 111, 94] },
      foot: [['', '', '', 'Total:', formatCurrency(total)]],
      footStyles: { fillColor: [46, 111, 94], textColor: 255 },
    });
    doc.save(`statement_${member?.phone_number}.pdf`);
  }

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-col sm:flex-row gap-3 items-end">
        <div><label className="label">From</label><input type="date" className="input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div>
        <div><label className="label">To</label><input type="date" className="input" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div>
        <button className="btn-primary" onClick={downloadPDF}><Download className="w-4 h-4" /> PDF</button>
        <button className="btn-secondary" onClick={() => window.print()}><Printer className="w-4 h-4" /> Print</button>
      </div>

      <div className="card p-6">
        <div className="text-center mb-6">
          <h2 className="text-xl font-serif font-semibold">{church?.church_name || 'Church'}</h2>
          <p className="text-sm text-neutral-500">Contribution Statement</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm mb-6">
          <div><span className="text-neutral-500">Member:</span> <span className="font-medium">{member?.full_name}</span></div>
          <div><span className="text-neutral-500">Phone:</span> <span className="font-medium">{member?.phone_number}</span></div>
          <div><span className="text-neutral-500">Period:</span> <span className="font-medium">{fromDate || 'All time'} — {toDate || 'Present'}</span></div>
          <div><span className="text-neutral-500">Generated:</span> <span className="font-medium">{formatDate(new Date())}</span></div>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={<FileText className="w-12 h-12" />} title="No transactions" description="No contributions found for this period." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
                <tr><th className="text-left px-3 py-2">Date</th><th className="text-left px-3 py-2">Category</th><th className="text-left px-3 py-2 hidden sm:table-cell">Reference</th><th className="text-right px-3 py-2">Amount</th><th className="text-right px-3 py-2">Running</th></tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((r) => (
                  <tr key={r.id}><td className="px-3 py-2 text-xs">{formatDate(r.transaction_date || r.created_at)}</td><td className="px-3 py-2">{r.category?.name || '—'}</td><td className="px-3 py-2 hidden sm:table-cell font-mono text-xs">{r.reference || '—'}</td><td className="px-3 py-2 text-right text-success-600 font-medium">{formatCurrency(Number(r.amount))}</td><td className="px-3 py-2 text-right font-medium">{formatCurrency(r.running)}</td></tr>
                ))}
              </tbody>
              <tfoot><tr className="bg-neutral-50 font-semibold"><td colSpan={3} className="px-3 py-2">Total</td><td className="px-3 py-2 text-right text-success-700">{formatCurrency(total)}</td><td></td></tr></tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
