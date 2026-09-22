// ─── Content Script v3.1 — Multi-Step Auto-Fill ──────────────────────
// Detects Divar ad form, fills ALL visible fields, clicks "بعدی".
// NEVER clicks "ثبت آگهی" — that's always human.

(function () {
  'use strict';

  const LOG_PREFIX = '[دستیار دیوار]';
  const log = (...a) => console.log(LOG_PREFIX, ...a);
  const warn = (...a) => console.warn(LOG_PREFIX, ...a);

  let currentPrefill = null;
  let filledKeys = new Set();

  // ══════════════════════════════════════════════════════════════════
  // PREFILL DATA — from API
  // ══════════════════════════════════════════════════════════════════
  async function fetchPrefillFromAPI() {
    try {
      const tokenData = await chrome.storage.local.get('authToken');
      if (!tokenData.authToken) return null;
      const r = await fetch('http://localhost:3000/api/prefill/pending', {
        headers: { 'Authorization': 'Bearer ' + tokenData.authToken }
      });
      const d = await r.json();
      if (d.prefill) {
        log('prefill از API:', d.productId);
        return d.prefill;
      }
    } catch (e) { warn('API error:', e); }
    return null;
  }

  // ══════════════════════════════════════════════════════════════════
  // FIELD DETECTION — by name/placeholder/label
  // ══════════════════════════════════════════════════════════════════
  const FIELD_MAP = {
    title:       { names: ['Title', 'title'],       labels: ['عنوان'], ph: ['عنوان'] },
    description: { names: ['Description', 'description'], labels: ['توضیحات'], ph: ['توضیح'] },
    price:       { names: ['Price', 'price'],       labels: ['قیمت'], ph: ['قیمت', 'تومان'] },
    brand:       { names: ['Brand', 'brand'],       labels: ['برند'], ph: ['برند'] },
    model:       { names: ['Model', 'model'],       labels: ['مدل'], ph: ['مدل'] },
    color:       { names: ['Color', 'color'],       labels: ['رنگ'], ph: ['رنگ'] },
    year:        { names: ['Year', 'year'],         labels: ['سال'], ph: ['سال'] },
    mileage:     { names: ['Mileage', 'mileage'],   labels: ['کیلومتر', 'کارکرد'], ph: ['کیلومتر'] },
    gearbox:     { names: ['Gearbox', 'gearbox'],   labels: ['گیربکس', 'دنده'], ph: ['گیربکس', 'دنده'] },
    storage:     { names: ['Storage', 'storage'],   labels: ['حافظه'], ph: ['حافظه'] },
  };

  function findFieldByConfig(config) {
    const inputs = [...document.querySelectorAll('input, textarea, [role="textbox"]')]
      .filter(el => el.offsetParent !== null && el.type !== 'hidden' && el.type !== 'submit' && el.type !== 'file');

    for (const input of inputs) {
      // Strategy 1: name attribute (exact match — most reliable)
      const name = input.name || '';
      if (config.names.some(n => name.toLowerCase() === n.toLowerCase())) {
        return input;
      }
    }

    // Strategy 2: placeholder (only if no name matched)
    for (const input of inputs) {
      const ph = (input.placeholder || '').toLowerCase();
      if (config.ph && config.ph.some(p => ph.includes(p.toLowerCase()))) {
        return input;
      }
      if (config.placeholder && config.placeholder.some(p => ph.includes(p.toLowerCase()))) {
        return input;
      }
    }

    // Strategy 3: label[for] pointing to this input's id
    for (const input of inputs) {
      if (!input.id) continue;
      const label = document.querySelector('label[for="' + input.id + '"]');
      if (label) {
        const lt = (label.textContent || '').toLowerCase();
        if (config.labels && config.labels.some(l => lt.includes(l.toLowerCase()))) {
          return input;
        }
      }
    }

    return null;
  }

  function findFormFields() {
    const fields = {};
    for (const [key, config] of Object.entries(FIELD_MAP)) {
      const el = findFieldByConfig(config);
      if (el) {
        fields[key] = el;
      }
    }
    return fields;
  }

  // ══════════════════════════════════════════════════════════════════
  // FILL FIELD — React-compatible
  // ══════════════════════════════════════════════════════════════════
  function setNativeValue(el, value) {
    if (!el || value === undefined || value === null) return false;
    // NEVER set file input values
    if (el.type === 'file') return false;
    const strValue = String(value);
    if (el.value === strValue) return false;

    // React needs native setter
    let setter;
    if (el.getAttribute('role') === 'textbox') {
      // contenteditable
      el.textContent = strValue;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    if (el.tagName === 'TEXTAREA') {
      setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    } else {
      setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    }
    if (setter) setter.call(el, strValue);
    else el.value = strValue;

    el.focus();
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  // ══════════════════════════════════════════════════════════════════
  // CLICK "بعدی" (NEXT) — NOT "ثبت" (SUBMIT)
  // ══════════════════════════════════════════════════════════════════
  function clickNextButton() {
    for (const btn of document.querySelectorAll('button')) {
      const text = (btn.textContent || '').trim();
      if (text.includes('بعدی') && btn.offsetParent !== null && !btn.disabled) {
        log('clicking "بعدی":', text);
        btn.click();
        return true;
      }
    }
    return false;
  }

  function isSubmitStep() {
    for (const btn of document.querySelectorAll('button')) {
      const text = (btn.textContent || '').trim();
      if ((text.includes('ثبت آگهی') || text.includes('ارسال')) && btn.offsetParent !== null) {
        return true;
      }
    }
    return false;
  }

  // ══════════════════════════════════════════════════════════════════
  // POLLING FILL — keep trying to fill unfilled fields
  // ══════════════════════════════════════════════════════════════════
  function fillAllVisibleFields() {
    if (!currentPrefill) return;
    const fields = findFormFields();
    let newlyFilled = 0;

    for (const [key, el] of Object.entries(fields)) {
      if (filledKeys.has(key)) continue;
      const value = currentPrefill[key];
      if (value === undefined || value === null || value === '') continue;
      try {
        if (setNativeValue(el, value)) {
          filledKeys.add(key);
          newlyFilled++;
          log('\u2705', key, '=', String(value).substring(0, 40));
          highlightField(el);
        }
      } catch (e) {
        warn('failed to fill', key, ':', e.message);
      }
    }

    return newlyFilled;
  }

  // ══════════════════════════════════════════════════════════════════
  // IMAGE UPLOAD — fetch images and set on file input
  // ══════════════════════════════════════════════════════════════════
  async function uploadImages() {
    if (!currentPrefill?.images?.length) return;

    const fileInput = document.querySelector('input[type="file"][name="Images"]');
    if (!fileInput) { warn('file input not found'); return; }

    const files = [];
    for (const url of currentPrefill.images) {
      try {
        const fullUrl = url.startsWith('http') ? url : 'http://localhost:3000' + url;
        log('downloading image:', fullUrl);
        const resp = await fetch(fullUrl);
        if (!resp.ok) { warn('image fetch failed:', resp.status); continue; }
        const blob = await resp.blob();
        const filename = url.split('/').pop() || 'image.jpg';
        const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
        files.push(file);
      } catch (e) { warn('image error:', e.message); }
    }

    if (files.length === 0) { warn('no images downloaded'); return; }

    // Try DataTransfer API
    try {
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(f);
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      log('uploaded', files.length, 'images via DataTransfer');
    } catch (e) {
      warn('DataTransfer failed:', e.message);
      // Fallback: show download links
      showImageLinks(currentPrefill.images);
    }
  }

  function showImageLinks(images) {
    if (!images?.length) return;
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:80px;left:20px;z-index:999999;background:#1e3a5f;color:white;padding:16px;border-radius:12px;font-family:Vazirmatn;font-size:13px;direction:rtl;box-shadow:0 4px 20px rgba(0,0,0,0.4);max-width:300px;line-height:1.8';
    div.innerHTML = '<div style="font-weight:bold;margin-bottom:8px">📸 عکس‌ها رو دستی آپلود کن:</div>';
    images.forEach((url, i) => {
      const fullUrl = url.startsWith('http') ? url : 'http://localhost:3000' + url;
      div.innerHTML += '<a href="' + fullUrl + '" target="_blank" download style="color:#60a5fa;display:block;margin:4px 0">دانلود عکس ' + (i+1) + '</a>';
    });
    div.innerHTML += '<div style="margin-top:8px;font-size:11px;color:#94a3b8">بعد از دانلود، عکس رو بکش توی فرم</div>';
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 30000);
  }

  // ══════════════════════════════════════════════════════════════════
  // ORCHESTRATE — fill then auto-advance
  // ══════════════════════════════════════════════════════════════════
  async function orchestrate() {
    if (!currentPrefill) return;

    const MAX_WAIT = 30000; // 30 seconds
    const INTERVAL = 1000;  // check every 1s
    const startTime = Date.now();

    // Phase 1: keep polling until at least one field is found
    while (Date.now() - startTime < MAX_WAIT) {
      const count = fillAllVisibleFields();
      if (count > 0) {
        log('fill cycle: +' + count + ' fields');
        break;
      }
      await new Promise(r => setTimeout(r, INTERVAL));
    }

    // Phase 2: keep polling for more fields (textarea might load later)
    let lastFillCount = filledKeys.size;
    let stableCount = 0;
    while (stableCount < 3 && Date.now() - startTime < MAX_WAIT) {
      await new Promise(r => setTimeout(r, 1000));
      fillAllVisibleFields();
      if (filledKeys.size === lastFillCount) {
        stableCount++;
      } else {
        stableCount = 0;
        lastFillCount = filledKeys.size;
        log('new fields filled, total:', filledKeys.size);
      }
    }

    // Phase 3: all available fields filled — upload images + show result
    uploadImages(); // async, non-blocking

    const allFields = findFormFields();
    const totalAvailable = Object.keys(allFields).length;

    if (filledKeys.size > 0) {
      showIndicator(
        '✅ ' + filledKeys.size + '/' + totalAvailable + ' فیلد پر شد\n' +
        'دکمه "بعدی" رو بزن ✋'
      );

      // Auto-click next
      setTimeout(() => {
        if (!isSubmitStep()) {
          if (clickNextButton()) {
            log('next step clicked, waiting for page...');
            // Reset filledKeys and re-orchestrate for next step
            filledKeys.clear();
            setTimeout(() => orchestrate(), 3000);
          }
        } else {
          showIndicator('✅ فرم پر شد! دکمه ثبت رو بزن ✋');
        }
      }, 1000);
    } else {
      showIndicator('⏳ فرم پیدا نشد');
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // VISUAL FEEDBACK
  // ══════════════════════════════════════════════════════════════════
  function highlightField(el) {
    el.style.transition = 'box-shadow 0.3s';
    el.style.boxShadow = '0 0 0 2px #22c55e, 0 0 12px rgba(34,197,94,0.3)';
    setTimeout(() => { el.style.boxShadow = ''; }, 3000);
  }

  let indicatorEl = null;
  function showIndicator(text) {
    if (!indicatorEl) {
      indicatorEl = document.createElement('div');
      indicatorEl.id = 'divar-assistant';
      Object.assign(indicatorEl.style, {
        position: 'fixed', bottom: '20px', left: '20px', zIndex: '999999',
        background: 'linear-gradient(135deg, #1e40af, #7c3aed)',
        color: 'white', padding: '12px 20px', borderRadius: '12px',
        fontSize: '14px', fontFamily: 'Vazirmatn, system-ui',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)', direction: 'rtl',
        cursor: 'pointer', whiteSpace: 'pre-line', lineHeight: '1.8'
      });
      indicatorEl.addEventListener('click', () => indicatorEl.remove());
      document.body.appendChild(indicatorEl);
    }
    indicatorEl.innerHTML = '<div style="font-weight:bold;margin-bottom:4px">📢 دستیار آگهی</div>' + text;
  }

  function removeIndicator() {
    indicatorEl?.remove();
    indicatorEl = null;
  }

  // ══════════════════════════════════════════════════════════════════
  // PAGE DETECTION
  // ══════════════════════════════════════════════════════════════════
  function isAdFormPage() {
    const url = window.location.href;
    return url.includes('divar.ir') && (url.includes('/new') || url.includes('/create') || url.includes('/submit'));
  }

  // ══════════════════════════════════════════════════════════════════
  // MESSAGE HANDLER
  // ══════════════════════════════════════════════════════════════════
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'fillReady' && msg.prefill) {
      currentPrefill = msg.prefill;
      filledKeys.clear();
      orchestrate();
    }
    sendResponse({ ok: true });
  });

  // ══════════════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════════════
  async function init() {
    if (!isAdFormPage()) return;
    log('form page detected:', location.href);

    // Try API first
    const prefill = await fetchPrefillFromAPI();
    if (prefill) {
      currentPrefill = prefill;
      orchestrate();
      return;
    }

    // Fallback: background
    chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
      if (response?.success && response.prefill) {
        currentPrefill = response.prefill;
        orchestrate();
      }
    });
  }

  // Watch for SPA navigation + periodic re-fetch
  let lastUrl = location.href;
  let lastFetchTime = 0;

  const observer = new MutationObserver(async () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (isAdFormPage()) {
        filledKeys.clear();
        init();
      } else {
        removeIndicator();
      }
      return;
    }
    // Re-fetch from API every 3 seconds (handles stale prefill)
    if (isAdFormPage() && currentPrefill && Date.now() - lastFetchTime > 3000) {
      lastFetchTime = Date.now();
      const fresh = await fetchPrefillFromAPI();
      if (fresh && JSON.stringify(fresh) !== JSON.stringify(currentPrefill)) {
        log('new prefill detected! Re-filling...');
        currentPrefill = fresh;
        filledKeys.clear();
        orchestrate();
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  init();
})();