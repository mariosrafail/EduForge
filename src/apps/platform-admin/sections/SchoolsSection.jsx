import React, { useEffect, useState } from "react";
import { ArrowLeft, Building2, Eye, PauseCircle, PlayCircle, Plus, Save, Send } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { platformApi } from "../platformAdminApi.js";
import {
  PlatformAlert, PlatformButton, PlatformCard, PlatformEmptyState,
  PlatformLoadingState, PlatformStatusBadge,
} from "../components/PlatformUi.jsx";

function SchoolDetail({ school, onClose, onRefresh }) {
  const [form, setForm] = useState({ full_name: "", email: "", role: "admin", level: "" });
  const [branding, setBranding] = useState({
    name: school.name, logo: school.logo || "", primary_color: school.primary_color || "#f97316",
    secondary_color: school.secondary_color || "#101828",
  });
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState("");
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setBranding({
      name: school.name, logo: school.logo || "", primary_color: school.primary_color || "#f97316",
      secondary_color: school.secondary_color || "#101828",
    });
  }, [school]);

  async function run(operation, callback) {
    if (busy) return;
    setBusy(operation);
    setFeedback(null);
    try { await callback(); } catch (error) { setFeedback({ tone: "error", text: error.message }); } finally { setBusy(""); }
  }
  const saveSchool = (event) => {
    event.preventDefault();
    run("save", async () => {
      await platformApi.mutate("update-school", { id: school.id, ...branding });
      setFeedback({ tone: "success", text: "School details updated." });
      await onRefresh();
    });
  };
  const invite = (event) => {
    event.preventDefault();
    run("invite", async () => {
      const result = await platformApi.mutate("create-user", { ...form, school_id: school.id });
      setFeedback({ tone: "success", text: `Invitation created (${result.delivery_status}).` });
      setForm({ full_name: "", email: "", role: "admin", level: "" });
      await onRefresh();
    });
  };

  return (
    <motion.div className="pa-detail-stack" initial={reduceMotion ? false : { opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}>
      <PlatformButton variant="link" icon={ArrowLeft} aria-label="← All schools" onClick={onClose}>All schools</PlatformButton>
      <PlatformCard className="pa-detail-summary">
        <div><span className="pa-eyebrow">School summary</span><h2>{school.name}</h2><PlatformStatusBadge value={school.status} /></div>
        <p>{school.admin_count} admins · {school.teacher_count} teachers · {school.student_count} students · {school.class_count} classes</p>
      </PlatformCard>
      {feedback && <PlatformAlert tone={feedback.tone} onDismiss={() => setFeedback(null)}>{feedback.text}</PlatformAlert>}
      <div className="pa-detail-grid">
        <PlatformCard title="School details" description="Update the tenant name and visual identity.">
          <form onSubmit={saveSchool} className="pa-form-grid">
            <label>Name<input value={branding.name} onChange={(event) => setBranding({ ...branding, name: event.target.value })} required /></label>
            <label>Logo label<input value={branding.logo} onChange={(event) => setBranding({ ...branding, logo: event.target.value })} /></label>
            <label>Primary color<input type="color" value={branding.primary_color} onChange={(event) => setBranding({ ...branding, primary_color: event.target.value })} /></label>
            <label>Secondary color<input type="color" value={branding.secondary_color} onChange={(event) => setBranding({ ...branding, secondary_color: event.target.value })} /></label>
            <div className="pa-form-actions"><PlatformButton type="submit" icon={Save} loading={busy === "save"} disabled={Boolean(busy)}>Save details</PlatformButton></div>
          </form>
        </PlatformCard>
        <PlatformCard title="Invite an ordinary account" description="Create a school-scoped Admin, Teacher, or Student invitation.">
          <form onSubmit={invite} className="pa-form-grid">
            <label>Full name<input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} required /></label>
            <label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
            <label>Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="admin">School Admin</option><option value="teacher">Teacher</option><option value="student">Student</option></select></label>
            <label>Level<input value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })} /></label>
            <div className="pa-form-actions"><PlatformButton type="submit" icon={Send} loading={busy === "invite"} disabled={Boolean(busy)}>Send invitation</PlatformButton></div>
          </form>
        </PlatformCard>
      </div>
    </motion.div>
  );
}

export function SchoolsSection({ data, load, loading, setError }) {
  const schools = data.schools?.schools || [];
  const [selectedId, setSelectedId] = useState(null);
  const [name, setName] = useState("");
  const [provisioning, setProvisioning] = useState({
    name: "", logo: "", primary_color: "#f97316", secondary_color: "#101828",
    admin_full_name: "", admin_email: "",
  });
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState("");
  const [provisioned, setProvisioned] = useState(null);
  const selected = schools.find((school) => school.id === selectedId);

  async function create(event) {
    event.preventDefault();
    if (busy) return;
    setBusy("create"); setError(""); setFeedback("");
    try {
      await platformApi.mutate("create-school", { name });
      setName("");
      setFeedback("School created successfully.");
      await load("schools");
    } catch (error) { setError(error.message); } finally { setBusy(""); }
  }
  async function provision(event) {
    event.preventDefault();
    if (busy) return;
    setBusy("provision"); setError(""); setFeedback(""); setProvisioned(null);
    try {
      const result = await platformApi.mutate("provision-school", provisioning);
      setProvisioned(result);
      setProvisioning({
        name: "", logo: "", primary_color: "#f97316", secondary_color: "#101828",
        admin_full_name: "", admin_email: "",
      });
      await load("schools");
    } catch (error) { setError(error.message); } finally { setBusy(""); }
  }
  async function toggle(school) {
    if (busy) return;
    setBusy(school.id); setError(""); setFeedback("");
    const status = school.status === "active" ? "paused" : "active";
    try {
      await platformApi.mutate("school-status", { id: school.id, status });
      setFeedback(status === "paused" ? `${school.name} paused.` : `${school.name} reactivated.`);
      await load("schools");
    } catch (error) { setError(error.message); } finally { setBusy(""); }
  }

  if (selected) return <SchoolDetail school={selected} onClose={() => setSelectedId(null)} onRefresh={() => load("schools")} />;
  return (
    <div className="pa-section-stack">
      <PlatformCard title="Provision a pilot school" description="Recommended: create the tenant and send its first School Admin invitation together.">
        <form className="pa-form-grid" onSubmit={provision}>
          <label>School name<input value={provisioning.name} onChange={(event) => setProvisioning({ ...provisioning, name: event.target.value })} required /></label>
          <label>Logo label<input value={provisioning.logo} onChange={(event) => setProvisioning({ ...provisioning, logo: event.target.value })} /></label>
          <label>Primary color<input type="color" value={provisioning.primary_color} onChange={(event) => setProvisioning({ ...provisioning, primary_color: event.target.value })} /></label>
          <label>Secondary color<input type="color" value={provisioning.secondary_color} onChange={(event) => setProvisioning({ ...provisioning, secondary_color: event.target.value })} /></label>
          <label>Initial School Admin full name<input value={provisioning.admin_full_name} onChange={(event) => setProvisioning({ ...provisioning, admin_full_name: event.target.value })} required /></label>
          <label>Initial School Admin email<input type="email" value={provisioning.admin_email} onChange={(event) => setProvisioning({ ...provisioning, admin_email: event.target.value })} required /></label>
          <div className="pa-form-actions"><PlatformButton type="submit" icon={Send} loading={busy === "provision"} disabled={Boolean(busy)}>Create school and invite admin</PlatformButton></div>
        </form>
      </PlatformCard>
      {provisioned && (
        <PlatformAlert tone={provisioned.delivery_status === "failed" ? "error" : "success"} onDismiss={() => setProvisioned(null)}>
          School created and administrator invited. Email delivery: {provisioned.delivery_status}.
          {provisioned.delivery_status === "failed" && " Use the existing invitation resend or recovery action."}
          {provisioned.preview_url && <> <a href={provisioned.preview_url}>Open local invitation preview</a>.</>}
        </PlatformAlert>
      )}
      <PlatformCard title="Create a school" description="Add a new tenant without changing existing school data.">
        <form className="pa-inline-form" onSubmit={create}>
          <label>New school name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
          <PlatformButton type="submit" icon={Plus} loading={busy === "create"} disabled={Boolean(busy)}>Create school</PlatformButton>
        </form>
      </PlatformCard>
      {feedback && <PlatformAlert onDismiss={() => setFeedback("")}>{feedback}</PlatformAlert>}
      <PlatformCard title="School directory" description={`${schools.length} school${schools.length === 1 ? "" : "s"} across the platform`}>
        {loading.schools && !data.schools ? <PlatformLoadingState label="Loading schools…" /> : schools.length === 0 ? (
          <PlatformEmptyState icon={Building2} title="No schools found">Create the first school using the form above.</PlatformEmptyState>
        ) : (
          <div className="pa-table-wrap"><table><thead><tr><th>School</th><th>Status</th><th>Admins</th><th>Teachers</th><th>Students</th><th>Classes</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody>{schools.map((school) => <tr key={school.id}><td><PlatformButton variant="link" onClick={() => setSelectedId(school.id)}>{school.name}</PlatformButton></td><td><PlatformStatusBadge value={school.status} /></td><td>{school.admin_count}</td><td>{school.teacher_count}</td><td>{school.student_count}</td><td>{school.class_count}</td><td>{new Date(school.created_at).toLocaleDateString()}</td><td><div className="pa-actions"><PlatformButton variant="ghost" size="compact" icon={Eye} onClick={() => setSelectedId(school.id)}>View</PlatformButton><PlatformButton variant={school.status === "active" ? "warning" : "secondary"} size="compact" icon={school.status === "active" ? PauseCircle : PlayCircle} loading={busy === school.id} disabled={Boolean(busy)} onClick={() => toggle(school)}>{school.status === "active" ? "Pause" : "Reactivate"}</PlatformButton></div></td></tr>)}</tbody>
          </table></div>
        )}
      </PlatformCard>
    </div>
  );
}
