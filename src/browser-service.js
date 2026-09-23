// ─── Browser Service — Puppeteer-core + Chrome ──────────────────────
// Launches a SEPARATE Chrome window with its own profile (divar-profile/).
// User logs into Divar ONCE in this window — session persists.
// NEVER kills existing Chrome windows.
// Puppeteer connects via CDP — all clicks are isTrusted=true.

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

// ─── Helpers ─────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

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
    this._chromeProcess = null;
    this._ready = false;
  }

  get ready() { return this._ready; }

  async launch() {
    if (this._browser) {
      console.log('[browser] already connected');
      return this;
    }

    const chromePath = findChrome();
    if (!chromePath) {
      throw new Error('Chrome not found. Install Google Chrome.');
    }

    // Check if Chrome is already on debug port (e.g. from start.bat)
    const portStatus = await isPortInUse(DEBUG_PORT);
    if (!portStatus.inUse) {
      // Launch a SEPARATE Chrome window with divar-profile
      // This does NOT interfere with user's main Chrome
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
        this._ready = false;
        this._browser = null;
        this._page = null;
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

    // Find the page
    const pages = await this._browser.pages();
    this._page = pages[0] || await this._browser.newPage();

    this._ready = true;
    console.log('[browser] ready — URL: ' + this._page.url());
    return this;
  }

  async navigate(url) {
    const page = this.getPage();
    console.log('[browser] navigating to: ' + url);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {
      console.log('[browser] navigation timeout — continuing');
    });
    await sleep(1000);
    return { url: page.url() };
  }

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
      try { this._browser.disconnect(); } catch {}
    }
    this._browser = null;
    this._page = null;
    this._ready = false;
    console.log('[browser] disconnected');
  }
}

const instance = new BrowserService();
export default instance;
