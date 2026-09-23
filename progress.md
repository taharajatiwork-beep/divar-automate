# پیشرفت پروژه — سیستم انتشار نیمه‌خودکار دیوار

> آخرین به‌روزرسانی: ۲۰۲۶-۰۹-۲۳

---

## خلاصه اجرایی

سیستم انتشار آگهی نیمه‌خودکار برای دیوار (divar.ir) که اطلاعات خودرو را از دیتابیس می‌خواند، فرم ثبت آگهی دیوار را به‌صورت خودکار پر می‌کند و **همیشه ارسال نهایی توسط اپراتور انسانی انجام می‌شود**.

### وضعیت فعلی
- ✅ صفحه ۱: عنوان + توضیحات + عکس → خودکار
- ✅ صفحه ۲: select خودرو (برند، رنگ، سوخت، گیربکس، بدنه) → خودکار
- ✅ صفحه ۲: کارکرد (کیلومتر) → خودکار
- ✅ صفحه ۳: قیمت → خودکار (از توضیحات Divar AI)
- ⏳ صفحه ۲: مکان آگهی → **دستی** (مپ باز می‌شود)
- ⏳ صفحه ۴:联系方式 → **دستی** (توسط اپراتور)

---

## فاز ۵ (۲۰۲۶-۰۹-۲۳): اتوماسیون فرم دیوار

### کشفیات کلیدی درباره DOM دیوار

| ویژگی | جزئیات |
|-------|--------|
| URL فرم | `https://divar.ir/new` |
| ساختار صفحات | صفحه ۱ (دسته+محل+عکس+عنوان+توضیحات) → صفحه ۲ (فیلدهای خودرو) → صفحه ۳ (قیمت) → صفحه ۴ (联系方式) |
| فیلدهای select | از `id` شناسایی می‌شوند: `#color___Input`، `#year___Input`، `#fuel_type___Input`، `#gearbox___Input`، `#body_status___Input` |
| فیلد برند/مدل | `kt-action-field` (نه `kt-select-field`) — `aria-expanded` ندارد |
| modal برند | `.single-select-modal.kt-modal` — شامل باکس جستجو + "نمایش همه موارد" |
| modal سال | `.kt-modal.kt-modal--scrollable` (بدون `single-select-modal`) — کلاس متفاوت |
| ساختار option | `.kt-base-row` → عنوان در `.start__title-_UBPtX` (برند) یا `p` (سال) |
| مشکل React | `element.click()` از content script تولید `isTrusted=false` می‌کند → React نادیده می‌گیرد |
| **راه‌حل** | **CDP trusted click** از طریق `chrome.debugger` API در background script |

### معماری CDP Click

```
Content Script                    Background Script
     │                                 │
     │ 1. پیدا کردن گزینه              │
     │ 2. گرفتن مختصات (x, y)         │
     │──── sendMessage ──────────────→ │
     │    {action:'cdpClick', x, y}    │
     │                                 │ 3. chrome.debugger.attach
     │                                 │ 4. Input.dispatchMouseEvent
     │                                 │    (isTrusted = true ✅)
     │ ←──── response ──────────────── │
     │    {success: true/false}        │
```

### الگوریتم انتخاب گزینه‌ها (3-pass matching)

1. **Pass 1 — تطابق کامل/فازی**: مقایسه `normalizeOption(rowText)` با `wanted`
2. **Pass 2 — فقط برند**: اگه Pass 1 جواب نداد، اولین گزینه‌ای که شامل `brandWord` باشه
3. **Pass 3 — نمایش همه + جستجو**: کلیک "نمایش همه موارد" → تایپ در باکس جستجو → تطابق مجدد

### توابع کلیدی

| تابع | وظیفه |
|------|-------|
| `clickDivarDropdownByName(fieldId, optionText)` | باز کردن modal + یافتن گزینه + CDP click |
| `cdpClick(element)` | ارسال مختصات به background برای کلیک trusted |
| `normalizeOption(text)` | تبدیل اعداد فارسی به لاتین + حذف کاراکترهای خاص |
| `generateDescription(pf)` | تولید توضیحات جامع شامل مقادیر select برای Divar AI |
| `orchestrate()` | هماهنگ‌کننده اصلی: صفحه ۱ → بعدی → صفحه ۲ |

### استراتژی توضیحات هوشمند

Divar AI مقادیر select را از متن توضیحات استخراج و خودکار پر می‌کند. توضیحات تولید شده شامل:
```
خودروی سالم و بدون تصادف. موتور و گیربکس سالم.
مشخصات: پژو 206 تیپ ۵ | مدل 1398 | کارکرد 85,000 کیلومتر | رنگ سفید | دنده‌ای | بنزین
```

### تغییرات permissions

- `manifest.json`: `"permissions": ["activeTab", "storage", "tabs", "debugger"]`
- کاربر هنگام اولین استفاده بنر زرد Chrome می‌بیند → "Ignore" بزند

---

## فاز ۱-۴ (۲۰۲۶-۰۹-۲۲): هسته سیستم

### فاز ۱: هسته سرویس + اکستنشن
- چرخه عمر کامل وظیفه: `needs_review → ready_for_assignment → assigned → prefill_ready → submitted → confirmed`
- API سرور — ۱۶ endpoint
- اکستنشن Chrome MV3
- **هیچ‌وقت دکمه ثبت خودکار کلیک نمی‌شود**

### فاز ۲: احراز هویت + تخصیص هوشمند
- ۳ نقش: operator / supervisor / manager
- ۴ کاربر Demo: ali, sara, reza, admin
- تخصیص هوشمند — کمترین بار کاری
- قفل محصول — ۳۰ دقیقه timeout

### فاز ۳: سهمیه + تصاویر
- پایش سهمیه روزانه اکانت دیوار
- توقف خودکار در ۸۰٪ و ۱۰۰٪ سقف
- محدودیت ۱۰ تصویر در هر آگهی

### فاز ۴: چند دسته‌بندی + بازبینی
- ۴ قالب: 📱 موبایل، 💻 لپ‌تاپ، 🎧 لوازم جانبی، 🚗 خودرو
- فرآیند بازبینی: ویرایش → بررسی → تایید/رد

---

## دیتابیس محصولات خودرو (۱۰ محصول)

> اسامی دقیقاً مطابق لیست Divar هستند

| ID | عنوان | مدل Divar | شهر |
|----|-------|-----------|-----|
| P001 | پژو 206 تیپ ۵ | پژو 206 تیپ ۵ | تهران |
| P002 | پژو 207i اتوماتیک | پژو 207i اتوماتیک | تهران |
| P003 | پژو 405 GLX | پژو 405 GLX بنزینی | تهران |
| P004 | کیا ریو سدان | کیا ریو سدان | شیراز |
| P005 | کیا سراتو اتوماتیک | کیا سراتو اتوماتیک 2000cc | تهران |
| P006 | هیوندای النترا | هیوندای النترا 1800cc | تهران |
| P007 | هیوندای i40 | هیوندای i40 | تبریز |
| P008 | دنا پلاس اتوماتیک | دنا پلاس اتوماتیک | کرمان |
| P009 | رانا LX | رانا LX | اصفهان |
| P010 | دنا پلاس 6 دنده توربو | دنا پلاس 6 دنده توربو | تهران |

هر محصول شامل: `brand`, `model`, `year`, `mileage`, `color`, `gearbox`, `fuel`, `bodyStatus`, `city`

---

## اکستنشن Chrome — جزئیات فنی

### فایل‌ها

| فایل | خطوط | وظیفه |
|------|------|-------|
| `extension/content.js` | ۵۵۸ | اسکریپت محتوا — پرکردن فرم، modal handling، CDP click |
| `extension/background.js` | ۱۹۱ | سرویس‌ورکر — CDP trusted click، API ارتباط، auth |
| `extension/popup.js` | ۱۰۵ | رابط کاربری popup: لاگین + لینک پنل |
| `extension/manifest.json` | — | MV3 — permissions: activeTab, storage, tabs, **debugger** |

### جریان کار اکستنشن

```
1. کاربر از پنل operator دکمه "باز کردن دیوار" می‌زنه
2. background.js صفحه divar.ir/new رو باز می‌کنه
3. Operator دسته خودرو رو انتخاب می‌کنه
4. background.js prefill data رو به content.js می‌فرسته
5. content.js اجرا می‌شه:
   a. صفحه ۱: عنوان + توضیحات + عکس → بعدی
   b. صبر برای لود صفحه ۲
   c. صفحه ۲: select ها (CDP click) + usage (input)
   d. operator: مکان + قیمت +联系方式 رو دستی تکمیل می‌کنه
6. operator: دکمه "ثبت آگهی" رو می‌زنه (human submit ✅)
```

---

## بک‌اند — جزئیات فنی

### فایل‌ها

| فایل | خطوط | وظیفه |
|------|------|-------|
| `src/server.js` | ۳۵۴ | HTTP API — CORS، product locking، prefill API |
| `src/pilot-service.js` | ۴۶۳ | هسته سرویس — چرخه عمر، نگاشت، اعتبارسنجی |
| `src/database.js` | ۲۷۹ | JSON persistence — ۱۰ محصول خودرو، ۳۰ دقیقه locking |
| `src/categories.js` | ۲۱۲ | مدیریت قالب دسته‌بندی‌ها (شامل vehicles) |
| `src/auth.js` | ۱۲۸ | احراز هویت توکنی، ۳ نقش، ۴ کاربر |
| `src/quota.js` | ۱۰۵ | پایش سهمیه روزانه |
| `src/images.js` | ۱۰۰ | آماده‌سازی تصویر |
| `src/static-server.js` | ۶۴ | Static server روی :5174 |

### endpoint های API

| method | path | وظیفه |
|--------|------|-------|
| GET | `/api/health` | سلامت سیستم |
| GET | `/api/products` | لیست محصولات |
| POST | `/api/products/:id/lock` | قفل محصول (30min) |
| DELETE | `/api/products/:id/unlock` | آزادسازی |
| POST | `/api/products/:id/prefill` | تولید prefill data |
| POST | `/api/tasks/smart-assign` | تخصیص هوشمند |
| GET | `/api/tasks` | لیست وظایف |
| PUT | `/api/tasks/:id/field` | ویرایش فیلد |
| POST | `/api/tasks/:id/submit` | ثبت وضعیت |
| POST | `/api/prefill/pending` | ارسال prefill برای extension |
| GET | `/api/prefill/pending` | دریافت prefill (با TTL) |
| GET | `/api/stats` | آمار داشبورد |
| POST | `/api/auth/login` | احراز هویت |
| GET | `/api/users` | لیست کاربران |

---

## فایل‌های کلیدی

```
C:\taha\projects\divar\
├── extension/
│   ├── manifest.json          # MV3 — debugger permission
│   ├── background.js          # CDP trusted click + API bridge
│   ├── content.js             # Form autofill + modal handling
│   ├── popup.js               # Login UI
│   └── popup.html
├── src/
│   ├── server.js              # HTTP API (CORS, locking, prefill)
│   ├── pilot-service.js       # Core service (task lifecycle)
│   ├── database.js            # JSON persistence (10 products)
│   ├── categories.js          # 4 templates (incl. vehicles)
│   ├── auth.js                # Token auth (3 roles)
│   ├── quota.js               # Daily quota monitor
│   ├── images.js              # Image validation
│   └── static-server.js       # Static file server :5174
├── data/
│   ├── products.json          # 10 car products (exact Divar names)
│   └── images/                # Placeholder images (P001-P010)
├── web/src/components/
│   └── OperatorDashboard.jsx  # Kanban + claim + open Divar
├── test/
│   ├── pilot.test.js          # Phase 1-2 tests
│   ├── phase3.test.js         # Phase 3 tests
│   └── phase4.test.js         # Phase 4 tests
├── progress.md                # این فایل
└── ALL-IN-ONE.md              # مرجع جامع
```

---

## محدودیت‌ها و قوانین

| قانون | توضیح |
|-------|-------|
| ❌ هیچ‌وقت "ثبت آگهی" خودکار | operator همیشه دستی کلیک می‌کنه |
| ❌ لاگین خودکار | operator باید لاگین باشه |
| ❌ دور زدن captcha | ممنوع |
| ❌ ذخیره اطلاعات حساس | توکن در localStorage ذخیره می‌شه |
| ✅ توقف در 80%/100% سهمیه | خودکار |
| ✅ قفل محصول 30 دقیقه | auto-release |
| ✅ city → دستی | مپ باز می‌شه، خودکار نمیشه |
| ✅联系方式 → دستی | operator انتخاب می‌کنه |

---

## TODO — موارد باقی‌مانده

- [ ] **مکان آگهی**: city field مپ باز می‌کنه — نیاز به روش متفاوت
- [ ] **صفحه ۳ (قیمت)**: می‌تونه خودکار پر بشه (از price در prefill)
- [ ] **صفحه ۴ (联系方式)**: operator دستی انتخاب می‌کنه
- [ ] **TODOهای بهبود**: نقشه راه کامل در `ROADMAP.md`
- [ ] **تست CDP click با خودروهای مختلف**: brand-only fallback
- [ ] **حالت توسعه‌دهنده**: لاگ‌های DEBUG رو غیرفعال کنه

---

## آمار نهایی

| معیار | مقدار |
|-------|-------|
| خطوط کد | ~۲,۵۰۰ |
| فایل‌های منبع | ۱۵ |
| endpointهای API | ۱۴+ |
| محصولات Mock | ۱۰ خودرو |
| دسته‌بندی‌ها | ۴ |
| نقش‌ها | ۳ |
| کاربران Demo | ۴ |
| تست‌ها | ۵۳ |
