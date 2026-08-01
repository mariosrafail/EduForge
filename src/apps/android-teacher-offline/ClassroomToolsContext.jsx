import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "interactive-classroom:annotations:v1";
const ClassroomToolsContext = createContext(null);

export const CLASSROOM_COLORS = ["#111827", "#e11d48", "#2563eb", "#16a34a"];
export const CLASSROOM_STROKES = [3, 6, 10];

function validUnit(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function validAnnotation(element) {
  if (!element || typeof element !== "object" || typeof element.id !== "string") return false;
  if (element.type === "stroke") return Array.isArray(element.points)
    && element.points.length <= 600
    && element.points.every((point) => validUnit(point?.x) && validUnit(point?.y));
  if (element.type === "text") return validUnit(element.x) && validUnit(element.y) && typeof element.value === "string";
  if (["cover", "spotlight"].includes(element.type)) return [element.x, element.y, element.width, element.height].every(validUnit);
  return false;
}

function loadAnnotations() {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([key, value]) => (
      typeof key === "string" && key.length <= 180 && Array.isArray(value)
    )).map(([key, value]) => [key, value.filter(validAnnotation).slice(-200)]));
  } catch {
    return {};
  }
}

function initialHistories() {
  return Object.fromEntries(Object.entries(loadAnnotations()).map(([key, present]) => [key, {
    past: [],
    present,
    future: [],
  }]));
}

function emptyHistory() {
  return { past: [], present: [], future: [] };
}

export function ClassroomToolsProvider({ children }) {
  const [activeTool, setActiveTool] = useState("pointer");
  const [color, setColor] = useState(CLASSROOM_COLORS[1]);
  const [strokeWidth, setStrokeWidth] = useState(CLASSROOM_STROKES[1]);
  const [histories, setHistories] = useState(initialHistories);
  const [openPanel, setOpenPanel] = useState("");
  const [keyboardRequest, setKeyboardRequest] = useState(0);
  const [message, setMessage] = useState("");
  const [timer, setTimer] = useState({ duration: 300, remaining: 300, running: false });
  const [scores, setScores] = useState({ a: 0, b: 0 });

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    const saved = Object.fromEntries(Object.entries(histories).map(([key, history]) => [key, history.present]));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // Annotations remain available for the current session if storage is full or locked down.
    }
  }, [histories]);

  useEffect(() => {
    if (!timer.running) return undefined;
    const interval = setInterval(() => {
      setTimer((current) => {
        if (current.remaining <= 1) return { ...current, remaining: 0, running: false };
        return { ...current, remaining: current.remaining - 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timer.running]);

  useEffect(() => {
    if (!message) return undefined;
    const timeout = setTimeout(() => setMessage(""), 3200);
    return () => clearTimeout(timeout);
  }, [message]);

  const getHistory = (surfaceKey) => histories[surfaceKey] || emptyHistory();
  const commit = (surfaceKey, update) => {
    setHistories((current) => {
      const history = current[surfaceKey] || emptyHistory();
      const next = typeof update === "function" ? update(history.present) : update;
      if (!Array.isArray(next) || next === history.present) return current;
      return {
        ...current,
        [surfaceKey]: {
          past: [...history.past.slice(-39), history.present],
          present: next.slice(-200),
          future: [],
        },
      };
    });
  };
  const undo = (surfaceKey) => setHistories((current) => {
    const history = current[surfaceKey] || emptyHistory();
    if (!history.past.length) return current;
    const previous = history.past.at(-1);
    return {
      ...current,
      [surfaceKey]: {
        past: history.past.slice(0, -1),
        present: previous,
        future: [history.present, ...history.future.slice(0, 39)],
      },
    };
  });
  const redo = (surfaceKey) => setHistories((current) => {
    const history = current[surfaceKey] || emptyHistory();
    if (!history.future.length) return current;
    const [next, ...future] = history.future;
    return {
      ...current,
      [surfaceKey]: {
        past: [...history.past.slice(-39), history.present],
        present: next,
        future,
      },
    };
  });
  const setTimerMinutes = (minutes) => {
    const duration = Math.max(60, Math.min(60 * 99, Math.round(Number(minutes) || 1) * 60));
    setTimer({ duration, remaining: duration, running: false });
  };

  const value = useMemo(() => ({
    activeTool,
    setActiveTool,
    color,
    setColor,
    strokeWidth,
    setStrokeWidth,
    histories,
    getHistory,
    commit,
    undo,
    redo,
    openPanel,
    setOpenPanel,
    keyboardRequest,
    requestKeyboard: () => setKeyboardRequest((value) => value + 1),
    message,
    setMessage,
    timer,
    setTimer,
    setTimerMinutes,
    scores,
    setScores,
  }), [activeTool, color, histories, keyboardRequest, message, openPanel, scores, strokeWidth, timer]);

  return <ClassroomToolsContext.Provider value={value}>{children}</ClassroomToolsContext.Provider>;
}

export function useClassroomTools() {
  const value = useContext(ClassroomToolsContext);
  if (!value) throw new Error("Classroom tools must be used inside ClassroomToolsProvider");
  return value;
}

export function createClassroomElementId() {
  return globalThis.crypto?.randomUUID?.() || `classroom-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
