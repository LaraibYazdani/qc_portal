# PackVision mobile app

The quality checker's app for iOS and Android: look up a job, photograph the printed sheet, get
**PASS / FAIL / RETAKE** against the approved design. It is a client of the PackVision API (same accounts,
same companies, same checks as the web portal); it has no server of its own.

Built with Expo SDK 58 (React Native 0.88, Expo Router). Read `AGENTS.md` before changing code: Expo APIs
change between SDK versions.

## Screens

| Screen | What it does |
|---|---|
| Sign in | **Continue with SAP** (when the server has SAP sign-in on), or email + password |
| Check (tab) | Job number → approved design; recent lookups; opens the job straight away when there is one match |
| Job | Design (tap to zoom), whether it can be checked yet, how strict (Tolerant / Normal / Strict), **Take photo**, earlier checks |
| Camera | Back camera with a framing guide and torch, or pick a photo; review, then **Check print** with upload progress |
| Result | Waits while the engine works, then the verdict (with a vibration), marked photo / differences / photo, defects with close-ups, inks, details |
| History (tab) | My checks (supervisors can switch to everyone), filter by result |
| Account (tab) | Who is signed in, role, company, server, whether photo checks are on, sign out |

Photos are shrunk to at most 4000 px (what the engine uses) and always sent as JPEG, so iPhone HEIC photos work.
Checks from the app are recorded with `source = mobile`.

## SAP sign-in

```
app ── opens phone browser ──▶ API /api/auth/ias/mobile/start?redirect_uri=packvision://auth&code_challenge=…
                                 └──▶ SAP IAS ──▶ API /api/auth/ias/callback ──▶ packvision://auth?ias_code=…
app ── POST /api/auth/ias/exchange { code, code_verifier } ──▶ session
```

- **No change in the IAS admin console**: SAP still returns to the web callback
  (`https://packvision.packagesgroup.com/api/auth/ias/callback`); the API sends the browser on to the app.
- The one-time code only works together with the secret the app made when it started (PKCE), so another app
  that grabs the `packvision://` link can't use it.
- The server only hands back to addresses in `MOBILE_REDIRECT_URIS` (default `packvision://auth`).

## Run it while developing

```powershell
cd mobile
npm install
# where the API is, reachable from the phone (same Wi-Fi), e.g. a dev API on this PC:
Set-Content .env.local "EXPO_PUBLIC_API_URL=http://192.168.1.20:5000"
npx expo start          # scan the QR code with Expo Go (Android) or the Camera app (iPhone)
```

- Everything the app uses is in Expo Go (camera, photo library, secure storage, browser, file upload).
- SAP sign-in from Expo Go: the app's address is then `exp://…/--/auth`, so the dev server needs
  `MOBILE_REDIRECT_URIS=packvision://auth,exp://*`. Never set `exp://*` in production.
- Checks: `npx tsc --noEmit` (types), `npx expo-doctor` (config and versions).
- If edits don't show up, restart with `npx expo start --clear`.

## Build for the stores

With EAS (Expo's build service; no Mac needed for the iPhone build):

```powershell
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview      # APK to install directly / via MDM
npx eas-cli@latest build --platform all --profile production       # store builds (AAB + IPA)
npx eas-cli@latest submit --platform ios                           # TestFlight / App Store
```

`eas.json` points both profiles at `https://packvision.packagesgroup.com`.
App IDs: `com.packagesgroup.packvision` (iOS bundle ID and Android package; change before the first store
build if the company uses another prefix; they can't be changed after publishing).

Needed from the company: an Apple Developer **organisation** account, a Google Play Console account
(or an MDM for in-house distribution), and an Expo account for EAS.

## Layout

```
src/app/              routes (Expo Router)
  _layout.tsx         providers, launch screen, root stack
  login.tsx
  (app)/              everything behind sign-in (its layout sends signed-out users to /login)
    (tabs)/           Check, History, Account
    job/[id].tsx  check/[jobId].tsx  inspection/[id].tsx
  +native-intent.tsx  keeps the SAP return link (packvision://auth) from navigating
src/lib/              api (token; waits for the saved session), auth (SAP + PKCE), photo, store, types, format
src/components/       ui (buttons, cards, badges…), theme (same colours as the web app), Artwork, InspectionResult
```

Rule: every `_layout.tsx` must always render its navigator. Returning `null`, a `<Redirect>` or extra
elements beside it makes Expo Router loop; redirect from an effect instead.
