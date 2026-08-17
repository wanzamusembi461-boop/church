import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { LoadingState, EmptyState } from '@/components/ui/Loading';
import { formatDate, timeAgo } from '@/lib/utils';
import { Bell, CheckCheck } from 'lucide-react';

export function MemberNotifications() {
  const { member } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadNotifications(); }, []);

  async function loadNotifications() {
    if (!member) return;
    // Get notifications addressed to this member via recipients, plus 'all' notifications
    const [recRes, allRes] = await Promise.all([
      supabase.from('notification_recipients').select('is_read, read_at, notification:notifications(*)').eq('member_id', member.id).order('created_at', { ascending: false }),
      supabase.from('notifications').select('*').eq('recipient_type', 'all').order('created_at', { ascending: false }).limit(50),
    ]);

    const recipientNotifs = (recRes.data || []).map((r: any) => ({ ...r.notification, is_read: r.is_read, read_at: r.read_at, has_recipient: true }));
    const allNotifs = (allRes.data || []).map((n: any) => ({ ...n, is_read: false, has_recipient: false }));

    // Merge and dedupe
    const map = new Map<string, any>();
    [...allNotifs, ...recipientNotifs].forEach(n => { if (!map.has(n.id)) map.set(n.id, n); });
    const merged = Array.from(map.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setNotifications(merged);
    setLoading(false);
  }

  async function markAsRead(notifId: string) {
    if (!member) return;
    await supabase.from('notification_recipients').upsert({ notification_id: notifId, member_id: member.id, is_read: true, read_at: new Date().toISOString() });
    loadNotifications();
  }

  async function markAllRead() {
    if (!member) return;
    const unread = notifications.filter(n => !n.is_read);
    for (const n of unread) {
      await supabase.from('notification_recipients').upsert({ notification_id: n.id, member_id: member.id, is_read: true, read_at: new Date().toISOString() });
    }
    loadNotifications();
  }

  if (loading) return <LoadingState />;

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">{unreadCount} unread</p>
        {unreadCount > 0 && <button className="btn-secondary text-xs" onClick={markAllRead}><CheckCheck className="w-3.5 h-3.5" /> Mark all read</button>}
      </div>

      {notifications.length === 0 ? (
        <EmptyState icon={<Bell className="w-12 h-12" />} title="No notifications" description="Church notifications will appear here." />
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div key={n.id} className={`card p-4 ${n.is_read ? 'opacity-70' : 'border-primary-200'}`} onClick={() => !n.is_read && markAsRead(n.id)}>
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${n.is_read ? 'bg-neutral-100 text-neutral-400' : 'bg-primary-100 text-primary-600'}`}><Bell className="w-4 h-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-neutral-900">{n.title}</h4>
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-primary-500" />}
                  </div>
                  <p className="text-sm text-neutral-600 mt-0.5">{n.message}</p>
                  <p className="text-xs text-neutral-400 mt-1">{timeAgo(n.created_at)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
