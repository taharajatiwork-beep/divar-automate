export const mockProducts = [
  // ── Mobile Phones ──────────────────────────────────────────────
  {
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
    images: [
      'https://cdn.example.test/phone-001/01.jpg',
      'https://cdn.example.test/phone-001/02.jpg',
    ],
  },
  {
    id: 'phone-002',
    title: 'گوشی شیائومی Redmi Note 13',
    description: 'موبایل کارکرده و تمیز با شارژر اصلی.',
    price: 10500000,
    category: 'mobile-phones',
    attributes: {
      brand: 'Xiaomi',
      model: '', // intentionally empty — triggers needs_review
      storage: '128GB',
    },
    images: ['https://cdn.example.test/phone-002/01.jpg'],
  },

  // ── Laptops ────────────────────────────────────────────────────
  {
    id: 'laptop-001',
    title: 'لپ‌تاپ ایسوس ZenBook 14',
    description: 'لپ‌تاپ نو با گارانتی رسمی ایسوس. مناسب برنامه‌نویسی و کارهای اداری.',
    price: 45000000,
    category: 'laptops',
    attributes: {
      brand: 'ASUS',
      model: 'ZenBook 14 UX3405',
      cpu: 'Intel Core Ultra 7',
      ram: '16GB',
      storage: '512GB SSD',
      gpu: 'Intel Arc iGPU',
    },
    images: [
      'https://cdn.example.test/laptop-001/01.jpg',
      'https://cdn.example.test/laptop-001/02.jpg',
      'https://cdn.example.test/laptop-001/03.jpg',
    ],
  },
  {
    id: 'laptop-002',
    title: 'لپ‌تاپ اپل MacBook Air M3',
    description: 'MacBook Air با تراشه M3، فوق‌العاده سبک و سریع.',
    price: 62000000,
    category: 'laptops',
    attributes: {
      brand: 'Apple',
      model: 'MacBook Air 15" M3',
      cpu: 'Apple M3',
      ram: '16GB',
      storage: '512GB SSD',
      gpu: '10-core GPU',
    },
    images: ['https://cdn.example.test/laptop-002/01.jpg'],
  },

  // ── Accessories ────────────────────────────────────────────────
  {
    id: 'acc-001',
    title: 'هدفون بی‌سیم سامسونگ Galaxy Buds2 Pro',
    description: 'هدفون اصل با نویزگیر فعال. وضعیت: نو.',
    price: 3800000,
    category: 'accessories',
    attributes: {
      brand: 'Samsung',
      type: 'هدفون بی‌سیم',
    },
    images: ['https://cdn.example.test/acc-001/01.jpg'],
  },
  {
    id: 'acc-002',
    title: 'قاب محافظ آیفون 15 Pro',
    description: 'قاب سیلیکونی اصلی اپل به رنگ مشکی.',
    price: 850000,
    category: 'accessories',
    attributes: {
      brand: 'Apple',
      type: 'قاب محافظ',
    },
    images: ['https://cdn.example.test/acc-002/01.jpg'],
  },
];
