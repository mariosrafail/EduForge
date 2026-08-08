import { useEffect, useSyncExternalStore } from "react";

import {
  getTeacherOfflineSettings,
  subscribeTeacherOfflineSettings,
  updateTeacherOfflineSettings,
} from "../android-teacher-offline/teacherOfflineSettings.js";

const categoryKeys = Object.freeze({
  button: ["buttonEnabled", "buttonVolume"],
  navigation: ["navigationEnabled", "navigationVolume"],
  toolbar: ["toolbarEnabled", "toolbarVolume"],
});
let activeSound = null;

function allCategoriesEnabled() {
  const audio = getTeacherOfflineSettings().audio;
  return audio.buttonEnabled && audio.navigationEnabled && audio.toolbarEnabled;
}

function setAllEnabled(value) {
  const enabled = Boolean(value);
  updateTeacherOfflineSettings("audio", { buttonEnabled: enabled, navigationEnabled: enabled, toolbarEnabled: enabled });
  if (!enabled) {
    activeSound?.pause();
    activeSound = null;
  }
}

export function useTeacherProjectSound(soundMap = {}) {
  const enabled = useSyncExternalStore(subscribeTeacherOfflineSettings, allCategoriesEnabled, allCategoriesEnabled);
  useEffect(() => {
    const players = new Map();
    const uniqueSources = [...new Set(Object.values(soundMap).filter(Boolean))];
    uniqueSources.forEach((source) => {
      const player = new Audio(source);
      player.preload = "auto";
      player.load();
      players.set(source, player);
    });
    const onClick = (event) => {
      const button = event.target.closest?.("button[data-teacher-control-id]");
      if (!button || button.disabled) return;
      const source = soundMap[button.dataset.teacherControlId];
      if (!source) return;
      const category = button.dataset.soundCategory || "button";
      const [enabledKey, volumeKey] = categoryKeys[category] || categoryKeys.button;
      const audio = getTeacherOfflineSettings().audio;
      if (!audio[enabledKey] || audio[volumeKey] <= 0) return;
      const textbookMediaIsPlaying = [...document.querySelectorAll("audio, video")]
        .some((media) => !media.paused && !media.ended && media !== activeSound);
      if (textbookMediaIsPlaying) return;
      activeSound?.pause();
      activeSound = players.get(source) || new Audio(source);
      players.set(source, activeSound);
      activeSound.currentTime = 0;
      activeSound.volume = audio[volumeKey] / 100;
      activeSound.play().catch(() => {});
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      activeSound?.pause();
      activeSound = null;
      players.clear();
    };
  }, [soundMap]);
  return { enabled, setEnabled: setAllEnabled };
}
