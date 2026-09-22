import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPilotService,
  TASK_STATUS,
} from '../src/pilot-service.js';

const validProduct = {
  id: 'phone-001',
  title: 'گوشی سامسونگ Galaxy A55 5G',
  description: 'دستگاه کاملاً سالم است و با جعبه و لوازم جانبی عرضه می‌شود.',
  price: 22500000,
  category: 'mobile-phones',
  attributes: { brand: 'Samsung', model: 'Galaxy A55 5G', storage: '256GB' },
  images: ['https://cdn.example.test/phone-001/01.jpg'],
};

const incompleteProduct = {
  ...validProduct,
  id: 'phone-002',
  attributes: { brand: 'Xiaomi', model: '', storage: '128GB' },
};

// ─── Task Creation ──────────────────────────────────────────────────

test('creates a ready task from a valid product', () => {
  const service = createPilotService({ products: [validProduct] });
  const task = service.createTask({ productId: validProduct.id, createdBy: 'supervisor-1' });

  assert.equal(task.status, TASK_STATUS.READY_FOR_ASSIGNMENT);
  assert.equal(task.productId, validProduct.id);
  assert.equal(task.mappingVersion, 1);
  assert.equal(task.validationErrors.length, 0);
  assert.equal(task.payload.title, validProduct.title);
  assert.equal(task.payload.attributes.model, 'Galaxy A55 5G');
});

test('creates needs_review task when a required field is missing', () => {
  const service = createPilotService({ products: [incompleteProduct] });
  const task = service.createTask({ productId: incompleteProduct.id, createdBy: 'supervisor-1' });

  assert.equal(task.status, TASK_STATUS.NEEDS_REVIEW);
  assert.equal(task.validationErrors.length, 1);
  assert.equal(task.validationErrors[0].field, 'attributes.model');
});

test('throws for non-existent product', () => {
  const service = createPilotService({ products: [] });
  assert.throws(
    () => service.createTask({ productId: 'nope', createdBy: 'supervisor-1' }),
    /محصول پیدا نشد/,
  );
});

test('creates an audit log entry on task creation', () => {
  const service = createPilotService({ products: [validProduct] });
  service.createTask({ productId: validProduct.id, createdBy: 'supervisor-1' });
  const logs = service.getAuditLog();

  assert.equal(logs.length, 1);
  assert.equal(logs[0].action, 'task_created');
  assert.equal(logs[0].operatorId, 'supervisor-1');
});

// ─── Claim & Assign ────────────────────────────────────────────────

test('claims the next ready task and assigns it to an operator', () => {
  const service = createPilotService({ products: [validProduct] });
  service.createTask({ productId: validProduct.id, createdBy: 'supervisor-1' });

  const claimed = service.claimNextTask({ operatorId: 'op-1' });

  assert.equal(claimed.status, TASK_STATUS.ASSIGNED);
  assert.equal(claimed.assignedOperatorId, 'op-1');
  assert.ok(claimed.assignedAt);
});

test('returns null when no ready tasks exist', () => {
  const service = createPilotService({ products: [] });
  const claimed = service.claimNextTask({ operatorId: 'op-1' });
  assert.equal(claimed, null);
});

test('creates an audit log entry on claim', () => {
  const service = createPilotService({ products: [validProduct] });
  service.createTask({ productId: validProduct.id, createdBy: 'supervisor-1' });
  service.claimNextTask({ operatorId: 'op-1' });
  const logs = service.getAuditLog();

  assert.equal(logs.length, 2);
  assert.equal(logs[1].action, 'task_assigned');
});

// ─── Prefill ───────────────────────────────────────────────────────

test('returns prefill payload for the assigned operator', () => {
  const service = createPilotService({ products: [validProduct] });
  const task = service.createTask({ productId: validProduct.id, createdBy: 'supervisor-1' });
  service.claimNextTask({ operatorId: 'op-1' });

  const prefill = service.getPrefillPayload({ taskId: task.id, operatorId: 'op-1' });

  assert.equal(prefill.taskId, task.id);
  assert.equal(prefill.fields.title, validProduct.title);
  assert.ok(Array.isArray(prefill.images));
});

test('rejects prefill request from wrong operator', () => {
  const service = createPilotService({ products: [validProduct] });
  const task = service.createTask({ productId: validProduct.id, createdBy: 'supervisor-1' });
  service.claimNextTask({ operatorId: 'op-1' });

  assert.throws(
    () => service.getPrefillPayload({ taskId: task.id, operatorId: 'op-2' }),
    /دسترسی ندارید/,
  );
});

// ─── Field Editing ──────────────────────────────────────────────────

test('allows the operator to edit a payload field and logs the change', () => {
  const service = createPilotService({ products: [validProduct] });
  const task = service.createTask({ productId: validProduct.id, createdBy: 'supervisor-1' });
  service.claimNextTask({ operatorId: 'op-1' });

  const updated = service.editTaskField({
    taskId: task.id,
    operatorId: 'op-1',
    field: 'price',
    newValue: 21000000,
  });

  assert.equal(updated.payload.price, 21000000);
  assert.equal(updated.status, TASK_STATUS.PREFILL_READY);
  assert.equal(updated.fieldEdits.length, 1);
  assert.equal(updated.fieldEdits[0].field, 'price');
  assert.equal(updated.fieldEdits[0].oldValue, validProduct.price);
  assert.equal(updated.fieldEdits[0].newValue, 21000000);

  const logs = service.getAuditLog({ taskId: task.id });
  assert.ok(logs.some(l => l.action === 'field_edited' && l.field === 'price'));
});

test('rejects field edit from wrong operator', () => {
  const service = createPilotService({ products: [validProduct] });
  const task = service.createTask({ productId: validProduct.id, createdBy: 'supervisor-1' });
  service.claimNextTask({ operatorId: 'op-1' });

  assert.throws(
    () => service.editTaskField({ taskId: task.id, operatorId: 'op-2', field: 'price', newValue: 1000 }),
    /دسترسی ندارید/,
  );
});

test('does not create audit entry when edited value is the same', () => {
  const service = createPilotService({ products: [validProduct] });
  const task = service.createTask({ productId: validProduct.id, createdBy: 'supervisor-1' });
  service.claimNextTask({ operatorId: 'op-1' });
  const logsBefore = service.getAuditLog().length;

  service.editTaskField({ taskId: task.id, operatorId: 'op-1', field: 'price', newValue: validProduct.price });

  assert.equal(service.getAuditLog().length, logsBefore);
});

// ─── Submit (Human confirms form is ready) ─────────────────────────

test('allows operator to mark task as submitted', () => {
  const service = createPilotService({ products: [validProduct] });
  const task = service.createTask({ productId: validProduct.id, createdBy: 'supervisor-1' });
  service.claimNextTask({ operatorId: 'op-1' });

  const submitted = service.markSubmitted({ taskId: task.id, operatorId: 'op-1' });

  assert.equal(submitted.status, TASK_STATUS.SUBMITTED);
  assert.ok(submitted.submittedAt);
});

test('can submit directly from assigned (without field edits)', () => {
  const service = createPilotService({ products: [validProduct] });
  const task = service.createTask({ productId: validProduct.id, createdBy: 'supervisor-1' });
  service.claimNextTask({ operatorId: 'op-1' });

  const submitted = service.markSubmitted({ taskId: task.id, operatorId: 'op-1' });
  assert.equal(submitted.status, TASK_STATUS.SUBMITTED);
});

test('rejects submit from wrong operator', () => {
  const service = createPilotService({ products: [validProduct] });
  const task = service.createTask({ productId: validProduct.id, createdBy: 'supervisor-1' });
  service.claimNextTask({ operatorId: 'op-1' });

  assert.throws(
    () => service.markSubmitted({ taskId: task.id, operatorId: 'op-2' }),
    /دسترسی ندارید/,
  );
});

// ─── Confirm / Reject (Supervisor) ─────────────────────────────────

test('supervisor confirms a submitted task', () => {
  const service = createPilotService({ products: [validProduct] });
  const task = service.createTask({ productId: validProduct.id, createdBy: 'supervisor-1' });
  service.claimNextTask({ operatorId: 'op-1' });
  service.markSubmitted({ taskId: task.id, operatorId: 'op-1' });

  const confirmed = service.confirmTask({ taskId: task.id, supervisorId: 'supervisor-1' });

  assert.equal(confirmed.status, TASK_STATUS.CONFIRMED);
  assert.ok(confirmed.confirmedAt);
});

test('supervisor rejects a submitted task with a reason', () => {
  const service = createPilotService({ products: [validProduct] });
  const task = service.createTask({ productId: validProduct.id, createdBy: 'supervisor-1' });
  service.claimNextTask({ operatorId: 'op-1' });
  service.markSubmitted({ taskId: task.id, operatorId: 'op-1' });

  const rejected = service.rejectTask({
    taskId: task.id,
    supervisorId: 'supervisor-1',
    reason: 'قیمت نادرست ثبت شده',
  });

  assert.equal(rejected.status, TASK_STATUS.REJECTED);
  assert.equal(rejected.rejectionReason, 'قیمت نادرست ثبت شده');
});

test('cannot confirm a task that is not submitted', () => {
  const service = createPilotService({ products: [validProduct] });
  const task = service.createTask({ productId: validProduct.id, createdBy: 'supervisor-1' });
  assert.throws(
    () => service.confirmTask({ taskId: task.id, supervisorId: 'supervisor-1' }),
    /فقط وظایف ثبت‌شده قابل تأیید/,
  );
});

// ─── Reassign ──────────────────────────────────────────────────────

test('supervisor reassigns a task to another operator', () => {
  const service = createPilotService({ products: [validProduct] });
  const task = service.createTask({ productId: validProduct.id, createdBy: 'supervisor-1' });
  service.claimNextTask({ operatorId: 'op-1' });

  const reassigned = service.reassignTask({ taskId: task.id, newOperatorId: 'op-2', supervisorId: 'supervisor-1' });

  assert.equal(reassigned.assignedOperatorId, 'op-2');
  assert.equal(reassigned.status, TASK_STATUS.ASSIGNED);
  const logs = service.getAuditLog({ taskId: task.id });
  assert.ok(logs.some(l => l.action === 'task_reassigned'));
});

// ─── Stats ─────────────────────────────────────────────────────────

test('returns accurate dashboard statistics', () => {
  const service = createPilotService({ products: [validProduct] });
  const t1 = service.createTask({ productId: validProduct.id, createdBy: 'supervisor-1' });
  service.claimNextTask({ operatorId: 'op-1' });
  service.markSubmitted({ taskId: t1.id, operatorId: 'op-1' });
  service.confirmTask({ taskId: t1.id, supervisorId: 'supervisor-1' });

  const stats = service.getStats();

  assert.equal(stats.total, 1);
  assert.equal(stats.byStatus[TASK_STATUS.CONFIRMED], 1);
  assert.equal(stats.confirmationRate, 100);
  assert.ok(stats.operators['op-1']);
});

// ─── Full Lifecycle ────────────────────────────────────────────────

test('full lifecycle: create → claim → edit → submit → confirm', () => {
  const service = createPilotService({ products: [validProduct] });
  const task = service.createTask({ productId: validProduct.id, createdBy: 'supervisor-1' });

  assert.equal(task.status, TASK_STATUS.READY_FOR_ASSIGNMENT);

  const claimed = service.claimNextTask({ operatorId: 'op-1' });
  assert.equal(claimed.status, TASK_STATUS.ASSIGNED);

  service.editTaskField({ taskId: task.id, operatorId: 'op-1', field: 'description', newValue: 'توضیحات ویرایش‌شده توسط اپراتور.' });
  const afterEdit = service.getPrefillPayload({ taskId: task.id, operatorId: 'op-1' });
  assert.equal(afterEdit.fields.description, 'توضیحات ویرایش‌شده توسط اپراتور.');

  const submitted = service.markSubmitted({ taskId: task.id, operatorId: 'op-1' });
  assert.equal(submitted.status, TASK_STATUS.SUBMITTED);

  const confirmed = service.confirmTask({ taskId: task.id, supervisorId: 'supervisor-1' });
  assert.equal(confirmed.status, TASK_STATUS.CONFIRMED);

  const allLogs = service.getAuditLog({ taskId: task.id });
  assert.ok(allLogs.length >= 4);
  assert.ok(allLogs.some(l => l.action === 'task_created'));
  assert.ok(allLogs.some(l => l.action === 'task_assigned'));
  assert.ok(allLogs.some(l => l.action === 'field_edited'));
  assert.ok(allLogs.some(l => l.action === 'task_submitted'));
  assert.ok(allLogs.some(l => l.action === 'task_confirmed'));
});
