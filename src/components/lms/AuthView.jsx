import { useState } from "react";
import { ArrowLeft, KeyRound, LogIn, School, ShieldCheck, TicketCheck, UserPlus } from "lucide-react";
import { dashboardForRole } from "../../hooks/useAuth.js";
import { Card, Tag } from "./Shared.jsx";

const roleConfig = {
  admin: {
    title: "Enter as School / Admin",
    tag: "School rollout access",
    signinTitle: "Sign in as School Admin",
    joinTitle: "Create school account",
    primaryRoute: "admin",
    copy: "School admins can create the school workspace, manage teachers and students, generate book activation codes, and supervise rollout.",
  },
  teacher: {
    title: "Enter as Teacher",
    tag: "Teacher workspace access",
    signinTitle: "Sign in as Teacher",
    joinTitle: "Join with invitation code",
    primaryRoute: "teacher",
    copy: "Teachers are invited by a school, then assign book-based practice, author interactive activities, and review student submissions.",
  },
  student: {
    title: "Enter as Student",
    tag: "Learner portal access",
    signinTitle: "Sign in as Student",
    joinTitle: "Join with class/book code",
    primaryRoute: "student",
    copy: "Students join through their school or book code, complete assigned activities, and receive guided revision feedback.",
  },
};

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

const initialTeacherJoin = {
  invitationCode: "HH-TEACHER-DEMO",
  fullName: "",
  email: "",
  password: "",
};

const initialStudentJoin = {
  classCode: "B1-JUNIOR-A",
  bookCode: "B1-DEMO-2026",
  studentName: "",
  email: "",
  password: "",
};

function roleLabel(role) {
  const normalized = String(role ?? "").toLowerCase();
  return normalized ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : "User";
}

function redirectAfterDemo(navigateTo, route) {
  window.setTimeout(() => navigateTo(route), 450);
}

export function AuthView({
  role = "admin",
  navigateTo,
  currentUser,
  authLoading,
  authError,
  setAuthError,
  signIn,
  createSchoolAccount,
  signOut,
}) {
  const config = roleConfig[role] ?? roleConfig.admin;
  const [activeTab, setActiveTab] = useState("signin");
  const [signinForm, setSigninForm] = useState(initialSignin);
  const [signupForm, setSignupForm] = useState(initialSignup);
  const [teacherJoin, setTeacherJoin] = useState(initialTeacherJoin);
  const [studentJoin, setStudentJoin] = useState(initialStudentJoin);
  const [submitting, setSubmitting] = useState(false);
  const [localStatus, setLocalStatus] = useState("");

  const clearMessages = () => {
    setAuthError("");
    setLocalStatus("");
  };

  const handleSignin = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    clearMessages();

    try {
      await signIn(signinForm);
      navigateTo(config.primaryRoute);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdminSignup = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    clearMessages();

    try {
      await createSchoolAccount(signupForm);
      navigateTo("admin");
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTeacherJoin = (event) => {
    event.preventDefault();
    clearMessages();
    setLocalStatus("Invitation accepted for demo. Opening the teacher workspace...");
    redirectAfterDemo(navigateTo, "teacher");
  };

  const handleStudentJoin = (event) => {
    event.preventDefault();
    clearMessages();
    setLocalStatus("Class and book codes accepted for demo. Opening the learner portal...");
    redirectAfterDemo(navigateTo, "student");
  };

  const continueDemo = () => {
    clearMessages();
    setLocalStatus("Demo mode confirmed. Opening dashboard...");
    redirectAfterDemo(navigateTo, config.primaryRoute);
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
          <div className="demo-login-note"><KeyRound size={16} /> Demo mode available without real login</div>

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
          <div className="auth-tabs" role="tablist" aria-label={`${config.title} options`}>
            <button className={activeTab === "signin" ? "selected" : ""} onClick={() => { setActiveTab("signin"); clearMessages(); }} type="button">
              <LogIn size={16} /> {config.signinTitle}
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
                <input type="password" value={signinForm.password} onChange={(event) => setSigninForm({ ...signinForm, password: event.target.value })} placeholder="Minimum 8 characters" />
              </label>
              <button className="primary-action" disabled={submitting} type="submit"><KeyRound size={17} /> {submitting ? "Signing in..." : config.signinTitle}</button>
            </form>
          )}

          {activeTab === "join" && role === "admin" && (
            <form className="auth-form" onSubmit={handleAdminSignup}>
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

          {activeTab === "join" && role === "teacher" && (
            <form className="auth-form" onSubmit={handleTeacherJoin}>
              <label>
                Invitation code
                <input value={teacherJoin.invitationCode} onChange={(event) => setTeacherJoin({ ...teacherJoin, invitationCode: event.target.value })} />
              </label>
              <label>
                Full name
                <input value={teacherJoin.fullName} onChange={(event) => setTeacherJoin({ ...teacherJoin, fullName: event.target.value })} placeholder="Maria Antoniou" />
              </label>
              <label>
                Email
                <input type="email" value={teacherJoin.email} onChange={(event) => setTeacherJoin({ ...teacherJoin, email: event.target.value })} placeholder="teacher@example.com" />
              </label>
              <label>
                Password
                <input type="password" value={teacherJoin.password} onChange={(event) => setTeacherJoin({ ...teacherJoin, password: event.target.value })} placeholder="Minimum 8 characters" />
              </label>
              <button className="primary-action" type="submit"><UserPlus size={17} /> Join teacher workspace</button>
            </form>
          )}

          {activeTab === "join" && role === "student" && (
            <form className="auth-form" onSubmit={handleStudentJoin}>
              <label>
                Class code
                <input value={studentJoin.classCode} onChange={(event) => setStudentJoin({ ...studentJoin, classCode: event.target.value })} />
              </label>
              <label>
                Book activation code
                <input value={studentJoin.bookCode} onChange={(event) => setStudentJoin({ ...studentJoin, bookCode: event.target.value })} />
              </label>
              <label>
                Student name
                <input value={studentJoin.studentName} onChange={(event) => setStudentJoin({ ...studentJoin, studentName: event.target.value })} placeholder="Anna Georgiou" />
              </label>
              <label>
                Optional email for demo
                <input value={studentJoin.email} onChange={(event) => setStudentJoin({ ...studentJoin, email: event.target.value })} placeholder="student@example.com" />
              </label>
              <label>
                Optional password for demo
                <input type="password" value={studentJoin.password} onChange={(event) => setStudentJoin({ ...studentJoin, password: event.target.value })} placeholder="Optional for presentation" />
              </label>
              <button className="primary-action" type="submit"><TicketCheck size={17} /> Join learner portal</button>
            </form>
          )}

          <button className="secondary-action" onClick={continueDemo} type="button">
            <KeyRound size={17} /> Continue in demo mode
          </button>
        </div>
      </Card>
    </main>
  );
}
