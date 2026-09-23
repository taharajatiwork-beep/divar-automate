// ─── Browser Service — Puppeteer-core + headed Chrome ──────────────────
// Launches a real Chrome with remote debugging, connects puppeteer-core.
// Singleton pattern: launch() once, then getPage() / evaluate() / etc.
// Puppeteer .click() uses Input.dispatchMouseEvent → isTrusted=true.
//
// Chrome Login Flow:
//   1. Check for existing Chrome on debug port
//   2. If found, connect and verify profile
//   3. If not found, launch Chrome with correct profile
//   4. Navigate to divar.ir — user logs in manually (first time)
//   5. Login state persists in divar-profile/ directory

import { spawn, execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request as httpRequest } from 'node:http';

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

// Clean stale lock files from profile dir
function cleanProfileLocks() {
  try {
    if (!existsSync(PROFILE_DIR)) return;
    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
    for (const f of lockFiles) {
      const p = join(PROFILE_DIR, f);
      if (existsSync(p)) {
        rmSync(p, { force: true });
        console.log(`[browser] removed stale lock: ${f}`);
      }
    }
  } catch (e) {
    console.warn('[browser] could not clean lock files:', e.message);
  }
}

// Check if a port is already in use
function isPortInUse(port) {
  return new Promise((resolve) => {
    const req = httpRequest(`http://127.0.0.1:${port}/json/version`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const info = JSON.parse(data);
          resolve({ inUse: true, browser: info.Browser || 'unknown', wsDebugger: info.webSocketDebuggerUrl || '' });
        } catch {
          resolve({ inUse: true, browser: 'unknown', wsDebugger: '' });
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
    this._launchedByUs = false;
    this._loginRequired = false;
  }

  get ready() { return this._ready; }
  get port() { return DEBUG_PORT; }
  get loginRequired() { return this._loginRequired; }
  get profileDir() { return PROFILE_DIR; }

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

    // Step 1: Check if Chrome is already running on debug port
    const portStatus = await isPortInUse(DEBUG_PORT);
    let needToLaunch = !portStatus.inUse;

    if (portStatus.inUse) {
      console.log(`[browser] Chrome already on port ${DEBUG_PORT}: ${portStatus.browser}`);
      // Check if it's using our profile
      if (portStatus.wsDebugger) {
        console.log(`[browser] WebSocket: ${portStatus.wsDebugger}`);
      }
    } else {
      // Clean stale lock files before launching
      cleanProfileLocks();
    }

    // Step 2: Connect puppeteer-core
    let puppeteer;
    try {
      puppeteer = await import('puppeteer-core');
    } catch {
      throw new Error('puppeteer-core not installed. Run: npm install puppeteer-core');
    }

    const browserURL = `http://127.0.0.1:${DEBUG_PORT}`;
    const maxRetries = 5;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (needToLaunch && attempt === 1) {
        console.log('[browser] launching Chrome with remote debugging...');
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
        this._launchedByUs = true;
        console.log('[browser] waiting 4s for Chrome to start...');
        await sleep(4000);
      }

      try {
        console.log(`[browser] connecting to ${browserURL} (attempt ${attempt})...`);
        this._browser = await puppeteer.default.connect({
          browserURL,
          defaultViewport: { width: 1280, height: 900 },
        });
        console.log('[browser] connected successfully');
        break;
      } catch (err) {
        lastError = err;
        console.warn(`[browser] connection attempt ${attempt} failed: ${err.message}`);
        if (attempt < maxRetries) {
          await sleep(2000);
          // If first launch failed, try again with a fresh launch
          if (needToLaunch && attempt === 2) {
            console.log('[browser] retrying Chrome launch...');
            cleanProfileLocks();
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
            this._launchedByUs = true;
            await sleep(4000);
          }
        }
      }
    }

    if (!this._browser) {
      throw new Error(`Failed to connect to Chrome after ${maxRetries} attempts: ${lastError?.message || 'unknown error'}`);
    }

    // Step 3: Find or create a page
    const pages = await this._browser.pages();
    this._page = pages[0] || await this._browser.newPage();

    // Stealth: inject webdriver=false on every new document
    await this._page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    // Step 4: Check current page and navigate to Divar
    const currentUrl = this._page.url();
    console.log(`[browser] current URL: ${currentUrl}`);

    if (!currentUrl.includes('divar.ir')) {
      console.log('[browser] navigating to divar.ir/new...');
      await this._page.goto('https://divar.ir/new', { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {
        console.log('[browser] initial navigation timeout — continuing anyway');
      });
    }

    // Step 5: Check if user is logged in
    await sleep(1500);
    await this._checkLoginStatus();

    this._ready = true;
    console.log('[browser] ready');
    return this;
  }

  // Check if user is logged into Divar
  async _checkLoginStatus() {
    try {
      const currentUrl = this._page.url();
      const isLoggedIn = !currentUrl.includes('/login') &&
                         !currentUrl.includes('/auth') &&
                         !currentUrl.includes('/register');

      this._loginRequired = !isLoggedIn;

      if (this._loginRequired) {
        console.log('[browser] ⚠️  Login required — user must log into Divar');
        console.log('[browser] Navigate to: https://divar.ir');
        console.log('[browser] After login, call POST /api/browser/navigate to /new');
      } else {
        console.log('[browser] ✅ User appears to be logged in');
      }
    } catch (err) {
      console.warn('[browser] could not check login status:', err.message);
      this._loginRequired = true;
    }
  }

  // Navigate to a URL
  async navigate(url) {
    const page = this.getPage();
    console.log(`[browser] navigating to: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {
      console.log('[browser] navigation timeout — continuing anyway');
    });
    await sleep(1000);
    await this._checkLoginStatus();
    return { url: page.url(), loginRequired: this._loginRequired };
  }

  // Get current status info
  getStatus() {
    return {
      ready: this._ready,
      port: DEBUG_PORT,
      loginRequired: this._loginRequired,
      currentUrl: this._page?.url() || null,
      profileDir: PROFILE_DIR,
      launchedByUs: this._launchedByUs,
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
    if (this._launchedByUs && this._chromeProcess && !this._chromeProcess.killed) {
      this._chromeProcess.kill();
    }
    this._browser = null;
    this._page = null;
    this._chromeProcess = null;
    this._ready = false;
    this._launchedByUs = false;
    console.log('[browser] closed');
  }
}

const instance = new BrowserService();
export default instance;
