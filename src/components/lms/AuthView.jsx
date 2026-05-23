import { useState } from "react";
import { KeyRound, LogIn, School, ShieldCheck } from "lucide-react";
import { dashboardForRole } from "../../hooks/useAuth.js";
import { Card, Tag } from "./Shared.jsx";
import { RoleSelection } from "./RoleSelection.jsx";

const initialSignin = {
  email: "",
  password: "",
};

const initialSignup = {
  schoolName: "Hamilton House ELT Demo School",
  adminName: "",
  email: "",
  password: "",
};

function roleLabel(role) {
  const normalized = String(role ?? "").toLowerCase();
  return normalized ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : "User";
}

export function AuthView({ navigateTo, brand, currentUser, authLoading, authError, setAuthError, signIn, createSchoolAccount, signOut }) {
  const [activeTab, setActiveTab] = useState("signin");
  const [signinForm, setSigninForm] = useState(initialSignin);
  const [signupForm, setSignupForm] = useState(initialSignup);
  const [submitting, setSubmitting] = useState(false);

  const handleSignin = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setAuthError("");

    try {
      const user = await signIn(signinForm);
      navigateTo(dashboardForRole(user.role));
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignup = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setAuthError("");

    try {
      await createSchoolAccount(signupForm);
      navigateTo("admin");
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <main className="role-screen auth-screen">
        <Card className="auth-panel priority-panel">
          <div className="auth-copy">
            <Tag tone="gold">Hamilton House account access</Tag>
            <h1>Sign in or create a school account.</h1>
            <p>
              Demo/MVP authentication uses Neon-backed school and user records. Demo mode remains available without real login for presentations.
            </p>
            {currentUser && (
              <div className="signed-in-panel">
                <ShieldCheck size={18} />
                <div>
                  <strong>Signed in as {currentUser.full_name}</strong>
                  <span>{roleLabel(currentUser.role)} / {currentUser.email}</span>
                </div>
                <button className="secondary-action compact-action" onClick={() => navigateTo(dashboardForRole(currentUser.role))}>Open dashboard</button>
                <button className="secondary-action compact-action" onClick={signOut}>Logout</button>
              </div>
            )}
          </div>

          <div className="auth-form-shell">
            <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
              <button className={activeTab === "signin" ? "selected" : ""} onClick={() => setActiveTab("signin")} type="button"><LogIn size={16} /> Sign in</button>
              <button className={activeTab === "signup" ? "selected" : ""} onClick={() => setActiveTab("signup")} type="button"><School size={16} /> Create school account</button>
            </div>

            {authLoading && <div className="inline-status">Checking current session...</div>}
            {authError && <div className="inline-status warning">{authError}</div>}

            {activeTab === "signin" ? (
              <form className="auth-form" onSubmit={handleSignin}>
                <label>
                  Email
                  <input type="email" value={signinForm.email} onChange={(event) => setSigninForm({ ...signinForm, email: event.target.value })} placeholder="admin@example.com" />
                </label>
                <label>
                  Password
                  <input type="password" value={signinForm.password} onChange={(event) => setSigninForm({ ...signinForm, password: event.target.value })} placeholder="Minimum 8 characters" />
                </label>
                <button className="primary-action" disabled={submitting} type="submit"><KeyRound size={17} /> {submitting ? "Signing in..." : "Sign in"}</button>
              </form>
            ) : (
              <form className="auth-form" onSubmit={handleSignup}>
                <label>
                  School name
                  <input value={signupForm.schoolName} onChange={(event) => setSignupForm({ ...signupForm, schoolName: event.target.value })} />
                </label>
                <label>
                  Admin full name
                  <input value={signupForm.adminName} onChange={(event) => setSignupForm({ ...signupForm, adminName: event.target.value })} placeholder="Sofia Laskari" />
                </label>
                <label>
                  Email
                  <input type="email" value={signupForm.email} onChange={(event) => setSignupForm({ ...signupForm, email: event.target.value })} placeholder="admin@example.com" />
                </label>
                <label>
                  Password
                  <input type="password" value={signupForm.password} onChange={(event) => setSignupForm({ ...signupForm, password: event.target.value })} placeholder="Minimum 8 characters" />
                </label>
                <button className="primary-action" disabled={submitting} type="submit"><School size={17} /> {submitting ? "Creating..." : "Create school account"}</button>
              </form>
            )}

            <div className="demo-mode-note">
              <KeyRound size={16} />
              <span>Demo mode is available without real login.</span>
            </div>
          </div>
        </Card>
      </main>

      <RoleSelection navigateTo={navigateTo} brand={brand} />
    </>
  );
}
