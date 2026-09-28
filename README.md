# Laqta 📸

Open-source Telegram screenshot bot powered by **Cloudflare Workers + Browser Run + Playwright**.

Send a URL to your Telegram bot, choose the device, capture mode, theme and quality from interactive buttons, then receive a rendered PNG screenshot.

## Features

- Interactive Telegram buttons
- Desktop / iPhone / Android / tablet presets
- Viewport or full-page screenshots
- Light / dark color scheme
- Screenshot quality: Standard 1x / High 2x / Ultra 3x
- PNG output sent as a Telegram document to preserve quality
- HTTP screenshot API
- Optional render delay
- Cloudflare Browser Run via `@cloudflare/playwright`
- Basic SSRF protection for localhost/private IPv4 targets
- No database required for basic usage

## Requirements

- Node.js 22+
- Cloudflare account with Workers and Browser Run
- Telegram bot token from BotFather

## Install

```bash
npm install
npx wrangler login
```

Add Worker secrets:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

Deploy:

```bash
npm run deploy
```

## Connect Telegram

Store a random value as `TELEGRAM_WEBHOOK_SECRET`, then register the webhook:

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://<YOUR_WORKER>/telegram" \
  -d "secret_token=<YOUR_WEBHOOK_SECRET>"
```

Never commit your bot token or webhook secret.

## Bot usage

Send a URL such as:

```text
https://example.com
```

Laqta will show buttons for device, viewport/full page, light/dark theme and 1x/2x/3x quality. High 2x is the default.

Advanced text options are also supported:

```text
https://example.com --device iphone --full --dark --quality ultra --wait 2000
```

## HTTP API

```text
GET /api/screenshot?url=https://example.com
GET /api/screenshot?url=https://example.com&device=iphone&full=1&dark=1&wait=1000
```

The response is `image/png`.

> The HTTP endpoint is intentionally public in v0.1 for demo/developer use. Before production use, add authentication and rate limiting to prevent abuse and unexpected Browser Run usage.

## Architecture

```text
Telegram / HTTP client
        │
        ▼
Cloudflare Worker
        │
        ▼
Browser Run binding
        │
        ▼
@cloudflare/playwright
        │
        ▼
Rendered webpage → PNG
```

## Security notes

Laqta rejects obvious localhost, `.local`, link-local and RFC1918 IPv4 targets. This is a useful first layer, not a complete production SSRF defense. Production deployments should additionally enforce authentication, rate limits, DNS/IP validation, redirect validation and request quotas.

---

# الشرح العربي 🇸🇦

**Laqta (لقطة)** مشروع مفتوح المصدر يحول بوت Telegram إلى أداة لتصوير صفحات الويب. ترسل رابط الموقع للبوت، تختار الإعدادات من الأزرار، ويستخدم المشروع متصفحًا حقيقيًا عبر **Cloudflare Browser Run + Playwright** لفتح الصفحة وإرسال لقطة PNG لك.

## ماذا يفعل Laqta؟

بعد إرسال رابط مثل:

```text
https://example.com
```

يعرض البوت خيارات سهلة بدون الحاجة إلى كتابة أوامر:

- 💻 **Desktop** — محاكاة شاشة كمبيوتر.
- 📱 **iPhone** — عرض الصفحة بمقاس هاتف iPhone.
- 🤖 **Android** — عرض الصفحة بمقاس هاتف Android.
- 📟 **Tablet** — عرض الصفحة بمقاس جهاز لوحي.
- 🖼️ **الشاشة فقط** — تصوير الجزء الظاهر من الصفحة.
- 📄 **الصفحة كاملة** — تصوير الصفحة من بدايتها إلى نهايتها.
- ☀️ **فاتح** — طلب الوضع الفاتح من الموقع.
- 🌙 **داكن** — طلب الوضع الداكن من الموقع إذا كان يدعمه.
- ⚡ **عادية 1x** — أقل استهلاكًا وأسرع.
- ✨ **عالية 2x** — جودة عالية وهي الخيار الافتراضي.
- 💎 **فائقة 3x** — رندر بكثافة بكسلات أعلى للحصول على لقطة شديدة الوضوح.

بعد تحديد الخيارات اضغط **📸 التقط الصورة**. تظهر رسالة انتظار مؤقتة أثناء تشغيل المتصفح، ثم تُحذف تلقائيًا بعد وصول الصورة.

## كيف يعمل؟

```text
المستخدم في Telegram
        │
        ▼
Cloudflare Worker
        │
        ▼
Browser Run
        │
        ▼
Playwright
        │
        ▼
فتح الموقع ورندر الصفحة
        │
        ▼
PNG → Telegram
```

Cloudflare Worker يستقبل رسالة Telegram عبر Webhook. عند طلب التصوير، يشغّل Playwright من خلال Browser Run، يفتح الرابط بالإعدادات المختارة، يلتقط PNG ثم يرسل الملف إلى المحادثة.

## التشغيل على Cloudflare

ثبّت الحزم وسجّل الدخول إلى Cloudflare:

```bash
npm install
npx wrangler login
```

أضف أسرار Telegram. لا تضع هذه القيم داخل الكود أو GitHub:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

ثم انشر المشروع:

```bash
npm run deploy
```

بعد النشر اربط عنوان `/telegram` الخاص بالـWorker مع Telegram باستخدام `setWebhook` كما هو موضح في قسم **Connect Telegram** بالأعلى.

## الجودة

Laqta لا يقوم فقط بتكبير الصورة بعد التقاطها. مستوى الجودة يغيّر `deviceScaleFactor` داخل سياق المتصفح نفسه:

```text
1x → Standard
2x → High
3x → Ultra
```

لذلك يتم رندر الصفحة بكثافة بكسلات أعلى قبل إنشاء ملف PNG. لاحظ أن 3x، خصوصًا مع الصفحات الطويلة، ينتج ملفات أكبر ويستهلك موارد أكثر من 1x و2x.

## الاستخدام المتقدم

يمكن استخدام الخيارات النصية أيضًا:

```text
https://example.com --device iphone --full --dark --quality ultra
```

والأجهزة المدعومة هي:

```text
desktop | iphone | android | tablet
```

ومستويات الجودة:

```text
standard | high | ultra
```

## ملاحظات الأمان

يمنع Laqta بشكل مبدئي الوصول المباشر إلى `localhost` وبعض عناوين الشبكات الخاصة. هذه حماية أولية فقط. إذا أردت فتح الخدمة للعامة فمن الأفضل إضافة Rate Limiting ومصادقة للـAPI وحدود استخدام والتحقق من عمليات إعادة التوجيه وDNS/IP لمنع إساءة استخدام Browser Run.

كما يجب احترام شروط المواقع وسياسات الوصول والخصوصية وحقوق النشر والقوانين المطبقة عند استخدام أتمتة المتصفح.

## Roadmap

- تصوير عنصر محدد من الصفحة
- PDF export
- تصوير عدة أجهزة في طلب واحد
- R2 screenshot history
- Rate limiting / API keys
- Signed public share links
- Persistent session state with KV / D1

## License

MIT
