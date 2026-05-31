import { useMemo, useState } from "react";
import { classes } from "../../data/lmsDemoData.js";
import { slugifyClassName } from "../../utils/hashRoutes.js";
import { Card, SectionTitle, Tag } from "./Shared.jsx";

function findClassBySlug(classSlug) {
  return classes.find((classItem) => (classItem.slug || slugifyClassName(classItem.name)) === classSlug) || null;
}

export function JoinClassView({ classSlug, navigateTo }) {
  const classItem = useMemo(() => findClassBySlug(classSlug), [classSlug]);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [submitted, setSubmitted] = useState(false);

  if (!classItem) {
    return (
      <main className="workspace join-class-workspace">
        <Card className="join-class-card">
          <SectionTitle
            eyebrow="Class invite"
            title="This invite link is not active."
            text="The class could not be found in the current demo data. Ask your teacher for a fresh invite link."
          />
          <button className="primary-action" type="button" onClick={() => navigateTo?.("home")} data-sound-click="back">
            Back to home
          </button>
        </Card>
      </main>
    );
  }

  const submit = (event) => {
    event.preventDefault();
    setSubmitted(true);
  };

  return (
    <main className="workspace join-class-workspace">
      <Card className="join-class-card">
        <SectionTitle
          eyebrow="Class invite"
          title={`You are joining: ${classItem.name}`}
          text={`${classItem.teacher} invited you to join the ${classItem.book} class workspace.`}
          action={<Tag tone="green">{classItem.students} students</Tag>}
        />

        {submitted ? (
          <div className="join-class-success">
            <div className="inline-status success">Account created. You have joined {classItem.name}.</div>
            <button className="primary-action" type="button" onClick={() => navigateTo?.("student")} data-sound-click="submit">
              Continue to student portal
            </button>
          </div>
        ) : (
          <form className="join-class-form" onSubmit={submit}>
            <label>
              Name
              <input value={form.name} required placeholder="Your name" onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label>
              Email
              <input type="email" value={form.email} required placeholder="you@example.com" onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </label>
            <label>
              Password
              <input type="password" value={form.password} required minLength={6} placeholder="Create a password" onChange={(event) => setForm({ ...form, password: event.target.value })} />
            </label>
            <button className="primary-action" type="submit" data-sound-click="submit">
              Create account and join class
            </button>
          </form>
        )}
      </Card>
    </main>
  );
}
