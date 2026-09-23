// ─── Browser Service — Puppeteer-core + headed Chrome ──────────────────
// Launches a real Chrome with remote debugging, connects puppeteer-core.
// Singleton pattern: launch() once, then getPage() / evaluate() / etc.
// Puppeteer .click() uses Input.dispatchMouseEvent → isTrusted=true.

import { spawn, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const PROFILE_DIR = join(PROJECT_ROOT, 'divar-profile');
const DEBUG_PORT = 9222;

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
];

const CHROME_FLAGS = [
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=${PROFILE_DIR}`,
  '--no-first-run',
  '--no-default-browser-check',
  "--disable-blink-features=AutomationControlled",
  '--window-size=1280,900',
];

// ─── Helpers ─────────────────────────────────────────────────────────

function findChrome() {
  // Check PATH first
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    const found = execSync(`${which} chrome`, { encoding: 'utf-8' }).trim().split('\n')[0];
    if (found && existsSync(found)) return found;
  } catch { /* not in PATH */ }

  for (const p of CHROME_PATHS) {
    if (existsSync(p)) return p;
  }
  return null;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
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
  get port() { return DEBUG_PORT; }

  async launch() {
    if (this._browser) {
      console.log('[browser] already connected');
      return this;
    }

    const chromePath = findChrome();
    if (!chromePath) {
      throw new Error('Chrome not found. Install Google Chrome or set CHROME_PATH env var.');
    }
    console.log(`[browser] Chrome: ${chromePath}`);

    // Spawn Chrome with remote debugging
    this._chromeProcess = spawn(chromePath, CHROME_FLAGS, {
      stdio: 'ignore',
      detached: false,
      windowsHide: false,
    });
    this._chromeProcess.on('error', (err) => {
      console.error('[browser] Chrome process error:', err.message);
      this._ready = false;
    });
    this._chromeProcess.on('exit', (code) => {
      console.log(`[browser] Chrome exited with code ${code}`);
      this._ready = false;
      this._browser = null;
      this._page = null;
    });

    // Wait for Chrome to start and open debugging port
    console.log('[browser] waiting 3s for Chrome to start...');
    await sleep(3000);

    // Connect puppeteer-core
    let puppeteer;
    try {
      puppeteer = await import('puppeteer-core');
    } catch {
      throw new Error('puppeteer-core not installed. Run: npm install puppeteer-core');
    }

    const browserURL = `http://127.0.0.1:${DEBUG_PORT}`;
    console.log(`[browser] connecting to ${browserURL}...`);

    this._browser = await puppeteer.default.connect({
      browserURL,
      defaultViewport: { width: 1280, height: 900 },
    });

    // Find or create a page
    const pages = await this._browser.pages();
    this._page = pages[0] || await this._browser.newPage();

    // Stealth: inject webdriver=false on every new document
    await this._page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    // Navigate to Divar new-ad form
    console.log('[browser] navigating to divar.ir/new...');
    await this._page.goto('https://divar.ir/new', { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {
      console.log('[browser] initial navigation timeout — continuing anyway');
    });

    this._ready = true;
    console.log('[browser] ready');
    return this;
  }

  getPage() {
    if (!this._page) throw new Error('Browser not launched. Call launch() first.');
    return this._page;
  }

  async evaluate(fn, ...args) {
    return this.getPage().evaluate(fn, ...args);
  }

  async click(selector, options) {
    await this.getPage().click(selector, options);
  }

  async type(selector, text, options) {
    await this.getPage().type(selector, text, options);
  }

  async waitForSelector(selector, options) {
    return this.getPage().waitForSelector(selector, options);
  }

  async close() {
    if (this._browser) {
      try {
        // Disconnect puppeteer (don't close Chrome — user keeps their profile)
        this._browser.disconnect();
      } catch { /* ignore */ }
    }
    if (this._chromeProcess && !this._chromeProcess.killed) {
      this._chromeProcess.kill();
    }
    this._browser = null;
    this._page = null;
    this._chromeProcess = null;
    this._ready = false;
    console.log('[browser] closed');
  }
}

const instance = new BrowserService();
export default instance;
