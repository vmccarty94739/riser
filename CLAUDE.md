# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Riser is a habit tracker headed for the App Store and Google Play (Expo SDK 57, React Native 0.86, Expo Router, TypeScript strict, React Compiler on). Day-to-day development runs in **Expo Go**, so only modules bundled in Expo Go may be added. Store binaries are built in the cloud with EAS. The backend is **Supabase** (Postgres + Auth). The app is offline-first: the local store is always the UI's source of truth, and Supabase is synced in the background.

## Commands

Node comes from nvm, so in non-interactive shells run `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"` first.

```bash
npx expo start --tunnel                  # dev server (the user's phone can't reach the Mac over LAN)
npm test                                 # all unit tests (jest-expo)
npm run test:e2e                         # live sync test: two simulated phones vs the real Supabase project
npx jest src/lib/__tests__/xp.test.ts    # one test file
npx jest -t "fair regardless"            # tests whose name matches
npm run typecheck                        # tsc --noEmit
npx expo lint                            # expected to be completely clean
npx prettier --write "src/**/*.{ts,tsx}" # formatting (.prettierrc.json: single quotes, 100 cols)
npx expo-doctor                          # expected 21/21
npx expo export --platform ios --platform android --output-dir <tmp>   # production bundle check
npx expo config --type introspect        # resolved native config (permissions, entitlements)
node scripts/synth-sounds.js assets/sounds   # regenerate all reward/chime WAVs
```

Release builds (`eas init/build/submit`) are listed in `README.md`. The store copy, privacy answers and release checklist are in `store/`.

## Environment gotchas

- Supabase config comes from `.env` (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY` = the publishable key; see `.env.example`). Without it, `cloudConfigured` is false and the app runs local-only with account UI hidden, which is also how the tests run. The schema lives in `supabase/migrations/`. There is no Supabase CLI link, so migrations are applied by pasting them into the dashboard SQL Editor. When the schema changes, add a new migration file; never edit an applied one.
- Typed routes (`.expo/types`) regenerate only when the dev server starts. After adding or renaming a route, `tsc` reports stale `href` errors until `npx expo start` has run once.
- Tunnel mode needs global `@expo/ngrok`, and the Expo CLI must be logged in as the same account signed into Expo Go.
- Tests live in `src/lib/__tests__/` and import their globals from `@jest/globals`, because the Expo tsconfig doesn't expose jest globals. `helpers.ts` freezes "today" at `2026-09-24` with fake timers. AsyncStorage and `.css` are mapped to mocks in the `jest` block of `package.json`.
- Xcode and iOS simulators are installed, but CocoaPods isn't (system Ruby 2.6), so there are no local native builds. For visual QA, run `xcrun simctl openurl booted "exp://127.0.0.1:8081/--/<route>"` against the running dev server. Adding `?seed=demo` loads a lived-in demo account (`DevDemoLink`, dev only).
- Dev-only code must sit behind `__DEV__` so it is stripped from release bundles: `src/components/dev-tools.tsx` (time travel, challenge shortcuts, XP grants, celebration previews), the demo seed, and `setClockOffset`. In `use-habits.tsx`, the `dev` helpers are `__DEV__ ? {…} : DEV_DISABLED`, so the demo data is dropped from release bundles. Check with `grep -ac "Read to the kids"` on an exported `.hbc` bundle.

## Product framework

The user designs by five layers; check new work against them: **core function** (create and track habits), **core loop** (every check-in and every new habit gets animation, haptics and sound), **accessory features** (history, charts, habit types), **surface area** (target 5–7 screens; there are currently 8 at the user's request: Onboarding, Dashboard, Progress Report, Camera Roll, New Habit, New Challenge, Habit Detail, Settings; celebrations are overlays, not screens) and **retention hook** (per-habit challenge ladders from 3 to 365 days, XP and levels, local notifications).

## Architecture

### Navigation and providers
- The root `_layout.tsx` wraps everything in `HabitsProvider` → `CloudProvider` → `NavigationTheme` (the expo-router `ThemeProvider`, fed from `useTheme()`) → `RewardsProvider`. Inside it: `AppearanceSync` (applies the light/dark setting via `Appearance.setColorScheme` and the system background), a `Stack` with `Stack.Protected` guards on `onboarded`, `ReminderSync`, `StatusBar`, and `AnimatedSplashOverlay`, which fades out the branded splash.
- Routes: `onboarding.tsx`, then the `(tabs)` group (`index` Dashboard, `progress` Progress Report, `photos` Camera Roll), plus the modal routes `new-habit`, `new-challenge`, `habit/[id]` (`?edit=1` opens in edit mode) and `settings`. Modals render inside `sheet-screen.tsx`; tab screens inside `screen-scroll.tsx`, which handles the safe area, tab-bar inset, large title and header `action` slot for `SettingsButton`.
- Tabs are defined twice: `app-tabs.tsx` (native, `expo-router/unstable-native-tabs`) and `app-tabs.web.tsx`. Update both. The `.web.ts(x)` suffix is Metro's platform-specific resolution.

### Data
- **State** is one context in `src/hooks/use-habits.tsx`: `{ onboarded, seenLevel, bonusXp, habits, challenges, settings }`, persisted as JSON to AsyncStorage under `riser.store.v3`. `useStoreAccess()` exposes raw `getStore`/`setStore`, for cloud sync only.
  - **Migration:** older keys (`riser.store.v2`, `riser.habits.v1`) migrate via `upgradeHabit`, and `normalize()` fills in newer fields. If you change a persisted shape, bump the key or migrate.
  - **Load failures:** an unreadable store is copied to a backup key and never overwritten.
  - **Side effects:** keep them, such as proof-file deletes, out of state updaters.
  - **Renames:** `updateHabit` also refreshes the name, emoji and kind snapshots stored on that habit's challenges.
- **Domain logic** is pure, in `src/lib/` (re-exported through `use-habits.tsx`), and unit-tested.
  - `habits.ts` defines `Habit`: `kind` is `build` or `quit`, where a check-in means "stayed clean" and `target` is always 1. It also has `target` check-ins per day, `reminders` as `HH:MM` strings, `log` as `Record<day, count>`, and `proofs`. The same file covers challenges, `TROPHY_TIERS`, streaks, perfect days (every good habit done and every bad one logged clean), `chartBuckets`, `categoryGroups` and `tally`.
  - Challenge status (`active`/`won`/`lost`) is **derived** from the log. Only `completedAt` (the trophy) and `dismissed` are stored.
- **Days** are local `YYYY-MM-DD` strings. All "today" logic goes through `now()` in `src/lib/clock.ts`; never use `new Date()` for app dates. Dev time travel shifts it, and reminder sync pauses meanwhile.
- **Icons** (`src/lib/icons.ts`) are grouped into categories (`BUILD_GROUPS`/`QUIT_GROUPS`, `categoryOf()`). The categories drive the Dashboard's collapsible sections and the chart colors.
  - Custom-drawn icons (`VAPE_ICON`) render only through `HabitIcon`. Wherever only text is possible (notifications, running text), use `iconText()`.
  - `<HabitIcon quit />` adds a prohibition slash.

### Core loop, XP and trophies
- **`use-rewards.tsx`** owns the loop:
  - `checkIn(habit, day)` and `undo()` update state and fire `feedback(kind)`, which plays the expo-audio sounds (the completion chime is `settings.chime`, one of `CHIMES`) and haptic patterns.
  - An effect detects challenge wins, so backfills count too. It marks the win, auto-starts the next ladder rung beginning tomorrow (custom challenges don't continue), and shows the trophy modal.
  - A second effect celebrates each new level once, tracked by `store.seenLevel`. The first measurement is recorded silently.
  - `CelebrationLayer` renders the confetti, perfect-day toast, trophy modal and level-up modal. A level-up waits for any open trophy modal.
- **XP** (`src/lib/xp.ts`, `useXp()`) is derived from the data, never stored, and **shared across habits**, so habit count never changes the pace:
  - Each day pays `DAILY_XP` × the share of that day's habits done, +20 for a perfect day.
  - A won trophy pays its tier XP ÷ the number of habits that existed when it was won (`wonXp`).
  - Any "+N XP" shown for a future reward must pass the current habit count (`useXp().habitCount` / `habitCountOn`).
  - Levels cost 80, 100, 120… XP. Theme colors (`THEME_SWATCHES.unlockedBy`) and premium `CHIMES` unlock every few levels, placed on the same real days as the original slower curve.
  - `store.bonusXp` is dev-only.
- **Trophy ladders are per habit.** Trophies award XP; levels hand out the unlocks.

### Retention
- **`src/lib/reminders.ts`** uses local notifications only.
  - `planReminders` builds the next 7 days from live state, capped at 60 (the iOS limit is 64): a morning intention, per-habit times, and an evening nudge that names the streak or challenge at risk and is skipped once everything's done.
  - `syncReminders` runs through a queue with a generation counter, so overlapping syncs can't duplicate notifications. `ReminderSync` re-runs it on every state change and on app foreground.
- **Proof photos** (`src/lib/proofs.ts`) are copied into `Documents/proofs/` and stored by file name only, because iOS container paths change between updates. Resolve them with `proofUri()`.

### Cloud sync and auth (Supabase)
- **Tables:**
  - `profiles` holds `seen_level` and the `settings` jsonb. `habits`, `checkins` (one row per habit per day; a count of 0 means un-checked) and `challenges` are keyed by `(user_id, id)` and keep the app's own string ids.
  - RLS limits every row to `auth.uid()`. The server sets `updated_at` with a trigger.
  - Deleting a habit or challenge removes its row; a habit's check-ins go with it by cascade. First, a tombstone `(kind, record_id)` is written to `deletions`, which pulls read so other devices drop the record. Saving a record again clears its tombstone. Migrations run in order: `…_init.sql`, `…_hard_deletes.sql`, `…_lock_down_helpers.sql`, then `…_coach_messages.sql`. The remaining Supabase advisor warnings are intentional: `delete_account` callable by signed-in users, and anonymous sign-ins. Leaked-password protection needs the Pro plan.
  - `delete_account()` (security definer) deletes the auth user, and the foreign keys cascade to every row.
  - Proof photos and `bonusXp` never sync. `onboarded` doesn't sync either: signing in sets it from whether the account has data.
- **`src/lib/sync.ts`** is pure and unit-tested. A `Snapshot` records what the cloud holds per record.
  - `diff(state, snapshot)` gives the pending changes. There's no outbox, so edits made offline survive restarts automatically.
  - Deletions are also recorded in `store.deleted` (saved with the data they remove). `diff` always sends them, and `mergeRemote` never re-adds them, so a lost or stale snapshot can't resurrect a deleted record. They're cleared with `confirmDeletions` after the cloud confirms.
  - `mergeRemote` applies pulled rows but skips records with pending local edits (local wins and is pushed next). It returns the *same* state object when nothing changed; that is what keeps pull → setStore → push from looping.
  - `replace` mode is for signing in on a new phone.
- **`src/lib/cloud.ts`** does the network side:
  - `push`: habits before check-ins because of the foreign key; chunked upserts; tombstone then delete.
  - `pull`: paged rows since a cursor from every table including `deletions`, ordered by each table's real key, re-reading 60s before the cursor. `profiles` has no `id` column; ordering by one broke every download once.
- **`src/hooks/use-cloud.tsx`** (`CloudProvider`, `useCloud()`):
  - It owns the session, silent anonymous sign-in once onboarding is done, and sync triggers: pull + push on session start, on foreground and every 60s while open; push 1.5s after local edits; and backoff retries while offline. Failures set `status` to `offline`/`error`, with `syncError` and `syncNow()` for the UI.
  - If an email account's session is lost, `meta.email` stops the silent guest sign-in, so the data isn't copied to a new guest. `signedOutEmail` prompts a sign-in, and signing back in to the same account merges instead of replacing.
  - Sync metadata (`userId`, `cursor`, `snapshot`, `replace`) lives in AsyncStorage under `riser.sync.v1`. An `epoch` counter plus a `switching` flag stop in-flight syncs from writing across account switches.
  - "Create account" upgrades the anonymous user in place: `updateUser({ email })`, then `{ password }`. If Supabase requires email confirmation, the form asks for the emailed code.
  - `signIn` / `resetPassword` (OTP code) mark the next pull as `replace`.
  - `signOut` and `deleteEverything` wipe local data and return to onboarding.
- **Auth emails** go out through Gmail SMTP as `riserapp.support@gmail.com` (the Supabase free plan requires custom SMTP before templates can be edited). The Reset Password template shows `{{ .Token }}`; this project's email codes are 8 digits. "Confirm email" is off and anonymous sign-ins are on.
- Supabase error messages go through `authMessage()` in `src/lib/auth.ts`. Forms live in `src/components/auth-forms.tsx` and are shared by Settings' `AccountCard` and onboarding.

### AI coach (Claude via a Supabase Edge Function)
- **Flow:** `useCoach(kind, today)` (`src/hooks/use-coach.ts`) → `requestCoach` (`src/lib/coach.ts`) → `supabase.functions.invoke('coach', { kind, today })` → `supabase/functions/coach/index.ts` (Deno).
  - The function verifies the user, reads their habits, check-ins and challenges **as the user** (RLS), and builds a text digest with `stats.ts` (pure; tested with `deno test supabase/functions/coach`).
  - It calls Claude through `client.messages.parse` with a zod schema (`prompt.ts`). The daily nudge uses `claude-haiku-4-5` with no thinking (Haiku 4.5 has no adaptive thinking or effort). Weekly/monthly reflections use `claude-sonnet-5` with adaptive thinking at effort `medium`. The choice is the user's, for cost.
  - The result is stored in `coach_messages` with the service role.
- **Kinds and periods:** `daily` (last 14 days incl. today; cached per day), `weekly` (last 7 full days; cached per Monday-week), `monthly` (last 30 full days; cached per calendar month). The period is `periodStart` in the function, mirrored by `coachPeriod` in the app. Existing rows are returned without calling Claude. There's a global cap of 3,000 new messages per 24h, and dates more than ±2 days from the server's are rejected.
- **Consent:** off by default (`settings.coach`, plus `coachAsked` for the one-time Dashboard offer). Nothing is sent until the user opts in, per App Store guideline 5.1.2(i). Keep `COACH_ABOUT`, `store/PRIVACY_POLICY.md` and the store notes in step if what's sent changes.
- **UI:** `CoachNudge` sits on the Dashboard under the level strip, and `CoachReport` (weekly/monthly) under "Coach's Report" on the Progress Report. The latest daily nudge becomes the next morning notification (`planReminders(…, coach)`), since there's no remote push.
- **Operations:**
  - The Anthropic key lives only in the `ANTHROPIC_API_KEY` Supabase secret. Without it the function returns 503 `coach_not_configured`, and the app hides the coach.
  - `supabase/functions/**` is excluded from the app's `tsconfig`/ESLint. Type-check it with `deno check supabase/functions/coach/index.ts`; the function's `deno.json` sets `nodeModulesDir: none`.
  - Deno refuses npm versions newer than 24h, so pin slightly older ones.

### UI conventions
- **Colors** come from `Colors` in `src/constants/theme.ts`; every key must exist in both light and dark.
  - Always read colors through `useTheme()`. It applies the user's unlocked `accent`/`gold` choice and computes the `onAccent`/`onGold`/`onSuccess`/`onDanger` text colors.
  - Never hard-code white text on a themed or user-chosen color; use those tokens or `readableText(bg)`.
  - `success`/`danger` (good/bad) and the `ChartColors` category palette never change. The calendar heatmap ramps from white to the main color (`useHeatRamp`).
- **Text scaling:** `ThemedText` caps font scaling at 1.4× and `Animated.Text` at 1.2×. Habit-icon emoji don't scale.
- **Modals:** every transparent `Modal` sets `statusBarTranslucent navigationBarTranslucent` (Android edge-to-edge).
- **Keyboard:** iOS relies on `automaticallyAdjustKeyboardInsets` in ScrollViews; Android uses `KeyboardAvoidingView` with no behavior, per Expo's SDK 54+ guidance. Onboarding wraps its fixed footer in a `padding` KeyboardAvoidingView on iOS.
- **Text inputs** always use `TextField` (`src/components/text-field.tsx`): one rounded style, with `onCard` when it sits on a card and `leading`/`trailing`/`footer` slots. Auth email fields use `textContentType="username"` so iOS password AutoFill can pair them, and new-password fields pass `passwordRules`.
- **Times** are always picked with `TimeField`/`TimePickerSheet` (hour, minute and AM/PM wheels).
- **Explanations** sit behind an ⓘ (`InfoButton`), not inline text. Section titles use `SectionHeading`, which is smaller than the page title.
- **Reanimated + React Compiler:** write shared values in event handlers with `.set()`, not `.value =`, because lint flags the latter.
- **Haptics** only when `Platform.OS !== 'web'`. Destructive actions confirm with `Alert.alert` on native.

## Store release

- The app ID `com.vadenmccarty.riser` serves as both the iOS bundle id and the Android package. It becomes permanent after the first upload.
- `eas.json` has two profiles: `preview` (internal APK) and `production` (versions auto-incremented remotely).
- **Native config lives only in `app.json`** (`ios/` and `android/` are generated and gitignored). Plugin options are deliberate:
  - No microphone, background audio, Face ID or media-playback foreground service. `android.blockedPermissions` backs this up.
  - Camera and photo-library permissions carry explanation text.
  - The notification icon and color are set.
  - `ios.privacyManifests` aggregates the required-reason APIs the bundled libraries declare. It also declares the collected data (email, user ID, user content; linked, not tracking), which must match the App Store privacy answers in `store/STORE_LISTING.md` and `store/PRIVACY_POLICY.md`.
- `plugins/with-local-notifications-only.js` strips the unused push (`aps-environment`) entitlement. It must stay **first** in the plugin list, because entitlement mods run in reverse order.
- Verify config changes with `npx expo config --type introspect` or a scratch-copy `npx expo prebuild`.
- Brand artwork is generated by `scripts/art/make-art.js`, which needs `@resvg/resvg-js` installed outside the project. The iOS icon and the Play feature graphic must have no alpha channel.
