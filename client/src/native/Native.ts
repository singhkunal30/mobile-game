// Capacitor native integrations — orientation lock, status bar, splash screen.
// All optional: the plugins are only invoked when the app is running in a Capacitor shell.
// On plain web the calls are no-ops.

import { Capacitor } from "@capacitor/core";

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform();

let initialized = false;

export async function initNative() {
  if (initialized || !isNative) return;
  initialized = true;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.hide().catch(() => {});
  } catch (e) {
    console.warn("[native] status bar plugin unavailable", e);
  }
  try {
    const { ScreenOrientation } = await import("@capacitor/screen-orientation");
    await ScreenOrientation.lock({ orientation: "landscape" }).catch(() => {});
  } catch (e) {
    console.warn("[native] orientation plugin unavailable", e);
  }
}

export async function hideSplash() {
  if (!isNative) return;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {}
}
