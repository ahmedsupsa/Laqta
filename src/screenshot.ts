import { launch } from "@cloudflare/playwright";
import type { Env, ShotOptions } from "./types";

const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, userAgent: undefined, isMobile: false, hasTouch: false },
  iphone: { viewport: { width: 390, height: 844 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1", isMobile: true, hasTouch: true },
  android: { viewport: { width: 412, height: 915 }, userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36", isMobile: true, hasTouch: true },
  tablet: { viewport: { width: 820, height: 1180 }, userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1", isMobile: true, hasTouch: true }
} as const;

const SCALE = { standard: 1, high: 2, ultra: 3 } as const;
export interface ScreenshotPart { data: Uint8Array; index: number; total: number; scrollY: number; }

async function preparePage(env: Env, options: ShotOptions) {
  const browser = await launch(env.BROWSER);
  const preset = DEVICES[options.device];
  const context = await browser.newContext({
    viewport: preset.viewport,
    deviceScaleFactor: SCALE[options.quality],
    userAgent: preset.userAgent,
    isMobile: preset.isMobile,
    hasTouch: preset.hasTouch,
    colorScheme: options.theme,
    locale: "ar-SA"
  });
  const page = await context.newPage();
  await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  if (options.waitMs > 0) await page.waitForTimeout(Math.min(options.waitMs, 10_000));
  return { browser, page, preset };
}

export async function takeScreenshot(env: Env, options: ShotOptions): Promise<Uint8Array> {
  const { browser, page } = await preparePage(env, options);
  try {
    return await page.screenshot({ type: "png", fullPage: options.fullPage, scale: "device" });
  } finally { await browser.close(); }
}

export async function takeSmartScrollScreenshots(env: Env, options: ShotOptions): Promise<ScreenshotPart[]> {
  const { browser, page, preset } = await preparePage(env, options);
  try {
    const viewportHeight = preset.viewport.height;
    const overlap = Math.round(viewportHeight * 0.10);
    const step = viewportHeight - overlap;
    const maxParts = 20;

    // Warm the page with a real scroll so lazy-loaded images/sections have a chance to render.
    const initialHeight = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0));
    for (let y = 0; y < initialHeight; y += step) {
      await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
      await page.waitForTimeout(180);
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(250);

    const pageHeight = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0));
    const maxScroll = Math.max(0, pageHeight - viewportHeight);
    const positions: number[] = [];
    for (let y = 0; y < maxScroll && positions.length < maxParts - 1; y += step) positions.push(Math.round(y));
    if (!positions.length || positions[positions.length - 1] !== maxScroll) positions.push(maxScroll);

    const uniquePositions = [...new Set(positions)];
    const parts: ScreenshotPart[] = [];
    for (let i = 0; i < uniquePositions.length; i++) {
      const y = uniquePositions[i];
      await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
      await page.waitForTimeout(250);
      const data = await page.screenshot({ type: "png", fullPage: false, scale: "device" });
      parts.push({ data, index: i + 1, total: uniquePositions.length, scrollY: y });
    }
    return parts;
  } finally { await browser.close(); }
}
