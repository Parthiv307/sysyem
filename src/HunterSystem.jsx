import { useState, useEffect, useCallback, useRef } from "react";
import {
  Swords, Dumbbell, ListChecks, TrendingUp, Plus, Trash2, CheckCircle2,
  Circle, Zap, Shield, Wind, Eye, Brain, RotateCcw, Loader2, X, Sparkles,
  Flame, ChevronRight, Lock, Pencil, Check, Undo2, Award, ArrowLeftRight, LogOut, Settings, Download
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

const RANKS = [
  { name: "E", min: 1, color: "#6B3038" },
  { name: "D", min: 10, color: "#9A2E3D" },
  { name: "C", min: 20, color: "#C42540" },
  { name: "B", min: 30, color: "#E8283F" },
  { name: "A", min: 40, color: "#FF5C72" },
  { name: "S", min: 50, color: "#FFD3D9" },
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
// fractional month so they still earn a fair but modest reward). Only Daily
// auto-resets each day right now; the rest are one-time goals.
const QUEST_TYPES = {
  daily: { label: "Daily", months: 0.2, xp: 20, color: "#6B3038", recurring: true },
  weekly: { label: "Weekly", months: 0.5, xp: 50, color: "#9A2E3D", recurring: false },
  monthly: { label: "Monthly", months: 1, xp: 100, color: "#C42540", recurring: false },
  quarterly: { label: "Quarterly", months: 3, xp: 300, color: "#E8283F", recurring: false },
  halfyear: { label: "Half-Yearly", months: 6, xp: 600, color: "#FF5C72", recurring: false },
  yearly: { label: "Yearly", months: 12, xp: 1200, color: "#FFD3D9", recurring: false },
};

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

function xpToNext(level) {
  return 100 + (level - 1) * 40;
}

function rankFor(level) {
  let r = RANKS[0];
  for (const rk of RANKS) if (level >= rk.min) r = rk;
  return r;
}

function freshHunter(name) {
  const stats = {};
  STAT_DEFS.forEach((s) => (stats[s.key] = 10));
  return {
    profile: { name, level: 1, xp: 0, totalXp: 0, createdAt: todayStr(), streak: 0, lastActive: null, lastQuestReset: todayStr() },
    stats,
    quests: [],
    trainingLogs: [],
    xpHistory: [{ date: todayStr(), totalXp: 0, level: 1 }],
    unlocked: [],
    settings: { theme: "crimson", reduceMotion: false, statNames: {} },
    program: { ...DEFAULT_PROGRAM },
    programCompletedDate: null,
    personalRecords: {},
  };
}

// Daily quests reset every day. If a daily was completed yesterday its streak
// carries forward; if a day was missed the streak quietly returns to zero.
// Non-recurring quests (everything except Daily right now) are one-time
// goals and untouched by this.
function applyDailyReset(data) {
  const today = todayStr();
  const lastReset = data.profile.lastQuestReset || today;
  if (lastReset === today) return { data, changed: false };

  const yesterday = yesterdayStr();
  const quests = data.quests.map((q) => {
    if (!QUEST_TYPES[q.type]?.recurring) return q;
    const keptStreak = q.completed && q.completedAt === yesterday ? (q.streak || 0) : 0;
    return { ...q, completed: false, streak: keptStreak };
  });

  return {
    data: { ...data, quests, profile: { ...data.profile, lastQuestReset: today } },
    changed: true,
  };
}

/* ------------------------------- styles ------------------------------- */

export function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Rajdhani:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');

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
        background: var(--bg);
        color: var(--text);
        min-height: 100vh;
        position: relative;
        background-image:
          radial-gradient(ellipse 80% 50% at 50% -10%, rgba(var(--accent-deep-rgb), 0.18), transparent),
          linear-gradient(rgba(var(--accent-rgb), 0.035) 1px, transparent 1px),
          linear-gradient(90deg, rgba(var(--accent-rgb), 0.035) 1px, transparent 1px);
        background-size: 100% 100%, 28px 28px, 28px 28px;
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
        transition: all 0.15s ease;
        cursor: pointer;
      }
      .hs-btn:hover { background: rgba(var(--accent-rgb), 0.18); box-shadow: 0 0 16px rgba(var(--accent-rgb), 0.35); }
      .hs-btn:active { transform: scale(0.97); }
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
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .hs-rise { animation: hs-rise 0.35s ease both; }

      @keyframes hs-tab-in {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .hs-tab-panel { animation: hs-tab-in 0.28s ease both; }

      @keyframes hs-shrink-out {
        from { opacity: 1; transform: scale(1); max-height: 100px; }
        to { opacity: 0; transform: scale(0.97); max-height: 0; margin: 0; padding-top: 0; padding-bottom: 0; }
      }
      .hs-shrink-out { animation: hs-shrink-out 0.22s ease both; overflow: hidden; }

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

function SettingsModal({ settings, onUpdate, onExport, onClose }) {
  const [names, setNames] = useState({ ...(settings.statNames || {}) });

  const commitName = (key, value) => {
    const trimmed = value.trim();
    const next = { ...names };
    if (trimmed) next[key] = trimmed;
    else delete next[key];
    setNames(next);
    onUpdate({ statNames: next });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4 py-8 overflow-y-auto">
      <div className="hs-panel hs-rise px-6 py-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-5">
          <div className="hs-mono text-xs tracking-[0.3em] hs-c-accent">SETTINGS</div>
          <button onClick={onClose} className="hs-c-muted hs-hover-text" title="Close"><X size={18} /></button>
        </div>

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

export default function HunterSystem({ onSignOut } = {}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("overview");
  const [syncStatus, setSyncStatus] = useState("idle");
  const [levelUpInfo, setLevelUpInfo] = useState(null);
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
        const { data: resetData, changed } = applyDailyReset(parsed);
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

  // if the tab stays open past midnight, catch the rollover without a refresh
  useEffect(() => {
    const interval = setInterval(() => {
      setData((prev) => {
        if (!prev) return prev;
        const { data: resetData, changed } = applyDailyReset(prev);
        if (changed) persist(resetData);
        return changed ? resetData : prev;
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [persist]);

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
        last.totalXp = next.profile.totalXp;
        last.level = next.profile.level;
      } else {
        next.xpHistory.push({ date: today, totalXp: next.profile.totalXp, level: next.profile.level });
      }
      if (next.profile.lastActive !== today) {
        next.profile.streak = next.profile.lastActive === yesterdayStr() ? next.profile.streak + 1 : 1;
        next.profile.lastActive = today;
      }
      if (leveled) setLevelUpInfo({ level: next.profile.level, rank: rankFor(next.profile.level) });
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

  const rank = rankFor(data.profile.level);
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
          <div
            className="w-11 h-11 flex items-center justify-center hs-panel shrink-0"
            style={{ color: rank.color }}
          >
            <span className="hs-display font-black text-lg">{rank.name}</span>
          </div>
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

      <div className="flex">
        {/* nav */}
        <div className="w-14 sm:w-52 border-r hs-border-soft py-3 shrink-0 hs-mono text-xs">
          {[
            ["overview", "Overview", TrendingUp],
            ["quests", "Quests", ListChecks],
            ["training", "Training Log", Dumbbell],
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

        {/* content */}
        <div className="flex-1 p-5 hs-scrollbar overflow-x-hidden">
          <div key={tab} className="hs-tab-panel">
            {tab === "overview" && (
              <Overview data={data} grantXP={grantXP} todaysWorkout={todaysWorkout} programDoneToday={programDoneToday} onCompleteProgram={completeProgramToday} />
            )}
            {tab === "quests" && (
              <Quests data={data} persist={persist} grantXP={grantXP} removeQuest={removeQuest} editQuest={editQuest} />
            )}
            {tab === "training" && (
              <Training
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
        />
      )}
    </div>
  );
}

/* ------------------------------ overview ------------------------------ */

function Overview({ data, grantXP, todaysWorkout, programDoneToday, onCompleteProgram }) {
  const activeQuests = data.quests.filter((q) => !q.completed).slice(0, 5);
  const recentLogs = [...data.trainingLogs].slice(-4).reverse();
  const chartData = data.xpHistory.slice(-14);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="hs-panel p-5 lg:col-span-2">
        <SectionTitle>XP Progression</SectionTitle>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="xpGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(var(--accent-rgb), 0.08)" vertical={false} />
              <XAxis dataKey="date" stroke="#8a5a63" fontSize={10} tickLine={false} axisLine={{ stroke: "rgba(var(--accent-rgb), 0.15)" }} />
              <YAxis stroke="#8a5a63" fontSize={10} tickLine={false} axisLine={false} width={34} />
              <Tooltip contentStyle={{ background: "#170b0e", border: "1px solid rgba(var(--accent-rgb), 0.3)", fontSize: 12 }} labelStyle={{ color: "#8a5a63" }} />
              <Area type="monotone" dataKey="totalXp" stroke="var(--accent)" strokeWidth={2} fill="url(#xpGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="hs-panel p-5">
        <SectionTitle>Today's Quests</SectionTitle>
        <p className="text-xs hs-c-muted mt-1 mb-3">Tap a quest to complete it and collect its XP.</p>

        {todaysWorkout && todaysWorkout !== "Rest" && (
          <button
            onClick={programDoneToday ? undefined : onCompleteProgram}
            disabled={programDoneToday}
            className="w-full flex items-center gap-2.5 text-left px-3 py-2.5 hs-panel hover:brightness-125 transition mb-2"
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
              <button
                key={q.id}
                onClick={() => grantXP(q.xp, null)}
                className="w-full flex items-center gap-2.5 text-left px-3 py-2.5 hs-panel hover:brightness-125 transition"
              >
                <Circle size={14} className="hs-c-muted shrink-0" />
                <span className="text-sm flex-1 truncate">{q.title}</span>
                <span className="hs-mono text-[10px] hs-c-accent">+{q.xp}</span>
              </button>
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
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType] = useState("daily");
  const [fadingIds, setFadingIds] = useState(new Set());

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
    const q = { id: uid(), title: title.trim(), type, xp: QUEST_TYPES[type].xp, completed: false, completedAt: null, streak: 0, createdAt: todayStr() };
    persist({ ...data, quests: [q, ...data.quests] });
    setTitle("");
  };

  const complete = (q) => {
    const isRecurring = QUEST_TYPES[q.type]?.recurring;
    const streak = isRecurring ? (q.streak || 0) + 1 : q.streak || 0;
    persist({ ...data, quests: data.quests.map((x) => (x.id === q.id ? { ...x, completed: true, completedAt: todayStr(), streak } : x)) });
    grantXP(q.xp, null);
  };

  const startEdit = (q) => {
    setEditingId(q.id);
    setEditTitle(q.title);
    setEditType(q.type);
  };

  const saveEdit = () => {
    if (!editTitle.trim()) return;
    editQuest(editingId, { title: editTitle.trim(), type: editType, xp: QUEST_TYPES[editType].xp });
    setEditingId(null);
  };

  const pending = data.quests.filter((q) => !q.completed);
  const done = data.quests.filter((q) => q.completed);

  return (
    <div className="max-w-3xl">
      <div className="hs-panel p-5 mb-5">
        <SectionTitle>New Quest</SectionTitle>
        <p className="text-xs hs-c-muted mt-1 mb-3">Pick the timeframe it deserves — longer commitments earn more XP, 100 per month of scope.</p>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px_120px] gap-3 items-end">
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
            <select className="hs-input px-3 py-2 w-full text-sm hs-mono" value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(QUEST_TYPES).map(([k, v]) => (
                <option key={k} value={k} style={{ background: "#170b0e" }}>{v.label} (+{v.xp})</option>
              ))}
            </select>
          </div>
          <button className="hs-btn-solid px-4 py-2 text-sm flex items-center gap-1.5 justify-center h-[38px]" onClick={addQuest} disabled={!title.trim()}>
            <Plus size={16} /> Add
          </button>
        </div>
      </div>

      <div className="hs-panel p-5 mb-5">
        <SectionTitle>Active ({pending.length})</SectionTitle>
        <p className="text-xs hs-c-muted mt-1 mb-3 flex items-center gap-1.5">
          <RotateCcw size={11} /> Daily Quests reset automatically at midnight — keep completing one to build its streak.
        </p>
        {pending.length === 0 ? <EmptyState text="No open quests." /> : (
          <div className="space-y-2">
            {pending.map((q) =>
              editingId === q.id ? (
                <div key={q.id} className="grid grid-cols-1 sm:grid-cols-[1fr_170px_auto] gap-2 items-center px-3 py-2.5 hs-panel hs-rise">
                  <input
                    className="hs-input px-2.5 py-1.5 w-full text-sm"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                    autoFocus
                  />
                  <select className="hs-input px-2.5 py-1.5 w-full text-sm hs-mono" value={editType} onChange={(e) => setEditType(e.target.value)}>
                    {Object.entries(QUEST_TYPES).map(([k, v]) => (
                      <option key={k} value={k} style={{ background: "#170b0e" }}>{v.label} (+{v.xp})</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={saveEdit} className="hs-btn-solid p-1.5" title="Save"><Check size={14} /></button>
                    <button onClick={() => setEditingId(null)} className="hs-btn p-1.5" title="Cancel"><X size={14} /></button>
                  </div>
                </div>
              ) : (
                <div key={q.id} className={`flex items-center gap-3 px-3 py-2.5 hs-panel hs-rise ${fadingIds.has(q.id) ? "hs-shrink-out" : ""}`}>
                  <button onClick={() => complete(q)}>
                    <Circle size={18} className="hs-c-muted hs-hover-accent" />
                  </button>
                  <span className="flex-1 text-sm truncate">{q.title}</span>
                  {QUEST_TYPES[q.type]?.recurring && q.streak > 0 && (
                    <span className="hs-mono text-[10px] flex items-center gap-1 hs-c-muted" title="Current streak">
                      <Flame size={11} /> {q.streak}
                    </span>
                  )}
                  <span className="hs-mono text-[10px] px-2 py-0.5 rounded-sm flex items-center gap-1 shrink-0 whitespace-nowrap" style={{ color: QUEST_TYPES[q.type].color, border: `1px solid ${QUEST_TYPES[q.type].color}55` }}>
                    {QUEST_TYPES[q.type]?.recurring && <RotateCcw size={9} />}
                    {QUEST_TYPES[q.type].label.toUpperCase()}
                  </span>
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
                    onClick={programDoneToday ? undefined : onCompleteProgram}
                    disabled={programDoneToday}
                    className="hs-btn p-1.5"
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
  const nextRank = RANKS.find((r) => r.min > data.profile.level);

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
            <ChevronRight size={18} className="hs-c-muted" />
            <span className="hs-display text-3xl font-black hs-c-muted opacity-50">{nextRank ? nextRank.name : "MAX"}</span>
          </div>
          <p className="text-xs hs-c-muted mt-2">
            {nextRank ? `Reach level ${nextRank.min} to advance to Rank ${nextRank.name}.` : "You have reached the highest known rank."}
          </p>
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
