import { useState, useCallback } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Login from './components/Login.jsx';
import Dashboard from './components/Dashboard.jsx';
import TaskList from './components/TaskList.jsx';
import TaskDetail from './components/TaskDetail.jsx';
import AuditLog from './components/AuditLog.jsx';

const PAGES = {
  dashboard: { label: 'داشبورد', icon: '📊' },
  tasks:     { label: 'وظایف',   icon: '📋' },
  audit:     { label: 'لاگ ممیزی', icon: '🔍' },
};

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const navigateTo = (p, taskId) => {
    setPage(p);
    setSelectedTaskId(taskId || null);
  };

  const handleLogout = () => {
    setUser(null);
    setPage('dashboard');
    setSelectedTaskId(null);
  };

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  const ROLE_LABELS = { operator: 'اپراتور', supervisor: 'سرپرست', manager: 'مدیر' };

  return (
    <div className="flex min-h-screen">
      <Sidebar pages={PAGES} active={page} onNavigate={navigateTo} />

      {/* Top bar with user info */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between px-6 py-2 bg-gray-900 border-b border-gray-700">
          <span className="text-sm text-gray-400">
            {user.name} — <span className="text-gray-500">{ROLE_LABELS[user.role]}</span>
          </span>
          <button
            onClick={handleLogout}
            className="text-xs text-gray-500 hover:text-red-400 transition-colors"
          >
            خروج
          </button>
        </div>

        <main className="flex-1 p-6 overflow-auto" dir="rtl">
          {page === 'dashboard' && <Dashboard key={refreshKey} onNavigate={navigateTo} token={user.token} />}
          {page === 'tasks' && !selectedTaskId && (
            <TaskList key={refreshKey} onSelect={(id) => navigateTo('tasks', id)} onRefresh={refresh} token={user.token} user={user} />
          )}
          {page === 'tasks' && selectedTaskId && (
            <TaskDetail taskId={selectedTaskId} onBack={() => navigateTo('tasks')} onRefresh={refresh} token={user.token} user={user} />
          )}
          {page === 'audit' && <AuditLog key={refreshKey} token={user.token} />}
        </main>
      </div>
    </div>
  );
}
