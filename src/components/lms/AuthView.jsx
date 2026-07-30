import { useEffect, useState } from "react";
import { ArrowLeft, KeyRound, LogIn, School, ShieldCheck, TicketCheck } from "lucide-react";
import {
  passwordPolicyGuidance,
  passwordPolicyMaximumLength,
  passwordPolicyMinimumLength,
} from "../../config/passwordPolicy.js";
import { dashboardForRole } from "../../hooks/useAuth.js";
import { requestPasswordReset } from "../../services/authApi.js";
import { Card, Tag } from "./Shared.jsx";

const roleConfig = {
  admin: {
    title: "School Admin access",
    tag: "School rollout access",
    signinTitle: "Sign in as School Admin",
    joinTitle: "Account access",
    primaryRoute: "admin",
    copy: "School admins manage their Hamilton House demo profile, teachers, students, book activation codes, and Ultimate B2 rollout.",
  },
  teacher: {
    title: "Teacher access",
    tag: "Teacher workspace access",
    signinTitle: "Sign in as Teacher",
    joinTitle: "Create account",
    primaryRoute: "teacher",
    copy: "Teachers are invited by the school, then assign Ultimate B2 book exercises, author interactive activities, and review student results.",
  },
  student: {
    title: "Student access",
    tag: "Learner portal access",
    signinTitle: "Sign in as Student",
    joinTitle: "Create account",
    primaryRoute: "student",
    copy: "Students join through their school class invite, then activate book access securely from their signed-in portal.",
  },
};

const initialSignin = {
  email: "",
  password: "",
};

const initialStudentJoin = {
  classCode: "ULTIMATE-B2-A",
  studentName: "Anna Georgiou",
  email: "",
  password: "",
};

function roleLabel(role) {
  const normalized = String(role ?? "").toLowerCase();
  if (normalized === "admin") return "School Admin";
  return normalized ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : "User";
}

function getPendingInviteRoute() {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem("pendingClassInviteHash") || "";
}

function consumePendingInviteRoute() {
  const route = getPendingInviteRoute();
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem("pendingClassInviteHash");
    window.sessionStorage.removeItem("pendingStudentAuthTab");
  }
  return route;
}

function pendingInviteCode() {
  const route = getPendingInviteRoute();
  return route.startsWith("join-class/") ? route.slice("join-class/".length) : "";
}

export function AuthView({
  role = "admin",
  navigateTo,
  currentUser,
  authLoading,
  authError,
  setAuthError,
  signIn,
  createStudentAccount,
  signOut,
}) {
  const config = roleConfig[role] ?? roleConfig.admin;
  const [activeTab, setActiveTab] = useState("signin");
  const [signinForm, setSigninForm] = useState(initialSignin);
  const [studentJoin, setStudentJoin] = useState(initialStudentJoin);
  const [submitting, setSubmitting] = useState(false);
  const [localStatus, setLocalStatus] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");

  const clearMessages = () => {
    setAuthError("");
    setLocalStatus("");
  };

  useEffect(() => {
    if (role !== "student" || typeof window === "undefined") return;
    const pendingTab = window.sessionStorage.getItem("pendingStudentAuthTab");
    if (pendingTab === "signin" || pendingTab === "join") setActiveTab(pendingTab);
  }, [role]);

  const handleSignin = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    clearMessages();

    try {
      await signIn(signinForm);
      const pendingInvite = role === "student" ? consumePendingInviteRoute() : "";
      navigateTo(pendingInvite || config.primaryRoute);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStudentJoin = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    clearMessages();
    try {
      const result = await createStudentAccount({
        fullName: studentJoin.studentName,
        email: studentJoin.email,
        password: studentJoin.password,
        classCode: pendingInviteCode() || studentJoin.classCode,
      });
      const pendingInvite = role === "student" ? consumePendingInviteRoute() : "";
      navigateTo(pendingInvite || "student");
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgot = async (event) => {
    event.preventDefault(); setSubmitting(true); clearMessages();
    try { const result = await requestPasswordReset(forgotEmail); setLocalStatus(result.message); }
    catch (error) { setAuthError(error.message); }
    finally { setSubmitting(false); }
  };

  return (
    <main className="role-screen auth-screen">
      <button className="secondary-action compact-action auth-back-button" onClick={() => navigateTo("home")} type="button">
        <ArrowLeft size={17} /> Back to role selection
      </button>

      <Card className="auth-panel priority-panel">
        <div className="auth-copy">
          <Tag tone="gold">{config.tag}</Tag>
          <h1>{config.title}</h1>
          <p>{config.copy}</p>
          <div className="demo-login-note"><ShieldCheck size={16} /> Sign in requires a verified active account</div>

          {currentUser && (
            <div className="signed-in-panel">
              <ShieldCheck size={18} />
              <div>
                <strong>{currentUser.full_name} ({roleLabel(currentUser.role)})</strong>
                <span>{currentUser.email}</span>
              </div>
              <button className="secondary-action compact-action" onClick={() => navigateTo(dashboardForRole(currentUser.role))}>Open dashboard</button>
              <button className="secondary-action compact-action" onClick={signOut}>Log out and reset progress</button>
            </div>
          )}
        </div>

        <div className="auth-form-shell">
          <div className="auth-tabs" role="tablist" aria-label={`${config.title} options`}>
            <button className={activeTab === "signin" ? "selected" : ""} onClick={() => { setActiveTab("signin"); clearMessages(); }} type="button">
              <LogIn size={16} /> Sign in
            </button>
            <button className={activeTab === "join" ? "selected" : ""} onClick={() => { setActiveTab("join"); clearMessages(); }} type="button">
              {role === "admin" ? <School size={16} /> : <TicketCheck size={16} />} {config.joinTitle}
            </button>
          </div>

          {authLoading && <div className="inline-status">Checking current session...</div>}
          {authError && <div className="inline-status warning">{authError}</div>}
          {localStatus && <div className="inline-status success">{localStatus}</div>}

          {activeTab === "signin" && (
            <form className="auth-form" onSubmit={handleSignin}>
              <label>
                {role === "student" ? "Email or username" : "Email"}
                <input
                  type={role === "student" ? "text" : "email"}
                  value={signinForm.email}
                  onChange={(event) => setSigninForm({ ...signinForm, email: event.target.value })}
                  placeholder={role === "student" ? "student@example.com or username" : `${role}@example.com`}
                />
              </label>
              <label>
                Password
                <input type="password" autoComplete="current-password" value={signinForm.password} onChange={(event) => setSigninForm({ ...signinForm, password: event.target.value })} placeholder="Enter your password" />
              </label>
              <button className="primary-action" disabled={submitting} type="submit"><KeyRound size={17} /> {submitting ? "Signing in..." : "Sign in"}</button>
              <button className="secondary-action" type="button" onClick={() => { setForgotEmail(signinForm.email); setActiveTab("forgot"); clearMessages(); }}>Forgot password?</button>
            </form>
          )}

          {activeTab === "forgot" && <form className="auth-form" onSubmit={handleForgot}><label>Email<input type="email" value={forgotEmail} onChange={(event)=>setForgotEmail(event.target.value)} required /></label><button className="primary-action" disabled={submitting}><KeyRound size={17}/>{submitting ? "Sending…" : "Send reset instructions"}</button><button className="secondary-action" type="button" onClick={()=>setActiveTab("signin")}>Back to sign in</button></form>}

          {activeTab === "join" && role === "admin" && (
            <div className="inline-status">
              School administrator accounts are provisioned by the publisher. Use the invitation email you received or sign in with your active account.
            </div>
          )}

          {activeTab === "join" && role === "teacher" && (
            <div className="inline-status">Teacher accounts are created and activated by a school administrator. Use Sign in after receiving your credentials.</div>
          )}

          {activeTab === "join" && role === "student" && (
            <form className="auth-form" onSubmit={handleStudentJoin}>
              <label>
                Class code
                <input value={studentJoin.classCode} onChange={(event) => setStudentJoin({ ...studentJoin, classCode: event.target.value })} />
              </label>
              <label>
                Student name
                <input value={studentJoin.studentName} onChange={(event) => setStudentJoin({ ...studentJoin, studentName: event.target.value })} placeholder="Anna Georgiou" />
              </label>
              <label>
                Email
                <input type="email" value={studentJoin.email} onChange={(event) => setStudentJoin({ ...studentJoin, email: event.target.value })} placeholder="student@example.com" />
              </label>
              <label>
                Password
                <input
                  id="student-new-password"
                  type="password"
                  minLength={passwordPolicyMinimumLength}
                  maxLength={passwordPolicyMaximumLength}
                  autoComplete="new-password"
                  aria-describedby="student-new-password-guidance"
                  value={studentJoin.password}
                  onChange={(event) => setStudentJoin({ ...studentJoin, password: event.target.value })}
                  placeholder="Create a password"
                />
              </label>
              <p className="form-hint" id="student-new-password-guidance">{passwordPolicyGuidance}</p>
              <button className="primary-action" disabled={submitting} type="submit"><TicketCheck size={17} /> {submitting ? "Creating..." : "Create account"}</button>
            </form>
          )}

        </div>
      </Card>
    </main>
  );
}
