import { useState } from "react";
import { supabase } from "./supabase.ts";
import { ThemeToggle } from "./ThemeToggle.tsx";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(mode: "in" | "up") {
    setBusy(true);
    setError(null);
    const { error } = mode === "in" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  }

  return (
    <>
    <div className="login-theme"><ThemeToggle /></div>
    <form className="login" onSubmit={(e) => (e.preventDefault(), submit("in"))}>
      <h1>Report editor</h1>
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
      </label>
      <label>
        Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="submit" disabled={busy}>Sign in</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => submit("up")}>Create account</button>
      </div>
    </form>
    </>
  );
}
