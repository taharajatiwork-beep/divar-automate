// ─── Popup Script v3 — Simple & Clean ────────────────────────────────
// Shows user info + link to web panel. Product selection is in the web panel.
// Extension only fills forms on divar.ir/new.

const content = document.getElementById('content');
function sendMessage(action, data = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action, ...data }, (resolve));
  });
}
function render(html) { content.innerHTML = html; }

const ROLE_LABELS = { operator: 'اپراتور', supervisor: 'سرپرست', manager: 'مدیر' };
const ROLE_COLORS = { operator: '#3b82f6', supervisor: '#f59e0b', manager: '#8b5cf6' };
const PANEL_URL = 'http://localhost:5174';

function showLogin() {
  const tokens = [
    { label: 'علی (اپراتور)', token: 'tok-ali-1234' },
    { label: 'سارا (اپراتور)', token: 'tok-sara-5678' },
    { label: 'رضا (سرپرست)', token: 'tok-reza-abcd' },
    { label: 'مدیر سیستم', token: 'tok-admin-xyz' },
  ];
  render(`
    <div class="section">
      <div class="label">ورود به سیستم</div>
      <div style="margin-top:8px;">
        ${tokens.map(t => `
          <button class="btn btn-secondary login-btn" data-token="${t.token}" style="margin-top:6px; text-align:right;">
            ${t.label}
          </button>
        `).join('')}
      </div>
      <div style="margin-top:12px; font-size:11px; color:#64748b; text-align:center;">یا توکن سفارشی:</div>
      <div style="display:flex; gap:6px; margin-top:6px;">
        <input id="custom-token" type="text" placeholder="tok-..." style="flex:1; background:#1e293b; border:1px solid #334155; border-radius:6px; padding:6px 10px; color:#e2e8f0; font-size:12px; font-family:inherit;"/>
        <button class="btn btn-primary" id="btn-custom-login" style="margin:0; padding:6px 12px;">ورود</button>
      </div>
    </div>
  `);
  document.querySelectorAll('.login-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const res = await sendMessage('login', { token: btn.dataset.token });
      if (res.success && res.user) await showMain(res.user);
      else render(`<div class="section"><div class="error">${res.error||'خطا'}</div><button class="btn btn-secondary" onclick="location.reload()">تلاش مجدد</button></div>`);
    });
  });
  document.getElementById('btn-custom-login')?.addEventListener('click', async () => {
    const token = document.getElementById('custom-token')?.value?.trim();
    if (!token) return;
    const res = await sendMessage('login', { token });
    if (res.success && res.user) await showMain(res.user);
    else render(`<div class="section"><div class="error">${res.error||'توکن نامعتبر'}</div><button class="btn btn-secondary" onclick="location.reload()">تلاش مجدد</button></div>`);
  });
}

function showMain(user) {
  const roleColor = ROLE_COLORS[user.role] || '#6b7280';
  const roleLabel = ROLE_LABELS[user.role] || user.role;
  render(`
    <div class="section" style="display:flex; justify-content:space-between; align-items:center;">
      <div>
        <div class="value" style="font-size:14px;">${user.name}</div>
        <span style="font-size:11px; color:${roleColor};">${roleLabel}</span>
      </div>
      <button class="btn btn-secondary" id="btn-logout" style="width:auto; padding:4px 10px; font-size:11px; margin:0;">خروج</button>
    </div>
    <div class="section">
      <div class="label">نحوه کار</div>
      <div style="font-size:12px; color:#94a3b8; line-height:2;">
        <div>۱. از <a href="${PANEL_URL}" target="_blank" style="color:#3b82f6;">پنل آگهی‌گذاری</a> محصول رو انتخاب کن</div>
        <div>۲. «🌐 باز کردن دیوار» رو بزن</div>
        <div>۳. اکستنشن فرم رو پر می‌کنه</div>
        <div>۴. تو دکمه ثبت رو بزن ✋</div>
      </div>
      <a href="${PANEL_URL}" target="_blank" class="btn btn-primary" style="margin-top:12px; display:block; text-align:center; text-decoration:none;">
        🚀 باز کردن پنل آگهی‌گذاری
      </a>
    </div>
    <div class="warning-banner">⛔ ثبت آگهی هرگز خودکار نیست — فقط فرم پر می‌شه</div>
    <div id="status" class="section">
      <div class="label">وضعیت پر کردن فرم</div>
      <div style="background:#1a1a2e;border-radius:8px;padding:12px;font-size:13px;direction:rtl;">
        <div style="color:#4ade80;">✅ خودکار: عنوان، توضیحات، عکس</div>
        <div style="color:#4ade80;">✅ خودکار: سال، رنگ، سوخت، گیربکس، بدنه</div>
        <div style="color:#fbbf24;">⏳ دستی: مکان آگهی</div>
        <div style="color:#fbbf24;">⏳ دستی: راه‌های تماس</div>
        <div style="color:#ef4444;margin-top:8px;">⚠️ هیچ‌وقت «ثبت اطلاعات» را خودکار نزنید!</div>
      </div>
    </div>
    <div class="section">
      <button id="bugReport" style="background:#e74c3c;color:white;padding:8px 16px;border:none;border-radius:6px;cursor:pointer;width:100%;font-family:inherit;font-size:13px;font-weight:600;">
        🐛 گزارش خرابی
      </button>
    </div>
    <div class="section" style="text-align:center;">
      <div style="font-size:11px; color:#64748b;">
        اکستنشن فعال ✅<br/>
        وقتی <span style="color:#3b82f6;">divar.ir/new</span> باز کنی، فرم رو پر می‌کنه.
      </div>
    </div>
  `);
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await sendMessage('logout');
    location.reload();
  });

  // Bug Report handler
  document.getElementById('bugReport')?.addEventListener('click', async () => {
    const btn = document.getElementById('bugReport');
    try {
      // Get current tab URL
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // Inject a script to capture DOM state summary
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({
          url: location.href,
          title: document.title,
          selectFields: [...document.querySelectorAll('[id*="___Input"]')].map(el => ({
            id: el.id,
            value: el.value || el.textContent?.trim()
          })),
          visibleButtons: [...document.querySelectorAll('button')].filter(b => b.offsetParent).map(b => b.textContent?.trim()).slice(0, 10),
          modals: [...document.querySelectorAll('.kt-modal')].filter(m => m.offsetParent).length,
          timestamp: new Date().toISOString()
        })
      });

      const domState = results[0]?.result || {};

      // Send to backend
      const token = await new Promise((resolve) => {
        chrome.storage.local.get('authToken', (d) => resolve(d.authToken));
      });
      await fetch('http://localhost:3000/api/bug-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (token || '')
        },
        body: JSON.stringify({
          operator: user.id || 'unknown',
          domState,
          userAgent: navigator.userAgent
        })
      });
      // Show confirmation
      btn.textContent = '✅ گزارش ارسال شد';
      btn.style.background = '#27ae60';
      setTimeout(() => {
        btn.textContent = '🐛 گزارش خرابی';
        btn.style.background = '#e74c3c';
      }, 2000);
    } catch (e) {
      btn.textContent = '❌ خطا در ارسال';
      btn.style.background = '#e74c3c';
      setTimeout(() => {
        btn.textContent = '🐛 گزارش خرابی';
      }, 2000);
    }
  });
}

// ── Init ────────────────────────────────────────────────────────────
async function init() {
  const res = await sendMessage('getStatus');
  if (!res.success) {
    render('<div class="section"><div class="error">خطا در اتصال</div></div>');
    return;
  }
  const { user } = res;
  if (!user) { showLogin(); return; }
  showMain(user);
}
init();
