import { useEffect, useSyncExternalStore } from "react";

import { legacyClassroomAssets } from "./legacyClassroomAssets.js";
import { getTeacherOfflineSettings, subscribeTeacherOfflineSettings, updateTeacherOfflineSettings } from "./teacherOfflineSettings.js";

let activeSound = null;
const soundPlayers = new Map();

const categoryKeys = Object.freeze({
  button: ["buttonEnabled", "buttonVolume"],
  navigation: ["navigationEnabled", "navigationVolume"],
  toolbar: ["toolbarEnabled", "toolbarVolume"],
});

function allCategoriesEnabled() {
  const audio = getTeacherOfflineSettings().audio;
  return audio.buttonEnabled && audio.navigationEnabled && audio.toolbarEnabled;
}

export function setLegacyClassroomSoundEnabled(nextEnabled) {
  const enabled = Boolean(nextEnabled);
  updateTeacherOfflineSettings("audio", {
    buttonEnabled: enabled,
    navigationEnabled: enabled,
    toolbarEnabled: enabled,
  });
  if (!enabled) {
    activeSound?.pause();
    activeSound = null;
  }
}

export function playLegacyClassroomSound(name, requestedCategory = "") {
  if (!legacyClassroomAssets.sounds[name]) return;
  const category = requestedCategory || (name === "pageTurn" ? "navigation" : "button");
  const [enabledKey, volumeKey] = categoryKeys[category] || categoryKeys.button;
  const audioSettings = getTeacherOfflineSettings().audio;
  if (!audioSettings[enabledKey] || audioSettings[volumeKey] <= 0) return;
  const textbookMediaIsPlaying = [...document.querySelectorAll("audio, video")]
    .some((media) => !media.paused && !media.ended && media !== activeSound);
  if (textbookMediaIsPlaying) return;
  activeSound?.pause();
  activeSound = soundPlayers.get(name) || new Audio(legacyClassroomAssets.sounds[name]);
  soundPlayers.set(name, activeSound);
  activeSound.currentTime = 0;
  activeSound.volume = audioSettings[volumeKey] / 100;
  activeSound.play().catch(() => {});
}

export function useLegacyClassroomSound() {
  const soundEnabled = useSyncExternalStore(
    subscribeTeacherOfflineSettings,
    allCategoriesEnabled,
    allCategoriesEnabled,
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
          playLegacyClassroomSound(hasIncorrect ? "incorrect" : hasCorrect ? "correct" : "button", "button");
        }, 80);
        return;
      }
      const navigationButton = button.closest(".legacy-page-navigation") || /next page|previous page|previous unit|next unit|unit overview|back to library/.test(text);
      const toolbarButton = button.closest(".classroom-teaching-toolbar");
      const category = toolbarButton ? "toolbar" : navigationButton ? "navigation" : "button";
      const sound = button.dataset.sound || (category === "navigation" ? "pageTurn" : "button");
      playLegacyClassroomSound(sound, category);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearTimeout(resultTimer);
      activeSound?.pause();
      activeSound = null;
      soundPlayers.clear();
    };
  }, []);
  return { enabled: soundEnabled, setEnabled: setLegacyClassroomSoundEnabled };
}
