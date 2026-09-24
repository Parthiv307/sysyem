// Hunter System — Service Worker
// vite-plugin-pwa injects the Workbox precache manifest at build time.

import { precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

self.skipWaiting();
clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);

// ── IndexedDB helpers ──────────────────────────────────────────────────────
// SW can't use localStorage, so we persist config in IDB. This means the
// reminder settings survive a full SW restart (which happens when the browser
// kills the idle SW between periodic-sync wakeups).

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('hunter-sw', 1);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore('kv');
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

// ── Notification messages ─────────────────────────────────────────────────

const MESSAGES = [
  "Hunter check-in. Have you completed any quests today?",
  "Time check — your quest board needs attention. Don't let the streak break.",
  "The system is watching. Log your training or complete a quest.",
  "A hunter never rests. Open the system and log something.",
  "Reminder: consistency beats intensity. Log something now.",
  "Your quests are waiting. Keep the chain alive.",
  "Discipline check. What have you done for your stats today?",
  "Don't let today pass without marking progress. Open Hunter System.",
];

// ── Core: fire a reminder notification ───────────────────────────────────
// Reads config fresh from IDB every time so it works correctly after a SW
// restart (periodic-sync wakeup after browser killed the SW).

async function fireReminder(forced = false) {
  const config = await idbGet('reminderConfig');

  // When forced (test button), skip ALL guards — just fire immediately
  if (!forced) {
    if (!config?.enabled) return;

    const now = new Date();
    const hour = now.getHours();
    const { startHour = 8, endHour = 22 } = config;
    if (hour < startHour || hour >= endHour) return;

    // Rate-limit: don't fire more than once per (active-window / count) interval
    const { count = 3, lastFiredAt = 0 } = config;
    const activeMs = (endHour - startHour) * 60 * 60 * 1000;
    const minInterval = Math.floor(activeMs / count);
    const elapsed = Date.now() - lastFiredAt;
    if (elapsed < minInterval * 0.85) return; // 15% grace
  }

  const body = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];

  await self.registration.showNotification('Hunter System', {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'hunter-reminder',
    renotify: true,          // re-alert even if same tag is already in tray
    silent: false,           // play the OS notification sound
    vibrate: [100, 50, 100, 50, 300, 100, 100], // buzz pattern for Android
    requireInteraction: false,
    data: { url: '/', firedAt: Date.now() },
  });

  // Record when we last fired so rate-limiting works across SW restarts
  await idbSet('reminderConfig', { ...config, lastFiredAt: Date.now() });
}

// ── In-app setInterval (fires while browser is running) ───────────────────
// When the SW is alive (any page open, or just activated), we run our own
// interval. This is the most reliable path for desktop and for Android when
// the browser is open.

let intervalId = null;

async function scheduleInterval() {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }

  const config = await idbGet('reminderConfig');
  if (!config?.enabled) return;

  const { count = 3, startHour = 8, endHour = 22 } = config;
  const activeMs = (endHour - startHour) * 60 * 60 * 1000;
  const intervalMs = Math.max(30 * 60 * 1000, Math.floor(activeMs / count)); // min 30 min

  intervalId = setInterval(() => fireReminder(), intervalMs);
}

// ── Messages from the app ─────────────────────────────────────────────────

self.addEventListener('message', async (event) => {
  if (!event.data) return;

  if (event.data.type === 'HUNTER_REMINDER_CONFIG') {
    const config = { ...event.data.config, lastFiredAt: (await idbGet('reminderConfig'))?.lastFiredAt ?? 0 };
    await idbSet('reminderConfig', config);
    await scheduleInterval();
  }

  if (event.data.type === 'HUNTER_REMINDER_FIRE_NOW') {
    await fireReminder(true);
  }

  // Backward compat
  if (event.data.type === 'HUNTER_REMINDER_TOGGLE') {
    const existing = (await idbGet('reminderConfig')) || {};
    await idbSet('reminderConfig', { ...existing, enabled: event.data.enabled });
    await scheduleInterval();
  }
});

// ── Periodic Background Sync ──────────────────────────────────────────────
// Chrome on Android (installed PWA) fires this even when the browser is
// completely closed. The browser decides the actual interval (minimum ~1h
// for a well-used PWA). This is the only standards-based way to wake a
// web SW when the app is fully closed — no server required.

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'hunter-reminders') {
    event.waitUntil(fireReminder());
  }
});

// ── Activate: start interval ──────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(scheduleInterval());
});

// ── Notification click: open / focus the app ──────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url.startsWith(self.location.origin));
        if (existing) return existing.focus();
        return self.clients.openWindow(event.notification.data?.url || '/');
      })
  );
});
