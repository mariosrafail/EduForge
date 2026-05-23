import { BarChart3, BookOpen, Building2, Download, KeyRound, Palette, Plus, UploadCloud, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { brandPresets, classes, exerciseTypes, publisherIntelligence, schoolMetrics, users } from "../../data/lmsDemoData.js";
import { Card, MetricCard, PortalPreview, Progress, SectionTitle, Tag } from "./Shared.jsx";

export function AdminView({ brand, setBrand }) {
  const [userCreated, setUserCreated] = useState(false);
  const [bookAdded, setBookAdded] = useState(false);
  const [bookUnlocked, setBookUnlocked] = useState(false);
  const [activationCode, setActivationCode] = useState("");
  const [exported, setExported] = useState(false);
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

  return (
    <div className="workspace">
      <SectionTitle
        eyebrow="School administration"
        title="Launch and manage a branded LMS environment."
        text="Admins can configure school identity, create users across roles, attach virtual books, organize sections, and assign teachers and students."
      />

      <section className="metric-grid">
        {schoolMetrics.map(([label, value, note], index) => (
          <MetricCard key={label} label={label} value={value} note={note} icon={index === 3 ? BookOpen : index === 1 ? Users : Building2} delay={index} />
        ))}
      </section>

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
            <p>Aggregate book activation and engagement signals help an owner prove value across schools without exposing individual answers.</p>
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
    </div>
  );
}
