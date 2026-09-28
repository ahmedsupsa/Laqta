import { launch } from "@cloudflare/playwright";
import type { Env, ShotOptions } from "./types";

const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, userAgent: undefined, isMobile: false, hasTouch: false },
  iphone: { viewport: { width: 390, height: 844 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1", isMobile: true, hasTouch: true },
  android: { viewport: { width: 412, height: 915 }, userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36", isMobile: true, hasTouch: true },
  tablet: { viewport: { width: 820, height: 1180 }, userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1", isMobile: true, hasTouch: true }
} as const;

const SCALE = { standard: 1, high: 2, ultra: 3 } as const;

export async function takeScreenshot(env: Env, options: ShotOptions): Promise<Uint8Array> {
  const browser = await launch(env.BROWSER);
  try {
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
    return await page.screenshot({ type: "png", fullPage: options.fullPage, scale: "device" });
  } finally {
    await browser.close();
  }
}
