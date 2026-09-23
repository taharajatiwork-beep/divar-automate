// ─── Divar Automator — Puppeteer-based form filling ────────────────────
// Replaces extension/content.js logic. Uses browser-service.js to control
// Chrome via puppeteer-core (all clicks are trusted via Input.dispatchMouseEvent).
// NEVER clicks submit (ثبت اطلاعات) — operator does that.

import browserService from './browser-service.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const randomDelay = () => sleep(300 + Math.random() * 900);
const LOG = '[automator]';
const log = (...a) => console.log(LOG, ...a);
const warn = (...a) => console.warn(LOG, ...a);

// ─── Text normalization (Persian → Latin, strip zero-width chars) ───
function normalizeOption(value) {
  return String(value || '')
    .replace(/[۰-۹]/g, (c) => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(c)])
    .replace(/[\u200c\u200f\u200e]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// ─── Divar Automator ────────────────────────────────────────────────

class DivarAutomator {
  constructor() {
    this._results = [];
  }

  // ── Main entry: orchestrate all 4 pages ──────────────────────────
  async fillForm(product) {
    if (!browserService.ready) {
      throw new Error('Browser not launched. Call POST /api/browser/launch first.');
    }

    this._results = [];
    log(`starting form fill for: ${product.title} (${product.id})`);

    try {
      await this.fillPage1(product);
      await this.clickNext();

      await this.fillPage2(product);
      await this.clickNext();

      await this.fillPricePage(product);
      await this.clickNext();

      log('arrived at page 4 (contact info) — operator finishes manually');
      this._results.push({ page: 4, field: 'contact', status: 'manual' });
    } catch (err) {
      warn('form fill error:', err.message);
      this._results.push({ page: 'error', field: 'global', status: 'failed', error: err.message });
    }

    this.logSummary();
    return this._results;
  }

  // ── Page 1: Title + Description + Images ─────────────────────────
  async fillPage1(product) {
    log('page 1: title + description + images');
    const page = browserService.getPage();

    // Wait for title field
    await page.waitForSelector('#Title, [name="Title"]', { timeout: 15000 }).catch(() => null);

    // Title
    const titleSel = '#Title, [name="Title"]';
    await this._tryFillField(page, titleSel, product.title, 'title');

    // Description — generate comprehensive text for Divar AI
    const desc = this.generateDescription(product);
    const descSel = '#Description, [name="Description"]';
    await this._tryFillField(page, descSel, desc, 'description');

    // Images — upload via file input
    if (product.images && product.images.length > 0) {
      await this._uploadImages(page, product);
    }
  }

  // ── Page 2: Car select dropdowns + usage input ──────────────────
  async fillPage2(product) {
    log('page 2: car fields');

    const page = browserService.getPage();
    const attrs = product.attributes || {};

    // Wait for select buttons to appear (lazy-loaded)
    await this._waitForElement(page, ['#year___Input', '#color___Input', '[id*="year"]'], 15000);

    // Brand/model first (different component — kt-action-field)
    const brandVal = attrs.model || attrs.brand;
    if (brandVal) {
      await this.openSelectModal(page, 'brand_model', String(brandVal), 'برند و مدل');
    }

    // Select dropdowns in order
    const selects = [
      { fieldId: 'fuel_type', value: attrs.fuel || 'بنزین' },
      { fieldId: 'year',      value: attrs.year },
      { fieldId: 'color',     value: attrs.color },
      { fieldId: 'body_status', value: attrs.bodyStatus || 'سالم و بی\u200cخط و خش' },
      { fieldId: 'gearbox',   value: attrs.gearbox },
    ];

    for (const s of selects) {
      if (!s.value) continue;
      await this.openSelectModal(page, s.fieldId, String(s.value));
    }

    // Mileage/usage input
    const mileage = attrs.mileage;
    if (mileage) {
      const usageSelectors = ['#usage___Input', '[id*="usage"]', '[id*="mileage"]', 'input[type="number"]'];
      await this._tryFillField(page, usageSelectors.join(', '), String(mileage), 'mileage');
    }
  }

  // ── Open a select modal and pick an option ──────────────────────
  async openSelectModal(page, fieldId, optionText, labelText) {
    labelText = labelText || fieldId;
    await randomDelay();

    // Check if already set
    const triggerSelectors = [
      `#${CSS.escape(fieldId)}___Input`,
      `#${CSS.escape(fieldId)} button`,
      `[id*="${fieldId}"] button`,
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

    // Check if already has the right value
    const currentText = await page.evaluate((el) => (el.innerText || '').trim(), trigger);
    if (normalizeOption(currentText) === normalizeOption(optionText) && currentText !== 'انتخاب') {
      log(`✅ ${labelText} already set: ${currentText}`);
      this._results.push({ field: fieldId, status: 'already-set' });
      return true;
    }

    // Click trigger to open modal
    await trigger.click();
    await sleep(700);

    // Wait for modal to appear
    const modalSelectors = [
      '.single-select-modal.kt-modal',
      '.kt-modal.kt-modal--scrollable',
      '.kt-modal',
    ];
    let modal = null;
    for (const sel of modalSelectors) {
      modal = await page.$(sel).catch(() => null);
      if (modal) break;
    }
    if (!modal) {
      warn(`${labelText}: modal not found`);
      this._results.push({ field: fieldId, status: 'modal-not-found' });
      return false;
    }

    // Find and click the matching option (3-pass)
    const result = await this.findAndClickOption(page, modal, optionText);
    await sleep(700);

    if (result.success) {
      log(`✅ ${labelText}: ${optionText} (${result.strategy})`);
      this._results.push({ field: fieldId, status: 'filled', strategy: result.strategy });
    } else {
      warn(`${labelText}: option not found — ${optionText}`);
      this._results.push({ field: fieldId, status: 'no-match' });
      // Close modal by clicking trigger again
      await trigger.click().catch(() => {});
    }
    return result.success;
  }

  // ── 3-pass option matching: exact → brand-only → show-all+search ─
  async findAndClickOption(page, modal, optionText) {
    const wanted = normalizeOption(optionText);
    const brandWord = normalizeOption((optionText.split(/\s+/)[0] || ''));

    const OPTION_TITLE_SELS = [
      '.start__title-_UBPtX',
      'p[class*="title"]',
      '.kt-base-row__start p',
      '.kt-base-row p',
      'p',
    ];

    async function getOptionTitle(row) {
      for (const sel of OPTION_TITLE_SELS) {
        const el = await row.$(sel);
        if (el) {
          const text = await page.evaluate((e) => e.textContent?.trim(), el);
          if (text) return { element: el, text };
        }
      }
      // Fallback: use row text
      const rowText = await page.evaluate((e) => e.textContent?.trim(), row);
      return { element: row, text: rowText || '' };
    }

    // Pass 1: exact/fuzzy match
    const rows = await modal.$$('.kt-base-row');
    log(`matching: wanted="${wanted}" brandWord="${brandWord}" rows=${rows.length}`);

    for (const row of rows) {
      const { text } = await getOptionTitle(row);
      const norm = normalizeOption(text);
      if (norm.includes(wanted) || wanted.includes(norm)) {
        await row.click();
        return { success: true, strategy: 'pass1-exact' };
      }
    }

    // Pass 2: brand-only match
    if (brandWord.length > 2) {
      for (const row of rows) {
        const { text } = await getOptionTitle(row);
        const norm = normalizeOption(text);
        if (norm.includes(brandWord)) {
          await row.click();
          return { success: true, strategy: 'pass2-brand' };
        }
      }
    }

    // Pass 3: click "نمایش همه موارد" then search
    const showAllBtns = await modal.$$('[role="button"], .rawButton-W5tTZw, button');
    for (const btn of showAllBtns) {
      const txt = await page.evaluate((e) => e.textContent?.trim(), btn);
      if (txt && /همه/.test(txt)) {
        await btn.click();
        await sleep(1000);

        // Search input
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

        // Re-check rows after search
        const newRows = await modal.$$('.kt-base-row');
        for (const row of newRows) {
          const { text } = await getOptionTitle(row);
          const norm = normalizeOption(text);
          if (norm.includes(wanted) || wanted.includes(norm) || norm.includes(brandWord)) {
            await row.click();
            return { success: true, strategy: 'pass3-search' };
          }
        }
        break;
      }
    }

    return { success: false, strategy: 'no-match' };
  }

  // ── Click "بعدی" (Next) button ──────────────────────────────────
  async clickNext() {
    await randomDelay();
    const page = browserService.getPage();

    const buttons = await page.$$('button');
    for (const btn of buttons) {
      const txt = await page.evaluate((e) => (e.textContent || '').trim(), btn);
      if (txt.includes('بعدی')) {
        const isVisible = await page.evaluate((e) => e.offsetParent !== null && !e.disabled, btn);
        if (isVisible) {
          log('clicking بعدی...');
          await btn.click();
          await sleep(1500); // wait for page transition
          return true;
        }
      }
    }
    warn('بعدی button not found');
    return false;
  }

  // ── Page 3: Price field ─────────────────────────────────────────
  async fillPricePage(product) {
    log('page 3: price');
    const page = browserService.getPage();

    const PRICE_SELECTORS = [
      '#Price___Input', '#Price input',
      '#price___Input', '#price input',
      'input[name="Price"]', 'input[name="price"]',
      'input[placeholder*="قیمت"]', 'input[placeholder*="تومان"]',
      'input[type="number"]', 'input[inputmode="numeric"]',
    ];

    // Wait up to 120s for price field
    let priceEl = null;
    for (let w = 0; w < 240; w++) {
      for (const sel of PRICE_SELECTORS) {
        priceEl = await page.$(sel).catch(() => null);
        if (priceEl) break;
      }
      if (priceEl) break;
      await sleep(500);
    }

    if (!priceEl) {
      warn('price field not found after 120s');
      this._results.push({ field: 'price', status: 'not-found' });
      return;
    }

    // Check existing value (Divar AI might auto-fill from description)
    const existing = await page.evaluate((e) => (e.value || '').trim(), priceEl);
    if (product.price) {
      const existingNum = parseInt(existing.replace(/[^\d]/g, ''), 10);
      const targetNum = parseInt(String(product.price).replace(/[^\d]/g, ''), 10);
      if (existingNum === targetNum) {
        log('✅ price auto-filled by Divar AI, matches target');
        this._results.push({ field: 'price', status: 'auto-filled-match' });
        return;
      }
      // Override with our price
      await priceEl.click({ clickCount: 3 }); // select all
      await priceEl.type(String(product.price), { delay: 50 });
      await sleep(300);
      log('✅ price filled:', product.price);
      this._results.push({ field: 'price', status: 'filled' });
    } else if (existing) {
      log('✅ price auto-filled (no prefill price):', existing);
      this._results.push({ field: 'price', status: 'auto-filled' });
    } else {
      this._results.push({ field: 'price', status: 'empty-manual' });
    }
  }

  // ── Generate description with specs (for Divar AI extraction) ───
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
      await el.click({ clickCount: 3 });
      await el.type(String(value), { delay: 20 });
      await sleep(200);
      log(`✅ ${fieldName}:`, String(value).substring(0, 50));
      this._results.push({ field: fieldName, status: 'filled' });
      return true;
    } catch (err) {
      warn(`${fieldName}: fill error:`, err.message);
      this._results.push({ field: fieldName, status: 'error', error: err.message });
      return false;
    }
  }

  // ── Internal: upload images via file input ──────────────────────
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
        // Convert local path (e.g. /images/P001_01.jpg) to absolute path
        const { join, dirname } = await import('node:path');
        const { fileURLToPath } = await import('node:url');
        const { existsSync } = await import('node:fs');

        const __dir = dirname(fileURLToPath(import.meta.url));
        const projectRoot = join(__dir, '..');

        if (img.startsWith('/images/')) {
          const absPath = join(projectRoot, 'data', 'images', img.replace('/images/', ''));
          if (existsSync(absPath)) imagePaths.push(absPath);
        } else if (img.startsWith('http')) {
          // Download to temp, then use
          // For now, skip remote images — user provides local paths
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

  // ── Internal: wait for any of several selectors ─────────────────
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
