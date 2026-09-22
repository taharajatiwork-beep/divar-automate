// ─── SQLite Database Layer ───────────────────────────────────────────
// Persistent storage for products, tasks, audit logs, users.
// Zero external dependencies — uses better-sqlite3 WASM or plain JSON fallback.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// ─── JSON-file backed "database" (zero deps) ──────────────────────
// Later upgradeable to SQLite via better-sqlite3

function loadJson(name) {
  const path = join(DATA_DIR, `${name}.json`);
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function saveJson(name, data) {
  const path = join(DATA_DIR, `${name}.json`);
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}

let _seq = { task: 0, audit: 0, product: 0 };
const seqPath = join(DATA_DIR, '_seq.json');
if (existsSync(seqPath)) {
  Object.assign(_seq, JSON.parse(readFileSync(seqPath, 'utf-8')));
}

function saveSeq() {
  writeFileSync(seqPath, JSON.stringify(_seq), 'utf-8');
}

function nextId(type) {
  _seq[type] = (_seq[type] || 0) + 1;
  saveSeq();
  return _seq[type];
}

// ─── Products ───────────────────────────────────────────────────────

const DEFAULT_PRODUCTS = [
  // Mobile Phones
  { id: 'P001', title: 'گوشی سامسونگ Galaxy A55 5G', description: 'دستگاه کاملاً سالم با جعبه و لوازم جانبی اصلی. رنگ: آبی.', price: 22500000, category: 'mobile-phones', attributes: { brand: 'Samsung', model: 'Galaxy A55 5G', storage: '256GB', color: 'آبی' }, images: ['/images/P001_01.jpg', '/images/P001_02.jpg'], city: 'تهران' },
  { id: 'P002', title: 'گوشی شیائومی Redmi Note 13', description: 'موبایل کارکرده و تمیز. شارژر اصلی موجود.', price: 10500000, category: 'mobile-phones', attributes: { brand: 'Xiaomi', model: 'Redmi Note 13', storage: '128GB', color: 'مشکی' }, images: ['/images/P002_01.jpg'], city: 'تهران' },
  { id: 'P003', title: 'گوشی اپل iPhone 15 Pro', description: 'آیفون ۱۵ پرو ۲۵۶ گیگ. خاکستری تیتانیوم. فعال تا ۱۴۰۰.', price: 72000000, category: 'mobile-phones', attributes: { brand: 'Apple', model: 'iPhone 15 Pro', storage: '256GB', color: 'خاکستری' }, images: ['/images/P003_01.jpg', '/images/P003_02.jpg'], city: 'اصفهان' },
  { id: 'P004', title: 'گوشی سامسونگ Galaxy S24 Ultra', description: 'گلکسی S24 اولترا. نو. با گارانتی سامسونگ.', price: 85000000, category: 'mobile-phones', attributes: { brand: 'Samsung', model: 'Galaxy S24 Ultra', storage: '512GB', color: 'بنفش' }, images: ['/images/P004_01.jpg'], city: 'تهران' },
  { id: 'P005', title: 'گوشی پوکو X6 Pro', description: 'پوکو X6 پرو. سالم. با محافظ صفحه.', price: 14000000, category: 'mobile-phones', attributes: { brand: 'POCO', model: 'X6 Pro', storage: '256GB', color: 'سرمه‌ای' }, images: [], city: 'شیراز' },

  // Laptops
  { id: 'P006', title: 'لپ‌تاپ ایسوس ZenBook 14 OLED', description: 'لپ‌تاپ نو با گارانتی رسمی. صفحه OLED عالی.', price: 48000000, category: 'laptops', attributes: { brand: 'ASUS', model: 'ZenBook 14 UX3405', cpu: 'Intel Core Ultra 7 155H', ram: '16GB', storage: '512GB SSD', gpu: 'Intel Arc iGPU', display: '14" OLED 2.8K' }, images: ['/images/P006_01.jpg'], city: 'تهران' },
  { id: 'P007', title: 'لپ‌تاپ اپل MacBook Air M3 15"', description: 'مک‌بوک ایر M3. ۱۵ اینچ. فوق‌العاده سبک.', price: 65000000, category: 'laptops', attributes: { brand: 'Apple', model: 'MacBook Air 15" M3', cpu: 'Apple M3', ram: '16GB', storage: '512GB SSD', gpu: '10-core GPU', display: '15.3" Liquid Retina' }, images: ['/images/P007_01.jpg', '/images/P007_02.jpg'], city: 'تهران' },
  { id: 'P008', title: 'لپ‌تاپ لنوو Legion Pro 5', description: 'لپ‌تاپ گیمینگ. RTX 4070. مناسب بازی و رندر.', price: 78000000, category: 'laptops', attributes: { brand: 'Lenovo', model: 'Legion Pro 5 16IRX9', cpu: 'Intel Core i9-14900HX', ram: '32GB', storage: '1TB SSD', gpu: 'RTX 4070 8GB', display: '16" IPS 240Hz' }, images: ['/images/P008_01.jpg'], city: 'تبریز' },

  // Accessories
  { id: 'P009', title: 'هدفون سامسونگ Galaxy Buds2 Pro', description: 'هدفون بی‌سیم اصل. نویزگیر فعال. وضعیت: نو.', price: 3800000, category: 'accessories', attributes: { brand: 'Samsung', type: 'هدفون بی‌سیم', color: 'سفید' }, images: ['/images/P009_01.jpg'], city: 'تهران' },
  { id: 'P010', title: 'قاب محافظ آیفون 15 Pro Max', description: 'قاب سیلیکونی اصلی اپل. رنگ: نیمه‌شفاف.', price: 950000, category: 'accessories', attributes: { brand: 'Apple', type: 'قاب محافظ', color: 'نیمه‌شفاف' }, images: ['/images/P010_01.jpg'], city: 'تهران' },
  { id: 'P011', title: 'شارژر بی‌سیم سامسونگ 15W', description: 'شارژر وایرلس اصلی سامسونگ. با کابل.', price: 1200000, category: 'accessories', attributes: { brand: 'Samsung', type: 'شارژر بی‌سیم', power: '15W' }, images: ['/images/P011_01.jpg'], city: 'کرمان' },
];

// ─── Database API ───────────────────────────────────────────────────

export function createDatabase() {
  // Initialize products if empty
  let products = loadJson('products');
  if (products.length === 0) {
    products = DEFAULT_PRODUCTS.map(p => ({
      ...p,
      id: `P${String(nextId('product')).padStart(3, '0')}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active', // active | archived
    }));
    // Override IDs to match DEFAULT
    products = DEFAULT_PRODUCTS.map(p => ({ ...p, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: 'active' }));
    saveJson('products', products);
  }

  let tasks = loadJson('tasks');
  let auditLogs = loadJson('audit');

  function saveProducts() { saveJson('products', products); }
  function saveTasks() { saveJson('tasks', tasks); }
  function saveAudit() { saveJson('audit', auditLogs); }

  return {
    // ── Products ──────────────────────────────────────────────────
    getProducts({ category, status, search } = {}) {
      let result = [...products];
      if (category) result = result.filter(p => p.category === category);
      if (status) result = result.filter(p => p.status === status);
      if (search) {
        const q = search.toLowerCase();
        result = result.filter(p =>
          p.title.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          (p.attributes?.brand || '').toLowerCase().includes(q) ||
          (p.attributes?.model || '').toLowerCase().includes(q)
        );
      }
      return result;
    },

    getProduct(id) {
      return products.find(p => p.id === id) || null;
    },

    // ── Product Locking (prevent duplicate postings) ───────────────
    LOCK_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes

    lockProduct(productId, operatorId) {
      const product = products.find(p => p.id === productId);
      if (!product) return { error: 'محصول پیدا نشد.' };
      // Check if already locked by someone else and not expired
      if (product.locked_by && product.locked_by !== operatorId) {
        const elapsed = Date.now() - new Date(product.locked_at).getTime();
        if (elapsed < this.LOCK_TIMEOUT_MS) {
          const minsLeft = Math.ceil((this.LOCK_TIMEOUT_MS - elapsed) / 60000);
          return { error: `این محصول توسط ${product.locked_by_name || product.locked_by} قفل شده. ${minsLeft} دقیقه دیگه آزاد می‌شه.` };
        }
      }
      // Lock it
      product.locked_by = operatorId;
      product.locked_at = new Date().toISOString();
      product.status = 'locked';
      saveProducts();
      return { product };
    },

    unlockProduct(productId, operatorId) {
      const product = products.find(p => p.id === productId);
      if (!product) return { error: 'محصول پیدا نشد.' };
      // Only owner or manager can unlock
      if (product.locked_by && product.locked_by !== operatorId) {
        return { error: 'فقط خودتون یا مدیر می‌تونید قفل رو باز کنید.' };
      }
      product.locked_by = null;
      product.locked_at = null;
      product.status = 'active';
      saveProducts();
      return { product };
    },

    completeProduct(productId, operatorId) {
      const product = products.find(p => p.id === productId);
      if (!product) return { error: 'محصول پیدا نشد.' };
      product.locked_by = null;
      product.locked_at = null;
      product.status = 'posted';
      product.posted_at = new Date().toISOString();
      product.posted_by = operatorId;
      saveProducts();
      return { product };
    },

    releaseExpiredLocks() {
      const now = Date.now();
      let released = 0;
      for (const p of products) {
        if (p.status === 'locked' && p.locked_at) {
          const elapsed = now - new Date(p.locked_at).getTime();
          if (elapsed >= this.LOCK_TIMEOUT_MS) {
            p.locked_by = null;
            p.locked_at = null;
            p.status = 'active';
            released++;
          }
        }
      }
      if (released > 0) saveProducts();
      return released;
    },

    getProductsByStatus() {
      this.releaseExpiredLocks();
      const result = { available: [], locked: [], posted: [] };
      for (const p of products) {
        const status = p.status || 'active';
        if (status === 'active') result.available.push(p);
        else if (status === 'locked') result.locked.push(p);
        else if (status === 'posted') result.posted.push(p);
      }
      return result;
    },

    addProduct(data) {
      const id = data.id || `P${String(products.length + 1).padStart(3, '0')}`;
      const product = {
        id,
        title: data.title,
        description: data.description || '',
        price: Number(data.price) || 0,
        category: data.category || 'mobile-phones',
        attributes: data.attributes || {},
        images: data.images || [],
        city: data.city || 'تهران',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      products.push(product);
      saveProducts();
      return product;
    },

    updateProduct(id, updates) {
      const idx = products.findIndex(p => p.id === id);
      if (idx === -1) return null;
      products[idx] = { ...products[idx], ...updates, updatedAt: new Date().toISOString() };
      saveProducts();
      return products[idx];
    },

    deleteProduct(id) {
      const idx = products.findIndex(p => p.id === id);
      if (idx === -1) return false;
      products[idx].status = 'archived';
      saveProducts();
      return true;
    },

    importProducts(items) {
      const added = [];
      for (const item of items) {
        const product = {
          id: item.id || `P${String(products.length + 1).padStart(3, '0')}`,
          title: item.title || item['عنوان'] || '',
          description: item.description || item['توضیحات'] || '',
          price: Number(item.price || item['قیمت']) || 0,
          category: item.category || item['دسته‌بندی'] || 'mobile-phones',
          attributes: typeof item.attributes === 'object' ? item.attributes : {},
          images: Array.isArray(item.images) ? item.images : [],
          city: item.city || item['شهر'] || 'تهران',
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        products.push(product);
        added.push(product);
      }
      saveProducts();
      return added;
    },

    getProductStats() {
      const stats = { total: products.length, active: 0, archived: 0, byCategory: {} };
      for (const p of products) {
        if (p.status === 'active') stats.active++;
        else stats.archived++;
        stats.byCategory[p.category] = (stats.byCategory[p.category] || 0) + 1;
      }
      return stats;
    },

    // ── Tasks (pass-through for now, will migrate from pilot-service) ──
    getTasks() { return tasks; },
    saveTasks(data) { tasks = data; saveTasks(); },

    // ── Audit ─────────────────────────────────────────────────────
    getAuditLogs() { return auditLogs; },
    addAuditLog(entry) {
      auditLogs.push({ ...entry, id: `A${String(nextId('audit')).padStart(5, '0')}`, timestamp: new Date().toISOString() });
      saveAudit();
      return auditLogs[auditLogs.length - 1];
    },
    saveAuditLogs(data) { auditLogs = data; saveAudit(); },

    // ── Stats ─────────────────────────────────────────────────────
    getFullStats() {
      const productStats = this.getProductStats();
      const taskStats = {
        total: tasks.length,
        byStatus: {},
      };
      for (const t of tasks) {
        taskStats.byStatus[t.status] = (taskStats.byStatus[t.status] || 0) + 1;
      }
      return { products: productStats, tasks: taskStats, auditCount: auditLogs.length };
    },
  };
}
