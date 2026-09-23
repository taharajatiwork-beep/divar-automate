// ─── Browser Service — Puppeteer-core + Chrome ──────────────────────
// Launches Chrome with divar-profile. User logs in ONCE.
// Health-check pings Chrome every 10s. Detects real disconnections.

import { spawn, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request as httpRequest } from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const PROFILE_DIR = join(PROJECT_ROOT, 'divar-profile');
const DEBUG_PORT = 9222;
const DIVAR_AD_URL = 'https://divar.ir/new';

// ─── Find Chrome ──────────────────────────────────────────────────────
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
];

function findChrome() {
  for (const p of CHROME_PATHS) {
    if (existsSync(p)) return p;
  }
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    const found = execSync(`${which} chrome`, { encoding: 'utf-8' }).trim().split('\n')[0];
    if (found && existsSync(found)) return found;
  } catch {}
  return null;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function isPortInUse(port) {
  return new Promise((resolve) => {
    const req = httpRequest(`http://127.0.0.1:${port}/json/version`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
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
    this._chromeProcess = null;
    this._ready = false;
    this._healthInterval = null;
  }

  get ready() { return this._ready; }

  async launch() {
    if (this._browser) {
      // Verify it's still alive before reusing
      const alive = await this._ping();
      if (alive) {
        console.log('[browser] already connected');
        return this;
      }
      // Stale connection — reset
      console.log('[browser] stale connection detected, reconnecting...');
      this._cleanup();
    }

    const chromePath = findChrome();
    if (!chromePath) throw new Error('Chrome not found. Install Google Chrome.');

    // Check if Chrome is already on debug port
    const portStatus = await isPortInUse(DEBUG_PORT);
    if (!portStatus.inUse) {
      console.log('[browser] launching Chrome (divar-profile)...');
      this._chromeProcess = spawn(chromePath, [
        `--remote-debugging-port=${DEBUG_PORT}`,
        `--user-data-dir=${PROFILE_DIR}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1280,900',
      ], { stdio: 'ignore', detached: false });

      this._chromeProcess.on('error', (err) => {
        console.error('[browser] Chrome error:', err.message);
        this._ready = false;
      });
      this._chromeProcess.on('exit', () => {
        console.log('[browser] Chrome process exited');
        this._markDisconnected();
      });

      console.log('[browser] waiting 5s for Chrome...');
      await sleep(5000);
    } else {
      console.log('[browser] Chrome already on port ' + DEBUG_PORT);
    }

    // Connect puppeteer-core
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
        else throw new Error('Cannot connect to Chrome on port ' + DEBUG_PORT + ': ' + err.message);
      }
    }

    // Listen for disconnection
    this._browser.on('disconnected', () => {
      console.log('[browser] disconnected event fired');
      this._markDisconnected();
    });

    // Find/create a suitable page (not the web app itself)
    await this._acquirePage();

    this._ready = true;
    this._startHealthCheck();
    console.log('[browser] ready — URL: ' + this._page.url());
    return this;
  }

  // Always create a NEW tab for automation — never touch web app tabs
  async _acquirePage() {
    this._page = await this._browser.newPage();
    console.log('[browser] created new automation tab');
  }

  // ── Health check: ping Chrome every 10s ──────────────────────
  _startHealthCheck() {
    this._stopHealthCheck();
    this._healthInterval = setInterval(async () => {
      const alive = await this._ping();
      if (!alive && this._ready) {
        console.log('[browser] health check failed — marking disconnected');
        this._markDisconnected();
      }
    }, 10000);
  }

  _stopHealthCheck() {
    if (this._healthInterval) {
      clearInterval(this._healthInterval);
      this._healthInterval = null;
    }
  }

  async _ping() {
    if (!this._browser) return false;
    try {
      // Try to list pages — lightweight CDP call
      const pages = await this._browser.pages();
      return pages.length >= 0; // If it doesn't throw, we're alive
    } catch {
      return false;
    }
  }

  _markDisconnected() {
    this._ready = false;
    this._page = null;
    // Don't null _browser — might reconnect
    this._stopHealthCheck();
  }

  _cleanup() {
    this._stopHealthCheck();
    try { this._browser?.disconnect(); } catch {}
    this._browser = null;
    this._page = null;
    this._ready = false;
  }

  // ── Getters ──────────────────────────────────────────────────
  async getStatus() {
    const alive = await this._ping();
    if (!alive && this._ready) {
      this._markDisconnected();
    }
    return {
      ready: alive,
      port: DEBUG_PORT,
      currentUrl: this._page?.url?.() || null,
    };
  }

  getPage() {
    if (!this._page) throw new Error('مرورگر متصل نیست. ابتدا دکمه راه‌اندازی مرورگر را بزنید.');
    return this._page;
  }

  // Re-acquire page reference after navigation (fixes detached frame)
  async reacquirePage() {
    if (!this._browser) throw new Error('Browser not connected.');
    const pages = await this._browser.pages();
    // Find our automation tab (the one with divar in URL, or the newest)
    for (const p of pages) {
      if (p.url().includes('divar.ir') && !p.url().includes('localhost')) {
        this._page = p;
        return p;
      }
    }
    // Use last non-localhost page
    for (const p of pages.reverse()) {
      if (!p.url().includes('localhost:5174') && !p.url().startsWith('chrome://')) {
        this._page = p;
        return p;
      }
    }
    // Fallback: last page
    this._page = pages[pages.length - 1] || this._page;
    return this._page;
  }

  // ── Actions ──────────────────────────────────────────────────
  async navigate(url) {
    const page = this.getPage();
    console.log('[browser] navigating to: ' + url);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {
      console.log('[browser] navigation timeout — continuing');
    });
    await sleep(1000);
    // Re-acquire page reference (navigation may have changed the frame)
    try { await this.reacquirePage(); } catch {}
    return { url: this._page?.url?.() || page.url() };
  }

  async openAdForm() {
    return this.navigate(DIVAR_AD_URL);
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

  close() {
    this._stopHealthCheck();
    try { this._browser?.disconnect(); } catch {}
    this._browser = null;
    this._page = null;
    this._ready = false;
    console.log('[browser] disconnected');
  }

  // ── Force reconnect (for "reconnect" button) ────────────────
  async reconnect() {
    console.log('[browser] force reconnecting...');
    this._cleanup();
    return this.launch();
  }
}

const instance = new BrowserService();
export default instance;
