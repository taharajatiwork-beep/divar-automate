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
  attributes: {
    brand: 'Samsung',
    model: 'Galaxy A55 5G',
    storage: '256GB',
  },
  images: ['https://cdn.example.test/phone-001/01.jpg'],
};

test('creates a ready task from a valid product using the active mapping', () => {
  const service = createPilotService({ products: [validProduct] });

  const task = service.createTask({ productId: validProduct.id, createdBy: 'supervisor-1' });

  assert.equal(task.status, TASK_STATUS.READY_FOR_ASSIGNMENT);
  assert.equal(task.productId, validProduct.id);
  assert.equal(task.mappingVersion, 1);
  assert.deepEqual(task.payload, {
    title: validProduct.title,
    description: validProduct.description,
    price: validProduct.price,
    category: 'mobile-phones',
    attributes: {
      brand: 'Samsung',
      model: 'Galaxy A55 5G',
      storage: '256GB',
    },
    images: validProduct.images,
  });
});

test('marks a task as needs review instead of ready when a required mapped field is absent', () => {
  const incompleteProduct = {
    ...validProduct,
    id: 'phone-002',
    attributes: { ...validProduct.attributes, model: '' },
  };
  const service = createPilotService({ products: [incompleteProduct] });

  const task = service.createTask({ productId: incompleteProduct.id, createdBy: 'supervisor-1' });

  assert.equal(task.status, TASK_STATUS.NEEDS_REVIEW);
  assert.deepEqual(task.validationErrors, [
    { field: 'attributes.model', message: 'مقدار الزامی «مدل» وارد نشده است.' },
  ]);
});

test('allows the assigned operator to claim one ready task and exposes a sanitized prefill payload', () => {
  const service = createPilotService({ products: [validProduct] });
  const createdTask = service.createTask({ productId: validProduct.id, createdBy: 'supervisor-1' });

  const claimedTask = service.claimNextTask({ operatorId: 'operator-1' });
  const prefill = service.getPrefillPayload({ taskId: createdTask.id, operatorId: 'operator-1' });

  assert.equal(claimedTask.id, createdTask.id);
  assert.equal(claimedTask.status, TASK_STATUS.ASSIGNED);
  assert.deepEqual(prefill, {
    taskId: createdTask.id,
    status: TASK_STATUS.ASSIGNED,
    fields: {
      title: validProduct.title,
      description: validProduct.description,
      price: validProduct.price,
      category: 'mobile-phones',
      attributes: validProduct.attributes,
    },
    images: validProduct.images,
  });
});

test('does not expose a prefill payload to an operator who is not assigned to the task', () => {
  const service = createPilotService({ products: [validProduct] });
  const task = service.createTask({ productId: validProduct.id, createdBy: 'supervisor-1' });
  service.claimNextTask({ operatorId: 'operator-1' });

  assert.throws(
    () => service.getPrefillPayload({ taskId: task.id, operatorId: 'operator-2' }),
    /به این وظیفه دسترسی ندارید/,
  );
});
