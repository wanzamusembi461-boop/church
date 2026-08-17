import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/components/ui/Toast';
import { LoadingState } from '@/components/ui/Loading';
import type { ChurchSettings, AdminSettings } from '@/types';
import { Church, Key, Bell, Shield, Save } from 'lucide-react';

export function AdminSettings() {
  const { toast } = useToast();
  const [tab, setTab] = useState<'church' | 'sms' | 'security'>('church');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [church, setChurch] = useState<Partial<ChurchSettings>>({});
  const [admin, setAdmin] = useState<Partial<AdminSettings>>({});
  const [smsKey, setSmsKey] = useState('');

  useEffect(() => { loadSettings(); }, []);

  async function loadSettings() {
    setLoading(true);
    const [churchRes, adminRes] = await Promise.all([
      supabase.from('church_settings').select('*').limit(1).maybeSingle(),
      supabase.from('admin_settings').select('*').limit(1).maybeSingle(),
    ]);
    if (churchRes.data) setChurch(churchRes.data as ChurchSettings);
    if (adminRes.data) setAdmin(adminRes.data as AdminSettings);
    setLoading(false);
  }

  async function saveChurch() {
    setSaving(true);
    if (church.id) {
      const { error } = await supabase.from('church_settings').update({
        church_name: church.church_name, address: church.address, phone: church.phone,
        email: church.email, website: church.website, about: church.about,
      }).eq('id', church.id);
      if (error) { toast('Failed to save', 'error'); setSaving(false); return; }
    } else {
      await supabase.from('church_settings').insert({ ...church, setup_completed: true });
    }
    await logAudit('settings_update', 'church_settings', church.id, 'Updated church information');
    toast('Church settings saved', 'success');
    setSaving(false);
  }

  async function saveSms() {
    setSaving(true);
    const payload = { sms_api_key_encrypted: smsKey || admin.sms_api_key_encrypted, sms_provider: admin.sms_provider, sms_sender_id: admin.sms_sender_id };
    if (admin.id) {
      const { error } = await supabase.from('admin_settings').update(payload).eq('id', admin.id);
      if (error) { toast('Failed to save', 'error'); setSaving(false); return; }
    } else {
      await supabase.from('admin_settings').insert(payload);
    }
    await logAudit('settings_update', 'admin_settings', admin.id, 'Updated SMS configuration');
    toast('SMS settings saved', 'success');
    setSmsKey('');
    setSaving(false);
    loadSettings();
  }

  async function saveSecurity() {
    setSaving(true);
    if (admin.id) {
      const { error } = await supabase.from('admin_settings').update({
        password_min_length: admin.password_min_length, session_timeout_minutes: admin.session_timeout_minutes,
      }).eq('id', admin.id);
      if (error) { toast('Failed to save', 'error'); setSaving(false); return; }
    } else {
      await supabase.from('admin_settings').insert({ password_min_length: admin.password_min_length, session_timeout_minutes: admin.session_timeout_minutes });
    }
    await logAudit('settings_update', 'admin_settings', admin.id, 'Updated security settings');
    toast('Security settings saved', 'success');
    setSaving(false);
  }

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="flex border-b border-neutral-200 overflow-x-auto">
        <button className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap ${tab === 'church' ? 'border-primary-600 text-primary-600' : 'border-transparent text-neutral-500'}`} onClick={() => setTab('church')}><Church className="w-4 h-4 inline mr-1.5" />Church Info</button>
        <button className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap ${tab === 'sms' ? 'border-primary-600 text-primary-600' : 'border-transparent text-neutral-500'}`} onClick={() => setTab('sms')}><Key className="w-4 h-4 inline mr-1.5" />SMS Config</button>
        <button className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap ${tab === 'security' ? 'border-primary-600 text-primary-600' : 'border-transparent text-neutral-500'}`} onClick={() => setTab('security')}><Shield className="w-4 h-4 inline mr-1.5" />Security</button>
      </div>

      {tab === 'church' && (
        <div className="card p-6 max-w-2xl space-y-4">
          <div><label className="label">Church Name</label><input className="input" value={church.church_name || ''} onChange={(e) => setChurch({ ...church, church_name: e.target.value })} /></div>
          <div><label className="label">Address</label><input className="input" value={church.address || ''} onChange={(e) => setChurch({ ...church, address: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Phone</label><input className="input" value={church.phone || ''} onChange={(e) => setChurch({ ...church, phone: e.target.value })} /></div>
            <div><label className="label">Email</label><input className="input" value={church.email || ''} onChange={(e) => setChurch({ ...church, email: e.target.value })} /></div>
          </div>
          <div><label className="label">Website</label><input className="input" value={church.website || ''} onChange={(e) => setChurch({ ...church, website: e.target.value })} /></div>
          <div><label className="label">About</label><textarea className="input" rows={3} value={church.about || ''} onChange={(e) => setChurch({ ...church, about: e.target.value })} /></div>
          <button className="btn-primary" onClick={saveChurch} disabled={saving}><Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      )}

      {tab === 'sms' && (
        <div className="card p-6 max-w-2xl space-y-4">
          <div className="rounded-lg bg-primary-50 border border-primary-100 p-4">
            <p className="text-sm font-medium text-primary-800 mb-2">SMS Forwarder API</p>
            <p className="text-xs text-primary-700 font-mono">
              Endpoint: POST /functions/v1/sms-ingest<br />
              Authorization: Bearer YOUR_API_KEY<br />
              Body: {'{ "sms_body": "...", "sender": "...", "received_timestamp": "..." }'}
            </p>
          </div>
          <div>
            <label className="label">SMS API Key</label>
            <input className="input font-mono" type="text" placeholder={admin.sms_api_key_encrypted ? '•••••••• (enter new key to replace)' : 'Enter API key'} value={smsKey} onChange={(e) => setSmsKey(e.target.value)} />
            <p className="text-xs text-neutral-400 mt-1">{admin.sms_api_key_encrypted ? 'An API key is currently set. Enter a new one to replace it.' : 'No API key set yet.'}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">SMS Provider</label><input className="input" value={admin.sms_provider || ''} onChange={(e) => setAdmin({ ...admin, sms_provider: e.target.value })} /></div>
            <div><label className="label">Sender ID</label><input className="input" value={admin.sms_sender_id || ''} onChange={(e) => setAdmin({ ...admin, sms_sender_id: e.target.value })} /></div>
          </div>
          <button className="btn-primary" onClick={saveSms} disabled={saving}><Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save SMS Settings'}</button>
        </div>
      )}

      {tab === 'security' && (
        <div className="card p-6 max-w-2xl space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Minimum Password Length</label><input className="input" type="number" value={admin.password_min_length || 8} onChange={(e) => setAdmin({ ...admin, password_min_length: Number(e.target.value) })} /></div>
            <div><label className="label">Session Timeout (minutes)</label><input className="input" type="number" value={admin.session_timeout_minutes || 60} onChange={(e) => setAdmin({ ...admin, session_timeout_minutes: Number(e.target.value) })} /></div>
          </div>
          <button className="btn-primary" onClick={saveSecurity} disabled={saving}><Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Security Settings'}</button>
        </div>
      )}
    </div>
  );
}
