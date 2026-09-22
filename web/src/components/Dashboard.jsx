import { useState, useEffect } from 'react';
import { ClipboardCheck, Clock, AlertTriangle, CheckCircle, XCircle, Users, FileText, TrendingUp } from 'lucide-react';

const STATUS_LABELS = {
  needs_review: 'نیازمند بررسی',
  ready_for_assignment: 'آماده تخصیص',
  assigned: 'تخصیص‌یافته',
  prefill_ready: 'آماده ثبت',
  submitted: 'ثبت‌شده',
  confirmed: 'تأیید شده',
  rejected: 'رد شده',
};

const STATUS_COLORS = {
  needs_review: 'text-orange-400 bg-orange-900/30',
  ready_for_assignment: 'text-emerald-400 bg-emerald-900/30',
  assigned: 'text-blue-400 bg-blue-900/30',
  prefill_ready: 'text-yellow-400 bg-yellow-900/30',
  submitted: 'text-purple-400 bg-purple-900/30',
  confirmed: 'text-green-400 bg-green-900/30',
  rejected: 'text-red-400 bg-red-900/30',
};

export default function Dashboard({ onNavigate }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.json())
      .then(d => { setStats(d.stats); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center text-dark-500 py-12">در حال بارگذاری...</div>;
  if (!stats) return <div className="text-center text-red-400 py-12">خطا در دریافت اطلاعات</div>;

  const totalTasks = stats.total || 0;
  const byStatus = stats.byStatus || {};
  const operators = stats.operators || {};

  const cards = [
    { label: 'کل وظایف', value: totalTasks, icon: FileText, color: 'text-gray-300' },
    { label: 'آماده تخصیص', value: byStatus.ready_for_assignment || 0, icon: Clock, color: 'text-emerald-400' },
    { label: 'تخصیص‌یافته', value: byStatus.assigned || 0, icon: ClipboardCheck, color: 'text-blue-400' },
    { label: 'آماده ثبت', value: byStatus.prefill_ready || 0, icon: AlertTriangle, color: 'text-yellow-400' },
    { label: 'ثبت‌شده', value: byStatus.submitted || 0, icon: CheckCircle, color: 'text-purple-400' },
    { label: 'تأیید شده', value: byStatus.confirmed || 0, icon: CheckCircle, color: 'text-green-400' },
    { label: 'رد شده', value: byStatus.rejected || 0, icon: XCircle, color: 'text-red-400' },
    { label: 'نرخ تأیید', value: stats.confirmationRate != null ? `${stats.confirmationRate}%` : '—', icon: TrendingUp, color: 'text-cyan-400' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">داشبورد</h2>
        <span className="text-sm text-dark-500">پایلوت · دسته‌بندی: موبایل</span>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(c => (
          <div key={c.label} className="bg-dark-900 rounded-xl border border-dark-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <c.icon size={16} className={c.color} />
              <span className="text-xs text-dark-500">{c.label}</span>
            </div>
            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Operator workload */}
      {Object.keys(operators).length > 0 && (
        <div className="bg-dark-900 rounded-xl border border-dark-700 p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <Users size={16} /> بار کاری اپراتورها
          </h3>
          <div className="space-y-2">
            {Object.entries(operators).map(([op, count]) => (
              <div key={op} className="flex items-center justify-between text-sm">
                <span className="text-gray-400">{op}</span>
                <span className="text-white font-medium">{count} وظیفه</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="bg-dark-900 rounded-xl border border-dark-700 p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">دسترسی سریع</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => onNavigate('tasks')}
            className="px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg text-sm text-gray-300 transition-colors"
          >
            مشاهده وظایف
          </button>
          <button
            onClick={() => onNavigate('audit')}
            className="px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg text-sm text-gray-300 transition-colors"
          >
            لاگ ممیزی
          </button>
        </div>
      </div>

      {/* Lifecycle legend */}
      <div className="bg-dark-900 rounded-xl border border-dark-700 p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">چرخه عمر وظیفه</h3>
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <span key={key} className={`px-3 py-1.5 rounded-full ${STATUS_COLORS[key] || 'bg-dark-700 text-gray-400'}`}>
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
