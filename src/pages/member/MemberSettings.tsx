import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Lock, Eye, EyeOff, User, Phone, CheckCircle } from 'lucide-react';

export function MemberSettings() {
  const { member, refreshMember, signOut } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(member?.full_name || '');
  const [email, setEmail] = useState(member?.email || '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  async function saveProfile() {
    setSavingProfile(true);
    const { error } = await supabase.from('members').update({ full_name: name.trim(), email: email || null }).eq('id', member!.id);
    if (error) { toast('Failed to save profile', 'error'); setSavingProfile(false); return; }
    await refreshMember();
    toast('Profile updated', 'success');
    setSavingProfile(false);
  }

  async function changePassword() {
    if (newPassword !== confirmPassword) { toast('Passwords do not match', 'warning'); return; }
    if (newPassword.length < 8) { toast('Password must be at least 8 characters', 'warning'); return; }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { toast(error.message, 'error'); setSavingPassword(false); return; }
    await supabase.from('members').update({ password_changed: true }).eq('id', member!.id);
    toast('Password changed successfully', 'success');
    setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    setSavingPassword(false);
  }

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><User className="w-4 h-4 text-primary-600" /> Profile Information</h3>
        <div className="space-y-3">
          <div><label className="label">Full Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="label">Phone Number (username)</label><div className="relative"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" /><input className="input pl-10" value={member?.phone_number || ''} disabled /></div></div>
          <div><label className="label">Email</label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" /></div>
          <button className="btn-primary" onClick={saveProfile} disabled={savingProfile}>{savingProfile ? 'Saving...' : 'Save Profile'}</button>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Lock className="w-4 h-4 text-primary-600" /> Change Password</h3>
        <div className="space-y-3">
          <div><label className="label">New Password</label><div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" /><input className="input pl-10 pr-10" type={showPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /><button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div></div>
          <div><label className="label">Confirm Password</label><input className="input" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></div>
          <button className="btn-primary" onClick={changePassword} disabled={savingPassword}>{savingPassword ? 'Changing...' : 'Change Password'}</button>
        </div>
      </div>

      {member?.password_changed && (
        <div className="card p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-success-500" />
          <p className="text-sm text-neutral-600">Your password has been changed from the default.</p>
        </div>
      )}
    </div>
  );
}
