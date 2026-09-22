import { useState, useEffect } from 'react';
import { RefreshCw, Search } from 'lucide-react';

const ACTION_LABELS = {
  task_created:   'ساخت وظیفه',
  task_assigned:  'تخصیص',
  task_reassigned:'تخصیص مجدد',
  field_edited:   'ویرایش فیلد',
  task_submitted: 'ثبت توسط اپراتور',
  task_confirmed: 'تأیید ثبت',
  task_rejected:  'رد',
};

const ACTION_COLORS = {
  task_created:   'text-gray-400',
  task_assigned:  'text-blue-400',
  task_reassigned:'text-cyan-400',
  field_edited:   'text-yellow-400',
  task_submitted: 'text-purple-400',
  task_confirmed: 'text-green-400',
  task_rejected:  'text-red-400',
};

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = () => {
    setLoading(true);
    fetch('/api/audit')
      .then(r => r.json())
      .then(d => { setLogs(d.logs || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = search
    ? logs.filter(l =>
        (l.taskId || '').includes(search) ||
        (l.operatorId || '').includes(search) ||
        (l.action || '').includes(search) ||
        (l.field || '').includes(search)
      )
    : logs;

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">لاگ ممیزی</h2>
        <button onClick={load} className="p-2 text-dark-500 hover:text-gray-300 transition-colors">
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="جستجو در task، اپراتور، فیلد یا نوع عملیات..."
          className="w-full bg-dark-900 border border-dark-700 rounded-xl px-4 py-3 pr-10 text-sm text-white text-right placeholder:text-dark-500 focus:outline-none focus:border-dark-500"
          dir="auto"
        />
      </div>

      {/* Log entries */}
      {loading ? (
        <div className="text-center text-dark-500 py-8">در حال بارگذاری...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-dark-500 py-8">لاگی یافت نشد</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(log => (
            <div key={log.id} className="bg-dark-900 border border-dark-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className={`font-mono text-xs ${ACTION_COLORS[log.action] || 'text-gray-400'}`}>
                    {ACTION_LABELS[log.action] || log.action}
                  </span>
                  <span className="text-xs text-dark-500 font-mono">{log.taskId}</span>
                </div>
                <span className="text-xs text-gray-500">{new Date(log.timestamp).toLocaleString('fa-IR')}</span>
              </div>

              <div className="flex items-center gap-4 text-xs text-gray-500">
                {log.operatorId && (
                  <span>توسط: <span className="text-gray-300">{log.operatorId}</span></span>
                )}
                {log.field && (
                  <span>فیلد: <span className="text-yellow-400">{log.field}</span></span>
                )}
              </div>

              {log.oldValue != null && log.newValue != null && (
                <div className="mt-2 text-xs bg-dark-800 rounded-lg p-2">
                  <span className="text-red-400/70">{typeof log.oldValue === 'object' ? JSON.stringify(log.oldValue) : String(log.oldValue)}</span>
                  <span className="text-dark-500 mx-2">→</span>
                  <span className="text-emerald-400/70">{typeof log.newValue === 'object' ? JSON.stringify(log.newValue) : String(log.newValue)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-dark-500 text-center">
        {filtered.length} رکورد
      </div>
    </div>
  );
}
