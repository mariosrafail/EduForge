import { CheckCircle2, ClipboardPenLine } from "lucide-react";

const helpItems = [
  "Edit lesson title and instructions",
  "Choose an activity tab",
  "Update prompts, options, or answers",
  "Save changes to the course database",
  "Preview as Student",
];

export function TeacherEditorHelp() {
  return (
    <section className="teacher-help-card">
      <div className="editor-section-heading">
        <ClipboardPenLine size={19} />
        <div>
          <strong>How to edit this lesson</strong>
          <span>Choose an activity tab, update the instructions or answer content, then click Save. Use Preview as Student to check what learners will see.</span>
        </div>
      </div>
      <div className="teacher-help-list">
        {helpItems.map((item) => (
          <span key={item}><CheckCircle2 size={15} /> {item}</span>
        ))}
      </div>
    </section>
  );
}
