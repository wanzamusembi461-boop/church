import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { LoadingState, EmptyState } from '@/components/ui/Loading';
import { formatCurrency } from '@/lib/utils';
import type { ContributionCategory } from '@/types';
import { Plus, Wallet, Pencil, Power, Target } from 'lucide-react';

export function ContributionManagement() {
  const { toast } = useToast();
  const [categories, setCategories] = useState<ContributionCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ContributionCategory | null>(null);
  const [form, setForm] = useState({
    name: '', description: '', target_amount: '', frequency: 'monthly',
    minimum_amount: '', monthly_requirement: '', start_date: '', end_date: '',
    defaulter_grace_days: '7', reminder_days_before: '3', reminder_enabled: true,
    reminder_template: 'Dear {member_name}, your {contribution_name} contribution of KES {amount_due} is due on {due_date}. Thank you for supporting the church.',
  });

  useEffect(() => { loadCategories(); }, []);

  async function loadCategories() {
    setLoading(true);
    const { data } = await supabase.from('contribution_categories').select('*').order('created_at', { ascending: false });
    setCategories((data || []) as ContributionCategory[]);
    setLoading(false);
  }

  function openAdd() {
    setEditing(null);
    setForm({
      name: '', description: '', target_amount: '', frequency: 'monthly',
      minimum_amount: '', monthly_requirement: '', start_date: '', end_date: '',
      defaulter_grace_days: '7', reminder_days_before: '3', reminder_enabled: true,
      reminder_template: 'Dear {member_name}, your {contribution_name} contribution of KES {amount_due} is due on {due_date}. Thank you for supporting the church.',
    });
    setShowModal(true);
  }

  function openEdit(cat: ContributionCategory) {
    setEditing(cat);
    setForm({
      name: cat.name, description: cat.description || '', target_amount: String(cat.target_amount || ''),
      frequency: cat.frequency, minimum_amount: String(cat.minimum_amount || ''),
      monthly_requirement: String(cat.monthly_requirement || ''),
      start_date: cat.start_date || '', end_date: cat.end_date || '',
      defaulter_grace_days: String(cat.defaulter_grace_days), reminder_days_before: String(cat.reminder_days_before),
      reminder_enabled: cat.reminder_enabled, reminder_template: cat.reminder_template || '',
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { toast('Category name is required', 'warning'); return; }
    const payload = {
      name: form.name.trim(),
      description: form.description || null,
      target_amount: form.target_amount ? Number(form.target_amount) : 0,
      frequency: form.frequency,
      minimum_amount: form.minimum_amount ? Number(form.minimum_amount) : 0,
      monthly_requirement: form.monthly_requirement ? Number(form.monthly_requirement) : 0,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      defaulter_grace_days: Number(form.defaulter_grace_days) || 7,
      reminder_days_before: Number(form.reminder_days_before) || 3,
      reminder_enabled: form.reminder_enabled,
      reminder_template: form.reminder_template || null,
    };
    if (editing) {
      const { error } = await supabase.from('contribution_categories').update(payload).eq('id', editing.id);
      if (error) { toast('Failed to update category', 'error'); return; }
      await logAudit('category_update', 'contribution_categories', editing.id, `Updated: ${form.name}`);
      toast('Category updated', 'success');
    } else {
      const { error } = await supabase.from('contribution_categories').insert(payload);
      if (error) { toast('Failed to create category', 'error'); return; }
      await logAudit('category_create', 'contribution_categories', undefined, `Created: ${form.name}`);
      toast('Category created', 'success');
    }
    setShowModal(false);
    loadCategories();
  }

  async function toggleActive(cat: ContributionCategory) {
    const { error } = await supabase.from('contribution_categories').update({ is_active: !cat.is_active }).eq('id', cat.id);
    if (error) { toast('Failed to update status', 'error'); return; }
    toast(`Category ${cat.is_active ? 'deactivated' : 'activated'}`, 'success');
    loadCategories();
  }

  const frequencies: Record<string, string> = {
    one_time: 'One Time', daily: 'Daily', weekly: 'Weekly',
    monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">{categories.length} categor{categories.length !== 1 ? 'ies' : 'y'}</p>
        <button className="btn-primary" onClick={openAdd}><Plus className="w-4 h-4" /> New Category</button>
      </div>

      {loading ? <LoadingState /> : categories.length === 0 ? (
        <EmptyState icon={<Wallet className="w-12 h-12" />} title="No contribution categories" description="Create your first contribution category to start tracking church contributions." action={<button className="btn-primary" onClick={openAdd}><Plus className="w-4 h-4" /> Create Category</button>} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat) => (
            <div key={cat.id} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center"><Wallet className="w-5 h-5 text-primary-600" /></div>
                <StatusBadge status={cat.is_active ? 'active' : 'inactive'} />
              </div>
              <h3 className="font-semibold text-neutral-900 mb-1">{cat.name}</h3>
              <p className="text-xs text-neutral-500 mb-3 line-clamp-2">{cat.description || 'No description'}</p>
              <div className="space-y-1.5 text-xs text-neutral-600">
                <div className="flex justify-between"><span>Frequency:</span><span className="font-medium">{frequencies[cat.frequency]}</span></div>
                {Number(cat.target_amount) > 0 && <div className="flex justify-between"><span>Target:</span><span className="font-medium">{formatCurrency(Number(cat.target_amount))}</span></div>}
                {Number(cat.monthly_requirement) > 0 && <div className="flex justify-between"><span>Monthly:</span><span className="font-medium">{formatCurrency(Number(cat.monthly_requirement))}</span></div>}
                <div className="flex justify-between"><span>Grace days:</span><span className="font-medium">{cat.defaulter_grace_days}</span></div>
              </div>
              <div className="flex gap-2 mt-4 pt-3 border-t border-neutral-100">
                <button className="btn-ghost flex-1 text-xs" onClick={() => openEdit(cat)}><Pencil className="w-3.5 h-3.5" /> Edit</button>
                <button className="btn-ghost flex-1 text-xs" onClick={() => toggleActive(cat)}><Power className="w-3.5 h-3.5" /> {cat.is_active ? 'Deactivate' : 'Activate'}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Edit Category' : 'New Contribution Category'}
        size="lg"
        footer={<><button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button><button className="btn-primary" onClick={handleSave}>{editing ? 'Update' : 'Create'}</button></>}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="label">Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Monthly Welfare" /></div>
            <div><label className="label">Frequency</label><select className="input" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>{Object.entries(frequencies).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          </div>
          <div><label className="label">Description</label><textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What this contribution is for..." /></div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div><label className="label">Target Amount</label><input className="input" type="number" value={form.target_amount} onChange={(e) => setForm({ ...form, target_amount: e.target.value })} placeholder="0" /></div>
            <div><label className="label">Min Amount</label><input className="input" type="number" value={form.minimum_amount} onChange={(e) => setForm({ ...form, minimum_amount: e.target.value })} placeholder="0" /></div>
            <div><label className="label">Monthly Req.</label><input className="input" type="number" value={form.monthly_requirement} onChange={(e) => setForm({ ...form, monthly_requirement: e.target.value })} placeholder="0" /></div>
            <div><label className="label">Grace Days</label><input className="input" type="number" value={form.defaulter_grace_days} onChange={(e) => setForm({ ...form, defaulter_grace_days: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Start Date</label><input className="input" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
            <div><label className="label">End Date</label><input className="input" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
          </div>
          <div>
            <label className="label">Reminder Template</label>
            <textarea className="input font-mono text-xs" rows={3} value={form.reminder_template} onChange={(e) => setForm({ ...form, reminder_template: e.target.value })} />
            <p className="text-xs text-neutral-400 mt-1">Variables: {'{member_name}, {amount_due}, {amount_paid}, {balance}, {contribution_name}, {due_date}'}</p>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.reminder_enabled} onChange={(e) => setForm({ ...form, reminder_enabled: e.target.checked })} className="rounded" /> Enable reminders for this category</label>
        </div>
      </Modal>
    </div>
  );
}
