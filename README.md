# Laqta 📸

Open-source Telegram screenshot bot powered by **Cloudflare Workers + Browser Run + Playwright**.

Send a URL to your Telegram bot and get a rendered screenshot back. Laqta supports desktop, iPhone, Android and tablet viewports, full-page captures, dark mode and a configurable wait before capture.

## Features

- Telegram bot webhook
- HTTP screenshot API
- Desktop / iPhone / Android / tablet presets
- Full-page screenshots
- Light / dark color scheme
- Optional render delay
- Cloudflare Browser Run via `@cloudflare/playwright`
- Basic SSRF protection for localhost/private IPv4 targets
- No database required

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

Your Worker will be available at a `workers.dev` URL (or your configured custom domain).

## Connect Telegram

Choose a random webhook secret and store it as `TELEGRAM_WEBHOOK_SECRET`. Then register the webhook, replacing the placeholders:

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://<YOUR_WORKER>/telegram" \
  -d "secret_token=<YOUR_WEBHOOK_SECRET>"
```

Do not commit the bot token or webhook secret.

## Bot usage

Send a URL:

```text
https://example.com
```

Mobile full-page dark screenshot:

```text
https://example.com --device iphone --full --dark
```

Wait two seconds after rendering:

```text
https://example.com --wait 2000
```

Supported devices: `desktop`, `iphone`, `android`, `tablet`.

## HTTP API

```text
GET /api/screenshot?url=https://example.com
GET /api/screenshot?url=https://example.com&device=iphone&full=1&dark=1&wait=1000
```

The response is `image/png`.

> The HTTP endpoint is intentionally public in v0.1 for demo/developer use. Before exposing a production deployment, add authentication and rate limiting to prevent abuse and unexpected Browser Run usage.

## Local development

Create `.dev.vars` from the example and add development secrets:

```bash
cp .dev.vars.example .dev.vars
npm run dev
```

Cloudflare also supports experimental headful local Browser Run debugging through `X_BROWSER_HEADFUL=true`.

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

Laqta rejects obvious localhost, `.local`, link-local and RFC1918 IPv4 targets. This is a useful first layer, not a complete production SSRF defense. Production deployments should additionally enforce authentication, rate limits, DNS/IP validation, redirect validation, request quotas and an allow/deny policy appropriate to their threat model.

Browser automation may be identified as bot traffic by target websites. Respect website terms, robots/access policies, privacy, copyright and applicable law.

## Roadmap

- Inline Telegram buttons for device selection
- JPEG/WebP output and quality controls
- Element-only screenshots
- PDF export
- Multiple-device capture in one request
- R2 screenshot history
- Rate limiting / API keys
- Signed public share links

## License

MIT
