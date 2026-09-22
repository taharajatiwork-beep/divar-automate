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

  const { task, prefill } = res;

  if (!task) {
    render(`
      <div class="section">
        <div class="label">وضعیت اتصال</div>
        <div class="value">
          <span class="status-dot status-active"></span>
          متصل — آماده دریافت وظیفه
        </div>
        <button class="btn btn-primary" id="btn-claim" style="margin-top:12px;">
          دریافت وظیفه بعدی
        </button>
      </div>
      <div class="warning-banner">
        ⛔ ثبت آگهی هرگز خودکار نیست — فقط داده پیش‌پرکردن ارسال می‌شود
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

    ${edits.length > 0 ? `
      <div class="section">
        <div class="label">اصلاحات اعمال‌شده</div>
        <div class="edits-list">
          ${edits.map(e => `<div class="edit-item">${e.field}: <span class="edit-new">${e.newValue}</span></div>`).join('')}
        </div>
      </div>
    ` : ''}

    <div class="section">
      <button class="btn btn-primary" id="btn-fill" onclick="window.__fillForm && window.__fillForm()">
        پر کردن خودکار فیلدها در فرم
      </button>
      <button class="btn btn-danger" id="btn-submit" style="margin-top:6px;">
        ✅ ثبت آگهی (تأیید انسانی)
      </button>
      <div class="warning-banner">
        ⛔ فقط در صفحه فرم ثبت آگهی کلیک کنید
      </div>
    </div>
  `);

  document.getElementById('btn-submit')?.addEventListener('click', async () => {
    if (!confirm('آیا ثبت آگهی در دیوار را تأیید می‌کنید؟')) return;
    const res = await sendMessage('submit', { taskId: task.id });
    if (res.success) {
      render(`
        <div class="section">
          <div class="value" style="color:#86efac; text-align:center; padding:16px;">
            ✅ ثبت شد!
          </div>
        </div>
      `);
    } else {
      render(`<div class="section"><div class="error">${res.error}</div></div>`);
    }
  });
}

// ── Claim task ──────────────────────────────────────────────────────
async function claimTask() {
  render('<div class="section"><div class="empty">در حال تخصیص...</div></div>');
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
