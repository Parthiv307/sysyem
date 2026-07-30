import { useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "./supabaseClient";
import { GlobalStyle } from "./HunterSystem";

export default function Auth() {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkEmail, setCheckEmail] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError("");
    try {
      if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.auth.signUp({ email: email.trim(), password });
        if (err) throw err;
        setCheckEmail(true);
      }
    } catch (e) {
      setError(e.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  if (checkEmail) {
    return (
      <div className="hs-root flex items-center justify-center min-h-screen px-4">
        <GlobalStyle />
        <div className="hs-panel hs-rise px-8 py-10 max-w-sm w-full text-center">
          <div className="hs-mono text-[11px] tracking-[0.4em] hs-c-muted mb-2">SYSTEM</div>
          <h1 className="hs-display text-xl font-bold mb-3">CHECK YOUR EMAIL</h1>
          <p className="text-sm hs-c-muted">
            We sent a confirmation link to <span className="hs-c-text">{email}</span>. Confirm it, then sign in below.
          </p>
          <button className="hs-btn-solid w-full py-2.5 text-sm mt-6" onClick={() => { setCheckEmail(false); setMode("signin"); }}>
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="hs-root flex items-center justify-center min-h-screen px-4">
      <GlobalStyle />
      <div className="hs-panel hs-rise px-8 py-10 max-w-sm w-full text-center">
        <div className="hs-mono text-[11px] tracking-[0.4em] hs-c-muted mb-2">SYSTEM</div>
        <h1 className="hs-display text-2xl font-bold mb-1" style={{ textShadow: "0 0 14px rgba(232,40,63,0.5)" }}>
          {mode === "signin" ? "WELCOME BACK, HUNTER" : "AWAKENING"}
        </h1>
        <p className="text-sm hs-c-muted mb-8">
          {mode === "signin" ? "Sign in to continue your progress." : "Create an account to begin — this one syncs everywhere."}
        </p>

        <div className="text-left mb-3">
          <label className="hs-mono text-[10px] tracking-wider hs-c-muted block mb-1">EMAIL</label>
          <input
            className="hs-input w-full px-3 py-2.5 hs-mono"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            autoFocus
          />
        </div>
        <div className="text-left mb-4">
          <label className="hs-mono text-[10px] tracking-wider hs-c-muted block mb-1">PASSWORD</label>
          <input
            className="hs-input w-full px-3 py-2.5 hs-mono"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            minLength={6}
          />
        </div>

        {error && <p className="text-xs mb-4" style={{ color: "var(--danger)" }}>{error}</p>}

        <button
          className="hs-btn-solid w-full py-2.5 text-sm flex items-center justify-center gap-2"
          disabled={loading || !email.trim() || !password}
          onClick={submit}
        >
          {loading && <Loader2 size={14} className="animate-spin" />}
          {mode === "signin" ? "Sign In" : "Create Account"}
        </button>

        <button
          className="hs-mono text-[11px] hs-c-muted hs-hover-accent mt-5"
          onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}
        >
          {mode === "signin" ? "New hunter? Create an account" : "Already a hunter? Sign in"}
        </button>
      </div>
    </div>
  );
}
