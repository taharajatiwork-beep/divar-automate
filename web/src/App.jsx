import { useState, useCallback, useEffect } from 'react';
import { Megaphone, Globe, LogOut } from 'lucide-react';
import Sidebar from './components/Sidebar.jsx';
import Login from './components/Login.jsx';
import Dashboard from './components/Dashboard.jsx';
import OperatorDashboard from './components/OperatorDashboard.jsx';
import TaskList from './components/TaskList.jsx';
import TaskDetail from './components/TaskDetail.jsx';
import AuditLog from './components/AuditLog.jsx';
import { ToastProvider } from './components/ToastProvider.jsx';

const ADMIN_PAGES = {
  dashboard: { label: 'داشبورد', icon: '📊' },
  tasks:     { label: 'وظایف',   icon: '📋' },
  audit:     { label: 'لاگ ممیزی', icon: '🔍' },
};

const OPERATOR_PAGES = {
  dashboard: { label: 'تابلوی محصولات', icon: '📦' },
  tasks:     { label: 'وظایف من',       icon: '📋' },
};

const ROLE_LABELS = { operator: 'اپراتور', supervisor: 'سرپرست', manager: 'مدیر' };

const ROLE_AVATAR_COLORS = {
  operator:   'from-blue-500 to-cyan-400',
  supervisor: 'from-violet-500 to-purple-400',
  manager:    'from-amber-500 to-orange-400',
};

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [browserStatus, setBrowserStatus] = useState(null);

  const isOperator = user?.role === 'operator';
  const pages = isOperator ? OPERATOR_PAGES : ADMIN_PAGES;

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const navigateTo = (p, taskId) => {
    setPage(p);
    setSelectedTaskId(taskId || null);
  };

  const handleLogout = () => {
    setUser(null);
    setPage('dashboard');
    setSelectedTaskId(null);
    setBrowserStatus(null);
  };

  // Poll browser status
  useEffect(() => {
    if (!user) return;
    const checkBrowser = async () => {
      try {
        const r = await fetch('/api/browser/status', {
          headers: user.token ? { Authorization: 'Bearer ' + user.token } : {}
        });
        if (r.ok) setBrowserStatus(await r.json());
      } catch { /* ignore */ }
    };
    checkBrowser();
    const iv = setInterval(checkBrowser, 10000);
    return () => clearInterval(iv);
  }, [user]);

  if (!user) {
    return <ToastProvider><Login onLogin={setUser} /></ToastProvider>;
  }

  const browserReady = browserStatus?.ready;
  const browserNeedsLogin = browserStatus?.loginRequired;

  const browserLabel = browserReady
    ? (browserNeedsLogin ? 'نیاز به ورود' : 'مرورگر متصل')
    : 'مرورگر قطع';

  const browserTooltip = browserReady
    ? (browserStatus.currentUrl
        ? 'صفحه فعلی: ' + browserStatus.currentUrl
        : 'مرورگر آماده است')
    : 'مرورگر متصل نیست';

  const dotColor = browserReady
    ? (browserNeedsLogin ? 'bg-yellow-400 pulse-yellow' : 'bg-green-400 pulse-green')
    : 'bg-gray-600';

  return (
    <ToastProvider>
    <div className="flex min-h-screen">
      <Sidebar pages={pages} active={page} onNavigate={navigateTo} browserStatus={browserStatus} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="topbar-gradient border-b border-gray-700/60">
          <div className="flex items-center justify-between px-5 py-2.5">
            {/* Right: App branding (RTL start) */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-md shadow-blue-500/20">
                <Megaphone size={16} className="text-white" strokeWidth={2} />
              </div>
              <span className="text-sm font-bold text-gray-200 hidden sm:inline">{'\u062f\u06cc\u0648\u0627\u0631 \u067e\u0627\u06cc\u0644\u0648\u062a'}</span>
            </div>

            {/* Left: User info, browser pill, logout (RTL end) */}
            <div className="flex items-center gap-3">
              {/* Browser status pill */}
              <button className="browser-pill flex items-center gap-2 bg-gray-800/60 hover:bg-gray-800 border border-gray-700/50 rounded-full px-3 py-1.5 transition-all cursor-default">
                <div className={'w-2 h-2 rounded-full flex-shrink-0 ' + dotColor} />
                <span className={'text-xs font-medium ' + (browserReady ? (browserNeedsLogin ? 'text-yellow-400' : 'text-green-400') : 'text-gray-500')}>
                  {browserLabel}
                </span>
                <Globe size={12} className={'flex-shrink-0 ' + (browserReady ? (browserNeedsLogin ? 'text-yellow-400/60' : 'text-green-400/60') : 'text-gray-600')} />

                {/* Tooltip */}
                <div className="browser-pill-tooltip absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50">
                  <div className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-xs text-gray-300 whitespace-nowrap shadow-xl">
                    {browserTooltip}
                    {browserReady && browserStatus.currentUrl && (
                      <div className="text-[10px] text-gray-500 mt-1 font-mono truncate max-w-[220px]">
                        {browserStatus.currentUrl}
                      </div>
                    )}
                  </div>
                  {/* Arrow */}
                  <div className="w-2 h-2 bg-gray-800 border-b border-r border-gray-600 rotate-45 mx-auto -mt-1" />
                </div>
              </button>

              {/* Divider */}
              <div className="w-px h-6 bg-gray-700/50" />

              {/* User avatar + info */}
              <div className="flex items-center gap-2.5">
                <div className={'w-8 h-8 rounded-full bg-gradient-to-br ' + (ROLE_AVATAR_COLORS[user.role] || 'from-gray-500 to-gray-400') + ' flex items-center justify-center text-white text-sm font-bold shadow-md'}>
                  {user.name[0]}
                </div>
                <div className="hidden md:block text-right">
                  <div className="text-sm font-medium text-gray-200 leading-tight">{user.name}</div>
                  <div className="text-[11px] text-gray-500 leading-tight">{ROLE_LABELS[user.role]}</div>
                </div>
              </div>

              {/* Logout */}
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-400 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-red-500/10"
              >
                <LogOut size={14} />
                <span className="hidden sm:inline">{'\u062e\u0631\u0648\u062c'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Main content */}
        <main key={page + '-' + selectedTaskId} className="flex-1 p-6 overflow-auto page-transition" dir="rtl">
          {/* Operator view */}
          {isOperator && page === 'dashboard' && (
            <OperatorDashboard key={refreshKey} token={user.token} user={user} />
          )}
          {isOperator && page === 'tasks' && !selectedTaskId && (
            <TaskList key={refreshKey} onSelect={(id) => navigateTo('tasks', id)} onRefresh={refresh} token={user.token} user={user} />
          )}
          {isOperator && page === 'tasks' && selectedTaskId && (
            <TaskDetail taskId={selectedTaskId} onBack={() => navigateTo('tasks')} onRefresh={refresh} token={user.token} user={user} />
          )}

          {/* Admin/Supervisor/Manager view */}
          {!isOperator && page === 'dashboard' && (
            <Dashboard key={refreshKey} onNavigate={navigateTo} token={user.token} />
          )}
          {!isOperator && page === 'tasks' && !selectedTaskId && (
            <TaskList key={refreshKey} onSelect={(id) => navigateTo('tasks', id)} onRefresh={refresh} token={user.token} user={user} />
          )}
          {!isOperator && page === 'tasks' && selectedTaskId && (
            <TaskDetail taskId={selectedTaskId} onBack={() => navigateTo('tasks')} onRefresh={refresh} token={user.token} user={user} />
          )}
          {!isOperator && page === 'audit' && (
            <AuditLog key={refreshKey} token={user.token} />
          )}
        </main>
      </div>
    </div>
    </ToastProvider>
  );
}