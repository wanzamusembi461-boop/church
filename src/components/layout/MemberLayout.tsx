import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Wallet, FileText, Bell, Settings as SettingsIcon,
  Church, LogOut, Menu, X, User as UserIcon
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';

const navItems = [
  { path: '/member/dashboard', label: 'Home', icon: LayoutDashboard },
  { path: '/member/contributions', label: 'Contributions', icon: Wallet },
  { path: '/member/statement', label: 'Statement', icon: FileText },
  { path: '/member/notifications', label: 'Notifications', icon: Bell },
  { path: '/member/settings', label: 'Settings', icon: SettingsIcon },
];

export function MemberLayout() {
  const { member, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
      {/* Top header */}
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto flex items-center px-4 h-14">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
              <Church className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="font-serif font-semibold text-neutral-900">My Church</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
              <span className="text-xs font-semibold text-primary-700">{member?.full_name?.charAt(0).toUpperCase() || 'M'}</span>
            </div>
            <button onClick={handleSignOut} className="text-neutral-500 hover:text-neutral-700 p-1.5">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 pb-20">
        <div className="max-w-3xl mx-auto p-4">
          <Outlet />
        </div>
      </main>

      {/* Bottom navigation - mobile first */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 z-30">
        <div className="max-w-3xl mx-auto flex items-center justify-around px-2 h-16">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${active ? 'text-primary-600' : 'text-neutral-400'}`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
