import Card from "../ui/Card";

export default function SettingsPage() {
  return (
    <section className="settings-page section-stack">
      <Card className="settings-card" padding="lg">
        <span className="section-kicker">Settings</span>
        <h2>Ρυθμίσεις</h2>
        <p>Mock επιλογές για το περιβάλλον εργασίας και τις προτιμήσεις εξαγωγής.</p>

        <div className="settings-list">
          <label className="settings-row">
            <span>
              <strong>Γλώσσα περιβάλλοντος</strong>
              <small>Προεπιλεγμένη γλώσσα για την πλατφόρμα.</small>
            </span>
            <select defaultValue="el" aria-label="Γλώσσα περιβάλλοντος">
              <option value="el">Ελληνικά</option>
              <option value="en">English</option>
            </select>
          </label>

          <label className="settings-row">
            <span>
              <strong>Προεπιλεγμένος τύπος export</strong>
              <small>Η πρώτη επιλογή που θα εμφανίζεται στις εξαγωγές.</small>
            </span>
            <select defaultValue="web" aria-label="Προεπιλεγμένος τύπος export">
              <option value="web">Web lesson</option>
              <option value="html">Standalone HTML</option>
              <option value="pdf">PDF summary</option>
            </select>
          </label>

          <label className="settings-row toggle-row">
            <span>
              <strong>Ενεργοποίηση ελέγχου accessibility</strong>
              <small>Mock έλεγχος για alt text και βασική αναγνωσιμότητα.</small>
            </span>
            <input type="checkbox" defaultChecked aria-label="Ενεργοποίηση ελέγχου accessibility" />
          </label>
        </div>
      </Card>
    </section>
  );
}
