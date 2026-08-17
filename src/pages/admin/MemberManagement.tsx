import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { LoadingState, EmptyState } from '@/components/ui/Loading';
import { Pagination } from '@/components/ui/Pagination';
import { formatCurrency, formatDate, normalizeKenyanPhone } from '@/lib/utils';
import type { Member } from '@/types';
import { Search, Plus, Users, Eye, KeyRound, Power, Pencil } from 'lucide-react';

export function MemberManagement() {
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const perPage = 20;

  const [showAddModal, setShowAddModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [memberStats, setMemberStats] = useState<{ total: number; txCount: number; lastPayment: string | null } | null>(null);
  const [addForm, setAddForm] = useState({ full_name: '', phone_number: '', email: '' });
  const [addLoading, setAddLoading] = useState(false);

  useEffect(() => { loadMembers(); }, [search, statusFilter, page]);

  async function loadMembers() {
    setLoading(true);
    let query = supabase.from('members').select('*', { count: 'exact' }).eq('role', 'member').order('created_at', { ascending: false });
    if (search) {
      query = query.or(`full_name.ilike.%${search}%,phone_number.ilike.%${search}%`);
    }
    if (statusFilter !== 'all') {
      query = query.eq('is_active', statusFilter === 'active');
    }
    query = query.range((page - 1) * perPage, page * perPage - 1);
    const { data, count } = await query;
    setMembers((data || []) as Member[]);
    setTotal(count || 0);
    setTotalPages(Math.ceil((count || 0) / perPage));
    setLoading(false);
  }

  async function handleAddMember() {
    const normalized = normalizeKenyanPhone(addForm.phone_number);
    if (!addForm.full_name.trim() || !normalized) {
      toast('Please provide a valid name and Kenyan phone number', 'warning');
      return;
    }
    setAddLoading(true);
    try {
      const email = normalized.replace('+', '') + '@church.local';
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email, password: 'Member2026', email_confirm: true,
        user_metadata: { full_name: addForm.full_name, phone_number: normalized },
      });
      if (authError) throw authError;
      const { error: memberError } = await supabase.from('members').insert({
        user_id: authData.user.id, full_name: addForm.full_name.trim(),
        phone_number: normalized, email: addForm.email || null, role: 'member',
        password_changed: false, is_active: true,
      });
      if (memberError) throw memberError;
      await logAudit('member_create', 'members', authData.user.id, `Created member: ${addForm.full_name}`);
      toast('Member added successfully. Default password: Member2026', 'success');
      setShowAddModal(false);
      setAddForm({ full_name: '', phone_number: '', email: '' });
      loadMembers();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to add member', 'error');
    } finally {
      setAddLoading(false);
    }
  }

  async function toggleActive(member: Member) {
    const { error } = await supabase.from('members').update({ is_active: !member.is_active }).eq('id', member.id);
    if (error) { toast('Failed to update status', 'error'); return; }
    await logAudit('member_update', 'members', member.id, `${member.is_active ? 'Deactivated' : 'Reactivated'}: ${member.full_name}`);
    toast(`Member ${member.is_active ? 'deactivated' : 'reactivated'}`, 'success');
    loadMembers();
  }

  async function resetPassword(member: Member) {
    const email = member.phone_number.replace('+', '') + '@church.local';
    const { error } = await supabase.auth.admin.updateUserById(member.user_id!, { password: 'Member2026' });
    if (error) { toast('Failed to reset password', 'error'); return; }
    await supabase.from('members').update({ password_changed: false }).eq('id', member.id);
    await logAudit('password_reset', 'members', member.id, `Reset password for: ${member.full_name}`);
    toast('Password reset to Member2026. Member must change it on next login.', 'success');
  }

  async function viewProfile(member: Member) {
    setSelectedMember(member);
    setShowProfileModal(true);
    setMemberStats(null);
    const { data: txs } = await supabase.from('transactions').select('amount, transaction_date, status').eq('member_id', member.id).eq('status', 'completed').order('transaction_date', { ascending: false });
    const totalPaid = (txs || []).reduce((s, t) => s + Number(t.amount), 0);
    setMemberStats({ total: totalPaid, txCount: txs?.length || 0, lastPayment: txs?.[0]?.transaction_date || null });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input className="input pl-10" placeholder="Search by name or phone..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="flex items-center gap-2">
          <select className="input w-auto" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="all">All Members</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button className="btn-primary" onClick={() => setShowAddModal(true)}>
            <Plus className="w-4 h-4" /> Add Member
          </button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <LoadingState message="Loading members..." />
        ) : members.length === 0 ? (
          <EmptyState icon={<Users className="w-12 h-12" />} title="No members found" description="Import members from Excel or add them manually to get started." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Name</th>
                    <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Phone</th>
                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Registered</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Password</th>
                    <th className="text-right px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {members.map((m) => (
                    <tr key={m.id} className="hover:bg-neutral-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-neutral-900">{m.full_name}</p>
                        <p className="text-xs text-neutral-400 sm:hidden">{m.phone_number}</p>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-neutral-600">{m.phone_number}</td>
                      <td className="px-4 py-3 hidden md:table-cell text-neutral-500 text-xs">{formatDate(m.date_registered)}</td>
                      <td className="px-4 py-3"><StatusBadge status={m.is_active ? 'active' : 'inactive'} /></td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {m.password_changed ? <Badge variant="success">Changed</Badge> : <Badge variant="warning">Default</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => viewProfile(m)} className="p-1.5 text-neutral-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg" title="View Profile">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button onClick={() => resetPassword(m)} className="p-1.5 text-neutral-400 hover:text-warning-600 hover:bg-warning-50 rounded-lg" title="Reset Password">
                            <KeyRound className="w-4 h-4" />
                          </button>
                          <button onClick={() => toggleActive(m)} className={`p-1.5 rounded-lg ${m.is_active ? 'text-neutral-400 hover:text-error-600 hover:bg-error-50' : 'text-neutral-400 hover:text-success-600 hover:bg-success-50'}`} title={m.is_active ? 'Deactivate' : 'Reactivate'}>
                            <Power className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={total} itemsPerPage={perPage} />
          </>
        )}
      </div>

      {/* Add Member Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New Member"
        description="The member will get the default password Member2026 and must change it on first login."
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleAddMember} disabled={addLoading}>{addLoading ? 'Adding...' : 'Add Member'}</button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Full Name</label>
            <input className="input" placeholder="e.g. John Mwangi" value={addForm.full_name} onChange={(e) => setAddForm({ ...addForm, full_name: e.target.value })} />
          </div>
          <div>
            <label className="label">Phone Number</label>
            <input className="input" placeholder="0712345678" value={addForm.phone_number} onChange={(e) => setAddForm({ ...addForm, phone_number: e.target.value })} />
          </div>
          <div>
            <label className="label">Email (Optional)</label>
            <input className="input" placeholder="member@email.com" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} />
          </div>
        </div>
      </Modal>

      {/* Profile Modal */}
      <Modal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        title="Member Profile"
        size="lg"
      >
        {selectedMember && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center">
                <span className="text-xl font-semibold text-primary-700">{selectedMember.full_name.charAt(0).toUpperCase()}</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold">{selectedMember.full_name}</h3>
                <p className="text-sm text-neutral-500">{selectedMember.phone_number}</p>
                <div className="flex gap-2 mt-1">
                  <StatusBadge status={selectedMember.is_active ? 'active' : 'inactive'} />
                  {!selectedMember.password_changed && <Badge variant="warning">Default Password</Badge>}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="card p-3">
                <p className="text-xs text-neutral-500">Total Contributed</p>
                <p className="text-lg font-semibold text-success-600">{memberStats ? formatCurrency(memberStats.total) : '...'}</p>
              </div>
              <div className="card p-3">
                <p className="text-xs text-neutral-500">Transactions</p>
                <p className="text-lg font-semibold">{memberStats?.txCount ?? '...'}</p>
              </div>
              <div className="card p-3">
                <p className="text-xs text-neutral-500">Last Payment</p>
                <p className="text-sm font-semibold">{memberStats?.lastPayment ? formatDate(memberStats.lastPayment) : '—'}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div><span className="text-neutral-500">Email:</span> <span className="font-medium">{selectedMember.email || '—'}</span></div>
              <div><span className="text-neutral-500">Registered:</span> <span className="font-medium">{formatDate(selectedMember.date_registered)}</span></div>
              <div><span className="text-neutral-500">Last Login:</span> <span className="font-medium">{formatDate(selectedMember.last_login, true)}</span></div>
              <div><span className="text-neutral-500">Role:</span> <span className="font-medium capitalize">{selectedMember.role.replace('_', ' ')}</span></div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
