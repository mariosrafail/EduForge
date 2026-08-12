import { useEffect, useState } from "react";

import { getBuilderSession, loginBuilder, logoutBuilder } from "./builderAuthApi.js";
import "./builderAuth.css";

const genericLoginError = "Invalid email or password.";

function BuilderLogin({ onAuthenticated }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const payload = await loginBuilder(email, password);
      setPassword("");
      onAuthenticated(payload.builderUser);
    } catch (requestError) {
      setPassword("");
      setError(requestError.status === 429
        ? "Too many login attempts. Try again later."
        : genericLoginError);
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="builder-auth-page">
    <section className="builder-auth-card" aria-labelledby="builder-login-title">
      <div className="builder-auth-brand" aria-hidden="true">HH</div>
      <p className="builder-auth-eyebrow">Publisher tools</p>
      <h1 id="builder-login-title">Builder sign in</h1>
      <p>Authorized Hamilton House Builder developers only.</p>
      <form onSubmit={submit}>
        <label htmlFor="builder-email">Email</label>
        <input id="builder-email" name="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
        <label htmlFor="builder-password">Password</label>
        <input id="builder-password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        {error ? <p className="builder-auth-error" role="alert">{error}</p> : null}
        <button type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</button>
      </form>
      <small>No public registration or password recovery is available.</small>
    </section>
  </main>;
}

export function BuilderAuthGate({ children }) {
  const [state, setState] = useState({ status: "checking", user: null, message: "" });

  useEffect(() => {
    const controller = new AbortController();
    getBuilderSession({ signal: controller.signal })
      .then((payload) => setState(payload.authenticated
        ? { status: "authenticated", user: payload.builderUser, message: "" }
        : { status: "unauthenticated", user: null, message: "" }))
      .catch((error) => {
        if (error.name !== "AbortError") setState({ status: "unauthenticated", user: null, message: "Unable to verify the Builder session." });
      });
    return () => controller.abort();
  }, []);

  async function logout() {
    try {
      await logoutBuilder();
    } finally {
      setState({ status: "unauthenticated", user: null, message: "" });
    }
  }

  if (state.status === "checking") return <main className="builder-auth-page"><p role="status">Checking Builder session…</p></main>;
  if (state.status !== "authenticated") return <><BuilderLogin onAuthenticated={(user) => setState({ status: "authenticated", user, message: "" })} />{state.message ? <p className="builder-auth-global-error" role="alert">{state.message}</p> : null}</>;

  return <div className="builder-authenticated-shell">
    <header className="builder-staff-bar">
      <div><strong>Publisher Book Builder</strong><span>Authenticated Builder · tool capabilities apply</span></div>
      <div><span>{state.user.full_name}</span><button type="button" onClick={logout}>Logout</button></div>
    </header>
    {children}
  </div>;
}
