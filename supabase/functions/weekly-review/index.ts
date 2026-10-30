// Supabase Edge Function: weekly-review
// Uses Google Gemini 1.5 Flash (free tier) — API key lives in Supabase Vault,
// never in the browser bundle.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured in Supabase Vault." }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const snap = await req.json();

    const questsDone   = snap.questsCompleted.map((q) => `- ${q.title} (${q.type})`).join("\n") || "None";
    const questsMissed = snap.questsMissed.map((q)    => `- ${q.title} (${q.type})`).join("\n") || "None";
    const training     = snap.trainingSessions.length
      ? snap.trainingSessions.map((s) => `- ${s.date}: ${s.muscle}${s.exercises?.length ? ` (${s.exercises.slice(0,3).join(", ")})` : ""}`).join("\n")
      : "No sessions logged";
    const statLines = Object.entries(snap.currentStats)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n");

    const prompt = `You are a direct, no-nonsense performance coach reviewing a hunter's week in a gamified life-tracking app called Hunter System (inspired by Solo Leveling). Give an honest assessment — not cheerleading.

Your review must have EXACTLY these four sections, separated by ---:
VERDICT: one punchy sentence summarising the week (growth, stagnation, or regression).
WHAT HELD: bullet points (max 4) of genuine wins. Be specific. If nothing earned praise, say so plainly.
WHAT SLIPPED: bullet points (max 4) of specific failures or missed commitments. Do not soften this.
THE ONE CHANGE: a single, concrete behaviour change for next week. Not a list. One thing.

Rules:
- Write in second person ("you").
- Keep total output under 350 words.
- No emojis. No markdown headers. Use the plain section labels above.
- Match the tone to the data. A weak week should feel like a weak week.

---

Hunter: ${snap.hunterName} | Rank ${snap.rank} | Level ${snap.level} | Streak: ${snap.streak} day(s)
Class: ${snap.archetype}
XP gained this week: ${snap.xpGainedThisWeek}

QUESTS COMPLETED (${snap.questsCompleted.length}):
${questsDone}

QUESTS MISSED / STILL OPEN (${snap.questsMissed.length}):
${questsMissed}

TRAINING SESSIONS (${snap.trainingSessions.length}):
${training}

STATS:
${statLines}

Write the weekly review.`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 600, temperature: 0.7 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error("Gemini error:", err);
      return new Response(JSON.stringify({ error: "Gemini request failed: " + err }), {
        status: 502,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const geminiJson = await geminiRes.json();
    const text = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    return new Response(JSON.stringify({ review: text }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
