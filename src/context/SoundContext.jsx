import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "hh_lms_sound_muted";
const DEFAULT_VOLUME = 0.2;
const HOVER_COOLDOWN_MS = 90;

const SoundContext = createContext({
  muted: false,
  toggleMuted: () => {},
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
      return [{ type: "sine", frequency: 760, gain: 0.03, attack: 0.002, decay: 0.045 }];
    case "clickConfirm":
      return [
        { type: "triangle", frequency: 560, gain: 0.05, attack: 0.002, decay: 0.05 },
        { type: "sine", frequency: 820, gain: 0.02, attack: 0.002, decay: 0.05 },
      ];
    case "dragStart":
      return [
        { type: "triangle", frequency: 310, gain: 0.045, attack: 0.002, decay: 0.065 },
        { type: "sine", frequency: 520, gain: 0.022, attack: 0.002, decay: 0.07 },
      ];
    case "dragMoveTick":
      return [{ type: "sine", frequency: 520, gain: 0.014, attack: 0.002, decay: 0.03 }];
    case "dropSuccess":
      return [
        { type: "sine", frequency: 620, gain: 0.055, attack: 0.002, decay: 0.06 },
        { type: "triangle", frequency: 880, gain: 0.022, attack: 0.002, decay: 0.065 },
      ];
    case "dropInvalid":
      return [{ type: "square", frequency: 210, gain: 0.03, attack: 0.002, decay: 0.055 }];
    case "submit":
      return [
        { type: "triangle", frequency: 420, gain: 0.06, attack: 0.002, decay: 0.07 },
        { type: "sine", frequency: 640, gain: 0.025, attack: 0.006, decay: 0.09 },
      ];
    case "correct":
      return [
        { type: "sine", frequency: 660, gain: 0.04, attack: 0.002, decay: 0.07 },
        { type: "sine", frequency: 980, gain: 0.028, attack: 0.005, decay: 0.11 },
      ];
    case "wrong":
      return [
        { type: "triangle", frequency: 210, gain: 0.04, attack: 0.002, decay: 0.06 },
        { type: "sine", frequency: 170, gain: 0.02, attack: 0.002, decay: 0.09 },
      ];
    case "nextActivity":
      return [
        { type: "triangle", frequency: 520, gain: 0.038, attack: 0.002, decay: 0.05, pan: -0.12 },
        { type: "sine", frequency: 730, gain: 0.03, attack: 0.008, decay: 0.085, pan: 0.12 },
      ];
    case "modalOpen":
      return [{ type: "sine", frequency: 560, gain: 0.034, attack: 0.002, decay: 0.075 }];
    case "modalClose":
      return [{ type: "sine", frequency: 400, gain: 0.03, attack: 0.002, decay: 0.06 }];
    default:
      return [];
  }
}

export function SoundProvider({ children }) {
  const [muted, setMuted] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });
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
      master.gain.value = DEFAULT_VOLUME;
      master.connect(ctx.destination);
      audioCtxRef.current = ctx;
      masterRef.current = master;
    }
    return audioCtxRef.current;
  }, []);

  const unlockAudio = useCallback(() => {
    const ctx = ensureAudio();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    unlockedRef.current = true;
  }, [ensureAudio]);

  const playSound = useCallback((type) => {
    if (muted) return;
    const ctx = ensureAudio();
    if (!ctx || !masterRef.current || !unlockedRef.current) return;

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
  }, [ensureAudio, muted]);

  const playHoverFor = useCallback((element) => {
    if (!element) return;
    const hoverTimes = hoverTimesRef.current;
    const current = performance.now();
    const previous = hoverTimes.get(element) || 0;
    if (current - previous < HOVER_COOLDOWN_MS) return;
    hoverTimes.set(element, current);
    playSound("hoverSoft");
  }, [playSound]);

  const toggleMuted = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  useEffect(() => {
    const onPointerDown = () => unlockAudio();
    const onKeyDown = () => unlockAudio();
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("keydown", onKeyDown, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
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
      playSound(type);
    };
    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [playHoverFor, playSound]);

  const value = useMemo(() => ({ muted, toggleMuted, playSound }), [muted, playSound, toggleMuted]);

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSoundEffects() {
  return useContext(SoundContext);
}
