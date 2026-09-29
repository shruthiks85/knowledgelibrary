import { useState, type FormEvent } from "react";
import { getSupabase } from "@/lib/supabase";

export function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const auth = getSupabase().auth;
      if (mode === "login") {
        const { error } = await auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) setInfo("Check your email to confirm your account, then log in.");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h2 className="mb-4 text-xl font-semibold">{mode === "login" ? "Log in" : "Sign up"}</h2>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          aria-label="Email"
          className="h-12 rounded-lg border border-input bg-card px-4 outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          aria-label="Password"
          className="h-12 rounded-lg border border-input bg-card px-4 outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={busy}
          className="h-12 rounded-lg bg-primary font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>
      <div className="mt-2 min-h-5 text-sm" aria-live="polite">
        {error && <p className="text-destructive">{error}</p>}
        {info && <p className="text-muted-foreground">{info}</p>}
      </div>
      <button
        onClick={() => {
          setMode(mode === "login" ? "signup" : "login");
          setError(null);
          setInfo(null);
        }}
        className="mt-4 text-sm underline"
      >
        {mode === "login" ? "No account? Sign up" : "Already have an account? Log in"}
      </button>
    </div>
  );
}
