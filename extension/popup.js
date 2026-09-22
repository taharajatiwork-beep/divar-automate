// ─── Popup Script v2 ────────────────────────────────────────────────
// Auth flow + role-based UI + auto-open.

const content = document.getElementById('content');

function sendMessage(action, data = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action, ...data }, (response) => {
      resolve(response || { success: false, error: 'پاسخی دریافت نشد' });
    });
  });
}

function render(html) { content.innerHTML = html; }

function formatPrice(v) {
  if (typeof v !== 'number') return v || '—';
  return v.toLocaleString('fa-IR') + ' تومان';
}

const ROLE_LABELS = { operator: 'اپراتور', supervisor: 'سرپرست', manager: 'مدیر' };
const ROLE_COLORS = { operator: '#3b82f6', supervisor: '#f59e0b', manager: '#8b5cf6' };

// ── Login view ──────────────────────────────────────────────────────
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
      <div style="margin-top:12px; font-size:11px; color:#64748b; text-align:center;">
        یا توکن سفارشی وارد کنید:
      </div>
      <div style="display:flex; gap:6px; margin-top:6px;">
        <input id="custom-token" type="text" placeholder="tok-..." style="
          flex:1; background:#1e293b; border:1px solid #334155; border-radius:6px;
          padding:6px 10px; color:#e2e8f0; font-size:12px; font-family:inherit;
        "/>
        <button class="btn btn-primary" id="btn-custom-login" style="width:auto; padding:6px 14px; margin-top:0;">
          ورود
        </button>
      </div>
    </div>
  `);

  document.querySelectorAll('.login-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      render('<div class="section"><div class="empty">در حال ورود...</div></div>');
      const res = await sendMessage('login', { token: btn.dataset.token });
      if (res.success && res.user) {
        await showStatus();
      } else {
        render(`<div class="section"><div class="error">${res.error || 'خطا'}</div><button class="btn btn-secondary" onclick="location.reload()">تلاش مجدد</button></div>`);
      }
    });
  });

  document.getElementById('btn-custom-login')?.addEventListener('click', async () => {
    const token = document.getElementById('custom-token')?.value?.trim();
    if (!token) return;
    render('<div class="section"><div class="empty">در حال ورود...</div></div>');
    const res = await sendMessage('login', { token });
    if (res.success && res.user) {
      await showStatus();
    } else {
      render(`<div class="section"><div class="error">${res.error || 'توکن نامعتبر'}</div><button class="btn btn-secondary" onclick="location.reload()">تلاش مجدد</button></div>`);
    }
  });
}

// ── Status view ─────────────────────────────────────────────────────
async function showStatus() {
  const res = await sendMessage('getStatus');
  if (!res.success) {
    render(`
      <div class="section">
        <div class="error">⚠️ ${res.error || 'خطا در ارتباط با سرویس'}</div>
        <div style="margin-top:8px; font-size:11px; color:#64748b;">
          مطمئن شوید سرور در حال اجراست:<br/>
          <code style="color:#94a3b8;">npm start</code>
        </div>
        <button class="btn btn-secondary" onclick="location.reload()">تلاش مجدد</button>
      </div>
    `);
    return;
  }

  const { task, prefill, tabId, user } = res;

  // Not logged in
  if (!user) { showLogin(); return; }

  const roleColor = ROLE_COLORS[user.role] || '#6b7280';
  const roleLabel = ROLE_LABELS[user.role] || user.role;
  const isOperator = user.role === 'operator';

  if (!task) {
    render(`
      <div class="section" style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div class="value" style="font-size:14px;">${user.name}</div>
          <span style="font-size:11px; color:${roleColor};">${roleLabel}</span>
        </div>
        <button class="btn btn-secondary" id="btn-logout" style="width:auto; padding:4px 10px; font-size:11px; margin:0;">خروج</button>
      </div>
      <div class="section">
        <div class="label">وضعیت</div>
        <div class="value">
          <span class="status-dot status-active"></span>
          آماده دریافت وظیفه
        </div>
        ${isOperator ? `
          <button class="btn btn-primary" id="btn-claim" style="margin-top:12px;">
            🚀 دریافت وظیفه و بازکردن صفحه دیوار
          </button>
        ` : `
          <div style="margin-top:8px; font-size:12px; color:#94a3b8;">
            اپراتورها وظایف را از اینجا دریافت می‌کنند.<br/>
            شما می‌توانید آمار و لاگ را در پنل مدیریت مشاهده کنید.
          </div>
          <a href="http://localhost:5174" target="_blank" class="btn btn-secondary" style="margin-top:8px; display:block; text-align:center; text-decoration:none;">
            📊 بازکردن پنل مدیریت
          </a>
        `}
      </div>
      <div class="warning-banner">
        ⛔ ثبت آگهی هرگز خودکار نیست
      </div>
    `);
    document.getElementById('btn-claim')?.addEventListener('click', claimTask);
    document.getElementById('btn-logout')?.addEventListener('click', async () => {
      await sendMessage('logout');
      location.reload();
    });
    return;
  }

  // Has active task
  const fields = prefill?.fields || {};
  const edits = prefill?.fieldEdits || [];
  const images = prefill?.images || [];
  const errors = prefill?.validationErrors || [];
  const tabOpen = tabId !== null && tabId !== undefined;

  render(`
    <div class="section" style="display:flex; justify-content:space-between; align-items:center;">
      <div>
        <div class="value" style="font-size:14px;">${user.name}</div>
        <span style="font-size:11px; color:${roleColor};">${roleLabel}</span>
      </div>
      <button class="btn btn-secondary" id="btn-logout" style="width:auto; padding:4px 10px; font-size:11px; margin:0;">خروج</button>
    </div>

    <div class="section">
      <div class="label">وظیفه فعلی</div>
      <div class="task-info">
        <div class="task-row"><span class="k">شناسه</span><span class="v" style="font-family:monospace;">${task.id}</span></div>
        <div class="task-row"><span class="k">محصول</span><span class="v">${task.productId}</span></div>
        <div class="task-row"><span class="k">عنوان</span><span class="v">${fields.title || '—'}</span></div>
        <div class="task-row"><span class="k">قیمت</span><span class="v">${formatPrice(fields.price)}</span></div>
        <div class="task-row"><span class="k">تصاویر</span><span class="v">${images.length} تصویر</span></div>
        ${errors.length > 0 ? `<div class="task-row"><span class="k" style="color:#fca5a5;">خطاها</span><span class="v" style="color:#fca5a5;">${errors.length} مورد</span></div>` : ''}
      </div>
    </div>

    ${tabOpen ? `
      <div class="section" style="background:#065f4620; border-radius:8px; padding:10px 14px;">
        <div style="color:#86efac; font-size:12px;">✅ صفحه دیوار باز است</div>
      </div>
    ` : `
      <div class="section">
        <button class="btn btn-secondary" id="btn-open-divar">🌐 بازکردن صفحه ثبت آگهی</button>
      </div>
    `}

    ${edits.length > 0 ? `
      <div class="section">
        <div class="label">اصلاحات</div>
        <div class="edits-list">
          ${edits.map(e => `<div class="edit-item">${e.field}: <span class="edit-new">${e.newValue}</span></div>`).join('')}
        </div>
      </div>
    ` : ''}

    ${isOperator ? `
      <div class="section">
        <button class="btn btn-danger" id="btn-submit">✅ ثبت آگهی (تأیید انسانی)</button>
        <div class="warning-banner">⛔ فقط بعد از بررسی نهایی</div>
      </div>
    ` : ''}
  `);

  document.getElementById('btn-open-divar')?.addEventListener('click', async () => {
    await sendMessage('openDivar');
    await showStatus();
  });

  document.getElementById('btn-submit')?.addEventListener('click', async () => {
    if (!confirm('آیا ثبت آگهی در دیوار را تأیید می‌کنید؟')) return;
    const r = await sendMessage('submit', { taskId: task.id });
    if (r.success) {
      render(`<div class="section"><div class="value" style="color:#86efac;text-align:center;padding:16px;">✅ ثبت شد!</div><button class="btn btn-primary" onclick="location.reload()" style="margin-top:8px;">وظیفه بعدی</button></div>`);
    } else {
      render(`<div class="section"><div class="error">${r.error}</div><button class="btn btn-secondary" onclick="location.reload()" style="margin-top:8px;">بازگشت</button></div>`);
    }
  });

  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await sendMessage('logout');
    location.reload();
  });
}

// ── Claim ───────────────────────────────────────────────────────────
async function claimTask() {
  render('<div class="section"><div class="empty">در حال تخصیص و بازکردن صفحه...</div></div>');
  const res = await sendMessage('claimNext');
  if (res.success && res.task) {
    await showStatus();
  } else {
    render(`<div class="section"><div class="error">${res.error || 'وظیفه‌ای آماده نیست'}</div><button class="btn btn-secondary" onclick="location.reload()" style="margin-top:8px;">بازگشت</button></div>`);
  }
}

// ── Init ────────────────────────────────────────────────────────────
showStatus();
