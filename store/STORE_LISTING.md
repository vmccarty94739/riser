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
A trend graph by category, a 16-week calendar, a summary of every habit, your perfect-day streak and full history — for good and bad habits.

PROOF PHOTOS
Snap a photo when you complete a habit. Your Camera Roll keeps them all, sorted by date.

YOUR PERSONAL COACH
Fresh coaching every time you open the app, built from patterns in your own check-ins: the habit you're crushing next to the one that's slipping, the weekday that keeps going wrong, the habit that sets up your whole day. Plus an afternoon tip ("I noticed you've been crushing your walks lately, but have you considered…") and weekly and monthly reports. Written privately on your phone, with Apple Intelligence on supported iPhones.

REMINDERS THAT HELP
A morning intention, a coach tip in the afternoon, reminders at the times you choose, and an evening nudge only if something's still open. Nothing when you're done.

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

**Privacy policy URL** (required by both): https://vmccarty94739.github.io/riser/privacy/ (GitHub Pages, built from `docs/privacy.md`; edit that file to change it). Settings → Help & privacy links to it in the app.

**Support URL** (Apple requires one): https://vmccarty94739.github.io/riser/ (built from `docs/index.md`).

**Support / contact email**: `riserapp.support@gmail.com`. It's also the sender of Riser's account emails: Gmail SMTP in Supabase, limited to 500 a day. Move to a domain with a service like Resend if the app outgrows that.

---

## 3. Age rating questionnaires

Riser lets people track quitting alcohol, tobacco/vaping, drugs, gambling and adult content. It shows only short labels and icons for these — no depictions, no content.

- **Apple**: answer the questionnaire honestly; the rating follows from the answers.
  - "Alcohol, Tobacco, or Drug Use or References" → **Infrequent/Mild** (quit-habit labels such as Alcohol, Weed, Drugs, Vaping).
  - "Mature or Suggestive Themes" → the app shows no sexual or suggestive content, only a neutral "Adult content" quit label (renamed from "Porn"). **None** is a fair answer; **Infrequent/Mild** is the cautious one. Either way the rating stays 13+, because the alcohol and drug references already set it there.
  - "Health or Wellness Topics" → **Yes** (habit and quitting support, no medical claims). "Medical or Treatment Information" → **No**.
  - No simulated gambling (the Gambling label is something to *quit*), no violence, no messaging or user-generated content shared with others, no unrestricted web access, no ads.
  - Expect a **13+** rating.
- **Google Play (IARC)**: answer "references to" drugs/alcohol/tobacco = yes, no depiction; no gambling, no user interaction/sharing, no location. Expect Teen.
- Target audience: **13+**, not designed for children.

---

## 4. App Review notes (Apple)

Paste into App Store Connect → App Review Information → Notes:

```
Riser is a habit tracker. It works offline and needs no sign-in: after onboarding, data is backed up
automatically to an anonymous guest account.

ACCOUNTS
- Creating an account is optional ("Skip for now" in onboarding, or Settings → Account → Create account).
- Email ownership is verified: the app emails an 8-digit code that must be entered to finish.
- Accounts are permanently deleted in-app: Settings → Account → "Delete account"
  (guests: Settings → "Erase all data"). Both confirm first and remove the account and all cloud data.

DEMO ACCOUNT (history already filled in)
- Email: <demo account email>   Password: <demo password>
- Settings → Account → "I already have an account" to sign in. Trophies and levels are earned over
  days of real check-ins, so the demo account shows them already unlocked.

FEATURES TO TRY
- Tap a habit's ring to check in (sound, haptic, confetti). Long-press a habit to edit or delete it.
- Progress Report tab: level, Coach's Report, trophy cabinet, charts, calendar and history.
- After checking in, tap the camera on the habit to attach a proof photo (Camera Roll tab).

PRIVACY AND PERMISSIONS
- The coach runs entirely on the device (Apple Intelligence where available, otherwise the app's own
  rules). No habit data is sent to any AI service.
- Notifications are local only (no push). Permission is asked during onboarding after an explanation
  screen, and can be skipped with "Maybe later".
- Camera and photos are only used when the user adds a proof photo; photos never leave the device.
- No ads, analytics or tracking.
```

Before submitting, create the demo account on a real phone (sign up with an inbox you control, confirm the code, then add a few weeks of check-ins or load them some other way) and fill in its email and password above. Don't use your personal account.

## 5. Assets

| Asset | Status |
|---|---|
| App icon (1024, no transparency) | ✅ `assets/images/icon.png` |
| Android adaptive icon + monochrome | ✅ `assets/images/android-icon-*.png` |
| Splash screen | ✅ `assets/images/splash-icon.png` |
| Play feature graphic (1024×500) | ✅ `store/feature-graphic.png` |
| iPhone screenshots — 6.9" (1320×2868), 3–10 | ✅ `store/screenshots/ios-6.9/` (9, captured on an iPhone 18 Pro Max simulator with the demo data) |
| Android phone screenshots — 2–8, at least 1080px on the short side | ⬜ take on a preview build |

Good screenshot set: Dashboard, a check-in celebration, Trophy Cabinet, Trend Graph + Calendar, a trophy/level-up pop-up, Break habits, Camera Roll.

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
