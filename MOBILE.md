# Native Mobile (Android + iOS) — Local Development

Build real **Android APK** and **iOS** apps from the same Vite/Phaser client via **Capacitor 6**. Run the multiplayer server on your Mac; phones on the same Wi‑Fi connect to it.

## 1. One-time prerequisites

### Everyone
- **Node 20+** and repo deps: `npm install --workspaces --include-workspace-root`

### Android
- **JDK 17** — `brew install openjdk@17` then add to PATH
- **Android Studio** (latest) + SDK Platform 34
- `ANDROID_HOME` set (Android Studio → Settings → SDK → path, usually `~/Library/Android/sdk`)

### iOS (Mac only)
- **Full Xcode** from the App Store (Command Line Tools alone is not enough)
- After install: `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`
- **CocoaPods**: `brew install cocoapods` or `sudo gem install cocoapods`
- Apple ID in Xcode for signing (free account works for your own device)

## 2. Run the game server locally

From repo root:

```bash
npm run dev
```

- Server: `http://localhost:2567` (WebSocket on same port)
- Browser client: `http://localhost:5173` — open multiple tabs to test multiplayer

Server only:

```bash
npm run dev:server
```

## 3. Point the mobile app at your Mac (same Wi‑Fi)

Phones cannot use `localhost`. Auto-detect your LAN IP and bake it into the client build:

```bash
npm run mobile:env
# writes client/.env.local → VITE_SERVER_URL=ws://192.168.x.x:2567
```

Or set it manually (see `client/.env.local.example`).

Keep **`npm run dev:server`** running on the Mac while testing on a device.

## 4. Build the web bundle + sync to native projects

First time only — native projects are already in `client/android` and `client/ios`. If you deleted them:

```bash
cd client
npm run cap:add:android   # once
npm run cap:add:ios       # once (needs Xcode + CocoaPods)
```

Every time you change client code or `.env.local`:

```bash
npm run mobile:build       # Android sync (works without Xcode)
npm run mobile:build:ios   # iOS sync (needs Xcode + CocoaPods)
```

## 5. Android APK

```bash
npm run mobile:open:android
```

In **Android Studio**: Run on a device/emulator, or **Build → Build APK**.

Command line (after `mobile:build`):

```bash
cd client/android
./gradlew assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk
```

Install on a phone: enable USB debugging, or copy the APK and open it.

`usesCleartextTraffic` is enabled so `ws://` to your LAN IP works in debug builds.

## 6. iOS app

Finish iOS setup once (if `cap add ios` warned about pods):

```bash
cd client/ios/App
pod install
cd ../../..
npm run mobile:open:ios
```

In **Xcode**:
1. Open the workspace (`.xcworkspace` under `client/ios/App`)
2. **Signing & Capabilities** → select your Team
3. Choose a device or simulator → **Run** (▶)

`NSAllowsLocalNetworking` is set so `ws://` to your LAN IP works on device.

Free Apple ID: install on your own device for ~7 days. Paid developer account for TestFlight / App Store.

## 7. Faster iteration (live reload on device)

```bash
# Terminal 1 — server
npm run dev:server

# Terminal 2 — Vite on LAN
cd client && npm run dev   # 0.0.0.0:5173

# Terminal 3 — point Capacitor at Vite (replace IP)
CAP_DEV_URL=http://192.168.1.42:5173 npm run cap:sync:android
npm run cap:open:android
```

Uncomment `server.url` / `cleartext` in `client/capacitor.config.ts` if you prefer config over env.

Same flow works for iOS with `cap:sync:ios` and `cap:open:ios`.

## 8. Update flow (after the first build)

```bash
npm run mobile:build
# Re-run from Android Studio / Xcode, or ./gradlew assembleDebug
```

## Troubleshooting

| Problem | Fix |
| --- | --- |
| App can't connect on phone | Same Wi‑Fi as Mac; `npm run mobile:env` again; server running (`npm run dev:server`) |
| `Cannot find module '@capacitor/...'` | `npm install --workspaces --include-workspace-root` from repo root |
| Android: no Java | Install JDK 17, open project in Android Studio |
| iOS: `xcodebuild` / pod errors | Install full Xcode, `xcode-select -s ...`, `pod install` in `client/ios/App` |
| iOS blocks WebSocket | Use LAN `ws://` with `NSAllowsLocalNetworking` (already set); production needs `wss://` |

## Native plugins

| Plugin | Purpose |
| --- | --- |
| `@capacitor/status-bar` | Hide status bar, dark style |
| `@capacitor/splash-screen` | Branded boot screen |
| `@capacitor/screen-orientation` | Lock landscape |

Calls live in `client/src/native/Native.ts` and no-op in the browser.

## File size (approx.)

- Android debug APK: ~7 MB  
- iOS release IPA: ~6 MB  

Procedural graphics — no large asset bundles.
