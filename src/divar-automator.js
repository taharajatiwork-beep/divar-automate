// ─── Divar Automator — Puppeteer-based form filling ────────────────────
// Cancel-aware, cleanup-first, page-verified form filling.
// NEVER clicks submit (ثبت اطلاعات) — operator does that.

import browserService from './browser-service.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const randomDelay = () => sleep(300 + Math.random() * 900);

function cssEscape(s) {
  return String(s).replace(/([^\w-])/g, '\\$1');
}

const LOG = '[automator]';
const log = (...a) => console.log(LOG, ...a);
const warn = (...a) => console.warn(LOG, ...a);

function normalizeOption(value) {
  return String(value || '')
    .replace(/[۰-۹]/g, (c) => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(c)])
    .replace(/[\u200c\u200f\u200e]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// ─── Cancel Token ───────────────────────────────────────────────────
class CancelToken {
  constructor() { this.cancelled = false; this.reason = null; }
  cancel(reason) { this.cancelled = true; this.reason = reason || 'Cancelled'; }
  throwIfCancelled() {
    if (this.cancelled) throw new Error(this.reason);
  }
}

// ─── Singleton ──────────────────────────────────────────────────────
class DivarAutomator {
  constructor() {
    this._results = [];
    this._cancelToken = null;
    this._filling = false;
  }

  get isFilling() { return this._filling; }

  cancel(reason) {
    if (this._cancelToken) {
      this._cancelToken.cancel(reason || 'کاربر فرایند را لغو کرد');
    }
  }

  async _checkCancel() {
    if (this._cancelToken) this._cancelToken.throwIfCancelled();
  }

  // ── Navigate to fresh ad form (cleanup) ─────────────────────────
  async cleanup() {
    log('cleanup: starting...');
    const page = browserService.getPage();

    // Step 1: Click "پاک کردن" if we're already on divar.ir/new (clear existing form)
    try {
      const currentUrl = page.url();
      if (currentUrl.includes('divar.ir/new')) {
        log('cleanup: on ad form, clicking "پاک کردن"...');
        const buttons = await page.$$('button');
        for (const btn of buttons) {
          const txt = await page.evaluate((e) => (e.textContent || '').trim(), btn);
          if (txt.includes('پاک کردن')) {
            const isVisible = await page.evaluate((e) => e.offsetParent !== null && !e.disabled, btn);
            if (isVisible) {
              await this._cdpClick(page, btn);
              log('cleanup: clicked "پاک کردن"');
              await sleep(1500);

              // Step 1b: Confirm "بله" in dialog
              const confirmBtns = await page.$$('button');
              for (const cbtn of confirmBtns) {
                const ctxt = await page.evaluate((e) => (e.textContent || '').trim(), cbtn);
                if (ctxt === 'بله') {
                  const cVisible = await page.evaluate((e) => e.offsetParent !== null && !e.disabled, cbtn);
                  if (cVisible) {
                    await this._cdpClick(page, cbtn);
                    log('cleanup: confirmed "بله"');
                    await sleep(1500);
                    break;
                  }
                }
              }
              break;
            }
          }
        }
      }
    } catch (err) {
      warn('cleanup: clear button error:', err.message);
    }

    // Step 2: Navigate to fresh ad form
    log('cleanup: navigating to fresh form...');
    await browserService.navigate('https://divar.ir/new');
    await sleep(3000);

    // Re-acquire page reference after navigation
    try {
      await browserService.reacquirePage();
    } catch {}
    const url = browserService.getPage().url();
    if (!url.includes('divar.ir')) {
      throw new Error('صفحه دیوار بارگذاری نشد: ' + url);
    }
    log('cleanup: ready — URL: ' + url);
  }

  // ── Main entry: orchestrate all 4 pages ──────────────────────────
  async fillForm(product) {
    if (!browserService.ready) {
      throw new Error('مرورگر متصل نیست. ابتدا دکمه راه‌اندازی مرورگر را بزنید.');
    }

    this._results = [];
    this._cancelToken = new CancelToken();
    this._filling = true;

    try {
      log(`starting form fill for: ${product.title} (${product.id})`);

      // Step 0: Cleanup — navigate to fresh form
      await this.cleanup();
      await this._checkCancel();

      // Step 1: Page 1 — title + description + images
      await this.fillPage1(product);
      await this._checkCancel();
      await this.clickNext();
      await this._checkCancel();

      // Step 2: Page 2 — car fields
      await this.fillPage2(product);
      await this._checkCancel();
      await this.clickNext();
      await this._checkCancel();

      // Step 3: Page 3 — price
      await this.fillPricePage(product);
      await this._checkCancel();
      await this.clickNext();
      await this._checkCancel();

      // Step 4: Page 4 — contact info (manual)
      log('arrived at page 4 (contact info) — operator finishes manually');
      this._results.push({ page: 4, field: 'contact', status: 'manual' });
    } catch (err) {
      if (err.message.includes('لغو') || err.message.includes('cancel')) {
        log('⛔ fill cancelled:', err.message);
        this._results.push({ page: 'cancelled', field: 'global', status: 'cancelled', error: err.message });
      } else {
        warn('form fill error:', err.message);
        this._results.push({ page: 'error', field: 'global', status: 'failed', error: err.message });
      }
    } finally {
      this._filling = false;
      this._cancelToken = null;
    }

    this.logSummary();
    return this._results;
  }

  // ── Page 1: Title + Description + Images ─────────────────────────
  async fillPage1(product) {
    log('page 1: title + description + images');
    const page = browserService.getPage();

    log('waiting for title field...');
    const titleLoaded = await this._waitForElement(page, [
      '#Title', '[name="Title"]', 'input[placeholder*="عنوان"]',
      'input[placeholder*="title"]', '.post-fields__field input',
    ], 15000);

    if (!titleLoaded) {
      warn('page 1: form fields not found — page might not have loaded');
      this._results.push({ field: 'title', status: 'page-not-loaded' });
      return;
    }
    log('page 1: form loaded');

    await this._tryFillField(page, '#Title, [name="Title"]', product.title, 'title');
    await this._checkCancel();

    const desc = this.generateDescription(product);
    await this._tryFillField(page, '#Description, [name="Description"]', desc, 'description');
    await this._checkCancel();

    if (product.images && product.images.length > 0) {
      await this._uploadImages(page, product);
    }

    // Select city/location
    if (product.city || (product.attributes && product.attributes.city)) {
      await this.selectLocation(page, product.city || product.attributes.city);
    }
  }

  // ── CDP trusted click (isTrusted=true) ────────────────────────
  async _cdpClick(page, element) {
    const cdp = await page.target().createCDPSession();
    try {
      const rect = await page.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, element);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
      await sleep(500);
    } finally {
      try { await cdp.detach(); } catch {}
    }
  }

  // ── Select city/location in map modal ─────────────────────────
  async selectLocation(page, cityName) {
    if (!cityName) return;
    log('selecting location:', cityName);
    await randomDelay();

    // Step 1: Find and click the location "انتخاب" button
    // The location field has a button.kt-action-field with text "انتخاب"
    // and "مکان" appears in parent element text
    let clicked = false;
    const actionButtons = await page.$$('button.kt-action-field');
    for (const btn of actionButtons) {
      const text = await page.evaluate((e) => (e.textContent || '').trim(), btn);
      if (text !== 'انتخاب') continue;

      // Walk up parents to check if "مکان" is nearby
      const hasMakan = await page.evaluate((e) => {
        let el = e;
        for (let i = 0; i < 5; i++) {
          el = el.parentElement;
          if (!el) return false;
          if (el.textContent.includes('مکان')) return true;
        }
        return false;
      }, btn);

      if (hasMakan) {
        await this._cdpClick(page, btn);
        log('clicked location field');
        clicked = true;
        break;
      }
    }

    // Fallback: click first visible "انتخاب" button
    if (!clicked) {
      for (const btn of actionButtons) {
        const text = await page.evaluate((e) => (e.textContent || '').trim(), btn);
        if (text === 'انتخاب') {
          const isVisible = await page.evaluate((e) => e.offsetParent !== null, btn);
          if (isVisible) {
            await this._cdpClick(page, btn);
            log('clicked location field (fallback)');
            clicked = true;
            break;
          }
        }
      }
    }

    if (!clicked) {
      warn('location: could not find location field');
      this._results.push({ field: 'location', status: 'field-not-found' });
      return;
    }

    await sleep(2000);

    // Step 2: Find search input in modal and type city name
    const searchSelectors = [
      'input[placeholder*="جستجو"]',
      'input[placeholder*="شهر"]',
      'input[placeholder*="محله"]',
      'input[type="text"]',
    ];
    let searchInput = null;
    for (const sel of searchSelectors) {
      searchInput = await page.$(sel).catch(() => null);
      if (searchInput) {
        // Make sure it's the modal search, not another input
        const isVisible = await page.evaluate((e) => e.offsetParent !== null, searchInput);
        if (isVisible) break;
        searchInput = null;
      }
    }

    if (!searchInput) {
      warn('location: search input not found in modal');
      this._results.push({ field: 'location', status: 'search-not-found' });
      return;
    }

    // Clear and type city name
    await searchInput.click();
    await sleep(100);
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await sleep(50);
    await page.keyboard.press('Backspace');
    await sleep(100);
    await searchInput.type(cityName, { delay: 50 });
    await sleep(1500);

    // Step 3: Click first search result
    const resultSelectors = [
      '.kt-modal .kt-base-row',
      '.kt-modal .kt-list-row',
      '[class*="modal"] [class*="row"]',
      '[class*="result"] [class*="item"]',
    ];
    let clickedResult = false;
    for (const sel of resultSelectors) {
      const results = await page.$$(sel);
      for (const r of results) {
        const text = await page.evaluate((e) => (e.textContent || '').trim(), r);
        if (text.includes(cityName) || cityName.includes(text.replace(/\s+/g, ''))) {
          const isVisible = await page.evaluate((e) => e.offsetParent !== null, r);
          if (isVisible) {
            await this._cdpClick(page, r);
            log('selected city:', text.substring(0, 30));
            clickedResult = true;
            break;
          }
        }
      }
      if (clickedResult) break;
    }

    if (!clickedResult) {
      // Try any visible row in the modal
      const rows = await page.$$('.kt-modal .kt-base-row, .kt-modal [role="option"]');
      if (rows.length > 0) {
        await this._cdpClick(page, rows[0]);
        log('selected first city result');
        clickedResult = true;
      }
    }

    await sleep(1000);

    // Step 4: Click "تأیید" button
    const confirmBtns = await page.$$('button');
    for (const btn of confirmBtns) {
      const txt = await page.evaluate((e) => (e.textContent || '').trim(), btn);
      if (txt === 'تأیید' || txt.includes('تأیید')) {
        const isVisible = await page.evaluate((e) => e.offsetParent !== null && !e.disabled, btn);
        if (isVisible) {
          await this._cdpClick(page, btn);
          log('location: confirmed');
          this._results.push({ field: 'location', status: 'filled', value: cityName });
          await sleep(1500);
          return;
        }
      }
    }

    warn('location: confirm button not found');
    this._results.push({ field: 'location', status: 'confirm-not-found' });
  }

  // ── Page 2: Car select dropdowns + usage input ──────────────────
  async fillPage2(product) {
    try { await browserService.reacquirePage(); } catch {}
    log('page 2: car fields');
    const page = browserService.getPage();
    const attrs = product.attributes || {};

    log('waiting for car fields...');
    const page2Loaded = await this._waitForElement(page, [
      '#year___Input', '#color___Input', '[id*="year"]',
      'button[name="brand_model"]', '[id*="brand_model"]',
    ], 15000);

    if (!page2Loaded) {
      warn('page 2: car fields not found');
      this._results.push({ field: 'car-fields', status: 'page-not-loaded' });
      return;
    }
    log('page 2: car fields loaded');

    const brandVal = attrs.model || attrs.brand;
    if (brandVal) {
      await this.openSelectModal(page, 'brand_model', String(brandVal), 'برند و مدل');
      await this._checkCancel();
    }

    const selects = [
      { fieldId: 'fuel_type', value: attrs.fuel || 'بنزین' },
      { fieldId: 'year', value: attrs.year },
      { fieldId: 'color', value: attrs.color },
      { fieldId: 'body_status', value: attrs.bodyStatus || 'سالم و بی\u200cخط و خش' },
      { fieldId: 'gearbox', value: attrs.gearbox },
    ];

    for (const s of selects) {
      if (!s.value) continue;
      await this._checkCancel();
      await this.openSelectModal(page, s.fieldId, String(s.value));
    }

    if (attrs.mileage) {
      await this._tryFillField(page, '#usage___Input, [id*="usage"]', String(attrs.mileage), 'mileage');
    }
  }

  // ── Open a select modal and pick an option ──────────────────────
  async openSelectModal(page, fieldId, optionText, labelText) {
    labelText = labelText || fieldId;
    await randomDelay();

    const triggerSelectors = [
      `#${cssEscape(fieldId)}___Input`,
      `#${cssEscape(fieldId)} button`,
      `[id*="${fieldId}"] button`,
      `button[name="${fieldId}"]`,
    ];

    let trigger = null;
    for (const sel of triggerSelectors) {
      trigger = await page.$(sel).catch(() => null);
      if (trigger) break;
    }
    if (!trigger) {
      warn(`${labelText}: trigger not found`);
      this._results.push({ field: fieldId, status: 'trigger-not-found' });
      return false;
    }

    const currentText = await page.evaluate((el) => (el.innerText || '').trim(), trigger);
    if (normalizeOption(currentText) === normalizeOption(optionText) && currentText !== 'انتخاب') {
      log(`✅ ${labelText} already set: ${currentText}`);
      this._results.push({ field: fieldId, status: 'already-set' });
      return true;
    }

    await this._cdpClick(page, trigger);
    await sleep(700);

    let modal = null;
    for (const sel of ['.single-select-modal.kt-modal', '.kt-modal.kt-modal--scrollable', '.kt-modal']) {
      modal = await page.$(sel).catch(() => null);
      if (modal) break;
    }
    if (!modal) {
      warn(`${labelText}: modal not found`);
      this._results.push({ field: fieldId, status: 'modal-not-found' });
      return false;
    }

    const result = await this.findAndClickOption(page, modal, optionText);
    await sleep(700);

    if (result.success) {
      log(`✅ ${labelText}: ${optionText} (${result.strategy})`);
      this._results.push({ field: fieldId, status: 'filled', strategy: result.strategy });
    } else {
      warn(`${labelText}: option not found — ${optionText}`);
      this._results.push({ field: fieldId, status: 'no-match' });
      await this._cdpClick(page, trigger).catch(() => {});
    }
    return result.success;
  }

  // ── 3-pass option matching ──────────────────────────────────────
  async findAndClickOption(page, modal, optionText) {
    const wanted = normalizeOption(optionText);
    const brandWord = normalizeOption((optionText.split(/\s+/)[0] || ''));

    const OPTION_TITLE_SELS = [
      '.start__title-_UBPtX', 'p[class*="title"]',
      '.kt-base-row__start p', '.kt-base-row p', 'p',
    ];

    async function getOptionTitle(row) {
      for (const sel of OPTION_TITLE_SELS) {
        const el = await row.$(sel);
        if (el) {
          const text = await page.evaluate((e) => e.textContent?.trim(), el);
          if (text) return { element: el, text };
        }
      }
      const rowText = await page.evaluate((e) => e.textContent?.trim(), row);
      return { element: row, text: rowText || '' };
    }

    const rows = await modal.$$('.kt-base-row');
    log(`matching: wanted="${wanted}" rows=${rows.length}`);

    for (const row of rows) {
      const { text } = await getOptionTitle(row);
      const norm = normalizeOption(text);
      if (norm.includes(wanted) || wanted.includes(norm) || norm.split(/s*[-–]s*/).some(r => r.includes(wanted) || wanted.includes(r))) {
        await this._cdpClick(page, row);
        return { success: true, strategy: 'pass1-exact' };
      }
    }

    if (brandWord.length > 2) {
      for (const row of rows) {
        const { text } = await getOptionTitle(row);
        const norm = normalizeOption(text);
        if (norm.includes(brandWord)) {
          await this._cdpClick(page, row);
          return { success: true, strategy: 'pass2-brand' };
        }
      }
    }

    const showAllBtns = await modal.$$('[role="button"], .rawButton-W5tTZw, button');
    for (const btn of showAllBtns) {
      const txt = await page.evaluate((e) => e.textContent?.trim(), btn);
      if (txt && /همه/.test(txt)) {
        await this._cdpClick(page, btn);
        await sleep(1000);

        const searchSels = ['input[type="text"]', 'input[placeholder]', 'input'];
        let searchInput = null;
        for (const sel of searchSels) {
          searchInput = await modal.$(sel).catch(() => null);
          if (searchInput) break;
        }
        if (searchInput) {
          await searchInput.click();
          await searchInput.type(optionText, { delay: 30 + Math.random() * 80 });
          await sleep(600);
        }

        const newRows = await modal.$$('.kt-base-row');
        for (const row of newRows) {
          const { text } = await getOptionTitle(row);
          const norm = normalizeOption(text);
          if (norm.includes(wanted) || wanted.includes(norm) || norm.includes(brandWord)) {
            await this._cdpClick(page, row);
            return { success: true, strategy: 'pass3-search' };
          }
        }
        break;
      }
    }

    return { success: false, strategy: 'no-match' };
  }

  // ── Click بعدی ──────────────────────────────────────────────────
  async clickNext() {
    await randomDelay();
    let page = browserService.getPage();

    const buttons = await page.$$('button');
    for (const btn of buttons) {
      const txt = await page.evaluate((e) => (e.textContent || '').trim(), btn);
      if (txt.includes('بعدی')) {
        const isVisible = await page.evaluate((e) => e.offsetParent !== null && !e.disabled, btn);
        if (isVisible) {
          log('clicking بعدی...');
          await this._cdpClick(page, btn);
          await sleep(3000);
          // Re-acquire page reference after navigation
          try { await browserService.reacquirePage(); } catch {}
          return true;
        }
      }
    }
    warn('بعدی button not found');
    return false;
  }

  // ── Page 3: Price ───────────────────────────────────────────────
  async fillPricePage(product) {
    try { await browserService.reacquirePage(); } catch {}
    log('page 3: price');
    const page = browserService.getPage();

    const PRICE_SELECTORS = [
      '#Price___Input', '#Price input',
      '#price___Input', '#price input',
      'input[name="Price"]', 'input[name="price"]',
      'input[placeholder*="قیمت"]', 'input[placeholder*="تومان"]',
      'input[type="number"]', 'input[inputmode="numeric"]',
    ];

    let priceEl = null;
    for (let w = 0; w < 60; w++) {
      for (const sel of PRICE_SELECTORS) {
        priceEl = await page.$(sel).catch(() => null);
        if (priceEl) break;
      }
      if (priceEl) break;
      await this._checkCancel();
      await sleep(500);
    }

    if (!priceEl) {
      warn('price field not found');
      this._results.push({ field: 'price', status: 'not-found' });
      return;
    }

    const existing = await page.evaluate((e) => (e.value || '').trim(), priceEl);
    if (product.price) {
      const existingNum = parseInt(existing.replace(/[^\d]/g, ''), 10);
      const targetNum = parseInt(String(product.price).replace(/[^\d]/g, ''), 10);
      if (existingNum === targetNum) {
        log('✅ price auto-filled by Divar AI');
        this._results.push({ field: 'price', status: 'auto-filled-match' });
        return;
      }
      await priceEl.click({ clickCount: 3 });
      await priceEl.type(String(product.price), { delay: 50 });
      await sleep(300);
      log('✅ price filled:', product.price);
      this._results.push({ field: 'price', status: 'filled' });
    } else if (existing) {
      log('✅ price auto-filled:', existing);
      this._results.push({ field: 'price', status: 'auto-filled' });
    } else {
      this._results.push({ field: 'price', status: 'empty-manual' });
    }
  }

  // ── Generate description ────────────────────────────────────────
  generateDescription(product) {
    const parts = [];
    const attrs = product.attributes || {};

    if (product.description && product.description.length > 10) {
      parts.push(product.description);
    }

    const specs = [];
    if (attrs.brand || attrs.model) specs.push(`${attrs.brand || ''} ${attrs.model || ''}`.trim());
    if (attrs.year) specs.push(`مدل ${attrs.year}`);
    if (attrs.mileage) specs.push(`کارکرد ${attrs.mileage} کیلومتر`);
    if (attrs.color) specs.push(`رنگ ${attrs.color}`);
    if (attrs.gearbox) specs.push(attrs.gearbox);
    if (attrs.fuel) specs.push(attrs.fuel);
    if (attrs.bodyStatus) specs.push(attrs.bodyStatus);
    if (product.price) specs.push(`قیمت ${new Intl.NumberFormat('fa-IR').format(product.price)} تومان`);

    if (specs.length) parts.push('مشخصات: ' + specs.join(' | '));

    const result = parts.join('. ');
    return result.length > 10 ? result : product.description || '';
  }

  // ── Summary log ─────────────────────────────────────────────────
  logSummary() {
    const filled = this._results.filter(r => r.status === 'filled' || r.status === 'already-set' || r.status === 'auto-filled-match').length;
    const failed = this._results.filter(r => r.status !== 'filled' && r.status !== 'already-set' && r.status !== 'auto-filled-match' && r.status !== 'manual' && r.status !== 'auto-filled').length;
    log(`📊 Summary: ${filled} filled, ${failed} failed`);
    for (const r of this._results) {
      const icon = (r.status === 'filled' || r.status === 'already-set' || r.status === 'auto-filled-match') ? '✅' : '❌';
      log(`  ${icon} ${r.field}: ${r.status}${r.strategy ? ` (${r.strategy})` : ''}`);
    }
  }

  // ── Internal: fill a text field ─────────────────────────────────
  async _tryFillField(page, selector, value, fieldName) {
    if (!value) return false;
    try {
      const el = await page.$(selector);
      if (!el) {
        warn(`${fieldName}: element not found (${selector})`);
        this._results.push({ field: fieldName, status: 'not-found' });
        return false;
      }

      // Clear field completely: click → select all → delete
      await el.click();
      await sleep(100);
      await page.keyboard.down('Control');
      await page.keyboard.press('a');
      await page.keyboard.up('Control');
      await sleep(50);
      await page.keyboard.press('Backspace');
      await sleep(100);

      // Verify field is empty
      const currentVal = await page.evaluate((e) => (e.value || '').trim(), el);
      if (currentVal) {
        // Force clear via evaluate
        await page.evaluate((e) => { e.value = ''; }, el);
        await sleep(100);
      }

      // Type the value
      await el.type(String(value), { delay: 20 });
      await sleep(200);

      // Verify what was typed
      const finalVal = await page.evaluate((e) => (e.value || '').trim(), el);
      log(`✅ ${fieldName}:`, finalVal.substring(0, 50));
      this._results.push({ field: fieldName, status: 'filled', value: finalVal });
      return true;
    } catch (err) {
      warn(`${fieldName}: fill error:`, err.message);
      this._results.push({ field: fieldName, status: 'error', error: err.message });
      return false;
    }
  }

  // ── Internal: upload images ─────────────────────────────────────
  async _uploadImages(page, product) {
    try {
      const fileInput = await page.$('input[type="file"]');
      if (!fileInput) {
        warn('file input not found');
        this._results.push({ field: 'images', status: 'not-found' });
        return;
      }

      const imagePaths = [];
      for (const img of (product.images || [])) {
        if (img.startsWith('/images/')) {
          const absPath = join(PROJECT_ROOT, 'data', 'images', img.replace('/images/', ''));
          if (existsSync(absPath)) imagePaths.push(absPath);
        } else if (img.startsWith('http')) {
          warn(`remote image skipped: ${img}`);
        } else if (existsSync(img)) {
          imagePaths.push(img);
        }
      }

      if (imagePaths.length > 0) {
        await fileInput.uploadFile(...imagePaths);
        log(`✅ uploaded ${imagePaths.length} images`);
        this._results.push({ field: 'images', status: 'uploaded', count: imagePaths.length });
      } else {
        warn('no local image files found');
        this._results.push({ field: 'images', status: 'no-local-files' });
      }
    } catch (err) {
      warn('image upload error:', err.message);
      this._results.push({ field: 'images', status: 'error', error: err.message });
    }
  }

  // ── Internal: wait for element ──────────────────────────────────
  async _waitForElement(page, selectors, timeoutMs = 10000) {
    const interval = 500;
    const maxAttempts = Math.ceil(timeoutMs / interval);
    for (let i = 0; i < maxAttempts; i++) {
      for (const sel of selectors) {
        const el = await page.$(sel).catch(() => null);
        if (el) return el;
      }
      await sleep(interval);
    }
    warn('element wait timeout:', selectors.join(', '));
    return null;
  }
}

const automator = new DivarAutomator();
export default automator;
