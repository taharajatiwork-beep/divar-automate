import { useState } from 'react';
import { Megaphone, AlertTriangle, ChevronLeft, Shield, User, Crown } from 'lucide-react';

const DEMO_USERS = [
  { id: 'ali',   name: 'علی',   role: 'operator',   token: 'tok-ali-1234' },
  { id: 'sara',  name: 'سارا',  role: 'operator',   token: 'tok-sara-5678' },
  { id: 'reza',  name: 'رضا',  role: 'supervisor', token: 'tok-reza-abcd' },
  { id: 'admin', name: 'مدیر سیستم', role: 'manager', token: 'tok-admin-xyz' },
];

const ROLE_LABELS = { operator: 'اپراتور', supervisor: 'سرپرست', manager: 'مدیر' };

const ROLE_COLORS = {
  operator:   'from-blue-500 to-cyan-400',
  supervisor: 'from-violet-500 to-purple-400',
  manager:    'from-amber-500 to-yellow-400',
};

const ROLE_BADGE_CLASSES = {
  operator:   'bg-blue-500/15 text-blue-400 border-blue-500/30',
  supervisor: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  manager:    'bg-amber-500/15 text-amber-400 border-amber-500/30',
};

const ROLE_ICONS = {
  operator: User,
  supervisor: Shield,
  manager: Crown,
};

const AVATAR_GRADIENTS = [
  'from-emerald-500 to-teal-400',
  'from-rose-500 to-pink-400',
  'from-violet-500 to-indigo-400',
  'from-amber-500 to-orange-400',
];

export default function Login({ onLogin }) {
  const [error, setError] = useState(null);
  const [loadingId, setLoadingId] = useState(null);

  const handleLogin = async (user) => {
    setError(null);
    setLoadingId(user.id);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: user.token }),
      });
      const data = await res.json();
      if (data.user) {
        onLogin({ ...data.user, token: user.token });
      } else {
        setError(data.error || 'خطا در احراز هویت');
      }
    } catch {
      setError('سرور در دسترس نیست.');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="min-h-screen login-bg flex items-center justify-center p-4">
      {/* ── Main card ── */}
      <div className="w-full max-w-md animate-fade-in-up">
        {/* ── Branding ── */}
        <div className="text-center mb-8 animate-fade-in-up animate-delay-1">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 shadow-lg shadow-blue-500/25 mb-5">
            <Megaphone size={40} className="text-white" strokeWidth={1.8} />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">دیوار پایلوت</h1>
          <p className="text-gray-400 text-sm leading-relaxed">سیستم انتشار نیمه‌خودکار آگهی</p>
        </div>

        {/* ── Login card ── */}
        <div className="bg-gray-900/70 backdrop-blur-sm rounded-2xl border border-gray-700/50 p-6 shadow-2xl shadow-black/40 animate-fade-in-up animate-delay-2">
          <h2 className="text-base font-semibold text-gray-300 mb-4 text-center">انتخاب کاربر برای ورود</h2>

          {/* ── Error state ── */}
          {error && (
            <div className="flex items-center gap-3 bg-red-950/50 border border-red-800/50 text-red-400 rounded-xl p-3.5 mb-4 text-sm animate-fade-in-up">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center">
                <AlertTriangle size={16} className="text-red-400" />
              </div>
              <span className="flex-1">{error}</span>
            </div>
          )}

          {/* ── User cards ── */}
          <div className="space-y-2.5">
            {DEMO_USERS.map((user, i) => {
              const RoleIcon = ROLE_ICONS[user.role];
              const isLoading = loadingId === user.id;
              return (
                <button
                  key={user.id}
                  onClick={() => handleLogin(user)}
                  disabled={loadingId !== null}
                  className={`w-full flex items-center gap-3.5 bg-gray-800/60 hover:bg-gray-800 border border-gray-700/50 hover:border-gray-600 rounded-xl p-4 transition-all duration-200 group cursor-pointer disabled:opacity-50 disabled:cursor-wait hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5 animate-fade-in-up animate-delay-${i + 3}`}
                >
                  {/* Avatar */}
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length]} flex items-center justify-center text-white font-bold text-lg shadow-md flex-shrink-0`}>
                    {user.name[0]}
                  </div>

                  {/* Name + role label */}
                  <div className="flex-1 text-right min-w-0">
                    <div className="text-white font-medium text-sm truncate">{user.name}</div>
                    <div className="text-gray-500 text-xs mt-0.5">{ROLE_LABELS[user.role]}</div>
                  </div>

                  {/* Role badge */}
                  <div className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg border ${ROLE_BADGE_CLASSES[user.role]} flex-shrink-0`}>
                    <RoleIcon size={12} />
                    <span>{user.role}</span>
                  </div>

                  {/* Arrow */}
                  <ChevronLeft size={16} className="text-gray-600 group-hover:text-gray-400 transition-colors flex-shrink-0" />
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="text-center mt-6 animate-fade-in-up animate-delay-7">
          <p className="text-xs text-gray-600">
            فقط کاربران مجاز · فاز پایلوت
          </p>
          <p className="text-[10px] text-gray-700 mt-1">v0.1.0</p>
        </div>
      </div>
    </div>
  );
}
