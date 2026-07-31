import { useEffect, useSyncExternalStore } from "react";

import { legacyClassroomAssets } from "./legacyClassroomAssets.js";

const storageKey = "teacher-offline:ultimate-b2:ui-sound";
const listeners = new Set();
let enabled = true;
let activeSound = null;
const soundPlayers = new Map();

try {
  enabled = globalThis.localStorage?.getItem(storageKey) !== "muted";
} catch {
  // Keep the non-disruptive persisted default when storage is unavailable.
}

function emit() {
  listeners.forEach((listener) => listener());
}

export function setLegacyClassroomSoundEnabled(nextEnabled) {
  enabled = Boolean(nextEnabled);
  if (!enabled) {
    activeSound?.pause();
    activeSound = null;
  }
  try {
    globalThis.localStorage?.setItem(storageKey, enabled ? "enabled" : "muted");
  } catch {
    // The toggle still works for this session in restricted WebViews.
  }
  emit();
}

export function playLegacyClassroomSound(name) {
  if (!enabled || !legacyClassroomAssets.sounds[name]) return;
  const textbookMediaIsPlaying = [...document.querySelectorAll("audio, video")]
    .some((media) => !media.paused && !media.ended && media !== activeSound);
  if (textbookMediaIsPlaying) return;
  activeSound?.pause();
  activeSound = soundPlayers.get(name) || new Audio(legacyClassroomAssets.sounds[name]);
  soundPlayers.set(name, activeSound);
  activeSound.currentTime = 0;
  activeSound.volume = 0.24;
  activeSound.play().catch(() => {});
}

export function useLegacyClassroomSound() {
  const soundEnabled = useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => enabled,
  );
  useEffect(() => {
    let resultTimer = 0;
    Object.entries(legacyClassroomAssets.sounds).forEach(([name, source]) => {
      const player = new Audio(source);
      player.preload = "auto";
      player.load();
      soundPlayers.set(name, player);
    });
    const onClick = (event) => {
      const button = event.target.closest?.("button");
      if (!button || button.disabled || button.dataset.sound === "none") return;
      const text = `${button.textContent || ""} ${button.title || ""}`.toLowerCase();
      if (/^\s*check\s*$/.test(button.textContent || "")) {
        clearTimeout(resultTimer);
        resultTimer = globalThis.setTimeout(() => {
          const hasIncorrect = document.querySelector(".presentation-answer-incorrect, .legacy-pilot-answer-incorrect");
          const hasCorrect = document.querySelector(".presentation-answer-correct, .legacy-pilot-answer-correct");
          playLegacyClassroomSound(hasIncorrect ? "incorrect" : hasCorrect ? "correct" : "button");
        }, 80);
        return;
      }
      const sound = button.dataset.sound || (/next page|previous page/.test(text) ? "pageTurn" : "button");
      playLegacyClassroomSound(sound);
    };
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      clearTimeout(resultTimer);
      activeSound?.pause();
      activeSound = null;
      soundPlayers.clear();
    };
  }, []);
  return { enabled: soundEnabled, setEnabled: setLegacyClassroomSoundEnabled };
}
