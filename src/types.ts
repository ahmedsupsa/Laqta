export interface Env {
  BROWSER: Fetcher;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
}

export type DeviceName = "desktop" | "iphone" | "android" | "tablet";
export type ThemeName = "light" | "dark";
export type QualityName = "standard" | "high" | "ultra";
export type CaptureMode = "viewport" | "full" | "smart";

export interface ShotOptions {
  url: string;
  device: DeviceName;
  fullPage: boolean;
  captureMode?: CaptureMode;
  theme: ThemeName;
  quality: QualityName;
  waitMs: number;
}
