import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/Badge';
import { LoadingState, EmptyState, ErrorState } from '@/components/ui/Loading';
import { Pagination } from '@/components/ui/Pagination';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { SmsMessage, Transaction, Member, ContributionCategory } from '@/types';
import { MessageSquare, Search, Eye, UserPlus, Undo2, Pencil } from 'lucide-react';

export function SmsTransactions() {
  const { toast } = useToast();
  const [tab, setTab] = useState<'sms' | 'unmatched'>('sms');
  const [smsList, setSmsList] = useState<SmsMessage[]>([]);
  const [unmatchedList, setUnmatchedList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const perPage = 15;

  const [viewSms, setViewSms] = useState<SmsMessage | null>(null);
  const [assignModal, setAssignModal] = useState<any | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [categories, setCategories] = useState<ContributionCategory[]>([]);
  const [assignMemberId, setAssignMemberId] = useState('');
  const [editCatModal, setEditCatModal] = useState<Transaction | null>(null);
  const [editCategoryId, setEditCategoryId] = useState('');
  const [reversalModal, setReversalModal] = useState<Transaction | null>(null);
  const [reversalReason, setReversalReason] = useState('');

  useEffect(() => { loadCategories(); loadMembers(); }, []);
  useEffect(() => { if (tab === 'sms') loadSms(); else loadUnmatched(); }, [search, statusFilter, page, tab]);

  async function loadCategories() {
    const { data } = await supabase.from('contribution_categories').select('*').eq('is_active', true).order('name');
    setCategories((data || []) as ContributionCategory[]);
  }
  async function loadMembers() {
    const { data } = await supabase.from('members').select('*').eq('role', 'member').eq('is_active', true).order('full_name');
    setMembers((data || []) as Member[]);
  }

  async function loadSms() {
    setLoading(true);
    let query = supabase.from('sms_messages').select('*', { count: 'exact' }).order('received_at', { ascending: false });
    if (statusFilter !== 'all') query = query.eq('processing_status', statusFilter);
    if (search) query = query.or(`raw_text.ilike.%${search}%,parsed_reference.ilike.%${search}%,parsed_phone.ilike.%${search}%`);
    query = query.range((page - 1) * perPage, page * perPage - 1);
    const { data, count } = await query;
    setSmsList((data || []) as SmsMessage[]);
    setTotal(count || 0);
    setTotalPages(Math.ceil((count || 0) / perPage));
    setLoading(false);
  }

  async function loadUnmatched() {
    setLoading(true);
    let query = supabase.from('unmatched_transactions').select('*, sms:sms_messages(raw_text)').eq('status', 'unmatched').order('created_at', { ascending: false });
    if (search) query = query.or(`phone_number.ilike.%${search}%,reference.ilike.%${search}%,sender_name.ilike.%${search}%`);
    const { data } = await query;
    setUnmatchedList(data || []);
    setLoading(false);
  }

  async function handleAssign() {
    if (!assignModal || !assignMemberId) { toast('Please select a member', 'warning'); return; }
    const member = members.find(m => m.id === assignMemberId);
    if (!member) return;
    // Create transaction
    const { data: tx, error: txError } = await supabase.from('transactions').insert({
      member_id: member.id, sms_message_id: assignModal.sms_message_id,
      amount: Number(assignModal.amount), reference: assignModal.reference || null,
      provider: assignModal.provider || null,
      transaction_date: assignModal.transaction_date || new Date().toISOString(),
      status: 'completed', matched_by: 'manual',
      manually_assigned_by: (await supabase.auth.getUser()).data.user?.id,
      manually_assigned_at: new Date().toISOString(),
    }).select('id').single();
    if (txError) { toast('Failed to create transaction', 'error'); return; }
    // Update unmatched record
    await supabase.from('unmatched_transactions').update({
      status: 'assigned', assigned_to_member_id: member.id,
      assigned_by: (await supabase.auth.getUser()).data.user?.id, assigned_at: new Date().toISOString(),
    }).eq('id', assignModal.id);
    // Update SMS
    await supabase.from('sms_messages').update({
      processing_status: 'processed', transaction_id: tx?.id, member_id: member.id,
    }).eq('id', assignModal.sms_message_id);
    await logAudit('manual_assignment', 'unmatched_transactions', assignModal.id, `Assigned ${formatCurrency(Number(assignModal.amount))} to ${member.full_name}`);
    toast(`Transaction assigned to ${member.full_name}`, 'success');
    setAssignModal(null); setAssignMemberId('');
    loadUnmatched();
  }

  async function handleEditCategory() {
    if (!editCatModal || !editCategoryId) { toast('Please select a category', 'warning'); return; }
    const { error } = await supabase.from('transactions').update({
      category_id: editCategoryId, corrected_by: (await supabase.auth.getUser()).data.user?.id,
      corrected_at: new Date().toISOString(),
    }).eq('id', editCatModal.id);
    if (error) { toast('Failed to update category', 'error'); return; }
    await logAudit('transaction_correction', 'transactions', editCatModal.id, `Changed category for transaction ${editCatModal.reference}`);
    toast('Transaction category updated', 'success');
    setEditCatModal(null); setEditCategoryId('');
    loadSms();
  }

  async function handleReversal() {
    if (!reversalModal || !reversalReason.trim()) { toast('Please provide a reason for reversal', 'warning'); return; }
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const { error } = await supabase.from('transactions').update({ status: 'reversed', corrected_by: userId, corrected_at: new Date().toISOString(), correction_reason: reversalReason }).eq('id', reversalModal.id);
    if (error) { toast('Failed to reverse transaction', 'error'); return; }
    await supabase.from('transaction_reversals').insert({ transaction_id: reversalModal.id, reversed_by: userId, reversal_reason: reversalReason });
    await logAudit('transaction_reversal', 'transactions', reversalModal.id, `Reversed: ${reversalReason}`);
    toast('Transaction reversed', 'success');
    setReversalModal(null); setReversalReason('');
    loadSms();
  }

  return (
    <div className="space-y-4">
      <div className="flex border-b border-neutral-200">
        <button className={`px-4 py-2.5 text-sm font-medium border-b-2 ${tab === 'sms' ? 'border-primary-600 text-primary-600' : 'border-transparent text-neutral-500'}`} onClick={() => { setTab('sms'); setPage(1); }}>SMS Messages</button>
        <button className={`px-4 py-2.5 text-sm font-medium border-b-2 ${tab === 'unmatched' ? 'border-primary-600 text-primary-600' : 'border-transparent text-neutral-500'}`} onClick={() => { setTab('unmatched'); setPage(1); }}>Unmatched ({unmatchedList.length || ''})</button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input className="input pl-10" placeholder="Search by reference, phone, text..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        {tab === 'sms' && (
          <select className="input w-auto" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="all">All Status</option>
            <option value="processed">Processed</option>
            <option value="unmatched">Unmatched</option>
            <option value="duplicate">Duplicate</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
          </select>
        )}
      </div>

      <div className="card">
        {loading ? <LoadingState /> : tab === 'sms' ? (
          smsList.length === 0 ? (
            <EmptyState icon={<MessageSquare className="w-12 h-12" />} title="No SMS messages" description="SMS payment messages will appear here once your SMS Forwarder app starts sending them." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">Amount</th>
                      <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Reference</th>
                      <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Phone</th>
                      <th className="text-left px-4 py-3 font-medium">Status</th>
                      <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Date</th>
                      <th className="text-right px-4 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {smsList.map((sms) => (
                      <tr key={sms.id} className="hover:bg-neutral-50">
                        <td className="px-4 py-3 font-semibold text-neutral-900">{sms.parsed_amount ? formatCurrency(Number(sms.parsed_amount)) : '—'}</td>
                        <td className="px-4 py-3 hidden sm:table-cell font-mono text-xs text-neutral-600">{sms.parsed_reference || '—'}</td>
                        <td className="px-4 py-3 hidden md:table-cell text-neutral-600">{sms.parsed_phone || '—'}</td>
                        <td className="px-4 py-3"><StatusBadge status={sms.processing_status} /></td>
                        <td className="px-4 py-3 hidden lg:table-cell text-neutral-500 text-xs">{formatDate(sms.received_at, true)}</td>
                        <td className="px-4 py-3"><div className="flex justify-end gap-1"><button onClick={() => setViewSms(sms)} className="p-1.5 text-neutral-400 hover:text-primary-600 rounded-lg" title="View"><Eye className="w-4 h-4" /></button></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={total} itemsPerPage={perPage} />
            </>
          )
        ) : (
          unmatchedList.length === 0 ? (
            <EmptyState icon={<UserPlus className="w-12 h-12" />} title="No unmatched transactions" description="When an SMS can't be auto-matched to a member, it will appear here for manual assignment." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Amount</th>
                    <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Reference</th>
                    <th className="text-left px-4 py-3 font-medium">Phone/Sender</th>
                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Date</th>
                    <th className="text-right px-4 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {unmatchedList.map((u) => (
                    <tr key={u.id} className="hover:bg-neutral-50">
                      <td className="px-4 py-3 font-semibold">{formatCurrency(Number(u.amount))}</td>
                      <td className="px-4 py-3 hidden sm:table-cell font-mono text-xs">{u.reference || '—'}</td>
                      <td className="px-4 py-3"><p className="text-neutral-600">{u.phone_number || 'No phone'}</p>{u.sender_name && <p className="text-xs text-neutral-400">{u.sender_name}</p>}</td>
                      <td className="px-4 py-3 hidden md:table-cell text-neutral-500 text-xs">{formatDate(u.transaction_date || u.created_at)}</td>
                      <td className="px-4 py-3 text-right"><button onClick={() => { setAssignModal(u); setAssignMemberId(''); }} className="btn-secondary text-xs"><UserPlus className="w-3.5 h-3.5" /> Assign</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* SMS Detail Modal */}
      <Modal isOpen={!!viewSms} onClose={() => setViewSms(null)} title="SMS Details" size="lg">
        {viewSms && (
          <div className="space-y-4">
            <div className="rounded-lg bg-neutral-50 p-4">
              <p className="text-xs font-medium text-neutral-500 mb-2">Raw SMS Text</p>
              <p className="text-sm text-neutral-800 font-mono whitespace-pre-wrap">{viewSms.raw_text}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-neutral-500">Amount:</span> <span className="font-semibold">{viewSms.parsed_amount ? formatCurrency(Number(viewSms.parsed_amount)) : '—'}</span></div>
              <div><span className="text-neutral-500">Reference:</span> <span className="font-mono text-xs">{viewSms.parsed_reference || '—'}</span></div>
              <div><span className="text-neutral-500">Phone:</span> <span>{viewSms.parsed_phone || '—'}</span></div>
              <div><span className="text-neutral-500">Name:</span> <span>{viewSms.parsed_name || '—'}</span></div>
              <div><span className="text-neutral-500">Provider:</span> <span>{viewSms.parsed_provider || '—'}</span></div>
              <div><span className="text-neutral-500">Status:</span> <StatusBadge status={viewSms.processing_status} /></div>
              <div><span className="text-neutral-500">Received:</span> <span>{formatDate(viewSms.received_at, true)}</span></div>
              <div><span className="text-neutral-500">Sender:</span> <span>{viewSms.sender || '—'}</span></div>
            </div>
            {viewSms.error_message && <div className="rounded-lg bg-error-50 border border-error-200 p-3 text-sm text-error-700">{viewSms.error_message}</div>}
          </div>
        )}
      </Modal>

      {/* Assign Modal */}
      <Modal isOpen={!!assignModal} onClose={() => setAssignModal(null)} title="Assign to Member" description={assignModal ? `${formatCurrency(Number(assignModal.amount))} — ${assignModal.reference || 'No reference'}` : ''} footer={<><button className="btn-secondary" onClick={() => setAssignModal(null)}>Cancel</button><button className="btn-primary" onClick={handleAssign}>Assign Transaction</button></>}>
        <div className="space-y-4">
          <div>
            <label className="label">Select Member</label>
            <select className="input" value={assignMemberId} onChange={(e) => setAssignMemberId(e.target.value)}>
              <option value="">Choose a member...</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.full_name} ({m.phone_number})</option>)}
            </select>
          </div>
          {assignModal?.sms?.raw_text && <div className="rounded-lg bg-neutral-50 p-3 text-xs font-mono whitespace-pre-wrap text-neutral-600">{assignModal.sms.raw_text}</div>}
        </div>
      </Modal>

      {/* Edit Category Modal */}
      <Modal isOpen={!!editCatModal} onClose={() => setEditCatModal(null)} title="Assign Contribution Category" description={editCatModal ? `${formatCurrency(Number(editCatModal.amount))} — ${editCatModal.reference}` : ''} footer={<><button className="btn-secondary" onClick={() => setEditCatModal(null)}>Cancel</button><button className="btn-primary" onClick={handleEditCategory}>Update</button></>}>
        <div className="space-y-4">
          <div><label className="label">Category</label><select className="input" value={editCategoryId} onChange={(e) => setEditCategoryId(e.target.value)}><option value="">Select category...</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        </div>
      </Modal>

      {/* Reversal Modal */}
      <Modal isOpen={!!reversalModal} onClose={() => setReversalModal(null)} title="Reverse Transaction" description="This will mark the transaction as reversed. A reversal record will be created for audit purposes." footer={<><button className="btn-secondary" onClick={() => setReversalModal(null)}>Cancel</button><button className="btn-danger" onClick={handleReversal}>Reverse Transaction</button></>}>
        <div className="space-y-4">
          {reversalModal && <div className="rounded-lg bg-neutral-50 p-3 text-sm"><p><span className="text-neutral-500">Amount:</span> <span className="font-semibold">{formatCurrency(Number(reversalModal.amount))}</span></p><p><span className="text-neutral-500">Reference:</span> <span className="font-mono text-xs">{reversalModal.reference || '—'}</span></p></div>}
          <div><label className="label">Reason for Reversal</label><textarea className="input" rows={3} value={reversalReason} onChange={(e) => setReversalReason(e.target.value)} placeholder="Explain why this transaction is being reversed..." /></div>
        </div>
      </Modal>
    </div>
  );
}
