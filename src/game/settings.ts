// User preferences persisted to localStorage (template section 4), now a
// subscribable store so React screens and the engine share one source.
export interface GameSettings {
  volume: number;
  muted: boolean;
  music: boolean;
  stickSide: "left" | "right";
  performance: "high" | "low";
  screenShake: boolean;
  damageNumbers: boolean;
  runMinutes: 15 | 10 | 5;
}

export const DEFAULT_SETTINGS: GameSettings = {
  volume: 0.5,
  muted: false,
  music: true,
  stickSide: "left",
  performance: "high",
  screenShake: true,
  damageNumbers: true,
  runMinutes: 15,
};

const KEY = "space_survivors_settings_v1";
let state: GameSettings = { ...DEFAULT_SETTINGS };
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<GameSettings>) };
  } catch {
    /* storage unavailable */
  }
}

export const Settings = {
  get(): GameSettings {
    load();
    return state;
  },
  set<K extends keyof GameSettings>(k: K, v: GameSettings[K]) {
    load();
    state = { ...state, [k]: v };
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l());
  },
  reset() {
    state = { ...DEFAULT_SETTINGS };
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l());
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
