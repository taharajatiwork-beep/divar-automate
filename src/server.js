import { createServer } from 'node:http';
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

// ─── Helpers ────────────────────────────────────────────────────────
function sendJson(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c; });
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
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const method = req.method;
  const path = url.pathname;

  try {
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
      return sendJson(res, 200, { prefill: { title: p.title, description: p.description, price: p.price, attributes: p.attributes, category: p.category, city: p.city } });
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
      requireAuth(user, 'task:assign');
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

    return sendJson(res, 404, { error: 'مسیر پیدا نشد.' });
  } catch (err) {
    const code = err.message.includes('احراز') || err.message.includes('دسترسی') ? 403 : 400;
    return sendJson(res, code, { error: err.message });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`Divar Pilot API v5 (production) → http://localhost:${port}`);
  console.log(`${dbProducts.length} products loaded`);
  console.log(`Categories: ${categoryService.listTemplates().map(t => `${t.icon} ${t.label}`).join(', ')}`);
});
