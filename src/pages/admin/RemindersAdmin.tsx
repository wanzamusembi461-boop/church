import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/Badge';
import { LoadingState, EmptyState } from '@/components/ui/Loading';
import { formatCurrency, startOfMonth, endOfMonth } from '@/lib/utils';
import type { Reminder, ContributionCategory, Member } from '@/types';
import { Send, Plus, Eye, Clock } from 'lucide-react';

export function RemindersAdmin() {
  const { toast } = useToast();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [viewReminder, setViewReminder] = useState<Reminder | null>(null);
  const [recipients, setRecipients] = useState<any[]>([]);
  const [categories, setCategories] = useState<ContributionCategory[]>([]);
  const [form, setForm] = useState({
    title: '', template: 'Dear {member_name}, your {contribution_name} contribution of KES {amount_due} is due. You have paid KES {amount_paid} and your balance is KES {balance}. Thank you for supporting the church.',
    category_id: '', reminder_type: 'outstanding', recipient_type: 'defaulters',
  });

  useEffect(() => { loadReminders(); loadCategories(); }, []);

  async function loadReminders() {
    setLoading(true);
    const { data } = await supabase.from('reminders').select('*, category:contribution_categories(name)').order('created_at', { ascending: false });
    setReminders((data || []) as Reminder[]);
    setLoading(false);
  }

  async function loadCategories() {
    const { data } = await supabase.from('contribution_categories').select('*').eq('is_active', true).order('name');
    setCategories((data || []) as ContributionCategory[]);
  }

  function renderTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] || `{${key}}`);
  }

  async function handleCreate() {
    if (!form.title.trim() || !form.template.trim()) { toast('Title and template are required', 'warning'); return; }
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const { data: reminder, error } = await supabase.from('reminders').insert({
      title: form.title.trim(), template: form.template.trim(),
      category_id: form.category_id || null, reminder_type: form.reminder_type,
      recipient_type: form.recipient_type, status: 'sent', created_by: userId,
    }).select('id').single();
    if (error) { toast('Failed to create reminder', 'error'); return; }

    // Find defaulters for this category (or all)
    const now = new Date();
    const ms = startOfMonth(now).toISOString();
    const me = endOfMonth(now).toISOString();

    let reqQuery = supabase.from('contribution_requirements').select('member_id, expected_amount, category_id, member:members(full_name, id, is_active)').eq('is_active', true);
    if (form.category_id) reqQuery = reqQuery.eq('category_id', form.category_id);
    const { data: reqs } = await reqQuery;

    const { data: txs } = await supabase.from('transactions').select('member_id, category_id, amount').eq('status', 'completed').gte('transaction_date', ms).lte('transaction_date', me);

    const paidMap = new Map<string, number>();
    (txs || []).forEach((t: any) => { const key = `${t.member_id}_${t.category_id}`; paidMap.set(key, (paidMap.get(key) || 0) + Number(t.amount)); });

    const defaulterRecs: { reminder_id: string; member_id: string; rendered_message: string }[] = [];
    (reqs as any[] || []).forEach((r: any) => {
      if (!r.member?.is_active) return;
      const key = `${r.member_id}_${r.category_id}`;
      const paid = paidMap.get(key) || 0;
      const expected = Number(r.expected_amount);
      if (paid < expected) {
        const cat = categories.find(c => c.id === r.category_id);
        const msg = renderTemplate(form.template, {
          member_name: r.member.full_name,
          amount_due: formatCurrency(expected),
          amount_paid: formatCurrency(paid),
          balance: formatCurrency(expected - paid),
          contribution_name: cat?.name || 'contribution',
          due_date: endOfMonth(now).toLocaleDateString(),
        });
        defaulterRecs.push({ reminder_id: reminder!.id, member_id: r.member_id, rendered_message: msg });
      }
    });

    if (defaulterRecs.length > 0) {
      await supabase.from('reminder_recipients').insert(defaulterRecs);
    }

    await logAudit('reminder_create', 'reminders', reminder?.id, `Created reminder for ${defaulterRecs.length} defaulters`);
    toast(`Reminder sent to ${defaulterRecs.length} member${defaulterRecs.length !== 1 ? 's' : ''}`, 'success');
    setShowModal(false);
    setForm({ ...form, title: '' });
    loadReminders();
  }

  async function viewRecipients(rem: Reminder) {
    setViewReminder(rem);
    const { data } = await supabase.from('reminder_recipients').select('*, member:members(full_name, phone_number)').eq('reminder_id', rem.id);
    setRecipients(data || []);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">{reminders.length} reminder{reminders.length !== 1 ? 's' : ''}</p>
        <button className="btn-primary" onClick={() => setShowModal(true)}><Plus className="w-4 h-4" /> New Reminder</button>
      </div>

      <div className="card">
        {loading ? <LoadingState /> : reminders.length === 0 ? (
          <EmptyState icon={<Send className="w-12 h-12" />} title="No reminders sent" description="Create contribution reminders to notify members about outstanding payments." action={<button className="btn-primary" onClick={() => setShowModal(true)}><Plus className="w-4 h-4" /> Create Reminder</button>} />
        ) : (
          <div className="divide-y divide-neutral-100">
            {reminders.map((r) => (
              <div key={r.id} className="p-4 hover:bg-neutral-50 cursor-pointer" onClick={() => viewRecipients(r)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-medium text-neutral-900">{r.title}</h4>
                    <p className="text-sm text-neutral-500 line-clamp-2 mt-1 font-mono text-xs">{r.template}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <StatusBadge status={r.status} />
                      <span className="text-xs text-neutral-400">{r.reminder_type}</span>
                      {r.category && <span className="text-xs text-neutral-400">· {r.category.name}</span>}
                    </div>
                  </div>
                  <Eye className="w-4 h-4 text-neutral-400" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="New Reminder" size="lg" footer={<><button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button><button className="btn-primary" onClick={handleCreate}><Send className="w-4 h-4" /> Send Reminder</button></>}>
        <div className="space-y-4">
          <div><label className="label">Title</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Reminder title" /></div>
          <div><label className="label">Template</label><textarea className="input font-mono text-xs" rows={4} value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })} /><p className="text-xs text-neutral-400 mt-1">Variables: {'{member_name}, {amount_due}, {amount_paid}, {balance}, {contribution_name}, {due_date}'}</p></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Category (Optional)</label><select className="input" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}><option value="">All Categories</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label className="label">Recipient Type</label><select className="input" value={form.recipient_type} onChange={(e) => setForm({ ...form, recipient_type: e.target.value })}><option value="defaulters">Defaulters Only</option><option value="all">All Members</option></select></div>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!viewReminder} onClose={() => setViewReminder(null)} title="Reminder Details" size="lg">
        {viewReminder && (
          <div className="space-y-4">
            <div><h3 className="font-semibold">{viewReminder.title}</h3><p className="text-xs text-neutral-500 font-mono mt-2 p-3 bg-neutral-50 rounded-lg">{viewReminder.template}</p></div>
            <div><h4 className="text-sm font-semibold mb-2">Recipients ({recipients.length})</h4>
              {recipients.length === 0 ? <p className="text-sm text-neutral-400">No recipients.</p> : (
                <div className="max-h-60 overflow-y-auto space-y-2">{recipients.map((r: any) => <div key={r.id} className="p-3 rounded-lg bg-neutral-50"><div className="flex justify-between"><span className="font-medium text-sm">{r.member?.full_name}</span><StatusBadge status={r.delivery_status} /></div><p className="text-xs text-neutral-500 mt-1">{r.rendered_message}</p></div>)}</div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
