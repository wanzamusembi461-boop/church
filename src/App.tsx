import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ToastProvider } from '@/components/ui/Toast';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { MemberLayout } from '@/components/layout/MemberLayout';
import { LoginPage } from '@/pages/auth/LoginPage';
import { ChangePasswordPage } from '@/pages/auth/ChangePasswordPage';
import { SetupWizardPage } from '@/pages/auth/SetupWizardPage';
import { AdminDashboard } from '@/pages/admin/AdminDashboard';
import { MemberManagement } from '@/pages/admin/MemberManagement';
import { ExcelImport } from '@/pages/admin/ExcelImport';
import { ContributionManagement } from '@/pages/admin/ContributionManagement';
import { SmsTransactions } from '@/pages/admin/SmsTransactions';
import { Defaulters } from '@/pages/admin/Defaulters';
import { NotificationsAdmin } from '@/pages/admin/NotificationsAdmin';
import { RemindersAdmin } from '@/pages/admin/RemindersAdmin';
import { Reports } from '@/pages/admin/Reports';
import { AuditLogs } from '@/pages/admin/AuditLogs';
import { AdminSettings } from '@/pages/admin/AdminSettings';
import { MemberDashboard } from '@/pages/member/MemberDashboard';
import { MemberContributions } from '@/pages/member/MemberContributions';
import { MemberStatement } from '@/pages/member/MemberStatement';
import { MemberNotifications } from '@/pages/member/MemberNotifications';
import { MemberSettings } from '@/pages/member/MemberSettings';
import { supabase } from '@/lib/supabase';
import { Church } from 'lucide-react';

function RootRedirect() {
  const { user, member, loading } = useAuth();
  const navigate = useNavigate();
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [setupDone, setSetupDone] = useState(false);

  useEffect(() => {
    async function checkSetup() {
      try {
        const { count } = await supabase
          .from('members')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'super_admin');
        setSetupDone(!!count && count > 0);
      } catch {
        setSetupDone(false);
      }
      setCheckingSetup(false);
    }
    checkSetup();
  }, []);

  useEffect(() => {
    if (loading || checkingSetup) return;
    if (!user || !member) {
      if (!setupDone) {
        navigate('/setup', { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
    } else if (['super_admin', 'treasurer'].includes(member.role)) {
      if (!member.password_changed) {
        navigate('/change-password', { replace: true });
      } else {
        navigate('/admin/dashboard', { replace: true });
      }
    } else {
      if (!member.password_changed) {
        navigate('/change-password', { replace: true });
      } else {
        navigate('/member/dashboard', { replace: true });
      }
    }
  }, [user, member, loading, checkingSetup, setupDone, navigate]);

  if (loading || checkingSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-accent-50">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary-600 text-white flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Church className="w-8 h-8" />
          </div>
          <p className="text-sm text-neutral-500">Loading...</p>
        </div>
      </div>
    );
  }

  return null;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/setup" element={<SetupWizardPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/change-password" element={<ChangePasswordPage />} />

      {/* Admin routes */}
      <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminLayout /></ProtectedRoute>}>
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="members" element={<MemberManagement />} />
        <Route path="import" element={<ExcelImport />} />
        <Route path="contributions" element={<ContributionManagement />} />
        <Route path="sms-transactions" element={<SmsTransactions />} />
        <Route path="defaulters" element={<Defaulters />} />
        <Route path="reminders" element={<RemindersAdmin />} />
        <Route path="notifications" element={<NotificationsAdmin />} />
        <Route path="reports" element={<Reports />} />
        <Route path="audit-logs" element={<AuditLogs />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>

      {/* Member routes */}
      <Route path="/member" element={<ProtectedRoute><MemberLayout /></ProtectedRoute>}>
        <Route path="dashboard" element={<MemberDashboard />} />
        <Route path="contributions" element={<MemberContributions />} />
        <Route path="statement" element={<MemberStatement />} />
        <Route path="notifications" element={<MemberNotifications />} />
        <Route path="settings" element={<MemberSettings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
