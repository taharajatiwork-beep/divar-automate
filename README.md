# پایلوت انتشار نیمه‌خودکار آگهی

این پروژه فاز اول سامانه انتشار نیمه‌خودکار آگهی است. دامنه فعلی عمداً کوچک و کنترل‌شده است:

- داده محصول Mock
- تنها دسته‌بندی `mobile-phones`
- یک قالب نگاشت نسخه‌دار
- ساخت دستی وظیفه
- اعتبارسنجی داده قبل از ورود به صف
- تخصیص یک وظیفه آماده به اپراتور
- API داخلی برای دریافت داده پیش‌پرشده

## مرز ایمنی

این سرویس هیچ اتصال یا اتوماسیونی برای ورود، حل کپچا، دورزدن محدودیت یا کلیک روی دکمه ثبت ندارد. ثبت نهایی آگهی همیشه توسط اپراتور انسانی انجام می‌شود.

## اجرا

```bash
npm test
npm start
```

API روی `http://localhost:3000` اجرا می‌شود.

## مسیرهای API

| Method | Path | کاربرد |
|---|---|---|
| GET | `/health` | بررسی سلامت سرویس |
| GET | `/api/tasks` | مشاهده taskهای ساخته‌شده |
| POST | `/api/tasks` | ساخت دستی task از محصول Mock |
| POST | `/api/tasks/claim-next` | تخصیص task آماده به اپراتور |
| GET | `/api/tasks/:taskId/prefill?operatorId=...` | دریافت اطلاعات پیش‌پرشده توسط اپراتور تخصیص‌یافته |

### نمونه جریان آزمایشی

```bash
curl -X POST http://localhost:3000/api/tasks \
  -H 'content-type: application/json' \
  -d '{"productId":"phone-001","createdBy":"supervisor-demo"}'

curl -X POST http://localhost:3000/api/tasks/claim-next \
  -H 'content-type: application/json' \
  -d '{"operatorId":"operator-demo"}'

curl 'http://localhost:3000/api/tasks/TASK-PILOT-0001/prefill?operatorId=operator-demo'
```

`phone-002` عمداً فاقد مدل است تا مسیر `needs_review` قابل آزمون باشد.

## موارد خارج از دامنه فاز اول

- اکستنشن مرورگر
- ذخیره‌سازی دیتابیس و احراز هویت واقعی
- صف خودکار، نقش‌ها و سهمیه
- دانلود/آماده‌سازی تصاویر
- تشخیص ثبت موفق یا ارسال نهایی
