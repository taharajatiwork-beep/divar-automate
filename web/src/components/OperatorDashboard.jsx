import { useState, useEffect } from 'react';

const CATEGORY_ICONS = { 'mobile-phones': '📱', 'laptops': '💻', 'accessories': '🎧' };
const CATEGORY_LABELS = { 'mobile-phones': 'موبایل', 'laptops': 'لپ‌تاپ', 'accessories': 'لوازم جانبی' };

function formatPrice(p) {
  if (!p) return '—';
  return new Intl.NumberFormat('fa-IR').format(p) + ' تومان';
}

function timeSince(iso) {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'همین الان';
  if (mins < 60) return `${mins} دقیقه پیش`;
  const hours = Math.floor(mins / 60);
  return `${hours} ساعت پیش`;
}

function ProductCard({ product, onAction, lockLoading }) {
  const isLockedByMe = product.locked_by && product._myId === product.locked_by;
  const isLockedByOther = product.locked_by && product._myId !== product.locked_by;
  const isPosted = product.status === 'posted';

  return (
    <div className={`rounded-xl border p-4 transition-all ${
      isPosted ? 'bg-green-950/30 border-green-800/40 opacity-60' :
      isLockedByOther ? 'bg-yellow-950/30 border-yellow-700/40' :
      isLockedByMe ? 'bg-blue-950/30 border-blue-600/50 ring-1 ring-blue-500/30' :
      'bg-gray-800/50 border-gray-700/50 hover:border-gray-500/50'
    }`}>
      <div className="flex items-start justify-between mb-2">
        <span className="text-lg">{CATEGORY_ICONS[product.category] || '📦'}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          isPosted ? 'bg-green-900 text-green-300' :
          isLockedByOther ? 'bg-yellow-900 text-yellow-300' :
          isLockedByMe ? 'bg-blue-900 text-blue-300' :
          'bg-gray-700 text-gray-300'
        }`}>
          {isPosted ? '✓ ثبت شده' : isLockedByOther ? `🔒 ${product.locked_by_name || product.locked_by}` : isLockedByMe ? '🔓 قفل شما' : 'آماده'}
        </span>
      </div>

      <h3 className="text-sm font-bold text-white mb-1 leading-relaxed">{product.title}</h3>
      <p className="text-xs text-gray-400 mb-2 line-clamp-2">{product.description}</p>

      <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
        <span>{formatPrice(product.price)}</span>
        <span>•</span>
        <span>{product.city}</span>
        {product.images?.length > 0 && <><span>•</span><span>📷 {product.images.length}</span></>}
      </div>

      {/* Attributes */}
      {product.attributes && Object.keys(product.attributes).length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {Object.entries(product.attributes).slice(0, 4).map(([k, v]) => (
            <span key={k} className="text-[10px] bg-gray-700/60 text-gray-400 px-1.5 py-0.5 rounded">
              {v}
            </span>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {!product.locked_by && !isPosted && (
          <button
            onClick={() => onAction('lock', product.id)}
            disabled={lockLoading === product.id}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs py-2 rounded-lg transition-colors disabled:opacity-50 font-bold"
          >
            {lockLoading === product.id ? '⏳ در حال قفل...' : '🎯 پست آگهی'}
          </button>
        )}
        {isLockedByMe && (
          <>
            <button
              onClick={() => onAction('open', product.id)}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs py-2 rounded-lg transition-colors font-bold"
            >
              🌐 باز کردن دیوار
            </button>
            <button
              onClick={() => onAction('complete', product.id)}
              className="bg-green-700 hover:bg-green-600 text-white text-xs px-3 py-2 rounded-lg transition-colors"
              title="ثبت شد"
            >
              ✓
            </button>
            <button
              onClick={() => onAction('unlock', product.id)}
              className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-3 py-2 rounded-lg transition-colors"
              title="لغو قفل"
            >
              ✕
            </button>
          </>
        )}
        {isLockedByOther && (
          <div className="flex-1 text-center text-xs text-yellow-400/70 py-2">
            قفل شده تا {timeSince(product.locked_at)}
          </div>
        )}
        {isPosted && (
          <div className="flex-1 text-center text-xs text-green-400/70 py-2">
            ثبت شده توسط {product.posted_by}
          </div>
        )}
      </div>
    </div>
  );
}

export default function OperatorDashboard({ token, user }) {
  const [board, setBoard] = useState({ available: [], locked: [], posted: [] });
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [lockLoading, setLockLoading] = useState(null);
  const [msg, setMsg] = useState(null);

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  async function loadBoard() {
    try {
      const res = await fetch('/api/products/board', { headers });
      const data = await res.json();
      data.available = (data.available || []).map(p => ({ ...p, _myId: user.id }));
      data.locked = (data.locked || []).map(p => ({ ...p, _myId: user.id }));
      data.posted = (data.posted || []).map(p => ({ ...p, _myId: user.id }));
      setBoard(data);
    } catch { setMsg({ type: 'error', text: 'خطا در بارگذاری تابلو.' }); }
    setLoading(false);
  }

  useEffect(() => { loadBoard(); }, []);

  async function handleAction(action, productId) {
    setMsg(null);
    if (action === 'lock') {
      setLockLoading(productId);
      try {
        const res = await fetch(`/api/products/${productId}/lock`, { method: 'POST', headers });
        const data = await res.json();
        if (!res.ok) { setMsg({ type: 'error', text: data.error }); setLockLoading(null); return; }
        setMsg({ type: 'success', text: 'محصول قفل شد! دکمه «باز کردن دیوار» رو بزن.' });
        // Auto-open Divar tab via extension messaging
        try { chrome.runtime.sendMessage({ action: 'openDivar', taskId: data.task?.id, payload: data.task?.prefill_payload || data.product }); } catch {}
      } catch { setMsg({ type: 'error', text: 'خطا در قفل‌گذاری.' }); }
      setLockLoading(null);
      loadBoard();
    } else if (action === 'unlock') {
      if (!confirm('مطمئنی می‌خوای قفل رو باز کنی؟')) return;
      try {
        await fetch(`/api/products/${productId}/unlock`, { method: 'POST', headers });
        setMsg({ type: 'success', text: 'قفل باز شد.' });
      } catch { setMsg({ type: 'error', text: 'خطا در باز کردن قفل.' }); }
      loadBoard();
    } else if (action === 'complete') {
      if (!confirm('آگهی رو ثبت کردی؟ مطمئنی؟')) return;
      try {
        await fetch(`/api/products/${productId}/complete`, { method: 'POST', headers });
        setMsg({ type: 'success', text: '✓ آگهی با موفقیت ثبت شد!' });
      } catch { setMsg({ type: 'error', text: 'خطا.' }); }
      loadBoard();
    } else if (action === 'open') {
      // Fetch prefill data from API, then tell extension to open Divar
      try {
        const res = await fetch(`/api/products/${productId}/prefill`, { headers });
        const data = await res.json();
        if (!res.ok) { setMsg({ type: 'error', text: data.error }); return; }
        try {
          chrome.runtime.sendMessage({ action: 'openDivar', prefill: data.prefill });
          setMsg({ type: 'success', text: '🌐 دیوار باز شد! اکستنشن فرم رو پر می‌کنه.' });
        } catch {
          setMsg({ type: 'error', text: 'اکستنشن نصب نیست. لطفاً اکستنشن رو نصب کن.' });
        }
      } catch { setMsg({ type: 'error', text: 'خطا در دریافت اطلاعات.' }); }
    }
  }

  // Filter products
  const allProducts = [...board.available, ...board.locked, ...board.posted];
  const filtered = allProducts.filter(p => {
    if (category !== 'all' && p.category !== category) return false;
    if (search) {
      const q = search.toLowerCase();
      return (p.title || '').toLowerCase().includes(q) ||
             (p.description || '').toLowerCase().includes(q) ||
             (p.attributes?.brand || '').toLowerCase().includes(q) ||
             (p.attributes?.model || '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white mb-1">تابلوی محصولات</h1>
        <p className="text-sm text-gray-400">
          محصول مورد نظرت رو انتخاب کن، دیوار باز می‌شه و اکستنشن فرم رو پر می‌کنه.
        </p>
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${
          msg.type === 'error' ? 'bg-red-900/40 text-red-300 border border-red-700/50' : 'bg-green-900/40 text-green-300 border border-green-700/50'
        }`}>
          {msg.text}
        </div>
      )}

      {/* Stats bar */}
      <div className="flex gap-4 mb-4 text-xs">
        <span className="text-gray-400">🟢 آماده: <span className="text-white font-bold">{board.available.length}</span></span>
        <span className="text-gray-400">🔒 قفل‌شده: <span className="text-yellow-300 font-bold">{board.locked.length}</span></span>
        <span className="text-gray-400">✅ ثبت‌شده: <span className="text-green-300 font-bold">{board.posted.length}</span></span>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="🔍 جستجو در عنوان، برند، مدل..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
        >
          <option value="all">همه دسته‌ها</option>
          <option value="mobile-phones">📱 موبایل</option>
          <option value="laptops">💻 لپ‌تاپ</option>
          <option value="accessories">🎧 لوازم جانبی</option>
        </select>
      </div>

      {/* Product grid */}
      {loading ? (
        <div className="text-center text-gray-500 py-12">⏳ در حال بارگذاری...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-gray-500 py-12">محصولی پیدا نشد.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => (
            <ProductCard key={p.id} product={p} onAction={handleAction} lockLoading={lockLoading} />
          ))}
        </div>
      )}

      {/* Locked products section (my locks) */}
      {board.locked.filter(p => p.locked_by === user.id).length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-bold text-blue-400 mb-3">📦 محصولات قفل‌شده توسط شما</h2>
          <div className="bg-blue-950/20 border border-blue-800/30 rounded-xl p-4 text-sm text-blue-300">
            {board.locked.filter(p => p.locked_by === user.id).map(p => (
              <div key={p.id} className="flex items-center justify-between py-1">
                <span>{p.title}</span>
                <button
                  onClick={() => handleAction('open', p.id)}
                  className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded"
                >
                  🌐 باز کردن دیوار
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}