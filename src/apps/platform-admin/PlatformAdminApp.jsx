import React, { useCallback, useEffect, useState } from "react";
import { platformApi, platformAuth } from "./platformAdminApi.js";

const sections = [
  ["overview", "Overview"],
  ["schools", "Schools"],
  ["users", "Users"],
  ["classes", "Classes"],
  ["access", "Book access"],
  ["audit", "Audit log"],
];

function initialSection() {
  const segment = location.pathname.replace(/^\/platform-admin\/?/, "").split("/")[0];
  return sections.some(([key]) => key === segment) ? segment : "overview";
}

function Login({ onAuthenticated }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = await platformAuth.login({ email, password });
      setPassword("");
      onAuthenticated(payload.platformAdmin);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="pa-login-shell">
      <section className="pa-login-card" aria-labelledby="pa-login-title">
        <p className="pa-eyebrow">Restricted operator control plane</p>
        <h1 id="pa-login-title">EduForge Platform Administration</h1>
        <p>This area uses a dedicated privileged account and session.</p>
        <form onSubmit={submit}>
          <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
          {error && <p className="pa-error" role="alert">{error}</p>}
          <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
      </section>
    </main>
  );
}

function Status({ value }) {
  return <span className={`pa-status pa-status-${value}`}>{value}</span>;
}

function Overview({ data }) {
  const labels = {
    schools: "Schools", activeSchools: "Active schools", pausedSchools: "Paused schools",
    schoolAdmins: "School Admins", teachers: "Teachers", students: "Students",
    classes: "Classes", activePhaseOnePackages: "Active Phase 1 packages",
    activeAssignments: "Active assignments", awaitingReview: "Awaiting review",
  };
  return <div className="pa-metrics">{Object.entries(labels).map(([key, label]) => <article key={key}><strong>{data?.[key] ?? "—"}</strong><span>{label}</span></article>)}</div>;
}

function Schools({ schools, reload, selectSchool }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  async function create(event) {
    event.preventDefault();
    setError("");
    try {
      await platformApi.mutate("create-school", { name });
      setName("");
      await reload();
    } catch (nextError) { setError(nextError.message); }
  }
  async function toggle(school) {
    await platformApi.mutate("school-status", { id: school.id, status: school.status === "active" ? "paused" : "active" });
    await reload();
  }
  return (
    <>
      <form className="pa-inline-form" onSubmit={create}>
        <label>New school name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <button>Create school</button>{error && <span className="pa-error">{error}</span>}
      </form>
      <div className="pa-table-wrap"><table><thead><tr><th>School</th><th>Status</th><th>Admins</th><th>Teachers</th><th>Students</th><th>Classes</th><th>Created</th><th>Actions</th></tr></thead>
        <tbody>{schools.map((school) => <tr key={school.id}><td><button className="pa-link-button" onClick={() => selectSchool(school)}>{school.name}</button></td><td><Status value={school.status} /></td><td>{school.admin_count}</td><td>{school.teacher_count}</td><td>{school.student_count}</td><td>{school.class_count}</td><td>{new Date(school.created_at).toLocaleDateString()}</td><td><button className="pa-secondary" onClick={() => toggle(school)}>{school.status === "active" ? "Pause" : "Reactivate"}</button></td></tr>)}</tbody>
      </table></div>
    </>
  );
}

function SchoolDetail({ school, close, refresh }) {
  const [form, setForm] = useState({ full_name: "", email: "", role: "admin", level: "" });
  const [branding, setBranding] = useState({
    name: school.name,
    logo: school.logo || "",
    primary_color: school.primary_color || "#1d4ed8",
    secondary_color: school.secondary_color || "#0f172a",
  });
  const [message, setMessage] = useState("");
  async function saveSchool(event) {
    event.preventDefault();
    setMessage("");
    try {
      await platformApi.mutate("update-school", { id: school.id, ...branding });
      setMessage("School details updated.");
      await refresh();
    } catch (error) { setMessage(error.message); }
  }
  async function invite(event) {
    event.preventDefault();
    setMessage("");
    try {
      const result = await platformApi.mutate("create-user", { ...form, school_id: school.id });
      setMessage(`Invitation created (${result.delivery_status}).`);
      setForm({ full_name: "", email: "", role: "admin", level: "" });
      await refresh();
    } catch (error) { setMessage(error.message); }
  }
  return (
    <aside className="pa-detail">
      <button className="pa-link-button" onClick={close}>← All schools</button>
      <h3>{school.name}</h3><Status value={school.status} />
      <p>{school.admin_count} admins · {school.teacher_count} teachers · {school.student_count} students · {school.class_count} classes</p>
      <h4>School details</h4>
      <form onSubmit={saveSchool} className="pa-form-grid">
        <label>Name<input value={branding.name} onChange={(event) => setBranding({ ...branding, name: event.target.value })} required /></label>
        <label>Logo label<input value={branding.logo} onChange={(event) => setBranding({ ...branding, logo: event.target.value })} /></label>
        <label>Primary color<input type="color" value={branding.primary_color} onChange={(event) => setBranding({ ...branding, primary_color: event.target.value })} /></label>
        <label>Secondary color<input type="color" value={branding.secondary_color} onChange={(event) => setBranding({ ...branding, secondary_color: event.target.value })} /></label>
        <button>Save details</button>
      </form>
      <h4>Invite an ordinary account</h4>
      <form onSubmit={invite} className="pa-form-grid">
        <label>Full name<input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} required /></label>
        <label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
        <label>Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="admin">School Admin</option><option value="teacher">Teacher</option><option value="student">Student</option></select></label>
        <label>Level<input value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })} /></label>
        <button>Send invitation</button>
      </form>
      {message && <p role="status">{message}</p>}
    </aside>
  );
}

function Users({ users, schools, reload }) {
  const [filters, setFilters] = useState({ schoolId: "", role: "", status: "", search: "" });
  const [selected, setSelected] = useState(null);
  async function changeStatus(user, status) {
    await platformApi.mutate("user-status", { id: user.id, status });
    await reload(filters);
  }
  async function revoke(user) {
    await platformApi.mutate("revoke-user-sessions", { id: user.id });
  }
  async function open(user) {
    const payload = await platformApi.get("user", { id: user.id });
    setSelected(payload.user);
  }
  return (
    <>
      <div className="pa-filters">
        <input aria-label="Search users" placeholder="Search name or email" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
        <select aria-label="Filter school" value={filters.schoolId} onChange={(event) => setFilters({ ...filters, schoolId: event.target.value })}><option value="">All schools</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select>
        <select aria-label="Filter role" value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value })}><option value="">All roles</option><option value="admin">School Admin</option><option value="teacher">Teacher</option><option value="student">Student</option></select>
        <select aria-label="Filter status" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">All statuses</option><option value="active">Active</option><option value="invited">Invited</option><option value="paused">Paused</option></select>
        <button onClick={() => reload(filters)}>Apply</button>
      </div>
      <div className="pa-table-wrap"><table><thead><tr><th>User</th><th>School</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {users.map((user) => <tr key={user.id}><td>{user.full_name}<small>{user.email}</small></td><td>{user.school_name}</td><td>{user.role === "admin" ? "School Admin" : user.role}</td><td><Status value={user.status} /></td><td className="pa-actions"><button className="pa-secondary" onClick={() => open(user)}>View</button><button className="pa-secondary" onClick={() => changeStatus(user, user.status === "paused" ? "active" : "paused")}>{user.status === "paused" ? "Reactivate" : "Pause"}</button><button className="pa-secondary" onClick={() => revoke(user)}>Revoke sessions</button></td></tr>)}
      </tbody></table></div>
      {selected && <aside className="pa-detail">
        <button className="pa-link-button" onClick={() => setSelected(null)}>← All users</button>
        <h3>{selected.full_name}</h3>
        <p>{selected.email}</p>
        <dl><dt>School</dt><dd>{selected.school_name}</dd><dt>Role</dt><dd>{selected.role === "admin" ? "School Admin" : selected.role}</dd><dt>Status</dt><dd><Status value={selected.status} /></dd><dt>Level</dt><dd>{selected.level || "—"}</dd><dt>Created</dt><dd>{new Date(selected.created_at).toLocaleString()}</dd></dl>
      </aside>}
    </>
  );
}

function Classes({ rows }) {
  return <div className="pa-table-wrap"><table><thead><tr><th>Class</th><th>School</th><th>Level</th><th>Teacher</th><th>Active students</th><th>Assignments</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.school_name}</td><td>{row.level}</td><td>{row.teacher_name || "Unassigned"}</td><td>{row.active_student_count}</td><td>{row.assignment_count}</td></tr>)}</tbody></table></div>;
}

function Access({ data, users, reload }) {
  const [userId, setUserId] = useState("");
  const [slug, setSlug] = useState("ultimate-b2");
  async function mutate(mode) {
    if (!userId) return;
    await platformApi.mutate("package-access", { mode, user_id: userId, package_slug: slug });
    await reload();
  }
  return (
    <>
      <div className="pa-filters"><select aria-label="Access user" value={userId} onChange={(event) => setUserId(event.target.value)}><option value="">Select user</option>{users.map((user) => <option key={user.id} value={user.id}>{user.full_name} — {user.school_name}</option>)}</select><select aria-label="Package" value={slug} onChange={(event) => setSlug(event.target.value)}>{data.packages?.map((item) => <option key={item.id} value={item.slug}>{item.title}</option>)}</select><button onClick={() => mutate("grant")}>Grant</button><button className="pa-secondary" onClick={() => mutate("revoke")}>Revoke</button></div>
      <div className="pa-table-wrap"><table><thead><tr><th>User</th><th>School</th><th>Role</th><th>Package</th><th>Granted</th></tr></thead><tbody>{data.access?.map((row) => <tr key={row.id}><td>{row.full_name}<small>{row.email}</small></td><td>{row.school_name}</td><td>{row.role_scope}</td><td>{row.package_title}</td><td>{new Date(row.granted_at).toLocaleDateString()}</td></tr>)}</tbody></table></div>
    </>
  );
}

function Audit({ data, schools, reload }) {
  const [filters, setFilters] = useState({ platformAdminId: "", auditAction: "", targetType: "", schoolId: "", from: "", to: "" });
  return <>
    <div className="pa-filters">
      <select aria-label="Filter Platform Admin" value={filters.platformAdminId} onChange={(event) => setFilters({ ...filters, platformAdminId: event.target.value })}><option value="">All Platform Admins</option>{data.platformAdmins?.map((admin) => <option key={admin.id} value={admin.id}>{admin.full_name}</option>)}</select>
      <input aria-label="Filter audit action" placeholder="Action" value={filters.auditAction} onChange={(event) => setFilters({ ...filters, auditAction: event.target.value })} />
      <select aria-label="Filter target type" value={filters.targetType} onChange={(event) => setFilters({ ...filters, targetType: event.target.value })}><option value="">All targets</option><option value="school">School</option><option value="ordinary_user">Ordinary user</option><option value="platform_admin">Platform Admin</option><option value="session">Session</option></select>
      <select aria-label="Filter audit school" value={filters.schoolId} onChange={(event) => setFilters({ ...filters, schoolId: event.target.value })}><option value="">All schools</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select>
      <label>From<input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
      <label>To<input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
      <button onClick={() => reload(filters)}>Apply</button>
    </div>
    <div className="pa-table-wrap"><table><thead><tr><th>Time</th><th>Platform Admin</th><th>Action</th><th>Target</th><th>School</th><th>Metadata</th></tr></thead><tbody>{data.audit?.map((row) => <tr key={row.id}><td>{new Date(row.created_at).toLocaleString()}</td><td>{row.platform_admin_name || "Removed account"}</td><td>{row.action}</td><td>{row.target_type}{row.target_id ? ` · ${row.target_id}` : ""}</td><td>{row.school_name || "—"}</td><td><code>{JSON.stringify(row.metadata)}</code></td></tr>)}</tbody></table></div>
  </>;
}

export default function PlatformAdminApp() {
  const [admin, setAdmin] = useState(null);
  const [checking, setChecking] = useState(true);
  const [section, setSection] = useState(initialSection);
  const [data, setData] = useState({});
  const [error, setError] = useState("");
  const [selectedSchool, setSelectedSchool] = useState(null);

  useEffect(() => { platformAuth.me().then((payload) => setAdmin(payload.platformAdmin)).catch(() => {}).finally(() => setChecking(false)); }, []);
  const load = useCallback(async (target = section, filters = {}) => {
    setError("");
    try {
      const [payload, schoolPayload, userPayload] = await Promise.all([
        platformApi.get(target, filters),
        ["users", "access", "audit"].includes(target) ? platformApi.get("schools", { pageSize: 100 }) : Promise.resolve(null),
        target === "access" ? platformApi.get("users", { pageSize: 100 }) : Promise.resolve(null),
      ]);
      setData((current) => ({
        ...current,
        [target]: payload,
        accessUsers: userPayload?.users || current.accessUsers || [],
        schoolsForFilters: schoolPayload?.schools || current.schoolsForFilters || [],
      }));
    } catch (nextError) {
      if (nextError.status === 401) setAdmin(null);
      else setError(nextError.message);
    }
  }, [section]);
  useEffect(() => { if (admin) load(section); }, [admin, section, load]);
  const navigate = (next) => {
    setSection(next); setSelectedSchool(null);
    history.pushState({}, "", `/platform-admin/${next}`);
  };
  const users = data.users?.users || [];

  if (checking) return <main className="pa-loading">Checking privileged session…</main>;
  if (!admin) return <Login onAuthenticated={setAdmin} />;
  return (
    <div className="pa-shell">
      <header><div><p className="pa-eyebrow">Privileged area</p><h1>EduForge Platform Administration</h1></div><div className="pa-identity"><span>{admin.full_name}</span><button className="pa-secondary" onClick={async () => { await platformAuth.logout(); setAdmin(null); }}>Sign out</button></div></header>
      <nav aria-label="Platform Administration">{sections.map(([key, label]) => <button key={key} aria-current={section === key ? "page" : undefined} onClick={() => navigate(key)}>{label}</button>)}</nav>
      <main><div className="pa-heading"><div><p>Cross-platform operations</p><h2>{sections.find(([key]) => key === section)?.[1]}</h2></div><button className="pa-secondary" onClick={() => load(section)}>Refresh</button></div>
        {error && <p className="pa-error" role="alert">{error}</p>}
        {section === "overview" && <Overview data={data.overview?.overview} />}
        {section === "schools" && (selectedSchool ? <SchoolDetail school={selectedSchool} close={() => setSelectedSchool(null)} refresh={() => load("schools")} /> : <Schools schools={data.schools?.schools || []} reload={() => load("schools")} selectSchool={setSelectedSchool} />)}
        {section === "users" && <Users users={users} schools={data.schoolsForFilters || []} reload={(filters) => load("users", filters)} />}
        {section === "classes" && <Classes rows={data.classes?.classes || []} />}
        {section === "access" && <Access data={data.access || {}} users={data.accessUsers || []} reload={() => load("access")} />}
        {section === "audit" && <Audit data={data.audit || {}} schools={data.schoolsForFilters || []} reload={(filters) => load("audit", filters)} />}
      </main>
    </div>
  );
}
