import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "hh_lms_sound_muted";
const VOLUME_STORAGE_KEY = "hh_lms_sound_volume";
const DEFAULT_VOLUME = 0.95;
const HOVER_COOLDOWN_MS = 90;

const SoundContext = createContext({
  muted: false,
  audioReady: false,
  volume: DEFAULT_VOLUME,
  toggleMuted: () => {},
  enableSound: () => {},
  setVolume: () => {},
  unlockAudio: async () => false,
  playSound: () => {},
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function nowMs(audioCtx) {
  return audioCtx.currentTime;
}

function createVoice(audioCtx, { type = "sine", frequency = 440, gain = 0.14, attack = 0.003, decay = 0.09, pan = 0, detune = 0 }) {
  const osc = audioCtx.createOscillator();
  const amp = audioCtx.createGain();
  const stereo = audioCtx.createStereoPanner();
  const t = nowMs(audioCtx);
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, t);
  osc.detune.setValueAtTime(detune, t);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(clamp(gain, 0.0001, 0.8), t + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  stereo.pan.setValueAtTime(pan, t);
  osc.connect(amp);
  amp.connect(stereo);
  return { osc, stereo, stopAt: t + attack + decay + 0.02 };
}

function soundPlan(type) {
  switch (type) {
    case "hoverSoft":
      return [{ type: "sine", frequency: 980, gain: 0.022, attack: 0.0015, decay: 0.04 }];
    case "clickConfirm":
      return [
        { type: "triangle", frequency: 430, gain: 0.07, attack: 0.0015, decay: 0.045 },
        { type: "sine", frequency: 920, gain: 0.03, attack: 0.002, decay: 0.055 },
      ];
    case "dragStart":
      return [
        { type: "triangle", frequency: 260, gain: 0.06, attack: 0.0015, decay: 0.07 },
        { type: "sine", frequency: 480, gain: 0.03, attack: 0.002, decay: 0.075, pan: -0.08 },
      ];
    case "dragMoveTick":
      return [{ type: "sine", frequency: 600, gain: 0.012, attack: 0.0015, decay: 0.024 }];
    case "dropSuccess":
      return [
        { type: "sine", frequency: 700, gain: 0.085, attack: 0.0015, decay: 0.055 },
        { type: "triangle", frequency: 1080, gain: 0.038, attack: 0.002, decay: 0.07, pan: 0.06 },
      ];
    case "dropInvalid":
      return [
        { type: "square", frequency: 170, gain: 0.045, attack: 0.0015, decay: 0.05 },
        { type: "triangle", frequency: 130, gain: 0.018, attack: 0.002, decay: 0.07 },
      ];
    case "submit":
      return [
        { type: "triangle", frequency: 360, gain: 0.075, attack: 0.0015, decay: 0.07 },
        { type: "sine", frequency: 620, gain: 0.04, attack: 0.004, decay: 0.1 },
      ];
    case "correct":
      return [
        { type: "sine", frequency: 760, gain: 0.052, attack: 0.0015, decay: 0.07 },
        { type: "triangle", frequency: 1140, gain: 0.04, attack: 0.004, decay: 0.12, pan: 0.08 },
      ];
    case "wrong":
      return [
        { type: "triangle", frequency: 190, gain: 0.05, attack: 0.0015, decay: 0.06 },
        { type: "sine", frequency: 140, gain: 0.028, attack: 0.002, decay: 0.095 },
      ];
    case "nextActivity":
      return [
        { type: "triangle", frequency: 490, gain: 0.05, attack: 0.0015, decay: 0.05, pan: -0.14 },
        { type: "sine", frequency: 820, gain: 0.04, attack: 0.006, decay: 0.09, pan: 0.14 },
      ];
    case "modalOpen":
      return [{ type: "triangle", frequency: 540, gain: 0.045, attack: 0.0015, decay: 0.08 }];
    case "modalClose":
      return [{ type: "triangle", frequency: 320, gain: 0.04, attack: 0.0015, decay: 0.06 }];
    case "deleteRemove":
      return [
        { type: "square", frequency: 240, gain: 0.05, attack: 0.0015, decay: 0.045 },
        { type: "triangle", frequency: 180, gain: 0.024, attack: 0.0015, decay: 0.07, pan: -0.06 },
      ];
    default:
      return [];
  }
}

export function SoundProvider({ children }) {
  const [muted, setMuted] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });
  const [volume, setVolumeState] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_VOLUME;
    const saved = Number(window.localStorage.getItem(VOLUME_STORAGE_KEY));
    return Number.isFinite(saved) ? clamp(saved, 0, 1) : DEFAULT_VOLUME;
  });
  const mutedRef = useRef(muted);
  const volumeRef = useRef(volume);
  const [audioReady, setAudioReady] = useState(false);
  const audioCtxRef = useRef(null);
  const masterRef = useRef(null);
  const unlockedRef = useRef(false);
  const hoverTimesRef = useRef(new WeakMap());
  const lastTypeTimeRef = useRef({});

  const ensureAudio = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      const ctx = new AudioCtx();
      const master = ctx.createGain();
      master.gain.value = volumeRef.current;
      master.connect(ctx.destination);
      audioCtxRef.current = ctx;
      masterRef.current = master;
    }
    return audioCtxRef.current;
  }, []);

  const unlockAudio = useCallback(async () => {
    const ctx = ensureAudio();
    if (!ctx) return false;
    try {
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      const running = ctx.state === "running";
      unlockedRef.current = running;
      setAudioReady(running);
      return running;
    } catch {
      unlockedRef.current = false;
      setAudioReady(false);
      return false;
    }
  }, [ensureAudio]);

  const playSound = useCallback(async (type) => {
    if (mutedRef.current) return;
    if (!unlockedRef.current) return;
    const ctx = audioCtxRef.current;
    if (!ctx || !masterRef.current || ctx.state !== "running") return;

    const now = performance.now();
    if (type === "dragMoveTick") {
      const last = lastTypeTimeRef.current[type] || 0;
      if (now - last < 120) return;
      lastTypeTimeRef.current[type] = now;
    }

    const parts = soundPlan(type);
    parts.forEach((part) => {
      const { osc, stereo, stopAt } = createVoice(ctx, part);
      stereo.connect(masterRef.current);
      osc.start();
      osc.stop(stopAt);
    });
  }, []);

  const playHoverFor = useCallback((element) => {
    if (!element) return;
    const hoverTimes = hoverTimesRef.current;
    const current = performance.now();
    const previous = hoverTimes.get(element) || 0;
    if (current - previous < HOVER_COOLDOWN_MS) return;
    hoverTimes.set(element, current);
    void playSound("hoverSoft");
  }, [playSound]);

  const toggleMuted = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      mutedRef.current = next;
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  const enableSound = useCallback(() => {
    mutedRef.current = false;
    setMuted(false);
    window.localStorage.setItem(STORAGE_KEY, "0");
  }, []);

  const setVolume = useCallback((nextVolume) => {
    const normalized = clamp(Number(nextVolume), 0, 1);
    volumeRef.current = normalized;
    setVolumeState(normalized);
    window.localStorage.setItem(VOLUME_STORAGE_KEY, String(normalized));
    if (masterRef.current) {
      masterRef.current.gain.value = normalized;
    }
    if (normalized > 0 && mutedRef.current) {
      mutedRef.current = false;
      setMuted(false);
      window.localStorage.setItem(STORAGE_KEY, "0");
    }
  }, []);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    volumeRef.current = volume;
    if (masterRef.current) {
      masterRef.current.gain.value = volume;
    }
  }, [volume]);

  useEffect(() => {
    const onPointerDown = () => {
      void unlockAudio();
    };
    const onClick = () => {
      void unlockAudio();
    };
    const onKeyDown = () => {
      void unlockAudio();
    };
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("click", onClick, { passive: true });
    window.addEventListener("keydown", onKeyDown, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [unlockAudio]);

  useEffect(() => {
    const onPointerOver = (event) => {
      const target = event.target.closest?.("button, [role='button']");
      if (!target || target.disabled || target.dataset.soundIgnore === "true") return;
      playHoverFor(target);
    };
    const onClick = (event) => {
      const target = event.target.closest?.("button, [role='button']");
      if (!target || target.disabled || target.dataset.soundIgnore === "true") return;
      const type = target.dataset.soundClick || "clickConfirm";
      void playSound(type);
    };
    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [playHoverFor, playSound]);

  const value = useMemo(() => ({
    muted,
    audioReady,
    volume,
    toggleMuted,
    enableSound,
    setVolume,
    unlockAudio,
    playSound,
  }), [audioReady, enableSound, muted, playSound, setVolume, toggleMuted, unlockAudio, volume]);

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSoundEffects() {
  return useContext(SoundContext);
}
