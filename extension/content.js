// ─── Content Script v2 — Divar Ad Form Auto-Fill ────────────────────
// Works with real Divar.ir form. Multi-strategy selectors.
// NEVER clicks "submit" — only fills data and highlights readiness.
//
// Divar is a React SPA. The ad creation form is multi-step:
//   1. Category selection
//   2. Location
//   3. Product details (title, description, price, attributes)
//   4. Images
//   5. Contact
//
// We fill step 3 fields. Step 4 images are manual drag-and-drop.
// Step 5 submit is ALWAYS human-clicked.

(function () {
  'use strict';

  const LOG_PREFIX = '[دیوار-اتوماسیون]';
  let currentPrefill = null;
  let currentTaskId = null;
  let fillIndicator = null;
  let autoFilled = false;

  // ── Logging ──────────────────────────────────────────────────────
  const log = (...a) => console.log(LOG_PREFIX, ...a);
  const warn = (...a) => console.warn(LOG_PREFIX, ...a);

  // ══════════════════════════════════════════════════════════════════
  // MESSAGE HANDLER — from background.js
  // ══════════════════════════════════════════════════════════════════
  // ── Listen for messages from background (extension popup) ──
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'fillReady' && msg.prefill) {
      currentPrefill = msg.prefill;
      currentTaskId = msg.taskId;
      autoFilled = false;
      log('✅ داده پیش‌پرکردن دریافت شد:', msg.taskId);
      waitForFormReady().then(() => showIndicator());
      sendResponse({ received: true });
    }
    if (msg.action === 'getStatus') {
      sendResponse({
        success: true,
        hasPrefill: !!currentPrefill,
        taskId: currentTaskId,
        prefill: currentPrefill,
      });
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // FORM FIELD DETECTION — Multi-strategy
  // ══════════════════════════════════════════════════════════════════
  //
  // Divar form fields can be found by:
  // 1. Label text (Persian) near input/textarea
  // 2. Placeholder text in input
  // 3. name/id attributes
  // 4. data-testid attributes
  // 5. Parent container with class patterns
  // 6. Nearby sibling text nodes

  const FIELD_MAP = {
    title:       { labels: ['عنوان', 'title', 'نام آگهی'],        placeholder: ['عنوان', 'نام', 'title'] },
    description: { labels: ['توضیحات', 'description', 'توضیح'],    placeholder: ['توضیح', 'description'] },
    price:       { labels: ['قیمت', 'price', 'مبلغ'],              placeholder: ['قیمت', 'price', 'تومان'] },
    brand:       { labels: ['برند', 'brand', 'سازنده'],             placeholder: ['برند', 'brand'] },
    model:       { labels: ['مدل', 'model', 'نام مدل'],            placeholder: ['مدل', 'model'] },
    storage:     { labels: ['حافظه', 'storage', 'رم', 'RAM'],       placeholder: ['حافظه', 'storage', 'GB'] },
    color:       { labels: ['رنگ', 'color', 'رنگبندی'],             placeholder: ['رنگ', 'color'] },
    city:        { labels: ['شهر', 'city', 'محل'],                  placeholder: ['شهر', 'city'] },
  };

  function findFormFields() {
    const fields = {};
    const debug = [];

    // Strategy 1: Find by label text
    for (const [key, config] of Object.entries(FIELD_MAP)) {
      if (fields[key]) continue;

      // Look for labels
      const allElements = document.querySelectorAll('label, span, div, h3, h4, p');
      for (const el of allElements) {
        const text = (el.textContent || '').trim().toLowerCase();
        const matched = config.labels.some(l => text.includes(l.toLowerCase()));
        if (!matched) continue;

        // Find the associated input (sibling, child, or via 'for' attribute)
        const input = findNearbyInput(el);
        if (input) {
          fields[key] = input;
          debug.push(`${key}: found via label "${text.substring(0, 30)}"`);
          break;
        }
      }
    }

    // Strategy 2: Find by placeholder
    for (const [key, config] of Object.entries(FIELD_MAP)) {
      if (fields[key]) continue;

      const inputs = document.querySelectorAll('input, textarea');
      for (const input of inputs) {
        const ph = (input.placeholder || '').toLowerCase();
        const matched = config.placeholder.some(p => ph.includes(p.toLowerCase()));
        if (matched) {
          fields[key] = input;
          debug.push(`${key}: found via placeholder "${ph.substring(0, 30)}"`);
          break;
        }
      }
    }

    // Strategy 3: Find by name/id attributes
    const NAME_MAP = {
      title: ['title', 'post_title', 'ad_title', 'subject'],
      description: ['description', 'body', 'content', 'text'],
      price: ['price', 'amount', 'cost'],
    };
    for (const [key, names] of Object.entries(NAME_MAP)) {
      if (fields[key]) continue;
      for (const name of names) {
        const el = document.querySelector(`input[name="${name}"], textarea[name="${name}"], input[id="${name}"], textarea[id="${name}"]`);
        if (el) {
          fields[key] = el;
          debug.push(`${key}: found via name/id "${name}"`);
          break;
        }
      }
    }

    // Strategy 4: Find by data-testid
    const TESTID_MAP = {
      title: ['input-title', 'post-title', 'ad-title'],
      description: ['input-description', 'post-description', 'text-area'],
      price: ['input-price', 'post-price', 'input-amount'],
    };
    for (const [key, testids] of Object.entries(TESTID_MAP)) {
      if (fields[key]) continue;
      for (const tid of testids) {
        const el = document.querySelector(`[data-testid="${tid}"] input, [data-testid="${tid}"] textarea, [data-testid="${tid}"]`);
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
          fields[key] = el;
          debug.push(`${key}: found via data-testid "${tid}"`);
          break;
        }
      }
    }

    // Strategy 5: Find textareas for description (fallback)
    if (!fields.description) {
      const textareas = document.querySelectorAll('textarea');
      if (textareas.length === 1) {
        fields.description = textareas[0];
        debug.push('description: found via single textarea fallback');
      }
    }

    // Strategy 6: Find inputs with specific patterns
    if (!fields.price) {
      const numberInputs = document.querySelectorAll('input[type="number"], input[inputmode="numeric"]');
      for (const input of numberInputs) {
        const parent = input.closest('div');
        const parentText = (parent?.textContent || '').toLowerCase();
        if (parentText.includes('قیمت') || parentText.includes('مبلغ') || parentText.includes('تومان')) {
          fields.price = input;
          debug.push('price: found via numeric input near price text');
          break;
        }
      }
    }

    log('فیلدهای پیدا شده:', Object.keys(fields).join(', ') || 'هیچکدام');
    if (debug.length) log('روش‌های تشخیص:', debug.join(' | '));

    return fields;
  }

  // ── Find input near a label/text element ──────────────────────────
  function findNearbyInput(labelEl) {
    // 1. Input inside the label
    const inside = labelEl.querySelector('input, textarea, [role="textbox"]');
    if (inside) return inside;

    // 2. 'for' attribute
    const forAttr = labelEl.getAttribute('for');
    if (forAttr) {
      const byFor = document.getElementById(forAttr);
      if (byFor) return byFor;
    }

    // 3. Next sibling
    let sibling = labelEl.nextElementSibling;
    for (let i = 0; i < 5 && sibling; i++) {
      const input = sibling.querySelector('input, textarea, [role="textbox"]') || 
                    (sibling.matches?.('input, textarea') ? sibling : null);
      if (input) return input;
      sibling = sibling.nextElementSibling;
    }

    // 4. Parent's next sibling
    const parentNext = labelEl.parentElement?.nextElementSibling;
    if (parentNext) {
      const input = parentNext.querySelector('input, textarea, [role="textbox"]');
      if (input) return input;
    }

    // 5. Walk up to find container, then look for inputs
    let container = labelEl.parentElement;
    for (let i = 0; i < 3 && container; i++) {
      const input = container.querySelector('input, textarea, [role="textbox"]');
      if (input && input !== labelEl) return input;
      container = container.parentElement;
    }

    return null;
  }

  // ══════════════════════════════════════════════════════════════════
  // AUTO-FILL
  // ══════════════════════════════════════════════════════════════════
  function autoFillForm() {
    if (!currentPrefill) {
      warn('داده پیش‌پرکردن موجود نیست.');
      return;
    }

    const fields = findFormFields();
    const data = currentPrefill.fields || {};
    let filledCount = 0;
    const results = [];

    // Map our keys to prefilled data
    const VALUE_MAP = {
      title:       () => data.title,
      description: () => data.description,
      price:       () => data.price,
      brand:       () => data.attributes?.brand || data.brand,
      model:       () => data.attributes?.model || data.model,
      storage:     () => data.attributes?.storage || data.storage,
      color:       () => data.attributes?.color || data.color,
      city:        () => data.city,
    };

    for (const [key, element] of Object.entries(fields)) {
      const getValue = VALUE_MAP[key];
      if (!getValue) continue;

      let value = getValue();
      if (value === undefined || value === null || value === '') continue;

      // Convert numbers to string for input fields
      if (typeof value === 'number') {
        value = key === 'price' ? String(value) : String(value);
      }

      // Skip images (handled separately)
      if (Array.isArray(value)) continue;

      // Set value using React-compatible method
      setNativeValue(element, String(value));
      highlightField(element);
      filledCount++;
      results.push(`✅ ${key}: ${String(value).substring(0, 30)}`);
      log(`فیلد «${key}» پر شد:`, String(value).substring(0, 50));
    }

    autoFilled = true;
    showFillSummary(filledCount, Object.keys(fields).length, results);
    removeIndicator();
    setTimeout(() => showIndicator(), 500);
    log(`پیش‌پرکردن تمام شد: ${filledCount} فیلد.`);
  }

  // ══════════════════════════════════════════════════════════════════
  // REACT-COMPATIBLE VALUE SETTER
  // ══════════════════════════════════════════════════════════════════
  function setNativeValue(element, value) {
    // For React-controlled inputs, we need to use the native setter
    // and dispatch the right events

    // Handle contenteditable divs (some rich text editors)
    if (element.getAttribute('contenteditable') === 'true') {
      element.textContent = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    // Handle [role="textbox"] (custom textarea components)
    if (element.getAttribute('role') === 'textbox') {
      element.textContent = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    // Standard input/textarea
    const proto = element.tagName === 'TEXTAREA'
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;

    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) {
      setter.call(element, value);
    } else {
      element.value = value;
    }

    // Dispatch all events React might listen to
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));

    // Also try React's synthetic event system
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set;
    if (nativeInputValueSetter && element.tagName === 'INPUT') {
      nativeInputValueSetter.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // VISUAL FEEDBACK
  // ══════════════════════════════════════════════════════════════════
  function highlightField(el) {
    el.style.transition = 'box-shadow 0.3s ease';
    el.style.boxShadow = '0 0 0 2px #22c55e, 0 0 12px rgba(34,197,94,0.3)';
    setTimeout(() => { el.style.boxShadow = ''; }, 4000);
  }

  function showFillSummary(filled, total, results) {
    const existing = document.getElementById('divar-pilot-summary');
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.id = 'divar-pilot-summary';
    div.style.cssText = `
      position: fixed; bottom: 20px; left: 20px; z-index: 99999;
      background: ${filled > 0 ? '#166534' : '#7f1d1d'};
      color: white; border-radius: 10px; padding: 14px 20px;
      font-family: Vazirmatn, system-ui, sans-serif; direction: rtl;
      font-size: 13px; box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      max-width: 350px; line-height: 1.8;
    `;
    div.innerHTML = filled > 0
      ? `<div style="font-weight:600;margin-bottom:4px">✅ ${filled} از ${total} فیلد پر شد</div>
         <div style="font-size:11px;opacity:0.8">${results.slice(0, 5).join('<br>')}</div>
         <div style="margin-top:8px;font-size:11px;border-top:1px solid rgba(255,255,255,0.2);padding-top:8px">
           📸 تصاویر را دستی اضافه کنید<br>
           ⛔ دکمه ثبت آگهی را خودتان بزنید
         </div>`
      : `⚠️ هیچ فیلدی پر نشد — لطفاً فرم را بررسی کنید`;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 8000);
  }

  // ══════════════════════════════════════════════════════════════════
  // FLOATING INDICATOR
  // ══════════════════════════════════════════════════════════════════
  function showIndicator() {
    removeIndicator();
    if (!currentPrefill) return;

    const data = currentPrefill.fields || {};
    const images = currentPrefill.images || [];
    const title = data.title || 'نامشخص';

    fillIndicator = document.createElement('div');
    fillIndicator.id = 'divar-pilot-indicator';
    fillIndicator.innerHTML = `
      <div style="
        position: fixed; top: 16px; left: 16px; z-index: 99999;
        background: #0f172a; border: 2px solid ${autoFilled ? '#22c55e' : '#f59e0b'};
        border-radius: 12px; padding: 14px 18px;
        font-family: Vazirmatn, system-ui, sans-serif; direction: rtl;
        color: #e2e8f0; box-shadow: 0 8px 32px rgba(0,0,0,0.6);
        min-width: 260px; font-size: 13px; line-height: 1.8;
      ">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:16px">${autoFilled ? '✅' : '📋'}</span>
          <strong style="color:${autoFilled ? '#86efac' : '#fbbf24'}">
            ${autoFilled ? 'آگهی آماده ثبت' : 'آماده پیش‌پرکردن'}
          </strong>
        </div>
        <div style="color:#94a3b8;font-size:11px;margin-bottom:4px">
          📌 ${title}
        </div>
        <div style="color:#94a3b8;font-size:11px">
          وظیفه: ${currentTaskId || '—'}
        </div>
        ${images.length > 0 ? `<div style="color:#94a3b8;font-size:11px">📸 ${images.length} تصویر</div>` : ''}
        <div style="margin-top:10px;display:flex;gap:6px">
          ${!autoFilled ? `
            <button id="dp-fill" style="
              background:#16a34a;color:white;border:none;padding:7px 16px;
              border-radius:6px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600
            ">✅ پر کردن فیلدها</button>
          ` : ''}
          <button id="dp-close" style="
            background:#374151;color:#9ca3af;border:none;padding:7px 10px;
            border-radius:6px;cursor:pointer;font-family:inherit;font-size:11px
          ">بستن</button>
        </div>
        <div style="margin-top:6px;color:#6b7280;font-size:9px;text-align:center">
          ⛔ ثبت آگهی فقط توسط شما انجام می‌شود
        </div>
      </div>
    `;

    document.body.appendChild(fillIndicator);

    document.getElementById('dp-fill')?.addEventListener('click', autoFillForm);
    document.getElementById('dp-close')?.addEventListener('click', removeIndicator);
    log('اندیکاتور نمایش داده شد.');
  }

  function removeIndicator() {
    fillIndicator?.remove();
    fillIndicator = null;
  }

  // ══════════════════════════════════════════════════════════════════
  // PAGE DETECTION
  // ══════════════════════════════════════════════════════════════════
  function isAdFormPage() {
    const url = window.location.href;
    return url.includes('divar.ir') && (
      url.includes('/v/new') ||
      url.includes('/v/create') ||
      url.includes('/new/') ||
      url.includes('/create/')
    );
  }

  function waitForFormReady(maxWait = 15000) {
    return new Promise(resolve => {
      const start = Date.now();
      const check = () => {
        const fields = findFormFields();
        if (Object.keys(fields).length > 0) {
          resolve(fields);
        } else if (Date.now() - start < maxWait) {
          setTimeout(check, 800);
        } else {
          log('فرم در ۱۵ ثانیه پیدا نشد — اندیکاتور با داده نمایش داده می‌شود.');
          resolve({});
        }
      };
      check();
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════════════
  log('اسکریپت محتوا v2 بارگذاری شد.');

  // Check if we're on an ad form page
  if (isAdFormPage()) {
    log('صفحه فرم آگهی شناسایی شد:', location.href);

    // Poll API for pending prefill from web panel
    try {
      const r = await fetch('http://localhost:3000/api/prefill/pending', {
        headers: { 'Authorization': 'Bearer ' + (await chrome.storage.local.get('authToken')).authToken }
      });
      const d = await r.json();
      if (d.prefill) {
        currentPrefill = d.prefill;
        log('prefill از API بازیابی شد:', d.productId);
        waitForFormReady().then(() => showIndicator());
        return;
      }
    } catch (e) { warn('خطا در دریافت prefill:', e); }

    // Fallback: try background
    chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
      if (chrome.runtime.lastError) {
        warn('خطا:', chrome.runtime.lastError.message);
        return;
      }
      if (response?.success && response.prefill) {
        currentPrefill = response.prefill;
        currentTaskId = response.taskId;
        log('وضعیت از background بازیابی شد:', currentTaskId);
        waitForFormReady().then(() => showIndicator());
      }
    });
  }

  // Watch for SPA navigation (Divar is a React SPA)
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (isAdFormPage()) {
        log('ناوبری SPA به فرم آگهی — بررسی وضعیت...');
        autoFilled = false;

        // Poll API for pending prefill
        try {
          const r = await fetch('http://localhost:3000/api/prefill/pending', {
            headers: { 'Authorization': 'Bearer ' + (await chrome.storage.local.get('authToken')).authToken }
          });
          const d = await r.json();
          if (d.prefill) {
            currentPrefill = d.prefill;
            waitForFormReady().then(() => showIndicator());
            return;
          }
        } catch (e) {}

        // Fallback: background
        chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
          if (response?.success && response.prefill) {
            currentPrefill = response.prefill;
            currentTaskId = response.taskId;
            waitForFormReady().then(() => showIndicator());
          }
        });
      } else {
        removeIndicator();
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
