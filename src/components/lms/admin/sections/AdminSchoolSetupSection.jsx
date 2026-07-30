import { Palette } from "lucide-react";
import { brandPresets } from "../../../../data/lmsDemoData.js";
import { Card, PortalPreview, Tag } from "../../Shared.jsx";
import { ALLOWED_PRIMARY_COLORS } from "../adminConfig.js";

export function AdminSchoolSetupSection({
  brand,
  profileLoading,
  profileLoadError,
  dirty,
  validationError,
  saving,
  saveError,
  saved,
  onBrandChange,
  onSave,
  onDiscard,
}) {
  const primaryApproved = ALLOWED_PRIMARY_COLORS.some((option) => option.value === String(brand.primary || "").toLowerCase());

  return (
    <section className="admin-section-panel">
      <section className="admin-grid">
        <Card className="setup-panel priority-panel">
          <span className="eyebrow"><Palette size={15} /> School profile setup</span>
          <h2>{brand.schoolName} school profile</h2>
          <p>Edit a local preview, then save it to the currently signed-in administrator's school.</p>
          {profileLoading && <div className="inline-status" role="status">Loading saved school profile…</div>}
          {profileLoadError && <div className="inline-status warning" role="alert">Saved school profile could not be loaded. {profileLoadError}</div>}
          <form onSubmit={(event) => { event.preventDefault(); onSave(); }}>
            <label>
              School name
              <input value={brand.schoolName} maxLength={160} onChange={(event) => onBrandChange({ ...brand, schoolName: event.target.value })} />
            </label>
            <label>
              Logo / mark text
              <input value={brand.logo} maxLength={240} onChange={(event) => onBrandChange({ ...brand, logo: event.target.value })} />
            </label>
            <div className="color-row">
              <label>
                Primary color
                <select value={String(brand.primary || "").toLowerCase()} onChange={(event) => onBrandChange({ ...brand, primary: event.target.value })}>
                  {!primaryApproved && (
                    <option value={String(brand.primary || "").toLowerCase()}>Current saved color — select an approved value to save</option>
                  )}
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
            <span className="eyebrow">Preview preset</span>
            <div className="preset-row">
              {brandPresets.map((preset) => (
                <button
                  key={preset.schoolName}
                  type="button"
                  aria-label={`Apply ${preset.schoolName} preview preset`}
                  onClick={() => onBrandChange(preset)}
                  className={brand.schoolName === preset.schoolName ? "selected" : ""}
                >
                  <span style={{ background: preset.primary }}>{preset.logo}</span>
                  {preset.schoolName}
                </button>
              ))}
            </div>
            {dirty && <div className="inline-status warning" role="status">Unsaved preview changes</div>}
            {validationError && <div className="inline-status warning" role="alert">{validationError}</div>}
            {saving && <div className="inline-status" role="status">Saving school profile…</div>}
            {saved && <div className="inline-status success" role="status">School profile saved.</div>}
            {saveError && <div className="inline-status warning" role="alert">School profile could not be saved. {saveError}</div>}
            <div className="action-row">
              <button className="primary-action" type="submit" disabled={profileLoading || saving || !dirty || Boolean(validationError)}>
                Save school profile
              </button>
              <button className="secondary-action" type="button" onClick={onDiscard} disabled={saving || !dirty}>
                Discard changes
              </button>
            </div>
          </form>
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
