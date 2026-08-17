import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { LoadingState } from '@/components/ui/Loading';

export function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) {
  const { user, member, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingState message="Loading..." />;
  }

  if (!user || !member) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireAdmin && !['super_admin', 'treasurer'].includes(member.role)) {
    return <Navigate to="/member/dashboard" replace />;
  }

  if (!requireAdmin && member.role === 'member' && !member.password_changed && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return <>{children}</>;
}
