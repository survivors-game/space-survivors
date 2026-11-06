// Unified input layer (template section 5): keyboard + gamepad + touch joystick.
// The touch joystick UI lives in React (TouchControls) and writes into setTouch().

const keys = new Set<string>();
const justPressed = new Set<string>();
const touch = { x: 0, y: 0, active: false };
const gp = {
  connected: false,
  lx: 0,
  ly: 0,
  btn: new Map<number, boolean>(),
  just: new Set<number>(),
};
let boostQueued = false;
let attached = 0;

const onKeyDown = (e: KeyboardEvent) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
    const t = e.target as HTMLElement | null;
    if (!t || !t.closest || !t.closest("input,textarea,select")) e.preventDefault();
  }
  if (!keys.has(e.code)) justPressed.add(e.code);
  keys.add(e.code);
};
const onKeyUp = (e: KeyboardEvent) => {
  keys.delete(e.code);
};
const onBlur = () => {
  keys.clear();
  justPressed.clear();
  touch.x = 0;
  touch.y = 0;
  touch.active = false;
  boostQueued = false;
};

function pollGamepad() {
  const pads =
    typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
  let pad: Gamepad | null = null;
  for (const p of pads)
    if (p && p.connected) {
      pad = p;
      break;
    }
  if (!pad) {
    gp.connected = false;
    gp.lx = gp.ly = 0;
    return;
  }
  gp.connected = true;
  const dz = 0.18;
  const rawLx = pad.axes[0] ?? 0,
    rawLy = pad.axes[1] ?? 0;
  const lx = Number.isFinite(rawLx) ? rawLx : 0;
  const ly = Number.isFinite(rawLy) ? rawLy : 0;
  gp.lx = Math.abs(lx) < dz ? 0 : lx;
  gp.ly = Math.abs(ly) < dz ? 0 : ly;
  pad.buttons.forEach((b, i) => {
    if (b.pressed && !gp.btn.get(i)) gp.just.add(i);
    gp.btn.set(i, b.pressed);
  });
}

export const Input = {
  attach() {
    if (typeof window === "undefined") return;
    if (attached++ > 0) return;
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
  },
  detach() {
    if (typeof window === "undefined") return;
    if (--attached > 0) return;
    attached = 0;
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    onBlur();
  },
  pollGamepad,
  setTouch(x: number, y: number, active: boolean) {
    touch.x = Number.isFinite(x) ? x : 0;
    touch.y = Number.isFinite(y) ? y : 0;
    touch.active = active;
  },
  queueBoost() {
    boostQueued = true;
  },
  consumeJustPressed(code: string) {
    if (justPressed.has(code)) {
      justPressed.delete(code);
      return true;
    }
    return false;
  },
  gpJust(i: number) {
    if (gp.just.has(i)) {
      gp.just.delete(i);
      return true;
    }
    return false;
  },
  consumeBoost() {
    let b = boostQueued;
    boostQueued = false;
    if (
      this.consumeJustPressed("Space") ||
      this.consumeJustPressed("ShiftLeft") ||
      this.consumeJustPressed("ShiftRight")
    )
      b = true;
    if (this.gpJust(0) || this.gpJust(7)) b = true;
    return b;
  },
  consumePause() {
    return this.consumeJustPressed("Escape") || this.consumeJustPressed("KeyP") || this.gpJust(9);
  },
  getMoveVector() {
    let x = 0,
      y = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) y -= 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) y += 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
    if (touch.active) {
      x = touch.x;
      y = touch.y;
    }
    if (gp.connected && (Math.abs(gp.lx) > 0 || Math.abs(gp.ly) > 0)) {
      x = gp.lx;
      y = gp.ly;
    }
    if (!Number.isFinite(x)) x = 0;
    if (!Number.isFinite(y)) y = 0;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    return { x, y, mag: Math.min(1, m) };
  },
  endFrame() {
    justPressed.clear();
    gp.just.clear();
  },
  isTouchDevice() {
    if (typeof window === "undefined") return false;
    return "ontouchstart" in window || navigator.maxTouchPoints > 0;
  },
};
