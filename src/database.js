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
  { id: 'P001', title: 'پژو ۲۰۶ تیپ ۵', description: 'خودروی سالم و بدون تصادف. موتور و گیربکس سالم. بیمه شخص ثالث تا پایان سال. لاستیک‌ها نو.', price: 280000000, category: 'vehicles', attributes: { brand: 'پژو', model: '206 تیپ 5', year: '1398', mileage: '85,000 کیلومتر', color: 'سفید', gearbox: 'دنده دستی' }, images: ['/images/P001_01.jpg'], city: 'تهران' },
  { id: 'P002', title: 'پژو ۲۰۷ اتوماتیک', description: 'خودرو کارکرده و تمیز. صندلی چرمی. مانیتور و دوربین عقب. بدون رنگ و تصادف.', price: 450000000, category: 'vehicles', attributes: { brand: 'پژو', model: '207 اتوماتیک', year: '1401', mileage: '42,000 کیلومتر', color: 'مشکی', gearbox: 'اتوماتیک' }, images: ['/images/P002_01.jpg'], city: 'اصفهان' },
  { id: 'P003', title: 'سمند EF7', description: 'خودروی اقتصادی و کم‌مصرف. موتور EF7 سالم. رنگ فابریکی. یک مالک.', price: 220000000, category: 'vehicles', attributes: { brand: 'ایران خودرو', model: 'سمند EF7', year: '1397', mileage: '110,000 کیلومتر', color: 'نقره‌ای', gearbox: 'دنده دستی' }, images: ['/images/P003_01.jpg'], city: 'تهران' },
  { id: 'P004', title: 'تیبا ۲', description: 'خودرو سالم و تمیز. مناسب شهری. مصرف سوخت پایین. بیمه و معاینه فنی به‌روز.', price: 180000000, category: 'vehicles', attributes: { brand: 'سایپا', model: 'تیبا 2', year: '1399', mileage: '65,000 کیلومتر', color: 'قرمز', gearbox: 'دنده دستی' }, images: ['/images/P004_01.jpg'], city: 'شیراز' },
  { id: 'P005', title: 'کیام سراتو', description: 'خودرو کره‌ای با کیفیت بالا. موتور قدرتمند و گیربکس اتوماتیک روان. صندلی‌های چرمی.', price: 520000000, category: 'vehicles', attributes: { brand: 'کیا', model: 'سراتو', year: '1396', mileage: '95,000 کیلومتر', color: 'خاکستری', gearbox: 'اتوماتیک' }, images: ['/images/P005_01.jpg'], city: 'تهران' },
  { id: 'P006', title: 'تویوتا کمری', description: 'خودرو لاکچری وارداتی. موتور ۲.۵ لیتری. سیستم ایمنی کامل. وضعیت فنی عالی.', price: 1200000000, category: 'vehicles', attributes: { brand: 'تویوتا', model: 'کمری', year: '1400', mileage: '30,000 کیلومتر', color: 'سفید', gearbox: 'اتوماتیک' }, images: ['/images/P006_01.jpg'], city: 'تهران' },
  { id: 'P007', title: 'هیوندای النترا', description: 'خودرو وارداتی سالم و بدون تصادف. فرمان برقی. مانیتور. دوربین ۳۶۰ درجه.', price: 850000000, category: 'vehicles', attributes: { brand: 'هیوندای', model: 'النترا', year: '1398', mileage: '58,000 کیلومتر', color: 'آبی تیره', gearbox: 'اتوماتیک' }, images: ['/images/P007_01.jpg'], city: 'تبریز' },
  { id: 'P008', title: 'پراید ۱۳۲', description: 'خودرو اقتصادی سالم. موتور و گیربکس بی‌نقص. مناسب استفاده شهری. مصرف سوخت پایین.', price: 120000000, category: 'vehicles', attributes: { brand: 'سایپا', model: 'پراید 132', year: '1395', mileage: '150,000 کیلومتر', color: 'سفید', gearbox: 'دنده دستی' }, images: ['/images/P008_01.jpg'], city: 'کرمان' },
  { id: 'P009', title: 'رانا', description: 'خودرو ملی ایران خودرو. موتور TU5. وضعیت فنی خوب. بدون رنگ شدگی.', price: 250000000, category: 'vehicles', attributes: { brand: 'ایران خودرو', model: 'رانا', year: '1400', mileage: '38,000 کیلومتر', color: 'سرمه‌ای', gearbox: 'دنده دستی' }, images: ['/images/P009_01.jpg'], city: 'اصفهان' },
  { id: 'P010', title: 'دنا پلاس', description: 'خودرو جدید ایران خودرو. موتور EF7 توربو. فرمان برقی. مانیتور. دوربین عقب.', price: 380000000, category: 'vehicles', attributes: { brand: 'ایران خودرو', model: 'دنا پلاس', year: '1402', mileage: '12,000 کیلومتر', color: 'مشکی', gearbox: 'دنده دستی' }, images: ['/images/P010_01.jpg'], city: 'تهران' },
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
