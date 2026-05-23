import { BarChart3, BookOpen, Building2, CheckCircle2, Download, KeyRound, Link2, Palette, Plus, UploadCloud, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { brandPresets, classes, exerciseTypes, integrationOptions, publisherIntelligence, rolloutActions, schoolMetrics, users } from "../../data/lmsDemoData.js";
import { Card, MetricCard, PortalPreview, Progress, SectionTitle, Tag } from "./Shared.jsx";

export function AdminView({ brand, setBrand }) {
  const [userCreated, setUserCreated] = useState(false);
  const [bookAdded, setBookAdded] = useState(false);
  const [bookUnlocked, setBookUnlocked] = useState(false);
  const [activationCode, setActivationCode] = useState("");
  const [exported, setExported] = useState(false);
  const [completedRollout, setCompletedRollout] = useState(["Create school"]);
  const [selectedIntegration, setSelectedIntegration] = useState("");
  const [createdUsers, setCreatedUsers] = useState(users);
  const [newUser, setNewUser] = useState({
    name: "",
    role: "Student",
    level: "B1 Junior",
    status: "Invited",
  });

  const handleCreateUser = (event) => {
    event.preventDefault();
    const name = newUser.name.trim() || `Demo ${newUser.role}`;
    setCreatedUsers([{ ...newUser, name }, ...createdUsers]);
    setUserCreated(true);
    setNewUser({ name: "", role: "Student", level: "B1 Junior", status: "Invited" });
  };

  const toggleRolloutAction = (action) => {
    setCompletedRollout((current) => current.includes(action) ? current.filter((item) => item !== action) : [...current, action]);
  };

  return (
    <div className="workspace">
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
          <div className="inline-status success">Book code activation batch generated: B1-DEMO-2026 through B1-DEMO-2075.</div>
        )}
      </Card>

      <section className="admin-grid">
        <Card className="setup-panel priority-panel">
          <span className="eyebrow"><Palette size={15} /> School profile setup wizard</span>
          <h2>Personalize the school portal</h2>
          <label>
            School name
            <input value={brand.schoolName} onChange={(e) => setBrand({ ...brand, schoolName: e.target.value })} />
          </label>
          <div className="color-row">
            <label>
              Primary color
              <input type="color" value={brand.primary} onChange={(e) => setBrand({ ...brand, primary: e.target.value })} />
            </label>
            <label>
              Secondary color
              <input type="color" value={brand.secondary} onChange={(e) => setBrand({ ...brand, secondary: e.target.value })} />
            </label>
          </div>
          <div className="preset-row">
            {brandPresets.map((preset) => (
              <button key={preset.schoolName} onClick={() => setBrand(preset)} className={brand.schoolName === preset.schoolName ? "selected" : ""}>
                <span style={{ background: preset.primary }}>{preset.logo}</span>
                {preset.schoolName}
              </button>
            ))}
          </div>
          <div className="wizard-list">
            {["School identity", "User roles: admin, teacher, student", "Virtual book assignment", "Class sections and enrolment"].map((step, index) => (
              <div key={step}><b>{index + 1}</b><span>{step}</span><Tag tone={index < 2 ? "green" : "blue"}>{index < 2 ? "Ready" : "Demo"}</Tag></div>
            ))}
          </div>
        </Card>

        <Card className="preview-panel">
          <span className="eyebrow">Student portal preview</span>
          <h2>Branding changes live</h2>
          <PortalPreview brand={brand} />
        </Card>
      </section>

      <section className="admin-grid lower">
        <Card>
          <div className="card-heading">
            <div><span className="eyebrow"><Users size={15} /> User creation</span><h2>Users across three levels</h2></div>
            <button className="secondary-action" onClick={() => setUserCreated(true)}><UploadCloud size={17} /> Import CSV</button>
          </div>
          <form className="create-user-form" onSubmit={handleCreateUser}>
            <label>
              Name
              <input value={newUser.name} placeholder="e.g. Sofia Laskari" onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
            </label>
            <label>
              Role
              <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                <option>Admin</option>
                <option>Teacher</option>
                <option>Student</option>
              </select>
            </label>
            <label>
              Class / level
              <input value={newUser.level} onChange={(e) => setNewUser({ ...newUser, level: e.target.value })} />
            </label>
            <label>
              Status
              <select value={newUser.status} onChange={(e) => setNewUser({ ...newUser, status: e.target.value })}>
                <option>Active</option>
                <option>Invited</option>
                <option>Paused</option>
              </select>
            </label>
            <button className="primary-action" type="submit"><UserPlus size={17} /> Create user</button>
          </form>
          {userCreated && <div className="inline-status">Demo user action completed. New users appear immediately in the table below.</div>}
          <div className="data-table">
            {createdUsers.map((user, index) => (
              <div key={`${user.name}-${index}`}>
                <strong>{user.name}</strong>
                <span>{user.role}</span>
                <small>{user.level}</small>
                <Tag tone={user.status === "Active" ? "green" : user.status === "Paused" ? "violet" : "gold"}>{user.status}</Tag>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="card-heading">
            <div><span className="eyebrow"><BookOpen size={15} /> Books and classes</span><h2>Assign content to sections</h2></div>
            <button className="primary-action" onClick={() => setBookAdded(true)}><Plus size={17} /> Add book</button>
          </div>
          {bookAdded && <div className="inline-status success">Virtual book added: English Skills B1 with reading, listening, grammar, vocabulary, and writing activities.</div>}
          <div className="class-list">
            {classes.map((item) => (
              <article key={item.name}>
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.teacher} / {item.students} students / {item.book}</span>
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
              <input value={activationCode} placeholder="B1-DEMO-2026" onChange={(event) => setActivationCode(event.target.value)} />
              <button className="secondary-action" onClick={() => setBookUnlocked(true)}>Activate book</button>
            </div>
            {bookUnlocked && <div className="inline-status success">English Skills B1 unlocked for B1 Junior A.</div>}
          </div>
        </Card>
      </section>

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

      <Card className="integration-panel">
        <div className="card-heading">
          <div>
            <span className="eyebrow"><Link2 size={15} /> Integration-ready architecture</span>
            <h2>Standalone now, connected later</h2>
            <p>The platform works as a standalone publisher LMS and can connect to existing school systems in later phases.</p>
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
    </div>
  );
}
