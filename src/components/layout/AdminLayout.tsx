import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, FileSpreadsheet, Wallet, MessageSquare,
  AlertTriangle, Bell, Send, FileText, ScrollText, Settings,
  Church, LogOut, Menu, X, ChevronDown, User as UserIcon
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const navItems = [
  { path: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/admin/members', label: 'Members', icon: Users },
  { path: '/admin/import', label: 'Excel Import', icon: FileSpreadsheet },
  { path: '/admin/contributions', label: 'Contributions', icon: Wallet },
  { path: '/admin/sms-transactions', label: 'SMS Transactions', icon: MessageSquare },
  { path: '/admin/defaulters', label: 'Defaulters', icon: AlertTriangle },
  { path: '/admin/reminders', label: 'Reminders', icon: Send },
  { path: '/admin/notifications', label: 'Notifications', icon: Bell },
  { path: '/admin/reports', label: 'Reports', icon: FileText },
  { path: '/admin/audit-logs', label: 'Audit Logs', icon: ScrollText },
  { path: '/admin/settings', label: 'Settings', icon: Settings },
];

export function AdminLayout() {
  const { member, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isActive = (path: string) => location.pathname.startsWith(path);

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex">
      {/* Mobile overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-neutral-900/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-neutral-900 text-neutral-100 flex flex-col transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-3 px-5 h-16 border-b border-neutral-800">
          <div className="w-9 h-9 rounded-lg bg-primary-600 flex items-center justify-center flex-shrink-0">
            <Church className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">Church Admin</p>
            <p className="text-xs text-neutral-400 truncate">Contribution Manager</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="ml-auto lg:hidden text-neutral-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${active ? 'bg-primary-600 text-white' : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'}`}
              >
                <Icon className="w-4.5 h-4.5 flex-shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-neutral-800 p-3">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center flex-shrink-0">
              <UserIcon className="w-4 h-4 text-neutral-300" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{member?.full_name}</p>
              <p className="text-xs text-neutral-400 truncate capitalize">{member?.role.replace('_', ' ')}</p>
            </div>
          </div>
          <button onClick={handleSignOut} className="w-full mt-2 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors">
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 lg:ml-64 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-neutral-200 flex items-center px-4 lg:px-6 sticky top-0 z-20">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-neutral-600 mr-3">
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-semibold text-neutral-900">
              {navItems.find((i) => isActive(i.path))?.label || 'Admin'}
            </h1>
          </div>
          <div className="relative">
            <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-neutral-100">
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                <span className="text-xs font-semibold text-primary-700">
                  {member?.full_name?.charAt(0).toUpperCase() || 'A'}
                </span>
              </div>
              <ChevronDown className="w-4 h-4 text-neutral-400" />
            </button>
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-20">
                  <div className="px-3 py-2 border-b border-neutral-100">
                    <p className="text-sm font-medium text-neutral-900 truncate">{member?.full_name}</p>
                    <p className="text-xs text-neutral-500 truncate">{member?.phone_number}</p>
                  </div>
                  <button onClick={handleSignOut} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50">
                    <LogOut className="w-4 h-4" /> Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
