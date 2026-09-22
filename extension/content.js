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
  // DIVAR DROPDOWN — click trigger, modal opens, pick option
  // ══════════════════════════════════════════════════════════════════
  async function clickDivarDropdownByName(name, optionText, labelText) {
    if (!optionText) return false;
    labelText = labelText || name;

    // Strategy 1: find button by name attribute
    let trigger = document.querySelector('button[name="' + name + '"]');

    // Strategy 2: for brand_and_model — find kt-action-field with label text
    if (!trigger && labelText) {
      const btns = [...document.querySelectorAll('button.kt-action-field, button.kt-select-field')]
        .filter(b => b.offsetParent);
      for (const btn of btns) {
        let parent = btn.parentElement;
        for (let i = 0; i < 6 && parent; i++) {
          const t = (parent.innerText || '');
          if (t.includes(labelText)) { trigger = btn; break; }
          parent = parent.parentElement;
        }
        if (trigger) break;
      }
    }

    if (!trigger) { warn('trigger not found:', labelText); return false; }
    // Click to open modal
    trigger.click();
    await new Promise(r => setTimeout(r, 1000));

    // Look for kt-modal with options
    const modal = document.querySelector('.kt-modal');
    if (!modal) { warn('modal not opened for:', labelText); return false; }

    // Try to type in search input to filter
    const searchInput = modal.querySelector('input[type="text"], input[type="search"]');
    if (searchInput) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(searchInput, optionText);
      else searchInput.value = optionText;
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 500));
    }

    // Find and click the matching option row
    const rows = [...modal.querySelectorAll('.kt-base-row, [class*="base-row"]')];
    let clicked = false;
    for (const row of rows) {
      if (!row.offsetParent) continue;
      const text = (row.textContent || '').trim();
      if (text.includes(optionText) || optionText.includes(text)) {
        row.click();
        log('\u2705 select:', labelText, '=', text.substring(0, 30));
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      // Try broader search — any div with the text inside modal
      const divs = [...modal.querySelectorAll('div, span, p')];
      for (const d of divs) {
        const t = (d.textContent || '').trim();
        if (t === optionText && d.offsetParent) {
          d.click();
          log('\u2705 select (broad):', labelText, '=', t);
          clicked = true;
          break;
        }
      }
    }

    if (!clicked) {
      warn('option not found:', optionText);
      // Press Escape to close modal
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
    }

    await new Promise(r => setTimeout(r, 500));
    return clicked;
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

        // Wait for select buttons to appear (lazy-loaded)
    for (let w = 0; w < 15; w++) {
      if (document.querySelector("button[name=year]")) break;
      await new Promise(r => setTimeout(r, 500));
    }

    // 4. Select dropdowns (car-specific) — match by name attribute
    const selects = [
      { name: 'mileage', value: pf.mileage },
      { name: 'year',    value: pf.year },
      { name: 'color',   value: pf.color },
      { name: 'gearbox', value: pf.gearbox },
      { name: 'fuel_type', value: pf.fuel || 'بنزین' },
    ];

    // Brand/model: find by label text in kt-action-field (different component)
    const brandVal = pf.brand && pf.model ? pf.brand + ' ' + pf.model : pf.brand;
    if (brandVal && !filledKeys.has('brand')) {
      try {
        const ok = await clickDivarDropdownByName('brand_and_model', String(brandVal), 'برند و مدل');
        if (ok) { filledKeys.add('brand'); filled++; }
      } catch (e) { warn('brand select error:', e.message); }
    }

    for (const s of selects) {
      if (filledKeys.has(s.name) || !s.value) continue;
      try {
        const ok = await clickDivarDropdownByName(s.name, String(s.value));
        if (ok) { filledKeys.add(s.name); filled++; }
      } catch (e) { warn('select error:', s.name, e.message); }
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
    const pf = currentPrefill;

    // Wait for form (up to 20s)
    let found = false;
    for (let i = 0; i < 20; i++) {
      const el = findTextField('title') || findTextField('description');
      if (el) { found = true; break; }
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!found) { showIndicator('⏳ فرم پیدا نشد'); return; }

    let filled = 0;
    const filledKeys = new Set();

    // 1. Fill text fields (Page 1)
    const titleEl = findTextField('title');
    if (titleEl && pf.title && setTextValue(titleEl, pf.title)) {
      filledKeys.add('title'); filled++;
      log('✅ title:', pf.title);
      highlight(titleEl);
    }

    const descEl = findTextField('description');
    const desc = generateDescription(pf);
    if (descEl && desc && setTextValue(descEl, desc)) {
      filledKeys.add('description'); filled++;
      log('✅ description:', desc.substring(0, 60));
      highlight(descEl);
    }

    // 2. Upload images (Page 1)
    await uploadImages();

    log('page 1 done:', filled, 'fields — clicking بعدی...');
    showIndicator(
      '✅ ' + filled + ' فیلد پر شد (صفحه ۱)\
' +
      'بعدی زده میشه، صبر کن...'
    );

    // 3. Click "بعدی" to go to Page 2 (car fields)
    await new Promise(r => setTimeout(r, 2000));
    let nextClicked = false;
    for (const btn of document.querySelectorAll('button')) {
      const t = (btn.textContent || '').trim();
      if (t.includes('بعدی') && btn.offsetParent && !btn.disabled) {
        log('clicking بعدی...');
        btn.click();
        nextClicked = true;
        break;
      }
    }
    if (!nextClicked) { warn('بعدی button not found'); return; }

    // 4. Wait for Page 2 to load (car-specific select buttons)
    log('waiting for car fields to load...');
    let selectFound = false;
    for (let w = 0; w < 20; w++) {
      await new Promise(r => setTimeout(r, 500));
      if (document.querySelector('button[name="year"]') || 
          document.querySelector('button[name="color"]')) {
        selectFound = true;
        break;
      }
    }
    if (!selectFound) { warn('car fields did not load after بعدی'); return; }
    log('car fields loaded!');

    // 5. Fill select dropdowns (Page 2)
    await new Promise(r => setTimeout(r, 1000)); // extra settle time

    const selects = [
      { name: 'fuel_type', value: pf.fuel || 'بنزین' },
      { name: 'year',      value: pf.year },
      { name: 'color',     value: pf.color },
      { name: 'gearbox',   value: pf.gearbox },
    ];

    let selectFilled = 0;
    for (const s of selects) {
      if (!s.value) continue;
      try {
        const ok = await clickDivarDropdownByName(s.name, String(s.value));
        if (ok) { selectFilled++; log('✅', s.name, '=', s.value); }
      } catch (e) { warn('select error:', s.name, e.message); }
    }

    log('done! text:', filled, 'selects:', selectFilled);
    showIndicator(
      '✅ ' + filled + ' متن + ' + selectFilled + ' انتخاب\
' +
      'فرم رو بررسی کن ✋'
    );
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