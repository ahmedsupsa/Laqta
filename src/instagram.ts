import { launch } from "@cloudflare/playwright";
import type { Env } from "./types";

export interface InstagramStoryCapture {
  image: Uint8Array;
  username: string;
}

export function isInstagramStoryUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return (host === "instagram.com" || host === "instagr.am") && /^\/stories\/[^/]+\//.test(url.pathname);
  } catch { return false; }
}

export function storyUsername(raw: string): string {
  try {
    const match = new URL(raw).pathname.match(/^\/stories\/([^/]+)/);
    return match?.[1] || "instagram";
  } catch { return "instagram"; }
}

export async function capturePublicInstagramStory(env: Env, rawUrl: string): Promise<InstagramStoryCapture> {
  const username = storyUsername(rawUrl);
  const browser = await launch(env.BROWSER);
  try {
    const context = await browser.newContext({
      viewport: { width: 430, height: 932 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: "ar-SA",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
    });
    const page = await context.newPage();
    await page.goto(rawUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(3500);

    const current = page.url();
    const bodyText = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
    if (/accounts\/login/.test(current) || bodyText.includes("log in to instagram") || bodyText.includes("تسجيل الدخول")) {
      throw new Error("هذه الستوري تتطلب تسجيل دخول أو ليست متاحة للعامة.");
    }

    // Hide common cookie/dialog overlays when possible; never bypass authentication or access controls.
    await page.evaluate(() => {
      for (const el of Array.from(document.querySelectorAll('[role="dialog"]'))) {
        const text = (el.textContent || "").toLowerCase();
        if (text.includes("cookie") || text.includes("cookies")) (el as HTMLElement).style.display = "none";
      }
    }).catch(() => undefined);

    // Add a clean attribution strip inside the exported image.
    await page.evaluate((handle) => {
      const old = document.getElementById("laqta-story-credit");
      if (old) old.remove();
      const credit = document.createElement("div");
      credit.id = "laqta-story-credit";
      credit.textContent = `Instagram · @${handle}`;
      Object.assign(credit.style, {
        position: "fixed", left: "12px", right: "12px", bottom: "12px", zIndex: "2147483647",
        boxSizing: "border-box", padding: "11px 14px", borderRadius: "14px",
        background: "rgba(0,0,0,.62)", color: "white", font: "600 14px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
        letterSpacing: ".1px", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
        textAlign: "left", direction: "ltr", pointerEvents: "none"
      });
      document.documentElement.appendChild(credit);
    }, username);

    const image = await page.screenshot({ type: "png", fullPage: false, scale: "device" });
    return { image, username };
  } finally { await browser.close(); }
}
