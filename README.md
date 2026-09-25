# Riser

Build good habits, break bad ones, and earn trophies for showing up every day.

Riser is a habit tracker for iOS and Android, built with Expo (React Native). It needs no sign-in and has no backend. Everything stays on the device.

## Features

- **One-tap check-ins.** Every check-in plays a chime you choose, fires confetti and gives a haptic tap. Habits with several check-ins a day fill up one tap at a time.
- **Build and Break habits.** You can quit smoking, vaping, alcohol, doomscrolling and more. A bad habit shows red until you log a clean day, then turns green.
- **Trophy ladders.** Each habit climbs its own ladder of challenges, from 3 to 365 days, and each finished challenge starts the next one. You can also design custom challenges with their own trophy names.
- **XP and levels.** Each level unlocks new app colors and chimes. XP is shared across your habits, so adding more habits doesn't speed up leveling.
- **Progress Report.** Includes a trend graph by category, a 16-week calendar heatmap, a report card for every habit, your perfect-day streak and full history.
- **Camera Roll.** Holds the proof photos attached to completed habits, sorted by date.
- **Reminders.** A morning intention, reminders at times you choose, and an evening nudge only when something is still open. All are local notifications.
- **Optional on-device account.** Sign in with email or phone and a password. The password is salted, hashed and kept in the secure keychain/keystore.
- **Light and dark mode**, with text that stays readable on every unlockable color.

## Tech stack

Expo SDK 57 · React Native · Expo Router (typed routes, native tabs) · TypeScript (strict) · React Compiler · Reanimated · expo-audio · expo-haptics · expo-notifications · expo-image-picker · expo-secure-store · react-native-svg · Jest (jest-expo)

## Project layout

```
src/
  app/          Screens and routes (Expo Router): onboarding, (tabs), modals
  components/   UI, including the reward/celebration layer, charts and pickers
  hooks/        App state (use-habits) and the check-in reward loop (use-rewards)
  lib/          Pure domain logic: habits, streaks, challenges, XP, reminders, account
  constants/    Theme colors and unlockable swatches
assets/         App icons, splash and synthesized reward sounds
plugins/        Config plugin that keeps notifications local-only
scripts/        Generators for the artwork and sounds
store/          Store listing copy, privacy policy, release checklist
```

## Develop

```bash
npm install
npx expo start --tunnel   # scan the QR code with Expo Go
```

| Command | What it does |
|---|---|
| `npm test` | Unit tests for streaks, challenges, XP/levels, reminders, icons, account and theme logic |
| `npx jest src/lib/__tests__/xp.test.ts` | Run one test file |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npx expo-doctor` | Dependency and config health |

In development builds only, **Settings** ends with developer tools: time travel, challenge shortcuts, previews of every celebration and demo data. Opening the app with `?seed=demo` in the URL (for example `exp://127.0.0.1:8081/--/?seed=demo`) loads a lived-in demo account.

## Release

Builds are made in the cloud with [EAS](https://docs.expo.dev/eas/). The native `ios/` and `android/` folders are generated from `app.json`, not committed.

```bash
npx eas-cli@latest login
npx eas-cli@latest init                                        # once: links the project to your Expo account
npx eas-cli@latest build --profile preview --platform all      # installable test builds
npx eas-cli@latest build --profile production --platform all   # store builds (auto-incremented)
npx eas-cli@latest submit --platform ios                       # upload to App Store Connect
npx eas-cli@latest submit --platform android                   # upload to Google Play
```

Store copy, privacy answers and the pre-submission checklist are in [`store/`](store/).

## Assets

- `scripts/art/make-art.js` draws the app icon, adaptive icon layers, splash, notification icon, favicon and Play feature graphic.
- `node scripts/synth-sounds.js assets/sounds` synthesizes the reward sounds.

## Privacy

Riser collects no data. There are no servers, analytics, ads or tracking. See [`store/PRIVACY_POLICY.md`](store/PRIVACY_POLICY.md).

## License

Proprietary. Copyright © 2026 Vaden McCarty. All rights reserved. See [LICENSE](LICENSE).
