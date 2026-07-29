import React, { useState } from "react";
import { LockKeyhole, LogIn } from "lucide-react";
import { platformAuth } from "../platformAdminApi.js";
import { PlatformAlert, PlatformButton } from "./PlatformUi.jsx";

export function PlatformAdminLogin({ message, error: availabilityError, onAuthenticated }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const payload = await platformAuth.login({ email, password });
      if (!payload.platformAdmin?.id) throw new Error("The privileged session could not be established.");
      const verified = await platformAuth.me({ notifyUnauthorized: true });
      if (!verified.platformAdmin?.id || verified.platformAdmin.id !== payload.platformAdmin.id) {
        throw new Error("The privileged session could not be established.");
      }
      setPassword("");
      onAuthenticated(verified.platformAdmin);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="pa-login-shell">
      <section className="pa-login-card" aria-labelledby="pa-login-title">
        <div className="pa-brand-mark" aria-hidden="true">E</div>
        <p className="pa-restricted-label"><LockKeyhole size={15} /> Restricted operator area</p>
        <h1 id="pa-login-title">EduForge Platform Administration</h1>
        <p className="pa-login-copy">Sign in with a dedicated Platform Admin account. Ordinary EduForge accounts cannot access this area.</p>
        <form onSubmit={submit}>
          <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
          {message && <PlatformAlert tone="warning">{message}</PlatformAlert>}
          {(error || availabilityError) && <PlatformAlert tone="error">{error || availabilityError}</PlatformAlert>}
          <PlatformButton type="submit" icon={LogIn} loading={busy}>Sign in</PlatformButton>
        </form>
      </section>
    </main>
  );
}
