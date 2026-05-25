import { useCallback } from "react";
import { useSoundEffects } from "../context/SoundContext.jsx";

export function useUiSound() {
  const { playSound } = useSoundEffects();

  const playUiSound = useCallback((type = "clickConfirm") => {
    void playSound(type);
  }, [playSound]);

  return { playUiSound };
}

