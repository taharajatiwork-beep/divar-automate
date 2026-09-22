import { createServer } from 'node:http';

import { mockProducts } from './mock-products.js';
import { createPilotService } from './pilot-service.js';

const service = createPilotService({ products: mockProducts });

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

// ─── Router ─────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const method = req.method;
  const path = url.pathname;

  try {
    // Health
    if (method === 'GET' && path === '/api/health') {
      return sendJson(res, 200, { status: 'ok', pilot: 'manual-submit-only' });
    }

    // ── Products ──────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/products') {
      return sendJson(res, 200, { products: service.listProducts() });
    }

    // ── Tasks ─────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/tasks') {
      const status = url.searchParams.get('status') || undefined;
      const operatorId = url.searchParams.get('operatorId') || undefined;
      return sendJson(res, 200, { tasks: service.listTasks({ status, operatorId }) });
    }

    if (method === 'POST' && path === '/api/tasks') {
      const body = await readJson(req);
      if (!body.productId) return sendJson(res, 400, { error: 'productId الزامی است.' });
      const task = service.createTask({ productId: body.productId, createdBy: body.createdBy ?? 'supervisor-1' });
      return sendJson(res, 201, { task });
    }

    // ── Claim next ────────────────────────────────────────────────
    if (method === 'POST' && path === '/api/tasks/claim-next') {
      const body = await readJson(req);
      if (!body.operatorId) return sendJson(res, 400, { error: 'operatorId الزامی است.' });
      const task = service.claimNextTask({ operatorId: body.operatorId });
      return sendJson(res, 200, { task });
    }

    // ── Task-specific routes ──────────────────────────────────────
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

      // GET /api/tasks/:id/prefill
      if (method === 'GET' && subPath === '/prefill') {
        const operatorId = url.searchParams.get('operatorId');
        if (!operatorId) return sendJson(res, 400, { error: 'operatorId الزامی است.' });
        const prefill = service.getPrefillPayload({ taskId, operatorId });
        return sendJson(res, 200, { prefill });
      }

      // PUT /api/tasks/:id/field
      if (method === 'PUT' && subPath === '/field') {
        const body = await readJson(req);
        if (!body.operatorId || !body.field || body.newValue === undefined) {
          return sendJson(res, 400, { error: 'operatorId، field و newValue الزامی‌اند.' });
        }
        const task = service.editTaskField({ taskId, operatorId: body.operatorId, field: body.field, newValue: body.newValue });
        return sendJson(res, 200, { task });
      }

      // POST /api/tasks/:id/submit
      if (method === 'POST' && subPath === '/submit') {
        const body = await readJson(req);
        if (!body.operatorId) return sendJson(res, 400, { error: 'operatorId الزامی است.' });
        const task = service.markSubmitted({ taskId, operatorId: body.operatorId });
        return sendJson(res, 200, { task });
      }

      // POST /api/tasks/:id/confirm
      if (method === 'POST' && subPath === '/confirm') {
        const body = await readJson(req);
        if (!body.supervisorId) return sendJson(res, 400, { error: 'supervisorId الزامی است.' });
        const task = service.confirmTask({ taskId, supervisorId: body.supervisorId });
        return sendJson(res, 200, { task });
      }

      // POST /api/tasks/:id/reject
      if (method === 'POST' && subPath === '/reject') {
        const body = await readJson(req);
        if (!body.supervisorId) return sendJson(res, 400, { error: 'supervisorId الزامی است.' });
        const task = service.rejectTask({ taskId, supervisorId: body.supervisorId, reason: body.reason });
        return sendJson(res, 200, { task });
      }

      // POST /api/tasks/:id/reassign
      if (method === 'POST' && subPath === '/reassign') {
        const body = await readJson(req);
        if (!body.supervisorId || !body.newOperatorId) {
          return sendJson(res, 400, { error: 'supervisorId و newOperatorId الزامی‌اند.' });
        }
        const task = service.reassignTask({ taskId, newOperatorId: body.newOperatorId, supervisorId: body.supervisorId });
        return sendJson(res, 200, { task });
      }

      // GET /api/tasks/:id/audit
      if (method === 'GET' && subPath === '/audit') {
        const logs = service.getAuditLog({ taskId });
        return sendJson(res, 200, { logs });
      }
    }

    // ── Audit (global) ────────────────────────────────────────────
    if (method === 'GET' && path === '/api/audit') {
      return sendJson(res, 200, { logs: service.getAuditLog() });
    }

    // ── Stats ─────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/stats') {
      return sendJson(res, 200, { stats: service.getStats() });
    }

    // ── Mapping ───────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/mapping') {
      return sendJson(res, 200, { mapping: service.getMapping() });
    }

    return sendJson(res, 404, { error: 'مسیر پیدا نشد.' });
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`Divar Pilot API → http://localhost:${port}`);
});
