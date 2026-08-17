import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/Badge';
import { LoadingState, EmptyState } from '@/components/ui/Loading';
import { Pagination } from '@/components/ui/Pagination';
import { formatDate, timeAgo } from '@/lib/utils';
import type { Notification, NotificationRecipient, Member } from '@/types';
import { Bell, Plus, Search, Eye, Send } from 'lucide-react';

export function NotificationsAdmin() {
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [perAge] = useState(15);
  const [showModal, setShowModal] = useState(false);
  const [viewNotif, setViewNotif] = useState<Notification | null>(null);
  const [recipients, setRecipients] = useState<NotificationRecipient[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [form, setForm] = useState({ title: '', message: '', recipient_type: 'all', priority: 'normal', category_id: '' });

  useEffect(() => { loadNotifications(); loadMembers(); }, [page]);

  async function loadNotifications() {
    setLoading(true);
    const { data, count } = await supabase.from('notifications').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range((page - 1) * perAge, page * perAge - 1);
    setNotifications((data || []) as Notification[]);
    setTotal(count || 0); setTotalPages(Math.ceil((count || 0) / perAge));
    setLoading(false);
  }

  async function loadMembers() {
    const { data } = await supabase.from('members').select('*').eq('role', 'member').eq('is_active', true).order('full_name');
    setMembers((data || []) as Member[]);
  }

  async function handleCreate() {
    if (!form.title.trim() || !form.message.trim()) { toast('Title and message are required', 'warning'); return; }
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const { data: notif, error } = await supabase.from('notifications').insert({
      title: form.title.trim(), message: form.message.trim(), recipient_type: form.recipient_type,
      priority: form.priority, category_id: form.category_id || null, status: 'sent', created_by: userId,
    }).select('id').single();
    if (error) { toast('Failed to create notification', 'error'); return; }

    // Create recipients for 'all'
    if (form.recipient_type === 'all' && notif) {
      const recipientRows = members.map(m => ({ notification_id: notif.id, member_id: m.id }));
      if (recipientRows.length > 0) await supabase.from('notification_recipients').insert(recipientRows);
    }

    await logAudit('notification_create', 'notifications', notif?.id, `Created: ${form.title}`);
    toast('Notification sent', 'success');
    setShowModal(false);
    setForm({ title: '', message: '', recipient_type: 'all', priority: 'normal', category_id: '' });
    loadNotifications();
  }

  async function viewRecipients(notif: Notification) {
    setViewNotif(notif);
    const { data } = await supabase.from('notification_recipients').select('*, member:members(full_name, phone_number)').eq('notification_id', notif.id).order('created_at', { ascending: false });
    setRecipients((data || []) as NotificationRecipient[]);
  }

  const filtered = notifications.filter(n => !search || n.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input className="input pl-10" placeholder="Search notifications..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}><Plus className="w-4 h-4" /> New Notification</button>
      </div>

      <div className="card">
        {loading ? <LoadingState /> : filtered.length === 0 ? (
          <EmptyState icon={<Bell className="w-12 h-12" />} title="No notifications" description="Create notifications to communicate with your church members." action={<button className="btn-primary" onClick={() => setShowModal(true)}><Plus className="w-4 h-4" /> Create Notification</button>} />
        ) : (
          <>
            <div className="divide-y divide-neutral-100">
              {filtered.map((n) => (
                <div key={n.id} className="p-4 hover:bg-neutral-50 cursor-pointer" onClick={() => viewRecipients(n)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-neutral-900 truncate">{n.title}</h4>
                        <StatusBadge status={n.priority} />
                      </div>
                      <p className="text-sm text-neutral-500 line-clamp-2">{n.message}</p>
                      <p className="text-xs text-neutral-400 mt-1">{timeAgo(n.created_at)} · {n.recipient_type}</p>
                    </div>
                    <Eye className="w-4 h-4 text-neutral-400 flex-shrink-0" />
                  </div>
                </div>
              ))}
            </div>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={total} itemsPerPage={perAge} />
          </>
        )}
      </div>

      {/* Create Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="New Notification" size="lg" footer={<><button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button><button className="btn-primary" onClick={handleCreate}><Send className="w-4 h-4" /> Send</button></>}>
        <div className="space-y-4">
          <div><label className="label">Title</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Notification title" /></div>
          <div><label className="label">Message</label><textarea className="input" rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Write your message..." /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Recipients</label><select className="input" value={form.recipient_type} onChange={(e) => setForm({ ...form, recipient_type: e.target.value })}><option value="all">All Members</option><option value="selected">Selected Members</option><option value="defaulters">Defaulters Only</option><option value="category">By Category</option></select></div>
            <div><label className="label">Priority</label><select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
          </div>
        </div>
      </Modal>

      {/* Recipients Modal */}
      <Modal isOpen={!!viewNotif} onClose={() => setViewNotif(null)} title="Notification Details" size="lg">
        {viewNotif && (
          <div className="space-y-4">
            <div><h3 className="font-semibold text-lg">{viewNotif.title}</h3><p className="text-sm text-neutral-600 mt-1">{viewNotif.message}</p><div className="flex gap-2 mt-2"><StatusBadge status={viewNotif.priority} /><span className="text-xs text-neutral-400">{formatDate(viewNotif.created_at, true)}</span></div></div>
            <div><h4 className="text-sm font-semibold mb-2">Recipients ({recipients.length})</h4>
              {recipients.length === 0 ? <p className="text-sm text-neutral-400">This notification was sent to all members.</p> : (
                <div className="max-h-60 overflow-y-auto space-y-1">{recipients.map(r => <div key={r.id} className="flex items-center justify-between text-sm p-2 rounded-lg bg-neutral-50"><span>{r.member?.full_name || 'Unknown'}</span>{r.is_read ? <StatusBadge status="read" /> : <span className="text-xs text-neutral-400">Unread</span>}</div>)}</div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
