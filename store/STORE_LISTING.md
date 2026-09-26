# Riser: store listing & submission guide

Everything the App Store and Google Play ask for, ready to paste, plus the steps only you can do.

---

## 1. Listing copy

**App name** (30 max): `Riser: Habit Tracker`
_"Riser" alone may already be taken on either store; the suffix also helps search._

**iOS subtitle** (30 max): `Build habits. Break bad ones.`

**Google Play short description** (80 max):
`Build good habits, break bad ones, and earn trophies for every streak you keep.`

**iOS promotional text** (170 max, editable anytime):
`Check in with one tap, climb the trophy ladder from Kickstart to Legend, and level up to unlock new colors and chimes. Small wins, every day.`

**Description** (both stores):

```
Riser turns habits into wins you can feel.

CHECK IN WITH ONE TAP
Tap the ring when you do a habit. Every check-in gets a satisfying chime, a burst of confetti and a little haptic kick. Habits you do several times a day fill up one tap at a time.

BUILD GOOD HABITS, BREAK BAD ONES
Swipe between Build and Break. Track the things you want to do more of, and the things you're quitting — smoking, vaping, alcohol, doomscrolling, junk food and more. Bad habits stay red until you log a clean day, then turn green.

CLIMB THE TROPHY LADDER
Every habit has its own ladder: Kickstart, Week Warrior, Fortnight Focus, Habit Forged, Monthly Master, Iron Will, Quarter Crown, Unbreakable and Legend. Finish one challenge and the next begins. Or design your own challenge with its own trophy name.

LEVEL UP
Every check-in, perfect day and trophy earns XP. Level up to unlock new app colors and chimes. XP is shared across your habits, so it's about doing all of them — not just adding more.

SEE YOUR PROGRESS
A trend graph by category, a 16-week calendar, a report card for every habit, your perfect-day streak and full history — for good and bad habits.

PROOF PHOTOS
Snap a photo when you complete a habit. Your Camera Roll keeps them all, sorted by date.

YOUR PERSONAL COACH
A nudge each morning written from your real streaks ("You've nailed sleep for 14 days! Water's lagging, so try this…"), plus weekly and monthly reports on what went well and what slipped. Written privately on your phone, with Apple Intelligence on supported iPhones.

REMINDERS THAT HELP
A morning intention, reminders at the times you choose, and an evening nudge only if something's still open. Nothing when you're done.

BACKED UP AND PRIVATE
Your habits are saved on your phone and backed up to your private account, so a new phone picks up right where you left off. No ads, no tracking, no analytics.
```

**Keywords** (iOS, 100 max, comma-separated, no spaces):
`habit,tracker,streak,routine,goals,quit,sober,smoking,daily,challenge,reminder,discipline,planner`

**Category**: Health & Fitness (primary) · Productivity (secondary)

---

## 2. Privacy answers

**Apple — App Privacy ("nutrition label")**: choose **Data Collected**, then declare:

| Data type | Linked to user | Used for tracking | Purpose |
|---|---|---|---|
| Contact Info → Email Address | Yes | No | App Functionality |
| Identifiers → User ID | Yes | No | App Functionality |
| User Content → Other User Content (habits, check-ins, notes) | Yes | No | App Functionality |

No analytics, no ads, no third-party tracking. Proof photos stay on the phone and are not collected.

**Coach:** it runs on the device, using Apple Intelligence or Gemini Nano where available and the app's own rules otherwise. No habit data is sent anywhere for it, so it doesn't change the answers above. If the coach later moves to Claude (a server-side AI), it must become opt-in, and these answers and the privacy policy need updating (see `COACH_ENGINE` in `src/lib/coach.ts`).

**Google Play — Data safety**:
- Does your app collect or share any of the required user data types? **Yes, collects** (does not share).
- Personal info → **Email address**: collected, optional (only with an account), for App functionality and Account management.
- App activity → **Other user-generated content** (habits, check-ins, notes): collected, required, for App functionality.
- App info and performance / Device IDs: not collected.
- Is data encrypted in transit? **Yes**. Can users request deletion? **Yes** (Settings → Account → Delete account, or email).
- Supabase processes the data on your behalf, which counts as a service provider, not "sharing".

**Privacy policy URL** (required by both): host `store/PRIVACY_POLICY.md` publicly (GitHub Pages, a Notion public page, Carrd, etc.).

**Support URL** (Apple requires one): any public page with a way to contact you.

**Support / contact email**: `riserapp.support@gmail.com`. It's also the sender of Riser's account emails: Gmail SMTP in Supabase, limited to 500 a day. Move to a domain with a service like Resend if the app outgrows that.

---

## 3. Age rating questionnaires

Riser lets people track quitting alcohol, tobacco/vaping, drugs, gambling and porn. It shows only short labels and icons for these — no depictions, no content.

- **Apple**: answer honestly. "Alcohol, Tobacco, or Drug Use or References" → **Infrequent/Mild**. "Mature or Suggestive Themes" → **Infrequent/Mild** (because of the "Porn" label). No simulated gambling, violence, or user-generated content shared with others. Expect a teen rating.
  - _Optional:_ renaming the "Porn" label to "Adult content" may lower the rating.
- **Google Play (IARC)**: answer "references to" drugs/alcohol/tobacco = yes, no depiction; no gambling, no user interaction/sharing, no location. Expect Teen.
- Target audience: **13+**, not designed for children.

---

## 4. App Review notes (Apple)

```
Riser works offline and needs no sign-in: data is backed up to an anonymous account automatically.
An optional email + password account can be created during onboarding (skippable) or in Settings,
and permanently deleted in Settings → Account → "Delete account" (or Settings → Erase all data).
Reminders are local notifications. The coach (Dashboard card, Progress Report) runs entirely on the
device; no habit data is sent to any AI service.
Camera and photo access are only requested when the user adds a proof photo to a completed habit.
```

---

## 5. Assets

| Asset | Status |
|---|---|
| App icon (1024, no transparency) | ✅ `assets/images/icon.png` |
| Android adaptive icon + monochrome | ✅ `assets/images/android-icon-*.png` |
| Splash screen | ✅ `assets/images/splash-icon.png` |
| Play feature graphic (1024×500) | ✅ `store/feature-graphic.png` |
| iPhone screenshots — 6.9" (1320×2868) or 6.7" (1290×2796), 3–10 | ⬜ take on a TestFlight/preview build |
| Android phone screenshots — 2–8, at least 1080px on the short side | ⬜ take on a preview build |

Good screenshot set: Dashboard (with a perfect streak), a check-in celebration, Trophy Cabinet, Trend Graph + Calendar, a trophy/level-up pop-up, Break habits, Camera Roll.

---

## 6. Release checklist (only you can do these)

1. **Accounts**: Apple Developer Program ($99/year) and Google Play Console ($25 once).
2. **Confirm the app ID**: `com.vadenmccarty.riser` in `app.json` (iOS `bundleIdentifier`, Android `package`). It can't be changed after the first upload, so change it now if you want a different one.
3. **Link EAS**: `npx eas-cli@latest login`, then `npx eas-cli@latest init`.
4. **Test build**: `npx eas-cli@latest build --profile preview --platform all`, install on real phones, and check notifications, camera, photo picking, sounds and haptics (these can't be fully tested in Expo Go).
5. **Store build**: `npx eas-cli@latest build --profile production --platform all`.
6. **Submit**: `npx eas-cli@latest submit -p ios` (TestFlight → App Review) and `npx eas-cli@latest submit -p android`.
7. **Google Play, new personal accounts**: Google requires a **closed test with at least 12 testers for 14 continuous days** before you can publish to production. Start this early.
8. Fill in the listing, privacy answers, age ratings, screenshots, privacy policy URL and support URL above.
