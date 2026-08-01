import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "interactive-classroom:annotations:v1";
const ClassroomToolsContext = createContext(null);

export const CLASSROOM_COLORS = ["#111827", "#e11d48", "#2563eb", "#16a34a"];
export const CLASSROOM_STROKES = [3, 6, 10];
export const DRAWING_TOOLS = new Set(["pen", "eraser", "text"]);

function validUnit(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function validDrawing(element) {
  if (!element || typeof element !== "object" || typeof element.id !== "string") return false;
  if (element.type === "stroke") return Array.isArray(element.points)
    && element.points.length <= 600
    && element.points.every((point) => validUnit(point?.x) && validUnit(point?.y));
  return element.type === "text" && validUnit(element.x) && validUnit(element.y) && typeof element.value === "string";
}

function validOverlay(element) {
  return Boolean(element)
    && typeof element === "object"
    && typeof element.id === "string"
    && ["cover", "spotlight"].includes(element.type)
    && [element.x, element.y, element.width, element.height].every(validUnit);
}

function normalizeSurface(value) {
  const legacy = Array.isArray(value) ? value : null;
  const drawingElements = legacy || (Array.isArray(value?.drawing) ? value.drawing : []);
  const drawing = drawingElements.filter(validDrawing).slice(-200);
  const overlayElements = legacy || [
    ...(Array.isArray(value?.covers) ? value.covers : []),
    ...(value?.spotlight ? [value.spotlight] : []),
  ];
  const covers = overlayElements.filter((element) => validOverlay(element) && element.type === "cover").slice(-40);
  const spotlight = overlayElements.filter((element) => validOverlay(element) && element.type === "spotlight").at(-1) || null;
  return { drawing, covers, spotlight };
}

export function migrateStoredClassroomAnnotations(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return {};
  return Object.fromEntries(Object.entries(candidate)
    .filter(([key, value]) => typeof key === "string" && key.length <= 180 && (Array.isArray(value) || (value && typeof value === "object")))
    .map(([key, value]) => [key, normalizeSurface(value)]));
}

function loadSurfaces() {
  if (typeof localStorage === "undefined") return {};
  try {
    return migrateStoredClassroomAnnotations(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
  } catch {
    return {};
  }
}

function emptyHistory() {
  return { past: [], present: [], future: [] };
}

function initialState() {
  const loaded = loadSurfaces();
  return {
    drawings: Object.fromEntries(Object.entries(loaded).map(([key, surface]) => [key, { ...emptyHistory(), present: surface.drawing }])),
    overlays: Object.fromEntries(Object.entries(loaded).map(([key, surface]) => [key, { covers: surface.covers, spotlight: surface.spotlight }])),
  };
}

export function ClassroomToolsProvider({ children }) {
  const [activeTool, setActiveTool] = useState("pointer");
  const [color, setColor] = useState(CLASSROOM_COLORS[1]);
  const [strokeWidth, setStrokeWidth] = useState(CLASSROOM_STROKES[1]);
  const [{ drawings, overlays }, setSurfaceState] = useState(initialState);
  const [regionZooms, setRegionZooms] = useState({});
  const [openPanel, setOpenPanel] = useState("");
  const [keyboardRequest, setKeyboardRequest] = useState(0);
  const [message, setMessage] = useState("");
  const [timer, setTimer] = useState({ duration: 300, remaining: 300, running: false });
  const [scores, setScores] = useState({ a: 0, b: 0 });

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    const keys = new Set([...Object.keys(drawings), ...Object.keys(overlays)]);
    const saved = Object.fromEntries([...keys].map((key) => [key, {
      drawing: (drawings[key] || emptyHistory()).present,
      covers: overlays[key]?.covers || [],
      spotlight: overlays[key]?.spotlight || null,
    }]));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // Classroom markup remains available for the current session if storage is unavailable.
    }
  }, [drawings, overlays]);

  useEffect(() => {
    if (!timer.running) return undefined;
    const interval = setInterval(() => {
      setTimer((current) => current.remaining <= 1
        ? { ...current, remaining: 0, running: false }
        : { ...current, remaining: current.remaining - 1 });
    }, 1000);
    return () => clearInterval(interval);
  }, [timer.running]);

  useEffect(() => {
    if (!message) return undefined;
    const timeout = setTimeout(() => setMessage(""), 3200);
    return () => clearTimeout(timeout);
  }, [message]);

  const getDrawingHistory = (surfaceKey) => drawings[surfaceKey] || emptyHistory();
  const getOverlays = (surfaceKey) => overlays[surfaceKey] || { covers: [], spotlight: null };
  const getRegionZoom = (surfaceKey) => regionZooms[surfaceKey] || null;
  const commitDrawing = (surfaceKey, update) => {
    setSurfaceState((current) => {
      const history = current.drawings[surfaceKey] || emptyHistory();
      const next = typeof update === "function" ? update(history.present) : update;
      if (!Array.isArray(next) || next === history.present) return current;
      return {
        ...current,
        drawings: {
          ...current.drawings,
          [surfaceKey]: {
            past: [...history.past.slice(-39), history.present],
            present: next.filter(validDrawing).slice(-200),
            future: [],
          },
        },
      };
    });
  };
  const undoDrawing = (surfaceKey) => setSurfaceState((current) => {
    const history = current.drawings[surfaceKey] || emptyHistory();
    if (!history.past.length) return current;
    return {
      ...current,
      drawings: {
        ...current.drawings,
        [surfaceKey]: {
          past: history.past.slice(0, -1),
          present: history.past.at(-1),
          future: [history.present, ...history.future.slice(0, 39)],
        },
      },
    };
  });
  const redoDrawing = (surfaceKey) => setSurfaceState((current) => {
    const history = current.drawings[surfaceKey] || emptyHistory();
    if (!history.future.length) return current;
    const [next, ...future] = history.future;
    return {
      ...current,
      drawings: {
        ...current.drawings,
        [surfaceKey]: { past: [...history.past.slice(-39), history.present], present: next, future },
      },
    };
  });
  const clearDrawing = (surfaceKey) => setSurfaceState((current) => ({
    ...current,
    drawings: { ...current.drawings, [surfaceKey]: emptyHistory() },
  }));
  const updateOverlays = (surfaceKey, update) => setSurfaceState((current) => {
    const present = current.overlays[surfaceKey] || { covers: [], spotlight: null };
    return { ...current, overlays: { ...current.overlays, [surfaceKey]: update(present) } };
  });
  const addCover = (surfaceKey, cover) => updateOverlays(surfaceKey, (current) => ({ ...current, covers: [...current.covers.slice(-39), cover] }));
  const removeCover = (surfaceKey, coverId) => updateOverlays(surfaceKey, (current) => ({ ...current, covers: current.covers.filter(({ id }) => id !== coverId) }));
  const clearCovers = (surfaceKey) => updateOverlays(surfaceKey, (current) => ({ ...current, covers: [] }));
  const setSpotlight = (surfaceKey, spotlight) => updateOverlays(surfaceKey, (current) => ({ ...current, spotlight: spotlight && validOverlay(spotlight) ? spotlight : null }));
  const clearAllMarkup = (surfaceKey) => setSurfaceState((current) => ({
    drawings: { ...current.drawings, [surfaceKey]: emptyHistory() },
    overlays: { ...current.overlays, [surfaceKey]: { covers: [], spotlight: null } },
  }));
  const setRegionZoom = (surfaceKey, region) => setRegionZooms((current) => ({ ...current, [surfaceKey]: region }));
  const resetRegionZoom = (surfaceKey) => setRegionZooms((current) => {
    if (!current[surfaceKey]) return current;
    const next = { ...current };
    delete next[surfaceKey];
    return next;
  });
  const setTimerMinutes = (minutes) => {
    const duration = Math.max(60, Math.min(60 * 99, Math.round(Number(minutes) || 1) * 60));
    setTimer({ duration, remaining: duration, running: false });
  };

  const value = useMemo(() => ({
    activeTool, setActiveTool, color, setColor, strokeWidth, setStrokeWidth,
    drawings, overlays, getDrawingHistory, commitDrawing, undoDrawing, redoDrawing, clearDrawing,
    getOverlays, addCover, removeCover, clearCovers, setSpotlight, clearAllMarkup,
    regionZooms, getRegionZoom, setRegionZoom, resetRegionZoom,
    openPanel, setOpenPanel, keyboardRequest, requestKeyboard: () => setKeyboardRequest((current) => current + 1),
    message, setMessage, timer, setTimer, setTimerMinutes, scores, setScores,
  }), [activeTool, color, drawings, keyboardRequest, message, openPanel, overlays, regionZooms, scores, strokeWidth, timer]);

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
