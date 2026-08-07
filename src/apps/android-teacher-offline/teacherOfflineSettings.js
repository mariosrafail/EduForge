import { useSyncExternalStore } from "react";

export const TEACHER_OFFLINE_SETTINGS_STORAGE_KEY = "teacher-offline:ultimate-b2:settings:v2";
export const TEACHER_OFFLINE_SETTINGS_V1_STORAGE_KEY = "teacher-offline:ultimate-b2:settings:v1";
const LEGACY_SOUND_KEY = "teacher-offline:ultimate-b2:ui-sound";
const listeners = new Set();

// Temporary legacy-only presentation mode. Keep the stored preference and modern
// implementation intact so the switcher can be re-enabled without migration.
export const ACTIVE_TEACHER_THEME = "legacy";
export const ENABLE_TEACHER_THEME_SWITCHER = false;

export const DEFAULT_TEACHER_OFFLINE_SETTINGS = Object.freeze({
  audio: Object.freeze({ buttonEnabled: true, buttonVolume: 24, navigationEnabled: true, navigationVolume: 24, toolbarEnabled: true, toolbarVolume: 24 }),
  content: Object.freeze({ showNavbarLeft: true, showNavbarRight: true, menuAutoHide: false, menuDelay: 50 }),
  graphics: Object.freeze({
    appearanceMode: "modern",
    motionEnabled: true,
    interfaceScale: 100,
    colourIntensity: 100,
    effectsEnabled: true,
  }),
});

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value)));
const boolean = (value, fallback) => typeof value === "boolean" ? value : fallback;

export function sanitizeTeacherOfflineSettings(candidate = {}) {
  const audio = candidate.audio || {};
  const content = candidate.content || {};
  const graphics = candidate.graphics || {};
  return {
    audio: {
      buttonEnabled: boolean(audio.buttonEnabled, true),
      buttonVolume: clamp(audio.buttonVolume ?? 24, 0, 100),
      navigationEnabled: boolean(audio.navigationEnabled, true),
      navigationVolume: clamp(audio.navigationVolume ?? 24, 0, 100),
      toolbarEnabled: boolean(audio.toolbarEnabled, true),
      toolbarVolume: clamp(audio.toolbarVolume ?? 24, 0, 100),
    },
    content: {
      showNavbarLeft: boolean(content.showNavbarLeft, true),
      showNavbarRight: boolean(content.showNavbarRight, true),
      menuAutoHide: boolean(content.menuAutoHide, false),
      menuDelay: clamp(content.menuDelay ?? 50, 0, 100),
    },
    graphics: {
      appearanceMode: ["modern", "legacy"].includes(graphics.appearanceMode) ? graphics.appearanceMode : "modern",
      motionEnabled: boolean(graphics.motionEnabled, true),
      interfaceScale: clamp(graphics.interfaceScale ?? 100, 90, 110),
      colourIntensity: clamp(graphics.colourIntensity ?? 100, 40, 100),
      effectsEnabled: boolean(graphics.effectsEnabled, true),
    },
  };
}

export function migrateTeacherOfflineSettingsV1(candidate = {}) {
  return sanitizeTeacherOfflineSettings(candidate);
}

function persistSettings(value) {
  globalThis.localStorage?.setItem(TEACHER_OFFLINE_SETTINGS_STORAGE_KEY, JSON.stringify(value));
}

function readInitialSettings() {
  try {
    const saved = globalThis.localStorage?.getItem(TEACHER_OFFLINE_SETTINGS_STORAGE_KEY);
    if (saved) return sanitizeTeacherOfflineSettings(JSON.parse(saved));
    const savedV1 = globalThis.localStorage?.getItem(TEACHER_OFFLINE_SETTINGS_V1_STORAGE_KEY);
    if (savedV1) {
      const migrated = migrateTeacherOfflineSettingsV1(JSON.parse(savedV1));
      persistSettings(migrated);
      return migrated;
    }
    if (globalThis.localStorage?.getItem(LEGACY_SOUND_KEY) === "muted") {
      const migrated = sanitizeTeacherOfflineSettings({ audio: { buttonEnabled: false, navigationEnabled: false, toolbarEnabled: false } });
      persistSettings(migrated);
      return migrated;
    }
  } catch {
    // Defaults remain usable in restricted Android WebViews.
  }
  return sanitizeTeacherOfflineSettings(DEFAULT_TEACHER_OFFLINE_SETTINGS);
}

let settings = readInitialSettings();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getTeacherOfflineSettings() {
  return settings;
}

export function updateTeacherOfflineSettings(section, patch) {
  if (!Object.hasOwn(DEFAULT_TEACHER_OFFLINE_SETTINGS, section)) return;
  settings = sanitizeTeacherOfflineSettings({ ...settings, [section]: { ...settings[section], ...patch } });
  try {
    persistSettings(settings);
  } catch {
    // In-memory behavior remains available when persistence is blocked.
  }
  emit();
}

export function subscribeTeacherOfflineSettings(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTeacherOfflineSettings() {
  return useSyncExternalStore(subscribeTeacherOfflineSettings, getTeacherOfflineSettings, getTeacherOfflineSettings);
}

export function teacherMenuDelayMilliseconds(value = settings.content.menuDelay) {
  return Math.round(1000 + clamp(value, 0, 100) * 90);
}
