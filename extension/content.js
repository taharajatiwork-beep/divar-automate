// ─── Content Script — Divar Ad Form Auto-Fill ───────────────────────
// Detects the ad creation form and fills text fields.
// NEVER clicks "submit" — only fills data and highlights readiness.

(function () {
  'use strict';

  const LOG_PREFIX = '[دیوار-پایلوت]';
  let currentPrefill = null;
  let fillIndicator = null;

  // ── Logging ──────────────────────────────────────────────────────
  function log(...args) {
    console.log(LOG_PREFIX, ...args);
  }

  function warn(...args) {
    console.warn(LOG_PREFIX, ...args);
  }

  // ── State check on load ──────────────────────────────────────────
  function checkState() {
    chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
      if (chrome.runtime.lastError) {
        warn('خطا در ارتباط با سرویس‌ورکر:', chrome.runtime.lastError.message);
        return;
      }
      if (response?.success && response.prefill) {
        currentPrefill = response.prefill;
        log('پیش‌پرشدن بارگذاری شد:', currentPrefill.taskId);
        showFloatingIndicator();
      } else {
        log('وظیفه‌ای فعال نیست.');
      }
    });
  }

  // ── Floating indicator ───────────────────────────────────────────
  function showFloatingIndicator() {
    removeIndicator();
    if (!currentPrefill) return;

    const fields = currentPrefill.fields || {};
    const images = currentPrefill.images || [];
    const edits = currentPrefill.fieldEdits || [];
    const errors = currentPrefill.validationErrors || [];

    fillIndicator = document.createElement('div');
    fillIndicator.id = 'divar-pilot-indicator';
    fillIndicator.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        left: 20px;
        z-index: 99999;
        background: #1a1a2e;
        border: 2px solid #166534;
        border-radius: 12px;
        padding: 16px 20px;
        font-family: Vazirmatn, system-ui, sans-serif;
        direction: rtl;
        color: #e2e8f0;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        min-width: 280px;
        font-size: 13px;
        line-height: 1.8;
      ">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <span style="font-size: 18px;">📢</span>
          <strong style="color: #86efac;">آگهی آماده پیش‌پرکردن</strong>
        </div>
        <div style="color: #94a3b8; font-size: 12px;">
          وظیفه: <span style="color: #e2e8f0;">${currentPrefill.taskId}</span>
        </div>
        <div style="margin-top: 8px; color: #94a3b8; font-size: 12px;">
          فیلدها: ${Object.keys(fields).length} مورد · تصاویر: ${images.length} عدد
          ${edits.length > 0 ? ` · اصلاحات: ${edits.length}` : ''}
        </div>
        ${errors.length > 0 ? `
          <div style="margin-top: 8px; color: #fca5a5; font-size: 11px;">
            ⚠️ ${errors.length} خطا — قبل از ثبت بررسی کنید
          </div>
        ` : ''}
        <div style="margin-top: 12px; display: flex; gap: 8px;">
          <button id="divar-pilot-fill-btn" style="
            background: #166534;
            color: white;
            border: none;
            padding: 6px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-family: inherit;
            font-size: 12px;
            font-weight: 500;
          ">پر کردن فیلدها</button>
          <button id="divar-pilot-close-btn" style="
            background: #374151;
            color: #9ca3af;
            border: none;
            padding: 6px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-family: inherit;
            font-size: 12px;
          ">بستن</button>
        </div>
        <div style="margin-top: 8px; color: #6b7280; font-size: 10px; text-align: center;">
          ⛔ دکمه ثبت آگهی هرگز خودکار زده نمی‌شود
        </div>
      </div>
    `;

    document.body.appendChild(fillIndicator);

    document.getElementById('divar-pilot-fill-btn')?.addEventListener('click', () => {
      autoFillForm();
    });

    document.getElementById('divar-pilot-close-btn')?.addEventListener('click', () => {
      removeIndicator();
    });

    log('اندیکاتور شناور نمایش داده شد.');
  }

  function removeIndicator() {
    fillIndicator?.remove();
    fillIndicator = null;
  }

  // ── Form detection ───────────────────────────────────────────────
  // Divar uses various form structures. We try multiple selectors.
  function findFormFields() {
    const fields = {};

    // Strategy 1: Look for inputs by placeholder or label text
    const allInputs = document.querySelectorAll('input[type="text"], input[type="number"], textarea');
    const allLabels = document.querySelectorAll('label');

    // Map Persian labels to field names
    const labelMap = {
      'عنوان': 'title',
      'توضیحات': 'description',
      'قیمت': 'price',
      'دسته': 'category',
      'برند': 'attributes.brand',
      'مدل': 'attributes.model',
      'حافظه': 'attributes.storage',
    };

    for (const label of allLabels) {
      const text = (label.textContent || '').trim();
      for (const [persian, fieldKey] of Object.entries(labelMap)) {
        if (text.includes(persian)) {
          const input = label.querySelector('input, textarea') ||
            document.getElementById(label.getAttribute('for'));
          if (input) {
            fields[fieldKey] = input;
          }
        }
      }
    }

    // Strategy 2: Look for inputs by placeholder
    for (const input of allInputs) {
      const placeholder = (input.placeholder || '').trim();
      if (placeholder.includes('عنوان')) fields.title = fields.title || input;
      if (placeholder.includes('توضیح')) fields.description = fields.description || input;
      if (placeholder.includes('قیمت')) fields.price = fields.price || input;
    }

    return fields;
  }

  // ── Auto-fill ────────────────────────────────────────────────────
  function autoFillForm() {
    if (!currentPrefill) {
      warn('داده پیش‌پرشدن موجود نیست.');
      return;
    }

    const fields = findFormFields();
    const prefilled = currentPrefill.fields || {};
    let filledCount = 0;

    for (const [key, element] of Object.entries(fields)) {
      let value = prefilled[key];

      // Handle nested attributes
      if (key.startsWith('attributes.')) {
        const attrKey = key.split('.')[1];
        value = prefilled.attributes?.[attrKey];
      }

      if (value === undefined || value === null || value === '') continue;

      // Convert price to string
      if (key === 'price' && typeof value === 'number') {
        value = String(value);
      }

      // For non-array values, set the input
      if (!Array.isArray(value)) {
        setNativeValue(element, String(value));
        highlightField(element);
        filledCount++;
        log(`فیلد «${key}» پر شد.`);
      }
    }

    // Show summary
    showFillSummary(filledCount, Object.keys(fields).length);

    // Update indicator
    removeIndicator();
    showFloatingIndicator();

    log(`پیش‌پرکردن تمام شد: ${filledCount} فیلد.`);
  }

  // ── Set value reactively ─────────────────────────────────────────
  // React-controlled inputs need special handling.
  function setNativeValue(element, value) {
    // Try React's internal setter first
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set;
    const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )?.set;

    const setter = element.tagName === 'TEXTAREA'
      ? nativeTextareaValueSetter
      : nativeInputValueSetter;

    if (setter) {
      setter.call(element, value);
    } else {
      element.value = value;
    }

    // Dispatch events to trigger React/Vue handlers
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  // ── Visual feedback ──────────────────────────────────────────────
  function highlightField(element) {
    element.style.transition = 'box-shadow 0.3s ease';
    element.style.boxShadow = '0 0 0 2px #166534, 0 0 12px rgba(22, 101, 52, 0.3)';
    setTimeout(() => {
      element.style.boxShadow = '';
    }, 3000);
  }

  function showFillSummary(filled, total) {
    const summary = document.createElement('div');
    summary.id = 'divar-pilot-summary';
    summary.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 20px;
      z-index: 99999;
      background: ${filled > 0 ? '#166534' : '#7f1d1d'};
      color: white;
      border-radius: 10px;
      padding: 12px 20px;
      font-family: Vazirmatn, system-ui, sans-serif;
      direction: rtl;
      font-size: 13px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    `;
    summary.textContent = filled > 0
      ? `✅ ${filled} از ${total} فیلد پر شد — لطفاً بررسی و ثبت کنید`
      : `⚠️ فیلدی پر نشد — فرم را بررسی کنید`;
    document.body.appendChild(summary);
    setTimeout(() => summary.remove(), 5000);
  }

  // ── Detect form page ─────────────────────────────────────────────
  function isAdFormPage() {
    const url = window.location.href;
    return url.includes('/new') || url.includes('/create') || url.includes('/ثبت');
  }

  // ── Initialize ───────────────────────────────────────────────────
  log('اسکریپت محتوا بارگذاری شد.');

  if (isAdFormPage()) {
    log('صفحه فرم ثبت آگهی شناسایی شد.');
    checkState();
  }

  // Watch for URL changes (SPA navigation)
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (isAdFormPage()) {
        log('تغییر URL به صفحه فرم — بررسی وضعیت...');
        checkState();
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
