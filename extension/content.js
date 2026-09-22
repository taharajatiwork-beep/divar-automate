// ─── Content Script v4 — Divar Car Form Auto-Fill ────────────────────
// Fills car ad form on divar.ir/new: text fields + select dropdowns + description.
// NEVER clicks "ثبت آگهی" — operator clicks submit.

(function () {
  'use strict';

  const LOG = '[دستیار]';
  const log = (...a) => console.log(LOG, ...a);
  const warn = (...a) => console.warn(LOG, ...a);

  let currentPrefill = null;
  let filledKeys = new Set();
  let observer = null;

  // ══════════════════════════════════════════════════════════════════
  // PREFILL from API
  // ══════════════════════════════════════════════════════════════════
  async function fetchPrefill() {
    try {
      const td = await chrome.storage.local.get('authToken');
      if (!td.authToken) return null;
      const r = await fetch('http://localhost:3000/api/prefill/pending', {
        headers: { Authorization: 'Bearer ' + td.authToken }
      });
      const d = await r.json();
      if (d.prefill) { log('prefill:', d.productId); return d.prefill; }
    } catch (e) { warn('API:', e.message); }
    return null;
  }

  // ══════════════════════════════════════════════════════════════════
  // FIELD MAP — prefill key -> how to find on Divar
  // ══════════════════════════════════════════════════════════════════
  const FIELDS = {
    title:       { names: ['Title', 'title'],    labels: ['عنواین'], ph: ['عنواین'] },
    description: { names: ['Description'],       labels: ['توضیحات'], ph: ['توضیح'] },
    price:       { names: ['Price', 'price'],    labels: ['قیمت'], ph: ['قیمت', 'تومان'] },
  };

  // ══════════════════════════════════════════════════════════════════
  // TEXT FIELD DETECTION — name/placeholder only (no parent walk)
  // ══════════════════════════════════════════════════════════════════
  function findTextField(key) {
    const cfg = FIELDS[key];
    if (!cfg) return null;
    const all = [...document.querySelectorAll('input, textarea, [role="textbox"]')]
      .filter(el => el.offsetParent !== null && el.type !== 'hidden' && el.type !== 'submit' && el.type !== 'file');

    // Strategy 1: name attribute
    for (const el of all) {
      const n = el.name || '';
      if (cfg.names.some(k => n.toLowerCase() === k.toLowerCase())) return el;
    }
    // Strategy 2: placeholder
    for (const el of all) {
      const ph = (el.placeholder || '').toLowerCase();
      if (cfg.ph && cfg.ph.some(k => ph.includes(k.toLowerCase()))) return el;
    }
    return null;
  }

  // ══════════════════════════════════════════════════════════════════
  // SET TEXT VALUE — React-compatible
  // ══════════════════════════════════════════════════════════════════
  function setTextValue(el, value) {
    if (!el || value === undefined || value === null) return false;
    if (el.type === 'file') return false;
    const sv = String(value);
    if (el.value === sv) return false;

    if (el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox') {
      el.textContent = sv;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, sv); else el.value = sv;
    el.focus();
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  // ══════════════════════════════════════════════════════════════════
  // GENERATE COMPREHENSIVE DESCRIPTION
  // Divar AI auto-fills dropdown fields from description text!
  // ══════════════════════════════════════════════════════════════════
  function generateDescription(pf) {
    if (pf.description && pf.description.length > 30) return pf.description;

    const parts = [];
    if (pf.brand || pf.model) parts.push((pf.brand || '') + ' ' + (pf.model || ''));
    if (pf.year) parts.push('سال تولید ' + pf.year);
    if (pf.mileage) parts.push(pf.mileage + ' کیلومتر کارکرد');
    if (pf.color) parts.push('رنگ: ' + pf.color);
    if (pf.gearbox) parts.push(pf.gearbox);
    if (pf.fuel) parts.push(pf.fuel);
    if (pf.price) parts.push(new Intl.NumberFormat('fa-IR').format(pf.price) + ' تومان');
    parts.push('سالم و بدون گرانتی');

    return parts.join('. ') + '.';
  }

  // ══════════════════════════════════════════════════════════════════
  // DIVAR DROPDOWN CLICKER — opens select and picks option
  // ══════════════════════════════════════════════════════════════════
  async function clickDivarDropdown(labelText, optionText) {
    // Find the dropdown trigger by label text
    const labels = [...document.querySelectorAll('label, div, span, h3, h4')];
    const labelEl = labels.find(el => {
      const t = (el.textContent || '').trim();
      return t.includes(labelText) && el.offsetParent !== null;
    });
    if (!labelEl) { warn('dropdown not found:', labelText); return false; }

    // Find clickable element near the label (the select trigger)
    let trigger = labelEl;
    for (let i = 0; i < 5; i++) {
      trigger = trigger.parentElement;
      if (!trigger) break;
      const btn = trigger.querySelector('button, [role="combobox"], [class*="select"], [class*="dropdown"]');
      if (btn && btn.offsetParent) { trigger = btn; break; }
    }

    // Click to open
    trigger.click();
    await new Promise(r => setTimeout(r, 800));

    // Find and click the option
    const options = [...document.querySelectorAll('[role="option"], [role="menuitem"], li, div')];
    const option = options.find(el => {
      const t = (el.textContent || '').trim();
      return t === optionText && el.offsetParent !== null;
    });

    if (option) {
      option.click();
      log('✅ select:', labelText, '=', optionText);
      await new Promise(r => setTimeout(r, 500));
      return true;
    }

    warn('option not found:', optionText);
    // Press Escape to close dropdown
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return false;
  }

  // ══════════════════════════════════════════════════════════════════
  // FILL ALL FIELDS — text + select + description
  // ══════════════════════════════════════════════════════════════════
  async function fillFields() {
    if (!currentPrefill) return 0;
    const pf = currentPrefill;
    let filled = 0;

    // 1. Title
    if (!filledKeys.has('title')) {
      const el = findTextField('title');
      if (el && setTextValue(el, pf.title)) {
        filledKeys.add('title'); filled++;
        log('✅ title:', pf.title);
        highlight(el);
      }
    }

    // 2. Description (generate comprehensive text)
    if (!filledKeys.has('description')) {
      const el = findTextField('description');
      const desc = generateDescription(pf);
      if (el && setTextValue(el, desc)) {
        filledKeys.add('description'); filled++;
        log('✅ description:', desc.substring(0, 50));
        highlight(el);
      }
    }

    // 3. Price
    if (!filledKeys.has('price')) {
      const el = findTextField('price');
      if (el && pf.price && setTextValue(el, String(pf.price))) {
        filledKeys.add('price'); filled++;
        log('✅ price:', pf.price);
        highlight(el);
      }
    }

    // 4. Select dropdowns (car-specific)
    const selects = [
      { key: 'brand',    label: 'برند و مدل', value: pf.brand && pf.model ? pf.brand + ' ' + pf.model : pf.brand },
      { key: 'mileage',  label: 'کارکرد', value: pf.mileage },
      { key: 'year',     label: 'مدل', value: pf.year },
      { key: 'color',    label: 'رنگ', value: pf.color },
      { key: 'gearbox',  label: 'گیربکس', value: pf.gearbox },
      { key: 'fuel',     label: 'سوخت', value: pf.fuel || 'بنزین' },
    ];

    for (const s of selects) {
      if (filledKeys.has(s.key) || !s.value) continue;
      try {
        const ok = await clickDivarDropdown(s.label, String(s.value));
        if (ok) { filledKeys.add(s.key); filled++; }
      } catch (e) { warn('select error:', s.key, e.message); }
    }

    return filled;
  }

  // ══════════════════════════════════════════════════════════════════
  // IMAGE UPLOAD
  // ══════════════════════════════════════════════════════════════════
  async function uploadImages() {
    if (!currentPrefill?.images?.length) return;
    const fileInput = document.querySelector('input[type="file"]');
    if (!fileInput) { warn('file input not found'); return; }

    const files = [];
    for (const url of currentPrefill.images) {
      try {
        const fullUrl = url.startsWith('http') ? url : 'http://localhost:3000' + url;
        log('downloading image:', fullUrl);
        const resp = await fetch(fullUrl);
        if (!resp.ok) continue;
        const blob = await resp.blob();
        files.push(new File([blob], url.split('/').pop() || 'image.jpg', { type: blob.type || 'image/jpeg' }));
      } catch (e) { warn('image error:', e.message); }
    }
    if (files.length === 0) return;

    try {
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(f);
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      log('✅ uploaded', files.length, 'images');
    } catch (e) {
      warn('DataTransfer failed:', e.message);
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
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 30000);
  }

  // ══════════════════════════════════════════════════════════════════
  // ORCHESTRATE
  // ══════════════════════════════════════════════════════════════════
  async function orchestrate() {
    if (!currentPrefill) return;

    // Wait for form (up to 20s)
    let found = false;
    for (let i = 0; i < 20; i++) {
      const el = findTextField('title') || findTextField('description');
      if (el) { found = true; break; }
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!found) { showIndicator('⏳ فرم پیدا نشد'); return; }

    // Fill fields (with delays for dropdowns)
    const count = await fillFields();
    log('filled:', count, 'fields');

    // Upload images
    uploadImages();

    // Show result
    showIndicator(
      '✅ ' + filledKeys.size + ' فیلد پر شد\
' +
      'دکمه "بعدی" رو بزن ✋\
' +
      'در صورت عدم انتخاب فیلد‌ها خودکار انتخاب کنید'
    );

    // Auto-click next after 2s
    setTimeout(() => {
      for (const btn of document.querySelectorAll('button')) {
        const t = (btn.textContent || '').trim();
        if (t.includes('بعدی') && btn.offsetParent && !btn.disabled) {
          log('clicking next...');
          btn.click();
          break;
        }
      }
    }, 2000);
  }

  // ══════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════
  function highlight(el) {
    el.style.transition = 'box-shadow 0.3s';
    el.style.boxShadow = '0 0 0 2px #22c55e, 0 0 12px rgba(34,197,94,0.3)';
    setTimeout(() => { el.style.boxShadow = ''; }, 3000);
  }

  let indEl = null;
  function showIndicator(text) {
    if (!indEl) {
      indEl = document.createElement('div');
      Object.assign(indEl.style, {
        position: 'fixed', bottom: '20px', left: '20px', zIndex: '999999',
        background: 'linear-gradient(135deg, #1e40af, #7c3aed)',
        color: 'white', padding: '12px 20px', borderRadius: '12px',
        fontSize: '14px', fontFamily: 'Vazirmatn, system-ui',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)', direction: 'rtl',
        whiteSpace: 'pre-line', lineHeight: '1.8'
      });
      indEl.onclick = () => indEl.remove();
      document.body.appendChild(indEl);
    }
    indEl.innerHTML = '<div style="font-weight:bold;margin-bottom:4px">📢 دستیار دیوار</div>' + text;
  }

  function isFormPage() {
    const u = location.href;
    return u.includes('divar.ir') && (u.includes('/new') || u.includes('/create') || u.includes('/submit'));
  }

  // ══════════════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════════════
  async function init() {
    if (!isFormPage()) return;
    log('page:', location.href);

    const pf = await fetchPrefill();
    if (pf) { currentPrefill = pf; orchestrate(); return; }

    chrome.runtime.sendMessage({ action: 'getStatus' }, (r) => {
      if (r?.success && r.prefill) { currentPrefill = r.prefill; orchestrate(); }
    });
  }

  // SPA navigation + periodic re-fetch
  let lastUrl = location.href;
  let lastFetchTime = 0;
  new MutationObserver(async () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (isFormPage()) { filledKeys.clear(); init(); }
      else { indEl?.remove(); indEl = null; }
      return;
    }
    if (isFormPage() && currentPrefill && Date.now() - lastFetchTime > 3000) {
      lastFetchTime = Date.now();
      const fresh = await fetchPrefill();
      if (fresh && JSON.stringify(fresh) !== JSON.stringify(currentPrefill)) {
        log('new prefill!');
        currentPrefill = fresh;
        filledKeys.clear();
        orchestrate();
      }
    }
  }).observe(document.body, { childList: true, subtree: true });

  init();
})();