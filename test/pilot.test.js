import test from 'node:test';
import assert from 'node:assert/strict';

import { createPilotService, TASK_STATUS } from '../src/pilot-service.js';
import { createAuthService, ROLES } from '../src/auth.js';

const validProduct = {
  id: 'phone-001', title: 'گوشی سامسونگ Galaxy A55 5G',
  description: 'دستگاه کاملاً سالم است.', price: 22500000,
  category: 'mobile-phones',
  attributes: { brand: 'Samsung', model: 'Galaxy A55 5G', storage: '256GB' },
  images: ['https://cdn.example.test/phone-001/01.jpg'],
};
const validProduct2 = {
  ...validProduct, id: 'phone-003', title: 'گوشی اپل iPhone 15',
  price: 55000000, attributes: { brand: 'Apple', model: 'iPhone 15', storage: '128GB' },
};
const incompleteProduct = {
  ...validProduct, id: 'phone-002',
  attributes: { brand: 'Xiaomi', model: '', storage: '128GB' },
};

// ═══ Phase 1 ══════════════════════════════════════════════════════
test('creates a ready task from a valid product', () => {
  const s = createPilotService({ products: [validProduct] });
  const t = s.createTask({ productId: validProduct.id, createdBy: 'sup-1' });
  assert.equal(t.status, TASK_STATUS.READY_FOR_ASSIGNMENT);
  assert.equal(t.validationErrors.length, 0);
});

test('creates needs_review when required field missing', () => {
  const s = createPilotService({ products: [incompleteProduct] });
  const t = s.createTask({ productId: incompleteProduct.id, createdBy: 'sup-1' });
  assert.equal(t.status, TASK_STATUS.NEEDS_REVIEW);
  assert.equal(t.validationErrors[0].field, 'attributes.model');
});

test('claims the next ready task', () => {
  const s = createPilotService({ products: [validProduct] });
  s.createTask({ productId: validProduct.id, createdBy: 'sup-1' });
  const c = s.claimNextTask({ operatorId: 'op-1' });
  assert.equal(c.status, TASK_STATUS.ASSIGNED);
});

test('edits a field and transitions to prefill_ready', () => {
  const s = createPilotService({ products: [validProduct] });
  const t = s.createTask({ productId: validProduct.id, createdBy: 'sup-1' });
  s.claimNextTask({ operatorId: 'op-1' });
  const u = s.editTaskField({ taskId: t.id, operatorId: 'op-1', field: 'price', newValue: 21000000 });
  assert.equal(u.payload.price, 21000000);
  assert.equal(u.status, TASK_STATUS.PREFILL_READY);
});

test('submits and confirms', () => {
  const s = createPilotService({ products: [validProduct] });
  const t = s.createTask({ productId: validProduct.id, createdBy: 'sup-1' });
  s.claimNextTask({ operatorId: 'op-1' });
  s.markSubmitted({ taskId: t.id, operatorId: 'op-1' });
  const c = s.confirmTask({ taskId: t.id, supervisorId: 'sup-1' });
  assert.equal(c.status, TASK_STATUS.CONFIRMED);
});

test('full lifecycle with audit trail', () => {
  const s = createPilotService({ products: [validProduct] });
  const t = s.createTask({ productId: validProduct.id, createdBy: 'sup-1' });
  s.claimNextTask({ operatorId: 'op-1' });
  s.editTaskField({ taskId: t.id, operatorId: 'op-1', field: 'description', newValue: 'ویرایش' });
  s.markSubmitted({ taskId: t.id, operatorId: 'op-1' });
  s.confirmTask({ taskId: t.id, supervisorId: 'sup-1' });
  const logs = s.getAuditLog({ taskId: t.id });
  assert.ok(logs.length >= 4);
  assert.ok(logs.some(l => l.action === 'task_confirmed'));
});

// ═══ Phase 2: Auth ════════════════════════════════════════════════
test('auth: valid token returns user', () => {
  const auth = createAuthService();
  const u = auth.authenticate('tok-ali-1234');
  assert.ok(u);
  assert.equal(u.role, ROLES.OPERATOR);
});

test('auth: invalid token returns null', () => {
  const auth = createAuthService();
  assert.equal(auth.authenticate('bad'), null);
});

test('auth: operator permissions are correct', () => {
  const auth = createAuthService();
  const u = auth.authenticate('tok-ali-1234');
  assert.ok(auth.hasPermission(u, 'task:claim'));
  assert.ok(!auth.hasPermission(u, 'task:create'));
  assert.ok(!auth.hasPermission(u, 'task:confirm'));
});

test('auth: supervisor has confirm/create', () => {
  const auth = createAuthService();
  const u = auth.authenticate('tok-reza-abcd');
  assert.ok(auth.hasPermission(u, 'task:confirm'));
  assert.ok(auth.hasPermission(u, 'task:create'));
  assert.ok(!auth.hasPermission(u, 'users:manage'));
});

test('auth: manager has full access', () => {
  const auth = createAuthService();
  const u = auth.authenticate('tok-admin-xyz');
  assert.ok(auth.hasPermission(u, 'users:manage'));
  assert.ok(auth.hasPermission(u, 'task:batch_create'));
});

test('auth: listUsers returns all users', () => {
  const auth = createAuthService();
  assert.ok(auth.listUsers().length >= 4);
});

test('auth: getOperators returns only operators', () => {
  const auth = createAuthService();
  const ops = auth.getOperators();
  assert.ok(ops.length >= 2);
  assert.ok(ops.every(u => u.role === ROLES.OPERATOR));
});

// ═══ Phase 2: Batch Create ═══════════════════════════════════════
test('batch: creates tasks for all products', () => {
  const s = createPilotService({ products: [validProduct, validProduct2, incompleteProduct] });
  const created = s.batchCreateTasks({ createdBy: 'sup-1' });
  assert.equal(created.length, 3);
});

test('batch: skips duplicates', () => {
  const s = createPilotService({ products: [validProduct] });
  s.batchCreateTasks({ createdBy: 'sup-1' });
  assert.equal(s.batchCreateTasks({ createdBy: 'sup-1' }).length, 0);
});

// ═══ Phase 2: Smart Assign ═══════════════════════════════════════
test('smart-assign: picks operator with fewest active tasks', () => {
  const s = createPilotService({ products: [validProduct, validProduct2] });
  s.batchCreateTasks({ createdBy: 'sup-1' });
  const ops = [{ id: 'op-ali' }, { id: 'op-sara' }];
  const first = s.smartAssign({ operators: ops });
  assert.equal(first.assignedOperatorId, 'op-ali');
  const second = s.smartAssign({ operators: ops });
  assert.equal(second.assignedOperatorId, 'op-sara');
});

test('smart-assign: returns null when queue empty', () => {
  const s = createPilotService({ products: [] });
  assert.equal(s.smartAssign({ operators: [{ id: 'op-1' }] }), null);
});

// ═══ Phase 2: Workload & StatsV2 ═════════════════════════════════
test('workload tracks active and completed', () => {
  const s = createPilotService({ products: [validProduct, validProduct2] });
  s.batchCreateTasks({ createdBy: 'sup-1' });
  const t1 = s.claimNextTask({ operatorId: 'op-ali' });
  s.markSubmitted({ taskId: t1.id, operatorId: 'op-ali' });
  s.confirmTask({ taskId: t1.id, supervisorId: 'sup-1' });
  s.claimNextTask({ operatorId: 'op-ali' });
  const w = s.getWorkload();
  assert.equal(w['op-ali'].active, 1);
  assert.equal(w['op-ali'].completed, 1);
});

test('statsV2 includes queue depth and workload', () => {
  const s = createPilotService({ products: [validProduct, incompleteProduct] });
  s.batchCreateTasks({ createdBy: 'sup-1' });
  const stats = s.getStatsV2();
  assert.ok(stats.queueDepth >= 1);
  assert.ok(stats.needsReviewCount >= 1);
  assert.ok(stats.workload);
});
