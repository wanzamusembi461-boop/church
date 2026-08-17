import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { LoadingState, EmptyState } from '@/components/ui/Loading';
import { Pagination } from '@/components/ui/Pagination';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { FileText, Search, Download, FileSpreadsheet, File as FileIcon } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type ReportType = 'daily' | 'weekly' | 'monthly' | 'annual' | 'member' | 'category' | 'defaulters' | 'unmatched' | 'duplicates';

export function Reports() {
  const [reportType, setReportType] = useState<ReportType>('monthly');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const perPage = 25;

  const reportTypes: { value: ReportType; label: string }[] = [
    { value: 'daily', label: 'Daily Contributions' },
    { value: 'weekly', label: 'Weekly Contributions' },
    { value: 'monthly', label: 'Monthly Contributions' },
    { value: 'annual', label: 'Annual Contributions' },
    { value: 'member', label: 'Member Contributions' },
    { value: 'category', label: 'Category Report' },
    { value: 'defaulters', label: 'Defaulters Report' },
    { value: 'unmatched', label: 'Unmatched Payments' },
    { value: 'duplicates', label: 'Duplicate Transactions' },
  ];

  const loadReport = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('transactions').select('*, member:members(full_name, phone_number), category:contribution_categories(name), sms:sms_messages(raw_text)', { count: 'exact' });
    if (reportType === 'duplicates') {
      query = supabase.from('sms_messages').select('*, member:members(full_name)', { count: 'exact' }).eq('processing_status', 'duplicate');
    } else if (reportType === 'unmatched') {
      query = supabase.from('unmatched_transactions').select('*, sms:sms_messages(raw_text)', { count: 'exact' }).eq('status', 'unmatched');
    } else if (reportType === 'defaulters') {
      // Handled separately
      const now = new Date();
      const ms = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const me = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();
      const { data: reqs } = await supabase.from('contribution_requirements').select('member_id, expected_amount, category_id, member:members(full_name, phone_number), category:contribution_categories(name)').eq('is_active', true);
      const { data: txs } = await supabase.from('transactions').select('member_id, category_id, amount').eq('status', 'completed').gte('transaction_date', ms).lte('transaction_date', me);
      const paidMap = new Map<string, number>();
      (txs || []).forEach((t: any) => { const k = `${t.member_id}_${t.category_id}`; paidMap.set(k, (paidMap.get(k) || 0) + Number(t.amount)); });
      const defList = (reqs || []).filter((r: any) => {
        if (!r.member) return false;
        const paid = paidMap.get(`${r.member_id}_${r.category_id}`) || 0;
        return paid < Number(r.expected_amount);
      }).map((r: any) => ({
        ...r, paid: paidMap.get(`${r.member_id}_${r.category_id}`) || 0,
        outstanding: Number(r.expected_amount) - (paidMap.get(`${r.member_id}_${r.category_id}`) || 0),
      }));
      setData(defList); setTotal(defList.length); setLoading(false); return;
    } else {
      query = query.eq('status', 'completed');
      if (dateFrom) query = query.gte('transaction_date', new Date(dateFrom).toISOString());
      if (dateTo) query = query.lte('transaction_date', new Date(dateTo + 'T23:59:59').toISOString());
      if (reportType === 'daily') { const d = new Date(); query = query.gte('transaction_date', new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()); }
      if (reportType === 'weekly') { const d = new Date(); d.setDate(d.getDate() - 7); query = query.gte('transaction_date', d.toISOString()); }
      if (reportType === 'monthly') { const d = new Date(); query = query.gte('transaction_date', new Date(d.getFullYear(), d.getMonth(), 1).toISOString()); }
      if (reportType === 'annual') { const d = new Date(); query = query.gte('transaction_date', new Date(d.getFullYear(), 0, 1).toISOString()); }
      if (search) query = query.or(`reference.ilike.%${search}%,member.full_name.ilike.%${search}%`);
      query = query.order('transaction_date', { ascending: false }).range((page - 1) * perPage, page * perPage - 1);
    }
    const { data: result, count } = await query;
    setData(result || []);
    setTotal(count || 0);
    setLoading(false);
  }, [reportType, dateFrom, dateTo, search, page]);

  useEffect(() => { loadReport(); }, [loadReport]);

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(data.map((d: any) => {
      if (reportType === 'defaulters') return { Member: d.member?.full_name, Phone: d.member?.phone_number, Category: d.category?.name, Expected: d.expected_amount, Paid: d.paid, Outstanding: d.outstanding };
      if (reportType === 'unmatched') return { Amount: d.amount, Reference: d.reference, Phone: d.phone_number, Sender: d.sender_name, Date: d.transaction_date };
      if (reportType === 'duplicates') return { Reference: d.parsed_reference, Amount: d.parsed_amount, Phone: d.parsed_phone, Date: d.received_at, Reason: d.error_message };
      return { Member: d.member?.full_name, Phone: d.member?.phone_number, Category: d.category?.name, Amount: d.amount, Reference: d.reference, Provider: d.provider, Date: d.transaction_date, Status: d.status };
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `${reportType}_report_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function exportCSV() {
    const headers = reportType === 'defaulters' ? ['Member', 'Phone', 'Category', 'Expected', 'Paid', 'Outstanding'] :
      reportType === 'unmatched' ? ['Amount', 'Reference', 'Phone', 'Sender', 'Date'] :
      reportType === 'duplicates' ? ['Reference', 'Amount', 'Phone', 'Date', 'Reason'] :
      ['Member', 'Phone', 'Category', 'Amount', 'Reference', 'Provider', 'Date', 'Status'];
    const rows = data.map((d: any) => reportType === 'defaulters' ? [d.member?.full_name, d.member?.phone_number, d.category?.name, d.expected_amount, d.paid, d.outstanding] :
      reportType === 'unmatched' ? [d.amount, d.reference, d.phone_number, d.sender_name, d.transaction_date] :
      reportType === 'duplicates' ? [d.parsed_reference, d.parsed_amount, d.parsed_phone, d.received_at, d.error_message] :
      [d.member?.full_name, d.member?.phone_number, d.category?.name, d.amount, d.reference, d.provider, d.transaction_date, d.status]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c ?? ''}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${reportType}_report_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  }

  function exportPDF() {
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text('Church Contribution Report', 14, 20);
    doc.setFontSize(10); doc.text(`Type: ${reportTypes.find(r => r.value === reportType)?.label}`, 14, 28);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 34);
    const head = reportType === 'defaulters' ? [['Member', 'Phone', 'Category', 'Expected', 'Paid', 'Outstanding']] :
      reportType === 'unmatched' ? [['Amount', 'Reference', 'Phone', 'Sender', 'Date']] :
      reportType === 'duplicates' ? [['Reference', 'Amount', 'Phone', 'Date', 'Reason']] :
      [['Member', 'Phone', 'Category', 'Amount', 'Reference', 'Date']];
    const body = data.map((d: any) => reportType === 'defaulters' ? [d.member?.full_name, d.member?.phone_number, d.category?.name, formatCurrency(d.expected_amount), formatCurrency(d.paid), formatCurrency(d.outstanding)] :
      reportType === 'unmatched' ? [formatCurrency(d.amount), d.reference, d.phone_number, d.sender_name, formatDate(d.transaction_date)] :
      reportType === 'duplicates' ? [d.parsed_reference, formatCurrency(d.parsed_amount || 0), d.parsed_phone, formatDate(d.received_at), d.error_message] :
      [d.member?.full_name, d.member?.phone_number, d.category?.name, formatCurrency(d.amount), d.reference, formatDate(d.transaction_date)]);
    autoTable(doc, { head, body, startY: 40, styles: { fontSize: 8 }, headStyles: { fillColor: [46, 111, 94] } });
    doc.save(`${reportType}_report_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <select className="input w-auto" value={reportType} onChange={(e) => { setReportType(e.target.value as ReportType); setPage(1); }}>
          {reportTypes.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <input type="date" className="input w-auto" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="From date" />
        <input type="date" className="input w-auto" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="To date" />
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input className="input pl-10" placeholder="Search..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="flex gap-1">
          <button className="btn-secondary" onClick={exportExcel} title="Export to Excel"><FileSpreadsheet className="w-4 h-4" /></button>
          <button className="btn-secondary" onClick={exportCSV} title="Export to CSV"><Download className="w-4 h-4" /></button>
          <button className="btn-secondary" onClick={exportPDF} title="Export to PDF"><FileIcon className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="card">
        {loading ? <LoadingState /> : data.length === 0 ? (
          <EmptyState icon={<FileText className="w-12 h-12" />} title="No data" description="No records found for this report with the current filters." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
                  <tr>
                    {reportType === 'defaulters' ? <><th className="text-left px-4 py-3 font-medium">Member</th><th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Category</th><th className="text-right px-4 py-3 font-medium">Expected</th><th className="text-right px-4 py-3 font-medium">Paid</th><th className="text-right px-4 py-3 font-medium">Outstanding</th></> :
                      reportType === 'unmatched' ? <><th className="text-left px-4 py-3 font-medium">Amount</th><th className="text-left px-4 py-3 font-medium">Reference</th><th className="text-left px-4 py-3 font-medium">Phone</th><th className="text-left px-4 py-3 font-medium hidden md:table-cell">Date</th></> :
                      reportType === 'duplicates' ? <><th className="text-left px-4 py-3 font-medium">Reference</th><th className="text-left px-4 py-3 font-medium">Amount</th><th className="text-left px-4 py-3 font-medium">Phone</th><th className="text-left px-4 py-3 font-medium hidden md:table-cell">Date</th><th className="text-left px-4 py-3 font-medium">Reason</th></> :
                      <><th className="text-left px-4 py-3 font-medium">Member</th><th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Category</th><th className="text-right px-4 py-3 font-medium">Amount</th><th className="text-left px-4 py-3 font-medium hidden md:table-cell">Reference</th><th className="text-left px-4 py-3 font-medium">Date</th><th className="text-left px-4 py-3 font-medium">Status</th></>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {data.map((d: any, i) => (
                    <tr key={d.id || i} className="hover:bg-neutral-50">
                      {reportType === 'defaulters' ? <>
                        <td className="px-4 py-3"><p className="font-medium">{d.member?.full_name}</p><p className="text-xs text-neutral-400">{d.member?.phone_number}</p></td>
                        <td className="px-4 py-3 hidden sm:table-cell">{d.category?.name}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(Number(d.expected_amount))}</td>
                        <td className="px-4 py-3 text-right text-success-600">{formatCurrency(d.paid)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-error-600">{formatCurrency(d.outstanding)}</td>
                      </> : reportType === 'unmatched' ? <>
                        <td className="px-4 py-3 font-semibold">{formatCurrency(Number(d.amount))}</td>
                        <td className="px-4 py-3 font-mono text-xs">{d.reference || '—'}</td>
                        <td className="px-4 py-3">{d.phone_number || '—'}</td>
                        <td className="px-4 py-3 hidden md:table-cell text-xs">{formatDate(d.transaction_date)}</td>
                      </> : reportType === 'duplicates' ? <>
                        <td className="px-4 py-3 font-mono text-xs">{d.parsed_reference || '—'}</td>
                        <td className="px-4 py-3 font-semibold">{d.parsed_amount ? formatCurrency(Number(d.parsed_amount)) : '—'}</td>
                        <td className="px-4 py-3">{d.parsed_phone || '—'}</td>
                        <td className="px-4 py-3 hidden md:table-cell text-xs">{formatDate(d.received_at)}</td>
                        <td className="px-4 py-3 text-xs text-neutral-500">{d.error_message}</td>
                      </> : <>
                        <td className="px-4 py-3"><p className="font-medium">{d.member?.full_name || 'Unknown'}</p><p className="text-xs text-neutral-400">{d.member?.phone_number || '—'}</p></td>
                        <td className="px-4 py-3 hidden sm:table-cell">{d.category?.name || '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-success-600">{formatCurrency(Number(d.amount))}</td>
                        <td className="px-4 py-3 hidden md:table-cell font-mono text-xs">{d.reference || '—'}</td>
                        <td className="px-4 py-3 text-xs">{formatDate(d.transaction_date)}</td>
                        <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                      </>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {reportType !== 'defaulters' && <Pagination page={page} totalPages={Math.ceil(total / perPage)} onPageChange={setPage} totalItems={total} itemsPerPage={perPage} />}
          </>
        )}
      </div>
    </div>
  );
}
