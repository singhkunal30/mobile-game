import type { CapacitorConfig } from "@capacitor/cli";

// Set VITE_SERVER_URL to your prod WSS endpoint before building.
// Default: connects to localhost when run via Capacitor live-reload, otherwise expects the URL baked in.

const config: CapacitorConfig = {
  appId: "com.blackout.protocol",
  appName: "Blackout Protocol",
  webDir: "dist",
  backgroundColor: "#0a0d12",
  android: {
    backgroundColor: "#0a0d12",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
  ios: {
    backgroundColor: "#0a0d12",
    contentInset: "always",
    preferredContentMode: "mobile",
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: true,
      backgroundColor: "#0a0d12",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0a0d12",
      overlaysWebView: true,
    },
    ScreenOrientation: {
      orientation: "landscape",
    },
  },
  server: {
    androidScheme: "https",
    // For LAN live-reload during dev: set CAP_DEV_URL=http://192.168.x.x:5173 and uncomment:
    // url: process.env.CAP_DEV_URL,
    // cleartext: !!process.env.CAP_DEV_URL,
  },
};

export default config;
