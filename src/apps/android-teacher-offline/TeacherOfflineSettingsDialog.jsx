import { BookOpen, Info, Palette, Volume2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { updateTeacherOfflineSettings, useTeacherOfflineSettings } from "./teacherOfflineSettings.js";

const tabs = [
  { id: "audio", label: "Audio", icon: Volume2 },
  { id: "content", label: "Content", icon: BookOpen },
  { id: "graphics", label: "Graphics", icon: Palette },
  { id: "about", label: "About", icon: Info },
];

function LegacyToggle({ checked, label, onChange }) {
  return (
    <button type="button" className={`legacy-settings-toggle ${checked ? "on" : "off"}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
      <span>{checked ? "ON" : "OFF"}</span><i aria-hidden="true" />
    </button>
  );
}

function SettingsSegmented({ label, value, options, onChange }) {
  return (
    <div className="teacher-settings-segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? "selected" : ""}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function LegacySlider({ label, value, min = 0, max = 100, suffix = "%", onChange }) {
  const percentage = ((value - min) / (max - min)) * 100;
  return (
    <label className="legacy-settings-slider">
      <span className="sr-only">{label}</span>
      <input type="range" min={min} max={max} value={value} aria-label={label} style={{ "--legacy-slider-value": `${percentage}%` }} onChange={(event) => onChange(Number(event.target.value))} />
      <output>{value}{suffix}</output>
    </label>
  );
}

function SettingRow({ title, description, children }) {
  return <div className="legacy-settings-row"><div><strong>{title}</strong>{description && <small>{description}</small>}</div><div>{children}</div></div>;
}

export default function TeacherOfflineSettingsDialog({ open, onClose }) {
  const settings = useTeacherOfflineSettings();
  const [activeTab, setActiveTab] = useState("audio");
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const onKeyDown = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus?.();
    };
  }, [onClose, open]);

  if (!open) return null;
  const update = (section, key, value) => updateTeacherOfflineSettings(section, { [key]: value });
  return (
    <div className="legacy-settings-backdrop" role="presentation">
      <section ref={dialogRef} className="legacy-settings-dialog" data-settings-motion-state="ready" role="dialog" aria-modal="true" aria-labelledby="legacy-settings-title" tabIndex={-1}>
        <h1 id="legacy-settings-title" className="sr-only">Classroom settings</h1>
        <div className="legacy-settings-tabs" role="tablist" aria-label="Settings sections">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" role="tab" aria-selected={activeTab === id} className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id)}><Icon aria-hidden="true" /><span>{label}</span></button>
          ))}
        </div>
        <button type="button" className="legacy-settings-close" data-sound="none" aria-label="Close settings" title="Close settings" onClick={onClose}><X /></button>

        <div className="legacy-settings-content" role="tabpanel" aria-label={`${tabs.find((tab) => tab.id === activeTab)?.label} settings`}>
          {activeTab === "audio" && (
            <div className="legacy-settings-panel" data-settings-panel="audio">
              <SettingRow title="Button sound effects"><LegacySlider label="Button sound effects volume" value={settings.audio.buttonVolume} onChange={(value) => update("audio", "buttonVolume", value)} /><LegacyToggle label="Button sound effects" checked={settings.audio.buttonEnabled} onChange={(value) => update("audio", "buttonEnabled", value)} /></SettingRow>
              <SettingRow title="Navigation sound effects"><LegacySlider label="Navigation sound effects volume" value={settings.audio.navigationVolume} onChange={(value) => update("audio", "navigationVolume", value)} /><LegacyToggle label="Navigation sound effects" checked={settings.audio.navigationEnabled} onChange={(value) => update("audio", "navigationEnabled", value)} /></SettingRow>
              <SettingRow title="Toolbar sound effects"><LegacySlider label="Toolbar sound effects volume" value={settings.audio.toolbarVolume} onChange={(value) => update("audio", "toolbarVolume", value)} /><LegacyToggle label="Toolbar sound effects" checked={settings.audio.toolbarEnabled} onChange={(value) => update("audio", "toolbarEnabled", value)} /></SettingRow>
            </div>
          )}
          {activeTab === "content" && (
            <div className="legacy-settings-panel" data-settings-panel="content">
              <h2>Show navbar buttons on:</h2>
              <SettingRow title="Left"><LegacyToggle label="Show left navbar buttons" checked={settings.content.showNavbarLeft} onChange={(value) => update("content", "showNavbarLeft", value)} /></SettingRow>
              <SettingRow title="Right"><LegacyToggle label="Show right navbar buttons" checked={settings.content.showNavbarRight} onChange={(value) => update("content", "showNavbarRight", value)} /></SettingRow>
              {!settings.content.showNavbarLeft && !settings.content.showNavbarRight && <p className="legacy-settings-note">The left group remains available as a safety navigation path while both sides are off.</p>}
            </div>
          )}
          {activeTab === "graphics" && (
            <div className="legacy-settings-panel" data-settings-panel="graphics">
              <SettingRow title="Interface style" description="Choose the Teacher shell design language">
                <SettingsSegmented
                  label="Interface style"
                  value={settings.graphics.appearanceMode}
                  options={[{ value: "modern", label: "Modern" }, { value: "legacy", label: "Legacy" }]}
                  onChange={(value) => update("graphics", "appearanceMode", value)}
                />
              </SettingRow>
              <SettingRow title="Animations" description="Screen transitions and control animations"><LegacyToggle label="Animations" checked={settings.graphics.motionEnabled} onChange={(value) => update("graphics", "motionEnabled", value)} /></SettingRow>
              <SettingRow title="Interface size" description="Scales readable classroom text"><LegacySlider label="Interface size" min={90} max={110} value={settings.graphics.interfaceScale} onChange={(value) => update("graphics", "interfaceScale", value)} /></SettingRow>
              <SettingRow title="Colour intensity" description="Adjusts the legacy glacier shell saturation"><LegacySlider label="Colour intensity" min={40} max={100} value={settings.graphics.colourIntensity} onChange={(value) => update("graphics", "colourIntensity", value)} /></SettingRow>
              <SettingRow title="Visual effects" description="Decorative shadows and surface treatments"><LegacyToggle label="Visual effects" checked={settings.graphics.effectsEnabled} onChange={(value) => update("graphics", "effectsEnabled", value)} /></SettingRow>
            </div>
          )}
          {activeTab === "about" && (
            <div className="legacy-settings-about" data-settings-panel="about">
              <h2>Software version info:</h2><strong>Hamilton House LMS</strong><p>Version 0.1.0</p>
              <div className="legacy-settings-brand"><b>HAMILTON HOUSE</b><span>English Language Teaching</span></div>
              <small>Interactive Classroom</small>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
