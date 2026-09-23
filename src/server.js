import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from './database.js';
import { createPilotService } from './pilot-service.js';
import { createAuthService, authMiddleware } from './auth.js';
import { createCategoryService } from './categories.js';
import { createQuotaService } from './quota.js';
import { createImageService } from './images.js';

// ─── Initialize ─────────────────────────────────────────────────────
const db = createDatabase();
const categoryService = createCategoryService();
const dbProducts = db.getProducts({ status: 'active' });
const service = createPilotService({ products: dbProducts, categoryService });
const authService = createAuthService();
const quotaService = createQuotaService();
const imageService = createImageService();
const authenticate = authMiddleware(authService);

// ─── Security ───────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:*,chrome-extension://*').split(',');

function getCorsOrigin(req) {
  const origin = req.headers.origin || '';
  // chrome-extension:// has dynamic IDs, match prefix
  if (ALLOWED_ORIGINS.some(o => {
    if (o.endsWith('*')) return origin.startsWith(o.slice(0, -1));
    return origin === o;
  })) return origin;
  return ALLOWED_ORIGINS[0] || 'http://localhost:3000';
}

// ─── Rate Limiting (in-memory, per-IP, 60 req/min on auth) ──────────
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 60;
const rateLimitMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

// Cleanup stale entries every 5 min
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW * 2;
  for (const [ip, entry] of rateLimitMap) {
    if (entry.windowStart < cutoff) rateLimitMap.delete(ip);
  }
}, 300_000);

// ─── Request Body Size Limit ───────────────────────────────────────
const MAX_BODY_SIZE = 512 * 1024; // 512 KB

// ─── Security Headers ──────────────────────────────────────────────
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// ─── Helpers ────────────────────────────────────────────────────────
function sendJson(res, code, body, extraHeaders = {}) {
  const corsOrigin = extraHeaders._corsOrigin || 'http://localhost:3000';
  const { _corsOrigin, ...cleanHeaders } = extraHeaders;
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...SECURITY_HEADERS,
    ...cleanHeaders
  });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let totalSize = 0;
    req.on('data', c => {
      totalSize += c.length;
      if (totalSize > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error('درخواست بیش از حد بزرگ است.'));
        return;
      }
      body += c;
    });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('JSON نامعتبر')); } });
    req.on('error', reject);
  });
}

function requireAuth(user, perm) {
  if (!user) throw new Error('احراز هویت نشده.');
  if (!authService.hasPermission(user, perm)) throw new Error('دسترسی کافی ندارید.');
}

// ─── Server ─────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  // ── CORS preflight ───────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    const corsOrigin = getCorsOrigin(req);
    res.writeHead(204, {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      ...SECURITY_HEADERS,
    });
    return res.end();
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const method = req.method;
  const path = url.pathname;

  // ── Rate limit per IP ────────────────────────────────────────
  const clientIp = req.socket?.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return sendJson(res, 429, { error: 'درخواست‌های زیادی ارسال شده. لطفاً صبر کنید.' });
  }

  try {
    // ── Serve images (no auth needed) ────────────────────────────
    if (method === 'GET' && path.startsWith('/images/')) {
      const filename = path.replace('/images/', '');
      const candidates = [
        join(process.cwd(), 'data', 'images', filename),
        join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'images', filename),
      ];
      const imgPath = candidates.find(p => existsSync(p));
      if (imgPath) {
        const data = readFileSync(imgPath);
        const ext = imgPath.split('.').pop().toLowerCase();
        const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' }[ext] || 'application/octet-stream';
        res.writeHead(200, { 'content-type': mime, 'access-control-allow-origin': getCorsOrigin(req), 'cache-control': 'public, max-age=86400', ...SECURITY_HEADERS });
        return res.end(data);
      }
      return sendJson(res, 404, { error: 'تصویر پیدا نشد.' });
    }

    const user = authenticate(req);

    // ── Health ────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/health') {
      return sendJson(res, 200, { status: 'ok', phase: 'production', products: dbProducts.length });
    }

    // ── Auth ──────────────────────────────────────────────────────
    if (method === 'POST' && path === '/api/auth/login') {
      const body = await readJson(req);
      const u = authService.authenticate(body.token);
      if (!u) return sendJson(res, 401, { error: 'توکن نامعتبر.' });
      return sendJson(res, 200, { user: { id: u.id, name: u.name, role: u.role, token: body.token } });
    }

    // ── Users ─────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/users') {
      requireAuth(user, 'users:read');
      return sendJson(res, 200, { users: authService.listUsers() });
    }

    // ── Products (database-backed) ────────────────────────────────
    if (method === 'GET' && path === '/api/products') {
      const category = url.searchParams.get('category') || undefined;
      const search = url.searchParams.get('search') || undefined;
      return sendJson(res, 200, { products: db.getProducts({ category, search }) });
    }

    if (method === 'GET' && path === '/api/products/stats') {
      return sendJson(res, 200, db.getProductStats());
    }

    // ── Product Locking (specific routes BEFORE /:id catch-all) ───
    if (method === 'GET' && path === '/api/products/board') {
      requireAuth(user, 'products:read');
      return sendJson(res, 200, db.getProductsByStatus());
    }
    if (method === 'POST' && path.match(/^\/api\/products\/[^/]+\/lock$/)) {
      const productId = path.split('/')[3];
      requireAuth(user, 'task:create');
      const result = db.lockProduct(productId, user.id);
      if (result.error) return sendJson(res, 409, result);
      const product = result.product;
      db.addAuditLog({ action: 'product_locked', productId: product.id, operatorId: user.id });
      return sendJson(res, 200, { product });
    }
    if (method === 'POST' && path.match(/^\/api\/products\/[^/]+\/unlock$/)) {
      const productId = path.split('/')[3];
      requireAuth(user, 'task:create');
      const result = db.unlockProduct(productId, user.id);
      if (result.error) return sendJson(res, 400, result);
      db.addAuditLog({ action: 'product_unlocked', productId, operatorId: user.id });
      return sendJson(res, 200, result);
    }
    if (method === 'POST' && path.match(/^\/api\/products\/[^/]+\/complete$/)) {
      const productId = path.split('/')[3];
      requireAuth(user, 'task:create');
      const result = db.completeProduct(productId, user.id);
      if (result.error) return sendJson(res, 400, result);
      db.addAuditLog({ action: 'product_posted', productId: result.product.id, operatorId: user.id });
      return sendJson(res, 200, result);
    }

    // ── Generic product CRUD (after specific routes) ─────────────
    if (method === 'GET' && path.match(/^\/api\/products\/[^/]+$/)) {
      const id = path.split('/').pop();
      const p = db.getProduct(id);
      if (!p) return sendJson(res, 404, { error: 'محصول پیدا نشد.' });
      return sendJson(res, 200, { product: p });
    }

    // ── Product prefill data (for extension) ─────────────────────
    if (method === 'GET' && path.match(/^\/api\/products\/[^/]+\/prefill$/)) {
      const id = path.split('/')[3];
      const p = db.getProduct(id);
      if (!p) return sendJson(res, 404, { error: 'محصول پیدا نشد.' });
      if (p.status !== 'locked' || p.locked_by !== user.id) {
        return sendJson(res, 403, { error: 'این محصول قفل نیست یا قفل شما نیست.' });
      }
      return sendJson(res, 200, { prefill: { title: p.title, description: p.description, price: p.price, ...p.attributes, category: p.category, city: p.city, images: (p.images || []).map(u => u.replace('https://cdn.example.test', 'http://localhost:3000')) } });
    }

    // ── Pending prefill (web panel stores, extension reads) ──────
    if (method === 'POST' && path === '/api/prefill/pending') {
      requireAuth(user, 'products:read');
      const body = await readJson(req);
      if (!body.productId || !body.prefill) return sendJson(res, 400, { error: 'اطلاعات ناقص.' });
      // Store in memory (volatile, 5 min TTL)
      if (!globalThis._pendingPrefills) globalThis._pendingPrefills = new Map();
      globalThis._pendingPrefills.set(user.id, { ...body, timestamp: Date.now(), token: user.token });
      // Cleanup old entries
      for (const [k, v] of globalThis._pendingPrefills) {
        if (Date.now() - v.timestamp > 5 * 60 * 1000) globalThis._pendingPrefills.delete(k);
      }
      return sendJson(res, 200, { ok: true });
    }

    if (method === 'GET' && path === '/api/prefill/pending') {
      // Extension calls this with its token to get pending prefill
      const pending = globalThis._pendingPrefills?.get(user.id);
      if (!pending || Date.now() - pending.timestamp > 5 * 60 * 1000) {
        return sendJson(res, 200, { prefill: null });
      }
      // One-time: delete after reading
      globalThis._pendingPrefills.delete(user.id);
      return sendJson(res, 200, { prefill: pending.prefill, productId: pending.productId });
    }

    if (method === 'POST' && path === '/api/products') {
      requireAuth(user, 'task:create');
      const body = await readJson(req);
      if (!body.title) return sendJson(res, 400, { error: 'عنوان الزامی است.' });
      const product = db.addProduct(body);
      return sendJson(res, 201, { product });
    }

    if (method === 'PUT' && path.match(/^\/api\/products\/[^/]+$/)) {
      requireAuth(user, 'task:create');
      const id = path.split('/').pop();
      const body = await readJson(req);
      const updated = db.updateProduct(id, body);
      if (!updated) return sendJson(res, 404, { error: 'محصول پیدا نشد.' });
      return sendJson(res, 200, { product: updated });
    }

    if (method === 'DELETE' && path.match(/^\/api\/products\/[^/]+$/)) {
      requireAuth(user, 'task:assign');
      const id = path.split('/').pop();
      const ok = db.deleteProduct(id);
      if (!ok) return sendJson(res, 404, { error: 'محصول پیدا نشد.' });
      return sendJson(res, 200, { success: true });
    }

    if (method === 'POST' && path === '/api/products/import') {
      requireAuth(user, 'task:create');
      const body = await readJson(req);
      if (!Array.isArray(body.items)) return sendJson(res, 400, { error: 'آرایه items الزامی است.' });
      const added = db.importProducts(body.items);
      return sendJson(res, 201, { imported: added.length, products: added });
    }

    // ── Tasks ─────────────────────────────────────────────────────
    if (method === 'POST' && path === '/api/tasks/batch') {
      requireAuth(user, 'task:batch_create');
      const body = await readJson(req).catch(() => ({}));
      const created = service.batchCreateTasks({ createdBy: user.id, category: body.category });
      return sendJson(res, 201, { tasks: created, count: created.length });
    }

    if (method === 'POST' && path === '/api/tasks/smart-assign') {
      requireAuth(user, 'task:claim');
      const operators = authService.getOperators();
      const task = service.smartAssign({ operators });
      return sendJson(res, 200, { task });
    }

    if (method === 'GET' && path === '/api/tasks') {
      const status = url.searchParams.get('status') || undefined;
      const operatorId = url.searchParams.get('operatorId') || undefined;
      const category = url.searchParams.get('category') || undefined;
      return sendJson(res, 200, { tasks: service.listTasks({ status, operatorId, category }) });
    }

    if (method === 'POST' && path === '/api/tasks') {
      requireAuth(user, 'task:create');
      const body = await readJson(req);
      if (!body.productId) return sendJson(res, 400, { error: 'productId الزامی است.' });
      const task = service.createTask({ productId: body.productId, createdBy: user.id });
      return sendJson(res, 201, { task });
    }

    // ── Task-specific routes ──────────────────────────────────────
    const taskMatch = path.match(/^\/api\/tasks\/([^/]+)(\/.*)?$/);
    if (taskMatch) {
      const taskId = taskMatch[1];
      const sub = taskMatch[2] || '';

      if (method === 'GET' && sub === '') {
        const t = service.listTasks().find(t => t.id === taskId);
        if (!t) return sendJson(res, 404, { error: 'وظیفه پیدا نشد.' });
        return sendJson(res, 200, { task: t });
      }
      if (method === 'POST' && sub === '/claim') {
        requireAuth(user, 'task:claim');
        return sendJson(res, 200, { task: service.claimNextTask({ operatorId: user.id }) });
      }
      if (method === 'GET' && sub === '/prefill') {
        return sendJson(res, 200, { prefill: service.getPrefillPayload({ taskId, operatorId: user.id }) });
      }
      if (method === 'PUT' && sub === '/field') {
        requireAuth(user, 'task:edit_own');
        const body = await readJson(req);
        return sendJson(res, 200, { task: service.editTaskField({ taskId, operatorId: user.id, field: body.field, newValue: body.newValue }) });
      }
      if (method === 'POST' && sub === '/submit') {
        requireAuth(user, 'task:submit_own');
        return sendJson(res, 200, { task: service.markSubmitted({ taskId, operatorId: user.id }) });
      }
      if (method === 'POST' && sub === '/confirm') {
        requireAuth(user, 'task:confirm');
        return sendJson(res, 200, { task: service.confirmTask({ taskId, supervisorId: user.id }) });
      }
      if (method === 'POST' && sub === '/reject') {
        requireAuth(user, 'task:reject');
        const body = await readJson(req);
        return sendJson(res, 200, { task: service.rejectTask({ taskId, supervisorId: user.id, reason: body.reason }) });
      }
      if (method === 'POST' && sub === '/reassign') {
        requireAuth(user, 'task:reassign');
        const body = await readJson(req);
        return sendJson(res, 200, { task: service.reassignTask({ taskId, newOperatorId: body.newOperatorId, supervisorId: user.id }) });
      }
      if (method === 'GET' && sub === '/audit') {
        requireAuth(user, 'audit:read');
        return sendJson(res, 200, { logs: service.getAuditLog({ taskId }) });
      }
    }

    // ── Audit ─────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/audit') {
      requireAuth(user, 'audit:read');
      return sendJson(res, 200, { logs: service.getAuditLog() });
    }

    // ── Stats ─────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/stats') {
      requireAuth(user, 'stats:read');
      const dbStats = db.getFullStats();
      const pilotStats = service.getStatsV2();
      return sendJson(res, 200, { stats: { ...pilotStats, products: dbStats.products } });
    }

    // ── Categories ────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/categories') {
      requireAuth(user, 'mapping:read');
      return sendJson(res, 200, { categories: categoryService.listTemplates() });
    }
    if (method === 'GET' && path === '/api/categories/active') {
      return sendJson(res, 200, { categories: categoryService.getActiveTemplates().map(t => ({ id: t.id, label: t.label, icon: t.icon })) });
    }

    // ── Quota ─────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/quota') {
      requireAuth(user, 'stats:read');
      return sendJson(res, 200, { accounts: quotaService.getAllStatus() });
    }

    // ── Images ────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/images/summary') {
      requireAuth(user, 'stats:read');
      return sendJson(res, 200, { summary: imageService.getSummary() });
    }

    // ── Mapping ───────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/mapping') {
      requireAuth(user, 'mapping:read');
      return sendJson(res, 200, { mapping: service.getMapping() });
    }

    // ── Browser Control (Puppeteer-based) ─────────────────────────
    if (method === 'GET' && path === '/api/browser/status') {
      const browser = (await import('./browser-service.js')).default;
      return sendJson(res, 200, browser.getStatus());
    }

    if (method === 'POST' && path === '/api/browser/launch') {
      requireAuth(user, 'task:create');
      const browser = (await import('./browser-service.js')).default;
      if (browser.ready) return sendJson(res, 200, { ok: true, message: 'Browser already running.', ...browser.getStatus() });
      try {
        await browser.launch();
        return sendJson(res, 200, { ok: true, message: 'Browser launched.', ...browser.getStatus() });
      } catch (err) {
        return sendJson(res, 500, { error: 'Failed to launch browser: ' + err.message });
      }
    }

    if (method === 'POST' && path === '/api/browser/navigate') {
      requireAuth(user, 'task:create');
      const browser = (await import('./browser-service.js')).default;
      if (!browser.ready) return sendJson(res, 400, { error: 'Browser not launched. Call POST /api/browser/launch first.' });
      const body = await readJson(req);
      const url = body.url || 'https://divar.ir/new';
      try {
        const result = await browser.navigate(url);
        return sendJson(res, 200, { ok: true, ...result });
      } catch (err) {
        return sendJson(res, 500, { error: 'Navigation failed: ' + err.message });
      }
    }

    if (method === 'POST' && path === '/api/browser/fill') {
      requireAuth(user, 'task:create');
      const browser = (await import('./browser-service.js')).default;
      if (!browser.ready) return sendJson(res, 400, { error: 'Browser not launched. Call POST /api/browser/launch first.' });
      if (browser.loginRequired) return sendJson(res, 400, { error: 'User not logged in. Login at divar.ir first, then call POST /api/browser/navigate.' });
      const body = await readJson(req);
      if (!body.productId) return sendJson(res, 400, { error: 'productId الزامی است.' });
      const product = db.getProduct(body.productId);
      if (!product) return sendJson(res, 404, { error: 'محصول پیدا نشد.' });
      try {
        const automator = (await import('./divar-automator.js')).default;
        const results = await automator.fillForm(product);
        return sendJson(res, 200, { ok: true, results });
      } catch (err) {
        return sendJson(res, 500, { error: 'Form fill failed: ' + err.message });
      }
    }

    // ── Cancel fill ──────────────────────────────────────────────────
    if (method === 'POST' && path === '/api/browser/fill/cancel') {
      requireAuth(user, 'task:create');
      const automator = (await import('./divar-automator.js')).default;
      if (!automator.isFilling) return sendJson(res, 400, { error: 'هیچ فرایندی در حال اجرا نیست.' });
      automator.cancel('لغو توسط کاربر');
      return sendJson(res, 200, { ok: true, message: 'فرایند لغو شد.' });
    }

    // ── Bug Report ─────────────────────────────────────────────────
    if (method === 'POST' && path === '/api/bug-report') {
      requireAuth(user, 'products:read');
      const report = await readJson(req);
      report.timestamp = new Date().toISOString();
      report.id = Date.now();
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const reportsDir = join(__dirname, '..', 'data', 'bug-reports');
      if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
      const filename = `report-${report.id}.json`;
      writeFileSync(join(reportsDir, filename), JSON.stringify(report, null, 2));
      db.addAuditLog({ action: 'bug_report', productId: null, operatorId: user.id, details: { reportId: report.id } });
      return sendJson(res, 200, { ok: true, reportId: report.id });
    }

    return sendJson(res, 404, { error: 'مسیر پیدا نشد.' });
  } catch (err) {
    const isAuthError = err.message.includes('احراز') || err.message.includes('دسترسی');
    const isSizeError = err.message.includes('بیش از حد');
    const code = isAuthError ? 403 : isSizeError ? 413 : 400;
    // Don't leak internal error details to clients
    const safeMsg = isAuthError || isSizeError ? err.message : 'خطای سرور.';
    return sendJson(res, code, { error: safeMsg });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`Divar Pilot API v5 (production) → http://localhost:${port}`);
  console.log(`${dbProducts.length} products loaded`);
  console.log(`Categories: ${categoryService.listTemplates().map(t => `${t.icon} ${t.label}`).join(', ')}`);
});
