// Hunter System — Service Worker v3
// vite-plugin-pwa injects the Workbox precache manifest at build time.

import { precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

self.skipWaiting();
clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);

// ── IndexedDB helpers ──────────────────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('hunter-sw', 3);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const req = db.transaction('kv', 'readonly').objectStore('kv').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    });
  } catch { return undefined; }
}

async function idbSet(key, value) {
  try {
    const db = await openDB();
    await new Promise((resolve) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  } catch { /* ignore */ }
}

async function idbDel(key) {
  try {
    const db = await openDB();
    await new Promise((resolve) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').delete(key);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  } catch { /* ignore */ }
}

// ── Notification message pools ─────────────────────────────────────────────

const REMINDER_MESSAGES = [
  { title: '⚔️ Hunter — Mission Check', body: 'Your quest board is active. Log a session before the day slips away.' },
  { title: '🔥 Discipline Protocol', body: "The system is watching. Don't let consistency break today." },
  { title: '🎯 Goal Pulse', body: 'Quick reminder: one logged action today keeps the streak alive.' },
  { title: '⚡ Status Check', body: "Daily quests don't complete themselves — open up and mark your progress." },
  { title: '🛡️ Hunter Signal', body: 'Strength is built in small windows. Use this one.' },
  { title: '📊 Progression Alert', body: 'Your stats are waiting to grow. Log something now.' },
  { title: '💀 Warning from the System', body: 'No activity detected. Stagnation is the only true enemy.' },
  { title: '🏆 Rank on the Line', body: 'Other hunters are grinding while you idle. Get back in the fight.' },
  { title: '⚠️ Hunter Alert', body: 'You set this reminder for a reason. Honor your commitment.' },
  { title: '🌑 The Shadow Watches', body: 'Every day unchecked is a step backwards. Log your progress now.' },
];

const INTEREST_MESSAGES = {
  strength: [
    { title: '💪 Strength Training Alert', body: 'Your muscles need work. Hit the weights — every rep counts toward your rank.' },
    { title: '🏋️ Power Protocol', body: "Today's gains are tomorrow's strength. Log your workout now." },
    { title: '⚔️ Warrior\'s Call', body: 'Warriors train when weak. Log your strength session before midnight.' },
    { title: '🔥 Iron Discipline', body: 'No rest for the strong. Your strength quest is waiting to be marked.' },
  ],
  vitality: [
    { title: '🛡️ Recovery Check', body: 'Your vitality stats need attention. Did you hydrate and rest today?' },
    { title: '❤️ Health Protocol', body: 'Vitality is the foundation. Log your wellness activity now.' },
    { title: '🔋 Energy Pulse', body: "Energy levels depend on consistency. Don't skip your wellness quest." },
    { title: '🌿 Vitality Warning', body: 'Your recovery metrics are falling behind. Log your health quest now.' },
  ],
  agility: [
    { title: '⚡ Speed Protocol', body: 'Your agility needs work. Did you log your movement session today?' },
    { title: '🏃 Assassin\'s Alert', body: 'Stay sharp. Log your agility or mobility training before the day ends.' },
    { title: '🎯 Precision Call', body: 'Speed and precision are earned daily. Log your session now.' },
    { title: '🌀 Movement Reminder', body: 'Static hunters fall behind. Your movement quest needs to be logged.' },
  ],
  intelligence: [
    { title: '🧠 Intelligence Protocol', body: 'Your mind is your strongest weapon. Did you study or read today?' },
    { title: '📚 Scholar\'s Reminder', body: "Knowledge logged today is power tomorrow. Open your quest board." },
    { title: '💡 Mage\'s Signal', body: 'A mage who stops learning loses their power. Log your mental training.' },
    { title: '🔮 Mind Sharpening', body: 'Intelligence compounds daily. Your study session is overdue.' },
  ],
  sense: [
    { title: '👁️ Perception Alert', body: 'Your senses sharpen through mindfulness. Did you practice awareness today?' },
    { title: '🎯 Tracker\'s Call', body: 'Sharp instincts need daily upkeep. Log your focus session.' },
    { title: '🌿 Sense Protocol', body: 'Stillness is a skill. Log your meditation or focus activity.' },
    { title: '🔍 Awareness Check', body: 'A dull mind misses critical signals. Log your mindfulness quest.' },
  ],
};

const EOD_MESSAGES = [
  { title: '⏰ Day Ending Soon', body: 'Only {time} left today. Your daily quests RESET at midnight — complete {n} now or lose the progress!' },
  { title: '🚨 Quest Deadline Alert', body: 'URGENT: {n} daily quest{s} expire in {time}. Rush to complete before the midnight reset!' },
  { title: '⚔️ Final Hour Warning', body: 'The day closes in {time}. {n} quest{s} still unchecked — mark them before everything resets!' },
  { title: '💀 Midnight Reset Warning', body: 'You have {time} before daily quests vanish. {n} left — do them NOW.' },
];

const DEADLINE_MESSAGES = [
  { title: '📅 Quest Deadline: {name}', body: 'This quest is due {when}. Open Hunter System now — don\'t miss it.' },
  { title: '⏳ Expiring Quest Alert', body: '"{name}" expires {when}. Complete it before it\'s gone!' },
  { title: '🎯 Scheduled Mission Alert', body: 'Your quest "{name}" is due {when}. Act now or lose it.' },
  { title: '⚠️ Quest Timer Running Out', body: '"{name}" — only {when} remaining. This quest won\'t wait.' },
];

const STREAK_NUDGE_MESSAGES = [
  { title: '🔥 Streak at Risk', body: "Nothing logged today and the day is slipping away. One action keeps the streak alive — don't let it break." },
  { title: '⚡ Daily Check-In Missed', body: "Your streak is in danger. You haven't logged anything today. Open up and complete at least one quest." },
  { title: '💀 Don\'t Break the Chain', body: 'The system sees no activity today. Log something — anything — before midnight.' },
  { title: '🔔 Hunter Inactive', body: 'No quests or training logged today. Your streak is counting on you.' },
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Vibration patterns ─────────────────────────────────────────────────────

const VIB_REMINDER = [200, 100, 200, 100, 400, 200, 100, 200, 100, 100];
const VIB_EOD      = [300, 150, 300, 150, 600, 200, 300, 150, 600];
const VIB_DEADLINE = [400, 200, 400, 200, 800, 300, 400, 200, 800];
const VIB_STREAK   = [250, 100, 250, 100, 500, 200, 250, 100, 250];

// ── Core: show SW notification (always goes through registration) ───────────

async function swNotif(title, options) {
  await self.registration.showNotification(title, {
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    renotify: true,
    silent: false,
    ...options,
  });
}

// ── Periodic reminder ──────────────────────────────────────────────────────

async function fireReminder(forced = false) {
  const config = await idbGet('reminderConfig');

  if (!forced) {
    if (!config?.enabled) return false;
    const now = new Date();
    const hour = now.getHours();
    const { startHour = 8, endHour = 22 } = config;
    if (hour < startHour || hour >= endHour) return false;

    // Rate-limit: must have elapsed at least 90% of the expected interval
    const { count = 3, lastFiredAt = 0 } = config;
    const activeMs = (endHour - startHour) * 60 * 60 * 1000;
    const minInterval = Math.max(30 * 60 * 1000, Math.floor(activeMs / count));
    const elapsed = Date.now() - lastFiredAt;
    if (elapsed < minInterval * 0.9) return false;
  }

  const hunterData = await idbGet('hunterSnapshot');
  let notif;
  const topStat = hunterData?.topStat;
  if (topStat && INTEREST_MESSAGES[topStat] && Math.random() > 0.35) {
    notif = pickRandom(INTEREST_MESSAGES[topStat]);
  } else {
    notif = pickRandom(REMINDER_MESSAGES);
  }

  await swNotif(notif.title, {
    body: notif.body,
    tag: 'hunter-reminder',
    vibrate: VIB_REMINDER,
    requireInteraction: false,
    data: { url: '/', type: 'reminder' },
  });

  // Update lastFiredAt
  const cfg = (await idbGet('reminderConfig')) || {};
  await idbSet('reminderConfig', { ...cfg, lastFiredAt: Date.now() });
  return true;
}

// ── EOD warning ────────────────────────────────────────────────────────────

async function fireEODWarning(minsLeft, incompleteDailies) {
  const todayKey = new Date().toISOString().slice(0, 10);
  const slot = minsLeft <= 60 ? '1h' : '2h';
  const warnKey = `eodFired-${todayKey}-${slot}`;
  if (await idbGet(warnKey)) return false;

  const h = Math.floor(minsLeft / 60);
  const m = minsLeft % 60;
  const timeStr = h > 0 ? `${h}h ${m}m` : `${minsLeft}m`;
  const n = incompleteDailies;
  const s = n > 1 ? 's' : '';

  const template = pickRandom(EOD_MESSAGES);
  const body = template.body
    .replace('{time}', timeStr)
    .replace('{n}', n)
    .replace('{s}', s);

  await swNotif(template.title, {
    body,
    tag: `hunter-eod-${slot}`,
    vibrate: VIB_EOD,
    requireInteraction: true,
    data: { url: '/', type: 'eod' },
  });

  await idbSet(warnKey, true);
  return true;
}

// ── Scheduled quest deadline alert ────────────────────────────────────────

async function fireDeadlineAlert(quest, whenStr, slotKey) {
  const alreadyKey = `deadline-${quest.id}-${slotKey}`;
  if (await idbGet(alreadyKey)) return false;

  const template = pickRandom(DEADLINE_MESSAGES);
  const title = template.title.replace('{name}', (quest.title || 'Quest').slice(0, 40));
  const body = template.body
    .replace(/\{name\}/g, quest.title || 'Quest')
    .replace('{when}', whenStr);

  await swNotif(title, {
    body,
    tag: `hunter-deadline-${quest.id}`,
    vibrate: VIB_DEADLINE,
    requireInteraction: true,
    data: { url: '/', type: 'deadline', questId: quest.id },
  });

  await idbSet(alreadyKey, true);
  return true;
}

// ── Streak nudge ───────────────────────────────────────────────────────────

async function fireStreakNudge() {
  const config = await idbGet('reminderConfig');
  if (!config?.enabled) return false;

  const todayKey = new Date().toISOString().slice(0, 10);
  const nudgeKey = `streakNudge-${todayKey}`;
  if (await idbGet(nudgeKey)) return false;

  const now = new Date();
  if (now.getHours() < 17) return false; // only after 5 PM

  const hunterData = await idbGet('hunterSnapshot');
  // If hunter has already been active today, skip
  if (hunterData?.lastActive === todayKey) return false;
  // If they have no incomplete dailies but have logged something, skip
  if (hunterData?.incompleteDailies === 0 && hunterData?.lastActive === todayKey) return false;

  const notif = pickRandom(STREAK_NUDGE_MESSAGES);
  await swNotif(notif.title, {
    body: notif.body,
    tag: 'hunter-streak-nudge',
    vibrate: VIB_STREAK,
    requireInteraction: false,
    data: { url: '/', type: 'streak' },
  });

  await idbSet(nudgeKey, true);
  return true;
}

// ── Smart checks: EOD + deadlines + streak ────────────────────────────────

async function runSmartChecks() {
  const config = await idbGet('reminderConfig');
  if (!config?.enabled) return;

  const hunterData = await idbGet('hunterSnapshot');
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();

  // ── EOD warning ──
  const incompleteDailies = hunterData?.incompleteDailies ?? 0;
  if (incompleteDailies > 0) {
    const minsUntilMidnight = (23 - hour) * 60 + (59 - minute);
    if (minsUntilMidnight <= 120 && minsUntilMidnight > 10) {
      await fireEODWarning(minsUntilMidnight, incompleteDailies);
    }
  }

  // ── Scheduled quest deadline alerts ──
  const scheduledQuests = hunterData?.scheduledQuests || [];
  for (const quest of scheduledQuests) {
    if (!quest.dueDate) continue;
    const dueMs = quest.dueTime
      ? new Date(`${quest.dueDate}T${quest.dueTime}`).getTime()
      : new Date(`${quest.dueDate}T23:59:00`).getTime();

    const diffMins = Math.floor((dueMs - Date.now()) / 60000);
    if (diffMins <= 0) continue;

    if (diffMins <= 60 && diffMins > 5) {
      await fireDeadlineAlert(quest, `in ${diffMins} minutes`, '1h');
    } else if (diffMins <= 120 && diffMins > 60) {
      await fireDeadlineAlert(quest, `in ~${Math.floor(diffMins / 60)}h`, '2h');
    } else if (diffMins <= 1440 && diffMins > 120 && hour >= 8) {
      await fireDeadlineAlert(quest, 'today', 'today');
    }
  }

  // ── Streak nudge ──
  await fireStreakNudge();
}

// ── Self-scheduling: the SW reschedules itself using setTimeout ────────────
// This is far more reliable than setInterval inside a SW — the browser
// CAN kill setInterval timers when suspending a SW, but a pending Promise
// or waitUntil keeps the SW alive long enough to fire once, then it
// re-registers the next shot.

let _schedulerActive = false;

async function schedulerTick() {
  try {
    const config = await idbGet('reminderConfig');
    if (!config?.enabled) {
      _schedulerActive = false;
      return;
    }

    const { count = 3, startHour = 8, endHour = 22 } = config;
    const activeMs = (endHour - startHour) * 60 * 60 * 1000;
    const intervalMs = Math.max(20 * 60 * 1000, Math.floor(activeMs / count));

    await fireReminder();
    await runSmartChecks();

    // Schedule next tick
    setTimeout(() => {
      _schedulerActive = true;
      schedulerTick();
    }, intervalMs);
  } catch {
    // Reschedule even on error
    setTimeout(() => schedulerTick(), 30 * 60 * 1000);
  }
}

// Also run smart checks on a faster cadence (every 5 min) separately
function scheduleSmartCheckLoop() {
  setInterval(() => runSmartChecks(), 5 * 60 * 1000);
}

function startScheduler() {
  if (_schedulerActive) return;
  _schedulerActive = true;
  // Kick off immediately (100ms delay so SW fully activates first)
  setTimeout(() => schedulerTick(), 100);
  scheduleSmartCheckLoop();
}

// ── Messages from the app ─────────────────────────────────────────────────

self.addEventListener('message', async (event) => {
  if (!event.data) return;
  const { type } = event.data;

  if (type === 'HUNTER_REMINDER_CONFIG') {
    const prev = (await idbGet('reminderConfig')) || {};
    const cfg = { ...prev, ...event.data.config };
    await idbSet('reminderConfig', cfg);
    if (cfg.enabled) startScheduler();
  }

  if (type === 'HUNTER_SNAPSHOT') {
    await idbSet('hunterSnapshot', event.data.snapshot);
  }

  if (type === 'HUNTER_REMINDER_FIRE_NOW') {
    // Force fire a reminder and smart checks immediately, ignoring rate limit
    await fireReminder(true);
    await runSmartChecks();
    // Acknowledge back to page
    if (event.source) {
      try { event.source.postMessage({ type: 'HUNTER_NOTIF_FIRED' }); } catch { /* ignore */ }
    }
  }

  if (type === 'HUNTER_SMART_CHECK_NOW') {
    await runSmartChecks();
  }

  // Backward compat
  if (type === 'HUNTER_REMINDER_TOGGLE') {
    const existing = (await idbGet('reminderConfig')) || {};
    const cfg = { ...existing, enabled: event.data.enabled };
    await idbSet('reminderConfig', cfg);
    if (cfg.enabled) startScheduler();
  }
});

// ── Periodic Background Sync (Chrome Android installed PWA) ───────────────

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'hunter-reminders') {
    event.waitUntil(
      fireReminder().then(() => runSmartChecks())
    );
  }
});

// ── Install ───────────────────────────────────────────────────────────────

self.addEventListener('install', () => {
  self.skipWaiting();
});

// ── Activate: claim clients + start scheduler ─────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.clients.claim().then(async () => {
      // If reminders were enabled before the SW updated, restart the scheduler
      const config = await idbGet('reminderConfig');
      if (config?.enabled) startScheduler();
    })
  );
});

// ── Notification click: open / focus the app ──────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing tab if one is open
      const existing = clients.find((c) => c.url.startsWith(self.location.origin));
      if (existing) return existing.focus();
      return self.clients.openWindow(targetUrl);
    })
  );
});
