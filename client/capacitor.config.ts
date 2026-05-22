import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.blackout.protocol",
  appName: "Blackout Protocol",
  webDir: "dist",
  android: {
    backgroundColor: "#0a0d12",
  },
  server: {
    // Set to your dev server URL for live reload on device, e.g. "http://192.168.1.10:5173"
    // androidScheme: "https",
  },
};

export default config;
