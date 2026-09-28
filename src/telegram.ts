import type { Env, DeviceName, ShotOptions, ThemeName } from "./types";
import { normalizePublicUrl } from "./security";
import { takeScreenshot } from "./screenshot";

interface TgMessage { message_id: number; chat: { id: number }; text?: string; }
interface TgCallback { id: string; data?: string; message?: TgMessage; }
interface TgUpdate { message?: TgMessage; callback_query?: TgCallback; }

interface PendingShot extends ShotOptions {}
const pending = new Map<number, PendingShot>();

const HELP = `📸 Laqta\n\nأرسل رابط الموقع فقط، وبعدها اختر إعدادات اللقطة من الأزرار.\n\nمثال:\nhttps://example.com\n\nوتقدر أيضًا تستخدم الخيارات النصية للمستخدم المتقدم.`;

async function tg(env: Env, method: string, body: BodyInit, headers?: HeadersInit) {
  return fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: "POST", body, headers });
}

async function sendText(env: Env, chatId: number, text: string, replyMarkup?: object): Promise<number | undefined> {
  const payload: Record<string, unknown> = { chat_id: chatId, text };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  const res = await tg(env, "sendMessage", JSON.stringify(payload), { "content-type": "application/json" });
  if (!res.ok) return undefined;
  const data = await res.json<{ result?: { message_id?: number } }>();
  return data.result?.message_id;
}

async function deleteMessage(env: Env, chatId: number, messageId: number) {
  await tg(env, "deleteMessage", JSON.stringify({ chat_id: chatId, message_id: messageId }), { "content-type": "application/json" });
}

async function answerCallback(env: Env, callbackId: string, text?: string) {
  await tg(env, "answerCallbackQuery", JSON.stringify({ callback_query_id: callbackId, text }), { "content-type": "application/json" });
}

function keyboard(options: ShotOptions) {
  const selected = (value: boolean) => value ? " ✓" : "";
  return {
    inline_keyboard: [
      [
        { text: `💻 Desktop${selected(options.device === "desktop")}`, callback_data: "device:desktop" },
        { text: `📱 iPhone${selected(options.device === "iphone")}`, callback_data: "device:iphone" }
      ],
      [
        { text: `🤖 Android${selected(options.device === "android")}`, callback_data: "device:android" },
        { text: `📟 Tablet${selected(options.device === "tablet")}`, callback_data: "device:tablet" }
      ],
      [
        { text: `🖼️ الشاشة فقط${selected(!options.fullPage)}`, callback_data: "page:viewport" },
        { text: `📄 الصفحة كاملة${selected(options.fullPage)}`, callback_data: "page:full" }
      ],
      [
        { text: `☀️ فاتح${selected(options.theme === "light")}`, callback_data: "theme:light" },
        { text: `🌙 داكن${selected(options.theme === "dark")}`, callback_data: "theme:dark" }
      ],
      [{ text: "📸 التقط الصورة", callback_data: "capture" }]
    ]
  };
}

async function editControls(env: Env, chatId: number, messageId: number, options: ShotOptions) {
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text: `🔗 ${new URL(options.url).hostname}\n\nاختر إعدادات اللقطة ثم اضغط «التقط الصورة».`,
    reply_markup: keyboard(options)
  };
  await tg(env, "editMessageText", JSON.stringify(payload), { "content-type": "application/json" });
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

async function capture(env: Env, chatId: number, options: ShotOptions) {
  const progressMessageId = await sendText(env, chatId, `⏳ جاري التصوير: ${options.device}${options.fullPage ? " • صفحة كاملة" : ""}${options.theme === "dark" ? " • داكن" : ""}...`);
  try {
    const png = await takeScreenshot(env, options);
    const form = new FormData();
    form.set("chat_id", String(chatId));
    form.set("caption", `📸 ${new URL(options.url).hostname} • ${options.device}${options.fullPage ? " • full page" : ""}${options.theme === "dark" ? " • dark" : ""}`);
    form.set("document", new Blob([png], { type: "image/png" }), "laqta.png");
    const res = await tg(env, "sendDocument", form);
    if (!res.ok) throw new Error(`Telegram upload failed (${res.status})`);
    if (progressMessageId) await deleteMessage(env, chatId, progressMessageId);
  } catch (error) {
    if (progressMessageId) await deleteMessage(env, chatId, progressMessageId);
    throw error;
  }
}

export async function handleTelegram(request: Request, env: Env): Promise<Response> {
  if (env.TELEGRAM_WEBHOOK_SECRET) {
    const supplied = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (supplied !== env.TELEGRAM_WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });
  }

  const update = await request.json<TgUpdate>();

  if (update.callback_query?.message && update.callback_query.data) {
    const cb = update.callback_query;
    const chatId = cb.message.chat.id;
    const options = pending.get(chatId);
    if (!options) {
      await answerCallback(env, cb.id, "أرسل الرابط من جديد.");
      return new Response("ok");
    }

    const data = cb.data;
    if (data.startsWith("device:")) options.device = data.split(":")[1] as DeviceName;
    else if (data === "page:full") options.fullPage = true;
    else if (data === "page:viewport") options.fullPage = false;
    else if (data === "theme:dark") options.theme = "dark";
    else if (data === "theme:light") options.theme = "light";
    else if (data === "capture") {
      await answerCallback(env, cb.id, "جاري التصوير 📸");
      try {
        await capture(env, chatId, options);
        pending.delete(chatId);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        await sendText(env, chatId, `❌ ما قدرت أصور الصفحة.\n${msg}`);
      }
      return new Response("ok");
    }

    pending.set(chatId, options);
    await answerCallback(env, cb.id);
    await editControls(env, chatId, cb.message.message_id, options);
    return new Response("ok");
  }

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
    pending.set(chatId, options);
    await sendText(
      env,
      chatId,
      `🔗 ${new URL(options.url).hostname}\n\nاختر إعدادات اللقطة ثم اضغط «التقط الصورة».`,
      keyboard(options)
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await sendText(env, chatId, `❌ الرابط غير صالح.\n${msg}\n\nأرسل رابطًا يبدأ بـ https:// أو http://`);
  }

  return new Response("ok");
}
