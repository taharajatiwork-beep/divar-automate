import { useState, useEffect } from 'react';
import { ClipboardCheck, Clock, AlertTriangle, CheckCircle, XCircle, Users, FileText, TrendingUp, Shield, Image } from 'lucide-react';

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

export default function Dashboard({ onNavigate, token }) {
  const [stats, setStats] = useState(null);
  const [quota, setQuota] = useState([]);
  const [imageSummary, setImageSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    Promise.all([
      fetch('/api/stats', { headers }).then(r => r.json()),
      fetch('/api/quota', { headers }).then(r => r.json()),
      fetch('/api/images/summary', { headers }).then(r => r.json()),
    ])
      .then(([s, q, img]) => {
        setStats(s.stats);
        setQuota(q.accounts || []);
        setImageSummary(img.summary);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token]);

  if (loading) return <div className="text-center text-dark-500 py-12">در حال بارگذاری...</div>;
  if (!stats) return <div className="text-center text-red-400 py-12">خطا در دریافت اطلاعات</div>;

  const totalTasks = stats.total || 0;
  const byStatus = stats.byStatus || {};
  const operators = stats.operatorWorkload || {};

  const cards = [
    { label: 'کل وظایف', value: totalTasks, icon: FileText, color: 'text-gray-300' },
    { label: 'آماده تخصیص', value: byStatus.ready_for_assignment || stats.queueDepth || 0, icon: Clock, color: 'text-emerald-400' },
    { label: 'تخصیص‌یافته', value: byStatus.assigned || 0, icon: ClipboardCheck, color: 'text-blue-400' },
    { label: 'آماده ثبت', value: byStatus.prefill_ready || 0, icon: AlertTriangle, color: 'text-yellow-400' },
    { label: 'ثبت‌شده', value: byStatus.submitted || 0, icon: CheckCircle, color: 'text-purple-400' },
    { label: 'تأیید شده', value: byStatus.confirmed || stats.confirmed || 0, icon: CheckCircle, color: 'text-green-400' },
    { label: 'رد شده', value: byStatus.rejected || stats.failed || 0, icon: XCircle, color: 'text-red-400' },
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quota Status */}
        <div className="bg-dark-900 rounded-xl border border-dark-700 p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <Shield size={16} /> وضعیت سهمیه اکانت‌ها
          </h3>
          {quota.length === 0 ? (
            <div className="text-dark-500 text-sm">هنوز اکانتی ثبت نشده.</div>
          ) : (
            <div className="space-y-3">
              {quota.map(a => (
                <div key={a.accountId} className="bg-dark-800 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-white">{a.accountId}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${a.status === 'active' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                      {a.status === 'active' ? 'فعال' : a.status === 'quota_reached' ? 'تمام شده' : 'متوقف'}
                    </span>
                  </div>
                  <div className="w-full bg-dark-700 rounded-full h-2 mb-1">
                    <div
                      className={`h-2 rounded-full ${a.utilizationPercent >= 80 ? 'bg-red-500' : 'bg-green-500'}`}
                      style={{ width: `${Math.min(100, a.utilizationPercent)}%` }}
                    />
                  </div>
                  <div className="text-xs text-dark-500">
                    {a.postedToday}/{a.dailyLimit} — باقیمانده ایمن: {a.safeRemaining}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Operator Workload */}
        <div className="bg-dark-900 rounded-xl border border-dark-700 p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <Users size={16} /> بار کاری اپراتورها
          </h3>
          {Object.keys(operators).length === 0 ? (
            <div className="text-dark-500 text-sm">هنوز اپراتوری فعال نیست.</div>
          ) : (
            <div className="space-y-3">
              {Object.entries(operators).map(([id, w]) => (
                <div key={id} className="bg-dark-800 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-white">{id}</span>
                    <span className="text-xs text-dark-500">
                      {w.active} فعال · {w.completed} تکمیل · {w.total} کل
                    </span>
                  </div>
                  <div className="w-full bg-dark-700 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full"
                      style={{ width: `${w.total > 0 ? (w.completed / w.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Image Status */}
      <div className="bg-dark-900 rounded-xl border border-dark-700 p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
          <Image size={16} /> وضعیت آماده‌سازی تصاویر
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-dark-800 rounded-lg">
            <div className="text-xl font-bold text-blue-400">{imageSummary?.totalImages ?? 0}</div>
            <div className="text-xs text-dark-500">تصویر کل</div>
          </div>
          <div className="text-center p-3 bg-dark-800 rounded-lg">
            <div className="text-xl font-bold text-green-400">{imageSummary?.readyTasks ?? 0}</div>
            <div className="text-xs text-dark-500">آماده</div>
          </div>
          <div className="text-center p-3 bg-dark-800 rounded-lg">
            <div className="text-xl font-bold text-red-400">{imageSummary?.errorTasks ?? 0}</div>
            <div className="text-xs text-dark-500">خطا</div>
          </div>
          <div className="text-center p-3 bg-dark-800 rounded-lg">
            <div className="text-xl font-bold text-yellow-400">{imageSummary?.pendingTasks ?? 0}</div>
            <div className="text-xs text-dark-500">در انتظار</div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="bg-dark-900 rounded-xl border border-dark-700 p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">دسترسی سریع</h3>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => onNavigate('tasks')} className="px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg text-sm text-gray-300 transition-colors">
            مشاهده وظایف
          </button>
          <button onClick={() => onNavigate('audit')} className="px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg text-sm text-gray-300 transition-colors">
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
