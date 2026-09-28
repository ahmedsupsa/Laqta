import type { Env } from "./types";
import { handleTelegram } from "./telegram";
import { normalizePublicUrl } from "./security";
import { takeScreenshot } from "./screenshot";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/telegram") return handleTelegram(request, env);
    if (request.method === "GET" && url.pathname === "/health") return Response.json({ ok: true, service: "laqta" });
    if (request.method === "GET" && url.pathname === "/api/screenshot") {
      const target = url.searchParams.get("url");
      if (!target) return new Response("Missing ?url=", { status: 400 });
      try {
        const png = await takeScreenshot(env, {
          url: normalizePublicUrl(target),
          device: (url.searchParams.get("device") as any) || "desktop",
          fullPage: url.searchParams.get("full") === "1",
          theme: url.searchParams.get("dark") === "1" ? "dark" : "light",
          waitMs: Math.min(Number(url.searchParams.get("wait") || 0), 10_000)
        });
        return new Response(png, { headers: { "content-type": "image/png", "cache-control": "no-store" } });
      } catch (e) {
        return Response.json({ error: e instanceof Error ? e.message : "Screenshot failed" }, { status: 400 });
      }
    }
    return new Response("Laqta 📸\nPOST /telegram\nGET /api/screenshot?url=https://example.com", { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
};
