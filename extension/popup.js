// ─── Popup Script ───────────────────────────────────────────────────
const content = document.getElementById('content');

function sendMessage(action, data = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action, ...data }, (response) => {
      resolve(response || { success: false, error: 'پاسخی دریافت نشد' });
    });
  });
}

function render(html) {
  content.innerHTML = html;
}

function formatPrice(v) {
  if (typeof v !== 'number') return v || '—';
  return v.toLocaleString('fa-IR') + ' تومان';
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

  const { task, prefill, tabId } = res;

  if (!task) {
    render(`
      <div class="section">
        <div class="label">وضعیت اتصال</div>
        <div class="value">
          <span class="status-dot status-active"></span>
          متصل — آماده دریافت وظیفه
        </div>
        <button class="btn btn-primary" id="btn-claim" style="margin-top:12px;">
          🚀 دریافت وظیفه و بازکردن صفحه دیوار
        </button>
      </div>
      <div class="warning-banner">
        ⛔ ثبت آگهی هرگز خودکار نیست<br/>
        صفحه دیوار خودکار باز می‌شود و فیلدها پر می‌شوند<br/>
        ولی ثبت نهایی با خودتان است
      </div>
    `);
    document.getElementById('btn-claim')?.addEventListener('click', claimTask);
    return;
  }

  // Show current task
  const fields = prefill?.fields || {};
  const edits = prefill?.fieldEdits || [];
  const images = prefill?.images || [];
  const errors = prefill?.validationErrors || [];

  const tabOpen = tabId !== null && tabId !== undefined;

  render(`
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
      <div class="section" style="background: #065f4620; border-radius: 8px; padding: 10px 14px;">
        <div style="color: #86efac; font-size: 12px;">
          ✅ صفحه دیوار باز است — روی «پر کردن فیلدها» در صفحه کلیک کنید
        </div>
      </div>
    ` : `
      <div class="section">
        <button class="btn btn-secondary" id="btn-open-divar">
          🌐 بازکردن صفحه ثبت آگهی
        </button>
      </div>
    `}

    ${edits.length > 0 ? `
      <div class="section">
        <div class="label">اصلاحات اعمال‌شده</div>
        <div class="edits-list">
          ${edits.map(e => `<div class="edit-item">${e.field}: <span class="edit-new">${e.newValue}</span></div>`).join('')}
        </div>
      </div>
    ` : ''}

    <div class="section">
      <button class="btn btn-danger" id="btn-submit">
        ✅ ثبت آگهی (تأیید انسانی)
      </button>
      <div class="warning-banner">
        ⛔ فقط بعد از بررسی نهایی کلیک کنید
      </div>
    </div>
  `);

  document.getElementById('btn-open-divar')?.addEventListener('click', async () => {
    const r = await sendMessage('openDivar');
    if (r.success) {
      await showStatus(); // refresh to show tab is open
    }
  });

  document.getElementById('btn-submit')?.addEventListener('click', async () => {
    if (!confirm('آیا ثبت آگهی در دیوار را تأیید می‌کنید؟')) return;
    const r = await sendMessage('submit', { taskId: task.id });
    if (r.success) {
      render(`
        <div class="section">
          <div class="value" style="color:#86efac; text-align:center; padding:16px;">
            ✅ ثبت شد!
          </div>
          <button class="btn btn-primary" onclick="location.reload()" style="margin-top:8px;">
            دریافت وظیفه بعدی
          </button>
        </div>
      `);
    } else {
      render(`<div class="section"><div class="error">${r.error}</div><button class="btn btn-secondary" onclick="location.reload()" style="margin-top:8px;">بازگشت</button></div>`);
    }
  });
}

// ── Claim task ──────────────────────────────────────────────────────
async function claimTask() {
  render('<div class="section"><div class="empty">در حال تخصیص و بازکردن صفحه...</div></div>');
  const res = await sendMessage('claimNext');
  if (res.success && res.task) {
    await showStatus();
  } else {
    render(`
      <div class="section">
        <div class="error">${res.error || 'وظیفه‌ای آماده نیست'}</div>
        <button class="btn btn-secondary" onclick="location.reload()" style="margin-top:8px;">بازگشت</button>
      </div>
    `);
  }
}

// ── Init ────────────────────────────────────────────────────────────
showStatus();
