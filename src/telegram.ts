import type { Env, DeviceName, ShotOptions, ThemeName, QualityName, CaptureMode } from "./types";
import { normalizePublicUrl } from "./security";
import { takeScreenshot, takeSmartScrollScreenshots } from "./screenshot";

interface TgMessage { message_id: number; chat: { id: number }; text?: string; }
interface TgCallback { id: string; data?: string; message?: TgMessage; }
interface TgUpdate { message?: TgMessage; callback_query?: TgCallback; }
type WizardStep = "device" | "mode" | "theme" | "quality" | "review";
interface PendingShot extends ShotOptions { step?: WizardStep; }
const pending = new Map<number, PendingShot>();

const HELP = `Laqta · لقطة\n\nأرسل رابط الموقع وسأجهز لك اللقطة خطوة بخطوة.\n\nيمكنك اختيار الجهاز، طريقة التصوير، المظهر والجودة.\n\n≋ التمرير الذكي يصور الصفحة على عدة شاشات متتابعة مع تداخل 10% للمحافظة على السياق.\n\nمثال:\nhttps://example.com`;

async function tg(env: Env, method: string, body: BodyInit, headers?: HeadersInit) { return fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: "POST", body, headers }); }
async function sendText(env: Env, chatId: number, text: string, replyMarkup?: object): Promise<number | undefined> {
  const payload: Record<string, unknown> = { chat_id: chatId, text }; if (replyMarkup) payload.reply_markup = replyMarkup;
  const res = await tg(env, "sendMessage", JSON.stringify(payload), { "content-type": "application/json" }); if (!res.ok) return undefined;
  return (await res.json<{ result?: { message_id?: number } }>()).result?.message_id;
}
async function editMessage(env: Env, chatId: number, messageId: number, text: string, replyMarkup: object) { await tg(env, "editMessageText", JSON.stringify({ chat_id: chatId, message_id: messageId, text, reply_markup: replyMarkup }), { "content-type": "application/json" }); }
async function deleteMessage(env: Env, chatId: number, messageId: number) { await tg(env, "deleteMessage", JSON.stringify({ chat_id: chatId, message_id: messageId }), { "content-type": "application/json" }); }
async function answerCallback(env: Env, callbackId: string, text?: string) { await tg(env, "answerCallbackQuery", JSON.stringify({ callback_query_id: callbackId, text }), { "content-type": "application/json" }); }

function qualityLabel(q: QualityName) { return q === "standard" ? "1× عادية" : q === "high" ? "2× عالية" : "3× فائقة"; }
function deviceLabel(d: DeviceName) { return d === "iphone" ? "iPhone" : d === "android" ? "Android" : d === "tablet" ? "Tablet" : "Desktop"; }
function modeOf(o: ShotOptions): CaptureMode { return o.captureMode || (o.fullPage ? "full" : "viewport"); }
function modeLabel(o: ShotOptions) { const m = modeOf(o); return m === "smart" ? "تمرير ذكي" : m === "full" ? "الصفحة كاملة" : "لقطة واحدة"; }
function themeLabel(t: ThemeName) { return t === "dark" ? "داكن" : "فاتح"; }

function wizardView(options: PendingShot) {
  const step = options.step || "device";
  if (step === "device") return {
    text: `Laqta · لقطة\n\n01 / 04  اختر الجهاز\nكيف تريد أن تظهر الصفحة؟`,
    keyboard: { inline_keyboard: [
      [{ text: "◉ iPhone", callback_data: "pick-device:iphone" }, { text: "● Android", callback_data: "pick-device:android" }],
      [{ text: "▣ Tablet", callback_data: "pick-device:tablet" }, { text: "▰ Desktop", callback_data: "pick-device:desktop" }]
    ] }
  };
  if (step === "mode") return {
    text: `Laqta · لقطة\n\n02 / 04  اختر طريقة التصوير\n\n≋ التمرير الذكي مناسب للصفحات الطويلة؛ يصورها كلقطات متتابعة مع تداخل بسيط حتى لا ينقطع السياق.`,
    keyboard: { inline_keyboard: [
      [{ text: "▣ لقطة واحدة", callback_data: "pick-mode:viewport" }],
      [{ text: "↕ الصفحة كاملة", callback_data: "pick-mode:full" }],
      [{ text: "≋ تمرير ذكي", callback_data: "pick-mode:smart" }],
      [{ text: "‹ رجوع", callback_data: "back:device" }]
    ] }
  };
  if (step === "theme") return {
    text: `Laqta · لقطة\n\n03 / 04  اختر المظهر`,
    keyboard: { inline_keyboard: [
      [{ text: "☼ فاتح", callback_data: "pick-theme:light" }, { text: "☾ داكن", callback_data: "pick-theme:dark" }],
      [{ text: "‹ رجوع", callback_data: "back:mode" }]
    ] }
  };
  if (step === "quality") return {
    text: `Laqta · لقطة\n\n04 / 04  اختر الجودة\n\n2× مناسبة لمعظم الاستخدامات. 3× تعطي دقة أعلى بحجم ملف أكبر.`,
    keyboard: { inline_keyboard: [
      [{ text: "1× عادية", callback_data: "pick-quality:standard" }],
      [{ text: "2× عالية · موصى بها", callback_data: "pick-quality:high" }],
      [{ text: "3× فائقة", callback_data: "pick-quality:ultra" }],
      [{ text: "‹ رجوع", callback_data: "back:theme" }]
    ] }
  };
  return {
    text: `Laqta · جاهز للتصوير\n\nالجهاز       ${deviceLabel(options.device)}\nالتصوير      ${modeLabel(options)}\nالمظهر       ${themeLabel(options.theme)}\nالجودة       ${qualityLabel(options.quality)}\n\n${new URL(options.url).hostname}`,
    keyboard: { inline_keyboard: [
      [{ text: "التقط الصورة  ›", callback_data: "capture" }],
      [{ text: "‹ رجوع", callback_data: "back:quality" }, { text: "تعديل من البداية", callback_data: "back:device" }]
    ] }
  };
}

async function renderWizard(env: Env, chatId: number, messageId: number, options: PendingShot) { const view = wizardView(options); await editMessage(env, chatId, messageId, view.text, view.keyboard); }

function parse(text: string): PendingShot {
  const parts = text.trim().split(/\s+/); const url = normalizePublicUrl(parts[0]);
  let device: DeviceName = "iphone", theme: ThemeName = "light", quality: QualityName = "high", captureMode: CaptureMode = "viewport", waitMs = 0;
  for (let i = 1; i < parts.length; i++) {
    if (parts[i] === "--full") captureMode = "full"; else if (parts[i] === "--smart") captureMode = "smart"; else if (parts[i] === "--dark") theme = "dark";
    else if (parts[i] === "--quality" && parts[i + 1]) { const q = parts[++i] as QualityName; if (["standard", "high", "ultra"].includes(q)) quality = q; }
    else if (parts[i] === "--device" && parts[i + 1]) { const d = parts[++i] as DeviceName; if (["desktop", "iphone", "android", "tablet"].includes(d)) device = d; }
    else if (parts[i] === "--wait" && parts[i + 1]) waitMs = Number(parts[++i]) || 0;
  }
  return { url, device, fullPage: captureMode === "full", captureMode, theme, quality, waitMs, step: "device" };
}

async function sendPng(env: Env, chatId: number, png: Uint8Array, filename: string, caption: string) {
  const form = new FormData(); form.set("chat_id", String(chatId)); form.set("caption", caption); form.set("document", new Blob([png], { type: "image/png" }), filename);
  const res = await tg(env, "sendDocument", form); if (!res.ok) throw new Error(`Telegram upload failed (${res.status})`);
}

async function capture(env: Env, chatId: number, options: PendingShot) {
  const q = options.quality === "standard" ? "1x" : options.quality === "high" ? "2x" : "3x", mode = modeOf(options);
  const progressId = await sendText(env, chatId, `جاري تجهيز اللقطة…\n${deviceLabel(options.device)} · ${modeLabel(options)} · ${q}`);
  try {
    const host = new URL(options.url).hostname;
    if (mode === "smart") {
      const parts = await takeSmartScrollScreenshots(env, options);
      if (progressId) await deleteMessage(env, chatId, progressId);
      await sendText(env, chatId, `اكتملت اللقطة · ${parts.length} أجزاء\nتداخل 10% يحافظ على استمرارية المحتوى بين الصور.`);
      for (const part of parts) {
        const number = String(part.index).padStart(2, "0");
        await sendPng(env, chatId, part.data, `laqta-${options.device}-${number}-of-${String(part.total).padStart(2, "0")}-${q}.png`, `${part.index} / ${part.total} · ${host} · ${deviceLabel(options.device)} · ${q}`);
      }
    } else {
      const png = await takeScreenshot(env, { ...options, fullPage: mode === "full" });
      await sendPng(env, chatId, png, `laqta-${options.device}-${q}.png`, `${host} · ${deviceLabel(options.device)} · ${q}${mode === "full" ? " · Full page" : ""}`);
      if (progressId) await deleteMessage(env, chatId, progressId);
    }
  } catch (error) { if (progressId) await deleteMessage(env, chatId, progressId); throw error; }
}

export async function handleTelegram(request: Request, env: Env): Promise<Response> {
  if (env.TELEGRAM_WEBHOOK_SECRET && request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });
  const update = await request.json<TgUpdate>();
  if (update.callback_query?.message && update.callback_query.data) {
    const cb = update.callback_query, chatId = cb.message.chat.id, options = pending.get(chatId);
    if (!options) { await answerCallback(env, cb.id, "أرسل الرابط من جديد"); return new Response("ok"); }
    const data = cb.data;
    if (data.startsWith("pick-device:")) { options.device = data.split(":")[1] as DeviceName; options.step = "mode"; }
    else if (data.startsWith("pick-mode:")) { options.captureMode = data.split(":")[1] as CaptureMode; options.fullPage = options.captureMode === "full"; options.step = "theme"; }
    else if (data.startsWith("pick-theme:")) { options.theme = data.split(":")[1] as ThemeName; options.step = "quality"; }
    else if (data.startsWith("pick-quality:")) { options.quality = data.split(":")[1] as QualityName; options.step = "review"; }
    else if (data.startsWith("back:")) options.step = data.split(":")[1] as WizardStep;
    else if (data === "capture") {
      await answerCallback(env, cb.id, "بدأ التصوير");
      try { await capture(env, chatId, options); pending.delete(chatId); }
      catch (error) { const msg = error instanceof Error ? error.message : "Unknown error"; await sendText(env, chatId, `تعذر تصوير الصفحة.\n${msg}`); }
      return new Response("ok");
    }
    pending.set(chatId, options); await answerCallback(env, cb.id); await renderWizard(env, chatId, cb.message.message_id, options); return new Response("ok");
  }
  const message = update.message; if (!message?.text) return new Response("ok"); const chatId = message.chat.id, text = message.text.trim();
  if (text === "/start" || text === "/help") { await sendText(env, chatId, HELP); return new Response("ok"); }
  try { const options = parse(text); pending.set(chatId, options); const view = wizardView(options); await sendText(env, chatId, view.text, view.keyboard); }
  catch (error) { const msg = error instanceof Error ? error.message : "Unknown error"; await sendText(env, chatId, `الرابط غير صالح.\n${msg}\n\nأرسل رابطًا يبدأ بـ https:// أو http://`); }
  return new Response("ok");
}
