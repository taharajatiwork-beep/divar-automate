import { createServer } from 'node:http';

import { mockProducts } from './mock-products.js';
import { createPilotService } from './pilot-service.js';
import { createAuthService, authMiddleware } from './auth.js';
import { createCategoryService } from './categories.js';
import { createQuotaService } from './quota.js';
import { createImageService } from './images.js';

const categoryService = createCategoryService();
const service = createPilotService({ products: mockProducts, categoryService });
const authService = createAuthService();
const quotaService = createQuotaService();
const imageService = createImageService();
const authenticate = authMiddleware(authService);

// ─── Helpers ────────────────────────────────────────────────────────
function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch { reject(new Error('JSON نامعتبر')); }
    });
    request.on('error', reject);
  });
}

function requireAuth(user, permission) {
  if (!user) throw new Error('احراز هویت نشده.');
  if (!authService.hasPermission(user, permission)) throw new Error('دسترسی کافی ندارید.');
}

// ─── Router ─────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const method = req.method;
  const path = url.pathname;

  try {
    const user = authenticate(req);

    // ── Public ─────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/health') {
      return sendJson(res, 200, { status: 'ok', pilot: 'manual-submit-only', phase: 4 });
    }

    // ── Auth: login ────────────────────────────────────────────────
    if (method === 'POST' && path === '/api/auth/login') {
      const body = await readJson(req);
      const u = authService.authenticate(body.token);
      if (!u) return sendJson(res, 401, { error: 'توکن نامعتبر.' });
      return sendJson(res, 200, { user: { id: u.id, name: u.name, role: u.role } });
    }

    // ── Users ──────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/users') {
      requireAuth(user, 'users:read');
      return sendJson(res, 200, { users: authService.listUsers() });
    }

    if (method === 'POST' && path === '/api/users') {
      requireAuth(user, 'users:manage');
      const body = await readJson(req);
      const newUser = authService.addUser(body);
      return sendJson(res, 201, { user: newUser });
    }

    if (method === 'DELETE' && path.match(/^\/api\/users\/[^/]+$/)) {
      requireAuth(user, 'users:manage');
      const userId = path.split('/').pop();
      authService.removeUser(userId);
      return sendJson(res, 200, { success: true });
    }

    // ── Categories & Templates ────────────────────────────────────
    if (method === 'GET' && path === '/api/categories') {
      requireAuth(user, 'mapping:read');
      return sendJson(res, 200, { categories: categoryService.listTemplates() });
    }

    if (method === 'GET' && path === '/api/categories/active') {
      return sendJson(res, 200, { categories: categoryService.getActiveTemplates().map(t => ({ id: t.id, label: t.label, icon: t.icon })) });
    }

    if (method === 'GET' && path.match(/^\/api\/categories\/[^/]+$/)) {
      requireAuth(user, 'mapping:read');
      const catId = path.split('/').pop();
      const template = categoryService.getTemplate(catId);
      return sendJson(res, 200, { template });
    }

    if (method === 'PUT' && path.match(/^\/api\/categories\/[^/]+$/)) {
      requireAuth(user, 'mapping:edit');
      const catId = path.split('/').pop();
      const body = await readJson(req);
      const updated = categoryService.updateTemplate({ templateId: catId, fields: body.fields, supervisorId: user.id });
      return sendJson(res, 200, { template: updated });
    }

    if (method === 'POST' && path === '/api/categories/review') {
      requireAuth(user, 'mapping:edit');
      const body = await readJson(req);
      if (!body.templateId) return sendJson(res, 400, { error: 'templateId الزامی است.' });
      const reviewed = categoryService.reviewTemplate({
        templateId: body.templateId,
        approved: body.approved !== false,
        notes: body.notes,
        reviewerId: user.id,
      });
      return sendJson(res, 200, { template: reviewed });
    }

    if (method === 'GET' && path === '/api/categories/pending-review') {
      requireAuth(user, 'mapping:edit');
      return sendJson(res, 200, { templates: categoryService.getPendingReview() });
    }

    if (method === 'GET' && path === '/api/categories/history') {
      requireAuth(user, 'audit:read');
      const templateId = url.searchParams.get('templateId') || undefined;
      return sendJson(res, 200, { history: categoryService.getReviewHistory({ templateId }) });
    }

    // ── Products ───────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/products') {
      const category = url.searchParams.get('category') || undefined;
      return sendJson(res, 200, { products: service.listProducts({ category }) });
    }

    // ── Batch create ───────────────────────────────────────────────
    if (method === 'POST' && path === '/api/tasks/batch') {
      requireAuth(user, 'task:batch_create');
      const body = await readJson(req).catch(() => ({}));
      const category = body.category || undefined;
      const created = service.batchCreateTasks({ createdBy: user.id, category });
      return sendJson(res, 201, { tasks: created, count: created.length });
    }

    // ── Smart assign ───────────────────────────────────────────────
    if (method === 'POST' && path === '/api/tasks/smart-assign') {
      requireAuth(user, 'task:assign');
      const operators = authService.getOperators();
      const task = service.smartAssign({ operators });
      return sendJson(res, 200, { task });
    }

    // ── Tasks ──────────────────────────────────────────────────────
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

    // ── Task-specific routes ───────────────────────────────────────
    const taskMatch = path.match(/^\/api\/tasks\/([^/]+)(\/.*)?$/);
    if (taskMatch) {
      const taskId = taskMatch[1];
      const subPath = taskMatch[2] || '';

      if (method === 'GET' && subPath === '') {
        const tasks = service.listTasks();
        const task = tasks.find(t => t.id === taskId);
        if (!task) return sendJson(res, 404, { error: 'وظیفه پیدا نشد.' });
        return sendJson(res, 200, { task });
      }

      if (method === 'POST' && subPath === '/claim') {
        requireAuth(user, 'task:claim');
        const claimed = service.claimNextTask({ operatorId: user.id });
        return sendJson(res, 200, { task: claimed });
      }

      if (method === 'GET' && subPath === '/prefill') {
        const prefill = service.getPrefillPayload({ taskId, operatorId: user.id });
        return sendJson(res, 200, { prefill });
      }

      if (method === 'PUT' && subPath === '/field') {
        requireAuth(user, 'task:edit_own');
        const body = await readJson(req);
        if (!body.field || body.newValue === undefined) {
          return sendJson(res, 400, { error: 'field و newValue الزامی‌اند.' });
        }
        const task = service.editTaskField({ taskId, operatorId: user.id, field: body.field, newValue: body.newValue });
        return sendJson(res, 200, { task });
      }

      if (method === 'POST' && subPath === '/submit') {
        requireAuth(user, 'task:submit_own');
        const task = service.markSubmitted({ taskId, operatorId: user.id });
        return sendJson(res, 200, { task });
      }

      if (method === 'POST' && subPath === '/confirm') {
        requireAuth(user, 'task:confirm');
        const task = service.confirmTask({ taskId, supervisorId: user.id });
        return sendJson(res, 200, { task });
      }

      if (method === 'POST' && subPath === '/reject') {
        requireAuth(user, 'task:reject');
        const body = await readJson(req);
        const task = service.rejectTask({ taskId, supervisorId: user.id, reason: body.reason });
        return sendJson(res, 200, { task });
      }

      if (method === 'POST' && subPath === '/reassign') {
        requireAuth(user, 'task:reassign');
        const body = await readJson(req);
        if (!body.newOperatorId) return sendJson(res, 400, { error: 'newOperatorId الزامی است.' });
        const task = service.reassignTask({ taskId, newOperatorId: body.newOperatorId, supervisorId: user.id });
        return sendJson(res, 200, { task });
      }

      if (method === 'GET' && subPath === '/audit') {
        requireAuth(user, 'audit:read');
        const logs = service.getAuditLog({ taskId });
        return sendJson(res, 200, { logs });
      }
    }

    // ── Audit (global) ─────────────────────────────────────────────
    if (method === 'GET' && path === '/api/audit') {
      requireAuth(user, 'audit:read');
      return sendJson(res, 200, { logs: service.getAuditLog() });
    }

    // ── Stats ──────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/stats') {
      requireAuth(user, 'stats:read');
      return sendJson(res, 200, { stats: service.getStatsV2() });
    }

    // ── Mapping (backward compat) ──────────────────────────────────
    if (method === 'GET' && path === '/api/mapping') {
      requireAuth(user, 'mapping:read');
      return sendJson(res, 200, { mapping: service.getMapping() });
    }

    // ── Quota ──────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/quota') {
      requireAuth(user, 'stats:read');
      return sendJson(res, 200, { accounts: quotaService.getAllStatus() });
    }

    if (method === 'GET' && path.match(/^\/api\/quota\/[^/]+$/)) {
      requireAuth(user, 'stats:read');
      const accountId = path.split('/').pop();
      return sendJson(res, 200, { quota: quotaService.getStatus({ accountId }) });
    }

    if (method === 'POST' && path === '/api/quota/set-limit') {
      requireAuth(user, 'task:assign');
      const body = await readJson(req);
      if (!body.accountId || !body.limit) return sendJson(res, 400, { error: 'accountId و limit الزامی‌اند.' });
      const result = quotaService.setDailyLimit({ accountId: body.accountId, limit: body.limit });
      return sendJson(res, 200, { quota: result });
    }

    if (method === 'POST' && path === '/api/quota/record') {
      requireAuth(user, 'task:confirm');
      const body = await readJson(req);
      if (!body.accountId) return sendJson(res, 400, { error: 'accountId الزامی است.' });
      const result = quotaService.recordPost({ accountId: body.accountId });
      return sendJson(res, 200, { quota: result });
    }

    if (method === 'POST' && path === '/api/quota/check') {
      requireAuth(user, 'task:claim');
      const body = await readJson(req);
      if (!body.accountId) return sendJson(res, 400, { error: 'accountId الزامی است.' });
      const result = quotaService.canPost({ accountId: body.accountId });
      return sendJson(res, 200, result);
    }

    // ── Images ─────────────────────────────────────────────────────
    if (method === 'POST' && path === '/api/images/prepare') {
      requireAuth(user, 'task:create');
      const body = await readJson(req);
      if (!body.taskId) return sendJson(res, 400, { error: 'taskId الزامی است.' });
      const manifest = imageService.prepareForTask({ taskId: body.taskId, imageUrls: body.imageUrls || [] });
      return sendJson(res, 200, { manifest });
    }

    if (method === 'GET' && path.match(/^\/api\/images\/[^/]+$/)) {
      requireAuth(user, 'task:read_all');
      const taskId = path.split('/').pop();
      const manifest = imageService.getManifest({ taskId });
      if (!manifest) return sendJson(res, 404, { error: 'manifest پیدا نشد.' });
      return sendJson(res, 200, { manifest });
    }

    if (method === 'GET' && path === '/api/images/summary') {
      requireAuth(user, 'stats:read');
      return sendJson(res, 200, { summary: imageService.getSummary() });
    }

    return sendJson(res, 404, { error: 'مسیر پیدا نشد.' });
  } catch (error) {
    const statusCode = error.message.includes('احراز') || error.message.includes('دسترسی') ? 403 : 400;
    return sendJson(res, statusCode, { error: error.message });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`Divar Pilot API v4 → http://localhost:${port}`);
  console.log(`Users: ${authService.listUsers().map(u => `${u.name}(${u.role})`).join(', ')}`);
  console.log(`Categories: ${categoryService.listTemplates().map(t => `${t.icon} ${t.label}`).join(', ')}`);
});
