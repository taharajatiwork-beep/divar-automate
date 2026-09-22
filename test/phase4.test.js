import test from 'node:test';
import assert from 'node:assert/strict';

import { createPilotService, TASK_STATUS } from '../src/pilot-service.js';
import { createCategoryService } from '../src/categories.js';

// ═══ Category Service Tests ═══════════════════════════════════════

test('categories: lists all built-in templates', () => {
  const cats = createCategoryService();
  const templates = cats.listTemplates();
  assert.ok(templates.length >= 3);
  const ids = templates.map(t => t.id);
  assert.ok(ids.includes('mobile-phones'));
  assert.ok(ids.includes('laptops'));
  assert.ok(ids.includes('accessories'));
});

test('categories: get active templates', () => {
  const cats = createCategoryService();
  const active = cats.getActiveTemplates();
  assert.equal(active.length, 3);
  assert.ok(active.every(t => t.status === 'active'));
});

test('categories: get template by id', () => {
  const cats = createCategoryService();
  const t = cats.getTemplate('laptops');
  assert.equal(t.id, 'laptops');
  assert.equal(t.label, 'لپ‌تاپ');
  assert.equal(t.icon, '💻');
  assert.ok(t.fields.length > 0);
});

test('categories: get template for product category', () => {
  const cats = createCategoryService();
  const t = cats.getTemplateForProduct('accessories');
  assert.ok(t);
  assert.equal(t.id, 'accessories');
});

test('categories: returns null for unknown category', () => {
  const cats = createCategoryService();
  assert.equal(cats.getTemplateForProduct('furniture'), null);
});

test('categories: update template increments version', () => {
  const cats = createCategoryService();
  const original = cats.getTemplate('mobile-phones');
  const origVersion = original.version;
  cats.updateTemplate({
    templateId: 'mobile-phones',
    fields: [...original.fields, { target: 'color', source: 'color', label: 'رنگ', required: false }],
    supervisorId: 'sup-1',
  });
  const updated = cats.getTemplate('mobile-phones');
  assert.equal(updated.version, origVersion + 1);
  assert.equal(updated.status, 'pending_review');
});

test('categories: review template can approve', () => {
  const cats = createCategoryService();
  cats.updateTemplate({ templateId: 'mobile-phones', fields: [{ target: 'test' }], supervisorId: 'sup-1' });
  const reviewed = cats.reviewTemplate({ templateId: 'mobile-phones', approved: true, notes: 'تایید', reviewerId: 'mgr-1' });
  assert.equal(reviewed.status, 'active');
  assert.equal(reviewed.reviewNotes, 'تایید');
});

test('categories: pending review lists templates awaiting review', () => {
  const cats = createCategoryService();
  cats.updateTemplate({ templateId: 'laptops', fields: [{ target: 'test' }], supervisorId: 'sup-1' });
  const pending = cats.getPendingReview();
  assert.ok(pending.length >= 1);
  assert.ok(pending.some(t => t.id === 'laptops'));
});

test('categories: review history is tracked', () => {
  const cats = createCategoryService();
  cats.updateTemplate({ templateId: 'accessories', fields: [{ target: 'test' }], supervisorId: 'sup-1' });
  cats.reviewTemplate({ templateId: 'accessories', approved: true, reviewerId: 'mgr-1' });
  const history = cats.getReviewHistory({ templateId: 'accessories' });
  assert.ok(history.length >= 2); // update + review
  assert.ok(history.some(h => h.action === 'template_updated'));
  assert.ok(history.some(h => h.action === 'template_approved'));
});

// ═══ Multi-Category Pilot Service ═════════════════════════════════

const laptopProduct = {
  id: 'lap-001',
  title: 'لپ‌تاپ ایسوس ZenBook 14',
  description: 'لپ‌تاپ نو.',
  price: 45000000,
  category: 'laptops',
  attributes: { brand: 'ASUS', model: 'ZenBook 14', cpu: 'Intel Ultra 7', ram: '16GB', storage: '512GB SSD', gpu: 'Intel Arc' },
  images: ['https://cdn.example.test/lap-001/01.jpg'],
};

const accessoryProduct = {
  id: 'acc-001',
  title: 'هدفون سامسونگ Galaxy Buds2 Pro',
  description: 'هدفون اصل.',
  price: 3800000,
  category: 'accessories',
  attributes: { brand: 'Samsung', type: 'هدفون بی‌سیم' },
  images: ['https://cdn.example.test/acc-001/01.jpg'],
};

const phoneProduct = {
  id: 'phone-001',
  title: 'گوشی سامسونگ Galaxy A55',
  description: 'سالم.',
  price: 22500000,
  category: 'mobile-phones',
  attributes: { brand: 'Samsung', model: 'Galaxy A55', storage: '256GB' },
  images: ['https://cdn.example.test/phone-001/01.jpg'],
};

test('multi-category: creates task for laptops', () => {
  const cats = createCategoryService();
  const s = createPilotService({ products: [laptopProduct], categoryService: cats });
  const t = s.createTask({ productId: 'lap-001', createdBy: 'sup-1' });
  assert.equal(t.status, TASK_STATUS.READY_FOR_ASSIGNMENT);
  assert.equal(t.category, 'laptops');
  assert.equal(t.mappingId, 'laptops');
});

test('multi-category: creates task for accessories', () => {
  const cats = createCategoryService();
  const s = createPilotService({ products: [accessoryProduct], categoryService: cats });
  const t = s.createTask({ productId: 'acc-001', createdBy: 'sup-1' });
  assert.equal(t.status, TASK_STATUS.READY_FOR_ASSIGNMENT);
  assert.equal(t.category, 'accessories');
});

test('multi-category: batch creates across all categories', () => {
  const cats = createCategoryService();
  const s = createPilotService({ products: [phoneProduct, laptopProduct, accessoryProduct], categoryService: cats });
  const created = s.batchCreateTasks({ createdBy: 'sup-1' });
  assert.equal(created.length, 3);
  const categories = created.map(t => t.category);
  assert.ok(categories.includes('mobile-phones'));
  assert.ok(categories.includes('laptops'));
  assert.ok(categories.includes('accessories'));
});

test('multi-category: batch can filter by category', () => {
  const cats = createCategoryService();
  const s = createPilotService({ products: [phoneProduct, laptopProduct, accessoryProduct], categoryService: cats });
  const created = s.batchCreateTasks({ createdBy: 'sup-1', category: 'laptops' });
  assert.equal(created.length, 1);
  assert.equal(created[0].category, 'laptops');
});

test('multi-category: listTasks filter by category', () => {
  const cats = createCategoryService();
  const s = createPilotService({ products: [phoneProduct, laptopProduct], categoryService: cats });
  s.batchCreateTasks({ createdBy: 'sup-1' });
  const phones = s.listTasks({ category: 'mobile-phones' });
  const laptops = s.listTasks({ category: 'laptops' });
  assert.equal(phones.length, 1);
  assert.equal(laptops.length, 1);
});

test('multi-category: statsV2 includes byCategory', () => {
  const cats = createCategoryService();
  const s = createPilotService({ products: [phoneProduct, laptopProduct, accessoryProduct], categoryService: cats });
  s.batchCreateTasks({ createdBy: 'sup-1' });
  const stats = s.getStatsV2();
  assert.ok(stats.byCategory);
  assert.equal(stats.byCategory['mobile-phones'], 1);
  assert.equal(stats.byCategory['laptops'], 1);
  assert.equal(stats.byCategory['accessories'], 1);
});

test('multi-category: fails for unknown category', () => {
  const cats = createCategoryService();
  const unknownProduct = { ...phoneProduct, id: 'x-1', category: 'furniture' };
  const s = createPilotService({ products: [unknownProduct], categoryService: cats });
  assert.throws(() => s.createTask({ productId: 'x-1', createdBy: 'sup-1' }), /قالب نگاشتی/);
});

test('multi-category: laptop validation checks brand', () => {
  const cats = createCategoryService();
  const incompleteLaptop = { ...laptopProduct, id: 'lap-002', attributes: { brand: '', model: 'X', cpu: 'Y', ram: 'Z', storage: 'W', gpu: 'V' } };
  const s = createPilotService({ products: [incompleteLaptop], categoryService: cats });
  const t = s.createTask({ productId: 'lap-002', createdBy: 'sup-1' });
  assert.equal(t.status, TASK_STATUS.NEEDS_REVIEW);
  assert.ok(t.validationErrors.some(e => e.field === 'attributes.brand'));
});
