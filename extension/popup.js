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
