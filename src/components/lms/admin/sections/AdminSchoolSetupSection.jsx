import { Palette } from "lucide-react";
import { brandPresets } from "../../../../data/lmsDemoData.js";
import { Card, PortalPreview, Tag } from "../../Shared.jsx";
import { ALLOWED_PRIMARY_COLORS } from "../adminConfig.js";

export function AdminSchoolSetupSection({
  brand,
  selectedPrimaryColor,
  primaryColorWarning,
  onBrandChange,
  onPrimaryColorChange,
}) {
  return (
    <section className="admin-section-panel">
      <section className="admin-grid">
        <Card className="setup-panel priority-panel">
          <span className="eyebrow"><Palette size={15} /> School profile setup</span>
          <h2>{brand.schoolName} school profile</h2>
          <p>Edit only the identity of the currently signed-in administrator's school.</p>
          <label>
            School name
            <input value={brand.schoolName} onChange={(event) => onBrandChange({ ...brand, schoolName: event.target.value })} />
          </label>
          <div className="color-row">
            <label>
              Primary color
              <select value={selectedPrimaryColor} onChange={(event) => onPrimaryColorChange(event.target.value)}>
                {ALLOWED_PRIMARY_COLORS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label} ({option.value.toUpperCase()})</option>
                ))}
              </select>
            </label>
            <label>
              Secondary color
              <input type="color" value={brand.secondary} onChange={(event) => onBrandChange({ ...brand, secondary: event.target.value })} />
            </label>
          </div>
          {primaryColorWarning && <div className="inline-status warning">{primaryColorWarning}</div>}
          <div className="preset-row">
            {brandPresets.map((preset) => (
              <button key={preset.schoolName} type="button" onClick={() => onBrandChange(preset)} className={brand.schoolName === preset.schoolName ? "selected" : ""}>
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
          <h2>School branding preview</h2>
          <PortalPreview brand={brand} />
        </Card>
      </section>
    </section>
  );
}
