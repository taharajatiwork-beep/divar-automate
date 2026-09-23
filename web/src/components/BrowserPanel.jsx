import { useState, useEffect, useCallback } from 'react';
import { Globe, Play, RefreshCw, LogIn, AlertCircle, CheckCircle, Loader2, ExternalLink } from 'lucide-react';

export default function BrowserPanel({ token }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const jsonHeaders = { 'Content-Type': 'application/json', ...headers };

  const checkStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/browser/status', { headers });
      if (r.ok) {
        const d = await r.json();
        setStatus(d);
      }
    } catch {
      setStatus({ ready: false, loginRequired: false });
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    checkStatus();
    const iv = setInterval(checkStatus, 5000);
    return () => clearInterval(iv);
  }, [checkStatus]);

  const launchBrowser = async () => {
    setActionLoading(true);
    setMsg(null);
    try {
      const r = await fetch('/api/browser/launch', { method: 'POST', headers: jsonHeaders });
      const d = await r.json();
      if (r.ok) {
        setMsg({ type: 'success', text: '✅ مرورگر با موفقیت راه‌اندازی شد.' });
        setStatus(d);
      } else {
        setMsg({ type: 'error', text: d.error || 'خطا در راه‌اندازی مرورگر.' });
      }
    } catch {
      setMsg({ type: 'error', text: 'خطا در ارتباط با سرور.' });
    }
    setActionLoading(false);
  };

  const navigateTo = async (url) => {
    setActionLoading(true);
    setMsg(null);
    try {
      const r = await fetch('/api/browser/navigate', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ url }),
      });
      const d = await r.json();
      if (r.ok) {
        setStatus(d);
        setMsg({
          type: d.loginRequired ? 'warning' : 'success',
          text: d.loginRequired ? '⚠️ لطفاً ابتدا وارد حساب دیوار شوید.' : '✅ صفحه باز شد.',
        });
      } else {
        setMsg({ type: 'error', text: d.error || 'خطا.' });
      }
    } catch {
      setMsg({ type: 'error', text: 'خطا در ارتباط با سرور.' });
    }
    setActionLoading(false);
  };

  if (loading) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-700 p-4">
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <Loader2 size={16} className="animate-spin" />
          <span>بررسی وضعیت مرورگر...</span>
        </div>
      </div>
    );
  }

  const isReady = status?.ready;
  const needsLogin = status?.loginRequired;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
          <Globe size={16} /> وضعیت مرورگر کروم
        </h3>
        <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${
          isReady ? 'bg-green-900/40 text-green-400' : 'bg-gray-800 text-gray-500'
        }`}>
          <div className={`w-2 h-2 rounded-full ${isReady ? 'bg-green-400' : 'bg-gray-500'}`} />
          {isReady ? 'متصل' : 'قطع'}
        </div>
      </div>

      {/* Status details */}
      {status && (
        <div className="space-y-2 mb-3">
          {status.currentUrl && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">صفحه فعلی:</span>
              <a
                href={status.currentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 truncate flex items-center gap-1"
              >
                {status.currentUrl.replace('https://', '').substring(0, 50)}
                <ExternalLink size={10} />
              </a>
            </div>
          )}
          {status.profileDir && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">پروفایل:</span>
              <span className="text-gray-400 font-mono text-[10px]">
                {status.profileDir.split(/[\\/]/).pop()}
              </span>
            </div>
          )}
          {isReady && needsLogin && (
            <div className="flex items-center gap-2 text-xs bg-yellow-900/20 border border-yellow-800/30 rounded-lg p-2">
              <AlertCircle size={14} className="text-yellow-400 shrink-0" />
              <span className="text-yellow-300">نیاز به ورود به حساب دیوار</span>
            </div>
          )}
          {isReady && !needsLogin && (
            <div className="flex items-center gap-2 text-xs bg-green-900/20 border border-green-800/30 rounded-lg p-2">
              <CheckCircle size={14} className="text-green-400 shrink-0" />
              <span className="text-green-300">وارد شده — آماده ثبت آگهی</span>
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      {msg && (
        <div className={`mb-3 px-3 py-2 rounded-lg text-xs ${
          msg.type === 'error' ? 'bg-red-900/30 text-red-300 border border-red-700/50' :
          msg.type === 'warning' ? 'bg-yellow-900/30 text-yellow-300 border border-yellow-700/50' :
          'bg-green-900/30 text-green-300 border border-green-700/50'
        }`}>
          {msg.text}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {!isReady && (
          <button
            onClick={launchBrowser}
            disabled={actionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-xs text-white font-medium transition-colors"
          >
            {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            راه‌اندازی مرورگر
          </button>
        )}
        {isReady && needsLogin && (
          <button
            onClick={() => navigateTo('https://divar.ir')}
            disabled={actionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 rounded-lg text-xs text-white font-medium transition-colors"
          >
            {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <LogIn size={12} />}
            باز کردن صفحه ورود
          </button>
        )}
        {isReady && !needsLogin && (
          <button
            onClick={() => navigateTo('https://divar.ir/new')}
            disabled={actionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-xs text-white font-medium transition-colors"
          >
            {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <Globe size={12} />}
            باز کردن فرم ثبت آگهی
          </button>
        )}
        {isReady && (
          <button
            onClick={() => navigateTo('https://divar.ir/my-divar/')}
            disabled={actionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-xs text-gray-300 font-medium transition-colors"
          >
            <ExternalLink size={12} />
            پنل دیوار من
          </button>
        )}
        <button
          onClick={checkStatus}
          disabled={actionLoading}
          className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors"
        >
          <RefreshCw size={14} />
        </button>
      </div>
    </div>
  );
}
