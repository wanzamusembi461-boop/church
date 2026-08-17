import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Church, Lock, Phone, User, AlertCircle, CheckCircle2, ArrowRight, ArrowLeft, Key } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';

export function SetupWizardPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guard: if an admin already exists, never show setup page again
  useEffect(() => {
    (async () => {
      const { count } = await supabase
        .from('members')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'super_admin');
      if (count && count > 0) {
        navigate('/login', { replace: true });
      }
    })();
  }, [navigate]);

  const [adminName, setAdminName] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [adminPassword, setAdminPassword] = useState('Admin2026!');

  const [churchName, setChurchName] = useState('');
  const [churchAddress, setChurchAddress] = useState('');
  const [churchPhone, setChurchPhone] = useState('');
  const [churchEmail, setChurchEmail] = useState('');

  const [smsApiKey, setSmsApiKey] = useState('');

  const totalSteps = 3;

  async function handleComplete() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/setup-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: adminName,
          phone_number: adminPhone,
          password: adminPassword,
          church_name: churchName,
          church_address: churchAddress,
          church_phone: churchPhone,
          church_email: churchEmail,
          sms_api_key: smsApiKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Setup failed');
      toast('Setup complete! Please sign in with your phone number.', 'success');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during setup');
      setLoading(false);
    }
  }

  function genApiKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = 'sk_';
    for (let i = 0; i < 32; i++) key += chars[Math.floor(Math.random() * chars.length)];
    setSmsApiKey(key);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-accent-50 p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-600 text-white shadow-lg mb-4">
            <Church className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-serif font-semibold text-neutral-900">Welcome to Church Contributions</h1>
          <p className="text-sm text-neutral-500 mt-1">Let's set up your church management system</p>
        </div>

        <div className="flex items-center justify-center mb-6 gap-2">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className={`h-2 rounded-full transition-all duration-300 ${i + 1 === step ? 'w-8 bg-primary-600' : i + 1 < step ? 'w-8 bg-primary-300' : 'w-8 bg-neutral-200'}`} />
          ))}
        </div>

        <div className="card p-6 sm:p-8">
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-error-50 border border-error-200 px-4 py-3 text-sm text-error-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4 animate-slide-up">
              <div>
                <h2 className="text-lg font-semibold mb-1">Administrator Account</h2>
                <p className="text-sm text-neutral-500 mb-4">Create the initial super admin / treasurer account.</p>
              </div>
              <div>
                <label className="label">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input className="input pl-10" placeholder="e.g. John Mwangi" value={adminName} onChange={(e) => setAdminName(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input className="input pl-10" placeholder="0712345678" value={adminPhone} onChange={(e) => setAdminPhone(e.target.value)} />
                </div>
                <p className="text-xs text-neutral-400 mt-1">This will be your login username</p>
              </div>
              <div>
                <label className="label">Admin Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input className="input pl-10" type="text" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} />
                </div>
                <p className="text-xs text-neutral-400 mt-1">You can change this later</p>
              </div>
              <button className="btn-primary w-full" onClick={() => { if (!adminName.trim() || !adminPhone.trim() || !adminPassword) { setError('Please fill in all fields'); return; } setError(null); setStep(2); }}>
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-slide-up">
              <div>
                <h2 className="text-lg font-semibold mb-1">Church Information</h2>
                <p className="text-sm text-neutral-500 mb-4">Tell us about your church.</p>
              </div>
              <div>
                <label className="label">Church Name</label>
                <input className="input" placeholder="e.g. Grace Community Church" value={churchName} onChange={(e) => setChurchName(e.target.value)} />
              </div>
              <div>
                <label className="label">Address</label>
                <input className="input" placeholder="Church address" value={churchAddress} onChange={(e) => setChurchAddress(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Phone</label>
                  <input className="input" placeholder="Church phone" value={churchPhone} onChange={(e) => setChurchPhone(e.target.value)} />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input className="input" placeholder="church@email.com" value={churchEmail} onChange={(e) => setChurchEmail(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-3">
                <button className="btn-secondary flex-1" onClick={() => setStep(1)}><ArrowLeft className="w-4 h-4" /> Back</button>
                <button className="btn-primary flex-1" onClick={() => { if (!churchName.trim()) { setError('Please enter the church name'); return; } setError(null); setStep(3); }}>
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 animate-slide-up">
              <div>
                <h2 className="text-lg font-semibold mb-1">SMS Forwarder Configuration</h2>
                <p className="text-sm text-neutral-500 mb-4">Set up the API key for your SMS Forwarder app. Optional — you can configure it later.</p>
              </div>
              <div>
                <label className="label">SMS API Key</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input className="input pl-10" placeholder="Generate or enter an API key" value={smsApiKey} onChange={(e) => setSmsApiKey(e.target.value)} />
                  </div>
                  <button className="btn-secondary" onClick={genApiKey} type="button">Generate</button>
                </div>
                <p className="text-xs text-neutral-400 mt-1">The SMS Forwarder app will use this key to authenticate.</p>
              </div>
              <div className="rounded-lg bg-primary-50 border border-primary-100 p-4">
                <p className="text-xs text-primary-700 font-mono">
                  <strong>Endpoint:</strong> POST /functions/v1/sms-ingest<br />
                  <strong>Header:</strong> Authorization: Bearer YOUR_API_KEY<br />
                  <strong>Body:</strong> {'{ "sms_body": "...", "sender": "...", "received_timestamp": "..." }'}
                </p>
              </div>
              <div className="flex gap-3">
                <button className="btn-secondary flex-1" onClick={() => setStep(2)}><ArrowLeft className="w-4 h-4" /> Back</button>
                <button className="btn-primary flex-1" onClick={handleComplete} disabled={loading}>
                  {loading ? 'Setting up...' : 'Complete Setup'} <CheckCircle2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
