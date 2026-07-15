import { BarChart3, BookOpen, Building2, CheckCircle2, Download, KeyRound, Link2, Palette, Plus, UploadCloud, UserPlus, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { brandPresets, cefrLevels, classes, exerciseTypes, integrationOptions, publisherIntelligence, rolloutActions, schoolMetrics } from "../../../data/lmsDemoData.js";
import { getSchoolMetrics } from "../../../services/adminMetricsApi.js";
import { deleteUser as deleteUserRequest, inviteUser, listUsers, revokeUserSessions, roleOptions, roleToDb, statusOptions, updateUser as updateUserRequest } from "../../../services/usersApi.js";
import { Card, MetricCard, PortalPreview, Progress, SectionTitle, Tag } from "../Shared.jsx";
import { AdminInviteLink } from "./AdminInviteLink.jsx";
import { ALLOWED_PRIMARY_COLORS } from "./adminConfig.js";
import { contrastWithWhite } from "./adminColorUtils.js";

export function AdminView({ brand, setBrand, initialSection = "overview", navigateTo }) {
  const [activeAdminSection, setActiveAdminSection] = useState(initialSection);
  const [userCreated, setUserCreated] = useState(false);
  const [bookAdded, setBookAdded] = useState(false);
  const [bookUnlocked, setBookUnlocked] = useState(false);
  const [activationBatchGenerated, setActivationBatchGenerated] = useState(false);
  const [schoolMetricsLive, setSchoolMetricsLive] = useState(null);
  const [schoolMetricsError, setSchoolMetricsError] = useState("");
  const [schoolMetricsLoading, setSchoolMetricsLoading] = useState(false);
  const [activationCode, setActivationCode] = useState("");
  const [exported, setExported] = useState(false);
  const [completedRollout, setCompletedRollout] = useState(["Create school"]);
  const [selectedIntegration, setSelectedIntegration] = useState("");
  const [createdUsers, setCreatedUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState("");
  const [apiFallback, setApiFallback] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [pendingUserAction, setPendingUserAction] = useState("");
  const [userActionStatus, setUserActionStatus] = useState("");
  const [primaryColorWarning, setPrimaryColorWarning] = useState("");
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const sidebarCloseTimerRef = useRef(null);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    role: "Student",
    level: "B2",
    status: "Invited",
  });
  const selectedPrimaryColor = ALLOWED_PRIMARY_COLORS.some((option) => option.value === String(brand.primary || "").toLowerCase())
    ? String(brand.primary).toLowerCase()
    : ALLOWED_PRIMARY_COLORS[0].value;
  const adminSections = [
    { id: "overview", route: "admin", label: "Overview", description: "Metrics and rollout checklist", icon: CheckCircle2 },
    { id: "school-setup", route: "admin-school-setup", label: "School setup", description: "Own school profile and portal identity", icon: Building2 },
    { id: "users", route: "admin-users", label: "Users", description: "Create, import, and manage users", icon: Users },
    { id: "books-classes", route: "admin-books-classes", label: "Books & classes", description: "Assignments, classes, activation", icon: BookOpen },
    { id: "publisher-intelligence", route: "admin-publisher-intelligence", label: "Publisher intelligence", description: "Adoption evidence and exports", icon: BarChart3 },
    { id: "integrations", route: "admin-integrations", label: "Integrations", description: "Integration-ready architecture", icon: Link2 },
  ];
  const activeUsers = createdUsers.filter((user) => String(user.status || "").toLowerCase() === "active").length;
  const teacherCount = createdUsers.filter((user) => String(user.role || "").toLowerCase() === "teacher").length;
  const studentCount = createdUsers.filter((user) => String(user.role || "").toLowerCase() === "student").length;
  const creatableRoleOptions = roleOptions.filter((role) => role !== "School Admin");
  const schoolMetricsSummary = schoolMetricsLive || {
    activeUsers,
    teacherCount,
    studentCount,
    activeClasses: 0,
    activeBookPackages: 0,
    activeAssignments: 0,
    submittedWorkCount: 0,
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    setUsersError("");

    try {
      setCreatedUsers(await listUsers());
      setApiFallback(false);
    } catch (error) {
      setUsersError(error.message);
      setApiFallback(true);
      setCreatedUsers([]);
      throw error;
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    loadUsers().catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadSchoolMetrics() {
      setSchoolMetricsLoading(true);
      setSchoolMetricsError("");
      try {
        const metrics = await getSchoolMetrics();
        if (!cancelled) setSchoolMetricsLive(metrics);
      } catch (error) {
        if (!cancelled) {
          setSchoolMetricsLive(null);
          setSchoolMetricsError(error.message || "School metrics could not be loaded");
        }
      } finally {
        if (!cancelled) setSchoolMetricsLoading(false);
      }
    }
    loadSchoolMetrics();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setActiveAdminSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    const normalizedPrimary = String(brand.primary || "").toLowerCase();
    const isAllowed = ALLOWED_PRIMARY_COLORS.some((option) => option.value === normalizedPrimary);
    if (!isAllowed) {
      setBrand({ ...brand, primary: ALLOWED_PRIMARY_COLORS[0].value });
    }
  }, [brand, setBrand]);

  const handleCreateUser = async (event) => {
    event.preventDefault();
    const name = newUser.name.trim() || `Demo ${newUser.role}`;
    setSavingUser(true);
    setUsersError("");
    let created = false;

    try {
      const createdUser = await inviteUser({
        name,
        email: newUser.email,
        role: newUser.role,
        level: newUser.level,
      });

      await loadUsers();
      setUserActionStatus(createdUser.invitationDeliveryState === "failed" ? "Invitation created, but email delivery failed. You can resend it." : "Invitation sent successfully.");
      created = true;
    } catch (error) {
      setUsersError(error.message);
      setUserCreated(false);
    } finally {
      setSavingUser(false);
    }
    if (created) {
      setUserCreated(true);
      setNewUser({ name: "", email: "", role: "Student", level: "B2", status: "Invited" });
    }
  };

  const updateUser = async (id, field, value) => {
    const existing = createdUsers.find((user) => user.id === id);
    if (!existing || !window.confirm(`Confirm ${field} change for ${existing.name}? Existing sessions will be revoked.`)) return;
    setPendingUserAction(`${id}:${field}`);
    try {
      await updateUserRequest(id, { [field]: roleToDb(value) });
      await loadUsers();
      setUsersError("");
      setUserActionStatus("Account updated and existing sessions revoked.");
    } catch (error) {
      setUsersError(error.message);
    } finally { setPendingUserAction(""); }
  };

  const deleteUser = async (id) => {
    const existing = createdUsers.find((user) => user.id === id);
    if (!existing || !window.confirm(`Permanently delete ${existing.name}? This cannot be undone.`)) return;
    setPendingUserAction(`${id}:delete`);
    try {
      await deleteUserRequest(id);
      await loadUsers();
      setUsersError("");
      setUserActionStatus("Account deleted.");
    } catch (error) {
      setUsersError(error.message);
    } finally { setPendingUserAction(""); }
  };

  const resendInvitation = async (user) => {
    setPendingUserAction(`${user.id}:resend`); setUsersError("");
    try { const result = await inviteUser(user, true); await loadUsers(); setUserActionStatus(result.invitationDeliveryState === "failed" ? "Invitation renewed, but email delivery failed." : "Invitation resent successfully."); }
    catch (error) { setUsersError(error.message); }
    finally { setPendingUserAction(""); }
  };

  const forceRevokeSessions = async (user) => {
    if (!window.confirm(`Sign ${user.name} out of all current sessions?`)) return;
    setPendingUserAction(`${user.id}:revoke`); setUsersError("");
    try { await revokeUserSessions(user.id); await loadUsers(); setUserActionStatus("Sessions revoked successfully."); }
    catch (error) { setUsersError(error.message); }
    finally { setPendingUserAction(""); }
  };

  const toggleRolloutAction = (action) => {
    setCompletedRollout((current) => current.includes(action) ? current.filter((item) => item !== action) : [...current, action]);
  };

  const applyPrimaryColor = (nextColor) => {
    const normalized = String(nextColor || "").toLowerCase();
    const isAllowed = ALLOWED_PRIMARY_COLORS.some((option) => option.value === normalized);
    const hasContrast = contrastWithWhite(normalized) >= 4.5;
    if (!isAllowed || !hasContrast) {
      setPrimaryColorWarning("Primary color must be a dark, high-contrast shade that stays readable with white text.");
      return;
    }
    setPrimaryColorWarning("");
    setBrand({ ...brand, primary: normalized });
  };

  const openSidebar = () => {
    window.clearTimeout(sidebarCloseTimerRef.current);
    setSidebarExpanded(true);
  };

  const scheduleSidebarClose = () => {
    window.clearTimeout(sidebarCloseTimerRef.current);
    sidebarCloseTimerRef.current = window.setTimeout(() => setSidebarExpanded(false), 250);
  };

  return (
    <div className="workspace admin-workspace">
      <div className={`admin-dashboard-shell ${sidebarExpanded ? "sidebar-expanded" : "sidebar-collapsed"}`}>
        <aside
          className="admin-sidebar"
          onMouseEnter={openSidebar}
          onMouseLeave={scheduleSidebarClose}
          onFocus={openSidebar}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) scheduleSidebarClose();
          }}
        >
          <div className="admin-sidebar-card">
            <span className="admin-rail-avatar" aria-hidden="true">A</span>
            <span className="eyebrow">School Admin dashboard</span>
            <h2>Control center</h2>
            <p>Manage the Hamilton House demo profile, users, book access, and class progress for this school only.</p>
            <nav className="admin-sidebar-nav" aria-label="Admin sections">
              {adminSections.map((section) => {
                const Icon = section.icon;
                const isActive = activeAdminSection === section.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    className={`admin-nav-button ${isActive ? "active" : ""}`}
                    onClick={() => {
                      setActiveAdminSection(section.id);
                      navigateTo?.(section.route);
                    }}
                    data-sound-click="submit"
                    title={section.label}
                  >
                    <span><Icon size={16} /></span>
                    <strong>{section.label}</strong>
                    <small>{section.description}</small>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        <main className="admin-main-panel">
          {activeAdminSection === "overview" && (
            <section className="admin-section-panel">
              <SectionTitle
                eyebrow="School administration"
                title="Launch school rollout and publisher-controlled book access."
                text="Admins can configure school identity, create users, generate book activation codes, attach virtual books, organize classes, and monitor publisher intelligence."
              />
              <section className="metric-grid">
                {schoolMetrics.map(([label, value, note], index) => (
                  <MetricCard key={label} label={label} value={value} note={note} icon={index === 3 ? BookOpen : index === 1 ? Users : Building2} delay={index} />
                ))}
              </section>
              <Card className="rollout-actions priority-panel">
                <div className="card-heading">
                  <div>
                    <span className="eyebrow"><CheckCircle2 size={15} /> School rollout actions</span>
                    <h2>Publisher-ready launch checklist</h2>
                    <p>Compact demo actions show the path from new school setup to book code activation and teacher adoption.</p>
                  </div>
                  <Tag tone="green">{completedRollout.length}/{rolloutActions.length} completed</Tag>
                </div>
                <div className="rollout-action-grid">
                  {rolloutActions.map((action) => {
                    const isCompleted = completedRollout.includes(action);
                    const isCodeAction = action === "Generate book activation codes";
                    return (
                      <button
                        key={action}
                        className={`${isCompleted ? "completed" : ""} ${isCodeAction ? "code-action" : ""}`}
                        onClick={() => toggleRolloutAction(action)}
                      >
                        <span>{isCompleted ? <CheckCircle2 size={17} /> : <Plus size={17} />}</span>
                        <strong>{action}</strong>
                        <small>{isCompleted ? "Ready" : isCodeAction ? "Publisher code batch" : "Run demo action"}</small>
                      </button>
                    );
                  })}
                </div>
                {completedRollout.includes("Generate book activation codes") && (
                  <div className="inline-status success">Book activation code batch generated: ULT-B2-DEMO-2026 through ULT-B2-DEMO-2075.</div>
                )}
              </Card>
            </section>
          )}

          {activeAdminSection === "school-setup" && (
            <section className="admin-section-panel">
              <section className="admin-grid">
                <Card className="setup-panel priority-panel">
                  <span className="eyebrow"><Palette size={15} /> School profile setup wizard</span>
                  <h2>Hamilton House ELT Demo school profile</h2>
                  <p>The school admin sees and edits only their own school profile for this Hamilton House demo.</p>
                  <label>
                    School name
                    <input value={brand.schoolName} onChange={(e) => setBrand({ ...brand, schoolName: e.target.value })} />
                  </label>
                  <div className="color-row">
                    <label>
                      Primary color
                      <select value={selectedPrimaryColor} onChange={(e) => applyPrimaryColor(e.target.value)}>
                        {ALLOWED_PRIMARY_COLORS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label} ({option.value.toUpperCase()})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Secondary color
                      <input type="color" value={brand.secondary} onChange={(e) => setBrand({ ...brand, secondary: e.target.value })} />
                    </label>
                  </div>
                  {primaryColorWarning && <div className="inline-status warning">{primaryColorWarning}</div>}
                  <div className="preset-row">
                    {brandPresets.map((preset) => (
                      <button key={preset.schoolName} onClick={() => setBrand(preset)} className={brand.schoolName === preset.schoolName ? "selected" : ""}>
                        <span style={{ background: preset.primary }}>{preset.logo}</span>
                        {preset.schoolName}
                      </button>
                    ))}
                  </div>
                  <div className="wizard-list">
                    {["School identity", "User roles: school admin, teacher, student", "Ultimate B2 package assignment", "Class sections and enrolment"].map((step, index) => (
                      <div key={step}><b>{index + 1}</b><span>{step}</span><Tag tone={index < 2 ? "green" : "blue"}>{index < 2 ? "Ready" : "Demo"}</Tag></div>
                    ))}
                  </div>
                </Card>

                <Card className="preview-panel">
                  <span className="eyebrow">Student portal preview</span>
                  <h2>Hamilton House demo branding preview</h2>
                  <PortalPreview brand={brand} />
                </Card>
              </section>
            </section>
          )}

          {activeAdminSection === "users" && (
            <section className="admin-section-panel">
              <Card>
                <div className="card-heading">
                  <div><span className="eyebrow"><Users size={15} /> User creation</span><h2>Users for the Ultimate B2 package</h2></div>
                  <button className="secondary-action" data-sound-click="submit" onClick={() => setUserCreated(true)}><UploadCloud size={17} /> Import CSV</button>
                </div>
                <form className="create-user-form" onSubmit={handleCreateUser}>
                  <label>
                    Name
                    <input value={newUser.name} placeholder="e.g. Elena Markou" onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
                  </label>
                  <label>
                    Email
                    <input type="email" value={newUser.email} placeholder="sofia@example.com" onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
                  </label>
                  <label>
                    Role
                    <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                      {creatableRoleOptions.map((role) => <option key={role}>{role}</option>)}
                    </select>
                  </label>
                  <label>
                    CEFR level
                    <select value={newUser.level} onChange={(e) => setNewUser({ ...newUser, level: e.target.value })}>
                      {cefrLevels.map((level) => <option key={level}>{level}</option>)}
                    </select>
                  </label>
                  <button className="primary-action" data-sound-click="submit" type="submit" disabled={savingUser}><UserPlus size={17} /> {savingUser ? "Inviting..." : "Send invitation"}</button>
                </form>
                {usersLoading && <div className="inline-status">Loading users from Neon through Netlify Functions...</div>}
                {apiFallback && (
                  <div className="inline-status warning">
                    Database API unavailable. No local user changes were applied. Check Netlify Functions configuration.
                    {usersError ? ` (${usersError})` : ""}
                  </div>
                )}
                {userCreated && !apiFallback && <div className="inline-status success">Invitation account saved to the database.</div>}
                {userActionStatus && <div className="inline-status success">{userActionStatus}</div>}
                {!usersLoading && createdUsers.length === 0 ? (
                  <div className="empty-user-state">
                    <strong>Create your first user</strong>
                    <span>No platform users were returned for this school yet.</span>
                  </div>
                ) : (
                  <div className="data-table user-data-table">
                    {createdUsers.map((user, index) => (
                      <div key={user.id ?? `${user.name}-${index}`}>
                        <strong>{user.name}<small>{user.email || "No email"}</small></strong>
                        <select disabled={user.role === "School Admin" || Boolean(pendingUserAction)} value={user.role} onChange={(event) => updateUser(user.id, "role", event.target.value)}>
                          {(user.role === "School Admin" ? ["School Admin"] : creatableRoleOptions).map((role) => <option key={role}>{role}</option>)}
                        </select>
                        <small>{user.level || "No level"}</small>
                        <select disabled={Boolean(pendingUserAction)} value={user.status} onChange={(event) => updateUser(user.id, "status", event.target.value)}>
                          {statusOptions.map((status) => <option key={status}>{status}</option>)}
                        </select>
                        <Tag tone={user.source === "database" ? "green" : "gold"}>{user.source === "database" ? "DB" : "Mock"}</Tag>
                        <Tag tone={String(user.status).toLowerCase() === "active" ? "green" : String(user.status).toLowerCase() === "paused" ? "gold" : "blue"}>{user.status}</Tag>
                        {user.invitationDeliveryState && <small>Email: {user.invitationDeliveryState}</small>}
                        {String(user.status).toLowerCase() === "invited" && <button disabled={Boolean(pendingUserAction)} className="secondary-action compact-action" onClick={()=>resendInvitation(user)}>{pendingUserAction === `${user.id}:resend` ? "Resending…" : "Resend invite"}</button>}
                        {String(user.status).toLowerCase() === "active" && user.role !== "School Admin" && <button disabled={Boolean(pendingUserAction)} className="secondary-action compact-action" onClick={()=>forceRevokeSessions(user)}>{pendingUserAction === `${user.id}:revoke` ? "Revoking…" : "Revoke sessions"}</button>}
                        <button disabled={Boolean(pendingUserAction)} className="danger-action" data-sound-click="deleteRemove" onClick={() => deleteUser(user.id)}>{pendingUserAction === `${user.id}:delete` ? "Deleting…" : "Delete"}</button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </section>
          )}

          {activeAdminSection === "books-classes" && (
            <section className="admin-section-panel">
              <Card>
                <div className="card-heading">
                  <div><span className="eyebrow"><BookOpen size={15} /> Books and classes</span><h2>Assign digital book access to sections</h2></div>
                  <button className="primary-action" data-sound-click="submit" onClick={() => setBookAdded(true)}><Plus size={17} /> Add book</button>
                </div>
                {bookAdded && <div className="inline-status success">Digital book added: Ultimate B2 Students Book with reading, listening, grammar, vocabulary, and writing activities.</div>}
                <div className="class-list">
                  {classes.map((item) => (
                    <article key={item.name}>
                      <div>
                        <strong>{item.name}</strong>
                        <span>{item.teacher} / {item.students} students / {item.book}</span>
                        <AdminInviteLink classItem={item} />
                      </div>
                      <Progress value={item.completion} color="linear-gradient(90deg, var(--brand-primary), var(--brand-secondary))" />
                    </article>
                  ))}
                </div>
                <div className="exercise-type-row">
                  {exerciseTypes.slice(0, 4).map((type) => <Tag key={type} tone="violet">{type}</Tag>)}
                </div>
                <div className="activation-mini">
                  <span className="eyebrow"><KeyRound size={15} /> Activation code</span>
                  <div className="activation-form">
                    <input value={activationCode} placeholder="ULT-B2-DEMO-2026" onChange={(event) => setActivationCode(event.target.value)} />
                    <button className="secondary-action" data-sound-click="submit" onClick={() => setBookUnlocked(true)}>Activate book</button>
                  </div>
                  {bookUnlocked && <div className="inline-status success">Ultimate B2 Students Book unlocked for Ultimate B2 A.</div>}
                </div>
              </Card>
              <Card>
                <div className="card-heading">
                  <div>
                    <span className="eyebrow"><KeyRound size={15} /> Bulk activation model</span>
                    <h2>School activation batch</h2>
                    <p>MVP planning card for school-wide book access batches. This action is demo only and does not create licenses.</p>
                  </div>
                  <Tag tone={schoolMetricsLive ? "green" : "gold"}>{schoolMetricsLive ? "Database" : "Unavailable"}</Tag>
                </div>
                {schoolMetricsLoading && <div className="inline-status">Loading school metrics...</div>}
                {schoolMetricsError && <div className="inline-status warning">{schoolMetricsError}</div>}
                <section className="student-grade-summary">
                  <article className="panel"><strong>{brand.schoolName || brandPresets[0].schoolName}</strong><span>School</span></article>
                  <article className="panel"><strong>{schoolMetricsSummary.activeUsers}</strong><span>Active users</span></article>
                  <article className="panel"><strong>{schoolMetricsSummary.teacherCount}</strong><span>Teachers</span></article>
                  <article className="panel"><strong>{schoolMetricsSummary.studentCount}</strong><span>Students</span></article>
                  <article className="panel"><strong>{schoolMetricsSummary.activeClasses}</strong><span>Active classes</span></article>
                  <article className="panel"><strong>{schoolMetricsSummary.activeBookPackages}</strong><span>Active book packages</span></article>
                  <article className="panel"><strong>{schoolMetricsSummary.activeAssignments}</strong><span>Active assignments</span></article>
                  <article className="panel"><strong>{schoolMetricsSummary.submittedWorkCount}</strong><span>Submitted work</span></article>
                </section>
                <button className="secondary-action" type="button" onClick={() => setActivationBatchGenerated(true)} data-sound-click="submit">
                  <Plus size={17} /> Generate activation batch
                </button>
                {activationBatchGenerated && <div className="inline-status success">Demo batch prepared for Ultimate B2. No database licenses were created.</div>}
              </Card>
            </section>
          )}

          {activeAdminSection === "publisher-intelligence" && (
            <section className="admin-section-panel">
              <Card className="publisher-intelligence priority-panel">
                <div className="card-heading">
                  <div>
                    <span className="eyebrow"><BarChart3 size={15} /> Publisher intelligence</span>
                    <h2>Adoption evidence for publishing teams</h2>
                    <p>Publisher intelligence combines book code activation, teacher adoption dashboard signals, skill gap analysis, and book engagement without exposing individual answers.</p>
                  </div>
                  <button className="secondary-action" onClick={() => setExported(true)}><Download size={17} /> Export adoption data</button>
                </div>
                {exported && <div className="inline-status success">Adoption export prepared with school, book code, unit usage, skill difficulty, and engagement columns.</div>}
                <div className="publisher-metric-grid">
                  {publisherIntelligence.map((item) => (
                    <article key={item.label}>
                      <span style={{ background: item.accent }} />
                      <small>{item.label}</small>
                      <strong>{item.value}</strong>
                      <p>{item.note}</p>
                    </article>
                  ))}
                </div>
              </Card>
            </section>
          )}

          {activeAdminSection === "integrations" && (
            <section className="admin-section-panel">
              <Card className="integration-panel">
                <div className="card-heading">
                  <div>
                    <span className="eyebrow"><Link2 size={15} /> Integration-ready architecture</span>
                    <h2>Standalone now, connected later</h2>
                    <p>The platform works as a standalone publisher-controlled digital book platform and can connect to existing school systems in later phases.</p>
                  </div>
                  {selectedIntegration && <Tag tone="blue">{selectedIntegration} selected</Tag>}
                </div>
                <div className="integration-grid">
                  {integrationOptions.map((option) => (
                    <button key={option} className={selectedIntegration === option ? "selected" : ""} onClick={() => setSelectedIntegration(option)}>
                      <span>{option}</span>
                      <small>{selectedIntegration === option ? "Demo connection highlighted" : "Integration-ready"}</small>
                    </button>
                  ))}
                </div>
              </Card>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
