import type { Env, DeviceName, ShotOptions, ThemeName, QualityName, CaptureMode } from "./types";
import { normalizePublicUrl } from "./security";
import { takeScreenshot, takeSmartScrollScreenshots } from "./screenshot";

interface TgMessage { message_id: number; chat: { id: number }; text?: string; }
interface TgCallback { id: string; data?: string; message?: TgMessage; }
interface TgUpdate { message?: TgMessage; callback_query?: TgCallback; }
interface PendingShot extends ShotOptions {}
const pending = new Map<number, PendingShot>();

const HELP = `📸 Laqta\n\nأرسل رابط الموقع، ثم اختر الجهاز ونوع اللقطة والمظهر والجودة.\n\n🧩 التمرير الذكي يصور الصفحة كسلسلة لقطات بمقاس الجهاز مع تداخل 10% حتى يبقى السياق واضحًا بين الصور.\n\nمثال:\nhttps://example.com`;

async function tg(env: Env, method: string, body: BodyInit, headers?: HeadersInit) { return fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: "POST", body, headers }); }
async function sendText(env: Env, chatId: number, text: string, replyMarkup?: object): Promise<number | undefined> {
  const payload: Record<string, unknown> = { chat_id: chatId, text }; if (replyMarkup) payload.reply_markup = replyMarkup;
  const res = await tg(env, "sendMessage", JSON.stringify(payload), { "content-type": "application/json" }); if (!res.ok) return undefined;
  return (await res.json<{ result?: { message_id?: number } }>()).result?.message_id;
}
async function deleteMessage(env: Env, chatId: number, messageId: number) { await tg(env, "deleteMessage", JSON.stringify({ chat_id: chatId, message_id: messageId }), { "content-type": "application/json" }); }
async function answerCallback(env: Env, callbackId: string, text?: string) { await tg(env, "answerCallbackQuery", JSON.stringify({ callback_query_id: callbackId, text }), { "content-type": "application/json" }); }
function qualityLabel(q: QualityName) { return q === "standard" ? "1x" : q === "high" ? "2x" : "3x"; }
function modeOf(o: ShotOptions): CaptureMode { return o.captureMode || (o.fullPage ? "full" : "viewport"); }
function modeLabel(o: ShotOptions) { const m = modeOf(o); return m === "smart" ? "🧩 تمرير ذكي" : m === "full" ? "📄 صفحة كاملة" : "🖼️ الشاشة فقط"; }

function keyboard(options: ShotOptions) {
  const selected = (v: boolean) => v ? " ✓" : ""; const mode = modeOf(options);
  return { inline_keyboard: [
    [{ text: `💻 Desktop${selected(options.device === "desktop")}`, callback_data: "device:desktop" }, { text: `📱 iPhone${selected(options.device === "iphone")}`, callback_data: "device:iphone" }],
    [{ text: `🤖 Android${selected(options.device === "android")}`, callback_data: "device:android" }, { text: `📟 Tablet${selected(options.device === "tablet")}`, callback_data: "device:tablet" }],
    [{ text: `🖼️ الشاشة فقط${selected(mode === "viewport")}`, callback_data: "mode:viewport" }, { text: `📄 الصفحة كاملة${selected(mode === "full")}`, callback_data: "mode:full" }],
    [{ text: `🧩 تمرير ذكي${selected(mode === "smart")}`, callback_data: "mode:smart" }],
    [{ text: `☀️ فاتح${selected(options.theme === "light")}`, callback_data: "theme:light" }, { text: `🌙 داكن${selected(options.theme === "dark")}`, callback_data: "theme:dark" }],
    [{ text: `⚡ عادية 1x${selected(options.quality === "standard")}`, callback_data: "quality:standard" }, { text: `✨ عالية 2x${selected(options.quality === "high")}`, callback_data: "quality:high" }, { text: `💎 فائقة 3x${selected(options.quality === "ultra")}`, callback_data: "quality:ultra" }],
    [{ text: "📸 التقط الصورة", callback_data: "capture" }]
  ] };
}
async function editControls(env: Env, chatId: number, messageId: number, options: ShotOptions) { await tg(env, "editMessageText", JSON.stringify({ chat_id: chatId, message_id: messageId, text: `🔗 ${new URL(options.url).hostname}\n\nاختر إعدادات اللقطة ثم اضغط «التقط الصورة».`, reply_markup: keyboard(options) }), { "content-type": "application/json" }); }

function parse(text: string): ShotOptions {
  const parts = text.trim().split(/\s+/); const url = normalizePublicUrl(parts[0]);
  let device: DeviceName = "desktop", theme: ThemeName = "light", quality: QualityName = "high", captureMode: CaptureMode = "viewport", waitMs = 0;
  for (let i = 1; i < parts.length; i++) {
    if (parts[i] === "--full") captureMode = "full"; else if (parts[i] === "--smart") captureMode = "smart"; else if (parts[i] === "--dark") theme = "dark";
    else if (parts[i] === "--quality" && parts[i + 1]) { const q = parts[++i] as QualityName; if (["standard", "high", "ultra"].includes(q)) quality = q; }
    else if (parts[i] === "--device" && parts[i + 1]) { const d = parts[++i] as DeviceName; if (["desktop", "iphone", "android", "tablet"].includes(d)) device = d; }
    else if (parts[i] === "--wait" && parts[i + 1]) waitMs = Number(parts[++i]) || 0;
  }
  return { url, device, fullPage: captureMode === "full", captureMode, theme, quality, waitMs };
}

async function sendPng(env: Env, chatId: number, png: Uint8Array, filename: string, caption: string) {
  const form = new FormData(); form.set("chat_id", String(chatId)); form.set("caption", caption); form.set("document", new Blob([png], { type: "image/png" }), filename);
  const res = await tg(env, "sendDocument", form); if (!res.ok) throw new Error(`Telegram upload failed (${res.status})`);
}

async function capture(env: Env, chatId: number, options: ShotOptions) {
  const q = qualityLabel(options.quality), mode = modeOf(options);
  const progressId = await sendText(env, chatId, `⏳ جاري التصوير\n${modeLabel(options)} • ${options.device} • ${q}${options.theme === "dark" ? " • داكن" : ""}`);
  try {
    const host = new URL(options.url).hostname;
    if (mode === "smart") {
      const parts = await takeSmartScrollScreenshots(env, options);
      if (progressId) await deleteMessage(env, chatId, progressId);
      await sendText(env, chatId, `🧩 تم تقسيم الصفحة إلى ${parts.length} لقطات متتابعة\n↕️ يوجد تداخل 10% بين كل لقطة والتي بعدها حتى لا ينقطع السياق.`);
      for (const part of parts) {
        const number = String(part.index).padStart(2, "0");
        await sendPng(env, chatId, part.data, `laqta-${options.device}-${number}-of-${String(part.total).padStart(2, "0")}-${q}.png`, `🧩 لقطة ${part.index} من ${part.total} • ${host} • ${options.device} • ${q}`);
      }
    } else {
      const png = await takeScreenshot(env, { ...options, fullPage: mode === "full" });
      await sendPng(env, chatId, png, `laqta-${options.device}-${q}.png`, `📸 ${host} • ${options.device} • ${q}${mode === "full" ? " • full page" : ""}${options.theme === "dark" ? " • dark" : ""}`);
      if (progressId) await deleteMessage(env, chatId, progressId);
    }
  } catch (error) { if (progressId) await deleteMessage(env, chatId, progressId); throw error; }
}

export async function handleTelegram(request: Request, env: Env): Promise<Response> {
  if (env.TELEGRAM_WEBHOOK_SECRET && request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });
  const update = await request.json<TgUpdate>();
  if (update.callback_query?.message && update.callback_query.data) {
    const cb = update.callback_query, chatId = cb.message.chat.id, options = pending.get(chatId);
    if (!options) { await answerCallback(env, cb.id, "أرسل الرابط من جديد."); return new Response("ok"); }
    const data = cb.data;
    if (data.startsWith("device:")) options.device = data.split(":")[1] as DeviceName;
    else if (data.startsWith("mode:")) { options.captureMode = data.split(":")[1] as CaptureMode; options.fullPage = options.captureMode === "full"; }
    else if (data === "theme:dark") options.theme = "dark"; else if (data === "theme:light") options.theme = "light";
    else if (data.startsWith("quality:")) options.quality = data.split(":")[1] as QualityName;
    else if (data === "capture") { await answerCallback(env, cb.id, "جاري التصوير 📸"); try { await capture(env, chatId, options); pending.delete(chatId); } catch (error) { const msg = error instanceof Error ? error.message : "Unknown error"; await sendText(env, chatId, `❌ ما قدرت أصور الصفحة.\n${msg}`); } return new Response("ok"); }
    pending.set(chatId, options); await answerCallback(env, cb.id); await editControls(env, chatId, cb.message.message_id, options); return new Response("ok");
  }
  const message = update.message; if (!message?.text) return new Response("ok"); const chatId = message.chat.id, text = message.text.trim();
  if (text === "/start" || text === "/help") { await sendText(env, chatId, HELP); return new Response("ok"); }
  try { const options = parse(text); pending.set(chatId, options); await sendText(env, chatId, `🔗 ${new URL(options.url).hostname}\n\nاختر إعدادات اللقطة ثم اضغط «التقط الصورة».`, keyboard(options)); }
  catch (error) { const msg = error instanceof Error ? error.message : "Unknown error"; await sendText(env, chatId, `❌ الرابط غير صالح.\n${msg}\n\nأرسل رابطًا يبدأ بـ https:// أو http://`); }
  return new Response("ok");
}
