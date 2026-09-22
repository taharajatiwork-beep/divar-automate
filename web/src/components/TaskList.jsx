import { useState, useEffect } from 'react';
import { RefreshCw, Plus, Filter } from 'lucide-react';

const STATUS_LABELS = {
  needs_review: 'نیازمند بررسی',
  ready_for_assignment: 'آماده تخصیص',
  assigned: 'تخصیص‌یافته',
  prefill_ready: 'آماده ثبت',
  submitted: 'ثبت‌شده',
  confirmed: 'تأیید شده',
  rejected: 'رد شده',
};

const STATUS_BADGE = {
  needs_review: 'bg-orange-900/40 text-orange-300',
  ready_for_assignment: 'bg-emerald-900/40 text-emerald-300',
  assigned: 'bg-blue-900/40 text-blue-300',
  prefill_ready: 'bg-yellow-900/40 text-yellow-300',
  submitted: 'bg-purple-900/40 text-purple-300',
  confirmed: 'bg-green-900/40 text-green-300',
  rejected: 'bg-red-900/40 text-red-300',
};

export default function TaskList({ onSelect, onRefresh }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [products, setProducts] = useState([]);
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/tasks')
      .then(r => r.json())
      .then(d => { setTasks(d.tasks || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    fetch('/api/products').then(r => r.json()).then(d => setProducts(d.products || []));
  }, []);

  const createTask = (productId) => {
    setCreating(true);
    fetch('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId, createdBy: 'supervisor-demo' }),
    })
      .then(r => r.json())
      .then(() => { load(); onRefresh(); setCreating(false); })
      .catch(() => setCreating(false));
  };

  const claimNext = () => {
    fetch('/api/tasks/claim-next', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operatorId: 'op-pilot-1' }),
    })
      .then(r => r.json())
      .then(() => { load(); onRefresh(); });
  };

  const filtered = filter ? tasks.filter(t => t.status === filter) : tasks;

  const statusCounts = {};
  for (const t of tasks) {
    statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">وظایف</h2>
        <button onClick={() => { load(); onRefresh(); }} className="p-2 text-dark-500 hover:text-gray-300 transition-colors">
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Create new task */}
      <div className="bg-dark-900 rounded-xl border border-dark-700 p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
          <Plus size={16} /> ساخت وظیفه جدید از محصول Mock
        </h3>
        <div className="flex flex-wrap gap-2">
          {products.map(p => (
            <button
              key={p.id}
              onClick={() => createTask(p.id)}
              disabled={creating}
              className="px-3 py-2 bg-dark-700 hover:bg-dark-600 disabled:opacity-50 rounded-lg text-sm text-gray-300 transition-colors"
            >
              {p.title} ({p.id})
            </button>
          ))}
        </div>
      </div>

      {/* Claim next task */}
      <button
        onClick={claimNext}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm text-white font-medium transition-colors"
      >
        تخصیص وظیفه بعدی به op-pilot-1
      </button>

      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-dark-500" />
        <button
          onClick={() => setFilter('')}
          className={`px-3 py-1 rounded-full text-xs transition-colors ${!filter ? 'bg-dark-600 text-white' : 'bg-dark-800 text-dark-500 hover:text-gray-300'}`}
        >
          همه ({tasks.length})
        </button>
        {Object.entries(statusCounts).map(([status, count]) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-3 py-1 rounded-full text-xs transition-colors ${filter === status ? 'bg-dark-600 text-white' : 'bg-dark-800 text-dark-500 hover:text-gray-300'}`}
          >
            {STATUS_LABELS[status] || status} ({count})
          </button>
        ))}
      </div>

      {/* Task table */}
      {loading ? (
        <div className="text-center text-dark-500 py-8">در حال بارگذاری...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-dark-500 py-8">وظیفه‌ای یافت نشد</div>
      ) : (
        <div className="bg-dark-900 rounded-xl border border-dark-700 overflow-hidden">
          <table className="w-full text-sm" dir="rtl">
            <thead>
              <tr className="border-b border-dark-700">
                <th className="px-4 py-3 text-right text-dark-500 font-medium">شناسه</th>
                <th className="px-4 py-3 text-right text-dark-500 font-medium">محصول</th>
                <th className="px-4 py-3 text-right text-dark-500 font-medium">عنوان آگهی</th>
                <th className="px-4 py-3 text-right text-dark-500 font-medium">قیمت</th>
                <th className="px-4 py-3 text-right text-dark-500 font-medium">وضعیت</th>
                <th className="px-4 py-3 text-right text-dark-500 font-medium">اپراتور</th>
                <th className="px-4 py-3 text-right text-dark-500 font-medium">تاریخ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr
                  key={t.id}
                  onClick={() => onSelect(t.id)}
                  className="border-b border-dark-800 hover:bg-dark-800 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 text-white font-mono text-xs">{t.id}</td>
                  <td className="px-4 py-3 text-gray-400">{t.productId}</td>
                  <td className="px-4 py-3 text-gray-300 max-w-[200px] truncate">{t.payload?.title || '—'}</td>
                  <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{(t.payload?.price || 0).toLocaleString('fa-IR')} تومان</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[t.status] || 'bg-dark-700 text-gray-400'}`}>
                      {STATUS_LABELS[t.status] || t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{t.assignedOperatorId || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {t.createdAt ? new Date(t.createdAt).toLocaleString('fa-IR') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
