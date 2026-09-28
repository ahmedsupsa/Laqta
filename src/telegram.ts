import type { Env, DeviceName, ShotOptions, ThemeName } from "./types";
import { normalizePublicUrl } from "./security";
import { takeScreenshot } from "./screenshot";

interface TgUpdate { message?: { chat: { id: number }; text?: string }; }

const HELP = `📸 Laqta\n\nأرسل رابط أي صفحة وسأرجع لك لقطة شاشة.\n\nخيارات اختيارية بعد الرابط:\n--device desktop|iphone|android|tablet\n--full\n--dark\n--wait 2000\n\nمثال:\nhttps://example.com --device iphone --full --dark`;

async function tg(env: Env, method: string, body: BodyInit, headers?: HeadersInit) {
  return fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: "POST", body, headers });
}

async function sendText(env: Env, chatId: number, text: string) {
  const body = new URLSearchParams({ chat_id: String(chatId), text });
  await tg(env, "sendMessage", body);
}

function parse(text: string): ShotOptions {
  const parts = text.trim().split(/\s+/);
  const url = normalizePublicUrl(parts[0]);
  let device: DeviceName = "desktop";
  let fullPage = false;
  let theme: ThemeName = "light";
  let waitMs = 0;
  for (let i = 1; i < parts.length; i++) {
    if (parts[i] === "--full") fullPage = true;
    else if (parts[i] === "--dark") theme = "dark";
    else if (parts[i] === "--device" && parts[i + 1]) {
      const candidate = parts[++i] as DeviceName;
      if (["desktop", "iphone", "android", "tablet"].includes(candidate)) device = candidate;
    } else if (parts[i] === "--wait" && parts[i + 1]) {
      waitMs = Number(parts[++i]) || 0;
    }
  }
  return { url, device, fullPage, theme, waitMs };
}

export async function handleTelegram(request: Request, env: Env): Promise<Response> {
  if (env.TELEGRAM_WEBHOOK_SECRET) {
    const supplied = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (supplied !== env.TELEGRAM_WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });
  }
  const update = await request.json<TgUpdate>();
  const message = update.message;
  if (!message?.text) return new Response("ok");
  const chatId = message.chat.id;
  const text = message.text.trim();
  if (text === "/start" || text === "/help") {
    await sendText(env, chatId, HELP);
    return new Response("ok");
  }
  try {
    const options = parse(text);
    await sendText(env, chatId, `⏳ جاري تصوير ${options.device}${options.fullPage ? " — صفحة كاملة" : ""}...`);
    const png = await takeScreenshot(env, options);
    const form = new FormData();
    form.set("chat_id", String(chatId));
    form.set("caption", `📸 ${new URL(options.url).hostname} • ${options.device}${options.fullPage ? " • full page" : ""}`);
    form.set("document", new Blob([png], { type: "image/png" }), "laqta.png");
    const res = await tg(env, "sendDocument", form);
    if (!res.ok) throw new Error(`Telegram upload failed (${res.status})`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await sendText(env, chatId, `❌ ما قدرت أصور الصفحة.\n${msg}`);
  }
  return new Response("ok");
}
