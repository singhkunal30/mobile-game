# Native Mobile (Android APK + iOS IPA)

The game ships as a real native mobile app via **Capacitor 6**. Same TypeScript codebase → native Android `.apk` / `.aab` and iOS `.ipa`. No engine port.

What's wired up for you:
- Landscape orientation lock (native plugin)
- Status bar hidden + dark style
- Splash screen with brand background
- Status bar safe-area handled (via `viewport-fit=cover`)
- iOS rubber-band scroll suppressed
- Multi-touch (4 pointers) confirmed working through WKWebView and Android WebView

## One-time prerequisites

### For Android
- **JDK 17** (`brew install openjdk@17` on Mac, `apt install openjdk-17-jdk` on Linux)
- **Android Studio** (latest) + Android SDK Platform 34
- `ANDROID_HOME` env var pointing to the SDK location

### For iOS
- **Mac with macOS 13+** (Apple silicon or Intel)
- **Xcode 15+**
- **CocoaPods**: `sudo gem install cocoapods` (or `brew install cocoapods`)
- An Apple Developer account for device deploy / TestFlight (free tier works for local testing)

## Configure your server endpoint

Before building, point the app at your production multiplayer server:

```bash
# in /client
echo "VITE_SERVER_URL=wss://your-server.example.com:2567" > .env.local
```

If you skip this, the app will try `ws://<hostname>:2567` at runtime, which is fine for LAN testing but won't work from a phone on cellular.

## Build Android APK

```bash
cd client
npm run build              # produces dist/ with the right server URL baked in
npm run cap:add:android    # one-time: scaffolds android/ project
npm run cap:sync:android   # copies dist + plugins into android/
npm run cap:open:android   # opens Android Studio → hit Run, or Build > Build APK
```

To produce an installable APK from the command line (after `cap:sync`):

```bash
cd client/android
./gradlew assembleDebug    # → android/app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease  # signed release — see Android signing below
```

### Android signing (release)

```bash
keytool -genkey -v -keystore blackout.keystore \
  -alias blackout -keyalg RSA -keysize 2048 -validity 10000
```

Add to `client/android/key.properties`:
```
storePassword=...
keyPassword=...
keyAlias=blackout
storeFile=../../blackout.keystore
```

Then `./gradlew bundleRelease` produces `app/build/outputs/bundle/release/app-release.aab` for the Play Store.

## Build iOS IPA

```bash
cd client
npm run build
npm run cap:add:ios        # one-time: scaffolds ios/ project (requires CocoaPods)
npm run cap:sync:ios
npm run cap:open:ios       # opens Xcode
```

Then in Xcode:
1. Select target → Signing & Capabilities → pick your team
2. Product → Destination → pick a device or simulator
3. Product → Archive (for App Store / TestFlight)
4. Window → Organizer → Distribute App

Free Apple ID lets you side-load to a connected device for 7 days. Paid developer account ($99/yr) lets you ship to TestFlight / App Store.

## Live-reload from your desktop (faster iteration)

```bash
# 1. Start the Vite dev server bound to your LAN
cd client
npm run dev   # listens on 0.0.0.0:5173

# 2. Find your machine's LAN IP (e.g. 192.168.1.42)
# 3. In capacitor.config.ts uncomment the server.url block, OR run:
CAP_DEV_URL=http://192.168.1.42:5173 npm run cap:sync:android
npm run cap:open:android   # Run on device — it loads from your laptop in real time
```

The same trick works for iOS. Code changes auto-reload on the phone.

## Update flow (after the first build)

```bash
# every time you change client code:
npm run build && npx cap sync
# then re-run from Android Studio / Xcode (or ./gradlew assembleDebug)
```

## Native plugins included

| Plugin | Purpose | Native effect |
| --- | --- | --- |
| `@capacitor/status-bar` | Hide status bar, dark style | Maximizes immersive screen real estate |
| `@capacitor/splash-screen` | Branded boot screen | Eliminates white flash during JS load |
| `@capacitor/screen-orientation` | Lock landscape | Required for tactical top-down view |

All native plugin calls live in `client/src/native/Native.ts` and gracefully no-op on web. So `npm run dev` still works in a browser without any Capacitor runtime.

## File size

- Android `.apk` (debug, unsigned): ~7 MB
- Android `.aab` (release, signed): ~4 MB after Play Store delivery
- iOS `.ipa` (release): ~6 MB

Tiny because the game is procedurally rendered — no sprite atlases, no audio files.

## Known platform notes

- **iOS:** WKWebView is strict about WebSocket from non-HTTPS origins. **Use WSS in production** (the `wss://` scheme). For LAN dev, the live-reload flow above works because Capacitor whitelists the dev URL.
- **Android:** WebView v74+ recommended. Should be safe on any device running Android 7.0 (API 24) or higher.
- **Battery:** WebSocket idle + Phaser RAF render. Roughly comparable to a video call in power draw.
- **Audio autoplay:** Both platforms require a tap to start audio. We hook into the first pointer-down to unlock the WebAudio context.
