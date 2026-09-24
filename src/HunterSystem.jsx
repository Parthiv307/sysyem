import { useState, useEffect, useCallback, useRef } from "react";
import {
  Swords, Dumbbell, ListChecks, TrendingUp, Plus, Trash2, CheckCircle2,
  Circle, Zap, Shield, Wind, Eye, Brain, RotateCcw, Loader2, X, Sparkles,
  Flame, ChevronRight, Lock, Pencil, Check, Undo2, Award, ArrowLeftRight, LogOut, Settings, Download,
  User as UserIcon, Camera, Bell, Calendar, Clock
} from "lucide-react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid
} from "recharts";

/* ----------------------------------------------------------------------
   HUNTER SYSTEM
   A Solo-Leveling-inspired personal progression tracker.
   Data model lives under a single storage key ("hunter-data") so every
   read/write is one round trip. Storage is personal (shared:false), which
   ties it to your Claude account — open this same artifact on your phone
   while signed into the same account and it reads the same vault.
   ------------------------------------------------------------------- */

const STORAGE_KEY = "hunter-data";

// One hue, six intensities — rank climbs from a dim, dried-blood maroon to
// a hot near-white crimson glow, so "higher rank" reads as brighter, not a
// different color.
// Themes swap the accent/background family; text, muted, and danger stay
// constant across all of them for consistency and contrast safety.
const THEMES = {
  crimson: { label: "Crimson", accent: "#e8283f", accentDeep: "#8c0f24", bg: "#0a0507", panel: "#170b0e", panel2: "#1d0f13" },
  blue: { label: "Neon Blue", accent: "#2fd1ff", accentDeep: "#0066ff", bg: "#05070c", panel: "#0a0f1a", panel2: "#0d1420" },
  emerald: { label: "Emerald", accent: "#2ee6a8", accentDeep: "#0a8a5c", bg: "#040a08", panel: "#0a1613", panel2: "#0d1c18" },
  black: { label: "Black", accent: "#e5e5e5", accentDeep: "#555555", bg: "#000000", panel: "#121212", panel2: "#1a1a1a", swatch: "#000000" },
  gold: { label: "Black & Gold", accent: "#f0b429", accentDeep: "#92620a", bg: "#080600", panel: "#120e00", panel2: "#181200", swatch: "#080600" },
};

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexToRgbTriplet(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

function themeVars(themeName) {
  const t = THEMES[themeName] || THEMES.crimson;
  return {
    "--bg": t.bg,
    "--panel": t.panel,
    "--panel-2": t.panel2,
    "--accent": t.accent,
    "--accent-deep": t.accentDeep,
    "--accent-rgb": hexToRgbTriplet(t.accent),
    "--accent-deep-rgb": hexToRgbTriplet(t.accentDeep),
    "--line": hexToRgba(t.accent, 0.28),
    "--line-soft": hexToRgba(t.accent, 0.14),
  };
}

// Rank requires BOTH a level AND a minimum in your weakest stat — not the
// average, the weakest. A hunter who's all Strength and zero everything
// else shouldn't outrank someone genuinely well-rounded. This is what
// stops rank from being purchasable through quest-grinding alone: quests
// build level, but only training moves stats, and stats are what actually
// gates the badge.
const RANKS = [
  { name: "E", minLevel: 1, minStat: 0, color: "#6B3038" },
  { name: "D", minLevel: 10, minStat: 20, color: "#9A2E3D" },
  { name: "C", minLevel: 20, minStat: 35, color: "#C42540" },
  { name: "B", minLevel: 30, minStat: 55, color: "#E8283F" },
  { name: "A", minLevel: 40, minStat: 80, color: "#FF5C72" },
  { name: "S", minLevel: 50, minStat: 110, color: "#FFD3D9" },
];

// Stats are told apart by icon + label, not hue — every value sits in the
// same crimson-rose family so the UI reads as one palette, not five.
const STAT_DEFS = [
  { key: "strength", label: "STR", full: "Strength", icon: Dumbbell, color: "#E8283F" },
  { key: "vitality", label: "VIT", full: "Vitality", icon: Shield, color: "#D9455C" },
  { key: "agility", label: "AGI", full: "Agility", icon: Wind, color: "#FF5C72" },
  { key: "intelligence", label: "INT", full: "Intelligence", icon: Brain, color: "#FF8599" },
  { key: "sense", label: "SEN", full: "Sense", icon: Eye, color: "#C81E3A" },
];

// Quests are classified by how long they take, not arbitrary "weight" —
// XP scales at a flat 100 per month of commitment (Daily and Weekly use a
// fractional month so they still earn a fair but modest reward). Every type
// now auto-resets on its own natural cadence: a Weekly quest comes back
// every week, a Quarterly one every quarter, and so on.
const QUEST_TYPES = {
  daily: { label: "Daily", months: 0.2, xp: 20, color: "#6B3038", recurring: true, period: "day" },
  weekly: { label: "Weekly", months: 0.5, xp: 50, color: "#9A2E3D", recurring: true, period: "week" },
  monthly: { label: "Monthly", months: 1, xp: 100, color: "#C42540", recurring: true, period: "month" },
  quarterly: { label: "Quarterly", months: 3, xp: 300, color: "#E8283F", recurring: true, period: "quarter" },
  halfyear: { label: "Half-Yearly", months: 6, xp: 600, color: "#FF5C72", recurring: true, period: "halfyear" },
  yearly: { label: "Yearly", months: 12, xp: 1200, color: "#FFD3D9", recurring: true, period: "year" },
  // Not a cadence — a fixed point on the calendar, like an appointment.
  // One-time by nature, so it doesn't recur once completed or missed.
  scheduled: { label: "Scheduled", months: null, xp: 50, color: "#7FCFFF", recurring: false, period: null },
};

// Formats a scheduled quest's due date/time into a short, human-relative
// label — "Today 2:30 PM", "Tomorrow", "In 5 days", "Overdue", or a plain
// date once it's far enough out that "in N days" stops being useful.
function formatScheduled(dateStr, timeStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + "T00:00:00");
  const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));

  let day;
  if (diffDays === 0) day = "Today";
  else if (diffDays === 1) day = "Tomorrow";
  else if (diffDays === -1) day = "Yesterday";
  else if (diffDays < 0) day = `Overdue`;
  else if (diffDays <= 6) day = `In ${diffDays} days`;
  else day = due.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  if (!timeStr) return { label: day, overdue: diffDays < 0 };

  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { label: `${day} ${h12}:${String(m).padStart(2, "0")} ${ampm}`, overdue: diffDays < 0 };
}

// Whether a quest actually loops is now a per-quest choice, not fixed by
// its type — you can make a "Daily" quest one-and-done, or make something
// repeat that normally wouldn't. Falls back to the type's old default for
// quests saved before this was a per-quest field.
function isRecurring(q) {
  return q.recurring ?? QUEST_TYPES[q.type]?.recurring ?? false;
}

// Class is derived, not chosen — whichever stat you've trained hardest
// decides who your hunter is.
const ARCHETYPES = {
  strength: { name: "Warrior", desc: "Built on raw power. Meets every problem head-on." },
  vitality: { name: "Guardian", desc: "Built to endure. Outlasts everything." },
  agility: { name: "Assassin", desc: "Fast, precise, always one step ahead." },
  intelligence: { name: "Mage", desc: "Wins with strategy before the fight starts." },
  sense: { name: "Tracker", desc: "Sharp instincts, sharper focus." },
};

function archetypeFor(stats) {
  let top = "strength";
  for (const key of Object.keys(stats)) {
    if (stats[key] > stats[top]) top = key;
  }
  return ARCHETYPES[top];
}

// Achievements are pure functions of hunter state — evaluated fresh after
// every save, so there's nothing to keep in sync by hand.
const ACHIEVEMENTS = [
  { id: "first_blood", title: "First Blood", desc: "Complete your first quest.", icon: Swords, cond: (d) => d.quests.filter((q) => q.completed).length >= 1 },
  { id: "broke_a_sweat", title: "Broke a Sweat", desc: "Log your first training session.", icon: Dumbbell, cond: (d) => d.trainingLogs.length >= 1 },
  { id: "momentum", title: "Building Momentum", desc: "Reach a 3-day streak.", icon: Flame, cond: (d) => d.profile.streak >= 3 },
  { id: "iron_will", title: "Iron Will", desc: "Reach a 7-day streak.", icon: Flame, cond: (d) => d.profile.streak >= 7 },
  { id: "unbreakable", title: "Unbreakable", desc: "Reach a 30-day streak.", icon: Flame, cond: (d) => d.profile.streak >= 30 },
  { id: "awakened", title: "Awakened", desc: "Reach Rank D.", icon: Shield, cond: (d) => d.profile.level >= 10 },
  { id: "rising", title: "Rising Hunter", desc: "Reach Rank C.", icon: Shield, cond: (d) => d.profile.level >= 20 },
  { id: "seasoned", title: "Seasoned", desc: "Reach Rank B.", icon: Shield, cond: (d) => d.profile.level >= 30 },
  { id: "elite", title: "Elite", desc: "Reach Rank A.", icon: Shield, cond: (d) => d.profile.level >= 40 },
  { id: "monarch", title: "Monarch", desc: "Reach Rank S.", icon: Sparkles, cond: (d) => d.profile.level >= 50 },
  { id: "task_master", title: "Task Master", desc: "Complete 10 quests.", icon: ListChecks, cond: (d) => d.quests.filter((q) => q.completed).length >= 10 },
  { id: "relentless", title: "Relentless", desc: "Complete 50 quests.", icon: ListChecks, cond: (d) => d.quests.filter((q) => q.completed).length >= 50 },
  { id: "in_training", title: "In Training", desc: "Log 10 training sessions.", icon: Dumbbell, cond: (d) => d.trainingLogs.length >= 10 },
  { id: "specialist", title: "Specialist", desc: "Push any single stat to 30.", icon: TrendingUp, cond: (d) => Object.values(d.stats).some((v) => v >= 30) },
];

function getStatName(key, statNames) {
  return (statNames && statNames[key]) || STAT_DEFS.find((s) => s.key === key)?.full || key;
}

function getNewlyUnlocked(data) {
  const already = new Set(data.unlocked || []);
  return ACHIEVEMENTS.filter((a) => !already.has(a.id) && a.cond(data));
}

const MUSCLE_GROUPS = ["Chest", "Shoulders", "Back", "Legs", "Biceps", "Triceps"];
const SUPERSETS = [
  { name: "Back & Chest", xp: 40 },
  { name: "Triceps & Biceps", xp: 40 },
];

// A weekly split. Keys line up with JS Date.getDay() (0=Sun...6=Sat) via
// PROGRAM_DAYS[i], so "today's workout" is always just a lookup — no reset
// logic needed, it changes on its own the moment the calendar day changes.
const PROGRAM_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DEFAULT_PROGRAM = { sun: "Rest", mon: "Chest", tue: "Triceps & Biceps", wed: "Back", thu: "Shoulders", fri: "Legs", sat: "Rest" };
const PROGRAM_OPTIONS = ["Rest", ...MUSCLE_GROUPS, ...SUPERSETS.map((s) => s.name)];

function xpForWorkout(name) {
  if (!name || name === "Rest") return 0;
  const s = SUPERSETS.find((x) => x.name === name);
  return s ? s.xp : 25;
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const todayStr = () => new Date().toISOString().slice(0, 10);
const yesterdayStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

// Identifies which "bucket" of a given cadence a date falls into — e.g. two
// dates in the same calendar week produce the same key for period="week".
// Month/quarter/half-year/year all pin to day 1 before doing arithmetic, so
// short months (Feb) never cause an accidental roll into the wrong bucket
// the way naive setMonth() day-preserving arithmetic can (e.g. Mar 31 minus
// one month landing on Mar 3, not Feb).
function periodKey(date, period) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = d.getMonth();
  switch (period) {
    case "day":
      return d.toISOString().slice(0, 10);
    case "week": {
      const start = new Date(d);
      start.setDate(d.getDate() - d.getDay());
      return start.toISOString().slice(0, 10);
    }
    case "month":
      return `${y}-${String(m + 1).padStart(2, "0")}`;
    case "quarter":
      return `${y}-Q${Math.floor(m / 3) + 1}`;
    case "halfyear":
      return `${y}-H${m < 6 ? 1 : 2}`;
    case "year":
      return `${y}`;
    default:
      return d.toISOString().slice(0, 10);
  }
}

// The period key immediately before "now"'s current one — used to decide
// whether a streak continues (completed last period) or breaks (missed it).
function previousPeriodKey(period) {
  const now = new Date();
  let prev;
  switch (period) {
    case "day":
      prev = new Date(now); prev.setDate(prev.getDate() - 1); break;
    case "week":
      prev = new Date(now); prev.setDate(prev.getDate() - 7); break;
    case "month":
      prev = new Date(now.getFullYear(), now.getMonth() - 1, 1); break;
    case "quarter":
      prev = new Date(now.getFullYear(), now.getMonth() - 3, 1); break;
    case "halfyear":
      prev = new Date(now.getFullYear(), now.getMonth() - 6, 1); break;
    case "year":
      prev = new Date(now.getFullYear() - 1, now.getMonth(), 1); break;
    default:
      prev = new Date(now); prev.setDate(prev.getDate() - 1);
  }
  return periodKey(prev, period);
}

function xpToNext(level) {
  return 100 + (level - 1) * 40;
}

function weakestStat(stats) {
  if (!stats) return 0;
  return Math.min(...Object.values(stats));
}

function rankFor(level, stats) {
  const floor = weakestStat(stats);
  let r = RANKS[0];
  for (const rk of RANKS) {
    if (level >= rk.minLevel && floor >= rk.minStat) r = rk;
  }
  return r;
}

function freshHunter(name) {
  const stats = {};
  STAT_DEFS.forEach((s) => (stats[s.key] = 10));
  return {
    profile: { name, level: 1, xp: 0, totalXp: 0, createdAt: todayStr(), streak: 0, lastActive: null, avatarUrl: null },
    stats,
    quests: [],
    trainingLogs: [],
    xpHistory: [{ date: todayStr(), totalXp: 0, level: 1 }],
    unlocked: [],
    settings: {
      theme: "crimson", reduceMotion: false, statNames: {},
      notificationsEnabled: false,
      // Configurable periodic reminders
      periodicRemindersEnabled: false,
      dailyReminderCount: 3,    // how many times per day (1–10)
      reminderStartHour: 8,     // active window start (hour 0–23)
      reminderEndHour: 22,      // active window end   (hour 0–23)
    },
    lastReminderDate: null,
    program: { ...DEFAULT_PROGRAM },
    programCompletedDate: null,
    personalRecords: {},
  };
}

// Every recurring quest carries a periodKey marking which cadence-bucket
// (which day/week/month/quarter/half-year/year) its current completed state
// belongs to. On each sync, any quest whose stored periodKey doesn't match
// the CURRENT bucket for its type gets reset to incomplete — that's what
// makes a Weekly quest come back every week, a Yearly one every year, etc.
// Streak carries forward only if it was completed in the bucket immediately
// before this one; any gap quietly breaks it.
function syncRecurringQuests(data) {
  let changed = false;

  const quests = data.quests.map((q) => {
    const def = QUEST_TYPES[q.type];
    if (!isRecurring(q)) return q;

    const currentKey = periodKey(new Date(), def.period);
    if (q.periodKey === currentKey) return q;

    changed = true;
    const keptStreak = q.completed && q.periodKey === previousPeriodKey(def.period) ? (q.streak || 0) : 0;
    return { ...q, completed: false, periodKey: currentKey, streak: keptStreak };
  });

  return { data: changed ? { ...data, quests } : data, changed };
}

/* ------------------------------- styles ------------------------------- */

export function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Rajdhani:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');

      /* Ensure the page background is always dark — prevents the white flash
         when scrolling past the last content on any theme. The html/body
         background-color in index.css handles the very first paint, but this
         makes sure the theme colour also extends past the root div. */
      html {
        background: var(--bg, #0a0507);
      }

      .hs-root {
        --bg: #0a0507;
        --panel: #170b0e;
        --panel-2: #1d0f13;
        --accent-rgb: 232, 40, 63;
        --accent-deep-rgb: 140, 15, 36;
        --line: rgba(var(--accent-rgb), 0.25);
        --line-soft: rgba(var(--accent-rgb), 0.12);
        --accent: #e8283f;
        --accent-deep: #8c0f24;
        --text: #ffe9ec;
        --muted: #8a5a63;
        --danger: #ffb020;
        font-family: 'Rajdhani', sans-serif;
        background-color: var(--bg);
        color: var(--text);
        min-height: 100vh;
        position: relative;
        /* Grid pattern uses auto-size so it tiles correctly at all scroll
           depths — the old 100% 100% only sized the first bg-image layer
           and let the grid break at the bottom of the viewport. */
        background-image:
          radial-gradient(ellipse 80% 50% at 50% -10%, rgba(var(--accent-deep-rgb), 0.18), transparent),
          linear-gradient(rgba(var(--accent-rgb), 0.035) 1px, transparent 1px),
          linear-gradient(90deg, rgba(var(--accent-rgb), 0.035) 1px, transparent 1px);
        background-size: 100% 100%, 28px 28px, 28px 28px;
        background-attachment: local;
      }
      .hs-display { font-family: 'Orbitron', sans-serif; letter-spacing: 0.04em; }
      .hs-mono { font-family: 'JetBrains Mono', monospace; }

      .hs-panel {
        background: linear-gradient(180deg, var(--panel), var(--panel-2));
        border: 1px solid var(--line);
        clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px));
        box-shadow: 0 0 0 1px rgba(var(--accent-rgb), 0.03), 0 0 30px rgba(var(--accent-deep-rgb), 0.06), inset 0 0 40px rgba(var(--accent-rgb), 0.02);
        position: relative;
      }
      .hs-panel::before {
        content: '';
        position: absolute; inset: 0;
        pointer-events: none;
        background: linear-gradient(115deg, transparent 40%, rgba(var(--accent-rgb), 0.05) 50%, transparent 60%);
        background-size: 250% 250%;
        animation: hs-sheen 6s ease-in-out infinite;
      }
      @keyframes hs-sheen {
        0%, 100% { background-position: 200% 0; }
        50% { background-position: -50% 0; }
      }

      .hs-btn {
        font-family: 'Rajdhani', sans-serif;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        background: rgba(var(--accent-rgb), 0.08);
        border: 1px solid var(--line);
        color: var(--accent);
        clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px));
        transition: background 0.2s cubic-bezier(.22,1,.36,1), box-shadow 0.2s cubic-bezier(.22,1,.36,1), transform 0.15s cubic-bezier(.34,1.56,.64,1), border-color 0.2s ease, color 0.2s ease;
        cursor: pointer;
      }
      .hs-btn:hover { background: rgba(var(--accent-rgb), 0.18); box-shadow: 0 0 16px rgba(var(--accent-rgb), 0.35); }
      .hs-btn:active { transform: scale(0.94); }
      .hs-btn:disabled { opacity: 0.35; cursor: not-allowed; }

      .hs-btn-solid {
        background: linear-gradient(180deg, var(--accent), var(--accent-deep));
        color: #1a0509;
        border: none;
        font-weight: 700;
        clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px));
      }
      .hs-btn-solid:hover { box-shadow: 0 0 20px rgba(var(--accent-rgb), 0.5); }

      .hs-input {
        background: rgba(255,255,255,0.02);
        border: 1px solid var(--line-soft);
        color: var(--text);
        font-family: 'Rajdhani', sans-serif;
        outline: none;
      }
      .hs-input:focus { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }

      .hs-bar-track {
        background: rgba(255,255,255,0.05);
        border: 1px solid var(--line-soft);
        overflow: hidden;
      }
      .hs-bar-fill {
        background: linear-gradient(90deg, var(--accent-deep), var(--accent));
        box-shadow: 0 0 10px rgba(var(--accent-rgb), 0.6);
        transition: width 0.5s cubic-bezier(.2,.8,.2,1);
      }

      .hs-nav-item {
        cursor: pointer;
        transition: all 0.15s ease;
        border-left: 2px solid transparent;
      }
      .hs-nav-item:hover { background: rgba(var(--accent-rgb), 0.06); }
      .hs-nav-item.active { background: rgba(var(--accent-rgb), 0.1); border-left-color: var(--accent); color: var(--accent); }

      .hs-scan { animation: hs-flicker 3.5s ease-in-out infinite; }
      @keyframes hs-flicker { 0%,100% { opacity: 1; } 50% { opacity: 0.85; } }

      @keyframes hs-rise {
        from { opacity: 0; transform: translateY(10px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .hs-rise { animation: hs-rise 0.4s cubic-bezier(.22,1,.36,1) both; }

      @keyframes hs-tab-in {
        from { opacity: 0; transform: translateY(8px) scale(0.99); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .hs-tab-panel { animation: hs-tab-in 0.32s cubic-bezier(.22,1,.36,1) both; }

      /* A small satisfying bounce for positive actions (completing a quest,
         hitting a PR) — distinct from the calmer entrance curve above, so
         "something good just happened" reads differently from "content
         appeared". */
      @keyframes hs-pop {
        0% { transform: scale(1); }
        35% { transform: scale(1.045); }
        65% { transform: scale(0.982); }
        100% { transform: scale(1); }
      }
      .hs-pop { animation: hs-pop 0.32s cubic-bezier(.34,1.56,.64,1) both; }

      @keyframes hs-shrink-out {
        from { opacity: 1; transform: scale(1); max-height: 100px; }
        to { opacity: 0; transform: scale(0.97); max-height: 0; margin: 0; padding-top: 0; padding-bottom: 0; }
      }
      .hs-shrink-out { animation: hs-shrink-out 0.26s cubic-bezier(.36,0,.66,-0.15) both; overflow: hidden; }

      /* Reduce Motion: collapses every animation/transition to instant.
         Scoped under .hs-root so it only affects this app, not the host page. */
      .hs-reduce-motion, .hs-reduce-motion * {
        animation-duration: 0.001s !important;
        animation-delay: 0s !important;
        transition-duration: 0.001s !important;
      }

      @keyframes hs-levelup-pop {
        0% { opacity: 0; transform: scale(0.7) translateY(20px); }
        60% { opacity: 1; transform: scale(1.05) translateY(0); }
        100% { opacity: 1; transform: scale(1) translateY(0); }
      }
      .hs-levelup { animation: hs-levelup-pop 0.5s cubic-bezier(.2,.9,.3,1.3) both; }

      .hs-scrollbar::-webkit-scrollbar { width: 6px; }
      .hs-scrollbar::-webkit-scrollbar-track { background: transparent; }
      .hs-scrollbar::-webkit-scrollbar-thumb { background: rgba(var(--accent-rgb), 0.25); }

      /* Plain CSS color utilities. Tailwind's bracket syntax for referencing
         a CSS variable as a color value wasn't resolving reliably in every
         render context, so anything color-critical is defined here instead,
         where a plain var() reference always just works. */
      .hs-c-muted { color: var(--muted); }
      .hs-c-accent { color: var(--accent); }
      .hs-c-danger { color: var(--danger); }
      .hs-c-text { color: var(--text); }
      .hs-hover-accent:hover { color: var(--accent); }
      .hs-hover-danger:hover { color: var(--danger); }
      .hs-hover-text:hover { color: var(--text); }
      .hs-border-soft { border-color: var(--line-soft); }

      ::selection { background: rgba(var(--accent-rgb), 0.35); }
    `}</style>
  );
}

/* ------------------------------ subparts ------------------------------ */

function SyncBadge({ status }) {
  const map = {
    saving: { text: "SYNCING…", color: "#8a5a63", pulse: true },
    saved: { text: "SYNCED", color: "var(--accent)", pulse: false },
    error: { text: "SYNC ERROR", color: "#ffb020", pulse: false },
    idle: { text: "SYNCED", color: "var(--accent)", pulse: false },
  };
  const s = map[status] || map.idle;
  return (
    <div className="flex items-center gap-1.5 hs-mono text-[10px] tracking-widest" style={{ color: s.color }}>
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${s.pulse ? "hs-scan" : ""}`}
        style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }}
      />
      {s.text}
    </div>
  );
}

function XPBar({ xp, next, level }) {
  const pct = Math.min(100, (xp / next) * 100);
  return (
    <div className="w-full">
      <div className="flex justify-between hs-mono text-[11px] hs-c-muted mb-1">
        <span>LV {level}</span>
        <span>{xp} / {next} XP</span>
      </div>
      <div className="hs-bar-track h-2.5 w-full">
        <div className="hs-bar-fill h-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RankUpModal({ rank, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
      <div className="hs-panel hs-levelup px-10 py-10 text-center max-w-sm w-full relative">
        <button onClick={onClose} className="absolute top-3 right-3 hs-c-muted hs-hover-accent">
          <X size={18} />
        </button>
        <Swords className="mx-auto mb-3" size={32} style={{ color: rank.color }} />
        <div className="hs-mono text-xs tracking-[0.3em] hs-c-muted mb-2">RANK UP</div>
        <div className="hs-display text-5xl font-black mb-3" style={{ color: rank.color, textShadow: `0 0 20px ${rank.color}99` }}>
          {rank.name}
        </div>
        <div className="hs-mono text-sm hs-c-muted">Your training caught up with your experience.</div>
        <button onClick={onClose} className="hs-btn-solid mt-6 px-6 py-2 text-sm w-full">Continue</button>
      </div>
    </div>
  );
}

function LevelUpModal({ level, rank, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
      <div className="hs-panel hs-levelup px-10 py-10 text-center max-w-sm w-full relative">
        <button onClick={onClose} className="absolute top-3 right-3 hs-c-muted hs-hover-accent">
          <X size={18} />
        </button>
        <Sparkles className="mx-auto mb-3 hs-c-accent" size={32} />
        <div className="hs-mono text-xs tracking-[0.3em] hs-c-muted mb-2">LEVEL UP</div>
        <div className="hs-display text-5xl font-black hs-c-accent mb-3" style={{ textShadow: "0 0 20px rgba(var(--accent-rgb), 0.6)" }}>
          {level}
        </div>
        <div className="hs-mono text-sm" style={{ color: rank.color }}>RANK {rank.name} HUNTER</div>
        <button onClick={onClose} className="hs-btn-solid mt-6 px-6 py-2 text-sm w-full">Continue</button>
      </div>
    </div>
  );
}

function Login({ onCreate }) {
  const [name, setName] = useState("");
  return (
    <div className="hs-root flex items-center justify-center min-h-screen px-4">
      <GlobalStyle />
      <div className="hs-panel hs-rise px-8 py-10 max-w-sm w-full text-center">
        <div className="hs-mono text-[11px] tracking-[0.4em] hs-c-muted mb-2">SYSTEM</div>
        <h1 className="hs-display text-2xl font-bold mb-1" style={{ textShadow: "0 0 14px rgba(var(--accent-rgb), 0.5)" }}>
          AWAKENING
        </h1>
        <p className="text-sm hs-c-muted mb-8">
          You have been granted the qualifications to become a Hunter. State your name to begin.
        </p>
        <input
          className="hs-input w-full px-3 py-2.5 mb-4 text-center hs-mono"
          placeholder="HUNTER NAME"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && onCreate(name.trim())}
          maxLength={24}
          autoFocus
        />
        <button
          className="hs-btn-solid w-full py-2.5 text-sm"
          disabled={!name.trim()}
          onClick={() => onCreate(name.trim())}
        >
          Accept
        </button>
      </div>
    </div>
  );
}

function SettingsModal({ settings, onUpdate, onExport, onClose, userEmail, avatarUrl, onUploadAvatar, onAvatarChange }) {
  const [names, setNames] = useState({ ...(settings.statNames || {}) });
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  const fileInputRef = useRef(null);

  const toggleReminders = async () => {
    if (settings.notificationsEnabled) {
      onUpdate({ notificationsEnabled: false });
      return;
    }
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      const result = await Notification.requestPermission();
      setNotifPermission(result);
      if (result !== "granted") return;
    } else if (Notification.permission === "denied") {
      setNotifPermission("denied");
      return;
    }
    onUpdate({ notificationsEnabled: true });
  };

  const commitName = (key, value) => {
    const trimmed = value.trim();
    const next = { ...names };
    if (trimmed) next[key] = trimmed;
    else delete next[key];
    setNames(next);
    onUpdate({ statNames: next });
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setAvatarError("");
    if (!file.type.startsWith("image/")) {
      setAvatarError("Please choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError("Image must be under 5MB.");
      return;
    }
    setAvatarUploading(true);
    try {
      const url = await onUploadAvatar(file);
      onAvatarChange(url);
    } catch (err) {
      setAvatarError(err?.message || "Upload failed. Try again.");
    } finally {
      setAvatarUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4 py-8">
      <div className="hs-panel hs-rise w-full max-w-md flex flex-col" style={{ maxHeight: 'min(90vh, 700px)' }}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0 border-b" style={{ borderColor: 'var(--line-soft)' }}>
          <div className="hs-mono text-xs tracking-[0.3em] hs-c-accent">SETTINGS</div>
          <button onClick={onClose} className="hs-c-muted hs-hover-text" title="Close"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 pb-6 pt-4 hs-scrollbar">
        {(userEmail || onUploadAvatar) && (
          <>
            <SectionTitle>Account</SectionTitle>
            <div className="flex items-center gap-4 mt-3 mb-5">
              {onUploadAvatar && (
                <div className="relative shrink-0">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden hs-panel"
                    style={{ borderColor: "var(--accent)" }}
                  >
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <UserIcon size={26} className="hs-c-muted" />
                    )}
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={avatarUploading}
                    className="absolute -bottom-1 -right-1 hs-btn-solid rounded-full p-1.5"
                    title="Change photo"
                  >
                    {avatarUploading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              )}
              <div className="min-w-0">
                {userEmail && (
                  <>
                    <div className="hs-mono text-[10px] tracking-wider hs-c-muted">SIGNED IN AS</div>
                    <div className="text-sm truncate">{userEmail}</div>
                  </>
                )}
                {onUploadAvatar && <div className="text-[11px] hs-c-muted mt-1">Tap the camera to change your photo. Max 5MB.</div>}
              </div>
            </div>
            {avatarError && <p className="text-xs mb-4" style={{ color: "var(--danger)" }}>{avatarError}</p>}
          </>
        )}

        <SectionTitle>Theme</SectionTitle>
        <div className="flex gap-2 mt-3 mb-5">
          {Object.entries(THEMES).map(([key, t]) => (
            <button
              key={key}
              onClick={() => onUpdate({ theme: key })}
              className="hs-btn flex-1 py-2.5 flex flex-col items-center gap-1.5"
              style={settings.theme === key ? { borderColor: t.accent, color: t.accent } : undefined}
            >
              <span
                className="w-5 h-5 rounded-full"
                style={{
                  background: t.swatch || t.accent,
                  boxShadow: `0 0 8px ${t.accent}`,
                  border: t.swatch ? "1px solid rgba(255,255,255,0.35)" : "none",
                }}
              />
              <span className="text-[10px] hs-mono">{t.label}</span>
            </button>
          ))}
        </div>

        <SectionTitle>Motion</SectionTitle>
        <button
          onClick={() => onUpdate({ reduceMotion: !settings.reduceMotion })}
          className="w-full flex items-center justify-between px-3 py-2.5 hs-panel mt-3 mb-5"
        >
          <span className="text-sm">Reduce animations</span>
          <span
            className="hs-mono text-[10px] px-2 py-1"
            style={{ color: settings.reduceMotion ? "var(--accent)" : "var(--muted)", border: `1px solid ${settings.reduceMotion ? "var(--accent)" : "var(--line-soft)"}` }}
          >
            {settings.reduceMotion ? "ON" : "OFF"}
          </span>
        </button>

        <SectionTitle>Reminders</SectionTitle>

        {/* Daily streak nudge */}
        <button
          onClick={toggleReminders}
          disabled={notifPermission === "denied" || notifPermission === "unsupported"}
          className="w-full flex items-center justify-between px-3 py-2.5 hs-panel mt-3"
        >
          <span className="text-sm flex items-center gap-2">
            <Bell size={14} />
            Evening streak nudge
          </span>
          <span
            className="hs-mono text-[10px] px-2 py-1"
            style={{ color: settings.notificationsEnabled ? "var(--accent)" : "var(--muted)", border: `1px solid ${settings.notificationsEnabled ? "var(--accent)" : "var(--line-soft)"}` }}
          >
            {settings.notificationsEnabled ? "ON" : "OFF"}
          </span>
        </button>
        <p className="text-[11px] hs-c-muted mt-1 mb-3">
          {notifPermission === "denied" && "Notifications are blocked in your browser settings — enable them there first."}
          {notifPermission === "unsupported" && "Your browser doesn't support notifications."}
          {(notifPermission === "granted" || notifPermission === "default") &&
            "Fires once after 5 PM if you haven't logged anything. At most once a day."}
        </p>

        {/* ── Configurable periodic reminders ── */}
        <div className="mt-3">
          {/* Master toggle */}
          <button
            onClick={async () => {
              const enabling = !settings.periodicRemindersEnabled;
              if (enabling && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
                const result = await Notification.requestPermission();
                setNotifPermission(result);
                if (result !== 'granted') return;
              }
              onUpdate({ periodicRemindersEnabled: enabling });
            }}
            disabled={notifPermission === 'denied' || notifPermission === 'unsupported'}
            className="w-full flex items-center justify-between px-3 py-2.5 hs-panel"
          >
            <span className="text-sm flex items-center gap-2">
              <Clock size={14} />
              Periodic reminders
            </span>
            <span
              className="hs-mono text-[10px] px-2 py-1"
              style={{
                color: settings.periodicRemindersEnabled ? 'var(--accent)' : 'var(--muted)',
                border: `1px solid ${settings.periodicRemindersEnabled ? 'var(--accent)' : 'var(--line-soft)'}`,
              }}
            >
              {settings.periodicRemindersEnabled ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* Config panel — only shown when enabled */}
          {settings.periodicRemindersEnabled && (
            <div className="mt-2 px-3 py-3 space-y-3" style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid var(--line-soft)' }}>

              {/* Times per day */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="hs-mono text-[10px] tracking-wider hs-c-muted">TIMES PER DAY</span>
                  <span className="hs-mono text-[11px] hs-c-accent font-bold">
                    {settings.dailyReminderCount ?? 3}×
                    {' '}·{' '}
                    every ~{Math.round((settings.reminderEndHour ?? 22) - (settings.reminderStartHour ?? 8)) * 60 / (settings.dailyReminderCount ?? 3)} min
                  </span>
                </div>
                <input
                  type="range" min={1} max={10} step={1}
                  value={settings.dailyReminderCount ?? 3}
                  onChange={(e) => onUpdate({ dailyReminderCount: Number(e.target.value) })}
                  className="w-full"
                  style={{ accentColor: 'var(--accent)' }}
                />
                <div className="flex justify-between hs-mono text-[9px] hs-c-muted mt-0.5">
                  <span>1×</span><span>5×</span><span>10×</span>
                </div>
              </div>

              {/* Active hours */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="hs-mono text-[10px] tracking-wider hs-c-muted block mb-1">FROM</label>
                  <select
                    className="hs-input px-2 py-1.5 text-sm w-full"
                    value={settings.reminderStartHour ?? 8}
                    onChange={(e) => onUpdate({ reminderStartHour: Number(e.target.value) })}
                  >
                    {Array.from({ length: 17 }, (_, i) => i + 6).map((h) => (
                      <option key={h} value={h} style={{ background: 'var(--panel)' }}>
                        {h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="hs-mono text-[10px] tracking-wider hs-c-muted block mb-1">TO</label>
                  <select
                    className="hs-input px-2 py-1.5 text-sm w-full"
                    value={settings.reminderEndHour ?? 22}
                    onChange={(e) => onUpdate({ reminderEndHour: Number(e.target.value) })}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 12).map((h) => (
                      <option key={h} value={h} style={{ background: 'var(--panel)' }}>
                        {h === 12 ? '12 PM' : `${h - 12} PM`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Test fire button */}
              <button
                className="hs-btn w-full py-2 text-xs flex items-center justify-center gap-1.5"
                onClick={async () => {
                  // Step 1: ensure we have permission
                  if (typeof Notification === 'undefined') {
                    alert('This browser does not support notifications.');
                    return;
                  }
                  let perm = Notification.permission;
                  if (perm === 'default') {
                    perm = await Notification.requestPermission();
                    setNotifPermission(perm);
                  }
                  if (perm !== 'granted') {
                    alert('Notification permission was denied. Enable it in your browser settings (click the lock icon in the address bar).');
                    return;
                  }

                  // Step 2: fire directly from the page — always works when permission is granted
                  new Notification('Hunter System — Test', {
                    body: "This is your reminder. Quests don't complete themselves.",
                    icon: '/icon-192.png',
                    tag: 'hunter-reminder-test',
                    renotify: true,
                    silent: false,
                  });

                  // Step 3: also tell the SW to fire (adds vibration on Android)
                  try {
                    const reg = await navigator.serviceWorker.ready;
                    reg.active?.postMessage({ type: 'HUNTER_REMINDER_FIRE_NOW' });
                  } catch { /* SW not ready — page notification already sent above */ }
                }}
              >
                <Bell size={12} /> Test — fire a notification now
              </button>
            </div>
          )}

          <p className="text-[11px] hs-c-muted mt-1.5 mb-5">
            {notifPermission === 'denied' && 'Notifications blocked in browser settings — enable them there first.'}
            {notifPermission === 'unsupported' && "Your browser doesn't support notifications."}
            {(notifPermission === 'granted' || notifPermission === 'default') &&
              'Fires with sound + buzz at your chosen frequency. Works in-app always. On Android (installed PWA), also fires when the browser is fully closed via Periodic Background Sync.'}
          </p>
        </div>

        <SectionTitle>Rename Stats</SectionTitle>
        <p className="text-xs hs-c-muted mt-1 mb-3">Leave blank to keep the default name.</p>
        <div className="space-y-2 mb-5">
          {STAT_DEFS.map((s) => (
            <div key={s.key} className="flex items-center gap-2">
              <s.icon size={14} style={{ color: s.color }} className="shrink-0" />
              <span className="hs-mono text-[10px] hs-c-muted w-8 shrink-0">{s.label}</span>
              <input
                className="hs-input px-2.5 py-1.5 text-sm flex-1"
                placeholder={s.full}
                value={names[s.key] || ""}
                onChange={(e) => setNames({ ...names, [s.key]: e.target.value })}
                onBlur={(e) => commitName(s.key, e.target.value)}
              />
            </div>
          ))}
        </div>

        <SectionTitle>Backup</SectionTitle>
        <p className="text-xs hs-c-muted mt-1 mb-3">Download everything as a JSON file you can keep for yourself.</p>
        <button onClick={onExport} className="hs-btn w-full py-2.5 text-sm flex items-center justify-center gap-2">
          <Download size={14} /> Export Data
        </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ title, body, confirmLabel, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
      <div className="hs-panel hs-levelup px-7 py-7 text-center max-w-sm w-full">
        <div className="hs-mono text-xs tracking-[0.3em] hs-c-danger mb-3">{title}</div>
        <p className="text-sm hs-c-text opacity-90 mb-6">{body}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="hs-btn flex-1 py-2 text-sm">Cancel</button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 text-sm font-semibold"
            style={{
              background: "linear-gradient(180deg, #ffb020, #b5760a)",
              color: "#1a0509",
              clipPath: "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function UndoToast({ pending, onUndo, onDismiss }) {
  if (!pending) return null;
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 hs-panel px-4 py-3 flex items-center gap-3 hs-rise max-w-[92vw]">
      <span className="text-sm truncate max-w-[45vw] sm:max-w-xs">"{pending.label}" deleted</span>
      <button onClick={onUndo} className="hs-btn px-3 py-1.5 text-xs flex items-center gap-1.5 shrink-0">
        <Undo2 size={13} /> Undo
      </button>
      <button onClick={onDismiss} className="hs-c-muted hs-hover-text shrink-0">
        <X size={14} />
      </button>
    </div>
  );
}

function AchievementToast({ achievement }) {
  if (!achievement) return null;
  const Icon = achievement.icon;
  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 hs-panel px-5 py-3 flex items-center gap-3 hs-rise max-w-[92vw]">
      <Icon size={20} style={{ color: "var(--accent)" }} className="shrink-0" />
      <div className="text-left">
        <div className="hs-mono text-[9px] tracking-[0.25em] hs-c-muted">TITLE UNLOCKED</div>
        <div className="text-sm font-semibold">{achievement.title}</div>
      </div>
    </div>
  );
}

/* -------------------------------- app --------------------------------- */

export default function HunterSystem({ onSignOut, userEmail, onUploadAvatar } = {}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("overview");
  const [syncStatus, setSyncStatus] = useState("idle");
  const [levelUpInfo, setLevelUpInfo] = useState(null);
  const [rankUpInfo, setRankUpInfo] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [unlockQueue, setUnlockQueue] = useState([]);
  const [currentUnlock, setCurrentUnlock] = useState(null);
  const undoTimerRef = useRef(null);

  const persist = useCallback(async (next) => {
    if (next) {
      const fresh = getNewlyUnlocked(next);
      if (fresh.length) {
        next = { ...next, unlocked: [...(next.unlocked || []), ...fresh.map((a) => a.id)] };
        setUnlockQueue((q) => [...q, ...fresh]);
      }
    }
    setData(next);
    setSyncStatus("saving");
    try {
      const ok = await window.storage.set(STORAGE_KEY, JSON.stringify(next), false);
      setSyncStatus(ok ? "saved" : "error");
    } catch (e) {
      setSyncStatus("error");
    }
  }, []);

  // drain the unlock queue one badge at a time so simultaneous unlocks
  // (e.g. a level-up that also crosses a rank threshold) don't overlap
  useEffect(() => {
    if (currentUnlock || unlockQueue.length === 0) return;
    const [next, ...rest] = unlockQueue;
    setCurrentUnlock(next);
    setUnlockQueue(rest);
    const t = setTimeout(() => setCurrentUnlock(null), 4000);
    return () => clearTimeout(t);
  }, [unlockQueue, currentUnlock]);

  // load, then catch up on any daily quests that should have reset since
  // this hunter was last opened
  const loadFromStorage = useCallback(async () => {
    try {
      const res = await window.storage.get(STORAGE_KEY, false);
      if (res && res.value) {
        const parsed = JSON.parse(res.value);
        const { data: resetData, changed } = syncRecurringQuests(parsed);
        setData(resetData);
        if (changed) persist(resetData);
      }
    } catch (e) {
      // key doesn't exist yet — fresh install
    } finally {
      setLoading(false);
    }
  }, [persist]);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  // Live sync: the app's storage layer (when backed by a real database)
  // dispatches this event whenever this account's data changes on another
  // device or tab. Re-fetching here is what makes that show up without a
  // manual refresh. Harmless no-op if nothing ever dispatches it.
  useEffect(() => {
    const handler = () => loadFromStorage();
    window.addEventListener("hunter-storage-sync", handler);
    return () => window.removeEventListener("hunter-storage-sync", handler);
  }, [loadFromStorage]);

  // if the tab stays open across any cadence boundary (midnight, a new week,
  // a new month...), catch the rollover without needing a refresh
  useEffect(() => {
    const interval = setInterval(() => {
      setData((prev) => {
        if (!prev) return prev;
        const { data: resetData, changed } = syncRecurringQuests(prev);
        if (changed) persist(resetData);
        return changed ? resetData : prev;
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [persist]);

  // Tier 1 reminder: a quiet nudge if you haven't logged anything today and
  // it's evening. Only fires while the app is actually open (no phone-locked
  // push here — that needs a real notification server, a separate build).
  // At most once per calendar day, tracked via lastReminderDate.
  useEffect(() => {
    if (!data) return;
    if (!data.settings?.notificationsEnabled) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    const check = () => {
      const today = todayStr();
      if (data.lastReminderDate === today) return;
      if (new Date().getHours() < 17) return;
      if (data.profile.lastActive === today) return;

      new Notification("Hunter System", {
        body: "Nothing logged yet today — don't let the streak slip.",
        icon: "/icon-192.png",
        tag: "hunter-daily-reminder",
      });
      persist({ ...data, lastReminderDate: today });
    };

    check();
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, [data, persist]);

  // ── Configurable periodic reminders ────────────────────────────────────
  // Three layers for maximum delivery coverage:
  //  1. postMessage + IDB → SW setInterval (fires while browser is running)
  //  2. Periodic Background Sync → fires even when browser is fully closed
  //     (Chrome Android + installed PWA only; browser picks the actual interval)
  //  3. In-page setInterval → reliable foreground fallback
  //
  // The user picks how many times per day (1–10) and an active-hours window.
  // The interval is: active_window_ms / count, with a 30-min minimum.

  const s = data?.settings;
  const periodicEnabled    = !!s?.periodicRemindersEnabled;
  const dailyCount         = s?.dailyReminderCount   ?? 3;
  const reminderStartHour  = s?.reminderStartHour    ?? 8;
  const reminderEndHour    = s?.reminderEndHour       ?? 22;

  // Helper: write config to both IDB (for SW after restarts) and postMessage
  const syncReminderConfig = useCallback(async (cfg) => {
    // IDB write — SW reads this after a cold restart
    if ('indexedDB' in window) {
      try {
        await new Promise((resolve) => {
          const req = indexedDB.open('hunter-sw', 1);
          req.onupgradeneeded = (e) => e.target.result.createObjectStore('kv');
          req.onsuccess = (e) => {
            const tx = e.target.result.transaction('kv', 'readwrite');
            tx.objectStore('kv').put(cfg, 'reminderConfig');
            tx.oncomplete = resolve;
            tx.onerror = resolve;
          };
          req.onerror = resolve;
        });
      } catch { /* ignore */ }
    }
    // postMessage — instantly updates the running SW
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        reg.active?.postMessage({ type: 'HUNTER_REMINDER_CONFIG', config: cfg });
      } catch { /* ignore */ }
    }
  }, []);

  // Sync config to SW whenever any relevant setting changes
  useEffect(() => {
    const cfg = {
      enabled: periodicEnabled,
      count: dailyCount,
      startHour: reminderStartHour,
      endHour: reminderEndHour,
    };
    syncReminderConfig(cfg);

    if (!periodicEnabled) return;

    // Register Periodic Background Sync (Chrome Android, installed PWA)
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        if ('periodicSync' in reg) {
          const perm = await navigator.permissions.query({ name: 'periodic-background-sync' });
          if (perm.state === 'granted') {
            await reg.periodicSync.register('hunter-reminders', {
              minInterval: 60 * 60 * 1000, // suggest 1 h; browser decides actual
            });
          }
        }
      } catch { /* not supported */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodicEnabled, dailyCount, reminderStartHour, reminderEndHour]);

  // In-page setInterval (foreground fallback — most reliable for desktop)
  useEffect(() => {
    if (!periodicEnabled) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const activeMs   = (reminderEndHour - reminderStartHour) * 60 * 60 * 1000;
    const intervalMs = Math.max(30 * 60 * 1000, Math.floor(activeMs / dailyCount));
    const MSGS = [
      "Hunter check-in. Have you completed any quests today?",
      "Time check — your quest board needs attention.",
      "The system is watching. Log your training or complete a quest.",
      "Reminder: consistency beats intensity. Log something now.",
      "Don't let today pass without marking progress.",
    ];

    const fire = () => {
      const hour = new Date().getHours();
      if (hour < reminderStartHour || hour >= reminderEndHour) return;
      new Notification('Hunter System', {
        body: MSGS[Math.floor(Math.random() * MSGS.length)],
        icon: '/icon-192.png',
        tag: 'hunter-reminder',
        renotify: true,
        silent: false,
      });
    };

    const id = setInterval(fire, intervalMs);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodicEnabled, dailyCount, reminderStartHour, reminderEndHour]);

  // Keep html+body background in sync with the active theme.
  // This prevents white/default-bg showing through on overscroll (rubber-band
  // on iOS/macOS) or any gap between the root div and the viewport edge.
  const activeTheme = data?.settings?.theme || 'crimson';
  useEffect(() => {
    const bg = THEMES[activeTheme]?.bg || '#0a0507';
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
    return () => {
      // On unmount, reset to neutral dark so nothing is stuck on a stale theme
      document.documentElement.style.background = '#080508';
      document.body.style.background = '#080508';
    };
  }, [activeTheme]);

  const createHunter = (name) => persist(freshHunter(name));

  const resetVault = () => {
    persist(null).then(async () => {
      try { await window.storage.delete(STORAGE_KEY, false); } catch (e) {}
      setData(null);
    });
    setShowResetConfirm(false);
  };

  const updateSettings = (updates) => {
    persist({ ...data, settings: { ...(data.settings || {}), ...updates } });
  };

  const updateAvatar = (url) => {
    persist({ ...data, profile: { ...data.profile, avatarUrl: url } });
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hunter-${data.profile.name.replace(/\s+/g, "-").toLowerCase()}-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const grantXP = useCallback((amount, statKey) => {
    setData((prev) => {
      if (!prev) return prev;
      const prevRank = rankFor(prev.profile.level, prev.stats);
      const next = JSON.parse(JSON.stringify(prev));
      next.profile.xp += amount;
      next.profile.totalXp += amount;
      let leveled = false;
      while (next.profile.xp >= xpToNext(next.profile.level)) {
        next.profile.xp -= xpToNext(next.profile.level);
        next.profile.level += 1;
        leveled = true;
      }
      if (statKey && next.stats[statKey] != null) {
        next.stats[statKey] += Math.max(1, Math.round(amount / 15));
      }
      const today = todayStr();
      const last = next.xpHistory[next.xpHistory.length - 1];
      if (last && last.date === today) {
        // Same day — accumulate the daily XP delta, update running total
        last.totalXp = next.profile.totalXp;
        last.level = next.profile.level;
        last.dailyXp = (last.dailyXp || 0) + amount;   // ← track per-day earnings
      } else {
        // New calendar day — push a fresh entry
        next.xpHistory.push({
          date: today,
          totalXp: next.profile.totalXp,
          level: next.profile.level,
          dailyXp: amount,
        });
      }
      if (next.profile.lastActive !== today) {
        next.profile.streak = next.profile.lastActive === yesterdayStr() ? next.profile.streak + 1 : 1;
        next.profile.lastActive = today;
      }
      const newRank = rankFor(next.profile.level, next.stats);
      if (leveled) {
        setLevelUpInfo({ level: next.profile.level, rank: newRank });
      } else if (newRank.name !== prevRank.name) {
        // rank changed purely from training pushing a stat over the line —
        // worth its own celebration since it didn't ride along with a level-up
        setRankUpInfo({ rank: newRank });
      }
      persist(next);
      return next;
    });
  }, [persist]);

  // generic delete-with-undo: removes immediately, keeps a 5s window to restore
  const deleteItem = useCallback((listKey, id, labelOf) => {
    setData((prev) => {
      if (!prev) return prev;
      const list = prev[listKey];
      const index = list.findIndex((x) => x.id === id);
      if (index === -1) return prev;
      const item = list[index];
      const next = { ...prev, [listKey]: [...list.slice(0, index), ...list.slice(index + 1)] };
      persist(next);

      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      setPendingDelete({ listKey, item, index, label: labelOf(item) });
      undoTimerRef.current = setTimeout(() => setPendingDelete(null), 5000);

      return next;
    });
  }, [persist]);

  const undoDelete = useCallback(() => {
    setPendingDelete((pending) => {
      if (!pending) return pending;
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      setData((prev) => {
        if (!prev) return prev;
        const list = [...prev[pending.listKey]];
        list.splice(pending.index, 0, pending.item);
        const next = { ...prev, [pending.listKey]: list };
        persist(next);
        return next;
      });
      return null;
    });
  }, [persist]);

  const dismissToast = () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setPendingDelete(null);
  };

  const removeQuest = (id) => deleteItem("quests", id, (q) => q.title);
  const removeLog = (id) => deleteItem("trainingLogs", id, (l) => l.activity);

  const editQuest = useCallback((id, updates) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = { ...prev, quests: prev.quests.map((q) => (q.id === id ? { ...q, ...updates } : q)) };
      persist(next);
      return next;
    });
  }, [persist]);

  const editLog = useCallback((id, updates) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = { ...prev, trainingLogs: prev.trainingLogs.map((l) => (l.id === id ? { ...l, ...updates } : l)) };
      persist(next);
      return next;
    });
  }, [persist]);

  if (loading) {
    return (
      <div className="hs-root flex items-center justify-center min-h-screen">
        <GlobalStyle />
        <Loader2 className="animate-spin hs-c-accent" size={28} />
      </div>
    );
  }

  if (!data) return <Login onCreate={createHunter} />;

  const rank = rankFor(data.profile.level, data.stats);
  const next = xpToNext(data.profile.level);
  const archetype = archetypeFor(data.stats);

  const program = data.program || DEFAULT_PROGRAM;
  const todaysWorkout = program[PROGRAM_DAYS[new Date().getDay()]];
  const programDoneToday = data.programCompletedDate === todayStr();

  const completeProgramToday = () => {
    const today = todayStr();
    if (data.programCompletedDate === today || !todaysWorkout || todaysWorkout === "Rest") return;
    const xpEarned = xpForWorkout(todaysWorkout);
    const log = { id: uid(), date: today, category: "strength", activity: todaysWorkout, value: 1, xpEarned, quick: true, fromProgram: true };
    persist({ ...data, trainingLogs: [...data.trainingLogs, log], programCompletedDate: today });
    grantXP(xpEarned, "strength");
  };

  const settings = data.settings || { theme: "crimson", reduceMotion: false, statNames: {} };

  return (
    <div
      className={`hs-root min-h-screen pb-10 ${settings.reduceMotion ? "hs-reduce-motion" : ""}`}
      style={themeVars(settings.theme)}
    >
      <GlobalStyle />
      {levelUpInfo && (
        <LevelUpModal level={levelUpInfo.level} rank={levelUpInfo.rank} onClose={() => setLevelUpInfo(null)} />
      )}
      {rankUpInfo && (
        <RankUpModal rank={rankUpInfo.rank} onClose={() => setRankUpInfo(null)} />
      )}
      <AchievementToast achievement={currentUnlock} />
      <UndoToast pending={pendingDelete} onUndo={undoDelete} onDismiss={dismissToast} />
      {showResetConfirm && (
        <ConfirmModal
          title="RESET HUNTER"
          body="Erase this hunter and all progress? This cannot be undone."
          confirmLabel="Erase"
          onConfirm={resetVault}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}

      {/* header */}
      <div className="border-b hs-border-soft px-5 py-4 grid grid-cols-1 sm:grid-cols-[minmax(0,auto)_1fr_auto] items-center gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {data.profile.avatarUrl ? (
            <div
              className="w-11 h-11 rounded-full shrink-0 overflow-hidden"
              style={{ border: `2px solid ${rank.color}`, boxShadow: `0 0 8px ${rank.color}66` }}
            >
              <img src={data.profile.avatarUrl} alt={data.profile.name} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div
              className="w-11 h-11 flex items-center justify-center hs-panel shrink-0"
              style={{ color: rank.color }}
            >
              <span className="hs-display font-black text-lg">{rank.name}</span>
            </div>
          )}
          <div className="min-w-0">
            <div className="hs-display font-bold text-base leading-tight truncate">{data.profile.name}</div>
            <div className="hs-mono text-[10px] hs-c-muted flex items-center gap-2 mt-0.5">
              <span style={{ color: rank.color }}>RANK {rank.name}</span>
              <span>· {archetype.name}</span>
              <span className="flex items-center gap-1"><Flame size={11} /> {data.profile.streak}d streak</span>
            </div>
          </div>
        </div>
        <div className="w-full sm:max-w-xs sm:justify-self-center">
          <XPBar xp={data.profile.xp} next={next} level={data.profile.level} />
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-3">
          <SyncBadge status={syncStatus} />
          <button onClick={() => setShowSettings(true)} className="hs-btn px-3 py-2" title="Settings">
            <Settings size={14} />
          </button>
          <button onClick={() => setShowResetConfirm(true)} className="hs-btn px-3 py-2 flex items-center gap-1.5" title="Erase this hunter and start over">
            <RotateCcw size={14} />
            <span className="hidden sm:inline text-[11px]">Reset</span>
          </button>
          {onSignOut && (
            <button onClick={onSignOut} className="hs-btn px-3 py-2" title="Sign out">
              <LogOut size={14} />
            </button>
          )}
        </div>
      </div>

      {/* The sidebar + content area must fill the remaining viewport height so
          the sidebar colour never leaves a gap that shows the bare html bg.
          overflow-y-auto on the content pane means only that pane scrolls —
          the sidebar stays pinned and the hs-root bg always fills the screen. */}
      <div className="flex" style={{ minHeight: 'calc(100vh - 73px)' }}>
        {/* nav */}
        <div className="w-14 sm:w-52 border-r hs-border-soft py-3 shrink-0 hs-mono text-xs"
          style={{ background: 'var(--panel)' }}>
          {[
            ["overview", "Overview", TrendingUp],
            ["mind", "Mind", Brain],
            ["body", "Body", Dumbbell],
            ["stats", "Stats", Swords],
            ["titles", "Titles", Award],
          ].map(([id, label, Icon]) => (
            <div
              key={id}
              className={`hs-nav-item flex items-center gap-2.5 px-4 py-3 ${tab === id ? "active" : "hs-c-muted"}`}
              onClick={() => setTab(id)}
            >
              <Icon size={16} className="shrink-0" />
              <span className="hidden sm:inline whitespace-nowrap overflow-hidden text-ellipsis">{label.toUpperCase()}</span>
            </div>
          ))}
        </div>

        {/* content — scrolls independently, sidebar stays fixed */}
        <div className="flex-1 p-5 hs-scrollbar overflow-x-hidden overflow-y-auto">
          <div key={tab} className="hs-tab-panel">
            {tab === "overview" && (
              <Overview data={data} persist={persist} grantXP={grantXP} removeQuest={removeQuest} todaysWorkout={todaysWorkout} programDoneToday={programDoneToday} onCompleteProgram={completeProgramToday} />
            )}
            {tab === "mind" && (
              <MindGateway data={data} persist={persist} grantXP={grantXP} removeQuest={removeQuest} editQuest={editQuest} />
            )}
            {tab === "body" && (
              <BodyGateway
                data={data}
                persist={persist}
                grantXP={grantXP}
                removeLog={removeLog}
                editLog={editLog}
                programDoneToday={programDoneToday}
                onCompleteProgram={completeProgramToday}
                statNames={settings.statNames}
              />
            )}
            {tab === "stats" && <Stats data={data} rank={rank} statNames={settings.statNames} />}
            {tab === "titles" && <Titles data={data} rank={rank} archetype={archetype} />}
          </div>
        </div>
      </div>
      {showSettings && (
        <SettingsModal
          settings={settings}
          onUpdate={updateSettings}
          onExport={exportData}
          onClose={() => setShowSettings(false)}
          userEmail={userEmail}
          avatarUrl={data.profile.avatarUrl}
          onUploadAvatar={onUploadAvatar}
          onAvatarChange={updateAvatar}
        />
      )}
    </div>
  );
}

/* ========================== MIND GATEWAY ========================== */
// Quest / task management hub. The portal header is purely decorative —
// all the real quest logic lives in the Quests component below it.

function MindGateway({ data, persist, grantXP, removeQuest, editQuest }) {
  const activeCount   = data.quests.filter((q) => !q.completed).length;
  const doneToday     = data.quests.filter((q) => q.completed && q.completedAt === todayStr()).length;
  const longestStreak = data.quests.reduce((m, q) => Math.max(m, q.streak || 0), 0);
  const scheduledCount = data.quests.filter((q) => q.type === "scheduled" && !q.completed).length;

  return (
    <div>
      {/* ── Portal header ── */}
      <div className="relative mb-6 overflow-hidden" style={{ borderRadius: 2 }}>
        {/* ambient glow layer */}
        <div
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "radial-gradient(ellipse 70% 80% at 50% 110%, rgba(180,100,255,0.18), transparent)",
          }}
        />
        <div className="hs-panel px-6 py-8 relative">
          {/* decorative scan line */}
          <div
            style={{
              position: "absolute", top: 0, left: 0, right: 0, height: 1,
              background: "linear-gradient(90deg, transparent, rgba(180,100,255,0.6), transparent)",
            }}
          />
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            {/* Icon portal */}
            <div
              className="shrink-0 flex items-center justify-center"
              style={{
                width: 80, height: 80,
                background: "radial-gradient(circle, rgba(180,100,255,0.2) 0%, rgba(180,100,255,0.04) 70%)",
                border: "1px solid rgba(180,100,255,0.35)",
                boxShadow: "0 0 32px rgba(180,100,255,0.25), inset 0 0 20px rgba(180,100,255,0.08)",
                clipPath: "polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 18px 100%, 0 calc(100% - 18px))",
              }}
            >
              <Brain size={38} style={{ color: "#c084fc", filter: "drop-shadow(0 0 10px rgba(180,100,255,0.7))" }} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="hs-mono text-[10px] tracking-[0.35em] mb-1" style={{ color: "rgba(180,100,255,0.7)" }}>GATE · MIND</div>
              <h2 className="hs-display text-2xl sm:text-3xl font-black mb-1"
                style={{ color: "#c084fc", textShadow: "0 0 24px rgba(180,100,255,0.5)" }}>
                MIND GATE
              </h2>
              <p className="text-xs hs-c-muted leading-relaxed max-w-md">
                Your quest board, tasks, and mental commitments. Every quest completed here sharpens discipline and earns XP toward your rank.
              </p>
            </div>

            {/* Stats strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0 w-full sm:w-auto">
              {[
                { label: "ACTIVE",    value: activeCount,    note: "quests" },
                { label: "TODAY",     value: doneToday,      note: "completed" },
                { label: "STREAK",    value: longestStreak,  note: "best chain" },
                { label: "SCHEDULED", value: scheduledCount, note: "upcoming" },
              ].map(({ label, value, note }) => (
                <div
                  key={label}
                  className="text-center px-3 py-2"
                  style={{
                    background: "rgba(180,100,255,0.06)",
                    border: "1px solid rgba(180,100,255,0.18)",
                    clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))",
                  }}
                >
                  <div className="hs-display text-xl font-black" style={{ color: "#c084fc" }}>{value}</div>
                  <div className="hs-mono text-[9px] tracking-wider" style={{ color: "rgba(180,100,255,0.6)" }}>{label}</div>
                  <div className="text-[10px] hs-c-muted">{note}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Full Quests panel ── */}
      <Quests data={data} persist={persist} grantXP={grantXP} removeQuest={removeQuest} editQuest={editQuest} />
    </div>
  );
}

/* ========================== BODY GATEWAY ========================== */
// Training & physical discipline hub. Same pattern — portal header +
// the existing Training component with zero behavior changes.

function BodyGateway({ data, persist, grantXP, removeLog, editLog, programDoneToday, onCompleteProgram, statNames }) {
  const sessionCount  = data.trainingLogs.length;
  const prCount       = Object.keys(data.personalRecords || {}).length;
  const program       = data.program || DEFAULT_PROGRAM;
  const todaysWorkout = program[PROGRAM_DAYS[new Date().getDay()]];
  const weekSessions  = data.trainingLogs.filter((l) => {
    const d = new Date(l.date); const now = new Date();
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
    return d >= weekAgo;
  }).length;

  return (
    <div>
      {/* ── Portal header ── */}
      <div className="relative mb-6 overflow-hidden" style={{ borderRadius: 2 }}>
        <div
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "radial-gradient(ellipse 70% 80% at 50% 110%, rgba(var(--accent-deep-rgb),0.25), transparent)",
          }}
        />
        <div className="hs-panel px-6 py-8 relative">
          <div
            style={{
              position: "absolute", top: 0, left: 0, right: 0, height: 1,
              background: "linear-gradient(90deg, transparent, rgba(var(--accent-rgb),0.7), transparent)",
            }}
          />
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            {/* Icon portal */}
            <div
              className="shrink-0 flex items-center justify-center"
              style={{
                width: 80, height: 80,
                background: "radial-gradient(circle, rgba(var(--accent-rgb),0.15) 0%, rgba(var(--accent-rgb),0.03) 70%)",
                border: "1px solid rgba(var(--accent-rgb),0.35)",
                boxShadow: "0 0 32px rgba(var(--accent-rgb),0.2), inset 0 0 20px rgba(var(--accent-rgb),0.07)",
                clipPath: "polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 18px 100%, 0 calc(100% - 18px))",
              }}
            >
              <Dumbbell size={38} style={{ color: "var(--accent)", filter: "drop-shadow(0 0 10px rgba(var(--accent-rgb),0.8))" }} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="hs-mono text-[10px] tracking-[0.35em] mb-1 hs-c-muted">GATE · BODY</div>
              <h2 className="hs-display text-2xl sm:text-3xl font-black mb-1 hs-c-accent"
                style={{ textShadow: "0 0 24px rgba(var(--accent-rgb),0.45)" }}>
                BODY GATE
              </h2>
              <p className="text-xs hs-c-muted leading-relaxed max-w-md">
                Your training log, weekly split, and personal records. Every session strengthens your stats and moves your rank forward.
              </p>
            </div>

            {/* Stats strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0 w-full sm:w-auto">
              {[
                { label: "TODAY",    value: todaysWorkout === "Rest" ? "—" : (programDoneToday ? "✓" : "!"), note: todaysWorkout || "rest" },
                { label: "SESSIONS", value: sessionCount, note: "total logged" },
                { label: "THIS WEEK",value: weekSessions, note: "sessions" },
                { label: "PRs",      value: prCount,      note: "records" },
              ].map(({ label, value, note }) => (
                <div
                  key={label}
                  className="text-center px-3 py-2"
                  style={{
                    background: "rgba(var(--accent-rgb),0.05)",
                    border: "1px solid rgba(var(--accent-rgb),0.18)",
                    clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))",
                  }}
                >
                  <div className="hs-display text-xl font-black hs-c-accent">{value}</div>
                  <div className="hs-mono text-[9px] tracking-wider hs-c-muted">{label}</div>
                  <div className="text-[10px] hs-c-muted truncate">{note}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Full Training panel ── */}
      <Training
        data={data}
        persist={persist}
        grantXP={grantXP}
        removeLog={removeLog}
        editLog={editLog}
        programDoneToday={programDoneToday}
        onCompleteProgram={onCompleteProgram}
        statNames={statNames}
      />
    </div>
  );
}

/* ------------------------------ overview ------------------------------ */

function Overview({ data, persist, grantXP, removeQuest, todaysWorkout, programDoneToday, onCompleteProgram }) {
  const today = todayStr();
  const activeQuests = data.quests
    .filter((q) => !q.completed)
    .filter((q) => q.type !== "scheduled" || q.scheduledDate <= today) // future-dated ones stay hidden until due
    .sort((a, b) => (a.type === "scheduled" ? -1 : 0) - (b.type === "scheduled" ? -1 : 0))
    .slice(0, 5);
  const recentLogs = [...data.trainingLogs].slice(-4).reverse();

  // Build a complete 14-day chart dataset — one slot per calendar day.
  // Days with no activity get a 0 dailyXp entry (carrying forward the last
  // known totalXp) so the chart never has invisible gaps or phantom jumps.
  const chartData = (() => {
    const history = data.xpHistory;
    if (history.length === 0) return [];

    // Index existing entries by date for O(1) lookup
    const byDate = Object.fromEntries(history.map((e) => [e.date, e]));

    // Generate slots for each of the past 14 calendar days
    const slots = [];
    // Seed lastTotal from the most recent history entry that predates the window
    // (so the carry-forward for day 0 starts from the correct running total,
    //  not from history[0] which may be months old)
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - 14);
    const windowStartIso = windowStart.toISOString().slice(0, 10);
    const preWindow = history.filter((e) => e.date < windowStartIso);
    let lastTotal = preWindow.length > 0
      ? preWindow[preWindow.length - 1].totalXp
      : 0;

    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);   // "2026-09-24"
      const entry = byDate[iso];

      if (entry) {
        lastTotal = entry.totalXp;
        slots.push({
          iso,
          label: d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
          dayLabel: d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase(),
          totalXp: entry.totalXp,
          dailyXp: entry.dailyXp || 0,
          level: entry.level,
        });
      } else {
        // Rest/inactive day — carry forward totalXp, mark dailyXp as 0
        slots.push({
          iso,
          label: d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
          dayLabel: d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase(),
          totalXp: lastTotal,
          dailyXp: 0,
          level: null,
        });
      }
    }
    return slots;
  })();

  // Aggregate stats across the 14-day window for the subtitle strip
  const windowXp = chartData.reduce((s, d) => s + d.dailyXp, 0);
  const activeDays = chartData.filter((d) => d.dailyXp > 0).length;
  const bestDay = chartData.reduce((best, d) => (d.dailyXp > (best?.dailyXp || 0) ? d : best), null);

  const [completingIds, setCompletingIds] = useState(new Set());
  const [fadingIds, setFadingIds] = useState(new Set());
  const [programPop, setProgramPop] = useState(false);

  const handleCompleteProgram = () => {
    setProgramPop(true);
    onCompleteProgram();
    setTimeout(() => setProgramPop(false), 320);
  };

  const completeQuest = (q) => {
    // Both persist() and grantXP() call setData() with a functional updater
    // so React queues them — grantXP sees the updated quests without needing
    // an async .then() wait.
    const def = QUEST_TYPES[q.type];
    const rec = isRecurring(q);
    const streak = rec ? (q.streak || 0) + 1 : q.streak || 0;
    const periodKeyNow = rec && def?.period ? periodKey(new Date(), def.period) : q.periodKey;

    const questsNext = !rec
      ? data.quests.filter((x) => x.id !== q.id)           // one-time: vanish
      : data.quests.map((x) => (x.id === q.id
          ? { ...x, completed: true, completedAt: todayStr(), streak, periodKey: periodKeyNow }
          : x));                                            // recurring: mark done

    persist({ ...data, quests: questsNext });
    grantXP(q.xp, null);
  };

  // brief celebratory pop plays out before the item actually leaves the list
  const handleComplete = (q) => {
    setCompletingIds((prev) => new Set(prev).add(q.id));
    setTimeout(() => {
      completeQuest(q);
      setCompletingIds((prev) => {
        const next = new Set(prev);
        next.delete(q.id);
        return next;
      });
    }, 260);
  };

  const handleDelete = (id) => {
    setFadingIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      removeQuest(id);
      setFadingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 220);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="hs-panel p-5 lg:col-span-2">
        <SectionTitle>XP Progression</SectionTitle>

        {/* 14-day stat strip */}
        <div className="flex gap-4 mt-2 mb-3 text-[10px] hs-mono hs-c-muted">
          <span>Last 14 days</span>
          <span className="hs-c-accent font-bold">+{windowXp} XP</span>
          <span>{activeDays} active day{activeDays !== 1 ? 's' : ''}</span>
          {bestDay && bestDay.dailyXp > 0 && (
            <span>Best: <span className="hs-c-accent">+{bestDay.dailyXp}</span> ({bestDay.dayLabel})</span>
          )}
        </div>

        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-[200px] hs-c-muted text-xs italic">
            Complete a quest or log a session to start tracking progress.
          </div>
        ) : (
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  {/* Gradient for the totalXp area — filled from accent down to transparent */}
                  <linearGradient id="xpGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                  </linearGradient>
                  {/* Solid gradient for the dailyXp bars */}
                  <linearGradient id="dailyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="var(--accent-deep)" stopOpacity={0.7} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="rgba(var(--accent-rgb), 0.07)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  stroke="rgba(var(--accent-rgb), 0.3)"
                  tick={{ fill: 'var(--muted)', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(var(--accent-rgb), 0.12)' }}
                  interval={1}
                />
                <YAxis
                  stroke="rgba(var(--accent-rgb), 0.3)"
                  tick={{ fill: 'var(--muted)', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }}
                  tickLine={false}
                  axisLine={false}
                  width={38}
                  tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}
                />
                <Tooltip
                  cursor={{ stroke: 'rgba(var(--accent-rgb), 0.2)', strokeWidth: 1 }}
                  contentStyle={{
                    background: 'var(--panel-2)',
                    border: '1px solid rgba(var(--accent-rgb), 0.35)',
                    borderRadius: 0,
                    fontSize: 11,
                    fontFamily: 'JetBrains Mono, monospace',
                    color: 'var(--text)',
                    boxShadow: '0 0 20px rgba(var(--accent-rgb), 0.15)',
                  }}
                  labelStyle={{ color: 'var(--muted)', marginBottom: 4, letterSpacing: '0.1em' }}
                  itemStyle={{ color: 'var(--accent)' }}
                  formatter={(value, name) => [
                    `${value} XP`,
                    name === 'dailyXp' ? 'Earned today' : 'Total XP',
                  ]}
                />
                {/* Cumulative total as a soft area behind the bars */}
                <Area
                  type="monotone"
                  dataKey="totalXp"
                  stroke="rgba(var(--accent-rgb), 0.35)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  fill="url(#xpGrad)"
                  dot={false}
                  name="totalXp"
                />
                {/* Daily XP as a solid area on top — the primary signal */}
                <Area
                  type="monotone"
                  dataKey="dailyXp"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  fill="url(#dailyGrad)"
                  dot={(props) => {
                    const { cx, cy, payload } = props;
                    if (!payload.dailyXp) return null;
                    return (
                      <circle
                        key={payload.iso}
                        cx={cx} cy={cy} r={3}
                        fill="var(--accent)"
                        stroke="var(--panel)"
                        strokeWidth={1.5}
                      />
                    );
                  }}
                  activeDot={{ r: 5, fill: 'var(--accent)', stroke: 'var(--panel)', strokeWidth: 2 }}
                  name="dailyXp"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="hs-panel p-5">
        <SectionTitle>Today's Quests</SectionTitle>
        <p className="text-xs hs-c-muted mt-1 mb-3">Tap a quest to complete it and collect its XP.</p>

        {todaysWorkout && todaysWorkout !== "Rest" && (
          <button
            onClick={programDoneToday ? undefined : handleCompleteProgram}
            disabled={programDoneToday}
            className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 hs-panel hover:brightness-125 transition mb-2 ${programPop ? "hs-pop" : ""}`}
            style={{ opacity: programDoneToday ? 0.55 : 1, cursor: programDoneToday ? "default" : "pointer" }}
          >
            {programDoneToday ? (
              <CheckCircle2 size={16} style={{ color: "var(--accent)" }} className="shrink-0" />
            ) : (
              <Circle size={14} className="hs-c-muted shrink-0" />
            )}
            <span className="text-sm flex-1 truncate">
              {todaysWorkout} <span className="hs-c-muted text-[10px]">— today's program</span>
            </span>
            <span className="hs-mono text-[10px] hs-c-accent shrink-0">+{xpForWorkout(todaysWorkout)}</span>
          </button>
        )}
        {todaysWorkout === "Rest" && (
          <p className="text-xs hs-c-muted italic mb-2">Rest day — recovery is part of the program too.</p>
        )}

        {activeQuests.length === 0 ? (
          <EmptyState text="No active quests. The board is clear." />
        ) : (
          <div className="space-y-2">
            {activeQuests.map((q) => (
              <div
                key={q.id}
                className={`flex items-center gap-2 hs-panel hs-rise ${completingIds.has(q.id) ? "hs-pop" : ""} ${fadingIds.has(q.id) ? "hs-shrink-out" : ""}`}
              >
                <button
                  onClick={() => handleComplete(q)}
                  disabled={completingIds.has(q.id)}
                  className="flex-1 flex items-center gap-2.5 text-left px-3 py-2.5 hover:brightness-125 transition min-w-0"
                >
                  <Circle size={14} className="hs-c-muted shrink-0" />
                  <span className="text-sm flex-1 truncate">{q.title}</span>
                  {q.type === "scheduled" && (() => {
                    const { label, overdue } = formatScheduled(q.scheduledDate, q.scheduledTime);
                    return (
                      <span
                        className="hs-mono text-[10px] px-1.5 py-0.5 rounded-sm flex items-center gap-1 shrink-0 whitespace-nowrap"
                        style={{ color: overdue ? "var(--danger)" : QUEST_TYPES.scheduled.color, border: `1px solid ${overdue ? "var(--danger)" : QUEST_TYPES.scheduled.color}55` }}
                      >
                        <Calendar size={9} />{label}
                      </span>
                    );
                  })()}
                  <span className="hs-mono text-[10px] hs-c-accent shrink-0">+{q.xp}</span>
                </button>
                <button onClick={() => handleDelete(q.id)} className="hs-c-muted hs-hover-danger shrink-0 pr-3">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="hs-panel p-5 lg:col-span-3">
        <SectionTitle>Recent Training</SectionTitle>
        {recentLogs.length === 0 ? (
          <EmptyState text="No sessions logged yet. Your first log starts the record." />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
            {recentLogs.map((l) => {
              const def = STAT_DEFS.find((s) => s.key === l.category);
              const Icon = def?.icon || Dumbbell;
              return (
                <div key={l.id} className="hs-panel p-3">
                  <div className="flex items-center gap-2 mb-1" style={{ color: def?.color }}>
                    <Icon size={14} />
                    <span className="hs-mono text-[10px] tracking-wider">{def?.label}</span>
                  </div>
                  <div className="text-sm font-medium truncate">{l.activity}</div>
                  <div className="text-[11px] hs-c-muted">{l.date} · +{l.xpEarned} XP</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------- quests -------------------------------- */

function Quests({ data, persist, grantXP, removeQuest, editQuest }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("daily");
  const [recurring, setRecurringState] = useState(QUEST_TYPES.daily.recurring);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType] = useState("daily");
  const [editRecurring, setEditRecurring] = useState(true);
  const [editScheduledDate, setEditScheduledDate] = useState("");
  const [editScheduledTime, setEditScheduledTime] = useState("");
  const [fadingIds, setFadingIds] = useState(new Set());
  const [completingIds, setCompletingIds] = useState(new Set());

  // switching type resets "repeats" to that type's natural default, but the
  // person can still flip it either way afterward
  const handleTypeChange = (newType) => {
    setType(newType);
    setRecurringState(QUEST_TYPES[newType].recurring);
  };

  const handleEditTypeChange = (newType) => {
    setEditType(newType);
    setEditRecurring(QUEST_TYPES[newType].recurring);
  };

  const handleDelete = (id) => {
    setFadingIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      removeQuest(id);
      setFadingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 200);
  };

  const addQuest = () => {
    if (!title.trim()) return;
    if (type === "scheduled" && !scheduledDate) return;
    const def = QUEST_TYPES[type];
    const q = {
      id: uid(),
      title: title.trim(),
      type,
      xp: def.xp,
      completed: false,
      completedAt: null,
      streak: 0,
      createdAt: todayStr(),
      recurring: type === "scheduled" ? false : recurring,
      periodKey: (type !== "scheduled" && recurring) ? periodKey(new Date(), def.period) : null,
      scheduledDate: type === "scheduled" ? scheduledDate : null,
      scheduledTime: type === "scheduled" && scheduledTime ? scheduledTime : null,
    };
    persist({ ...data, quests: [q, ...data.quests] });
    setTitle("");
    setScheduledDate("");
    setScheduledTime("");
  };

  const complete = (q) => {
    const def = QUEST_TYPES[q.type];
    const rec = isRecurring(q);
    const streak = rec ? (q.streak || 0) + 1 : q.streak || 0;
    const periodKeyNow = rec ? periodKey(new Date(), def.period) : q.periodKey;
    if (!rec) {
      // Non-recurring quest: remove it entirely after granting XP (vanish)
      persist({ ...data, quests: data.quests.filter((x) => x.id !== q.id) });
    } else {
      persist({ ...data, quests: data.quests.map((x) => (x.id === q.id ? { ...x, completed: true, completedAt: todayStr(), streak, periodKey: periodKeyNow } : x)) });
    }
    grantXP(q.xp, null);
  };

  const handleComplete = (q) => {
    setCompletingIds((prev) => new Set(prev).add(q.id));
    setTimeout(() => {
      complete(q);
      setCompletingIds((prev) => {
        const next = new Set(prev);
        next.delete(q.id);
        return next;
      });
    }, 260);
  };

  const startEdit = (q) => {
    setEditingId(q.id);
    setEditTitle(q.title);
    setEditType(q.type);
    setEditRecurring(q.recurring ?? QUEST_TYPES[q.type]?.recurring ?? false);
    setEditScheduledDate(q.scheduledDate || "");
    setEditScheduledTime(q.scheduledTime || "");
  };

  const saveEdit = () => {
    if (!editTitle.trim()) return;
    if (editType === "scheduled" && !editScheduledDate) return;
    const def = QUEST_TYPES[editType];
    editQuest(editingId, {
      title: editTitle.trim(),
      type: editType,
      xp: def.xp,
      recurring: editType === "scheduled" ? false : editRecurring,
      periodKey: (editType !== "scheduled" && editRecurring) ? periodKey(new Date(), def.period) : null,
      scheduledDate: editType === "scheduled" ? editScheduledDate : null,
      scheduledTime: editType === "scheduled" && editScheduledTime ? editScheduledTime : null,
    });
    setEditingId(null);
  };

  // scheduled quests sort soonest-first; everything else keeps insertion order after them
  const pending = data.quests
    .filter((q) => !q.completed)
    .sort((a, b) => {
      const aKey = a.type === "scheduled" ? `${a.scheduledDate}T${a.scheduledTime || "23:59"}` : null;
      const bKey = b.type === "scheduled" ? `${b.scheduledDate}T${b.scheduledTime || "23:59"}` : null;
      if (aKey && bKey) return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
      if (aKey) return -1;
      if (bKey) return 1;
      return 0;
    });
  const done = data.quests.filter((q) => q.completed);

  // Whether to show the mode toggle — hidden for "scheduled" type (always one-time)
  const showModeToggle = type !== "scheduled";
  const showEditModeToggle = editType !== "scheduled";

  return (
    <div className="max-w-3xl">
      <div className="hs-panel p-5 mb-5">
        <SectionTitle>New Quest</SectionTitle>
        <p className="text-xs hs-c-muted mt-1 mb-3">Pick the timeframe it deserves — longer commitments earn more XP, 100 per month of scope.</p>
        <div className={`grid grid-cols-1 ${showModeToggle ? "sm:grid-cols-[1fr_200px_auto_120px]" : "sm:grid-cols-[1fr_200px_120px]"} gap-3 items-end`}>
          <div>
            <label className="hs-mono text-[10px] tracking-wider hs-c-muted block mb-1">QUEST</label>
            <input
              className="hs-input px-3 py-2 w-full text-sm"
              placeholder="e.g. Read 20 pages"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addQuest()}
            />
          </div>
          <div>
            <label className="hs-mono text-[10px] tracking-wider hs-c-muted block mb-1">TYPE</label>
            <select className="hs-input px-3 py-2 w-full text-sm hs-mono" value={type} onChange={(e) => handleTypeChange(e.target.value)}>
              {Object.entries(QUEST_TYPES).map(([k, v]) => (
                <option key={k} value={k} style={{ background: "#170b0e" }}>{v.label} (+{v.xp})</option>
              ))}
            </select>
          </div>
          {showModeToggle && (
            <div>
              <label className="hs-mono text-[10px] tracking-wider hs-c-muted block mb-1">MODE</label>
              <button
                type="button"
                onClick={() => setRecurringState((v) => !v)}
                className="hs-input px-3 py-2 text-sm hs-mono flex items-center gap-1.5 whitespace-nowrap w-full justify-center"
                style={{ color: recurring ? "var(--accent)" : "#ffb020", borderColor: recurring ? "rgba(var(--accent-rgb), 0.25)" : "#ffb02055" }}
                title={recurring ? "Quest will reset on its cadence and recur" : "Quest will vanish after completion"}
              >
                {recurring ? <><RotateCcw size={12} /> Recurring</> : <><span style={{ fontSize: 13, fontWeight: 700 }}>1×</span> One-time</>}
              </button>
            </div>
          )}
          <button className="hs-btn-solid px-4 py-2 text-sm flex items-center gap-1.5 justify-center h-[38px]" onClick={addQuest} disabled={!title.trim() || (type === "scheduled" && !scheduledDate)}>
            <Plus size={16} /> Add
          </button>
        </div>
        {type === "scheduled" && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="hs-mono text-[10px] tracking-wider hs-c-muted block mb-1">DATE</label>
              <input
                type="date"
                className="hs-input px-3 py-2 w-full text-sm"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </div>
            <div>
              <label className="hs-mono text-[10px] tracking-wider hs-c-muted block mb-1">TIME (OPTIONAL)</label>
              <input
                type="time"
                className="hs-input px-3 py-2 w-full text-sm"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      <div className="hs-panel p-5 mb-5">
        <SectionTitle>Active ({pending.length})</SectionTitle>
        <p className="text-xs hs-c-muted mt-1 mb-3 flex items-center gap-1.5">
          <RotateCcw size={11} /> Recurring quests reset on their cadence. One-time quests vanish after completion.
        </p>
        {pending.length === 0 ? <EmptyState text="No open quests." /> : (
          <div className="space-y-2">
            {pending.map((q) =>
              editingId === q.id ? (
                <div key={q.id} className="px-3 py-2.5 hs-panel hs-rise">
                  <div className={`grid grid-cols-1 ${showEditModeToggle ? "sm:grid-cols-[1fr_150px_auto_auto]" : "sm:grid-cols-[1fr_170px_auto]"} gap-2 items-center`}>
                    <input
                      className="hs-input px-2.5 py-1.5 w-full text-sm"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                      autoFocus
                    />
                    <select className="hs-input px-2.5 py-1.5 w-full text-sm hs-mono" value={editType} onChange={(e) => handleEditTypeChange(e.target.value)}>
                      {Object.entries(QUEST_TYPES).map(([k, v]) => (
                        <option key={k} value={k} style={{ background: "#170b0e" }}>{v.label} (+{v.xp})</option>
                      ))}
                    </select>
                    {showEditModeToggle && (
                      <button
                        type="button"
                        onClick={() => setEditRecurring((v) => !v)}
                        className="hs-input px-2.5 py-1.5 text-[11px] hs-mono flex items-center gap-1 whitespace-nowrap justify-center"
                        style={{ color: editRecurring ? "var(--accent)" : "#ffb020", borderColor: editRecurring ? "rgba(var(--accent-rgb), 0.25)" : "#ffb02055" }}
                        title={editRecurring ? "Recurring: resets on cadence" : "One-time: vanishes on completion"}
                      >
                        {editRecurring ? <><RotateCcw size={10} /></> : <><span style={{ fontSize: 12, fontWeight: 700 }}>1×</span></>}
                      </button>
                    )}
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={saveEdit} className="hs-btn-solid p-1.5" title="Save"><Check size={14} /></button>
                      <button onClick={() => setEditingId(null)} className="hs-btn p-1.5" title="Cancel"><X size={14} /></button>
                    </div>
                  </div>
                  {editType === "scheduled" && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <input
                        type="date"
                        className="hs-input px-2.5 py-1.5 w-full text-sm"
                        value={editScheduledDate}
                        onChange={(e) => setEditScheduledDate(e.target.value)}
                      />
                      <input
                        type="time"
                        className="hs-input px-2.5 py-1.5 w-full text-sm"
                        value={editScheduledTime}
                        onChange={(e) => setEditScheduledTime(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div key={q.id} className={`flex items-center gap-3 px-3 py-2.5 hs-panel hs-rise ${completingIds.has(q.id) ? "hs-pop" : ""} ${fadingIds.has(q.id) ? "hs-shrink-out" : ""}`}>
                  <button onClick={() => handleComplete(q)} disabled={completingIds.has(q.id)}>
                    <Circle size={18} className="hs-c-muted hs-hover-accent" />
                  </button>
                  <span className="flex-1 text-sm truncate">{q.title}</span>
                  {isRecurring(q) && q.streak > 0 && (
                    <span className="hs-mono text-[10px] flex items-center gap-1 hs-c-muted" title="Current streak">
                      <Flame size={11} /> {q.streak}
                    </span>
                  )}
                  {q.type === "scheduled" ? (
                    (() => {
                      const { label, overdue } = formatScheduled(q.scheduledDate, q.scheduledTime);
                      return (
                        <span
                          className="hs-mono text-[10px] px-2 py-0.5 rounded-sm flex items-center gap-1 shrink-0 whitespace-nowrap"
                          style={{ color: overdue ? "var(--danger)" : QUEST_TYPES.scheduled.color, border: `1px solid ${overdue ? "var(--danger)" : QUEST_TYPES.scheduled.color}55` }}
                        >
                          <Calendar size={9} />
                          {label}
                        </span>
                      );
                    })()
                  ) : (
                    <span
                      className="hs-mono text-[10px] px-2 py-0.5 rounded-sm flex items-center gap-1 shrink-0 whitespace-nowrap"
                      style={{ color: !isRecurring(q) ? "#ffb020" : QUEST_TYPES[q.type].color, border: `1px solid ${!isRecurring(q) ? "#ffb02055" : QUEST_TYPES[q.type].color + "55"}` }}
                    >
                      {isRecurring(q) ? <RotateCcw size={9} /> : <span style={{ fontSize: 9, fontWeight: 700 }}>1×</span>}
                      {QUEST_TYPES[q.type].label.toUpperCase()}
                    </span>
                  )}
                  <span className="hs-mono text-[11px] hs-c-accent shrink-0">+{q.xp}</span>
                  <button onClick={() => startEdit(q)} className="hs-c-muted hs-hover-accent shrink-0">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => handleDelete(q.id)} className="hs-c-muted hs-hover-danger shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {done.length > 0 && (
        <div className="hs-panel p-5">
          <SectionTitle>Completed ({done.length})</SectionTitle>
          <div className="space-y-2 mt-3 opacity-60">
            {done.slice(0, 8).map((q) => (
              <div key={q.id} className={`flex items-center gap-3 px-3 py-2 text-sm ${fadingIds.has(q.id) ? "hs-shrink-out" : ""}`}>
                <CheckCircle2 size={16} className="hs-c-accent" />
                <span className="flex-1 line-through truncate">{q.title}</span>
                <button onClick={() => handleDelete(q.id)} className="hs-c-muted hs-hover-danger shrink-0">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------- training ------------------------------- */

function Training({ data, persist, grantXP, removeLog, editLog, programDoneToday, onCompleteProgram, statNames }) {
  const [category, setCategory] = useState("strength");
  const [activity, setActivity] = useState("");
  const [value, setValue] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editActivity, setEditActivity] = useState("");
  const [editCategory, setEditCategory] = useState("strength");
  const [swapDay, setSwapDay] = useState(null);
  const [fadingIds, setFadingIds] = useState(new Set());
  const [programPop, setProgramPop] = useState(false);

  const handleCompleteProgram = () => {
    setProgramPop(true);
    onCompleteProgram();
    setTimeout(() => setProgramPop(false), 320);
  };

  const handleDelete = (id) => {
    setFadingIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      removeLog(id);
      setFadingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 200);
  };

  const program = data.program || DEFAULT_PROGRAM;
  const todayIndex = new Date().getDay();

  const usesReps = category === "strength" || category === "vitality";
  const unitLabel = usesReps ? "REPS" : "MINUTES";

  const records = data.personalRecords || {};

  const addLog = () => {
    if (!activity.trim() || !value) return;
    const v = Math.max(1, Number(value));
    const xpEarned = Math.min(150, Math.round(v * 1.5));
    const unit = usesReps ? "reps" : "min";
    const key = `${category}:${activity.trim().toLowerCase()}`;
    const prevRecord = records[key];
    const isPR = !prevRecord || v > prevRecord.value;

    const log = { id: uid(), date: todayStr(), category, activity: activity.trim(), value: v, xpEarned, isPR };
    const personalRecords = isPR
      ? { ...records, [key]: { activity: activity.trim(), category, value: v, unit, date: todayStr() } }
      : records;

    persist({ ...data, trainingLogs: [...data.trainingLogs, log], personalRecords });
    grantXP(xpEarned, category);
    setActivity(""); setValue("");
  };

  // one tap, no typing: for days you just want the session on record
  const quickLog = (name, xpEarned = 25) => {
    const log = { id: uid(), date: todayStr(), category: "strength", activity: name, value: 1, xpEarned, quick: true };
    persist({ ...data, trainingLogs: [...data.trainingLogs, log] });
    grantXP(xpEarned, "strength");
  };

  const startEdit = (l) => {
    setEditingId(l.id);
    setEditActivity(l.activity);
    setEditCategory(l.category);
  };

  const saveEdit = () => {
    if (!editActivity.trim()) return;
    editLog(editingId, { activity: editActivity.trim(), category: editCategory });
    setEditingId(null);
  };

  const updateProgramDay = (dayKey, workout) => {
    persist({ ...data, program: { ...program, [dayKey]: workout } });
  };

  // tap swap on one day, then tap swap on another to exchange their workouts.
  // tapping the same day again cancels.
  const handleSwapClick = (dayKey) => {
    if (swapDay === null) {
      setSwapDay(dayKey);
    } else if (swapDay === dayKey) {
      setSwapDay(null);
    } else {
      const next = { ...program };
      const tmp = next[swapDay];
      next[swapDay] = next[dayKey];
      next[dayKey] = tmp;
      persist({ ...data, program: next });
      setSwapDay(null);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="hs-panel p-5 mb-5">
        <SectionTitle>Quick Log — Strength</SectionTitle>
        <p className="text-xs hs-c-muted mt-1 mb-3">Tap a muscle group — or a superset — to log today's session instantly, no typing needed.</p>

        <div className="hs-mono text-[10px] tracking-wider hs-c-muted mb-1.5">MUSCLE GROUP</div>
        <div className="flex flex-wrap gap-2 mb-4">
          {MUSCLE_GROUPS.map((g) => (
            <button key={g} onClick={() => quickLog(g, 25)} className="hs-btn px-4 py-2 text-sm flex items-center gap-1.5">
              <Dumbbell size={14} /> {g}
            </button>
          ))}
        </div>

        <div className="hs-mono text-[10px] tracking-wider hs-c-muted mb-1.5">SUPERSET <span className="opacity-70">(+40 XP)</span></div>
        <div className="flex flex-wrap gap-2">
          {SUPERSETS.map((s) => (
            <button key={s.name} onClick={() => quickLog(s.name, s.xp)} className="hs-btn px-4 py-2 text-sm flex items-center gap-1.5">
              <Zap size={14} /> {s.name}
            </button>
          ))}
        </div>
      </div>

      <div className="hs-panel p-5 mb-5">
        <SectionTitle>Weekly Split</SectionTitle>
        <p className="text-xs hs-c-muted mt-1 mb-3">
          Edit any day as your program evolves. Tap <ArrowLeftRight size={11} className="inline align-[-1px]" /> to swap two days.
          Mark today done and it's logged to history.
        </p>
        <div className="space-y-1.5">
          {PROGRAM_DAYS.map((dayKey, i) => {
            const isToday = i === todayIndex;
            const isArmed = swapDay === dayKey;
            const todayIsRest = isToday && program[dayKey] === "Rest";
            return (
              <div
                key={dayKey}
                className="grid grid-cols-[52px_1fr_auto_auto] gap-2 items-center px-3 py-2 hs-panel"
                style={{ borderColor: isToday ? "var(--accent)" : undefined }}
              >
                <span className="hs-mono text-[11px]" style={{ color: isToday ? "var(--accent)" : "var(--muted)" }}>
                  {DAY_LABELS[i]}
                </span>
                <select
                  className="hs-input px-2.5 py-1.5 text-sm hs-mono w-full"
                  value={program[dayKey]}
                  onChange={(e) => updateProgramDay(dayKey, e.target.value)}
                >
                  {PROGRAM_OPTIONS.map((o) => (
                    <option key={o} value={o} style={{ background: "#170b0e" }}>{o}</option>
                  ))}
                </select>
                <button
                  onClick={() => handleSwapClick(dayKey)}
                  className="hs-btn p-1.5"
                  style={isArmed ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
                  title="Swap with another day"
                >
                  <ArrowLeftRight size={13} />
                </button>
                {isToday && !todayIsRest ? (
                  <button
                    onClick={programDoneToday ? undefined : handleCompleteProgram}
                    disabled={programDoneToday}
                    className={`hs-btn p-1.5 ${programPop ? "hs-pop" : ""}`}
                    style={programDoneToday ? { borderColor: "var(--accent)", color: "var(--accent)", cursor: "default" } : undefined}
                    title={programDoneToday ? "Logged for today" : "Mark today's workout done — logs to history"}
                  >
                    {programDoneToday ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                  </button>
                ) : (
                  <span className="w-[30px]" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="hs-panel p-5 mb-5">
        <SectionTitle>Personal Records</SectionTitle>
        <p className="text-xs hs-c-muted mt-1 mb-3">Log a session — beat your best for that activity and it's a new PR.</p>
        <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr_130px] gap-3 items-end">
          <div>
            <label className="hs-mono text-[10px] tracking-wider hs-c-muted block mb-1">STAT</label>
            <select className="hs-input px-3 py-2 w-full text-sm hs-mono" value={category} onChange={(e) => setCategory(e.target.value)}>
              {STAT_DEFS.map((s) => <option key={s.key} value={s.key} style={{ background: "#170b0e" }}>{getStatName(s.key, statNames)}</option>)}
            </select>
          </div>
          <div>
            <label className="hs-mono text-[10px] tracking-wider hs-c-muted block mb-1">ACTIVITY</label>
            <input
              className="hs-input px-3 py-2 w-full text-sm"
              placeholder="e.g. Bench press"
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addLog()}
            />
          </div>
          <div>
            <label className="hs-mono text-[10px] tracking-wider hs-c-muted block mb-1">{unitLabel}</label>
            <input
              className="hs-input px-3 py-2 w-full text-sm"
              placeholder={usesReps ? "e.g. 50" : "e.g. 30"}
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addLog()}
            />
          </div>
        </div>
        <button className="hs-btn-solid px-4 py-2 text-sm mt-3 flex items-center gap-1.5 w-full sm:w-auto justify-center" onClick={addLog} disabled={!activity.trim() || !value}>
          <Zap size={15} /> Log Session
        </button>

        {Object.keys(records).length > 0 && (
          <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--line-soft)" }}>
            <div className="hs-mono text-[10px] tracking-wider hs-c-muted mb-2">CURRENT BESTS</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.values(records)
                .sort((a, b) => a.activity.localeCompare(b.activity))
                .map((r) => {
                  const def = STAT_DEFS.find((s) => s.key === r.category);
                  const Icon = def?.icon || Dumbbell;
                  return (
                    <div key={`${r.category}:${r.activity}`} className="hs-panel p-2.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon size={12} style={{ color: def?.color }} className="shrink-0" />
                        <div className="text-xs font-semibold truncate">{r.activity}</div>
                      </div>
                      <div className="hs-mono text-sm hs-c-accent">{r.value} {r.unit}</div>
                      <div className="text-[10px] hs-c-muted">{r.date}</div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      <div className="hs-panel p-5">
        <SectionTitle>History ({data.trainingLogs.length})</SectionTitle>
        {data.trainingLogs.length === 0 ? <EmptyState text="Nothing logged yet." /> : (
          <div className="space-y-2 mt-3 max-h-96 overflow-y-auto hs-scrollbar pr-1">
            {[...data.trainingLogs].reverse().map((l) => {
              const def = STAT_DEFS.find((s) => s.key === l.category);
              const Icon = def?.icon || Dumbbell;

              if (editingId === l.id) {
                return (
                  <div key={l.id} className="hs-panel p-3 hs-rise">
                    <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-2">
                      <select className="hs-input px-2.5 py-1.5 text-sm hs-mono" value={editCategory} onChange={(e) => setEditCategory(e.target.value)}>
                        {STAT_DEFS.map((s) => <option key={s.key} value={s.key} style={{ background: "#170b0e" }}>{getStatName(s.key, statNames)}</option>)}
                      </select>
                      <input
                        className="hs-input px-2.5 py-1.5 text-sm"
                        value={editActivity}
                        onChange={(e) => setEditActivity(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                        autoFocus
                      />
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[11px] hs-c-muted italic">Value & XP stay locked once logged.</span>
                      <div className="flex items-center gap-2">
                        <button onClick={saveEdit} className="hs-btn-solid p-1.5" title="Save"><Check size={14} /></button>
                        <button onClick={() => setEditingId(null)} className="hs-btn p-1.5" title="Cancel"><X size={14} /></button>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={l.id} className={`flex items-center gap-3 px-3 py-2 hs-panel ${fadingIds.has(l.id) ? "hs-shrink-out" : ""}`}>
                  <Icon size={15} style={{ color: def?.color }} className="shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate flex items-center gap-1.5">
                      {l.activity}
                      {l.isPR && (
                        <span
                          className="hs-mono text-[9px] px-1.5 py-0.5 shrink-0"
                          style={{ color: "var(--accent)", border: "1px solid var(--accent)" }}
                          title="New personal record"
                        >
                          PR
                        </span>
                      )}
                    </div>
                    <div className="hs-mono text-[10px] hs-c-muted">
                      {l.date} · {l.quick ? "Quick session" : `${l.value} ${l.category === "strength" || l.category === "vitality" ? "reps" : "min"}`}
                    </div>
                  </div>
                  <span className="hs-mono text-[11px] hs-c-accent shrink-0">+{l.xpEarned}</span>
                  <button onClick={() => startEdit(l)} className="hs-c-muted hs-hover-accent shrink-0">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => handleDelete(l.id)} className="hs-c-muted hs-hover-danger shrink-0">
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- stats --------------------------------- */

function Stats({ data, rank, statNames }) {
  const radarData = STAT_DEFS.map((s) => ({ stat: s.label, value: data.stats[s.key] }));
  const currentIndex = RANKS.findIndex((r) => r.name === rank.name);
  const nextRank = RANKS[currentIndex + 1];

  let weakestKey = null;
  if (nextRank) {
    weakestKey = STAT_DEFS.reduce((min, s) => (data.stats[s.key] < data.stats[min.key] ? s : min), STAT_DEFS[0]).key;
  }
  const levelOk = nextRank ? data.profile.level >= nextRank.minLevel : true;
  const statOk = nextRank ? weakestStat(data.stats) >= nextRank.minStat : true;

  return (
    <div className="grid lg:grid-cols-2 gap-5 max-w-4xl">
      <div className="hs-panel p-5">
        <SectionTitle>Stat Distribution</SectionTitle>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <RadarChart data={radarData} outerRadius="75%">
              <PolarGrid stroke="rgba(var(--accent-rgb), 0.15)" />
              <PolarAngleAxis dataKey="stat" tick={{ fill: "#8a5a63", fontSize: 11 }} />
              <Radar dataKey="value" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.35} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-3">
        <div className="hs-panel p-5">
          <SectionTitle>Attributes</SectionTitle>
          <div className="space-y-3 mt-3">
            {STAT_DEFS.map((s) => (
              <div key={s.key} className="flex items-center gap-3" title={getStatName(s.key, statNames)}>
                <s.icon size={16} style={{ color: s.color }} className="shrink-0" />
                <span className="hs-mono text-xs w-8 hs-c-muted">{s.label}</span>
                <div className="hs-bar-track h-2 flex-1">
                  <div className="h-full" style={{ width: `${Math.min(100, data.stats[s.key])}%`, background: s.color, boxShadow: `0 0 8px ${s.color}` }} />
                </div>
                <span className="hs-mono text-xs w-8 text-right">{data.stats[s.key]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="hs-panel p-5">
          <SectionTitle>Rank Progress</SectionTitle>
          <div className="flex items-center gap-3 mt-3">
            <span className="hs-display text-3xl font-black" style={{ color: rank.color }}>{rank.name}</span>
            {nextRank && (
              <>
                <ChevronRight size={18} className="hs-c-muted" />
                <span className="hs-display text-3xl font-black hs-c-muted opacity-50">{nextRank.name}</span>
              </>
            )}
          </div>

          {!nextRank && (
            <p className="text-xs hs-c-muted mt-2">You've reached the highest rank. There's nowhere left to climb.</p>
          )}

          {nextRank && (
            <div className="mt-3 space-y-1.5">
              <div className="text-xs flex items-center gap-2" style={{ color: levelOk ? "var(--accent)" : "var(--muted)" }}>
                {levelOk ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                Level {nextRank.minLevel} {levelOk ? "— reached" : `(currently ${data.profile.level})`}
              </div>
              <div className="text-xs flex items-center gap-2" style={{ color: statOk ? "var(--accent)" : "var(--muted)" }}>
                {statOk ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                Every stat at {nextRank.minStat}+ {statOk ? "— reached" : `(weakest is ${getStatName(weakestKey, statNames)} at ${data.stats[weakestKey]})`}
              </div>
              <p className="text-[11px] hs-c-muted italic pt-1">
                {levelOk && !statOk && "Level's there — this one's on training now."}
                {!levelOk && statOk && "Stats are ready — just needs more overall experience."}
                {!levelOk && !statOk && "Rank needs both real experience and real training — quests alone won't get you there."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- titles --------------------------------- */

function Titles({ data, rank, archetype }) {
  const unlockedSet = new Set(data.unlocked || []);
  const unlockedCount = ACHIEVEMENTS.filter((a) => unlockedSet.has(a.id)).length;

  return (
    <div className="max-w-3xl">
      <div className="hs-panel p-5 mb-5">
        <SectionTitle>Class</SectionTitle>
        <div className="flex items-center gap-4 mt-3">
          <div className="w-14 h-14 flex items-center justify-center hs-panel shrink-0" style={{ color: rank.color }}>
            <span className="hs-display font-black text-xl">{archetype.name[0]}</span>
          </div>
          <div>
            <div className="hs-display text-lg font-bold">{archetype.name}</div>
            <div className="text-xs hs-c-muted mt-0.5">{archetype.desc}</div>
          </div>
        </div>
        <p className="text-[11px] hs-c-muted mt-3 italic">Determined by your highest stat — train a different one to change class.</p>
      </div>

      <div className="hs-panel p-5">
        <SectionTitle>Titles ({unlockedCount}/{ACHIEVEMENTS.length})</SectionTitle>
        <p className="text-xs hs-c-muted mt-1 mb-4">Earned by playing, not by asking.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {ACHIEVEMENTS.map((a) => {
            const unlocked = unlockedSet.has(a.id);
            const Icon = a.icon;
            return (
              <div
                key={a.id}
                className="hs-panel p-3 flex flex-col items-center text-center gap-1.5 relative"
                style={{ opacity: unlocked ? 1 : 0.45 }}
              >
                {!unlocked && <Lock size={11} className="absolute top-2 right-2 hs-c-muted" />}
                <Icon size={20} style={{ color: unlocked ? "var(--accent)" : undefined }} className={unlocked ? "" : "hs-c-muted"} />
                <div className="text-xs font-semibold">{unlocked ? a.title : "???"}</div>
                <div className="text-[10px] hs-c-muted leading-snug">{unlocked ? a.desc : "Locked"}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- shared -------------------------------- */

function SectionTitle({ children }) {
  return (
    <div className="hs-mono text-[11px] tracking-[0.25em] hs-c-accent flex items-center gap-2">
      <span className="w-1.5 h-1.5" style={{ background: "var(--accent)", boxShadow: "0 0 6px var(--accent)" }} />
      {children}
    </div>
  );
}

function EmptyState({ text }) {
  return <p className="text-xs hs-c-muted mt-3 italic">{text}</p>;
}