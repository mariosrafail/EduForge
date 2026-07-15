import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { acceptInvitation, changePassword, checkAccountToken, resetPassword, revokeSessions } from "../../services/authApi.js";
import { dashboardForRole } from "../../hooks/useAuth.js";
import { Card } from "./Shared.jsx";
import { passwordsMatch } from "../../utils/accountLifecycle.js";

export function AccountLifecycleView({ mode, token, currentUser, onAuthenticated, onSignOut, navigateTo }) {
  const purpose = mode === "accept-invitation" ? "initial_password" : "password_reset";
  const [secureToken] = useState(() => {
    const value = token || "";
    if (mode !== "account-security" && typeof window !== "undefined") {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#/${mode}`);
    }
    return value;
  });
  const [validating, setValidating] = useState(mode !== "account-security");
  const [valid, setValid] = useState(mode === "account-security");
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  useEffect(() => {
    if (mode === "account-security") return;
    checkAccountToken(secureToken, purpose)
      .then(() => setValid(true))
      .catch((error) => setMessage(error.message || "This link is invalid or has expired"))
      .finally(() => setValidating(false));
  }, [mode, purpose, secureToken]);

  const submit = async (event) => {
    event.preventDefault();
    if (!passwordsMatch(password, confirmPassword)) { setMessage("Passwords do not match."); return; }
    setSubmitting(true); setMessage("");
    try {
      let result;
      if (mode === "accept-invitation") result = await acceptInvitation(secureToken, password);
      else if (mode === "reset-password") result = await resetPassword(secureToken, password);
      else result = await changePassword(currentPassword, password);
      if (result?.user) onAuthenticated?.(result.user);
      setSucceeded(true);
      setMessage("Password saved. Your other sessions were signed out.");
      window.setTimeout(() => navigateTo(dashboardForRole(result?.user?.role || currentUser?.role)), 700);
    } catch (error) {
      setSucceeded(false); setMessage(error.message || "The password could not be saved. Check your connection and try again.");
    } finally { setSubmitting(false); }
  };

  const handleRevoke = async () => {
    setRevoking(true); setMessage("");
    try {
      await revokeSessions(); setSucceeded(true); setMessage("Other sessions were signed out. This session remains active.");
    } catch (error) {
      setSucceeded(false); setMessage(error.message || "Session revocation failed. Please sign out.");
    } finally { setRevoking(false); }
  };

  if (mode === "account-security" && !currentUser) return <main className="route-fallback-screen"><Card><p>Your session is missing or expired. Sign in again to manage account security.</p></Card></main>;
  return <main className="role-screen auth-screen"><Card className="auth-panel priority-panel"><div className="auth-copy"><ShieldCheck size={28}/><h1>{mode === "accept-invitation" ? "Accept invitation" : mode === "reset-password" ? "Reset password" : "Account security"}</h1><p>Saving a password revokes older sessions and account links.</p></div><div className="auth-form-shell">
    {validating && <div className="inline-status">Checking this secure link…</div>}
    {message && <div className={`inline-status ${succeeded ? "success" : "warning"}`}>{message}</div>}
    {valid && !succeeded && <form className="auth-form" onSubmit={submit}>
      {mode === "account-security" && <label>Current password<input type={showPasswords ? "text" : "password"} value={currentPassword} onChange={(event)=>setCurrentPassword(event.target.value)} required /></label>}
      <label>New password<input type={showPasswords ? "text" : "password"} minLength={10} maxLength={128} value={password} onChange={(event)=>setPassword(event.target.value)} required /></label>
      <label>Confirm new password<input type={showPasswords ? "text" : "password"} minLength={10} maxLength={128} value={confirmPassword} onChange={(event)=>setConfirmPassword(event.target.value)} required /></label>
      <p className="form-hint">Use 10–128 characters. Do not use your email or a documented demo password.</p>
      <button className="secondary-action compact-action" type="button" onClick={()=>setShowPasswords((value)=>!value)}>{showPasswords ? <EyeOff size={16}/> : <Eye size={16}/>} {showPasswords ? "Hide passwords" : "Show passwords"}</button>
      <button className="primary-action" disabled={submitting || !passwordsMatch(password, confirmPassword)}><KeyRound size={17}/>{submitting ? "Saving…" : "Save password"}</button>
    </form>}
    {mode === "account-security" && <button className="secondary-action" disabled={revoking} type="button" onClick={handleRevoke}>{revoking ? "Signing out other sessions…" : "Sign out other sessions"}</button>}
    {mode === "account-security" && message && !succeeded && <button className="danger-action" type="button" onClick={onSignOut}>Sign out now</button>}
  </div></Card></main>;
}
