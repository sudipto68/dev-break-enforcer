# Dev Break Enforcer

> A Chrome extension that enforces real breaks — locks every tab until you step away, walk for a minute, and drink water.

---

## Why I built this

I'm a software engineer and I used to spend 8–10 hours a day staring at a screen without moving. Not because I didn't know it was bad — I knew. I had tried every break reminder app out there. They all sent a notification. I dismissed it in half a second and kept coding.

The problem isn't awareness. The problem is that every existing tool gives you an easy way out.

So I built something that doesn't. When the timer hits zero, your entire browser locks. Every tab. You can't close the overlay, you can't switch tabs, you can't do anything — until you start a 1-minute countdown, step away from your screen, drink some water, and come back to tick two checkboxes confirming you actually did it.

It sounds aggressive. It is. And it's the only thing that's actually worked for me.

After a few weeks of using it, I stopped getting the 3pm headaches. My eyes stopped feeling dry by evening. I started actually drinking enough water. Small things — but they add up over a career spent in front of a screen.

If you're a developer who ignores every notification that isn't a prod alert, this was built for you.

---

## Features

- Locks all open tabs with a full-screen overlay after a configurable work interval (default 60 min)
- New tabs opened during a break are also redirected to the break screen
- 1-minute countdown timer — checkboxes only unlock when the timer hits zero
- Detects active **Google Meet**, **Zoom**, **Teams**, and other video calls — delays the break automatically and shows you why
- **Pauses media automatically** — any playing video or audio (YouTube, Spotify, etc.) is paused when the overlay appears and resumes when you unlock
- **Snooze** option (limited per session, configurable)
- **5-minute warning** toast on your current tab before the lock kicks in
- Tracks daily break history and a **streak** across sessions
- Pause/resume the timer from the popup
- Fully configurable via a settings page

---

## Installation

This extension is not on the Chrome Web Store. You can install it directly from the code — it will take about 2 minutes.

**Requirements:** Google Chrome or any Chromium-based browser (Edge, Brave, Arc)

### Step 1 — Get the code

**Option A — with Git:**
```bash
git clone https://github.com/your-username/break-enforcer.git
```

**Option B — download ZIP:**
- Click the green **Code** button on this GitHub page
- Select **Download ZIP**
- Extract it anywhere on your machine (e.g. your Desktop)

### Step 2 — Load it in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Turn on **Developer mode** using the toggle in the top-right corner
3. Click **Load unpacked**
4. Select the `break-enforcer` folder — the one that contains `manifest.json`
5. The extension icon appears in your toolbar. Click the puzzle piece 🧩 icon and pin it for easy access

### Step 3 — You're done

The 60-minute timer starts immediately. No setup needed.

> **After pulling any code updates**, go back to `chrome://extensions` and click the **↺ reload** button on the extension card. No need to remove and re-add it.

---

## How to Use

### Normal workflow

1. Install the extension — the 60-minute work timer starts immediately
2. Work as usual. The extension runs silently in the background
3. At 5 minutes before the break, a warning toast appears on your current tab
4. When time is up, **all your tabs freeze** with the break screen — any playing media is paused automatically
5. Click **Start Break Timer** — a 1-minute countdown begins
6. Step away from your screen, walk around, drink water
7. Return, tick both checkboxes, click **Unlock Browser**
8. The timer resets, media resumes, and your next break is scheduled

**Every time you open Chrome**, the timer starts fresh. No leftover locked state from a previous session.

### Extension popup

Click the extension icon in the toolbar to see:
- **Next break in** — live countdown to the next lock
- **Today's stats** — completed breaks and snoozes
- **Streak** — consecutive days of full compliance
- **Pause / Resume** — temporarily stops the timer (e.g. end of workday)

### Settings

Right-click the extension icon → **Options**, or open `chrome://extensions` → Dev Break Enforcer → **Extension options**.

| Setting | Default | Description |
|---------|---------|-------------|
| Work interval | 60 min | How long between breaks (1–120 min) |
| Break timer duration | 1 min | Length of the countdown on the break screen |
| Snooze limit | 1 per session | How many times you can snooze before breaks are mandatory |
| Snooze delay | 10 min | Minutes added when you snooze |
| 5-minute warning | On | In-page toast before the lock fires |
| Video call domains | See below | Domains that trigger automatic break delay |

**Video call detection:** If any tab matches a domain in the list, the break is delayed by the snooze duration and retried. Default domains: `meet.google.com`, `zoom.us`, `teams.microsoft.com`, `whereby.com`, `webex.com`. Subdomain matching is supported — `us06web.zoom.us` is caught by the `zoom.us` rule. You can add or remove domains from the settings page.

### Testing the extension

Set **Work interval** to `1` or `2` minutes in settings and click **Save**. The next break will fire after that interval. Remember to set it back to 60 when you're done testing.

---

## How It Works

### Architecture

```
break-enforcer/
├── manifest.json               Chrome extension manifest (MV3)
├── background/
│   └── service-worker.js       Core logic: timer, state machine, alarms
├── content/
│   └── overlay.js              Injected into every tab — creates the lock overlay
├── overlay/
│   ├── overlay.html            The break screen UI
│   ├── overlay.css             Break screen styles
│   └── overlay.js              Break screen logic (countdown, checkboxes, confirm)
├── popup/
│   ├── popup.html              Extension icon popup
│   ├── popup.css
│   └── popup.js
└── options/
    ├── options.html            Settings page
    ├── options.css
    └── options.js
```

### State machine

The extension tracks one of five statuses in `chrome.storage.local`:

```
WORKING ──(alarm fires, no video call)──────────▶ LOCKED
WORKING ──(alarm fires, video call open)────────▶ DELAYED ──(retry)──▶ LOCKED
LOCKED  ──(user clicks Start Break Timer)───────▶ BREAK_TIMER
BREAK_TIMER ──(countdown hits 0)────────────────▶ CONFIRMING
CONFIRMING  ──(both tasks ticked + Unlock)───────▶ WORKING
WORKING ──(snooze clicked)──────────────────────▶ WORKING (timer delayed)
```

### How the browser lock works

`content/overlay.js` is declared as a content script in `manifest.json` and is automatically injected into every `http`/`https` page. When the service worker calls `lockBrowser()`:

1. `chrome.scripting.executeScript` force-injects the content script into all currently open tabs (catches tabs that were open before the extension was loaded)
2. `chrome.tabs.sendMessage` sends `SHOW_OVERLAY` to every tab
3. The content script creates a full-screen `<div>` with `z-index: 2147483647` containing an `<iframe>` pointing to `overlay/overlay.html`
4. `document.body.style.overflow = hidden` prevents scrolling on the host page
5. New tabs opened while locked are caught by `chrome.tabs.onCreated` and redirected to `overlay/overlay.html?mode=tab` directly

Unlock reverses all of this and schedules the next alarm.

### Timer reliability (MV3 service workers)

MV3 service workers can be killed by Chrome after ~30 seconds of inactivity. To handle this:

- **`chrome.alarms`** is used instead of `setTimeout` — alarms are Chrome-level objects that survive service worker restarts and wake the worker when they fire
- **`chrome.storage.onChanged`** fires in the service worker when settings are saved from the options page, triggering a reschedule — this is more reliable than `chrome.runtime.sendMessage` for waking a sleeping worker
- The options page also creates alarms **directly** after saving, as a belt-and-suspenders approach
- On `chrome.runtime.onStartup`, if the status is still `locked`/`break_timer`, all overlays are re-injected (handles browser restart mid-break)

### Data storage

Everything is stored in `chrome.storage.local` under three keys:

```javascript
settings: {
  workInterval: 60,           // minutes
  breakDuration: 1,           // minutes
  snoozeLimit: 1,
  snoozeDuration: 10,
  warningEnabled: true,
  videoDomains: [...]
}

state: {
  status: 'working',          // current state machine status
  nextBreakAt: 1234567890,    // epoch ms
  breakStartedAt: null,       // epoch ms, set when countdown starts
  snoozeUsed: 0,
  paused: false
}

history: [
  {
    date: '2026-05-13',
    breaks: [
      { scheduledAt: 1234567890, completedAt: 1234568000, snoozed: false }
    ]
  }
  // last 30 days kept
]
```

### Streak calculation

A day counts toward the streak if it has at least one completed break and no more than one snoozed break. Streak is recalculated live from the history array — no separate counter that can drift.

---

## Permissions

| Permission | Why it's needed |
|------------|-----------------|
| `alarms` | Persistent break timer that survives service worker sleep |
| `storage` | Save settings, state, and break history |
| `tabs` | Query open tabs to inject the overlay and detect video calls |
| `scripting` | Force-inject the overlay into tabs opened before the extension loaded |
| `<all_urls>` | Inject the content script into any tab the user is browsing |

---

## Known Limitations

- **`chrome://` pages** (like `chrome://extensions` itself) cannot be overlaid — Chrome blocks content script injection on internal pages
- **The Chrome new tab page** cannot be overlaid by content scripts; new tabs are handled by redirecting them to `overlay/overlay.html` via `tabs.onCreated`
- The extension cannot lock the browser at the **OS level** — a determined user can always close Chrome
- **Media on other tabs** — only media on the tab that was active when the overlay appeared is paused; media playing in background tabs is not affected
