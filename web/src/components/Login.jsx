import { useState } from 'react';

const DEMO_USERS = [
  { id: 'ali',   name: 'علی',   role: 'operator',   token: 'tok-ali-1234' },
  { id: 'sara',  name: 'سارا',  role: 'operator',   token: 'tok-sara-5678' },
  { id: 'reza',  name: 'رضا',  role: 'supervisor', token: 'tok-reza-abcd' },
  { id: 'admin', name: 'مدیر سیستم', role: 'manager', token: 'tok-admin-xyz' },
];

const ROLE_LABELS = { operator: 'اپراتور', supervisor: 'سرپرست', manager: 'مدیر' };

export default function Login({ onLogin }) {
  const [error, setError] = useState(null);

  const handleLogin = async (user) => {
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
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="bg-gray-900 rounded-2xl border border-gray-700 p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">ورود به پنل مدیریت</h1>
          <p className="text-gray-400 text-sm">آگهی نیمه‌خودکار — دیوار پایلوت</p>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-400 rounded-lg p-3 mb-4 text-sm text-center">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {DEMO_USERS.map(user => (
            <button
              key={user.id}
              onClick={() => handleLogin(user)}
              className="w-full flex items-center justify-between bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl p-4 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center text-lg font-bold text-white">
                  {user.name[0]}
                </div>
                <div className="text-right">
                  <div className="text-white font-medium">{user.name}</div>
                  <div className="text-gray-400 text-xs">{ROLE_LABELS[user.role]}</div>
                </div>
              </div>
              <span className="text-xs text-gray-500 bg-gray-900 px-2 py-1 rounded">{user.role}</span>
            </button>
          ))}
        </div>

        <div className="mt-6 text-center text-xs text-gray-600">
          فقط کاربران مجاز · فاز پایلوت
        </div>
      </div>
    </div>
  );
}
