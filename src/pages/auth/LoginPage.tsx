import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Church, Lock, Phone, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';

export function LoginPage() {
  const { signIn } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const trimmedPhone = phone.trim();
    if (!trimmedPhone || !password) {
      setError('Please enter your phone number and password.');
      setLoading(false);
      return;
    }

    // Convert phone number to the fake email format used during import
    let normalized = trimmedPhone.replace(/[^\d+]/g, '');
    if (normalized.startsWith('+254')) normalized = '254' + normalized.slice(4);
    else if (normalized.startsWith('254')) {
      // keep
    } else if (normalized.startsWith('07')) normalized = '254' + normalized.slice(1);
    else if (normalized.startsWith('01')) normalized = '254' + normalized.slice(1);
    else if (normalized.startsWith('7')) normalized = '254' + normalized;
    else if (normalized.startsWith('1')) normalized = '254' + normalized;

    const email = normalized + '@church.local';

    const { error: signInError } = await signIn(email, password);

    if (signInError) {
      setError(signInError);
      setLoading(false);
      return;
    }

    toast('Welcome! You have been signed in.', 'success');
    // Redirect based on role - will be handled by auth state change
    setTimeout(() => {
      navigate(from || '/dashboard', { replace: true });
    }, 100);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-accent-50 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-600 text-white shadow-lg mb-4">
            <Church className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-serif font-semibold text-neutral-900">Church Contributions</h1>
          <p className="text-sm text-neutral-500 mt-1">Sign in to your account</p>
        </div>

        <div className="card p-6 sm:p-8">
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-error-50 border border-error-200 px-4 py-3 text-sm text-error-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="phone">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <input
                  id="phone"
                  type="tel"
                  className="input pl-10"
                  placeholder="0712345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="username"
                  disabled={loading}
                />
              </div>
              <p className="text-xs text-neutral-400 mt-1">Enter your registered phone number</p>
            </div>

            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input pl-10 pr-10"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-neutral-100">
            <p className="text-xs text-center text-neutral-400">
              First time signing in? Use your phone number and the default password provided by your church.
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-neutral-400 mt-6">
          <Link to="/" className="hover:text-neutral-600">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
