// ─── Content Script v3 — Multi-Step Auto-Fill ────────────────────────
// Detects Divar ad form, fills fields step by step, clicks "بعدی".
// NEVER clicks "ثبت آگهی" — that's always human.
//
// Flow: detect form -> find fields -> fill -> click "بعدی" -> next step -> repeat

(function () {
  'use strict';

  const LOG_PREFIX = '[دستیار دیوار]';
  const log = (...a) => console.log(LOG_PREFIX, ...a);
  const warn = (...a) => console.warn(LOG_PREFIX, ...a);

  let autoFilled = false;
  let currentPrefill = null;
  let currentStep = 0;

  // ══════════════════════════════════════════════════════════════════
  // PREFILL DATA — from API (web panel stores, we read)
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
        log('prefill از API بازیابی شد:', d.productId);
        return d.prefill;
      }
    } catch (e) { warn('خطا در API:', e); }
    return null;
  }

  // ══════════════════════════════════════════════════════════════════
  // FIELD DETECTION — find inputs by label/placeholder text
  // ══════════════════════════════════════════════════════════════════

  // Persian keyword map: prefill key -> labels to search
  const FIELD_MAP = {
    title:       ['عنواین آگهی', 'عنواین', 'title'],
    description: ['توضیحات آگهی', 'توضیحات', 'description'],
    price:       ['قیمت', 'مبلغ', 'price'],
    brand:       ['برند', 'سازنده', 'brand'],
    model:       ['مدل', 'model'],
    color:       ['رنگ', 'color'],
    storage:     ['حافظه', 'storage', 'ظرفیت'],
  };

  function getVisibleInputs() {
    return [...document.querySelectorAll('input, textarea')]
      .filter(el => el.offsetParent !== null && el.type !== 'hidden' && el.type !== 'submit');
  }

  function findFieldByLabel(keywords) {
    const inputs = getVisibleInputs();
    for (const input of inputs) {
      // Strategy 1: aria-label
      const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();
      for (const kw of keywords) {
        if (ariaLabel.includes(kw.toLowerCase())) return input;
      }
      // Strategy 2: placeholder
      const ph = (input.placeholder || '').toLowerCase();
      for (const kw of keywords) {
        if (ph.includes(kw.toLowerCase())) return input;
      }
      // Strategy 3: name/id attributes
      const name = (input.name || '').toLowerCase();
      const id = (input.id || '').toLowerCase();
      for (const kw of keywords) {
        if (name.includes(kw.toLowerCase()) || id.includes(kw.toLowerCase())) return input;
      }
      // Strategy 4: nearby label text (up to 5 parent levels)
      let parent = input.parentElement;
      for (let depth = 0; depth < 5 && parent; depth++) {
        const text = (parent.textContent || '').toLowerCase();
        for (const kw of keywords) {
          if (text.includes(kw.toLowerCase())) return input;
        }
        parent = parent.parentElement;
      }
    }
    return null;
  }

  function findFormFields() {
    const fields = {};
    for (const [key, keywords] of Object.entries(FIELD_MAP)) {
      const el = findFieldByLabel(keywords);
      if (el) {
        fields[key] = el;
        log('فیلد پیدا شد:', key, el.tagName,
          '(' + (el.name || el.id || el.placeholder || 'unnamed') + ')');
      }
    }
    return fields;
  }

  // ══════════════════════════════════════════════════════════════════
  // FILL FIELD — set value in React-compatible way
  // ══════════════════════════════════════════════════════════════════
  function setNativeValue(el, value) {
    if (!el || value === undefined || value === null) return false;
    const strValue = String(value);
    if (el.value === strValue) return false; // already filled

    // React needs native setter + React events to trigger onChange
    let setter;
    if (el.tagName === 'TEXTAREA') {
      setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    } else {
      setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    }

    if (setter) {
      setter.call(el, strValue);
    } else {
      el.value = strValue;
    }

    // Focus first, then set, then trigger events
    el.focus();
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  // ══════════════════════════════════════════════════════════════════
  // CLICK "بعدی" BUTTON
  // ══════════════════════════════════════════════════════════════════
  function clickNextButton() {
    const buttons = [...document.querySelectorAll('button')];
    for (const btn of buttons) {
      const text = (btn.textContent || '').trim();
      if (text === 'بعدی' || text.includes('بعدی')) {
        if (btn.offsetParent !== null && !btn.disabled) {
          log('کلیک روی "بعدی":', btn.textContent.trim());
          btn.click();
          return true;
        }
      }
    }
    return false;
  }

  // Check if we're on the final step (submit button visible)
  function isSubmitStep() {
    const buttons = [...document.querySelectorAll('button')];
    for (const btn of buttons) {
      const text = (btn.textContent || '').trim();
      if ((text.includes('ثبت آگهی') || text.includes('ثبت نهایی') || text.includes('ارسال')) && btn.offsetParent !== null) {
        return true;
      }
    }
    return false;
  }

  // ══════════════════════════════════════════════════════════════════
  // AUTO-FILL CURRENT STEP
  // ══════════════════════════════════════════════════════════════════
  function fillCurrentStep() {
    if (!currentPrefill) return false;

    const fields = findFormFields();
    const fieldKeys = Object.keys(fields);
    if (fieldKeys.length === 0) return false;

    let filledSomething = false;

    for (const [key, el] of Object.entries(fields)) {
      const value = currentPrefill[key];
      if (value !== undefined && value !== null && value !== '') {
        if (setNativeValue(el, value)) {
          log('✅ پر شد:', key, '=', String(value).substring(0, 50));
          filledSomething = true;
        }
      }
    }

    return filledSomething;
  }

  // ══════════════════════════════════════════════════════════════════
  // MULTI-STEP ORCHESTRATOR
  // ══════════════════════════════════════════════════════════════════
  async function orchestrate() {
    if (autoFilled || !currentPrefill) return;

    // Wait for form to appear (up to 15 seconds)
    const fields = await new Promise(resolve => {
      let attempts = 0;
      const check = () => {
        const f = findFormFields();
        if (Object.keys(f).length > 0 || attempts > 30) resolve(f);
        else { attempts++; setTimeout(check, 500); }
      };
      check();
    });

    if (Object.keys(fields).length === 0) {
      warn('فرم پیدا نشد — منتظر بارگذاری...');
      return;
    }

    log('مرحله', currentStep + 1, ':', Object.keys(fields).length, 'فیلد پیدا شد');

    // Fill fields
    const filled = fillCurrentStep();

    if (filled) {
      currentStep++;
      showIndicator('✅ فیلدها پر شدنح — مرحله ' + currentStep);

      // Auto-click "بعدی" after a short delay
      setTimeout(() => {
        if (!isSubmitStep()) {
          const clicked = clickNextButton();
          if (clicked) {
            log('مرحله بعدی...');
            // Wait for next step to load, then fill
            setTimeout(() => orchestrate(), 2000);
          } else {
            log('دکمه "بعدی" پیدا نشد — احتمالاً مرحله آخره');
            showIndicator('✅ فرم پر شد! دکمه ثبت رو بزن ✋');
          }
        } else {
          log('مرحله ثبت نهایی — دست نزن!');
          showIndicator('✅ فرم پر شد! دکمه ثبت رو بزن ✋');
        }
      }, 800);
    } else {
      showIndicator('⏳ منتظر فیلدها...');
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // FLOATING INDICATOR
  // ══════════════════════════════════════════════════════════════════
  let indicatorEl = null;

  function showIndicator(text) {
    if (!indicatorEl) {
      indicatorEl = document.createElement('div');
      indicatorEl.id = 'divar-assistant-indicator';
      Object.assign(indicatorEl.style, {
        position: 'fixed', bottom: '20px', left: '20px', zIndex: '999999',
        background: 'linear-gradient(135deg, #1e40af, #7c3aed)',
        color: 'white', padding: '12px 20px', borderRadius: '12px',
        fontSize: '14px', fontFamily: 'Vazirmatn, system-ui, sans-serif',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)', direction: 'rtl',
        cursor: 'pointer', transition: 'all 0.3s',
        maxWidth: '350px', lineHeight: '1.6'
      });
      indicatorEl.addEventListener('click', () => indicatorEl.remove());
      document.body.appendChild(indicatorEl);
    }
    indicatorEl.innerHTML = '<div style="font-weight:bold;margin-bottom:4px;">📢 دستیار آگهی دیوار</div><div>' + text + '</div>';
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
    return url.includes('divar.ir') && (
      url.includes('/new') ||
      url.includes('/create') ||
      url.includes('/submit')
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // MESSAGE HANDLER
  // ══════════════════════════════════════════════════════════════════
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'fillReady' && msg.prefill) {
      currentPrefill = msg.prefill;
      autoFilled = false;
      currentStep = 0;
      log('پریفیل دریافت شد از background');
      orchestrate();
    }
    sendResponse({ ok: true });
  });

  // ══════════════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════════════
  async function init() {
    if (!isAdFormPage()) return;
    log('صفحه فرم آگهی شناسایی شد:', location.href);

    // Try API first (from web panel)
    const prefill = await fetchPrefillFromAPI();
    if (prefill) {
      currentPrefill = prefill;
      orchestrate();
      return;
    }

    // Try background state
    chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
      if (response?.success && response.prefill) {
        currentPrefill = response.prefill;
        orchestrate();
      }
    });
  }

  // Watch for SPA navigation
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (isAdFormPage()) {
        autoFilled = false;
        currentStep = 0;
        log('نابوری SPA — شروع مجدد...');
        init();
      } else {
        removeIndicator();
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  init();
})();