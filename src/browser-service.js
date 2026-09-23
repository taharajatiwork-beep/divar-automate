// ─── Browser Service — Puppeteer-core + Chrome ──────────────────────
// Connects to user's DEFAULT Chrome profile (already logged into Divar).
// Requires Chrome to be launched with --remote-debugging-port=9222
// (start.bat handles this automatically).
//
// Flow:
//   1. start.bat launches Chrome with default profile + debug port
//   2. browser-service connects via Puppeteer
//   3. Divar session/cookies are already active (no re-login needed)

import { request as httpRequest } from 'node:http';

const DEBUG_PORT = 9222;
const DIVAR_AD_URL = 'https://divar.ir/new';

// ─── Helpers ─────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Check if Chrome is already running on debug port
async function isPortInUse(port) {
  return new Promise((resolve) => {
    const req = httpRequest(`http://127.0.0.1:${port}/json/version`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const info = JSON.parse(data);
          resolve({ inUse: true, browser: info.Browser || 'unknown' });
        } catch {
          resolve({ inUse: true, browser: 'unknown' });
        }
      });
    });
    req.on('error', () => resolve({ inUse: false }));
    req.setTimeout(2000, () => { req.destroy(); resolve({ inUse: false }); });
  });
}

// ─── Singleton ───────────────────────────────────────────────────────

class BrowserService {
  constructor() {
    this._browser = null;
    this._page = null;
    this._ready = false;
  }

  get ready() { return this._ready; }

  async launch() {
    if (this._browser) {
      console.log('[browser] already connected');
      return this;
    }

    // Step 1: Check if Chrome is running on debug port
    const portStatus = await isPortInUse(DEBUG_PORT);
    if (!portStatus.inUse) {
      throw new Error(
        'Chrome not found on debug port ' + DEBUG_PORT + '.\n' +
        'Run start.bat first, or launch Chrome with:\n' +
        'chrome.exe --remote-debugging-port=9222'
      );
    }
    console.log('[browser] found Chrome on port ' + DEBUG_PORT);

    // Step 2: Connect puppeteer-core
    let puppeteer;
    try {
      puppeteer = await import('puppeteer-core');
    } catch {
      throw new Error('puppeteer-core not installed. Run: npm install puppeteer-core');
    }

    const browserURL = `http://127.0.0.1:${DEBUG_PORT}`;

    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        console.log('[browser] connecting (attempt ' + attempt + ')...');
        this._browser = await puppeteer.default.connect({
          browserURL,
          defaultViewport: { width: 1280, height: 900 },
        });
        console.log('[browser] connected!');
        break;
      } catch (err) {
        console.warn('[browser] attempt ' + attempt + ' failed: ' + err.message);
        if (attempt < 5) await sleep(2000);
        else throw new Error('Cannot connect to Chrome: ' + err.message);
      }
    }

    // Step 3: Find the page (or create one)
    const pages = await this._browser.pages();
    this._page = pages[0] || await this._browser.newPage();

    this._ready = true;
    console.log('[browser] ready — URL: ' + this._page.url());
    return this;
  }

  // Navigate to a URL
  async navigate(url) {
    const page = this.getPage();
    console.log('[browser] navigating to: ' + url);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {
      console.log('[browser] navigation timeout — continuing');
    });
    await sleep(1000);
    return { url: page.url() };
  }

  // Navigate to Divar ad form
  async openAdForm() {
    return this.navigate(DIVAR_AD_URL);
  }

  getStatus() {
    return {
      ready: this._ready,
      port: DEBUG_PORT,
      currentUrl: this._page?.url() || null,
    };
  }

  getPage() {
    if (!this._page) throw new Error('Browser not launched. Call launch() first.');
    return this._page;
  }

  async evaluate(fn, ...args) {
    return this.getPage().evaluate(fn, ...args);
  }

  async click(selector, options) {
    return this.getPage().click(selector, options);
  }

  async type(selector, text, options) {
    return this.getPage().type(selector, text, options);
  }

  async waitForSelector(selector, options) {
    return this.getPage().waitForSelector(selector, options);
  }

  async close() {
    if (this._browser) {
      try { this._browser.disconnect(); } catch { /* ignore */ }
    }
    this._browser = null;
    this._page = null;
    this._ready = false;
    console.log('[browser] disconnected');
  }
}

const instance = new BrowserService();
export default instance;
