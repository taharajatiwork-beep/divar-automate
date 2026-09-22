import test from 'node:test';
import assert from 'node:assert/strict';

import { createQuotaService } from '../src/quota.js';
import { createImageService } from '../src/images.js';

// ═══ Quota Tests ═══════════════════════════════════════════════════

test('quota: initializes with default daily limit', () => {
  const q = createQuotaService();
  const status = q.getStatus({ accountId: 'acct-1' });
  assert.equal(status.dailyLimit, 20);
  assert.equal(status.postedToday, 0);
  assert.equal(status.status, 'active');
});

test('quota: records a post and updates count', () => {
  const q = createQuotaService();
  q.recordPost({ accountId: 'acct-1' });
  q.recordPost({ accountId: 'acct-1' });
  const status = q.getStatus({ accountId: 'acct-1' });
  assert.equal(status.postedToday, 2);
  assert.equal(status.remaining, 18);
});

test('quota: blocks when quota reached', () => {
  const q = createQuotaService();
  for (let i = 0; i < 20; i++) q.recordPost({ accountId: 'acct-1' });
  const result = q.canPost({ accountId: 'acct-1' });
  assert.equal(result.allowed, false);
  assert.ok(result.reason.includes('تمام شده'));
});

test('quota: warns near threshold (80%)', () => {
  const q = createQuotaService();
  for (let i = 0; i < 16; i++) q.recordPost({ accountId: 'acct-1' });
  const result = q.canPost({ accountId: 'acct-1' });
  assert.equal(result.allowed, true);
  assert.equal(result.warning, true);
});

test('quota: allows within safe range', () => {
  const q = createQuotaService();
  for (let i = 0; i < 10; i++) q.recordPost({ accountId: 'acct-1' });
  const result = q.canPost({ accountId: 'acct-1' });
  assert.equal(result.allowed, true);
  assert.equal(result.warning, false);
});

test('quota: custom daily limit', () => {
  const q = createQuotaService();
  q.setDailyLimit({ accountId: 'acct-1', limit: 5 });
  for (let i = 0; i < 5; i++) q.recordPost({ accountId: 'acct-1' });
  const result = q.canPost({ accountId: 'acct-1' });
  assert.equal(result.allowed, false);
});

test('quota: tracks multiple accounts independently', () => {
  const q = createQuotaService();
  q.recordPost({ accountId: 'acct-1' });
  q.recordPost({ accountId: 'acct-1' });
  q.recordPost({ accountId: 'acct-2' });
  assert.equal(q.getStatus({ accountId: 'acct-1' }).postedToday, 2);
  assert.equal(q.getStatus({ accountId: 'acct-2' }).postedToday, 1);
});

test('quota: can pause and unpause account', () => {
  const q = createQuotaService();
  q.setAccountStatus({ accountId: 'acct-1', status: 'paused' });
  const result = q.canPost({ accountId: 'acct-1' });
  assert.equal(result.allowed, false);
  q.setAccountStatus({ accountId: 'acct-1', status: 'active' });
  const result2 = q.canPost({ accountId: 'acct-1' });
  assert.equal(result2.allowed, true);
});

test('quota: getAllStatus returns all accounts', () => {
  const q = createQuotaService();
  q.getStatus({ accountId: 'a' });
  q.getStatus({ accountId: 'b' });
  const all = q.getAllStatus();
  assert.equal(all.length, 2);
});

// ═══ Image Tests ═══════════════════════════════════════════════════

test('images: prepares manifest from valid URLs', () => {
  const img = createImageService();
  const manifest = img.prepareForTask({
    taskId: 'T-001',
    imageUrls: [
      'https://cdn.example.com/01.jpg',
      'https://cdn.example.com/02.png',
    ],
  });
  assert.equal(manifest.status, 'ready');
  assert.equal(manifest.validCount, 2);
  assert.equal(manifest.errors.length, 0);
  assert.equal(manifest.images[0].filename, 'ad-T-001-01.jpg');
  assert.equal(manifest.images[1].filename, 'ad-T-001-02.png');
});

test('images: flags invalid URLs', () => {
  const img = createImageService();
  const manifest = img.prepareForTask({
    taskId: 'T-002',
    imageUrls: ['not-a-url', 'https://cdn.example.com/ok.jpg'],
  });
  assert.equal(manifest.status, 'has_errors');
  assert.equal(manifest.validCount, 1);
  assert.ok(manifest.errors.length > 0);
});

test('images: flags unsupported extensions', () => {
  const img = createImageService();
  const manifest = img.prepareForTask({
    taskId: 'T-003',
    imageUrls: ['https://cdn.example.com/file.gif'],
  });
  assert.equal(manifest.status, 'has_errors');
  assert.ok(manifest.errors[0].includes('پشتیبانی نمی‌شود'));
});

test('images: handles empty image list', () => {
  const img = createImageService();
  const manifest = img.prepareForTask({ taskId: 'T-004', imageUrls: [] });
  assert.equal(manifest.status, 'needs_images');
  assert.ok(manifest.errors.length > 0);
});

test('images: limits to max 10 images', () => {
  const img = createImageService();
  const urls = Array.from({ length: 15 }, (_, i) => `https://cdn.example.com/${i}.jpg`);
  const manifest = img.prepareForTask({ taskId: 'T-005', imageUrls: urls });
  assert.equal(manifest.totalCount, 10);
});

test('images: getManifest returns null for unknown task', () => {
  const img = createImageService();
  assert.equal(img.getManifest({ taskId: 'unknown' }), null);
});

test('images: isReady checks status', () => {
  const img = createImageService();
  img.prepareForTask({ taskId: 'T-006', imageUrls: ['https://cdn.example.com/01.jpg'] });
  assert.equal(img.isReady({ taskId: 'T-006' }), true);
  assert.equal(img.isReady({ taskId: 'T-unknown' }), false);
});

test('images: summary counts correctly', () => {
  const img = createImageService();
  img.prepareForTask({ taskId: 'T-1', imageUrls: ['https://a.com/1.jpg'] });
  img.prepareForTask({ taskId: 'T-2', imageUrls: ['bad-url'] });
  const summary = img.getSummary();
  assert.equal(summary.readyTasks, 1);
  assert.equal(summary.errorTasks, 1);
  assert.equal(summary.totalImages, 1);
});
