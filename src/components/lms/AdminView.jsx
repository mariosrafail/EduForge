import { BookOpen, Building2, Palette, Plus, UploadCloud, Users } from "lucide-react";
import { useState } from "react";
import { brandPresets, classes, exerciseTypes, schoolMetrics, users } from "../../data/lmsDemoData.js";
import { Card, MetricCard, PortalPreview, Progress, SectionTitle, Tag } from "./Shared.jsx";

export function AdminView({ brand, setBrand }) {
  const [userCreated, setUserCreated] = useState(false);
  const [bookAdded, setBookAdded] = useState(false);

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
          {userCreated && <div className="inline-status">3 sample users staged for import. Admin, teacher, and student roles are visible below.</div>}
          <div className="data-table">
            {users.map((user) => (
              <div key={user.name}>
                <strong>{user.name}</strong>
                <span>{user.role}</span>
                <small>{user.level}</small>
                <Tag tone={user.status === "Active" ? "green" : "gold"}>{user.status}</Tag>
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
        </Card>
      </section>
    </div>
  );
}
