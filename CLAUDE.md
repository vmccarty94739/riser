# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Riser is a habit tracker headed for the App Store and Google Play (Expo SDK 57, React Native 0.86, Expo Router, TypeScript strict, React Compiler on). Day-to-day development runs in **Expo Go**, so only modules bundled in Expo Go may be added. Store binaries are built in the cloud with EAS. All data stays on the device; there is no backend.

## Commands

Node comes from nvm, so in non-interactive shells run `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"` first.

```bash
npx expo start --tunnel                  # dev server (the user's phone can't reach the Mac over LAN)
npm test                                 # all unit tests (jest-expo)
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

- Typed routes (`.expo/types`) regenerate only when the dev server starts. After adding or renaming a route, `tsc` reports stale `href` errors until `npx expo start` has run once.
- Tunnel mode needs global `@expo/ngrok`, and the Expo CLI must be logged in as the same account signed into Expo Go.
- Tests live in `src/lib/__tests__/` and import their globals from `@jest/globals`, because the Expo tsconfig doesn't expose jest globals. `helpers.ts` freezes "today" at `2026-09-24` with fake timers. AsyncStorage and `.css` are mapped to mocks in the `jest` block of `package.json`.
- Xcode and iOS simulators are installed, but CocoaPods isn't (system Ruby 2.6), so there are no local native builds. For visual QA, run `xcrun simctl openurl booted "exp://127.0.0.1:8081/--/<route>"` against the running dev server. Adding `?seed=demo` loads a lived-in demo account (`DevDemoLink`, dev only).
- Dev-only code must sit behind `__DEV__` so it is stripped from release bundles: `src/components/dev-tools.tsx` (time travel, challenge shortcuts, XP grants, celebration previews), the demo seed, and `setClockOffset`.

## Product framework

The user designs by five layers; check new work against them: **core function** (create and track habits), **core loop** (every check-in and every new habit gets animation, haptics and sound), **accessory features** (history, charts, habit types), **surface area** (target 5–7 screens; there are currently 8 at the user's request: Onboarding, Dashboard, Progress Report, Camera Roll, New Habit, New Challenge, Habit Detail, Settings; celebrations are overlays, not screens) and **retention hook** (per-habit challenge ladders from 3 to 365 days, XP and levels, local notifications).

## Architecture

### Navigation and providers
- The root `_layout.tsx` wraps everything in `HabitsProvider` → `NavigationTheme` (the expo-router `ThemeProvider`, fed from `useTheme()`) → `RewardsProvider`. Inside it: `AppearanceSync` (applies the light/dark setting via `Appearance.setColorScheme` and the system background), a `Stack` with `Stack.Protected` guards on `onboarded`, `ReminderSync`, `StatusBar`, and `AnimatedSplashOverlay`, which fades out the branded splash.
- Routes: `onboarding.tsx`, then the `(tabs)` group (`index` Dashboard, `progress` Progress Report, `photos` Camera Roll), plus the modal routes `new-habit`, `new-challenge`, `habit/[id]` (`?edit=1` opens in edit mode) and `settings`. Modals render inside `sheet-screen.tsx`; tab screens inside `screen-scroll.tsx`, which handles the safe area, tab-bar inset, large title and header `action` slot for `SettingsButton`.
- Tabs are defined twice: `app-tabs.tsx` (native, `expo-router/unstable-native-tabs`) and `app-tabs.web.tsx`. Update both. The `.web.ts(x)` suffix is Metro's platform-specific resolution.

### Data
- **State** is one context in `src/hooks/use-habits.tsx`: `{ onboarded, account, seenLevel, bonusXp, habits, challenges, settings }`, persisted as JSON to AsyncStorage under `riser.store.v3`.
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
- **`src/lib/account.ts`** is an on-device account, since there's no backend. The password is salted, SHA-256 hashed and kept in expo-secure-store; only `{ method, identifier }` goes in the store. "Sign out & delete account" is the in-app deletion Apple requires. Swap in a real auth provider before adding sync.
- **Proof photos** (`src/lib/proofs.ts`) are copied into `Documents/proofs/` and stored by file name only, because iOS container paths change between updates. Resolve them with `proofUri()`.

### UI conventions
- **Colors** come from `Colors` in `src/constants/theme.ts`; every key must exist in both light and dark.
  - Always read colors through `useTheme()`. It applies the user's unlocked `accent`/`gold` choice and computes the `onAccent`/`onGold`/`onSuccess`/`onDanger` text colors.
  - Never hard-code white text on a themed or user-chosen color; use those tokens or `readableText(bg)`.
  - `success`/`danger` (good/bad) and the `ChartColors` category palette never change. The calendar heatmap ramps from white to the main color (`useHeatRamp`).
- **Text scaling:** `ThemedText` caps font scaling at 1.4× and `Animated.Text` at 1.2×. Habit-icon emoji don't scale.
- **Modals:** every transparent `Modal` sets `statusBarTranslucent navigationBarTranslucent` (Android edge-to-edge).
- **Keyboard:** iOS relies on `automaticallyAdjustKeyboardInsets` in ScrollViews; Android uses `KeyboardAvoidingView` with no behavior, per Expo's SDK 54+ guidance. Onboarding wraps its fixed footer in a `padding` KeyboardAvoidingView on iOS.
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
  - `ios.privacyManifests` aggregates the required-reason APIs the bundled libraries declare.
- `plugins/with-local-notifications-only.js` strips the unused push (`aps-environment`) entitlement. It must stay **first** in the plugin list, because entitlement mods run in reverse order.
- Verify config changes with `npx expo config --type introspect` or a scratch-copy `npx expo prebuild`.
- Brand artwork is generated by `scripts/art/make-art.js`, which needs `@resvg/resvg-js` installed outside the project. The iOS icon and the Play feature graphic must have no alpha channel.
