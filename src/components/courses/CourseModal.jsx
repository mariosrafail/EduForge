import { useState } from "react";
import BrandLogo from "../brand/BrandLogo";
import Button from "../ui/Button";
import Modal from "../ui/Modal";

const emptyForm = {
  title: "",
  subject: "",
  level: "",
  description: "",
  exportType: "Moodle-ready HTML",
};

export default function CourseModal({ open, onClose, onCreate }) {
  const [form, setForm] = useState(emptyForm);
  const formId = "course-create-form";

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onCreate({
      ...form,
      title: form.title || "Νέο μάθημα",
      subject: form.subject || "Γενικό μάθημα",
      level: form.level || "Χωρίς επίπεδο",
      description: form.description || "Σύντομη περιγραφή νέου μαθήματος.",
    });
    setForm(emptyForm);
  }

  return (
    <Modal
      open={open}
      title="Νέο μάθημα"
      kicker={<BrandLogo size="sm" compact />}
      description="Συμπλήρωσε τα βασικά στοιχεία για να ξεκινήσεις."
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Ακύρωση
          </Button>
          <Button type="submit" variant="primary" form={formId}>
            Δημιουργία μαθήματος
          </Button>
        </>
      }
    >
      <form id={formId} className="modal-form polished-course-form" onSubmit={submit}>
        <div className="form-field">
          <label htmlFor="course-title">Τίτλος μαθήματος</label>
          <input id="course-title" value={form.title} onChange={(event) => update("title", event.target.value)} />
          <small>Π.χ. Φυσική Γ' Λυκείου: Ηλεκτρισμός</small>
        </div>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="course-subject">Γνωστικό αντικείμενο</label>
            <input id="course-subject" value={form.subject} onChange={(event) => update("subject", event.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="course-level">Τάξη ή επίπεδο</label>
            <input id="course-level" value={form.level} onChange={(event) => update("level", event.target.value)} />
          </div>
        </div>
        <div className="form-field">
          <label htmlFor="course-description">Σύντομη περιγραφή</label>
          <textarea
            id="course-description"
            value={form.description}
            onChange={(event) => update("description", event.target.value)}
          />
          <small>Μια σύντομη πρόταση βοηθά την ομάδα να καταλάβει γρήγορα το περιεχόμενο.</small>
        </div>
        <div className="form-field">
          <label htmlFor="course-export">Τύπος εξαγωγής προεπιλογής</label>
          <select id="course-export" value={form.exportType} onChange={(event) => update("exportType", event.target.value)}>
            <option>Moodle-ready HTML</option>
            <option>Standalone HTML</option>
            <option>PDF summary</option>
          </select>
        </div>
      </form>
    </Modal>
  );
}
