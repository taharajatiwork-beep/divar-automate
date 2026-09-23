import { useState, useEffect, useCallback } from 'react';
import { Globe, Lock, Unlock, CheckCircle, Image as ImageIcon, MapPin, Loader2, RefreshCw } from 'lucide-react';
import { useToast } from './ToastProvider.jsx';

const CAT_LABELS = { 'vehicles': '🚗 خودرو', 'mobile-phones': '📱 موبایل', 'laptops': '💻 لپ‌تاپ', 'accessories': '🎧 لوازم جانبی' };
const LOCK_MS = 30 * 60 * 1000;

function fmtPrice(p) {
  if (!p) return '—';
  const n = Number(p);
  if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + 'M تومان';
  return new Intl.NumberFormat('fa-IR').format(p) + ' تومان';
}

function lockCountdown(lockedAt) {
  if (!lockedAt) return { text: '', pct: 0 };
  const elapsed = Date.now() - new Date(lockedAt).getTime();
  const remaining = Math.max(0, LOCK_MS - elapsed);
  const pct = Math.min(100, (elapsed / LOCK_MS) * 100);
  if (remaining <= 0) return { text: '⏰ منقضی شد', pct: 100 };
  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  return { text: `${m}:${String(s).padStart(2, '0')}`, pct };
}

function imageUrl(product) {
  if (product.images?.[0]) {
    const img = product.images[0];
    if (img.startsWith('/images/')) return img;
    if (img.startsWith('http')) return img;
  }
  const id = (product.id || '').replace(/\D/g, '').padStart(3, '0');
  return `/images/P${id}_01.jpg`;
}

/* --- Browser Status Bar --- */
function BrowserBar({ token }) {
  const [status, setStatus] = useState(null);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    let alive = true;
    async function check() {
      try {
        const r = await fetch('/api/browser/status', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (r.ok && alive) setStatus(await r.json());
      } catch { if (alive) setStatus({ ready: false }); }
    }
    check();
    const iv = setInterval(check, 5000);
    return () => { alive = false; clearInterval(iv); };
  }, [token]);

  const launch = async () => {
    setLaunching(true);
    try {
      const r = await fetch('/api/browser/launch', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (r.ok) setStatus(d);
    } catch {}
    setLaunching(false);
  };

  const ready = status?.ready;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-900/80 backdrop-blur-sm rounded-xl border border-gray-700/50">
      <div className="flex items-center gap-2">
        <div className={`w-2.5 h-2.5 rounded-full ${ready ? 'bg-emerald-400 pulse-green' : 'bg-gray-600'}`} />
        <Globe size={14} className={ready ? 'text-emerald-400' : 'text-gray-600'} />
        <span className={`text-xs font-medium ${ready ? 'text-emerald-400' : 'text-gray-500'}`}>
          {ready ? 'مرورگر متصل' : 'مرورگر قطع'}
        </span>
      </div>
      {ready && status.currentUrl && (
        <span className="text-[10px] text-gray-600 font-mono truncate max-w-[200px]">
          {status.currentUrl.replace('https://', '')}
        </span>
      )}
      <div className="flex-1" />
      {!ready && (
        <button onClick={launch} disabled={launching} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-xs text-white font-medium transition-colors">
          {launching ? <Loader2 size={12} className="animate-spin" /> : '▶'}
          راه‌اندازی مرورگر
        </button>
      )}
    </div>
  );
}

/* --- Active Work Card --- */
function ActiveCard({ product, onAction, token }) {
  const { addToast } = useToast();
  const [step, setStep] = useState(0);
  const [fillResults, setFillResults] = useState(null);
  const [countdown, setCountdown] = useState({ text: '', pct: 0 });

  useEffect(() => {
    if (product.locked_at) {
      const iv = setInterval(() => setCountdown(lockCountdown(product.locked_at)), 1000);
      return () => clearInterval(iv);
    }
  }, [product.locked_at]);

  const doOpen = async () => {
    try {
      setStep(1);
      addToast('🔄 در حال اتصال به Chrome...', 'info');
      const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

      const launchR = await fetch('/api/browser/launch', { method: 'POST', headers: h });
      const launchD = await launchR.json();
      if (!launchR.ok) { setStep(0); addToast(launchD.error || 'خطا در اتصال Chrome', 'error'); return; }

      addToast('🌐 باز کردن فرم دیوار...', 'info');
      await fetch('/api/browser/navigate', { method: 'POST', headers: h, body: JSON.stringify({ url: 'https://divar.ir/new' }) });

      setStep(2);
      addToast('⏳ در حال پر کردن فرم...', 'info');
      const fillR = await fetch('/api/browser/fill', { method: 'POST', headers: h, body: JSON.stringify({ productId: product.id }) });
      const fillD = await fillR.json();

      if (fillR.ok && fillD.results) {
        setFillResults(fillD.results);
        setStep(3);
        const filled = fillD.results.filter(r => r.status === 'filled' || r.status === 'already-set').length;
        addToast(`✅ فرم پر شد! ${filled} فیلد خودکار. مکان و تماس رو دستی تکمیل کن.`, 'success');
      } else {
        setStep(0);
        addToast(fillD.error || 'خطا در پر کردن فرم', 'error');
      }
    } catch (e) {
      setStep(0);
      addToast('خطا: ' + e.message, 'error');
    }
  };

  const doReconnect = async () => {
    try {
      const r = await fetch('/api/browser/reconnect', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (d.ready) {
        setBrowserStatus(d);
        addToast('✅ مرورگر متصل شد', 'success');
      } else {
        addToast('❌ خطا در اتصال مرورگر', 'error');
      }
    } catch { addToast('خطا در اتصال مرورگر', 'error'); }
  };
  const doCancel = async () => {
    try {
      await fetch('/api/browser/fill/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
      setStep(0); setFillResults(null);
      addToast('⛔ فرایند لغو شد', 'info');
    } catch { addToast('خطا در لغو', 'error'); }
  };

  const doComplete = async () => {
    try {
      const r = await fetch(`/api/products/${product.id}/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (r.ok) { addToast('🎉 ثبت تأیید شد!', 'success'); onAction('refresh'); }
      else addToast(d.error || 'خطا', 'error');
    } catch { addToast('خطا در ارتباط با سرور', 'error'); }
  };

  const filledFields = fillResults?.filter(r => r.status === 'filled' || r.status === 'already-set' || r.status === 'auto-filled-match') || [];
  const failedFields = fillResults?.filter(r => r.status !== 'filled' && r.status !== 'already-set' && r.status !== 'auto-filled-match' && r.status !== 'manual') || [];

  return (
    <div className="bg-gradient-to-br from-blue-950/60 to-indigo-950/40 border border-blue-500/40 rounded-2xl overflow-hidden shadow-lg shadow-blue-900/20">
      <div className="flex gap-4 p-4">
        <div className="w-24 h-24 rounded-xl bg-gray-800 overflow-hidden flex-shrink-0 relative">
          <img src={imageUrl(product)} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
          <div className="absolute inset-0 flex items-center justify-center text-gray-700"><ImageIcon size={24} /></div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">{CAT_LABELS[product.category]}</span>
          </div>
          <h3 className="text-sm font-bold text-white mb-1 truncate">{product.title}</h3>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-emerald-400 font-bold">{fmtPrice(product.price)}</span>
            <span className="text-gray-500">•</span>
            <span className="text-gray-400">{product.city}</span>
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {Object.entries(product.attributes || {}).slice(0, 4).map(([k, v]) => (
              <span key={k} className="text-[10px] bg-gray-800/60 text-gray-400 px-1.5 py-0.5 rounded">{v}</span>
            ))}
          </div>
        </div>
        <div className="text-left flex-shrink-0">
          <div className="text-xs font-mono text-blue-300 font-bold">{countdown.text}</div>
          <div className="w-16 h-1 bg-gray-700 rounded-full mt-1 overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-1000 ${countdown.pct > 80 ? 'bg-red-500' : countdown.pct > 50 ? 'bg-yellow-500' : 'bg-blue-500'}`} style={{ width: `${countdown.pct}%` }} />
          </div>
        </div>
      </div>

      {/* Step indicator */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 text-[10px]">
          {[0, 1, 2].map(i => (
            <div key={i} className={`flex items-center gap-1 ${i < step ? 'text-emerald-400' : i === step && step > 0 ? 'text-blue-400 animate-pulse' : 'text-gray-600'}`}>
              <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${i < step ? 'bg-emerald-600 text-white' : i === step && step > 0 ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-500'}`}>
                {i < step ? '✓' : i + 1}
              </div>
              <span>{i === 0 ? 'اتصال' : i === 1 ? 'پرکردن' : 'تکمیل'}</span>
              {i < 2 && <div className={`w-4 h-0.5 ${i < step ? 'bg-emerald-600' : 'bg-gray-700'}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* Fill results */}
      {fillResults && (
        <div className="px-4 pb-2">
          <div className="bg-gray-900/60 rounded-lg p-2.5 space-y-1">
            {filledFields.map((r, i) => (
              <div key={`f${i}`} className="flex items-center gap-1.5 text-[10px] text-emerald-400">
                <CheckCircle size={10} />
                <span>{r.field}: {r.status === 'already-set' ? 'از قبل موجود' : r.status === 'auto-filled-match' ? 'خودکار' : 'پر شد'}</span>
              </div>
            ))}
            {failedFields.map((r, i) => (
              <div key={`e${i}`} className="flex items-center gap-1.5 text-[10px] text-amber-400">
                <MapPin size={10} />
                <span>{r.field}: نیاز به ورود دستی</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="px-4 pb-4 flex gap-2">
        {step === 0 && (
          <button onClick={doOpen} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm text-white font-medium transition-colors">
            <Globe size={16} />
            شروع ثبت آگهی
          </button>
        )}
        {step === 1 && (
          <>
            <div className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600/30 rounded-xl text-sm text-blue-300">
              <Loader2 size={16} className="animate-spin" />
              در حال اتصال...
            </div>
            <button onClick={doCancel} className="px-4 py-2.5 bg-red-600/50 hover:bg-red-600 rounded-xl text-sm text-red-200 transition-colors">
              ✕ لغو
            </button>
          </>
        )}
        {step === 2 && (
          <>
            <div className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600/30 rounded-xl text-sm text-blue-300">
              <Loader2 size={16} className="animate-spin" />
              در حال پر کردن فرم...
            </div>
            <button onClick={doCancel} className="px-4 py-2.5 bg-red-600/50 hover:bg-red-600 rounded-xl text-sm text-red-200 transition-colors">
              ✕ لغو
            </button>
          </>
        )}
        {step === 3 && (
          <>
            <button onClick={doComplete} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 rounded-xl text-sm text-white font-medium transition-colors">
              <CheckCircle size={16} />
              ✅ ثبت تأیید شد
            </button>
            <button onClick={() => { setStep(0); setFillResults(null); }} className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-xl text-sm text-gray-300 transition-colors">
              ↺ دوباره
            </button>
          </>
        )}
        <button onClick={() => { if (confirm('آزاد کردن محصول؟')) onAction('unlock', product.id); }} className="px-3 py-2.5 bg-gray-800 hover:bg-gray-700 rounded-xl text-xs text-gray-400 transition-colors" title="آزاد کردن">
          <Unlock size={14} />
        </button>
      </div>
    </div>
  );
}

/* --- Available Product Card --- */
function AvailableCard({ product, onLock }) {
  const [loading, setLoading] = useState(false);

  return (
    <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl overflow-hidden hover:border-gray-500/50 hover:bg-gray-800/70 transition-all duration-200 group">
      <div className="relative h-32 bg-gray-800 overflow-hidden">
        <img src={imageUrl(product)} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onError={(e) => { e.target.style.display = 'none'; }} />
        <div className="absolute inset-0 flex items-center justify-center text-gray-700"><ImageIcon size={32} /></div>
        <div className="absolute top-2 right-2">
          <span className="text-[10px] bg-gray-900/80 backdrop-blur-sm text-gray-300 px-2 py-0.5 rounded-full">{CAT_LABELS[product.category]}</span>
        </div>
        <div className="absolute bottom-2 left-2">
          <span className="text-sm font-bold text-emerald-400 bg-gray-900/80 backdrop-blur-sm px-2 py-0.5 rounded-lg">{fmtPrice(product.price)}</span>
        </div>
      </div>
      <div className="p-3">
        <h3 className="text-sm font-bold text-white mb-1 truncate">{product.title}</h3>
        <p className="text-[11px] text-gray-400 mb-2 line-clamp-1">{product.description}</p>
        <div className="flex items-center gap-2 text-[10px] text-gray-500 mb-3">
          <span className="flex items-center gap-1"><MapPin size={10} />{product.city}</span>
        </div>
        <div className="flex flex-wrap gap-1 mb-3">
          {Object.entries(product.attributes || {}).slice(0, 3).map(([k, v]) => (
            <span key={k} className="text-[10px] bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded">{v}</span>
          ))}
        </div>
        <button onClick={async () => { setLoading(true); await onLock(product.id); setLoading(false); }} disabled={loading}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-xs text-white font-medium transition-colors">
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />}
          🔒 قفل کردن
        </button>
      </div>
    </div>
  );
}

/* --- Main Dashboard --- */
export default function OperatorDashboard({ token, user }) {
  const [board, setBoard] = useState({ available: [], locked: [], posted: [] });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const myLocked = board.locked.filter(p => p.locked_by === user.id);
  const otherLocked = board.locked.filter(p => p.locked_by !== user.id);

  const loadBoard = useCallback(async () => {
    try { const r = await fetch('/api/products/board', { headers: h }); if (r.ok) setBoard(await r.json()); } catch {}
    setLoading(false);
  }, [token]);

  useEffect(() => { loadBoard(); const iv = setInterval(loadBoard, 5000); return () => clearInterval(iv); }, [loadBoard]);

  const handleLock = async (id) => {
    try {
      const r = await fetch(`/api/products/${id}/lock`, { method: 'POST', headers: h });
      const d = await r.json();
      if (r.ok) { addToast('✅ محصول قفل شد!', 'success'); loadBoard(); }
      else addToast(d.error || 'خطا', 'error');
    } catch { addToast('خطا در ارتباط با سرور', 'error'); }
  };

  const handleAction = (action) => {
    if (action === 'refresh') loadBoard();
  };

  const filtered = board.available.filter(p => {
    if (search) { const q = search.toLowerCase(); return (p.title || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q); }
    return true;
  });

  return (
    <div dir="rtl" className="max-w-6xl mx-auto space-y-5">
      <BrowserBar token={token} />

      {myLocked.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <h2 className="text-sm font-bold text-blue-400">📋 کار جاری ({myLocked.length})</h2>
          </div>
          {myLocked.map(p => <ActiveCard key={p.id} product={p} onAction={handleAction} token={token} />)}
        </div>
      )}

      {!loading && myLocked.length === 0 && (
        <div className="text-center py-6 bg-gray-900/30 rounded-xl border border-gray-700/30">
          <div className="text-3xl mb-2">📦</div>
          <p className="text-sm text-gray-400">محصولی قفل نشده</p>
          <p className="text-xs text-gray-600 mt-1">از لیست پایین یک محصول انتخاب کنید</p>
        </div>
      )}

      <div>
        <h2 className="text-sm font-bold text-gray-300 mb-3">📦 محصولات آماده ({filtered.length})</h2>
        <input type="text" placeholder="🔍 جستجو..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-3" />
        {loading ? (
          <div className="text-center text-gray-500 py-12">⏳</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 bg-gray-900/30 rounded-xl border border-gray-700/30">
            <div className="text-3xl mb-2">🔍</div>
            <p className="text-sm text-gray-400">{search ? 'پیدا نشد' : 'همه آگهی شده'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(p => <AvailableCard key={p.id} product={p} onLock={handleLock} />)}
          </div>
        )}
      </div>

      {otherLocked.length > 0 && (
        <div className="opacity-50">
          <h2 className="text-xs font-bold text-gray-500 mb-2">🔒 قفل‌شده توسط سایرین</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {otherLocked.map(p => (
              <div key={p.id} className="bg-gray-800/30 border border-gray-700/30 rounded-xl p-3 opacity-60">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] text-gray-600">{CAT_LABELS[p.category]}</span>
                  <span className="text-[10px] text-gray-600">🔒 {p.locked_by_name || p.locked_by}</span>
                </div>
                <h3 className="text-xs font-bold text-gray-300 truncate">{p.title}</h3>
              </div>
            ))}
          </div>
        </div>
      )}

      {board.posted.length > 0 && (
        <div className="text-center text-[10px] text-gray-600 py-2">✅ {board.posted.length} آگهی ثبت شده</div>
      )}
    </div>
  );
}
