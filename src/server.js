import { createServer } from 'node:http';

import { mockProducts } from './mock-products.js';
import { createPilotService } from './pilot-service.js';
import { createAuthService, authMiddleware } from './auth.js';

const service = createPilotService({ products: mockProducts });
const authService = createAuthService();
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
      return sendJson(res, 200, { status: 'ok', pilot: 'manual-submit-only', phase: 2 });
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

    // ── Products ───────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/products') {
      return sendJson(res, 200, { products: service.listProducts() });
    }

    // ── Batch create ───────────────────────────────────────────────
    if (method === 'POST' && path === '/api/tasks/batch') {
      requireAuth(user, 'task:batch_create');
      const created = service.batchCreateTasks({ createdBy: user.id });
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
      return sendJson(res, 200, { tasks: service.listTasks({ status, operatorId }) });
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

      // GET /api/tasks/:id
      if (method === 'GET' && subPath === '') {
        const tasks = service.listTasks();
        const task = tasks.find(t => t.id === taskId);
        if (!task) return sendJson(res, 404, { error: 'وظیفه پیدا نشد.' });
        return sendJson(res, 200, { task });
      }

      // POST /api/tasks/:id/claim (operator claims this specific task)
      if (method === 'POST' && subPath === '/claim') {
        requireAuth(user, 'task:claim');
        const claimed = service.claimNextTask({ operatorId: user.id });
        return sendJson(res, 200, { task: claimed });
      }

      // GET /api/tasks/:id/prefill
      if (method === 'GET' && subPath === '/prefill') {
        const prefill = service.getPrefillPayload({ taskId, operatorId: user.id });
        return sendJson(res, 200, { prefill });
      }

      // PUT /api/tasks/:id/field
      if (method === 'PUT' && subPath === '/field') {
        requireAuth(user, 'task:edit_own');
        const body = await readJson(req);
        if (!body.field || body.newValue === undefined) {
          return sendJson(res, 400, { error: 'field و newValue الزامی‌اند.' });
        }
        const task = service.editTaskField({ taskId, operatorId: user.id, field: body.field, newValue: body.newValue });
        return sendJson(res, 200, { task });
      }

      // POST /api/tasks/:id/submit
      if (method === 'POST' && subPath === '/submit') {
        requireAuth(user, 'task:submit_own');
        const task = service.markSubmitted({ taskId, operatorId: user.id });
        return sendJson(res, 200, { task });
      }

      // POST /api/tasks/:id/confirm
      if (method === 'POST' && subPath === '/confirm') {
        requireAuth(user, 'task:confirm');
        const task = service.confirmTask({ taskId, supervisorId: user.id });
        return sendJson(res, 200, { task });
      }

      // POST /api/tasks/:id/reject
      if (method === 'POST' && subPath === '/reject') {
        requireAuth(user, 'task:reject');
        const body = await readJson(req);
        const task = service.rejectTask({ taskId, supervisorId: user.id, reason: body.reason });
        return sendJson(res, 200, { task });
      }

      // POST /api/tasks/:id/reassign
      if (method === 'POST' && subPath === '/reassign') {
        requireAuth(user, 'task:reassign');
        const body = await readJson(req);
        if (!body.newOperatorId) return sendJson(res, 400, { error: 'newOperatorId الزامی است.' });
        const task = service.reassignTask({ taskId, newOperatorId: body.newOperatorId, supervisorId: user.id });
        return sendJson(res, 200, { task });
      }

      // GET /api/tasks/:id/audit
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

    // ── Mapping ────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/mapping') {
      requireAuth(user, 'mapping:read');
      return sendJson(res, 200, { mapping: service.getMapping() });
    }

    return sendJson(res, 404, { error: 'مسیر پیدا نشد.' });
  } catch (error) {
    const statusCode = error.message.includes('احراز') || error.message.includes('دسترسی') ? 403 : 400;
    return sendJson(res, statusCode, { error: error.message });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`Divar Pilot API v2 → http://localhost:${port}`);
  console.log(`Users: ${authService.listUsers().map(u => `${u.name}(${u.role})`).join(', ')}`);
});
