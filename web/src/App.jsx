import { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar.jsx';
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
  const [page, setPage] = useState('dashboard');
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const navigateTo = (p, taskId) => {
    setPage(p);
    setSelectedTaskId(taskId || null);
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar pages={PAGES} active={page} onNavigate={navigateTo} />

      <main className="flex-1 p-6 overflow-auto" dir="rtl">
        {page === 'dashboard' && <Dashboard key={refreshKey} onNavigate={navigateTo} />}
        {page === 'tasks' && !selectedTaskId && (
          <TaskList key={refreshKey} onSelect={(id) => navigateTo('tasks', id)} onRefresh={refresh} />
        )}
        {page === 'tasks' && selectedTaskId && (
          <TaskDetail taskId={selectedTaskId} onBack={() => navigateTo('tasks')} onRefresh={refresh} />
        )}
        {page === 'audit' && <AuditLog key={refreshKey} />}
      </main>
    </div>
  );
}
