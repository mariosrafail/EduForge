import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { acceptInvitation, changePassword, checkAccountToken, resetPassword, revokeSessions } from "../../services/authApi.js";
import { dashboardForRole } from "../../hooks/useAuth.js";
import { Card } from "./Shared.jsx";

export function AccountLifecycleView({ mode, token, currentUser, onAuthenticated, navigateTo }) {
  const purpose = mode === "accept-invitation" ? "initial_password" : "password_reset";
  const [validating, setValidating] = useState(mode !== "account-security");
  const [valid, setValid] = useState(mode === "account-security");
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (mode === "account-security") return;
    checkAccountToken(token, purpose).then(() => setValid(true)).catch((error) => setMessage(error.message)).finally(() => setValidating(false));
    if (typeof window !== "undefined") window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#/${mode}`);
  }, [mode, purpose, token]);

  const submit = async (event) => {
    event.preventDefault(); setSubmitting(true); setMessage("");
    try {
      let result;
      if (mode === "accept-invitation") result = await acceptInvitation(token, password);
      else if (mode === "reset-password") result = await resetPassword(token, password);
      else result = await changePassword(currentPassword, password);
      if (result?.user) onAuthenticated?.(result.user);
      setMessage("Password saved. Your other sessions were signed out.");
      window.setTimeout(() => navigateTo(dashboardForRole(result?.user?.role || currentUser?.role)), 700);
    } catch (error) { setMessage(error.message); } finally { setSubmitting(false); }
  };

  if (mode === "account-security" && !currentUser) return <main className="route-fallback-screen"><Card><p>Sign in before changing account security settings.</p></Card></main>;
  return <main className="role-screen auth-screen"><Card className="auth-panel priority-panel"><div className="auth-copy"><ShieldCheck size={28}/><h1>{mode === "accept-invitation" ? "Accept invitation" : mode === "reset-password" ? "Reset password" : "Account security"}</h1><p>Passwords require at least 10 characters. Saving revokes older sessions and account links.</p></div><div className="auth-form-shell">
    {validating && <div className="inline-status">Checking this secure link…</div>}
    {message && <div className={`inline-status ${valid ? "success" : "warning"}`}>{message}</div>}
    {valid && <form className="auth-form" onSubmit={submit}>{mode === "account-security" && <label>Current password<input type="password" value={currentPassword} onChange={(e)=>setCurrentPassword(e.target.value)} required /></label>}<label>New password<input type="password" minLength={10} value={password} onChange={(e)=>setPassword(e.target.value)} required /></label><button className="primary-action" disabled={submitting}><KeyRound size={17}/>{submitting ? "Saving…" : "Save password"}</button></form>}
    {mode === "account-security" && <button className="secondary-action" type="button" onClick={async()=>{await revokeSessions();setMessage("Other sessions were signed out.");}}>Sign out other sessions</button>}
  </div></Card></main>;
}
