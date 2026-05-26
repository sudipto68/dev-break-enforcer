const DEFAULT_SETTINGS = {
  workInterval: 60,
  breakDuration: 1,
  snoozeLimit: 1,
  snoozeDuration: 10,
  warningEnabled: true,
  videoDomains: [
    'meet.google.com',
    'zoom.us',
    'teams.microsoft.com',
    'whereby.com',
    'webex.com',
    'bluejeans.com',
    'gotomeeting.com'
  ]
};

const DEFAULT_STATE = {
  status: 'working',
  nextBreakAt: null,
  breakStartedAt: null,
  snoozeUsed: 0,
  sessionStart: null,
  paused: false
};

// ── Bootstrap ─────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  await initStorage();
  await scheduleNextBreak();
});

chrome.runtime.onStartup.addListener(async () => {
  await initStorage();
  // Always start fresh — don't carry a locked/break state over from a previous session
  await setState({ status: 'working', snoozeUsed: 0, breakStartedAt: null, paused: false });
  await scheduleNextBreak();
});

async function initStorage() {
  const stored = await chrome.storage.local.get(['settings', 'state', 'history']);
  const updates = {};
  if (!stored.settings) updates.settings = DEFAULT_SETTINGS;
  if (!stored.history)  updates.history  = [];
  if (!stored.state)    updates.state    = { ...DEFAULT_STATE, sessionStart: Date.now() };
  if (Object.keys(updates).length) await chrome.storage.local.set(updates);
}

// Reschedule automatically when settings are saved from any page
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    scheduleNextBreak();
  }
});

// ── Alarm handling ────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'warning') {
    await sendWarningNotification();
    return;
  }
  if (alarm.name === 'break') {
    const { state } = await chrome.storage.local.get('state');
    if (state.paused) return;

    const callDomain = await getActiveCallDomain();
    if (callDomain) {
      const { settings } = await chrome.storage.local.get('settings');
      await setState({ status: 'delayed' });
      chrome.alarms.create('break', { delayInMinutes: settings.snoozeDuration });
      await notifyCallDelay(callDomain, settings.snoozeDuration);
    } else {
      await lockBrowser();
    }
  }
});

async function scheduleNextBreak() {
  const { settings, state } = await chrome.storage.local.get(['settings', 'state']);
  if (state?.paused) return;

  await chrome.alarms.clearAll();
  const nextBreakAt = Date.now() + settings.workInterval * 60 * 1000;
  await setState({ nextBreakAt });

  await chrome.alarms.create('break', { delayInMinutes: settings.workInterval });
  if (settings.warningEnabled && settings.workInterval > 5) {
    await chrome.alarms.create('warning', { delayInMinutes: settings.workInterval - 5 });
  }
}

// ── Lock / Unlock ─────────────────────────────────────────────────────────────

async function lockBrowser() {
  await setState({ status: 'locked', breakStartedAt: null });
  await recordBreakScheduled();

  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    // Force-inject content script — handles tabs opened before extension was loaded/reloaded
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/overlay.js']
      });
    } catch {}
    // The injected script checks state itself, but send the message too for already-injected tabs
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'SHOW_OVERLAY' });
    } catch {}
  }
}

async function unlockBrowser() {
  await setState({ status: 'working', snoozeUsed: 0, breakStartedAt: null });
  await broadcastToTabs('HIDE_OVERLAY');
  // Also notify extension pages (standalone overlay tabs, popup) via runtime broadcast
  chrome.runtime.sendMessage({ action: 'UNLOCKED' }).catch(() => {});
  await scheduleNextBreak();
}

async function broadcastToTabs(action) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try {
      await chrome.tabs.sendMessage(tab.id, { action });
    } catch {}
  }
}

// Sends current state + settings to all overlay iframes so they stay in sync
async function broadcastStateSync() {
  const { state, settings } = await chrome.storage.local.get(['state', 'settings']);
  // Send to content scripts (which forward via postMessage into iframes)
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'SYNC_STATE', state, settings });
    } catch {}
  }
  // Also send via runtime broadcast for standalone overlay tabs (extension pages)
  // which don't receive chrome.tabs.sendMessage
  chrome.runtime.sendMessage({ action: 'SYNC_STATE', state, settings }).catch(() => {});
}

// Catch newly opened tabs while locked — redirect to overlay page directly
// (content scripts can't run on chrome://newtab/, so we navigate instead)
chrome.tabs.onCreated.addListener(async (tab) => {
  const { state } = await chrome.storage.local.get('state');
  if (!['locked', 'break_timer', 'confirming'].includes(state?.status)) return;
  const overlayUrl = chrome.runtime.getURL('overlay/overlay.html') + '?mode=tab';
  chrome.tabs.update(tab.id, { url: overlayUrl });
});

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse).catch(() => sendResponse({ ok: false }));
  return true;
});

async function handleMessage(msg) {
  switch (msg.action) {
    case 'GET_STATE': {
      const { state, settings } = await chrome.storage.local.get(['state', 'settings']);
      return { state, settings };
    }

    case 'GET_STATS': {
      const { history, state } = await chrome.storage.local.get(['history', 'state']);
      return {
        today: getTodayStats(history),
        streak: calculateStreak(history),
        state
      };
    }

    case 'START_BREAK_TIMER': {
      await setState({ status: 'break_timer', breakStartedAt: Date.now() });
      await broadcastStateSync();
      return { ok: true };
    }

    case 'TIMER_COMPLETE': {
      await setState({ status: 'confirming' });
      await broadcastStateSync();
      return { ok: true };
    }

    case 'CONFIRM_BREAK': {
      await recordBreakCompleted();
      await unlockBrowser();
      return { ok: true };
    }

    case 'SNOOZE': {
      const { settings, state } = await chrome.storage.local.get(['settings', 'state']);
      if (state.snoozeUsed >= settings.snoozeLimit) return { ok: false, reason: 'limit' };

      await setState({ status: 'working', snoozeUsed: state.snoozeUsed + 1, breakStartedAt: null });
      await recordBreakSnoozed();
      await broadcastToTabs('HIDE_OVERLAY');

      await chrome.alarms.clearAll();
      const nextBreakAt = Date.now() + settings.snoozeDuration * 60 * 1000;
      await setState({ nextBreakAt });
      await chrome.alarms.create('break', { delayInMinutes: settings.snoozeDuration });
      return { ok: true };
    }

    case 'PAUSE': {
      await setState({ paused: true });
      await chrome.alarms.clearAll();
      return { ok: true };
    }

    case 'RESUME': {
      await setState({ paused: false });
      await scheduleNextBreak();
      return { ok: true };
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function setState(partial) {
  const { state } = await chrome.storage.local.get('state');
  await chrome.storage.local.set({ state: { ...state, ...partial } });
}

async function getActiveCallDomain() {
  const { settings } = await chrome.storage.local.get('settings');
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try {
      const hostname = new URL(tab.url).hostname;
      const matched = settings.videoDomains.find(domain =>
        hostname === domain || hostname.endsWith('.' + domain)
      );
      if (matched) return matched;
    } catch {}
  }
  return null;
}

async function notifyCallDelay(domain, retryMinutes) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  for (const tab of tabs) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/overlay.js'] });
    } catch {}
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'SHOW_CALL_DELAY', domain, retryMinutes });
    } catch {}
  }
}

async function sendWarningNotification() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  for (const tab of tabs) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/overlay.js'] });
    } catch {}
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'SHOW_WARNING' });
    } catch {}
  }
}

// ── History ───────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

async function getOrCreateToday() {
  const { history } = await chrome.storage.local.get('history');
  const today = todayStr();
  let dayEntry = history.find(d => d.date === today);
  if (!dayEntry) {
    dayEntry = { date: today, breaks: [] };
    history.push(dayEntry);
  }
  return { history, dayEntry };
}

async function recordBreakScheduled() {
  const { history, dayEntry } = await getOrCreateToday();
  dayEntry.breaks.push({ scheduledAt: Date.now(), completedAt: null, snoozed: false });
  await chrome.storage.local.set({ history: history.slice(-30) });
}

async function recordBreakCompleted() {
  const { history, dayEntry } = await getOrCreateToday();
  const pending = [...dayEntry.breaks].reverse().find(b => !b.completedAt && !b.snoozed);
  if (pending) pending.completedAt = Date.now();
  await chrome.storage.local.set({ history: history.slice(-30) });
}

async function recordBreakSnoozed() {
  const { history, dayEntry } = await getOrCreateToday();
  const pending = [...dayEntry.breaks].reverse().find(b => !b.completedAt && !b.snoozed);
  if (pending) pending.snoozed = true;
  await chrome.storage.local.set({ history: history.slice(-30) });
}

function getTodayStats(history) {
  const dayEntry = history.find(d => d.date === todayStr());
  if (!dayEntry) return { completed: 0, snoozed: 0, total: 0 };
  return {
    completed: dayEntry.breaks.filter(b => b.completedAt).length,
    snoozed:   dayEntry.breaks.filter(b => b.snoozed).length,
    total:     dayEntry.breaks.length
  };
}

function calculateStreak(history) {
  if (!history.length) return 0;
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));
  let streak = 0;
  for (const day of sorted) {
    if (!day.breaks.length) break;
    const completed = day.breaks.filter(b => b.completedAt).length;
    const snoozed   = day.breaks.filter(b => b.snoozed).length;
    if (completed > 0 && snoozed <= 1) { streak++; } else { break; }
  }
  return streak;
}
