# Riser

Build good habits, break bad ones, and earn trophies for showing up every day.

Riser is a habit tracker for iOS and Android, built with Expo (React Native) and Supabase. It is offline-first: every screen reads from a local copy on the phone, so taps are instant. Changes sync to Supabase in the background.

## Features

- **One-tap check-ins.** Every check-in plays a chime you choose, fires confetti and gives a haptic tap. Habits with several check-ins a day fill up one tap at a time.
- **Build and Break habits.** You can quit smoking, vaping, alcohol, doomscrolling and more. A bad habit shows red until you log a clean day, then turns green.
- **Trophy ladders.** Each habit climbs its own ladder of challenges, from 3 to 365 days, and each finished challenge starts the next one. You can also design custom challenges with their own trophy names.
- **XP and levels.** Each level unlocks new app colors and chimes. XP is shared across your habits, so adding more habits doesn't speed up leveling.
- **Progress Report.** Includes a trend graph by category, a 16-week calendar heatmap, a report card for every habit, your perfect-day streak and full history.
- **Camera Roll.** Holds the proof photos attached to completed habits, sorted by date.
- **Coach.** A daily nudge plus weekly and monthly reports built from your real streaks. They're written on the phone by its built-in AI (Apple Intelligence or Gemini Nano) where available, or by the app's rule-based coach otherwise. Nothing leaves the device. A Claude-powered version is built and deployed but switched off (`COACH_ENGINE` in `src/lib/coach.ts`).
- **Reminders.** A morning intention, reminders at times you choose, and an evening nudge only when something is still open. All are local notifications.
- **Cloud backup and accounts.** Riser backs up to a guest account from the first day, with no sign-up. Add an email and password to sign in on another phone. Includes password reset and in-app account deletion.
- **Light and dark mode**, with text that stays readable on every unlockable color.

## Tech stack

Expo SDK 57 · React Native · Expo Router (typed routes, native tabs) · TypeScript (strict) · React Compiler · Reanimated · Supabase (Postgres, Auth, Row Level Security) · expo-audio · expo-haptics · expo-notifications · expo-image-picker · react-native-svg · Jest (jest-expo)

## Project layout

```
src/
  app/          Screens and routes (Expo Router): onboarding, (tabs), modals
  components/   UI, including the reward/celebration layer, charts and pickers
  hooks/        Local app state (use-habits), cloud sync + auth (use-cloud), reward loop (use-rewards)
  lib/          Domain logic: habits, streaks, challenges, XP, reminders, sync diff/merge, Supabase calls
  constants/    Theme colors and unlockable swatches
assets/         App icons, splash and synthesized reward sounds
plugins/        Config plugin that keeps notifications local-only
supabase/       Database schema (SQL migrations)
scripts/        Generators for the artwork and sounds
store/          Store listing copy, privacy policy, release checklist
```

## Develop

```bash
npm install
cp .env.example .env      # then fill in your Supabase URL and publishable key
npx expo start --tunnel   # scan the QR code with Expo Go
```

Without a `.env`, the app runs local-only, with account features hidden.

## Backend (Supabase)

1. Create a Supabase project. Put its URL and **publishable** key in `.env`. Never use the secret key in the app.
2. Run `supabase/migrations/20260925000000_init.sql` in the dashboard's **SQL Editor**. It creates the tables, Row Level Security policies, `updated_at` triggers and the `delete_account()` function.
3. Go to **Authentication → Sign In / Providers**. Enable **anonymous sign-ins**, keep **Email** enabled, and turn off **Confirm email**. If you leave confirmation on, the app asks for the emailed code instead.
4. Go to **Authentication → Emails → Reset Password**. Add `{{ .Token }}` to the template, because the app resets passwords with an emailed code rather than a link.
5. Before launch, set up custom SMTP (Authentication → Emails → SMTP). Supabase's built-in sender only delivers to your own team.

**Coach (Claude version, currently off):**
- `supabase/functions/coach` is a Deno edge function. It reads the signed-in user's habits through Row Level Security, builds a digest (`stats.ts`), asks Claude for structured output (`prompt.ts`), and stores the result in `coach_messages`: one per user, kind and period, so each message is paid for once.
- It needs the `ANTHROPIC_API_KEY` secret (Supabase → Edge Functions → Secrets).
- Deploy with `SUPABASE_ACCESS_TOKEN=… npx supabase functions deploy coach --project-ref <ref> --use-api`.
- Test the digest with `deno test supabase/functions/coach`.

**How sync works:**
- The local store in AsyncStorage stays the source of truth for the UI.
- `src/lib/sync.ts` compares it with a snapshot of what the cloud holds and pushes the difference: after edits (debounced), on launch, on foreground and with backoff while offline.
- It pulls rows changed since the last pull. Pending local edits win conflicts.

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
