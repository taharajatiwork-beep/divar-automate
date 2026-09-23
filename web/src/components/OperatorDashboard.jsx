import { useState, useEffect } from 'react';
import BrowserPanel from './BrowserPanel.jsx';

const CAT_ICONS = { 'vehicles': '\u{1F697}', 'mobile-phones': '\u{1F4F1}', 'laptops': '\u{1F4BB}', 'accessories': '\u{1F3A7}' };
const CAT_LABELS = { 'vehicles': '\u062E\u0648\u062F\u0631\u0648', 'mobile-phones': '\u0645\u0648\u0628\u0627\u06CC\u0644', 'laptops': '\u0644\u067E\u200C\u062A\u0627\u0628', 'accessories': '\u0644\u0648\u0627\u0632\u0645 \u062C\u0627\u0646\u0628\u06CC' };
const LOCK_MS = 30 * 60 * 1000;

function fmtPrice(p) {
  return p ? new Intl.NumberFormat('fa-IR').format(p) + ' \u062A\u0648\u0645\u0627\u0646' : '\u2014';
}

function lockCountdown(lockedAt) {
  if (!lockedAt) return '';
  const elapsed = Date.now() - new Date(lockedAt).getTime();
  const remaining = Math.max(0, LOCK_MS - elapsed);
  if (remaining <= 0) return '\u23F0 \u0645\u0646\u0642\u0636\u06CC \u0634\u062F';
  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s} \u062B\u0627\u0646\u06CC\u0647`;
}

function lockProgress(lockedAt) {
  if (!lockedAt) return 0;
  return Math.min(100, ((Date.now() - new Date(lockedAt).getTime()) / LOCK_MS) * 100);
}

function Steps({ step }) {
  const labels = ['\u0627\u0646\u062A\u062E\u0627\u0628 \u0645\u062D\u0635\u0648\u0644', '\u0628\u0627\u0632 \u06A9\u0631\u062F\u0646 \u062F\u06CC\u0648\u0627\u0631', '\u062B\u0628\u062A \u0646\u0647\u0627\u06CC\u06CC'];
  return (
    <div className="flex items-center gap-1 mb-6">
      {labels.map((t, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
            i < step ? 'bg-green-600 text-white' :
            i === step ? 'bg-blue-600 text-white ring-2 ring-blue-400/50 animate-pulse' :
            'bg-gray-700 text-gray-500'
          }`}>{i + 1}</div>
          <span className={`text-xs hidden sm:inline transition-colors ${
            i === step ? 'text-white font-bold' : 'text-gray-500'
          }`}>{t}</span>
          {i < labels.length - 1 && <div className={`w-6 h-0.5 mx-1 ${i < step ? 'bg-green-600' : 'bg-gray-700'}`} />}
        </div>
      ))}
    </div>
  );
}

function ProductCard({ product, onAction, view }) {
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState('');
  const [progress, setProgress] = useState(0);
  const isMine = view === 'mine';
  const isOther = view === 'other';

  useEffect(() => {
    if (!isMine || !product.locked_at) return;
    const update = () => {
      setCountdown(lockCountdown(product.locked_at));
      setProgress(lockProgress(product.locked_at));
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [isMine, product.locked_at]);

  async function doAction(action) {
    setLoading(true);
    await onAction(action, product.id);
    setLoading(false);
  }

  const attrs = product.attributes || {};
  const attrEntries = Object.entries(attrs).filter(([, v]) => v);

  return (
    <div className={`rounded-xl border p-4 transition-all duration-200 ${
      isMine ? 'bg-gradient-to-br from-blue-950/60 to-indigo-950/40 border-blue-500/50 shadow-lg shadow-blue-900/20' :
      isOther ? 'bg-gray-800/30 border-gray-700/30 opacity-50' :
      'bg-gray-800/50 border-gray-700/50 hover:border-gray-500/50 hover:bg-gray-800/70'
    }`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{CAT_ICONS[product.category] || '\u{1F4E6}'}</span>
          <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
            {CAT_LABELS[product.category] || product.category}
          </span>
        </div>
        {isMine && <span className="text-xs text-blue-300 font-mono font-bold">{countdown}</span>}
        {isOther && <span className="text-[10px] text-gray-500">{'\u{1F512}'} {product.locked_by_name || product.locked_by}</span>}
      </div>
      {isMine && (
        <div className="w-full h-1 bg-gray-700 rounded-full mb-3 overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-1000 ${progress > 80 ? 'bg-red-500' : progress > 50 ? 'bg-yellow-500' : 'bg-blue-500'}`} style={{ width: `${progress}%` }} />
        </div>
      )}
      <h3 className="text-sm font-bold text-white mb-1 leading-relaxed line-clamp-1">{product.title}</h3>
      <p className="text-xs text-gray-400 mb-2 line-clamp-2">{product.description}</p>
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
        <span className="text-green-400 font-bold">{fmtPrice(product.price)}</span>
        <span>{'\u2022'}</span>
        <span>{product.city}</span>
        {product.images?.length > 0 && <><span>{'\u2022'}</span><span>{'\u{1F4F7}'} {product.images.length}</span></>}
      </div>
      {attrEntries.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {attrEntries.slice(0, 5).map(([k, v]) => (
            <span key={k} className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{v}</span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {view === 'available' && (
          <button onClick={() => doAction('lock')} disabled={loading} className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-xs text-white font-medium transition-colors">
            {loading ? '...' : '\u{1F512} \u0642\u0641\u0644 \u06A9\u0631\u062F\u0646'}
          </button>
        )}
        {isMine && (
          <>
            <button onClick={() => doAction('open')} disabled={loading} className="flex-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-xs text-white font-medium transition-colors">
              {loading ? '...' : '\u{1F310} \u0628\u0627\u0632 \u06A9\u0631\u062F\u0646 \u062F\u06CC\u0648\u0627\u0631'}
            </button>
            <button onClick={() => doAction('complete')} disabled={loading} className="flex-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-xs text-white font-medium transition-colors">
              {loading ? '...' : '\u2705 \u062B\u0628\u062A \u0634\u062F'}
            </button>
            <button onClick={() => doAction('unlock')} disabled={loading} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-xs text-gray-400 transition-colors">
              {'\u21A9'} \u0622\u0632\u0627\u062F
            </button>
          </>
        )}
        {isOther && <span className="text-[10px] text-gray-600">\u063A\u06CC\u0631\u0642\u0627\u0628\u0644 \u0639\u0645\u0644\u06CC\u0627\u062A</span>}
      </div>
    </div>
  );
}

export default function OperatorDashboard({ token, user }) {
  const [board, setBoard] = useState({ available: [], locked: [], posted: [] });
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const myLocked = board.locked.filter(p => p.locked_by === user.id);
  const otherLocked = board.locked.filter(p => p.locked_by !== user.id);

  async function loadBoard() {
    try { const r = await fetch('/api/products/board', { headers: h }); if (r.ok) setBoard(await r.json()); } catch {}
    setLoading(false);
  }

  useEffect(() => { loadBoard(); const iv = setInterval(loadBoard, 5000); return () => clearInterval(iv); }, []);

  async function doAction(action, id) {
    setMsg(null);
    if (action === 'lock') {
      try { const r = await fetch(`/api/products/${id}/lock`, { method: 'POST', headers: h }); const d = await r.json(); if (!r.ok) { setMsg({ type: 'error', text: d.error }); return; } setMsg({ type: 'success', text: '\u2705 \u0645\u062D\u0635\u0648\u0644 \u0642\u0641\u0644 \u0634\u062F! \u062D\u0627\u0644\u0627 \u00AB\u0628\u0627\u0632 \u06A9\u0631\u062F\u0646 \u062F\u06CC\u0648\u0627\u0631\u00BB \u0631\u0648 \u0628\u0632\u0646.' }); loadBoard(); } catch { setMsg({ type: 'error', text: '\u062E\u0637\u0627.' }); }
    }
    if (action === 'unlock') {
      if (!confirm('\u0645\u0637\u0645\u0626\u0646\u06CC\u061F')) return;
      try { await fetch(`/api/products/${id}/unlock`, { method: 'POST', headers: h }); setMsg({ type: 'success', text: '\u0642\u0641\u0644 \u0628\u0627\u0632 \u0634\u062F.' }); } catch {}
      loadBoard();
    }
    if (action === 'complete') {
      if (!confirm('\u0622\u06AF\u0647\u06CC \u062B\u0628\u062A \u0634\u062F\u061F')) return;
      try { const r = await fetch(`/api/products/${id}/complete`, { method: 'POST', headers: h }); const d = await r.json(); if (!r.ok) { setMsg({ type: 'error', text: d.error }); return; } setMsg({ type: 'success', text: '\u{1F389} \u062B\u0628\u062A \u0634\u062F!' }); loadBoard(); } catch { setMsg({ type: 'error', text: '\u062E\u0637\u0627.' }); }
    }
    if (action === 'open') {
      try {
        setMsg({ type: 'info', text: '🔄 در حال اتصال به Chrome...' });
        // Step 1: Connect to Chrome
        const launchRes = await fetch('/api/browser/launch', { method: 'POST', headers: h });
        const launchData = await launchRes.json();
        if (!launchRes.ok) { setMsg({ type: 'error', text: launchData.error || 'خطا در اتصال Chrome' }); return; }
        // Step 2: Navigate to divar.ir/new
        await fetch('/api/browser/navigate', { method: 'POST', headers: h, body: JSON.stringify({ url: 'https://divar.ir/new' }) });
        // Step 3: Auto-fill the form
        setMsg({ type: 'info', text: '⏳ در حال پر کردن فرم...' });
        const fillRes = await fetch('/api/browser/fill', { method: 'POST', headers: h, body: JSON.stringify({ productId: id }) });
        const fillData = await fillRes.json();
        if (!fillRes.ok) { setMsg({ type: 'error', text: fillData.error || 'خطا در پر کردن فرم' }); return; }
        setMsg({ type: 'success', text: `✅ فرم پر شد! ${fillData.results?.filter(r => r.status === 'filled').length || 0} فیلد خودکار. مکان و تماس رو دستی تکمیل کنید.` });
        loadBoard();
      } catch (e) { setMsg({ type: 'error', text: 'خطا: ' + e.message }); }
    }
  }

  const filtered = board.available.filter(p => {
    if (category !== 'all' && p.category !== category) return false;
    if (search) { const q = search.toLowerCase(); return (p.title || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q) || (p.attributes?.brand || '').toLowerCase().includes(q) || (p.attributes?.model || '').toLowerCase().includes(q); }
    return true;
  });

  return (
    <div dir="rtl" className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white mb-1">{'\u{1F680}'} \u067E\u0646\u0644 \u0622\u06AF\u0647\u06CC\u200C\u06AF\u0630\u0627\u0631\u06CC</h1>
        <p className="text-sm text-gray-400">\u0645\u062D\u0635\u0648\u0644 \u0631\u0648 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646 {'\u2192'} \u0642\u0641\u0644 \u06A9\u0646 {'\u2192'} \u0641\u0631\u0645 \u0631\u0648 \u067E\u0631 \u06A9\u0646 {'\u2192'} \u062B\u0628\u062A \u06A9\u0646.</p>
      </div>
      <Steps step={myLocked.length > 0 ? 1 : 0} />
      {msg && <div className={`px-4 py-3 rounded-lg text-sm ${msg.type === 'error' ? 'bg-red-900/40 text-red-300 border border-red-700/50' : msg.type === 'info' ? 'bg-blue-900/40 text-blue-300 border border-blue-700/50' : 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/50'}`}>{msg.text}</div>}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1"><BrowserPanel token={token} /></div>
        <div className="lg:col-span-2">
          {myLocked.length > 0 ? (
            <div>
              <div className="flex items-center gap-2 mb-3"><div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /><h2 className="text-sm font-bold text-blue-400">{'\u06A9\u0627\u0631 \u062C\u0627\u0631\u06CC'} ({myLocked.length})</h2></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{myLocked.map(p => <ProductCard key={p.id} product={p} onAction={doAction} view="mine" />)}</div>
            </div>
          ) : <div className="text-center text-gray-600 py-8 text-sm">{'\u0645\u062D\u0635\u0648\u0644\u06CC \u0642\u0641\u0644 \u0646\u0634\u062F\u0647 \u2014 \u0627\u0632 \u0644\u06CC\u0633\u062A \u067E\u0627\u06CC\u06CC\u0646 \u06CC\u06A9\u06CC \u0631\u0648 \u0642\u0641\u0644 \u06A9\u0646'}</div>}
        </div>
      </div>
      <div>
        <h2 className="text-sm font-bold text-gray-300 mb-2">{'\u{1F4E6}'} \u0645\u062D\u0635\u0648\u0644\u0627\u062A \u0622\u0645\u0627\u062F\u0647 ({filtered.length})</h2>
        <div className="flex gap-3 mb-4 flex-wrap">
          <input type="text" placeholder="{'\u{1F50D}'} \u062C\u0633\u062A\u062C\u0648..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[200px] bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
          <select value={category} onChange={e => setCategory(e.target.value)} className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white">
            <option value="all">{'\u0647\u0645\u0647'}</option>
            <option value="vehicles">{'\u{1F697}'} \u062E\u0648\u062F\u0631\u0648</option>
          </select>
        </div>
        {loading ? <div className="text-center text-gray-500 py-12">{'\u23F3'}</div> : filtered.length === 0 ? <div className="text-center text-gray-500 py-12">{search ? '\u067E\u06CC\u062F\u0627 \u0646\u0634\u062F' : '\u0647\u0645\u0647 \u0642\u0641\u0644 \u0634\u062F\u0646'}</div> : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{filtered.map(p => <ProductCard key={p.id} product={p} onAction={doAction} view="available" />)}</div>}
      </div>
      {otherLocked.length > 0 && <div className="opacity-50"><h2 className="text-xs font-bold text-gray-500 mb-2">{'\u{1F512}'} \u0642\u0641\u0644\u200C\u0634\u062F\u0647 \u062A\u0648\u0636\u0627\u06CC \u0633\u0627\u06CC\u0631\u06CC\u0646</h2><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{otherLocked.map(p => <ProductCard key={p.id} product={p} onAction={doAction} view="other" />)}</div></div>}
      {board.posted.length > 0 && <div className="opacity-30"><h2 className="text-xs font-bold text-gray-500 mb-2">{'\u2705'} \u062B\u0628\u062A\u200C\u0634\u062F\u0647 ({board.posted.length})</h2></div>}
    </div>
  );
}
