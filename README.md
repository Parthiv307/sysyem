# Hunter System — Standalone App

This is the Hunter System, ported out of Claude and into a real, independent
web app with its own database and real accounts. It runs entirely on your
own Supabase project and whatever static host you deploy it to — nothing
here depends on Claude or your Claude account.

## 1. Set up Supabase (the database)

1. Go to [supabase.com](https://supabase.com) and create a free account + new project.
2. Once the project is ready, open **SQL Editor** in the left sidebar, paste in
   the contents of `supabase/schema.sql`, and click **Run**. This creates the
   one table the app needs, with row-level security so every user can only
   ever see their own data.
3. Go to **Settings → API** and copy two values: the **Project URL** and the
   **anon / public key**.
4. In this project folder, copy `.env.local.example` to `.env.local`:
   ```
   cp .env.local.example .env.local
   ```
   and paste your two values in.

By default Supabase requires email confirmation before a new account can
sign in. For quick personal testing you can turn this off in
**Authentication → Providers → Email → Confirm email** (toggle off), or just
click the confirmation link Supabase emails you.

## 2. Run it locally

```
npm install
npm run dev
```

Opens at `http://localhost:5173`. Sign up with any email/password, and
you're in.

## 3. Deploy it somewhere real

Any static host works. Two easy free options:

**Vercel**
1. Push this folder to a GitHub repo (or use `npx vercel` directly from this
   folder without GitHub — it'll ask you to log in).
2. Import the repo at [vercel.com/new](https://vercel.com/new).
3. In the project's Environment Variables settings, add
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the same values from
   your `.env.local`.
4. Deploy. You'll get a real URL like `hunter-system.vercel.app` that works
   on any device, signed into Claude or not.

**Netlify** — same idea: `npm run build` produces a `dist/` folder, which you
can either drag-and-drop at [app.netlify.com/drop](https://app.netlify.com/drop)
for a one-off deploy, or connect the repo for automatic deploys. Add the same
two environment variables in Site settings → Environment variables, build
command `npm run build`, publish directory `dist`.

## How it works

- `src/HunterSystem.jsx` — the app itself (quests, training log, stats,
  titles, weekly split, PRs) — this is the same code from the Claude
  artifact, essentially unchanged.
- `src/storageShim.js` — replicates the `window.storage` API the artifact
  version used, but backed by a real Supabase table instead. This is the
  trick that let the big file above port over almost untouched.
- `src/Auth.jsx` — real email/password sign up and sign in via Supabase Auth.
- `src/App.jsx` — wires the two together: shows the auth screen when signed
  out, sets up storage for the current user, and renders the app when
  signed in.
- `supabase/schema.sql` — the one table (`hunter_data`), one row per user,
  protected by row-level security so accounts are genuinely separate.

## Bringing over your old data

Your progress from the Claude-hosted version doesn't transfer automatically
— it lives in Claude's storage, which this app has no way to reach. If you
want to carry over your Level/XP/quests/achievements, let me know and I'll
add an export button to the old artifact and an import step here.
