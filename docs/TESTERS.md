# Feasibility3D — Tester guide

Thanks for testing Feasibility3D. This guide covers installing the app, the
main workflow, and how to report problems. It takes about 15 minutes.

You need:

- The app link (for example `https://your-domain.example`) and the login
  email and password your coordinator sent you.
- A phone (Android or iPhone) and/or a desktop browser (Chrome, Edge or
  Safari).

---

## 1. Install the app

Feasibility3D is a web app that installs like a normal app. Installing is
optional (everything also works in a browser tab), but it gives you a home
screen icon, a full-screen window and offline reading.

### Android (Chrome)

1. Open the app link in **Chrome**.
2. Tap **Install app** in the top bar (or on the login page).
   If you don't see it, open Chrome's **⋮** menu → **Install app** /
   **Add to Home screen**.
3. Confirm. Feasibility3D appears on your home screen.

### iPhone / iPad (Safari)

1. Open the app link in **Safari** (other iOS browsers can't install apps).
2. Tap **Install app** to see the steps, or go straight to the
   **Share** button → **Add to Home Screen** → **Add**.
3. Open Feasibility3D from the home screen icon.

### Desktop (Chrome or Edge)

1. Open the app link.
2. Click **Install app** in the top bar, or the install icon at the right of
   the address bar.
3. The app opens in its own window and appears in your Start menu / Dock /
   Launchpad.

### Desktop (Safari on macOS Sonoma or later)

**File** → **Add to Dock**.

> If **Install app** doesn't appear, your browser doesn't support installing
> from the page, or the app is already installed. Use the browser menu steps
> above.

---

## 2. Log in

1. Open the app. You land on the **Sign in** page.
2. Enter the email and password you were given and tap **Sign in**.
3. You arrive on the dashboard (map, readings and cards).

You stay signed in for 7 days. To sign out, tap your avatar (top right) →
**Sign out**. Signing out also clears data saved for offline reading.

---

## 3. Run an analysis

1. On the dashboard, tap **Run analysis** (left sidebar, or the map
   toolbar).
2. Wait a few seconds. The engine detects the leak, locates it on the map and
   works out the volume released.
3. Check that:
   - the map shows the pipeline, the leak pin and the slick;
   - the cards show detection time, location (KM) and volume;
   - the **Detected** chip in the top bar shows a time.

Each run creates a spill record (for example `SPL-0001`) and an audit log
entry.

---

## 4. Move a spill through its statuses

A spill goes through four statuses, in order:

**Detected → JIV (joint investigation visit) → Clean-up → Closed**

1. Open **Spills** in the sidebar and tap a spill (for example `SPL-0001`).
2. Tap **Advance to JIV**.
3. Add a short note (for example "JIV completed on site") and confirm.
4. Repeat for **Clean-up** and **Closed**.
5. Open the **Audit log** tab: each change appears with time, who made it and
   your note.

Use the filter chips on the **Spills** page (Detected, JIV, Clean-up, Closed)
to check the spill shows up under its new status.

---

## 5. Upload evidence

1. Open a spill → **Evidence** tab.
2. Drag a file onto the upload area, or tap it to pick a file (on a phone you
   can take a photo).
   - Allowed: JPEG, PNG, PDF, CSV. Maximum 10 MB.
3. The file appears in the list with its SHA-256 fingerprint.

**Offline uploads:** if you have no signal, the upload is saved on your
device and you'll see "saved offline". It sends automatically when you're
back online, and then appears in the list. Please keep the app open (or
reopen it) after reconnecting so it can send.

---

## 6. Download reports

- **From a spill:** open the spill and tap **Download report** (PDF).
- **From Reports:** open **Reports** in the sidebar → **Create report**,
  pick a type and tap **Download**:
  - Spill report
  - Form A draft
  - Compliance status
  - Audit & integrity
  - Period summary
- **Regulatory forms:** on a spill, the **Regulatory forms** tab has Form A
  (**Generate draft**) and Forms B and C (**Generate**).

Generated reports are listed on the **Reports** page, so you can download
them again later.

---

## 7. Using it offline

When you lose connection, a dark banner appears at the top:
"You're offline — showing saved data (read-only)".

- You can read pages and spills you've **already opened** while online.
- You can't run analyses, change statuses or download new reports until
  you're back online.
- Evidence uploads are queued (see section 5).

---

## 8. Report a bug

Please report anything that's broken, confusing or slow, even if you're not
sure it's a bug.

Open an issue at
**https://github.com/OutstandingVick/feasibility3d/issues** (or send the
same details to your coordinator if you don't have GitHub). Include:

1. **What you did:** the steps, for example "Spills → SPL-0001 → Advance to
   JIV".
2. **What you expected** and **what happened** instead.
3. **Device and browser:** for example "iPhone 15, iOS 18, installed app" or
   "Windows 11, Chrome 131, browser tab".
4. **Online or offline** at the time.
5. **A screenshot or screen recording**, if you can.
6. **The time** it happened (with time zone). This helps us find it in the
   audit log.

Don't include your password in a bug report.
