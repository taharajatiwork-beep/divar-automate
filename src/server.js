import { createServer } from 'node:http';

import { mockProducts } from './mock-products.js';
import { createPilotService } from './pilot-service.js';

const service = createPilotService({ products: mockProducts });

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
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('بدنه درخواست JSON معتبر نیست.'));
      }
    });
    request.on('error', reject);
  });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  try {
    if (request.method === 'GET' && url.pathname === '/health') {
      return sendJson(response, 200, { status: 'ok', pilot: 'manual-submit-only' });
    }

    if (request.method === 'GET' && url.pathname === '/api/tasks') {
      return sendJson(response, 200, { tasks: service.listTasks() });
    }

    if (request.method === 'POST' && url.pathname === '/api/tasks') {
      const body = await readJson(request);
      const task = service.createTask({ productId: body.productId, createdBy: body.createdBy ?? 'supervisor-demo' });
      return sendJson(response, 201, { task });
    }

    if (request.method === 'POST' && url.pathname === '/api/tasks/claim-next') {
      const body = await readJson(request);
      if (!body.operatorId) return sendJson(response, 400, { error: 'operatorId الزامی است.' });
      const task = service.claimNextTask({ operatorId: body.operatorId });
      return sendJson(response, 200, { task });
    }

    const match = url.pathname.match(/^\/api\/tasks\/([^/]+)\/prefill$/);
    if (request.method === 'GET' && match) {
      const operatorId = url.searchParams.get('operatorId');
      if (!operatorId) return sendJson(response, 400, { error: 'operatorId الزامی است.' });
      const prefill = service.getPrefillPayload({ taskId: match[1], operatorId });
      return sendJson(response, 200, { prefill });
    }

    return sendJson(response, 404, { error: 'مسیر پیدا نشد.' });
  } catch (error) {
    return sendJson(response, 400, { error: error.message });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`Pilot API running at http://localhost:${port}`);
});
