// SPACE SURVIVORS combat engine. Evolved from the template's Game class
// (section 12): same pools, state machine, update order and render loop,
// extended with pixel-art ships, families, bosses, stages and hazards.
import { CONFIG } from "./config";
import { CREDIT_REWARD_MULT } from "./meta/progress";
import { Audio } from "./audio";
import { Input } from "./input";
import { Pool } from "./pool";
import { Settings } from "./settings";
import { Backdrop } from "./background";
import { ITEM_BY_KIND } from "./data/items";
import { drawSprite, getSprite, glow } from "./sprites";
import { TAU, angDiff, clamp, distToSegSq, lerp, mulberry32, rand, choice } from "./utils";
import type {
  DmgNumber,
  Enemy,
  EnemyProjectile,
  EProjKind,
  Gem,
  Hazard,
  HudState,
  LineFx,
  Obstacle,
  Particle,
  Pickup,
  PickupKind,
  Player,
  ProjKind,
  Projectile,
  Ring,
  RunResult,
  UpgradeChoice,
  WeaponState,
} from "./types";
import { shipById, type ShipDef } from "./data/ships";
import type { StageDef } from "./data/stages";
import { ENEMIES, enemyById } from "./data/enemies";
import { bossById } from "./data/bosses";
import type {
  BossCombatEvidence,
  BossCombatEvent,
  BossCombatEventType,
} from "./meta/boss-combat-proof";
import { BOSS_COOLDOWN_MS } from "./data/boss-rewards";
import { WEAPONS, dronePos, droneCount, fieldRadius, weaponById } from "./data/weapons";
import { PASSIVES, passiveById } from "./data/passives";
import type { HangarBonuses } from "./meta/upgrades";
import {
  BOSS_SCHEDULE,
  FORMATIONS,
  enemyDmgScale,
  enemyHpScale,
  phaseAt,
  pickWeighted,
  spawnInterval,
  toMissionMinute,
  xpForLevel,
  WORLD1_HORDES,
  WORLD1_ID,
  hordeIndexAt,
  CAMPAIGN_FINAL_BOSSES,
  WORLD1_MAX_ENEMIES,
  WORLD1_PICKUP_CHANCE,
  WORLD1_HORDE_PRESSURE,
} from "./timeline";

export type EngineState = "PLAYING" | "LEVEL_UP" | "PAUSED" | "DYING" | "WINNING" | "ENDED";

export interface BossAttempt {
  token: string;
  seed: string;
  issued_at: number;
  expires_at: number;
  boss: {
    hp: number;
    damage: number;
    min_combat_ms: number;
    max_hit_damage: number;
  };
}

export interface EngineCallbacks {
  onLevelUp: (choices: UpgradeChoice[], rerolls: number) => void;
  onEnd: (r: RunResult) => void;
  onPauseChange: (paused: boolean) => void;
  onBossStarted?: (bossId: string) => Promise<BossAttempt>;
  onBossDefeated?: (
    bossId: string,
    token: string,
    seed: string,
    result: "victory" | "defeat",
    evidence: BossCombatEvidence,
  ) => void;
  onBossHelpState?: (state: BossHelpState) => void;
  onChatEvent?: (event: { type: "boss_kill"; bossName: string; shipName: string }) => void;
  onItemCollected?: (kind: PickupKind) => void;
}

export interface BossHelpState {
  bossId: string;
  bossName: string;
  bossX: number;
  bossY: number;
  bossHp: number;
  bossMaxHp: number;
  hostX: number;
  hostY: number;
  hostHp: number;
  hostMaxHp: number;
  enemyShots: { x: number; y: number }[];
}

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  ship: ShipDef;
  stage: StageDef;
  hangar: HangarBonuses;
  durationSec: number;
  isEndless?: boolean;
  bossCooldowns?: Record<string, number>;
  inventory?: Partial<Record<PickupKind, number>>;
  callbacks: EngineCallbacks;
}

interface Spore {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  t: number;
}
interface Ghost {
  x: number;
  y: number;
  a: number;
  life: number;
  sprite: string;
  scale: number;
}

const PLAYER_SCALE = 2.4;
const CELL = 96;
const HALF = CONFIG.world.arenaRadius + 900;
const GN = Math.ceil((HALF * 2) / CELL);

export class Engine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  W = 0;
  H = 0;
  dpr = 1;
  zoom = 1;
  state: EngineState = "PLAYING";
  ship: ShipDef;
  stage: StageDef;
  hangar: HangarBonuses;
  cb: EngineCallbacks;
  duration: number;
  elapsed = 0;
  minute = 0;
  realTime = 0;
  player: Player;
  enemies: Pool<Enemy>;
  projectiles: Pool<Projectile>;
  eProj: Pool<EnemyProjectile>;
  particles: Pool<Particle>;
  gems: Pool<Gem>;
  pickups: Pool<Pickup>;
  dmgNums: Pool<DmgNumber>;
  hazards: Hazard[] = [];
  rings: Ring[] = [];
  lines: LineFx[] = [];
  obstacles: Obstacle[] = [];
  spores: Spore[] = [];
  ghosts: Ghost[] = [];
  qbuf: Enemy[] = [];
  private cellHead = new Int32Array(GN * GN);
  private cellNext: Int32Array;
  cam = { x: 0, y: 0, shake: 0 };
  backdrop: Backdrop;
  uid = 1;
  spawnTimer: number = CONFIG.spawn.initialDelay;
  formationTimer = 20;
  hazardTimer = 8;
  nextBoss = 0;
  bossWarnAt = -1;
  boss: Enemy | null = null;
  private bossSpawnPending = false;
  private bossAttemptToken: string | null = null;
  private bossAttemptSeed = "";
  private bossAttemptIssuedAt = 0;
  private bossFightStartedAt = 0;
  private bossDamageDealt = 0;
  private bossDamageReceived = 0;
  private bossHitCount = 0;
  private bossCombatEvents: BossCombatEvent[] = [];
  private helperPosition: { x: number; y: number; ship: ShipDef } | null = null;
  private lastHelperShotAt = 0;
  pendingLevelUps = 0;
  choices: UpgradeChoice[] = [];
  bannerState: HudState["banner"] = null;
  hordeNotice: { horde: number; elapsed: number } | null = null;
  lastPhase = 0;
  flash = 0;
  inventory: Record<PickupKind, number> = { repair: 0, magnet: 0, emp: 0 };
  endTimer = 0;
  kills = 0;
  killsByType: Record<string, number> = {};
  bossesDefeated: string[] = [];
  private bossCooldowns: Record<string, number>;
  damageDealt = 0;
  damageTaken = 0;
  energy = 0;
  evolutions = 0;
  creditsRaw = 0;
  maxPhase = 0;
  lastHorde = 0;
  finalBossDead = false;
  private raf = 0;
  private last = 0;
  private running = false;
  private isEndless: boolean = false;
  private xpScale: number;
  private bossScale: number;
  private onResize = () => this.resize();
  private onVis = () => {
    if (document.hidden) this.pause();
  };

  constructor(o: EngineOptions) {
    this.canvas = o.canvas;
    this.ctx = o.canvas.getContext("2d")!;
    this.ship = o.ship;
    this.stage = o.stage;
    this.hangar = o.hangar;
    this.cb = o.callbacks;
    this.inventory = { repair: o.inventory?.repair ?? 0, magnet: o.inventory?.magnet ?? 0, emp: o.inventory?.emp ?? 0 };
    this.bossCooldowns = { ...o.bossCooldowns };
    this.isEndless = Boolean(o.isEndless);
    this.duration = this.isEndless ? Infinity : o.durationSec;
    this.xpScale = this.isEndless ? 1 : Math.sqrt(900 / this.duration);
    this.bossScale = this.isEndless
      ? this.stage.difficulty
      : Math.sqrt(this.duration / 900) * this.stage.difficulty;
    this.enemies = new Pool(() => this.makeEnemy(), CONFIG.pools.enemies);
    this.cellNext = new Int32Array(CONFIG.pools.enemies);
    this.projectiles = new Pool(() => this.makeProj(), CONFIG.pools.projectiles);
    this.eProj = new Pool(
      () => ({
        alive: false,
        idx: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        dmg: 0,
        life: 0,
        maxLife: 0,
        radius: 5,
        kind: "orb" as EProjKind,
        color: "#fff",
        tx: 0,
        ty: 0,
        aoe: 0,
        t: 0,
      }),
      CONFIG.pools.enemyProjectiles,
    );
    this.particles = new Pool(
      () => ({
        alive: false,
        idx: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        color: "#fff",
        size: 3,
        drag: 0.92,
        add: false,
        kind: 0 as 0 | 1 | 2,
        grow: 0,
      }),
      CONFIG.pools.particles,
    );
    this.gems = new Pool(
      () => ({
        alive: false,
        idx: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        value: 0,
        tier: 0 as 0 | 1 | 2 | 3,
        bobT: 0,
        pulled: false,
      }),
      CONFIG.pools.gems,
    );
    this.pickups = new Pool(
      () => ({ alive: false, idx: 0, x: 0, y: 0, kind: "repair" as PickupKind, t: 0 }),
      CONFIG.pools.pickups,
    );
    this.dmgNums = new Pool(
      () => ({
        alive: false,
        idx: 0,
        x: 0,
        y: 0,
        vy: 0,
        life: 0,
        value: 0,
        crit: false,
        color: "#fff",
      }),
      CONFIG.pools.dmgNumbers,
    );
    this.player = this.makePlayer();
    this.backdrop = new Backdrop(this.stage);
    this.buildObstacles();
    if (this.stage.hazard === "spores")
      for (let i = 0; i < 12; i++) this.addSpore(rand(-2000, 2000), rand(-2000, 2000));
    const starter = weaponById(this.ship.startWeapon) ?? WEAPONS[0]!;
    this.addWeapon(starter.id);
    this.recomputeStats(true);
    this.resize();
  }

  /* ------------------------------ lifecycle ------------------------------ */
  start() {
    if (this.running) return;
    this.running = true;
    Input.attach();
    window.addEventListener("resize", this.onResize);
    window.visualViewport?.addEventListener("resize", this.onResize);
    document.addEventListener("visibilitychange", this.onVis);
    Audio.setMusic(1);
    if (this.isEndless) {
      this.banner(this.stage.name, "MODO INFINITO · Supervivencia extrema (Práctica)", "warn");
    } else {
      this.banner(
        this.stage.name,
        "Sobrevive 15 minutos de mision"
          .replace("15", String(Math.round(this.duration / 60)))
          .replace("mision", "misión"),
        "info",
      );
    }
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(CONFIG.frame.maxDt, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    Input.detach();
    window.removeEventListener("resize", this.onResize);
    window.visualViewport?.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVis);
    Audio.setMusic(0);
  }

  resize() {
    const rawDpr = window.devicePixelRatio;
    const dpr = Number.isFinite(rawDpr) && rawDpr > 0 ? Math.min(rawDpr, CONFIG.visuals.dprCap) : 1;
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    const viewportWidth =
      Number.isFinite(window.innerWidth) && window.innerWidth > 0 ? window.innerWidth : 320;
    const viewportHeight =
      Number.isFinite(window.innerHeight) && window.innerHeight > 0 ? window.innerHeight : 320;
    const rawWidth = rect?.width;
    const rawHeight = rect?.height;
    const w = Math.max(
      320,
      Math.floor(
        typeof rawWidth === "number" && Number.isFinite(rawWidth) && rawWidth > 0
          ? rawWidth
          : viewportWidth,
      ),
    );
    const h = Math.max(
      320,
      Math.floor(
        typeof rawHeight === "number" && Number.isFinite(rawHeight) && rawHeight > 0
          ? rawHeight
          : viewportHeight,
      ),
    );
    this.canvas.width = Math.max(1, Math.floor(w * dpr));
    this.canvas.height = Math.max(1, Math.floor(h * dpr));
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.W = w;
    this.H = h;
    this.dpr = dpr;
    this.zoom = clamp(Math.min(w, h) / 780, 0.62, 1.1);
    this.ensureFiniteWorldState();
  }

  private ensureFiniteWorldState() {
    const p = this.player;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      p.x = 0;
      p.y = 0;
      p.vx = 0;
      p.vy = 0;
    } else {
      const distance = Math.hypot(p.x, p.y);
      if (!Number.isFinite(distance)) {
        p.x = 0;
        p.y = 0;
        p.vx = 0;
        p.vy = 0;
      } else if (distance > CONFIG.world.arenaRadius) {
        p.x = (p.x / distance) * CONFIG.world.arenaRadius;
        p.y = (p.y / distance) * CONFIG.world.arenaRadius;
      }
    }
    if (!Number.isFinite(p.vx)) p.vx = 0;
    if (!Number.isFinite(p.vy)) p.vy = 0;
    if (!Number.isFinite(p.angle)) p.angle = -Math.PI / 2;
    if (!Number.isFinite(p.facingX) || !Number.isFinite(p.facingY)) {
      p.facingX = 0;
      p.facingY = -1;
    }
    if (!Number.isFinite(this.cam.x)) this.cam.x = p.x;
    if (!Number.isFinite(this.cam.y)) this.cam.y = p.y;
    if (!Number.isFinite(this.cam.shake)) this.cam.shake = 0;
    if (!Number.isFinite(this.zoom) || this.zoom <= 0) this.zoom = 1;
  }

  pause() {
    if (this.state !== "PLAYING") return;
    this.state = "PAUSED";
    this.cb.onPauseChange(true);
  }
  resume() {
    if (this.state !== "PAUSED") return;
    this.state = "PLAYING";
    this.last = performance.now();
    this.cb.onPauseChange(false);
  }

  getBossHelpState(): BossHelpState | null {
    const boss = this.boss;
    if (!boss?.boss) return null;
    const enemyShots: { x: number; y: number }[] = [];
    this.eProj.forEachAlive((shot) => {
      if (enemyShots.length < 40) enemyShots.push({ x: shot.x, y: shot.y });
    });
    return {
      bossId: boss.boss.id,
      bossName: boss.boss.name,
      bossX: boss.x,
      bossY: boss.y,
      bossHp: Math.max(0, boss.hp),
      bossMaxHp: boss.maxHp,
      hostX: this.player.x,
      hostY: this.player.y,
      hostHp: this.player.hp,
      hostMaxHp: this.player.maxHp,
      enemyShots,
    };
  }

  applyHelperShot(damage: number): void {
    const boss = this.boss;
    const now = Date.now();
    if (!boss?.alive || !boss.boss || now - this.lastHelperShotAt < 400) return;
    this.lastHelperShotAt = now;
    this.damageEnemy(boss, Math.min(35, Math.max(1, damage)));
  }

  setHelperPosition(x: number, y: number, shipId = "falcon"): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const ship = shipById(shipId);
    if (!ship) return;
    this.helperPosition = {
      x: Math.max(this.player.x - 500, Math.min(this.player.x + 500, this.player.x + x)),
      y: Math.max(this.player.y - 500, Math.min(this.player.y + 500, this.player.y + y)),
      ship,
    };
  }

  private frame(dt: number) {
    Input.pollGamepad();
    if (Input.consumePause()) {
      if (this.state === "PLAYING") this.pause();
      else if (this.state === "PAUSED") this.resume();
    }
    this.realTime += dt;
    if (this.state === "PLAYING" || this.state === "DYING") this.update(dt);
    else if (this.state === "WINNING") this.update(dt * 0.35);
    this.draw(dt);
    Input.endFrame();
  }

  /* ------------------------------ factories ------------------------------ */
  private makeEnemy(): Enemy {
    return {
      alive: false,
      idx: 0,
      uid: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      angle: 0,
      hp: 0,
      maxHp: 0,
      dmg: 0,
      speed: 0,
      radius: 10,
      def: ENEMIES[0]!,
      boss: null,
      elite: false,
      hitFlash: 0,
      knockX: 0,
      knockY: 0,
      t: 0,
      aiT: 0,
      aiState: 0,
      aiN: 0,
      tx: 0,
      ty: 0,
      shootCD: 0,
      slow: 0,
      contactCD: 0,
      droneCD: 0,
      phase: 0,
      shield: 0,
      shieldMax: 0,
      parentUid: -1,
      orbitA: 0,
      dying: 0,
      turretA: [],
    };
  }
  private makeProj(): Projectile {
    return {
      alive: false,
      idx: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      dmg: 0,
      life: 0,
      maxLife: 0,
      radius: 4,
      kind: "laser",
      color: "#fff",
      pierce: 0,
      hits: new Set(),
      target: null,
      targetUid: -1,
      aoe: 0,
      turn: 0,
      speed: 0,
      evolved: false,
      trailT: 0,
    };
  }
  private makePlayer(): Player {
    const s = this.ship;
    return {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      facingX: 0,
      facingY: -1,
      hp: s.hp,
      maxHp: s.hp,
      shield: 0,
      shieldMax: 0,
      shieldDelay: 0,
      shieldRegen: 0,
      level: 1,
      xp: 0,
      xpToNext: xpForLevel(2),
      speed: s.speed,
      pickupRadius: s.pickup,
      dmgMult: 1,
      cdMult: 1,
      xpMult: 1,
      critChance: s.crit,
      regen: 0,
      armor: 0,
      iframe: 1,
      boostT: 0,
      boostCD: 0,
      boostCDMax: CONFIG.boost.cooldown,
      weapons: [],
      passives: {},
      ship: s,
      hitT: 0,
      fireFlash: 0,
      slowT: 0,
      rerolls: 1 + this.hangar.rerolls + (s.id === "falcon" ? 1 : 0),
      radius: CONFIG.player.radius,
    };
  }

  private buildObstacles() {
    const rnd = mulberry32(this.stage.id.charCodeAt(0) * 131 + 7);
    const R = CONFIG.world.arenaRadius - 120;
    const kind = this.stage.obstacles;
    let tries = 0;
    while (this.obstacles.length < this.stage.obstacleCount && tries++ < 2000) {
      const a = rnd() * TAU,
        d = Math.sqrt(rnd()) * R;
      const x = Math.cos(a) * d,
        y = Math.sin(a) * d;
      if (Math.hypot(x, y) < 380) continue;
      const i = Math.floor(rnd() * 6);
      let sprite = "",
        scale = 3.4;
      if (kind === "asteroids") {
        sprite = `rock_ash_${i}`;
        scale = 3.4 + rnd() * 1.2;
      } else if (kind === "debris") {
        sprite = `rock_nova_${i}`;
        scale = 3;
      } else if (kind === "spires") {
        sprite = `spire_${i}`;
        scale = 3.6;
      } else {
        sprite = rnd() > 0.5 ? "pillar_l" : "pillar_s";
        scale = 4;
      }
      const spr = getSprite(sprite);
      const r = (((spr.w - 2) * scale) / 2) * 0.82;
      if (this.obstacles.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 120)) continue;
      this.obstacles.push({
        x,
        y,
        r,
        rot: rnd() * TAU,
        spin: kind === "asteroids" || kind === "debris" ? (rnd() - 0.5) * 0.3 : 0,
        sprite,
        scale,
      });
    }
  }

  /* ------------------------------ helpers (used by data) ------------------------------ */
  banner(title: string, sub: string, tone: "info" | "alert" | "good" | "warn") {
    this.bannerState = { title, sub, tone, t: 3.2 };
  }
  shake(n: number) {
    this.cam.shake = Math.max(this.cam.shake, n);
  }

  localToWorld(lx: number, ly: number) {
    const p = this.player;
    const r = p.angle + Math.PI / 2;
    const c = Math.cos(r),
      s = Math.sin(r);
    return { x: p.x + (lx * c - ly * s) * PLAYER_SCALE, y: p.y + (lx * s + ly * c) * PLAYER_SCALE };
  }
  bossLocal(e: Enemy, lx: number, ly: number) {
    const sc = e.boss ? e.boss.scale : e.def.scale;
    const r = e.angle + Math.PI / 2;
    const c = Math.cos(r),
      s = Math.sin(r);
    return { x: e.x + (lx * c - ly * s) * sc, y: e.y + (lx * s + ly * c) * sc };
  }

  nearestEnemy(x: number, y: number, maxR: number): Enemy | null {
    let best: Enemy | null = null,
      bd = maxR * maxR;
    const it = this.enemies.items;
    for (let i = 0; i < it.length; i++) {
      const e = it[i]!;
      if (!e.alive || e.dying > 0) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  randomEnemyNear(
    x: number,
    y: number,
    r: number,
    excludeUid = -1,
    exclude?: Set<number>,
  ): Enemy | null {
    const n = this.queryEnemies(x, y, r);
    let pick: Enemy | null = null,
      seen = 0;
    for (let i = 0; i < n; i++) {
      const e = this.qbuf[i]!;
      if (e.uid === excludeUid || (exclude && exclude.has(e.uid))) continue;
      seen++;
      if (Math.random() * seen < 1) pick = e;
    }
    return pick;
  }

  private buildGrid() {
    this.cellHead.fill(-1);
    const it = this.enemies.items;
    for (let i = 0; i < it.length; i++) {
      const e = it[i]!;
      if (!e.alive) continue;
      const c = this.cellOf(e.x, e.y);
      this.cellNext[i] = this.cellHead[c]!;
      this.cellHead[c] = i;
    }
  }
  private cellOf(x: number, y: number) {
    const cx = clamp(Math.floor((x + HALF) / CELL), 0, GN - 1);
    const cy = clamp(Math.floor((y + HALF) / CELL), 0, GN - 1);
    return cy * GN + cx;
  }

  /** Fills this.qbuf with alive enemies overlapping the circle; returns count. */
  queryEnemies(x: number, y: number, r: number): number {
    let n = 0;
    const m = r + 90;
    const x0 = clamp(Math.floor((x - m + HALF) / CELL), 0, GN - 1),
      x1 = clamp(Math.floor((x + m + HALF) / CELL), 0, GN - 1);
    const y0 = clamp(Math.floor((y - m + HALF) / CELL), 0, GN - 1),
      y1 = clamp(Math.floor((y + m + HALF) / CELL), 0, GN - 1);
    const it = this.enemies.items;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        let i = this.cellHead[cy * GN + cx]!;
        while (i !== -1) {
          const e = it[i]!;
          if (e.alive && e.dying <= 0) {
            const rr = r + e.radius;
            if ((e.x - x) ** 2 + (e.y - y) ** 2 < rr * rr) this.qbuf[n++] = e;
          }
          i = this.cellNext[i]!;
        }
      }
    }
    return n;
  }

  countChildren(uid: number) {
    let n = 0;
    this.enemies.forEachAlive((e) => {
      if (e.parentUid === uid) n++;
    });
    return n;
  }

  fireProj(
    kind: ProjKind,
    x: number,
    y: number,
    a: number,
    speed: number,
    dmg: number,
    o: {
      radius?: number;
      pierce?: number;
      life?: number;
      color?: string;
      aoe?: number;
      turn?: number;
      targetUid?: number;
      evolved?: boolean;
      speed?: number;
    },
  ) {
    const p = this.projectiles.spawn();
    if (!p) return;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(a) * speed;
    p.vy = Math.sin(a) * speed;
    p.dmg = dmg;
    p.radius = o.radius ?? 4;
    p.pierce = o.pierce ?? 0;
    p.life = p.maxLife = o.life ?? 1;
    p.color = o.color ?? "#fff";
    p.aoe = o.aoe ?? 0;
    p.turn = o.turn ?? 0;
    p.evolved = o.evolved ?? false;
    p.speed = o.speed ?? speed;
    p.trailT = 0;
    p.hits.clear();
    p.targetUid = o.targetUid ?? -1;
    p.target = null;
    if (p.targetUid >= 0)
      this.enemies.forEachAlive((e) => {
        if (e.uid === p.targetUid) p.target = e;
      });
  }

  spawnEnemyProj(
    x: number,
    y: number,
    a: number,
    speed: number,
    dmg: number,
    kind: EProjKind,
    color: string,
    radius: number,
    o: { tx?: number; ty?: number; aoe?: number; life?: number } = {},
  ) {
    const p = this.eProj.spawn();
    if (!p) return;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(a) * speed;
    p.vy = Math.sin(a) * speed;
    p.kind = kind;
    p.color = color;
    p.radius = radius;
    p.dmg = dmg * enemyDmgScale(this.minute, this.stage.dmgMult) * 0.8;
    p.life = p.maxLife = o.life ?? 5;
    p.t = 0;
    p.tx = o.tx ?? 0;
    p.ty = o.ty ?? 0;
    p.aoe = o.aoe ?? 0;
  }

  addHazard(h: Partial<Hazard> & { kind: Hazard["kind"]; x: number; y: number }) {
    if (this.hazards.length > 70) return;
    this.hazards.push({
      x2: 0,
      y2: 0,
      r: 60,
      w: 30,
      warn: 1,
      dur: 0,
      t: 0,
      color: "#ff3df2",
      hitsEnemies: false,
      hitPlayer: false,
      tick: 0,
      meteor: false,
      ...h,
      dmg:
        (h.dmg ?? 20) *
        (h.meteor ? this.stage.dmgMult : enemyDmgScale(this.minute, this.stage.dmgMult) * 0.75),
    });
  }

  addRing(x: number, y: number, maxR: number, dmg: number, color: string, delay: number) {
    if (this.rings.length > 30) return;
    this.rings.push({
      x,
      y,
      r: 0,
      maxR,
      dmg,
      color,
      life: 0.45,
      maxLife: 0.45,
      hit: new Set(),
      delay,
    });
  }

  addLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    width: number,
    life: number,
    jag: number,
  ) {
    if (this.lines.length > 140) this.lines.shift();
    this.lines.push({ x1, y1, x2, y2, color, width, life, maxLife: life, jag });
  }

  beamDamage(x1: number, y1: number, x2: number, y2: number, w: number, dmg: number) {
    this.enemies.forEachAlive((e) => {
      if (e.dying > 0) return;
      const rr = w + e.radius;
      if (distToSegSq(e.x, e.y, x1, y1, x2, y2) < rr * rr) this.damageEnemy(e, dmg);
    });
  }

  emit(
    x: number,
    y: number,
    n: number,
    o: {
      color?: string;
      speed?: [number, number];
      life?: [number, number];
      size?: [number, number];
      add?: boolean;
      kind?: 0 | 1 | 2;
      drag?: number;
      grow?: number;
      dir?: number;
      spread?: number;
    },
  ) {
    if (Settings.get().performance === "low") n = Math.max(1, Math.ceil(n * 0.35));
    for (let i = 0; i < n; i++) {
      const p = this.particles.spawn();
      if (!p) return;
      const a =
        o.dir !== undefined ? o.dir + rand(-(o.spread ?? 0.5), o.spread ?? 0.5) : rand(0, TAU);
      const s = rand(o.speed?.[0] ?? 60, o.speed?.[1] ?? 200);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.life = p.maxLife = rand(o.life?.[0] ?? 0.3, o.life?.[1] ?? 0.7);
      p.color = o.color ?? "#fff";
      p.size = rand(o.size?.[0] ?? 2, o.size?.[1] ?? 5);
      p.add = o.add ?? false;
      p.kind = o.kind ?? 0;
      p.drag = o.drag ?? 0.92;
      p.grow = o.grow ?? 0;
    }
  }

  explosion(x: number, y: number, size: number, color: string) {
    this.emit(x, y, 1, {
      color: "#ffffff",
      speed: [0, 0],
      life: [0.25, 0.3],
      size: [size * 0.4, size * 0.4],
      kind: 2,
      add: true,
      grow: size * 3,
    });
    this.emit(x, y, Math.ceil(size / 2.5), {
      color: "#ffd23f",
      speed: [60, 220 + size * 4],
      life: [0.2, 0.5],
      size: [2, 4],
      add: true,
    });
    this.emit(x, y, Math.ceil(size / 3), {
      color,
      speed: [40, 180 + size * 3],
      life: [0.3, 0.8],
      size: [2, 6],
    });
    this.emit(x, y, Math.ceil(size / 5), {
      color: "#ff8a1f",
      speed: [100, 300],
      life: [0.15, 0.35],
      size: [1, 2],
      kind: 1,
      add: true,
    });
  }

  bossTrail(e: Enemy) {
    if (this.ghosts.length > 24) this.ghosts.shift();
    this.ghosts.push({
      x: e.x,
      y: e.y,
      a: e.angle,
      life: 0.35,
      sprite: e.boss?.sprite ?? e.def.sprite,
      scale: e.boss?.scale ?? e.def.scale,
    });
  }

  /* ------------------------------ spawning ------------------------------ */
  spawnEnemyAt(
    id: string,
    x: number,
    y: number,
    o: { elite?: boolean; parentUid?: number; formation?: number } = {},
  ): Enemy | null {
    const e = this.enemies.spawn();
    if (!e) return null;
    const d = enemyById(id);
    const elite = o.elite ?? false;
    e.uid = this.uid++;
    e.def = d;
    e.boss = null;
    e.elite = elite;
    e.x = x;
    e.y = y;
    e.vx = e.vy = 0;
    e.knockX = e.knockY = 0;
    e.hitFlash = 0;
    e.t = 0;
    e.aiT = rand(0.5, 2);
    e.aiState = 0;
    e.aiN = 0;
    e.slow = 0;
    e.contactCD = 0;
    e.droneCD = 0;
    e.phase = 0;
    e.shield = 0;
    e.shieldMax = 0;
    e.parentUid = o.parentUid ?? -1;
    e.orbitA = 0;
    e.dying = 0;
    const world1Campaign = this.stage.id === WORLD1_ID && !this.isEndless;
    const pressure = world1Campaign
      ? WORLD1_HORDE_PRESSURE[hordeIndexAt(this.elapsed)]!
      : WORLD1_HORDE_PRESSURE[0];
    const hpK =
      d.behavior === "generator"
        ? this.bossScale
        : enemyHpScale(this.minute, this.stage.difficulty) * pressure.hp;
    e.maxHp = e.hp = Math.round(d.hp * hpK * (elite ? 3.2 : 1));
    e.dmg =
      d.dmg * enemyDmgScale(this.minute, this.stage.dmgMult) * pressure.damage * (elite ? 1.4 : 1);
    e.speed =
      d.speed * rand(0.92, 1.08) * (1 + Math.min(0.25, this.minute * 0.015)) * pressure.speed;
    e.radius = d.radius * (elite ? 1.25 : 1);
    e.shootCD = d.shootCD * rand(0.6, 1.2);
    e.angle = Math.atan2(this.player.y - y, this.player.x - x);
    if (o.formation !== undefined) {
      e.aiState = 1;
      e.tx = Math.cos(o.formation);
      e.ty = Math.sin(o.formation);
      e.aiT = 4.5;
      e.angle = o.formation;
    }
    return e;
  }

  private spawnRing(): { x: number; y: number } {
    const p = this.player;
    const R = Math.hypot(this.W / this.zoom, this.H / this.zoom) / 2 + CONFIG.spawn.ringMargin;
    const lim = CONFIG.world.arenaRadius + 150;
    for (let k = 0; k < 6; k++) {
      let a = rand(0, TAU);
      if (Math.random() < 0.35 && (p.vx || p.vy)) a = Math.atan2(p.vy, p.vx) + rand(-0.8, 0.8);
      const x = p.x + Math.cos(a) * R,
        y = p.y + Math.sin(a) * R;
      if (Math.hypot(x, y) < lim) return { x, y };
    }
    const a = Math.atan2(-p.y, -p.x) + rand(-1, 1);
    return { x: p.x + Math.cos(a) * R, y: p.y + Math.sin(a) * R };
  }

  private spawnRegular() {
    const ph = phaseAt(this.minute);
    const world1 = this.stage.id === WORLD1_ID && !this.isEndless;
    let id = world1
      ? pickWeighted(WORLD1_HORDES[hordeIndexAt(this.elapsed)]!)
      : pickWeighted(ph.weights);
    if (id === "hunter" && this.minute < 1) id = "interceptor";
    const pos = this.spawnRing();
    const elite = Math.random() < ph.eliteChance;
    if (id === "interceptor" && Math.random() < 0.5) {
      // small packs
      const n = 2 + Math.floor(Math.random() * (2 + ph.id));
      for (let i = 0; i < n; i++)
        this.spawnEnemyAt("interceptor", pos.x + rand(-40, 40), pos.y + rand(-40, 40));
    } else this.spawnEnemyAt(id, pos.x, pos.y, { elite });
  }

  private spawnFormation() {
    const ph = phaseAt(this.minute);
    const list = FORMATIONS[ph.id] ?? [];
    if (!list.length) return;
    const kind = choice(list);
    const p = this.player;
    const R = Math.hypot(this.W / this.zoom, this.H / this.zoom) / 2 + 60;
    const a0 = rand(0, TAU);
    const ox = p.x + Math.cos(a0) * R,
      oy = p.y + Math.sin(a0) * R;
    const head = Math.atan2(p.y - oy, p.x - ox);
    const px = -Math.sin(head),
      py = Math.cos(head);
    switch (kind) {
      case "vee": {
        const n = 9 + ph.id * 2;
        for (let i = 0; i < n; i++) {
          const row = Math.ceil(i / 2),
            side = i % 2 ? 1 : -1;
          this.spawnEnemyAt(
            "interceptor",
            ox - Math.cos(head) * row * 34 + px * side * row * 30,
            oy - Math.sin(head) * row * 34 + py * side * row * 30,
            { formation: head },
          );
        }
        this.banner("FORMACIÓN EN V", "Interceptores en aproximación", "info");
        break;
      }
      case "ring": {
        const n = 16 + ph.id * 3;
        for (let i = 0; i < n; i++) {
          const a = (i * TAU) / n;
          this.spawnEnemyAt(
            i % 3 === 0 ? "hunter" : "interceptor",
            p.x + Math.cos(a) * R * 0.95,
            p.y + Math.sin(a) * R * 0.95,
          );
        }
        this.banner("¡CERCO!", "Te están rodeando", "alert");
        break;
      }
      case "wall": {
        const n = 10 + ph.id;
        for (let i = 0; i < n; i++) {
          const o = (i - (n - 1) / 2) * 42;
          this.spawnEnemyAt("hunter", ox + px * o, oy + py * o, { formation: head });
        }
        this.banner("MURO DE CAZADORES", "Rompe la línea", "info");
        break;
      }
      case "squad": {
        for (let i = 0; i < 5; i++)
          this.spawnEnemyAt("bomber", ox + px * (i - 2) * 60, oy + py * (i - 2) * 60);
        this.spawnEnemyAt("destroyer", ox - Math.cos(head) * 80, oy - Math.sin(head) * 80, {
          elite: ph.id >= 3,
        });
        this.banner("ESCUADRA DE BOMBARDEO", "Esquiva las zonas de impacto", "alert");
        break;
      }
      case "swarm": {
        for (let i = 0; i < 3; i++)
          this.spawnEnemyAt("parasite", ox + rand(-80, 80), oy + rand(-80, 80));
        for (let i = 0; i < 14; i++)
          this.spawnEnemyAt("spawnling", ox + rand(-120, 120), oy + rand(-120, 120));
        this.banner("ENJAMBRE PARASITARIO", "Elimina las naves madre", "alert");
        break;
      }
      case "pincer": {
        for (const s of [1, -1]) {
          const bx = p.x + Math.cos(a0) * R * s,
            by = p.y + Math.sin(a0) * R * s;
          const h = Math.atan2(p.y - by, p.x - bx);
          for (let i = 0; i < 6; i++)
            this.spawnEnemyAt("interceptor", bx + rand(-60, 60), by + rand(-60, 60), {
              formation: h,
            });
          for (let i = 0; i < 3; i++)
            this.spawnEnemyAt("hunter", bx + rand(-60, 60), by + rand(-60, 60));
          this.spawnEnemyAt(Math.random() < 0.5 ? "destroyer" : "bomber", bx, by, { elite: true });
        }
        this.banner("ATAQUE EN PINZA", "Ofensiva combinada desde dos flancos", "alert");
        break;
      }
    }
  }

  private async spawnBoss(id: string) {
    const attempt = await this.cb.onBossStarted?.(id);
    if (!attempt?.token || !attempt.seed) {
      throw new Error("El servidor no autorizó el combate contra el boss.");
    }
    const def = bossById(id);
    const pos = this.spawnRing();
    const e = this.spawnEnemyAt("destroyer", pos.x, pos.y);
    if (!e) throw new Error("No se pudo reservar el enemigo del boss.");
    this.bossAttemptToken = attempt.token;
    this.bossAttemptSeed = attempt.seed;
    this.bossAttemptIssuedAt = attempt.issued_at;
    this.bossFightStartedAt = Date.now();
    this.bossDamageDealt = 0;
    this.bossDamageReceived = 0;
    this.bossHitCount = 0;
    this.bossCombatEvents = [];
    e.boss = def;
    e.elite = false;
    e.maxHp = e.hp = attempt.boss.hp;
    e.dmg = attempt.boss.damage;
    e.speed = def.speed;
    e.radius = def.radius;
    e.phase = 0;
    e.aiState = 0;
    e.aiN = 0;
    def.onSpawn(this, e);
    this.boss = e;
    Audio.SFX.boss();
    Audio.setMusic(2);
    this.shake(CONFIG.camera.bossSpawnShake);
  }

  private recordBossCombatEvent(type: BossCombatEventType, damage = 0, count = 1) {
    if (!this.bossAttemptToken) return;
    const at = Math.max(0, Math.floor((Date.now() - this.bossFightStartedAt) / 5_000) * 5_000);
    const existing = this.bossCombatEvents.find((event) => event.type === type && event.at === at);
    if (existing) {
      existing.damage += damage;
      existing.count += count;
      return;
    }
    if (this.bossCombatEvents.length < 512) {
      this.bossCombatEvents.push({ type, at, damage, count });
    }
  }

  private settleBossAttempt(result: "victory" | "defeat") {
    if (!this.bossAttemptToken) return;
    const token = this.bossAttemptToken;
    const seed = this.bossAttemptSeed;
    const elapsed = Math.max(0, Date.now() - this.bossFightStartedAt);
    const evidence: BossCombatEvidence = {
      started_at: this.bossAttemptIssuedAt,
      ended_at: this.bossAttemptIssuedAt + elapsed,
      damage_dealt: this.bossDamageDealt,
      damage_received: this.bossDamageReceived,
      hits: this.bossHitCount,
      events: this.bossCombatEvents,
    };
    this.bossAttemptToken = null;
    this.bossAttemptSeed = "";
    this.cb.onBossDefeated?.(this.boss?.boss?.id ?? "", token, seed, result, evidence);
  }

  /* ------------------------------ weapons & stats ------------------------------ */
  addWeapon(id: string) {
    const def = weaponById(id);
    if (!def || this.player.weapons.some((w) => w.def.id === id)) return;
    const w: WeaponState = { def, level: 0, timer: 0.3, evolved: false, t: 0, angle: 0, aux: 0 };
    this.player.weapons.push(w);
  }

  recomputeStats(init = false) {
    const p = this.player,
      s = this.ship,
      h = this.hangar;
    const st = (id: string) => p.passives[id] ?? 0;
    const prevMax = p.maxHp;
    p.maxHp = s.hp + h.hp + st("maxhp") * 20;
    if (init) p.hp = p.maxHp;
    else if (p.maxHp > prevMax) p.hp += p.maxHp - prevMax;
    p.speed = s.speed * (1 + h.speed + st("speed") * 0.08);
    p.dmgMult = s.dmg * (1 + h.dmg + st("damage") * 0.12);
    p.cdMult = s.cd * (1 - h.cd) * Math.pow(0.92, st("rate"));
    p.pickupRadius = s.pickup * (1 + h.magnet + st("magnet") * 0.25);
    p.regen = s.regen + h.regen + st("regen") * 0.4;
    p.armor = s.armor + st("armor");
    p.critChance = s.crit + st("crit") * 0.06;
    p.xpMult = (1 + st("xp") * 0.12) * this.xpScale;
    p.boostCDMax =
      CONFIG.boost.cooldown * (s.id === "spectre" ? 0.7 : 1) * (1 - st("speed") * 0.05);
    const sw = p.weapons.find((w) => w.def.id === "shield");
    const L = sw ? sw.def.levels[sw.level]! : null;
    p.shieldMax = s.shield + (L ? L.cap : 0);
    p.shieldRegen = L ? L.regen * (sw!.evolved ? 2 : 1) : s.shield ? 5 : 0;
    if (init) p.shield = p.shieldMax;
    p.shield = Math.min(p.shield, p.shieldMax);
  }

  private shieldDelay() {
    const sw = this.player.weapons.find((w) => w.def.id === "shield");
    if (!sw) return 3;
    return sw.def.levels[sw.level]!.delay * (sw.evolved ? 0.5 : 1);
  }

  /* ------------------------------ level up ------------------------------ */
  private giveXP(v: number) {
    const p = this.player;
    p.xp += v * p.xpMult;
    this.energy += v;
    while (p.xp >= p.xpToNext) {
      p.xp -= p.xpToNext;
      p.level++;
      p.xpToNext = xpForLevel(p.level + 1);
      this.pendingLevelUps++;
    }
  }

  buildChoices(): UpgradeChoice[] {
    const p = this.player;
    type C = UpgradeChoice & { weight: number };
    const pool: C[] = [];
    const evo: C[] = [];
    for (const w of p.weapons) {
      const max = w.def.levels.length;
      if (w.level < max - 1) {
        const nl = w.def.levels[w.level + 1]!;
        pool.push({
          kind: "weapon-up",
          id: w.def.id,
          name: w.def.name,
          desc: w.def.levelText(nl),
          icon: w.def.icon,
          level: w.level + 2,
          maxLevel: max,
          color: w.def.color,
          tag: `NIVEL ${w.level + 2}`,
          weight: 1.25,
        });
      } else if (!w.evolved && (p.passives[w.def.evo.passive] ?? 0) > 0) {
        evo.push({
          kind: "evolve",
          id: w.def.id,
          name: w.def.evo.name,
          desc: w.def.evo.desc,
          icon: "ic_evo",
          level: max,
          maxLevel: max,
          color: "#ff3df2",
          tag: "EVOLUCIÓN",
          weight: 10,
        });
      }
    }
    if (p.weapons.length < CONFIG.player.maxWeapons) {
      for (const d of WEAPONS) {
        if (p.weapons.some((w) => w.def.id === d.id)) continue;
        pool.push({
          kind: "weapon-new",
          id: d.id,
          name: d.name,
          desc: d.desc,
          icon: d.icon,
          level: 1,
          maxLevel: d.levels.length,
          color: d.color,
          tag: `NUEVA ${d.kind}`,
          weight: 1,
        });
      }
    }
    const ownedPassives = Object.keys(p.passives).length;
    for (const ps of PASSIVES) {
      const n = p.passives[ps.id] ?? 0;
      if (n >= ps.maxStacks) continue;
      if (n === 0 && ownedPassives >= CONFIG.player.maxPassives) continue;
      // hint synergy: passives that unlock an evolution for an owned weapon
      const syn = p.weapons.some((w) => w.def.evo.passive === ps.id && !w.evolved);
      pool.push({
        kind: "passive",
        id: ps.id,
        name: ps.name,
        desc: ps.desc + (syn && n === 0 ? " · habilita evolución" : ""),
        icon: ps.icon,
        level: n + 1,
        maxLevel: ps.maxStacks,
        color: ps.color,
        tag: syn ? "SINERGIA" : "PASIVA",
        weight: syn ? 1.4 : 0.9,
      });
    }
    const out: UpgradeChoice[] = [];
    if (evo.length) out.push(evo[Math.floor(Math.random() * evo.length)]!);
    while (out.length < 3 && pool.length) {
      const total = pool.reduce((s, c) => s + c.weight, 0);
      let r = Math.random() * total;
      let idx = 0;
      for (; idx < pool.length; idx++) {
        r -= pool[idx]!.weight;
        if (r <= 0) break;
      }
      out.push(pool.splice(Math.min(idx, pool.length - 1), 1)[0]!);
    }
    if (out.length < 3)
      out.push({
        kind: "heal",
        id: "heal",
        name: "REPARACIÓN TOTAL",
        desc: "Restaura el 40% de la integridad",
        icon: "ic_heal",
        level: 1,
        maxLevel: 1,
        color: "#ff2d55",
        tag: "SOPORTE",
      });
    if (out.length < 3)
      out.push({
        kind: "credits",
        id: "credits",
        name: "BOTÍN",
        desc: `+${Math.round(60 * CREDIT_REWARD_MULT)} créditos al terminar la misión`,
        icon: "ic_credits",
        level: 1,
        maxLevel: 1,
        color: "#ffd23f",
        tag: "SOPORTE",
      });
    return out.map(({ ...c }) => {
      delete (c as Partial<C>).weight;
      return c as UpgradeChoice;
    });
  }

  private openLevelUp() {
    this.state = "LEVEL_UP";
    this.choices = this.buildChoices();
    Audio.SFX.levelUp();
    this.cb.onLevelUp(this.choices, this.player.rerolls);
  }

  reroll() {
    if (this.state !== "LEVEL_UP" || this.player.rerolls <= 0) return;
    this.player.rerolls--;
    this.choices = this.buildChoices();
    Audio.SFX.click();
    this.cb.onLevelUp(this.choices, this.player.rerolls);
  }

  applyChoice(i: number) {
    if (this.state !== "LEVEL_UP") return;
    const c = this.choices[i];
    if (!c) return;
    const p = this.player;
    if (c.kind === "weapon-new") this.addWeapon(c.id);
    else if (c.kind === "weapon-up") {
      const w = p.weapons.find((x) => x.def.id === c.id);
      if (w) w.level = Math.min(w.def.levels.length - 1, w.level + 1);
    } else if (c.kind === "evolve") {
      const w = p.weapons.find((x) => x.def.id === c.id);
      if (w) {
        w.evolved = true;
        this.evolutions++;
        this.banner("¡EVOLUCIÓN!", c.name, "good");
        Audio.SFX.evolve();
      }
    } else if (c.kind === "passive") p.passives[c.id] = (p.passives[c.id] ?? 0) + 1;
    else if (c.kind === "heal") p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.4);
    else if (c.kind === "credits") this.creditsRaw += 60;
    this.recomputeStats();
    if (c.kind !== "evolve") Audio.SFX.upgrade();
    this.pendingLevelUps = Math.max(0, this.pendingLevelUps - 1);
    this.state = "PLAYING";
    this.last = performance.now();
  }

  /* ------------------------------ damage ------------------------------ */
  damageEnemy(e: Enemy, dmg: number): boolean {
    if (!e.alive || e.dying > 0) return false;
    const crit = Math.random() < this.player.critChance;
    if (crit) dmg *= 2;
    if (e.boss && e.shield > 0) {
      dmg *= 0.1;
      if (Math.random() < 0.3)
        this.emit(e.x + rand(-e.radius, e.radius), e.y + rand(-e.radius, e.radius), 2, {
          color: "#25f4ff",
          speed: [40, 120],
          life: [0.1, 0.25],
          size: [2, 3],
          add: true,
        });
    }
    e.hp -= dmg;
    e.hitFlash = 0.08;
    this.damageDealt += dmg;
    if (e.boss && this.bossAttemptToken) {
      this.bossDamageDealt += dmg;
      this.bossHitCount++;
      this.recordBossCombatEvent("boss_hit", dmg);
    }
    if (Settings.get().damageNumbers && (dmg >= 4 || crit)) {
      const n = this.dmgNums.spawn();
      if (n) {
        n.x = e.x + rand(-8, 8);
        n.y = e.y - e.radius;
        n.vy = -60;
        n.life = 0.7;
        n.value = Math.round(dmg);
        n.crit = crit;
        n.color = crit ? "#ffd23f" : e.boss && e.shield > 0 ? "#25f4ff" : "#ffffff";
      }
    }
    if (e.boss) {
      while (e.phase < e.boss.phases.length && e.hp / e.maxHp <= e.boss.phases[e.phase]!) {
        e.phase++;
        this.shake(0.5);
        this.flash = 0.4;
        Audio.SFX.boss();
        e.boss.onPhase(this, e, e.phase);
      }
    }
    if (e.hp <= 0) {
      this.killEnemy(e);
      return true;
    }
    return false;
  }

  private killEnemy(e: Enemy) {
    if (!e.alive) return;
    if (e.boss) {
      if (e.dying > 0) return;
      e.dying = 2.2;
      e.hp = 0;
      e.vx = e.vy = 0;
      this.eProj.killAll();
      this.hazards = this.hazards.filter((h) => h.meteor);
      this.enemies.forEachAlive((c) => {
        if (c.parentUid === e.uid) this.killEnemy(c);
      });
      Audio.SFX.bigExplode();
      return;
    }
    this.recordBossCombatEvent("minion_kill");
    const d = e.def;
    this.kills++;
    this.killsByType[d.id] = (this.killsByType[d.id] ?? 0) + 1;
    this.creditsRaw += d.credits * (e.elite ? 3 : 1);
    this.explosion(e.x, e.y, e.radius * (e.elite ? 1.5 : 1), d.color);
    Audio.SFX.enemyDie();
    const xp = d.xp * (e.elite ? 4 : 1);
    if (xp > 0) this.dropGem(e.x, e.y, xp);
    else if (Math.random() < 0.3) this.dropGem(e.x, e.y, 1);
    const pk = e.elite
      ? 0.15
      : d.behavior === "spawnling"
        ? 0
        : this.stage.id === WORLD1_ID && !this.isEndless
          ? WORLD1_PICKUP_CHANCE
          : 0.006;
    if (Math.random() < pk) this.dropPickup(e.x, e.y);
    if (d.behavior === "parasite")
      for (let i = 0; i < 2; i++)
        this.spawnEnemyAt("spawnling", e.x + rand(-10, 10), e.y + rand(-10, 10));
    e.alive = false;
  }

  private finishBoss(e: Enemy) {
    const def = e.boss!;
    this.cb.onChatEvent?.({
      type: "boss_kill",
      bossName: def.name,
      shipName: this.ship.name,
    });
    this.kills++;
    this.killsByType[def.id] = (this.killsByType[def.id] ?? 0) + 1;
    this.bossesDefeated.push(def.id);
    this.bossCooldowns[def.id] = Date.now() + BOSS_COOLDOWN_MS;
    this.settleBossAttempt("victory");
    this.creditsRaw += def.credits;
    this.explosion(e.x, e.y, 90, def.color);
    this.emit(e.x, e.y, 60, {
      color: def.color,
      speed: [100, 500],
      life: [0.5, 1.4],
      size: [3, 8],
    });
    for (let i = 0; i < 14; i++)
      this.dropGem(e.x + rand(-60, 60), e.y + rand(-60, 60), Math.ceil(def.xp / 4));
    this.dropPickup(e.x, e.y, "repair");
    this.dropPickup(e.x + 40, e.y, "magnet");
    this.shake(CONFIG.camera.bossKillShake);
    this.flash = 0.8;
    e.alive = false;
    this.boss = null;
    Audio.setMusic(1);
    const sched = BOSS_SCHEDULE.find((b) => b.boss === def.id);
    const isFinal = this.isEndless
      ? sched?.final
      : CAMPAIGN_FINAL_BOSSES.some((b) => b.boss === def.id && b.final);
    if (isFinal) {
      this.finalBossDead = true;
      this.banner(`${def.name} DESTRUIDO`, "¡Sector liberado!", "good");
      this.state = "WINNING";
      this.endTimer = 1.2;
      Audio.SFX.win();
    } else {
      this.banner(
        `${def.name} DESTRUIDO`,
        `+${Math.round(def.credits * CREDIT_REWARD_MULT)} créditos`,
        "good",
      );
    }
  }

  private dropGem(x: number, y: number, value: number) {
    const g = this.gems.spawn();
    if (!g) {
      // pool full: merge into an existing gem to avoid losing XP or allocating
      let best: Gem | null = null,
        bd = Infinity;
      this.gems.forEachAlive((o) => {
        const d = (o.x - x) ** 2 + (o.y - y) ** 2;
        if (d < bd) {
          bd = d;
          best = o;
        }
      });
      if (best) {
        (best as Gem).value += value;
        (best as Gem).tier = this.tierOf((best as Gem).value);
      }
      return;
    }
    const a = rand(0, TAU),
      s = rand(40, 160);
    g.x = x;
    g.y = y;
    g.vx = Math.cos(a) * s;
    g.vy = Math.sin(a) * s;
    g.value = value;
    g.tier = this.tierOf(value);
    g.bobT = rand(0, TAU);
    g.pulled = false;
  }
  private tierOf(v: number): 0 | 1 | 2 | 3 {
    return v >= 20 ? 3 : v >= 8 ? 2 : v >= 3 ? 1 : 0;
  }

  private dropPickup(x: number, y: number, kind?: PickupKind) {
    const p = this.pickups.spawn();
    if (!p) return;
    p.x = x;
    p.y = y;
    p.t = 0;
    if (kind) p.kind = kind;
    else if (this.stage.id === WORLD1_ID && !this.isEndless)
      p.kind = Math.random() < 1 / 3 ? "repair" : Math.random() < 0.5 ? "magnet" : "emp";
    else p.kind = Math.random() < 0.5 ? "repair" : Math.random() < 0.6 ? "magnet" : "emp";
  }

  damagePlayer(amt: number) {
    const p = this.player;
    if (this.state !== "PLAYING") return;
    if (p.iframe > 0 || p.boostT > 0) return;
    let final = Math.max(1, amt - p.armor);
    p.shieldDelay = this.shieldDelay();
    if (p.shield > 0) {
      const ab = Math.min(p.shield, final);
      p.shield -= ab;
      final -= ab;
      Audio.SFX.shieldHit();
      this.emit(p.x, p.y, 8, {
        color: "#25f4ff",
        speed: [80, 200],
        life: [0.15, 0.3],
        size: [2, 3],
        add: true,
      });
      if (p.shield <= 0.01) {
        p.shield = 0;
        const sw = p.weapons.find((w) => w.def.id === "shield");
        if (sw?.evolved) {
          this.addRing(p.x, p.y, 280, 70 * p.dmgMult, "#25f4ff", 0);
          this.flash = 0.25;
        }
      }
      if (final <= 0) {
        p.iframe = CONFIG.player.shieldInvuln;
        return;
      }
    }
    p.hp -= final;
    this.damageTaken += final;
    this.bossDamageReceived += final;
    this.recordBossCombatEvent("player_hit", final);
    p.iframe = CONFIG.player.invulnAfterHit;
    p.hitT = 0.25;
    Audio.SFX.hurt();
    this.shake(CONFIG.camera.hurtShake);
    this.emit(p.x, p.y, 12, { color: "#ff2d55", speed: [80, 220], life: [0.2, 0.5] });
    if (p.hp <= 0) this.die();
  }

  /** Continuous damage (spores) that ignores i-frames */
  private drainPlayer(amt: number) {
    const p = this.player;
    if (p.shield > 0) {
      p.shield = Math.max(0, p.shield - amt);
      p.shieldDelay = this.shieldDelay();
      return;
    }
    p.hp -= amt;
    this.damageTaken += amt;
    this.bossDamageReceived += amt;
    this.recordBossCombatEvent("player_hit", amt);
    if (p.hp <= 0) this.die();
  }

  private die() {
    if (this.state !== "PLAYING") return;
    this.recordBossCombatEvent("player_death");
    this.settleBossAttempt("defeat");
    this.player.hp = 0;
    this.state = "DYING";
    this.endTimer = 2;
    Audio.SFX.die();
    Audio.SFX.bigExplode();
    this.explosion(this.player.x, this.player.y, 40, this.ship.trail);
    this.shake(1);
  }

  private end(victory: boolean) {
    if (this.state === "ENDED") return;
    this.state = "ENDED";
    Audio.setMusic(0);
    if (victory) Audio.SFX.win();
    const p = this.player;
    this.cb.onEnd({
      victory,
      finalBossDefeated: this.finalBossDead,
      stageId: this.stage.id,
      shipId: this.ship.id,
      time: Math.min(this.elapsed, this.duration),
      duration: this.duration,
      kills: this.kills,
      killsByType: { ...this.killsByType },
      bossesDefeated: [...this.bossesDefeated],
      level: p.level,
      damageDealt: this.damageDealt,
      damageTaken: this.damageTaken,
      energy: this.energy,
      evolutions: this.evolutions,
      weapons: p.weapons.map((w) => ({ id: w.def.id, level: w.level + 1, evolved: w.evolved })),
      maxPhase: this.maxPhase,
      credits: this.creditsRaw,
    });
  }

  /* ------------------------------ update ------------------------------ */
  private update(dt: number) {
    if (this.state === "DYING" || this.state === "WINNING") {
      this.endTimer -= dt;
      if (this.state === "DYING" && Math.random() < 0.3)
        this.explosion(
          this.player.x + rand(-30, 30),
          this.player.y + rand(-30, 30),
          rand(12, 26),
          this.ship.trail,
        );
      if (this.endTimer <= 0) {
        this.end(this.state === "WINNING");
        return;
      }
    }
    if (this.state === "PLAYING") {
      this.elapsed += dt;
      this.minute = this.isEndless
        ? this.elapsed / 60
        : toMissionMinute(this.elapsed, this.duration);
      if (!this.isEndless && this.stage.id === WORLD1_ID) {
        const horde = hordeIndexAt(this.elapsed);
        if (horde > this.lastHorde) {
          this.lastHorde = horde;
          this.hordeTransition();
        }
      }
      if (!this.isEndless && this.elapsed >= this.duration && this.stage.id !== WORLD1_ID) {
        this.banner("¡MISIÓN COMPLETADA!", "Has sobrevivido", "good");
        this.state = "WINNING";
        this.endTimer = 1.2;
        return;
      }
      if (this.pendingLevelUps > 0) {
        this.openLevelUp();
        return;
      }
    }
    this.cam.shake = Math.max(0, this.cam.shake - dt * CONFIG.camera.shakeDecayPerSec);
    this.flash = Math.max(0, this.flash - dt * 2);
    if (this.hordeNotice) {
      this.hordeNotice.elapsed += dt;
      if (this.hordeNotice.elapsed >= 5) this.hordeNotice = null;
    }
    if (this.bannerState) {
      this.bannerState.t -= dt;
      if (this.bannerState.t <= 0) this.bannerState = null;
    }

    if (this.state === "PLAYING") {
      this.updatePlayer(dt);
      this.updateDirector(dt);
      this.updateStageHazards(dt);
    }
    this.buildGrid();
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateEnemyProjectiles(dt);
    this.updateHazards(dt);
    this.updateRings(dt);
    this.updateFx(dt);
    if (this.state === "PLAYING") {
      this.updateGems(dt);
      this.updatePickups(dt);
    }

    const p = this.player;
    const tx = p.x + p.vx * 0.12,
      ty = p.y + p.vy * 0.12;
    const k = 1 - Math.pow(CONFIG.camera.followSmoothness, dt);
    this.cam.x = lerp(this.cam.x, tx, k);
    this.cam.y = lerp(this.cam.y, ty, k);
    this.ensureFiniteWorldState();
  }

  private updatePlayer(dt: number) {
    const p = this.player;
    p.iframe = Math.max(0, p.iframe - dt);
    p.hitT = Math.max(0, p.hitT - dt);
    p.fireFlash = Math.max(0, p.fireFlash - dt);
    p.slowT = Math.max(0, p.slowT - dt);
    p.boostCD = Math.max(0, p.boostCD - dt);
    const v = Input.getMoveVector();
    if (Input.consumeBoost() && p.boostCD <= 0) {
      p.boostT = CONFIG.boost.duration;
      p.boostCD = p.boostCDMax;
      Audio.SFX.boost();
      this.emit(p.x, p.y, 10, {
        color: this.ship.trail,
        speed: [40, 160],
        life: [0.2, 0.4],
        size: [2, 4],
        add: true,
      });
    }
    let sp = p.speed * (p.slowT > 0 ? 0.65 : 1);
    if (p.boostT > 0) {
      p.boostT -= dt;
      sp *= CONFIG.boost.mult;
      if (Math.random() < 0.7)
        this.ghosts.push({
          x: p.x,
          y: p.y,
          a: p.angle,
          life: 0.25,
          sprite: this.ship.sprite,
          scale: PLAYER_SCALE,
        });
    }
    let mx = v.x,
      my = v.y;
    if (p.boostT > 0 && v.mag < 0.1) {
      mx = p.facingX;
      my = p.facingY;
    }
    const tvx = mx * sp,
      tvy = my * sp;
    const acc = 1 - Math.pow(0.0005, dt);
    p.vx = lerp(p.vx, tvx, acc);
    p.vy = lerp(p.vy, tvy, acc);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (v.mag > 0.05) {
      p.facingX = v.x / v.mag;
      p.facingY = v.y / v.mag;
    }
    const target = Math.atan2(p.facingY, p.facingX);
    p.angle += angDiff(p.angle, target) * Math.min(1, dt * 12);
    // arena + obstacles
    const R = CONFIG.world.arenaRadius;
    const d = Math.hypot(p.x, p.y);
    if (d > R) {
      p.x = (p.x * R) / d;
      p.y = (p.y * R) / d;
    }
    for (const o of this.obstacles) this.pushOut(p, o, p.radius);
    if (p.regen > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
    if (p.shieldMax > 0) {
      p.shieldDelay -= dt;
      if (p.shieldDelay <= 0) p.shield = Math.min(p.shieldMax, p.shield + p.shieldRegen * dt);
    }
    if (p.hp < p.maxHp * 0.3 && Math.random() < 0.25)
      this.emit(p.x, p.y, 1, {
        color: "#4a4466",
        speed: [10, 40],
        life: [0.4, 0.9],
        size: [3, 6],
        drag: 0.97,
      });
    for (const w of p.weapons) {
      const L = w.def.levels[w.level]!;
      w.t += dt;
      if (w.def.update) w.def.update(this, w, L, dt);
      else if (w.def.fire) {
        w.timer -= dt;
        if (w.timer <= 0) {
          w.def.fire(this, w, L);
          w.timer = L.cd * p.cdMult;
        }
      }
    }
  }

  private pushOut(o: { x: number; y: number }, ob: Obstacle, r: number) {
    const dx = o.x - ob.x,
      dy = o.y - ob.y;
    const rr = ob.r + r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return false;
    const d = Math.sqrt(d2) || 0.01;
    o.x = ob.x + (dx / d) * rr;
    o.y = ob.y + (dy / d) * rr;
    return true;
  }

  /** Transición entre hordas (mundo 1, campaña): limpia el campo y recoge lo pendiente. */
  private hordeTransition() {
    // 1. Eliminar enemigos vivos, sin generar recompensas.
    this.enemies.forEachAlive((e) => {
      e.alive = false;
    });
    // 2. Recoger gemas pendientes y sumar su XP.
    this.gems.forEachAlive((g) => {
      this.giveXP(g.value);
      g.alive = false;
    });
    // 3. Recoger objetos especiales pendientes y aplicar sus efectos.
    this.pickups.forEachAlive((k) => {
      k.alive = false;
      // Todos los objetos recogidos al cerrar una horda se guardan permanentemente.
      this.inventory[k.kind] += 1;
      this.cb.onItemCollected?.(k.kind);
      // EMP: no queda ningún enemigo vivo que dañar en este punto.
    });
    // 4. Eliminar proyectiles enemigos.
    this.eProj.killAll();
    // Aviso visual de horda superada (dura 5 segundos).
    // Recuperación de vida al comenzar cada horda (no durante el combate con LEVIATÁN).
    if (this.elapsed < this.duration) this.player.hp = this.player.maxHp;
    this.hordeNotice = { horde: this.lastHorde, elapsed: 0 };
    this.ensureFiniteWorldState();
  }

  private updateDirector(dt: number) {
    const ph = phaseAt(this.minute);
    if (ph.id !== this.lastPhase) {
      this.lastPhase = ph.id;
      this.maxPhase = Math.max(this.maxPhase, ph.id);
      this.banner(`FASE ${ph.id + 1}: ${ph.name}`, ph.desc, ph.id >= 3 ? "alert" : "info");
      Audio.SFX.power();
    }
    const alive = this.enemies.countAlive();
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const world1 = this.stage.id === WORLD1_ID && !this.isEndless;
      const cap = world1 ? WORLD1_MAX_ENEMIES : CONFIG.spawn.maxAlive;
      if (alive < cap && (this.isEndless || this.elapsed < this.duration)) {
        this.spawnRegular();
        if (this.minute > 2 && Math.random() < 0.25) this.spawnRegular();
        if (this.minute > 6 && Math.random() < 0.3) this.spawnRegular();
      }
      const pressure = world1
        ? WORLD1_HORDE_PRESSURE[hordeIndexAt(this.elapsed)]!
        : WORLD1_HORDE_PRESSURE[0];
      this.spawnTimer =
        world1 && alive >= cap
          ? 0.5
          : spawnInterval(this.minute, this.stage.difficulty) *
            pressure.spawn *
            (this.boss ? 1.8 : 1);
    }
    // En el mundo 1 la tabla por horda define todos los enemigos; no hay formaciones.
    if (ph.formationEvery > 0 && !(this.stage.id === WORLD1_ID && !this.isEndless)) {
      this.formationTimer -= this.isEndless ? dt : dt * (900 / this.duration);
      if (this.formationTimer <= 0 && alive < CONFIG.spawn.maxAlive - 30) {
        this.spawnFormation();
        this.formationTimer = ph.formationEvery * rand(0.8, 1.2);
      }
    }
    if (
      this.isEndless &&
      this.nextBoss >= BOSS_SCHEDULE.length &&
      this.minute >= 16 &&
      Math.floor(this.minute) % 4 === 0 &&
      !this.boss
    ) {
      this.nextBoss = 0;
    }
    // Campaña: no aparecen jefes antes de terminar la partida (se implementarán en otra fase).
    if (!this.isEndless && (this.elapsed < this.duration || this.stage.id !== WORLD1_ID)) return;
    const plan = this.isEndless ? BOSS_SCHEDULE : CAMPAIGN_FINAL_BOSSES;
    const next = plan[this.nextBoss];
    if (this.bossSpawnPending) return;
    if (next && this.minute >= next.minute && !this.boss) {
      if (this.bossWarnAt < 0) {
        const cooldownUntil = this.bossCooldowns[next.boss] ?? 0;
        if (cooldownUntil > Date.now()) {
          const def = bossById(next.boss);
          const minutes = Math.ceil((cooldownUntil - Date.now()) / 60_000);
          this.banner(
            `${def.name} BLOQUEADO`,
            `Enfriamiento activo · Disponible en ${minutes} min`,
            "warn",
          );
          this.nextBoss++;
          if (!this.isEndless && next.final) {
            this.state = "DYING";
            this.endTimer = 2;
          }
          return;
        }
        this.bossWarnAt = this.elapsed + 3;
        const def = bossById(next.boss);
        this.banner(
          `¡ALERTA! ${def.name}`,
          next.final ? "Jefe final en aproximación" : def.title + " en aproximación",
          "alert",
        );
        Audio.SFX.alarm();
      } else if (this.elapsed >= this.bossWarnAt) {
        this.bossSpawnPending = true;
        void this.spawnBoss(next.boss)
          .then(() => {
            this.nextBoss++;
            this.bossWarnAt = -1;
            this.bossSpawnPending = false;
          })
          .catch((error: unknown) => {
            console.error("El servidor no pudo autorizar el combate contra el boss:", error);
            this.nextBoss++;
            this.bossWarnAt = -1;
            this.bossSpawnPending = false;
            this.banner("JEFE NO DISPONIBLE", "No se pudo validar el combate", "warn");
            if (!this.isEndless && next.final) {
              this.state = "DYING";
              this.endTimer = 2;
            }
          });
      }
    }
  }

  private updateStageHazards(dt: number) {
    const p = this.player;
    const ph = phaseAt(this.minute).id;
    if (this.stage.hazard === "meteors") {
      this.hazardTimer -= dt;
      if (this.hazardTimer <= 0) {
        const n = 3 + ph;
        for (let i = 0; i < n; i++) {
          const a = rand(0, TAU),
            r = rand(0, 380);
          this.addHazard({
            kind: "circle",
            x: p.x + Math.cos(a) * r,
            y: p.y + Math.sin(a) * r,
            r: rand(55, 85),
            warn: rand(1.3, 1.8),
            dmg: 22,
            color: "#ff8a1f",
            hitsEnemies: true,
            meteor: true,
          });
        }
        if (ph === 0 && this.elapsed < 30)
          this.banner("LLUVIA DE METEORITOS", "Sal de las zonas marcadas", "alert");
        this.hazardTimer = rand(6, 9) - ph * 0.6;
      }
    } else if (this.stage.hazard === "lasers") {
      this.hazardTimer -= dt;
      if (this.hazardTimer <= 0) {
        const n = 2 + (ph >= 2 ? 1 : 0);
        const base = rand(0, Math.PI);
        for (let i = 0; i < n; i++) {
          const a = base + (i * Math.PI) / n;
          const off = rand(-160, 160);
          const cx = p.x + Math.cos(a + Math.PI / 2) * off,
            cy = p.y + Math.sin(a + Math.PI / 2) * off;
          this.addHazard({
            kind: "line",
            x: cx - Math.cos(a) * 900,
            y: cy - Math.sin(a) * 900,
            x2: cx + Math.cos(a) * 900,
            y2: cy + Math.sin(a) * 900,
            w: 26,
            warn: 1.3,
            dur: 0.9,
            dmg: 18,
            color: "#ff2d55",
            meteor: true,
          });
        }
        this.hazardTimer = rand(8, 11) - ph * 0.7;
      }
    } else if (this.stage.hazard === "spores") {
      this.hazardTimer -= dt;
      if (this.hazardTimer <= 0) {
        if (this.spores.length < 18) {
          const a = rand(0, TAU);
          this.addSpore(p.x + Math.cos(a) * 420, p.y + Math.sin(a) * 420);
        }
        this.hazardTimer = rand(7, 11);
      }
      let inside = false;
      for (let i = this.spores.length - 1; i >= 0; i--) {
        const s = this.spores[i]!;
        s.t += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (Math.hypot(s.x, s.y) > CONFIG.world.arenaRadius) {
          s.vx *= -1;
          s.vy *= -1;
        }
        if (Math.hypot(s.x - p.x, s.y - p.y) < s.r) inside = true;
      }
      if (inside) {
        p.slowT = 0.2;
        this.drainPlayer(5 * this.stage.dmgMult * dt);
        if (Math.random() < 0.2)
          this.emit(p.x, p.y, 1, {
            color: "#7dff4f",
            speed: [10, 50],
            life: [0.3, 0.6],
            size: [2, 3],
            add: true,
          });
      }
    }
  }

  private addSpore(x: number, y: number) {
    this.spores.push({
      x,
      y,
      r: rand(80, 140),
      vx: rand(-14, 14),
      vy: rand(-14, 14),
      t: rand(0, 10),
    });
  }

  private updateEnemies(dt: number) {
    const p = this.player;
    const recycleR = (Math.hypot(this.W / this.zoom, this.H / this.zoom) / 2 + 80) * 1.9;
    const knockDecay = Math.pow(0.86, dt * 60);
    this.enemies.forEachAlive((e) => {
      e.t += dt;
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.slow = Math.max(0, e.slow - dt);
      e.contactCD = Math.max(0, e.contactCD - dt);
      e.droneCD = Math.max(0, e.droneCD - dt);
      if (e.dying > 0) {
        e.dying -= dt;
        if (Math.random() < 0.5)
          this.explosion(
            e.x + rand(-e.radius, e.radius),
            e.y + rand(-e.radius, e.radius),
            rand(14, 34),
            e.boss?.color ?? "#fff",
          );
        if (Math.random() < 0.15) Audio.SFX.explode();
        this.shake(0.25);
        if (e.dying <= 0) this.finishBoss(e);
        return;
      }
      let dx = p.x - e.x,
        dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      const slowMul = e.slow > 0 ? 0.55 : 1;
      if (e.boss) {
        if (this.state === "PLAYING") e.boss.update(this, e, dt);
        else {
          e.vx *= 0.9;
          e.vy *= 0.9;
        }
        if (e.hp < e.maxHp * 0.5 && Math.random() < 0.3) {
          const lp = this.bossLocal(e, rand(-12, 12), rand(-12, 12));
          this.emit(lp.x, lp.y, 1, {
            color: Math.random() < 0.5 ? "#ff8a1f" : "#3a3450",
            speed: [20, 60],
            life: [0.4, 0.9],
            size: [3, 6],
            drag: 0.96,
          });
        }
      } else {
        // off-screen recycling avoids accumulating stragglers far away
        if (d > recycleR && e.def.behavior !== "generator") {
          const pos = this.spawnRing();
          e.x = pos.x;
          e.y = pos.y;
          e.aiState = 0;
          return;
        }
        this.enemyAI(e, dx, dy, d, dt);
      }
      e.x += (e.vx * slowMul + e.knockX) * dt;
      e.y += (e.vy * slowMul + e.knockY) * dt;
      e.knockX *= knockDecay;
      e.knockY *= knockDecay;
      if (!e.boss && e.def.behavior !== "generator") {
        const va = Math.atan2(e.vy, e.vx);
        if (e.vx * e.vx + e.vy * e.vy > 25) e.angle += angDiff(e.angle, va) * Math.min(1, dt * 8);
        for (const o of this.obstacles) {
          if (Math.abs(o.x - e.x) > o.r + e.radius || Math.abs(o.y - e.y) > o.r + e.radius)
            continue;
          this.pushOut(e, o, e.radius * 0.8);
        }
      }
      // contact damage
      const rr = e.radius * 0.8 + p.radius;
      if (
        this.state === "PLAYING" &&
        (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < rr * rr &&
        e.contactCD <= 0
      ) {
        this.damagePlayer(e.dmg);
        e.contactCD = 0.6;
        if (!e.boss) {
          const kr = 1 - e.def.knockResist;
          e.knockX = -dx * CONFIG.difficulty.contactKnockback * kr;
          e.knockY = -dy * CONFIG.difficulty.contactKnockback * kr;
          if (e.def.behavior === "hunter" && e.aiState === 2) e.aiState = 0;
        }
      }
    });
    // soft separation using the spatial grid
    const it = this.enemies.items;
    for (let i = 0; i < it.length; i++) {
      const a = it[i]!;
      if (!a.alive || a.boss || a.def.behavior === "generator") continue;
      const n = this.queryEnemies(a.x, a.y, a.radius);
      for (let k = 0; k < n; k++) {
        const b = this.qbuf[k]!;
        if (b === a || b.idx < a.idx) continue;
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const rr = a.radius + b.radius;
        const dd = dx * dx + dy * dy;
        if (dd > 0.0001 && dd < rr * rr) {
          const dist = Math.sqrt(dd);
          const ov = (rr - dist) * 0.5;
          const nx = dx / dist,
            ny = dy / dist;
          if (!b.boss) {
            a.x -= nx * ov * 0.5;
            a.y -= ny * ov * 0.5;
            b.x += nx * ov * 0.5;
            b.y += ny * ov * 0.5;
          } else {
            a.x -= nx * ov;
            a.y -= ny * ov;
          }
        }
      }
    }
  }

  private enemyAI(e: Enemy, dx: number, dy: number, d: number, dt: number) {
    const p = this.player;
    const playing = this.state === "PLAYING";
    switch (e.def.behavior) {
      case "interceptor": {
        if (e.aiState === 1) {
          e.vx = e.tx * e.speed * 1.2;
          e.vy = e.ty * e.speed * 1.2;
          e.aiT -= dt;
          if (e.aiT <= 0) e.aiState = 0;
        } else {
          const a = Math.atan2(dy, dx) + Math.sin(e.t * 4 + e.uid) * 0.55;
          e.vx = Math.cos(a) * e.speed;
          e.vy = Math.sin(a) * e.speed;
        }
        break;
      }
      case "hunter": {
        if (e.aiState === 1 && e.aiN === 0) {
          // formation flight then hunt
          e.vx = e.tx * e.speed * 1.1;
          e.vy = e.ty * e.speed * 1.1;
          e.aiT -= dt;
          if (e.aiT <= 0) {
            e.aiState = 0;
            e.aiT = 1;
          }
          if (d < 260) {
            e.aiState = 0;
            e.aiT = 0;
          }
          break;
        }
        e.aiT -= dt;
        if (e.aiState === 0) {
          e.vx = lerp(e.vx, dx * e.speed, 1 - Math.pow(0.05, dt));
          e.vy = lerp(e.vy, dy * e.speed, 1 - Math.pow(0.05, dt));
          if (d < 250 && e.aiT <= 0 && playing) {
            e.aiState = 3;
            e.aiT = 0.45;
            e.aiN = 1;
          }
        } else if (e.aiState === 3) {
          e.vx *= 0.85;
          e.vy *= 0.85;
          e.tx = dx;
          e.ty = dy;
          if (e.aiT <= 0) {
            e.aiState = 2;
            e.aiT = 0.42;
          }
        } else if (e.aiState === 2) {
          e.vx = e.tx * e.speed * 3.4;
          e.vy = e.ty * e.speed * 3.4;
          if (Math.random() < 0.5)
            this.emit(e.x, e.y, 1, {
              color: "#ff2d55",
              speed: [0, 20],
              life: [0.15, 0.3],
              size: [2, 4],
              add: true,
            });
          if (e.aiT <= 0) {
            e.aiState = 0;
            e.aiT = 2.2;
          }
        }
        break;
      }
      case "destroyer": {
        e.vx = dx * e.speed;
        e.vy = dy * e.speed;
        e.shootCD -= dt;
        if (e.shootCD <= 0 && d < 520 && playing) {
          const a = Math.atan2(dy, dx);
          for (let k = -1; k <= 1; k++)
            this.spawnEnemyProj(
              e.x,
              e.y,
              a + k * 0.22,
              e.def.shotSpeed,
              e.def.shotDmg,
              "bolt",
              "#9fb4ff",
              5,
            );
          e.shootCD = e.def.shootCD * rand(0.8, 1.2);
          Audio.SFX.bossShot();
        }
        break;
      }
      case "bomber": {
        const ideal = 330;
        const radial = d > ideal + 40 ? 1 : d < ideal - 40 ? -1 : 0;
        const side = e.uid % 2 ? 1 : -1;
        e.vx = (dx * radial - dy * side * 0.8) * e.speed;
        e.vy = (dy * radial + dx * side * 0.8) * e.speed;
        e.shootCD -= dt;
        if (e.shootCD <= 0 && d < 560 && playing) {
          const tx = p.x + p.vx * 0.6 + rand(-30, 30),
            ty = p.y + p.vy * 0.6 + rand(-30, 30);
          const a = Math.atan2(ty - e.y, tx - e.x);
          this.spawnEnemyProj(e.x, e.y, a, e.def.shotSpeed, e.def.shotDmg, "bomb", "#ff3df2", 7, {
            tx,
            ty,
            aoe: 62,
          });
          e.shootCD = e.def.shootCD * rand(0.85, 1.2);
        }
        break;
      }
      case "parasite": {
        const ideal = 230;
        const radial = d > ideal ? 1 : -0.3;
        e.vx = (dx * radial - dy * 0.6) * e.speed;
        e.vy = (dy * radial + dx * 0.6) * e.speed;
        e.shootCD -= dt;
        if (e.shootCD <= 0 && d < 520 && playing) {
          if ((this.killsByType["__larvae"] ?? 0) >= 0 && this.countLarvae() < 70) {
            for (let i = 0; i < 3; i++)
              this.spawnEnemyAt("spawnling", e.x + rand(-12, 12), e.y + rand(-12, 12));
            this.emit(e.x, e.y, 8, {
              color: "#7dff4f",
              speed: [30, 120],
              life: [0.2, 0.5],
              size: [2, 4],
              add: true,
            });
          }
          e.shootCD = e.def.shootCD * rand(0.85, 1.15);
        }
        break;
      }
      case "spawnling": {
        const a = Math.atan2(dy, dx) + Math.sin(e.t * 9 + e.uid) * 0.4;
        e.vx = Math.cos(a) * e.speed;
        e.vy = Math.sin(a) * e.speed;
        break;
      }
      case "generator": {
        const b = this.boss;
        if (!b || b.uid !== e.parentUid) {
          this.killEnemy(e);
          return;
        }
        e.orbitA += dt * 0.8;
        const R = b.radius + 85;
        e.x = b.x + Math.cos(e.orbitA) * R;
        e.y = b.y + Math.sin(e.orbitA) * R;
        e.vx = e.vy = 0;
        e.angle += dt * 3;
        e.shootCD -= dt;
        if (e.shootCD <= 0 && playing) {
          this.spawnEnemyProj(
            e.x,
            e.y,
            Math.atan2(p.y - e.y, p.x - e.x),
            e.def.shotSpeed,
            e.def.shotDmg,
            "orb",
            "#25f4ff",
            6,
          );
          e.shootCD = e.def.shootCD * rand(0.8, 1.3);
        }
        break;
      }
    }
  }

  private countLarvae() {
    let n = 0;
    this.enemies.forEachAlive((e) => {
      if (e.def.behavior === "spawnling") n++;
    });
    return n;
  }

  private explodeAt(x: number, y: number, r: number, dmg: number, color: string) {
    const n = this.queryEnemies(x, y, r);
    for (let i = 0; i < n; i++) this.damageEnemy(this.qbuf[i]!, dmg);
    this.explosion(x, y, r * 0.35, color);
    this.emit(x, y, 1, {
      color,
      speed: [0, 0],
      life: [0.3, 0.3],
      size: [4, 4],
      kind: 2,
      add: true,
      grow: r * 3,
    });
    Audio.SFX.explode();
  }

  private updateProjectiles(dt: number) {
    const lim = CONFIG.world.arenaRadius + 500;
    this.projectiles.forEachAlive((pr) => {
      pr.life -= dt;
      if (pr.life <= 0) {
        if (pr.kind === "plasma" || pr.kind === "missile" || pr.kind === "bomblet")
          this.explodeAt(pr.x, pr.y, pr.aoe || 50, pr.dmg * 0.8, pr.color);
        pr.alive = false;
        return;
      }
      if (pr.kind === "missile") {
        const t = pr.target;
        if (!t || !t.alive || t.uid !== pr.targetUid || t.dying > 0) {
          pr.trailT -= 0;
          const nt = this.nearestEnemy(pr.x, pr.y, 650);
          pr.target = nt;
          pr.targetUid = nt ? nt.uid : -1;
        }
        const cur = Math.atan2(pr.vy, pr.vx);
        let sp = Math.hypot(pr.vx, pr.vy);
        sp = Math.min(pr.speed, sp + pr.speed * 1.5 * dt);
        let na = cur;
        if (pr.target)
          na =
            cur +
            clamp(
              angDiff(cur, Math.atan2(pr.target.y - pr.y, pr.target.x - pr.x)),
              -pr.turn * dt,
              pr.turn * dt,
            );
        pr.vx = Math.cos(na) * sp;
        pr.vy = Math.sin(na) * sp;
        pr.trailT -= dt;
        if (pr.trailT <= 0) {
          pr.trailT = 0.025;
          this.emit(pr.x, pr.y, 1, {
            color: Math.random() < 0.5 ? "#ffd23f" : "#6a6488",
            speed: [5, 30],
            life: [0.2, 0.45],
            size: [2, 4],
            drag: 0.94,
          });
        }
      } else if (pr.kind === "plasma" && pr.evolved) {
        const n = this.queryEnemies(pr.x, pr.y, 170);
        for (let i = 0; i < n; i++) {
          const e = this.qbuf[i]!;
          if (e.boss) continue;
          e.knockX += (pr.x - e.x) * 2.2 * dt * 10;
          e.knockY += (pr.y - e.y) * 2.2 * dt * 10;
        }
      }
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      if (Math.abs(pr.x) > lim || Math.abs(pr.y) > lim) {
        pr.alive = false;
        return;
      }
      const n = this.queryEnemies(pr.x, pr.y, pr.radius);
      for (let i = 0; i < n && pr.alive; i++) {
        const e = this.qbuf[i]!;
        if (pr.hits.has(e.uid)) continue;
        if (pr.kind === "missile" || pr.kind === "bomblet") {
          this.explodeAt(pr.x, pr.y, pr.aoe, pr.dmg, pr.color);
          if (pr.kind === "missile" && pr.evolved) {
            for (let k = 0; k < 4; k++)
              this.fireProj(
                "bomblet",
                pr.x,
                pr.y,
                (k * TAU) / 4 + rand(-0.3, 0.3),
                320,
                pr.dmg * 0.4,
                { radius: 5, life: 0.35, color: "#ff8a1f", aoe: 42 },
              );
          }
          pr.alive = false;
          break;
        }
        this.damageEnemy(e, pr.dmg);
        pr.hits.add(e.uid);
        this.emit(pr.x, pr.y, 3, {
          color: pr.color,
          speed: [40, 140],
          life: [0.08, 0.22],
          size: [1, 3],
          add: true,
        });
        Audio.SFX.hit();
        if (pr.pierce > 0) pr.pierce--;
        else pr.alive = false;
      }
    });
  }

  private updateEnemyProjectiles(dt: number) {
    const p = this.player;
    this.eProj.forEachAlive((b) => {
      b.t += dt;
      b.life -= dt;
      if (b.life <= 0) {
        b.alive = false;
        return;
      }
      if (b.kind === "bomb") {
        const dx = b.tx - b.x,
          dy = b.ty - b.y;
        const step = Math.hypot(b.vx, b.vy) * dt;
        if (dx * dx + dy * dy <= step * step) {
          this.explosion(b.tx, b.ty, 26, "#ff3df2");
          this.emit(b.tx, b.ty, 1, {
            color: "#ff3df2",
            speed: [0, 0],
            life: [0.3, 0.3],
            size: [4, 4],
            kind: 2,
            add: true,
            grow: b.aoe * 3,
          });
          if (
            this.state === "PLAYING" &&
            (p.x - b.tx) ** 2 + (p.y - b.ty) ** 2 < (b.aoe + p.radius) ** 2
          )
            this.damagePlayer(b.dmg);
          Audio.SFX.explode();
          b.alive = false;
          return;
        }
      } else if (b.kind === "missile") {
        const cur = Math.atan2(b.vy, b.vx);
        const sp = Math.min(300, Math.hypot(b.vx, b.vy) + 120 * dt);
        const na = cur + clamp(angDiff(cur, Math.atan2(p.y - b.y, p.x - b.x)), -1.7 * dt, 1.7 * dt);
        b.vx = Math.cos(na) * sp;
        b.vy = Math.sin(na) * sp;
        if (Math.random() < 0.4)
          this.emit(b.x, b.y, 1, {
            color: "#6a6488",
            speed: [5, 20],
            life: [0.2, 0.4],
            size: [2, 3],
          });
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.kind !== "bomb") {
        for (const o of this.obstacles) {
          if ((o.x - b.x) ** 2 + (o.y - b.y) ** 2 < (o.r + b.radius) ** 2) {
            this.emit(b.x, b.y, 4, {
              color: b.color,
              speed: [30, 120],
              life: [0.1, 0.25],
              size: [1, 3],
              add: true,
            });
            b.alive = false;
            return;
          }
        }
        const rr = b.radius + p.radius * 0.8;
        if (this.state === "PLAYING" && (p.x - b.x) ** 2 + (p.y - b.y) ** 2 < rr * rr) {
          if (p.iframe > 0 || p.boostT > 0) return;
          this.damagePlayer(b.dmg);
          b.alive = false;
          return;
        }
      }
      if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 > 1800 * 1800) b.alive = false;
    });
  }

  private updateHazards(dt: number) {
    const p = this.player;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i]!;
      h.t += dt;
      if (h.t < h.warn) continue;
      const at = h.t - h.warn;
      if (h.kind === "circle") {
        this.explosion(h.x, h.y, h.r * 0.45, h.color);
        this.emit(h.x, h.y, 1, {
          color: h.color,
          speed: [0, 0],
          life: [0.35, 0.35],
          size: [4, 4],
          kind: 2,
          add: true,
          grow: h.r * 3,
        });
        if (
          this.state === "PLAYING" &&
          (p.x - h.x) ** 2 + (p.y - h.y) ** 2 < (h.r + p.radius * 0.6) ** 2
        )
          this.damagePlayer(h.dmg);
        if (h.hitsEnemies) {
          const n = this.queryEnemies(h.x, h.y, h.r);
          for (let k = 0; k < n; k++) this.damageEnemy(this.qbuf[k]!, h.dmg * 3);
        }
        if (h.meteor) {
          Audio.SFX.explode();
          this.shake(0.15);
        }
        this.hazards.splice(i, 1);
      } else if (h.kind === "line") {
        if (h.dmg <= 0 || at > h.dur) {
          this.hazards.splice(i, 1);
          continue;
        }
        h.tick -= dt;
        if (h.tick <= 0 && this.state === "PLAYING") {
          const rr = h.w / 2 + p.radius * 0.6;
          if (distToSegSq(p.x, p.y, h.x, h.y, h.x2, h.y2) < rr * rr) {
            this.damagePlayer(h.dmg);
            h.tick = 0.35;
          }
        }
      } else if (h.kind === "ring") {
        if (at > h.dur) {
          this.hazards.splice(i, 1);
          continue;
        }
        const cr = (at / h.dur) * h.r;
        const d = Math.hypot(p.x - h.x, p.y - h.y);
        if (
          !h.hitPlayer &&
          Math.abs(d - cr) < h.w / 2 + p.radius * 0.6 &&
          this.state === "PLAYING"
        ) {
          if (p.iframe <= 0 && p.boostT <= 0) {
            this.damagePlayer(h.dmg);
            h.hitPlayer = true;
          }
        }
      }
    }
  }

  private updateRings(dt: number) {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const w = this.rings[i]!;
      if (w.delay > 0) {
        w.delay -= dt;
        continue;
      }
      w.life -= dt;
      const t = 1 - w.life / w.maxLife;
      w.r = w.maxR * t;
      const n = this.queryEnemies(w.x, w.y, w.r);
      const inner = Math.max(0, w.r - 34);
      for (let k = 0; k < n; k++) {
        const e = this.qbuf[k]!;
        if (w.hit.has(e.uid)) continue;
        const dd = Math.hypot(e.x - w.x, e.y - w.y);
        if (dd + e.radius < inner) continue;
        this.damageEnemy(e, w.dmg);
        w.hit.add(e.uid);
        if (!e.boss) {
          const a = Math.atan2(e.y - w.y, e.x - w.x);
          const kr = 1 - e.def.knockResist;
          e.knockX += Math.cos(a) * 260 * kr;
          e.knockY += Math.sin(a) * 260 * kr;
        }
      }
      if (w.life <= 0) this.rings.splice(i, 1);
    }
  }

  private updateFx(dt: number) {
    const drag = (d: number) => Math.pow(d, dt * 60);
    this.particles.forEachAlive((pt) => {
      pt.life -= dt;
      if (pt.life <= 0) {
        pt.alive = false;
        return;
      }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      const k = drag(pt.drag);
      pt.vx *= k;
      pt.vy *= k;
      if (pt.grow) pt.size += pt.grow * dt;
    });
    this.dmgNums.forEachAlive((n) => {
      n.life -= dt;
      if (n.life <= 0) {
        n.alive = false;
        return;
      }
      n.y += n.vy * dt;
      n.vy *= drag(0.92);
    });
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const l = this.lines[i]!;
      l.life -= dt;
      if (l.life <= 0) this.lines.splice(i, 1);
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i]!;
      g.life -= dt;
      if (g.life <= 0) this.ghosts.splice(i, 1);
    }
    for (const o of this.obstacles) o.rot += o.spin * dt;
  }

  private updateGems(dt: number) {
    const p = this.player;
    const mr = p.pickupRadius;
    const G = CONFIG.gems;
    const k = Math.pow(G.drag, dt * 60);
    this.gems.forEachAlive((g) => {
      g.vx *= k;
      g.vy *= k;
      g.bobT += dt * 4;
      const dx = p.x - g.x,
        dy = p.y - g.y;
      const d = Math.hypot(dx, dy) || 1;
      if (g.pulled || d < mr) {
        const pull = g.pulled ? 1100 : lerp(G.magnetPullMin, G.magnetPullMax, 1 - d / mr);
        g.vx += (dx / d) * pull * dt * 6;
        g.vy += (dy / d) * pull * dt * 6;
        const sp = Math.hypot(g.vx, g.vy),
          max = 900;
        if (sp > max) {
          g.vx *= max / sp;
          g.vy *= max / sp;
        }
      }
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      if (d < p.radius + G.pickupBuffer) {
        Audio.SFX.pickup();
        this.giveXP(g.value);
        this.emit(g.x, g.y, 3, {
          color: ["#25f4ff", "#ff3df2", "#ffd23f", "#ffffff"][g.tier]!,
          speed: [40, 140],
          life: [0.12, 0.25],
          size: [1, 3],
          add: true,
        });
        g.alive = false;
      }
    });
  }

  private updatePickups(dt: number) {
    const p = this.player;
    this.pickups.forEachAlive((k) => {
      k.t += dt;
      if (k.t > 40) {
        k.alive = false;
        return;
      }
      const d = Math.hypot(p.x - k.x, p.y - k.y);
      if (d < p.pickupRadius * 0.6) {
        k.x += ((p.x - k.x) / d) * 300 * dt;
        k.y += ((p.y - k.y) / d) * 300 * dt;
      }
      if (d > p.radius + 18) return;
      k.alive = false;
      Audio.SFX.pickup();
      this.inventory[k.kind] += 1;
      this.cb.onItemCollected?.(k.kind);
    });
  }

  /** Activa manualmente un objeto del inventario. Devuelve false si no hay unidades. */
  useItem(kind: PickupKind, inventoryAlreadyConsumed = false): boolean {
    if (!this.player || (!inventoryAlreadyConsumed && this.inventory[kind] <= 0)) return false;
    if (!inventoryAlreadyConsumed) this.inventory[kind] -= 1;
    const p = this.player;
    Audio.SFX.power();
    if (kind === "repair") {
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.35);
      this.banner("REPARACIÓN", "+35% integridad", "good");
    } else if (kind === "magnet") {
      this.gems.forEachAlive((g) => {
        g.pulled = true;
      });
      // El pulso también recupera todos los objetos especiales que siguen en el campo.
      this.pickups.forEachAlive((k) => {
        this.inventory[k.kind] += 1;
        this.cb.onItemCollected?.(k.kind);
        k.alive = false;
      });
      this.banner("PULSO MAGNÉTICO", "Energía y objetos recuperados", "good");
    } else {
      this.flash = 0.6;
      this.addRing(p.x, p.y, 900, 0, "#3d7bff", 0);
      this.enemies.forEachAlive((e) => {
        if (Math.abs(e.x - p.x) > this.W / this.zoom || Math.abs(e.y - p.y) > this.H / this.zoom)
          return;
        this.damageEnemy(
          e,
          e.boss || e.def.behavior === "generator" ? e.maxHp * 0.05 : 150 * p.dmgMult,
        );
      });
      Audio.SFX.bigExplode();
      this.banner("DESCARGA EMP", "Enemigos en pantalla neutralizados", "good");
    }
    return true;
  }

  /* ------------------------------ HUD ------------------------------ */
  getHud(): HudState {
    const p = this.player;
    const ph = phaseAt(this.minute);
    const b = this.boss;
    return {
      hp: p.hp,
      maxHp: p.maxHp,
      shield: p.shield,
      shieldMax: p.shieldMax,
      xp: p.xp,
      xpToNext: p.xpToNext,
      level: p.level,
      time: this.elapsed,
      duration: this.duration,
      kills: this.kills,
      phase: ph.id,
      phaseName: ph.name,
      boostReady: p.boostCDMax > 0 ? 1 - p.boostCD / p.boostCDMax : 1,
      boss: b
        ? {
            name: b.boss!.name,
            hp: Math.max(0, b.hp),
            maxHp: b.maxHp,
            shield: b.shield,
            shieldMax: b.shieldMax,
            phase: b.phase,
          }
        : null,
      weapons: p.weapons.map((w) => ({
        id: w.def.id,
        icon: w.evolved ? "ic_evo" : w.def.icon,
        level: w.level + 1,
        max: w.def.levels.length,
        evolved: w.evolved,
      })),
      passives: Object.entries(p.passives).map(([id, n]) => ({
        id,
        icon: passiveById(id)?.icon ?? "ic_xp",
        stacks: n,
      })),
      hordeNotice: this.hordeNotice
        ? {
            horde: this.hordeNotice.horde,
            remaining: Math.max(0, 5 - Math.floor(this.hordeNotice.elapsed)),
          }
        : null,
      banner: this.bannerState ? { ...this.bannerState } : null,
      credits: this.creditsRaw,
      inventory: { ...this.inventory },
      playerStats: {
        damage: p.dmgMult,
        attackSpeed: p.cdMult > 0 ? 1 / p.cdMult : 1,
        speed: p.speed,
        maxHp: p.maxHp,
        armor: p.armor,
        regen: p.regen,
        critChance: p.critChance,
        pickupRadius: p.pickupRadius,
        xpMult: p.xpMult,
      },
    };
  }

  /* ------------------------------ render ------------------------------ */
  private draw(dt: number) {
    const ctx = this.ctx;
    const fancy = Settings.get().performance !== "low";
    const shakeOn = Settings.get().screenShake ? 1 : 0;
    const t = this.realTime;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const sx = (Math.random() - 0.5) * this.cam.shake * CONFIG.camera.shakeIntensity * shakeOn;
    const sy = (Math.random() - 0.5) * this.cam.shake * CONFIG.camera.shakeIntensity * shakeOn;
    this.backdrop.draw(ctx, this.W, this.H, this.cam.x, this.cam.y, this.zoom, t, dt, fancy);

    const vw = this.W / this.zoom,
      vh = this.H / this.zoom;
    ctx.save();
    ctx.translate(this.W / 2 + sx, this.H / 2 + sy);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.cam.x, -this.cam.y);
    const inView = (x: number, y: number, r: number) =>
      Math.abs(x - this.cam.x) < vw / 2 + r && Math.abs(y - this.cam.y) < vh / 2 + r;

    this.backdrop.drawFloor(ctx, this.cam.x, this.cam.y, vw, vh, t);
    // arena boundary
    const R = CONFIG.world.arenaRadius;
    if (Math.hypot(this.cam.x, this.cam.y) + Math.hypot(vw, vh) / 2 > R) {
      ctx.beginPath();
      ctx.rect(this.cam.x - vw, this.cam.y - vh, vw * 2, vh * 2);
      ctx.arc(0, 0, R + 20, 0, TAU, true);
      ctx.fillStyle = "rgba(4,0,12,0.55)";
      ctx.fill();
      ctx.setLineDash([18, 14]);
      ctx.lineDashOffset = -t * 40;
      ctx.strokeStyle = this.stage.accent;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, R + 20, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // spore clouds
    for (const s of this.spores) {
      if (!inView(s.x, s.y, s.r)) continue;
      const pulse = 0.85 + Math.sin(s.t * 1.6) * 0.15;
      if (fancy) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.35;
        const g = glow("#7dff4f", 64);
        ctx.drawImage(g, s.x - s.r * pulse, s.y - s.r * pulse, s.r * 2 * pulse, s.r * 2 * pulse);
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#3a8f20";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * pulse, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.8;
      for (let i = 0; i < 14; i++) {
        const a = i * 2.39 + s.t * 0.3,
          rr = (s.r * ((i * 37) % 100)) / 110;
        ctx.fillStyle = i % 3 ? "#7dff4f" : "#ff3df2";
        ctx.fillRect(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr, 4, 4);
      }
      ctx.globalAlpha = 1;
    }

    this.drawHazards(ctx, t, fancy);

    // obstacles
    for (const o of this.obstacles) {
      if (!inView(o.x, o.y, o.r * 1.6)) continue;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(o.x + 10, o.y + 14, o.r, o.r * 0.9, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      drawSprite(ctx, getSprite(o.sprite), o.x, o.y, o.rot, o.scale);
      if (fancy && this.stage.obstacles === "spires") {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 2 + o.x);
        const g = glow("#2be8c8", 48);
        ctx.drawImage(g, o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
    }

    // gems
    const cells = ["cell_s", "cell_m", "cell_l", "cell_xl"];
    this.gems.forEachAlive((g) => {
      if (!inView(g.x, g.y, 20)) return;
      const bob = Math.sin(g.bobT) * 2;
      if (fancy) {
        ctx.globalCompositeOperation = "lighter";
        ctx.drawImage(
          glow(["#25f4ff", "#ff3df2", "#ffd23f", "#ffffff"][g.tier]!, 16),
          g.x - 14,
          g.y - 14 + bob,
          28,
          28,
        );
        ctx.globalCompositeOperation = "source-over";
      }
      drawSprite(ctx, getSprite(cells[g.tier]!), g.x, g.y + bob, 0, 2.4);
    });
    // pickups
    this.pickups.forEachAlive((k) => {
      if (!inView(k.x, k.y, 30)) return;
      const pulse = 1 + Math.sin(k.t * 5) * 0.1;
      ctx.strokeStyle = ITEM_BY_KIND[k.kind].color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(k.x, k.y, 20 * pulse, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (k.t > 34 && Math.floor(k.t * 8) % 2) return;
      drawSprite(ctx, getSprite(ITEM_BY_KIND[k.kind].sprite), k.x, k.y, 0, 3 * pulse);
    });

    // enemy projectiles
    ctx.globalCompositeOperation = "lighter";
    this.eProj.forEachAlive((b) => {
      if (!inView(b.x, b.y, 40)) return;
      if (fancy)
        ctx.drawImage(
          glow(b.color, 16),
          b.x - b.radius * 3,
          b.y - b.radius * 3,
          b.radius * 6,
          b.radius * 6,
        );
      ctx.fillStyle = b.color;
      if (b.kind === "bolt" || b.kind === "missile") {
        const a = Math.atan2(b.vy, b.vx);
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(a);
        ctx.fillRect(-b.radius * 2, -b.radius / 2, b.radius * 4, b.radius);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(-b.radius, -b.radius / 4, b.radius * 2.4, b.radius / 2);
        ctx.restore();
      } else {
        const s = b.radius * (b.kind === "bomb" ? 1 + Math.sin(b.t * 20) * 0.2 : 1);
        ctx.fillRect(b.x - s, b.y - s, s * 2, s * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(b.x - s / 2, b.y - s / 2, s, s);
      }
    });
    ctx.globalCompositeOperation = "source-over";
    // bomb landing markers
    this.eProj.forEachAlive((b) => {
      if (b.kind !== "bomb") return;
      ctx.strokeStyle = "#ff3df2";
      ctx.globalAlpha = 0.5 + Math.sin(t * 20) * 0.2;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.tx, b.ty, b.aoe, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    // ghosts (boost afterimages, Némesis dash)
    ctx.globalCompositeOperation = "lighter";
    for (const g of this.ghosts) {
      ctx.globalAlpha = (g.life / 0.35) * 0.45;
      drawSprite(ctx, getSprite(g.sprite), g.x, g.y, g.a + Math.PI / 2, g.scale, true);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // enemies
    this.enemies.forEachAlive((e) => {
      const sc = e.boss ? e.boss.scale : e.def.scale * (e.elite ? 1.25 : 1);
      if (!inView(e.x, e.y, e.radius * 2.5)) return;
      if (e.boss) {
        this.drawBoss(ctx, e, t, fancy);
        return;
      }
      const spr = getSprite(e.def.sprite);
      const rot = e.def.behavior === "generator" ? e.angle : e.angle + Math.PI / 2;
      if (e.def.behavior === "generator" && this.boss) {
        ctx.strokeStyle = "#25f4ff";
        ctx.globalAlpha = 0.35 + Math.sin(t * 10 + e.uid) * 0.15;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(this.boss.x, this.boss.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (fancy && (e.elite || (e.def.behavior === "hunter" && e.aiState === 3))) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = e.elite ? 0.6 : 0.5 + Math.sin(t * 40) * 0.4;
        const gsz = e.radius * 4;
        ctx.drawImage(
          glow(e.elite ? "#ff3df2" : "#ff2d55", 32),
          e.x - gsz / 2,
          e.y - gsz / 2,
          gsz,
          gsz,
        );
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
      // engine flames
      if (e.def.engines.length)
        this.drawFlames(
          ctx,
          e.x,
          e.y,
          rot,
          sc,
          e.def.engines,
          e.def.color,
          0.6 + Math.random() * 0.4,
          fancy,
        );
      const pul = e.def.behavior === "parasite" ? 1 + Math.sin(e.t * 5) * 0.06 : 1;
      drawSprite(ctx, spr, e.x, e.y, rot, sc * pul, e.hitFlash > 0);
    });

    this.drawPlayer(ctx, t, fancy);
    if (this.helperPosition && inView(this.helperPosition.x, this.helperPosition.y, 40)) {
      ctx.save();
      this.drawFlames(
        ctx,
        this.helperPosition.x,
        this.helperPosition.y,
        0,
        PLAYER_SCALE,
        this.helperPosition.ship.engines,
        this.helperPosition.ship.trail,
        0.8,
        fancy,
      );
      drawSprite(
        ctx,
        getSprite(this.helperPosition.ship.sprite),
        this.helperPosition.x,
        this.helperPosition.y,
        0,
        PLAYER_SCALE,
      );
      ctx.fillStyle = "#ff4df0";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.fillText("AYUDANTE", this.helperPosition.x, this.helperPosition.y - 24);
      ctx.restore();
    }

    // player projectiles
    ctx.globalCompositeOperation = "lighter";
    this.projectiles.forEachAlive((pr) => {
      if (!inView(pr.x, pr.y, 40)) return;
      const a = Math.atan2(pr.vy, pr.vx);
      if (pr.kind === "laser" || pr.kind === "drone" || pr.kind === "spread") {
        const len = pr.kind === "laser" ? 22 : pr.kind === "drone" ? 12 : 10;
        const w = pr.kind === "spread" ? 5 : 4;
        ctx.save();
        ctx.translate(pr.x, pr.y);
        ctx.rotate(a);
        ctx.fillStyle = pr.color;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(-len, -w, len + 4, w * 2);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(-len + 4, -w / 2, len, w);
        ctx.restore();
      } else if (pr.kind === "missile" || pr.kind === "bomblet") {
        ctx.save();
        ctx.translate(pr.x, pr.y);
        ctx.rotate(a);
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "#e6ecf8";
        ctx.fillRect(-7, -3, 12, 6);
        ctx.fillStyle = "#ff2d55";
        ctx.fillRect(4, -3, 4, 6);
        ctx.fillStyle = "#363f62";
        ctx.fillRect(-8, -5, 3, 10);
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = "#ffd23f";
        ctx.fillRect(-14 - Math.random() * 4, -2, 7, 4);
        ctx.restore();
      } else if (pr.kind === "plasma") {
        const r = pr.radius * (1 + Math.sin(t * 30) * 0.1);
        if (fancy) ctx.drawImage(glow("#a35cff", 32), pr.x - r * 3, pr.y - r * 3, r * 6, r * 6);
        ctx.fillStyle = "#a35cff";
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#ff3df2";
        ctx.fillRect(pr.x - r * 0.6, pr.y - r * 0.6, r * 1.2, r * 1.2);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(pr.x - r * 0.3, pr.y - r * 0.3, r * 0.6, r * 0.6);
        if (pr.evolved) {
          ctx.strokeStyle = "#ff3df2";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(pr.x, pr.y, r * 2.4 + Math.sin(t * 12) * 4, 0, TAU);
          ctx.stroke();
        }
      }
    });
    // nova rings
    for (const w of this.rings) {
      if (w.delay > 0) continue;
      const a = w.life / w.maxLife;
      ctx.globalAlpha = a;
      ctx.strokeStyle = w.color;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.r, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.r, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // lightning / beams
    for (const l of this.lines) {
      ctx.globalAlpha = l.life / l.maxLife;
      ctx.strokeStyle = l.color;
      ctx.lineWidth = l.width;
      ctx.beginPath();
      ctx.moveTo(l.x1, l.y1);
      if (l.jag > 0) {
        const segs = 6;
        for (let i = 1; i < segs; i++) {
          const k = i / segs;
          ctx.lineTo(
            lerp(l.x1, l.x2, k) + (Math.random() - 0.5) * l.jag,
            lerp(l.y1, l.y2, k) + (Math.random() - 0.5) * l.jag,
          );
        }
      }
      ctx.lineTo(l.x2, l.y2);
      ctx.stroke();
      if (l.width > 4) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = l.width * 0.35;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    // particles
    this.particles.forEachAlive((pt) => {
      if (!inView(pt.x, pt.y, 60)) return;
      const a = pt.life / pt.maxLife;
      ctx.globalCompositeOperation = pt.add ? "lighter" : "source-over";
      ctx.globalAlpha = a;
      if (pt.kind === 2) {
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = 4 * a + 1;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, TAU);
        ctx.stroke();
      } else if (pt.kind === 1) {
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = pt.size;
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(pt.x - pt.vx * 0.05, pt.y - pt.vy * 0.05);
        ctx.stroke();
      } else {
        const s = pt.size * (0.4 + a * 0.6);
        ctx.fillStyle = pt.color;
        ctx.fillRect(pt.x - s / 2, pt.y - s / 2, s, s);
      }
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    // damage numbers
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let damageFont = "";
    this.dmgNums.forEachAlive((n) => {
      ctx.globalAlpha = Math.min(1, n.life / 0.3);
      const font = `${n.crit ? 14 : 10}px "Press Start 2P", monospace`;
      if (font !== damageFont) {
        ctx.font = font;
        damageFont = font;
      }
      ctx.fillStyle = "#0a0618";
      ctx.fillText(String(n.value), n.x + 2, n.y + 2);
      ctx.fillStyle = n.color;
      ctx.fillText(String(n.value), n.x, n.y);
    });
    ctx.globalAlpha = 1;
    ctx.restore();

    // screen-space overlays
    const p = this.player;
    if (this.boss && !inView(this.boss.x, this.boss.y, 0)) {
      const a = Math.atan2(this.boss.y - this.cam.y, this.boss.x - this.cam.x);
      const ex = this.W / 2 + Math.cos(a) * (this.W / 2 - 40),
        ey = this.H / 2 + Math.sin(a) * (this.H / 2 - 70);
      ctx.save();
      ctx.translate(clamp(ex, 30, this.W - 30), clamp(ey, 90, this.H - 40));
      ctx.rotate(a);
      ctx.fillStyle = this.boss.boss!.color;
      ctx.globalAlpha = 0.6 + Math.sin(t * 8) * 0.3;
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-8, -12);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-8, 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    if (p.hp < p.maxHp * 0.3 && this.state !== "ENDED") {
      const a = 0.25 + Math.sin(t * 6) * 0.12;
      const g = ctx.createRadialGradient(
        this.W / 2,
        this.H / 2,
        Math.min(this.W, this.H) * 0.35,
        this.W / 2,
        this.H / 2,
        Math.max(this.W, this.H) * 0.75,
      );
      g.addColorStop(0, "rgba(255,45,85,0)");
      g.addColorStop(1, `rgba(255,45,85,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.W, this.H);
    }
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.6, this.flash * 0.6)})`;
      ctx.fillRect(0, 0, this.W, this.H);
    }
  }

  private drawFlames(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    rot: number,
    sc: number,
    engines: { x: number; y: number }[],
    color: string,
    power: number,
    fancy: boolean,
  ) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    for (const en of engines) {
      const fx = en.x * sc,
        fy = en.y * sc + sc;
      const len = (2 + power * 5 + Math.random() * 1.5) * sc;
      ctx.fillStyle = color;
      ctx.fillRect(fx - sc, fy, sc * 2, len * 0.9);
      ctx.fillStyle = "#ffb347";
      ctx.fillRect(fx - sc * 0.5, fy, sc, len * 0.6);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(fx - sc * 0.5, fy, sc, len * 0.25);
      if (fancy) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.7;
        ctx.drawImage(glow(color, 16), fx - sc * 4, fy - sc * 2, sc * 8, sc * 8);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
    }
    ctx.restore();
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, t: number, fancy: boolean) {
    const p = this.player;
    const s = this.ship;
    // electric field
    const fw = p.weapons.find((w) => w.def.id === "field");
    if (fw) {
      const L = fw.def.levels[fw.level]!;
      const r = fieldRadius(fw, L);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "#3d7bff";
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = fw.evolved ? "#25f4ff" : "#3d7bff";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 10]);
      ctx.lineDashOffset = -fw.angle * 20;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * TAU;
        ctx.strokeStyle = "#9fc4ff";
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(a) * r * 0.3, p.y + Math.sin(a) * r * 0.3);
        ctx.lineTo(p.x + Math.cos(a + 0.2) * r * 0.65, p.y + Math.sin(a + 0.2) * r * 0.65);
        ctx.lineTo(p.x + Math.cos(a - 0.1) * r, p.y + Math.sin(a - 0.1) * r);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    // pickup radius hint
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = s.trail;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.pickupRadius, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const dead = this.state === "DYING" && this.endTimer < 1.7;
    if (!dead) {
      const rot = p.angle + Math.PI / 2;
      const spd = Math.hypot(p.vx, p.vy) / p.speed;
      this.drawFlames(
        ctx,
        p.x,
        p.y,
        rot,
        PLAYER_SCALE,
        s.engines,
        s.trail,
        clamp(spd, 0.2, 1) + (p.boostT > 0 ? 1.6 : 0),
        fancy,
      );
      const blink = p.iframe > 0 && p.boostT <= 0 && Math.floor(t * 18) % 2 === 0;
      if (!blink) {
        const jitter = p.hitT > 0 ? (Math.random() - 0.5) * 4 : 0;
        drawSprite(ctx, getSprite(s.sprite), p.x + jitter, p.y, rot, PLAYER_SCALE, p.hitT > 0.15);
      }
      // nav lights
      ctx.globalCompositeOperation = "lighter";
      s.lights.forEach((l, i) => {
        const on = Math.sin(t * 5 + i * Math.PI) > 0;
        if (!on) return;
        const wp = this.localToWorld(l.x, l.y);
        ctx.fillStyle = l.color;
        ctx.fillRect(wp.x - 2, wp.y - 2, 4, 4);
        if (fancy) ctx.drawImage(glow(l.color, 16), wp.x - 10, wp.y - 10, 20, 20);
      });
      if (p.fireFlash > 0) {
        for (const g of s.guns) {
          const wp = this.localToWorld(g.x, g.y - 3);
          ctx.drawImage(glow("#ffffff", 16), wp.x - 9, wp.y - 9, 18, 18);
        }
      }
      ctx.globalCompositeOperation = "source-over";
      // shield bubble
      if (p.shield > 0.5) {
        const k = p.shield / Math.max(1, p.shieldMax);
        const r = 34 + Math.sin(t * 4) * 1.5;
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.18 + k * 0.25 + (p.iframe > 0 ? 0.3 : 0);
        ctx.strokeStyle = "#25f4ff";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = "#25f4ff";
        for (let i = 0; i < 12; i++) {
          const a = (i * TAU) / 12 + t * 0.8;
          ctx.fillRect(p.x + Math.cos(a) * r - 2, p.y + Math.sin(a) * r - 2, 4, 4);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
    }
    // drones
    const dw = p.weapons.find((w) => w.def.id === "drones");
    if (dw) {
      const L = dw.def.levels[dw.level]!;
      const n = droneCount(dw, L);
      for (let i = 0; i < n; i++) {
        const d = dronePos(p, dw, L, i, n);
        const ox = d.x,
          oy = d.y;
        ctx.fillStyle = "#363f62";
        ctx.fillRect(ox - 7, oy - 3, 14, 6);
        ctx.fillStyle = "#c9d4ea";
        ctx.fillRect(ox - 5, oy - 5, 10, 10);
        ctx.fillStyle = dw.evolved ? "#ff3df2" : "#25f4ff";
        ctx.fillRect(ox - 2, oy - 2, 4, 4);
        ctx.fillStyle = "#0a0618";
        ctx.fillRect(ox - 9, oy - 1, 2, 2);
        ctx.fillRect(ox + 7, oy - 1, 2, 2);
        if (fancy) {
          ctx.globalCompositeOperation = "lighter";
          ctx.drawImage(glow(dw.evolved ? "#ff3df2" : "#25f4ff", 16), ox - 12, oy - 12, 24, 24);
          ctx.globalCompositeOperation = "source-over";
        }
      }
    }
  }

  private drawBoss(ctx: CanvasRenderingContext2D, e: Enemy, t: number, fancy: boolean) {
    const b = e.boss!;
    const rot = e.angle + Math.PI / 2;
    const flash = e.hitFlash > 0 || (e.dying > 0 && Math.floor(t * 20) % 2 === 0);
    if (fancy) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.35 + Math.sin(t * 3) * 0.1;
      const gs = e.radius * 4;
      ctx.drawImage(glow(b.color, 64), e.x - gs / 2, e.y - gs / 2, gs, gs);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    if (b.engines.length)
      this.drawFlames(
        ctx,
        e.x,
        e.y,
        rot,
        b.scale * 0.8,
        b.engines.map((en) => ({ x: en.x * 1.25, y: en.y * 1.25 })),
        b.color,
        0.8,
        fancy,
      );
    if (b.id === "colossus") {
      // shield bubble with rotating hex segments
      if (e.shield > 0) {
        ctx.globalCompositeOperation = "lighter";
        const r = e.radius * 1.35;
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = "#25f4ff";
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = "#25f4ff";
        ctx.lineWidth = 4;
        for (let i = 0; i < 12; i++) {
          const a = (i * TAU) / 12 + t * 0.6;
          ctx.beginPath();
          ctx.arc(e.x, e.y, r, a, a + 0.36);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
    }
    drawSprite(ctx, getSprite(b.sprite), e.x, e.y, rot, b.scale, flash);
    if (b.id === "leviathan") {
      const tur = getSprite("boss_leviathan_turret");
      b.turrets.forEach((tp, i) => {
        const wp = this.bossLocal(e, tp.x, tp.y);
        drawSprite(ctx, tur, wp.x, wp.y, (e.turretA[i] ?? 0) + Math.PI / 2, 3.4, flash);
      });
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 6; i++) {
        if (Math.floor(t * 4 + i) % 3 !== 0) continue;
        const wp = this.bossLocal(e, (i - 2.5) * 3, 8);
        ctx.fillStyle = "#ffd23f";
        ctx.fillRect(wp.x - 3, wp.y - 3, 6, 6);
      }
      ctx.globalCompositeOperation = "source-over";
    } else if (b.id === "nemesis") {
      ctx.globalCompositeOperation = "lighter";
      for (const tip of [
        { x: -15, y: 12 },
        { x: 15, y: 12 },
        { x: 0, y: -14 },
      ]) {
        const wp = this.bossLocal(e, tip.x, tip.y);
        ctx.globalAlpha = 0.6 + Math.sin(t * 12) * 0.3;
        if (fancy) ctx.drawImage(glow("#ff2d55", 32), wp.x - 22, wp.y - 22, 44, 44);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    } else if (b.id === "colossus") {
      ctx.globalCompositeOperation = "lighter";
      const pulse = 0.6 + Math.sin(t * (3 + e.phase * 2)) * 0.4;
      ctx.globalAlpha = pulse;
      if (fancy)
        ctx.drawImage(glow(e.phase >= 2 ? "#ff2d55" : "#ff3df2", 64), e.x - 60, e.y - 60, 120, 120);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  }

  private drawHazards(ctx: CanvasRenderingContext2D, t: number, fancy: boolean) {
    for (const h of this.hazards) {
      const warnK = clamp(h.t / h.warn, 0, 1);
      const blink = 0.5 + Math.sin(t * 24) * 0.25;
      if (h.kind === "circle") {
        ctx.globalAlpha = 0.12 + warnK * 0.25;
        ctx.fillStyle = h.color;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r * warnK, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = blink;
        ctx.strokeStyle = h.color;
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        if (h.meteor) {
          // falling meteor from the upper right
          const k = 1 - warnK;
          const mx = h.x + 420 * k,
            my = h.y - 700 * k;
          ctx.globalCompositeOperation = "lighter";
          for (let i = 0; i < 6; i++) {
            ctx.globalAlpha = 0.6 - i * 0.1;
            ctx.fillStyle = i < 2 ? "#ffd23f" : "#ff8a1f";
            ctx.fillRect(mx + i * 14, my - i * 23, 10 - i, 10 - i);
          }
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = "source-over";
          drawSprite(ctx, getSprite("rock_ash_1"), mx, my, t * 4, 1.6);
        }
      } else if (h.kind === "line") {
        const active = h.t >= h.warn && h.dmg > 0;
        if (!active) {
          ctx.globalAlpha = 0.25 + warnK * 0.4 * blink;
          ctx.strokeStyle = h.color;
          ctx.lineWidth = h.dmg > 0 ? 2 : h.w * 0.6;
          if (h.dmg > 0) ctx.setLineDash([16, 10]);
          ctx.beginPath();
          ctx.moveTo(h.x, h.y);
          ctx.lineTo(h.x2, h.y2);
          ctx.stroke();
          ctx.setLineDash([]);
          if (h.dmg > 0) {
            ctx.globalAlpha = 0.08 + warnK * 0.12;
            ctx.lineWidth = h.w;
            ctx.beginPath();
            ctx.moveTo(h.x, h.y);
            ctx.lineTo(h.x2, h.y2);
            ctx.stroke();
          }
        } else {
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.85;
          ctx.strokeStyle = h.color;
          ctx.lineWidth = h.w + Math.random() * 6;
          ctx.beginPath();
          ctx.moveTo(h.x, h.y);
          ctx.lineTo(h.x2, h.y2);
          ctx.stroke();
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = h.w * 0.35;
          ctx.stroke();
          ctx.globalCompositeOperation = "source-over";
        }
        // emitters
        ctx.globalAlpha = 1;
        if (h.meteor) {
          for (const [ex, ey] of [
            [h.x, h.y],
            [h.x2, h.y2],
          ] as const) {
            ctx.fillStyle = "#2a3550";
            ctx.fillRect(ex - 10, ey - 10, 20, 20);
            ctx.fillStyle = h.color;
            ctx.fillRect(ex - 4, ey - 4, 8, 8);
          }
        }
        ctx.globalAlpha = 1;
      } else {
        if (h.t < h.warn) {
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = warnK;
          if (fancy)
            ctx.drawImage(
              glow(h.color, 64),
              h.x - 120 * warnK,
              h.y - 120 * warnK,
              240 * warnK,
              240 * warnK,
            );
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = "source-over";
        } else {
          const cr = ((h.t - h.warn) / h.dur) * h.r;
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.8;
          ctx.strokeStyle = h.color;
          ctx.lineWidth = h.w;
          ctx.beginPath();
          ctx.arc(h.x, h.y, cr, 0, TAU);
          ctx.stroke();
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = h.w * 0.25;
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = "source-over";
        }
      }
    }
  }
}
