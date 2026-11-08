import { DurableObject } from "cloudflare:workers";
import type { DurableObjectState } from "cloudflare:workers";
import { SHIPS, shipById } from "./data/ships";
import { defaultProgress, sanitize } from "./meta/progress";
import {
  allianceLevelForWins,
  canDeclareAgainstLevel,
  canStartWar,
  hasExpired,
  hasMinimumMembers,
  isLossCooldownActive,
  resolveWarWinner,
  warReward,
} from "./alliance-war-rules";

type Statement = {
  bind(...v: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
};
type DB = {
  prepare(q: string): Statement;
  batch(statements: Statement[]): Promise<{ meta?: { changes?: number } }[]>;
};
type Env = { DB: DB };
type WarRecord = {
  war_id: string;
  attacker_alliance_id: string;
  defender_alliance_id: string;
  status: string;
  winner_alliance_id: string | null;
  created_at: number;
  ended_at: number | null;
  attacker_hordes_survived: number;
  defender_hordes_survived: number;
};
type AllianceRecord = { alliance_id: string; level: number };
type WarParticipantRow = { pilot_id: string; alliance_id: string; ship_id: string };
type WarCountRow = {
  alliance_id: string;
  alive: number | string | null;
  survived: number | string | null;
};
type WarStatusParticipantRow = {
  pilot_id: string;
  alliance_id: string;
  ship_id: string;
  passive_upgrades_json: string | null;
  is_alive: number;
  hordes_survived: number;
  callsign: string;
};
type RequestBody = Record<string, unknown>;
type Side = "attacker" | "defender";
type Participant = {
  pilotId: string;
  allianceId: string;
  side: Side;
  shipId: string;
  hp: number;
  maxHp: number;
  alive: boolean;
  damage: number;
  armor: number;
  regen: number;
  buff: { id: string; label: string; damage: number; armor: number; regen: number };
};
type Runtime = {
  warId: string;
  prepStartedAt: number;
  lastTickAt: number;
  horde: number;
  hordeStartedAt: number;
  hordeCleared: { attacker: boolean; defender: boolean };
  enemyHp: { attacker: number; defender: number };
  participants: Participant[];
  lastAction: Record<string, number>;
  status: "PREPARING" | "ACTIVE" | "COMPLETED";
};

const PREP_MS = 60 * 60 * 1000,
  DECLARE_MS = 24 * 60 * 60 * 1000,
  HORDE_MS = 120_000,
  MAX_HORDES = 10;
const BUFFS = [
  { id: "overdrive", label: "SOBRECARGA", damage: 1.25, armor: 0, regen: 0 },
  { id: "bastion", label: "BLINDAJE", damage: 1, armor: 2, regen: 0 },
  { id: "nanites", label: "NANORREGENERACIÓN", damage: 1, armor: 0, regen: 1.2 },
  { id: "precision", label: "PUNTERÍA", damage: 1.4, armor: 0, regen: 0 },
  { id: "barrier", label: "BARRERA", damage: 1, armor: 1, regen: 0.5 },
];
const json = (v: unknown, s = 200) =>
  new Response(JSON.stringify(v), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
const id = () => crypto.randomUUID().replace(/-/g, "");
const isRecord = (value: unknown): value is RequestBody =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const stringField = (body: RequestBody, key: string): string | null => {
  const value = body[key];
  return typeof value === "string" && value.length > 0 ? value : null;
};

export class WarRoom extends DurableObject {
  private env: Env;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.env = env;
  }
  private async runtime(): Promise<Runtime | null> {
    return (await this.ctx.storage.get<Runtime>("runtime")) ?? null;
  }
  private async save(r: Runtime) {
    await this.ctx.storage.put("runtime", r);
  }
  private async war(warId: string) {
    return this.env.DB.prepare("SELECT * FROM alliance_wars WHERE war_id=?")
      .bind(warId)
      .first<WarRecord>();
  }
  private async member(pilotId: string, allianceId: string) {
    return this.env.DB.prepare(
      "SELECT role FROM alliance_members WHERE pilot_id=? AND alliance_id=?",
    )
      .bind(pilotId, allianceId)
      .first<{ role: string }>();
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url),
      path = url.pathname;
    if (request.method !== "POST" && path !== "/status")
      return json({ error: "Método no permitido." }, 405);
    const parsed: unknown = path === "/status" ? {} : await request.json().catch(() => null);
    const body: RequestBody | null = isRecord(parsed) ? parsed : null;
    if (!body && path !== "/status") return json({ error: "Solicitud inválida." }, 400);
    try {
      if (path === "/declare") return await this.declare(body!);
      if (path === "/respond") return await this.respond(body!);
      if (path === "/select-ship") return await this.selectShip(body!);
      if (path === "/start") return await this.start(body!);
      if (path === "/action") return await this.action(body!);
      if (path === "/status")
        return await this.status(
          url.searchParams.get("pilot_id") ?? "",
          url.searchParams.get("war_id") ?? "",
        );
      return json({ error: "Ruta de guerra no encontrada." }, 404);
    } catch (error) {
      console.error("WarRoom:", error);
      return json({ error: "No se pudo procesar la operación de guerra." }, 409);
    }
  }
  private async declare(b: RequestBody): Promise<Response> {
    const warId = stringField(b, "warId");
    const actorPilotId = stringField(b, "actorPilotId");
    const attackerAllianceId = stringField(b, "attackerAllianceId");
    const defenderAllianceId = stringField(b, "defenderAllianceId");
    if (
      !warId ||
      !actorPilotId ||
      !attackerAllianceId ||
      !defenderAllianceId ||
      attackerAllianceId === defenderAllianceId
    )
      return json({ error: "Datos de guerra inválidos." }, 400);
    const [attacker, defender, leader] = await Promise.all([
      this.env.DB.prepare("SELECT alliance_id,level FROM alliances WHERE alliance_id=?")
        .bind(attackerAllianceId)
        .first<AllianceRecord>(),
      this.env.DB.prepare("SELECT alliance_id,level FROM alliances WHERE alliance_id=?")
        .bind(defenderAllianceId)
        .first<AllianceRecord>(),
      this.env.DB.prepare("SELECT role FROM alliance_members WHERE pilot_id=? AND alliance_id=?")
        .bind(actorPilotId, attackerAllianceId)
        .first<{ role: string }>(),
    ]);
    if (!attacker || !defender) return json({ error: "No se encontró una de las alianzas." }, 404);
    if (!leader || leader.role !== "lider")
      return json({ error: "Solo el líder puede declarar una guerra." }, 403);
    if (!canDeclareAgainstLevel(attacker.level, defender.level))
      return json(
        { error: "La alianza rival debe tener el mismo nivel o un nivel superior, como máximo." },
        409,
      );
    const [attackerMembers, defenderMembers] = await Promise.all([
      this.env.DB.prepare("SELECT COUNT(*) AS n FROM alliance_members WHERE alliance_id=?")
        .bind(attackerAllianceId)
        .first<{ n: number }>(),
      this.env.DB.prepare("SELECT COUNT(*) AS n FROM alliance_members WHERE alliance_id=?")
        .bind(defenderAllianceId)
        .first<{ n: number }>(),
    ]);
    if (!hasMinimumMembers(attackerMembers?.n ?? 0, defenderMembers?.n ?? 0))
      return json({ error: "Ambas alianzas necesitan al menos 3 miembros." }, 409);
    for (const allianceId of [attackerAllianceId, defenderAllianceId]) {
      const active = await this.env.DB.prepare(
        "SELECT war_id FROM alliance_wars WHERE status IN ('DECLARED','PREPARING','ACTIVE') AND (attacker_alliance_id=? OR defender_alliance_id=?) LIMIT 1",
      )
        .bind(allianceId, allianceId)
        .first();
      if (active)
        return json({ error: "Una de las alianzas ya tiene una guerra activa o pendiente." }, 409);
      const lastWar = await this.env.DB.prepare(
        "SELECT winner_alliance_id,ended_at FROM alliance_wars WHERE status='COMPLETED' AND (attacker_alliance_id=? OR defender_alliance_id=?) ORDER BY ended_at DESC LIMIT 1",
      )
        .bind(allianceId, allianceId)
        .first<{ winner_alliance_id: string | null; ended_at: number }>();
      if (
        isLossCooldownActive(lastWar?.winner_alliance_id, allianceId, lastWar?.ended_at, Date.now())
      )
        return json(
          {
            error:
              "La alianza perdió recientemente y debe esperar 12 horas para declarar otra guerra.",
          },
          409,
        );
    }
    const now = Date.now();
    try {
      await this.env.DB.batch([
        this.env.DB.prepare(
          "INSERT INTO alliance_wars (war_id,attacker_alliance_id,defender_alliance_id,status,created_at) VALUES (?,?,?,'DECLARED',?)",
        ).bind(warId, attackerAllianceId, defenderAllianceId, now),
        this.env.DB.prepare(
          "INSERT INTO alliance_war_locks (alliance_id,war_id) VALUES (?,?)",
        ).bind(attackerAllianceId, warId),
        this.env.DB.prepare(
          "INSERT INTO alliance_war_locks (alliance_id,war_id) VALUES (?,?)",
        ).bind(defenderAllianceId, warId),
      ]);
    } catch {
      return json({ error: "Una de las alianzas ya tiene una guerra pendiente o activa." }, 409);
    }
    await this.ctx.storage.put("warId", warId);
    await this.ctx.storage.setAlarm(now + DECLARE_MS);
    return json({ success: true, war_id: warId, status: "DECLARED", expires_at: now + DECLARE_MS });
  }
  private async respond(b: RequestBody): Promise<Response> {
    const warId = stringField(b, "warId");
    const actorPilotId = stringField(b, "actorPilotId");
    const decision = b.decision;
    if (!warId || !actorPilotId) return json({ error: "Datos de guerra inválidos." }, 400);
    const w = await this.war(warId);
    if (!w) return json({ error: "La guerra no existe." }, 404);
    if (w.status !== "DECLARED")
      return json({ error: "La declaración ya no está pendiente." }, 409);
    if (hasExpired(Date.now(), w.created_at, DECLARE_MS)) {
      await this.env.DB.batch([
        this.env.DB.prepare(
          "UPDATE alliance_wars SET status='EXPIRED',ended_at=? WHERE war_id=? AND status='DECLARED'",
        ).bind(Date.now(), warId),
        this.env.DB.prepare("DELETE FROM alliance_war_locks WHERE war_id=?").bind(warId),
      ]);
      return json({ error: "La declaración expiró." }, 410);
    }
    const leader = await this.env.DB.prepare(
      "SELECT role FROM alliance_members WHERE pilot_id=? AND alliance_id=?",
    )
      .bind(actorPilotId, w.defender_alliance_id)
      .first<{ role: string }>();
    if (!leader || leader.role !== "lider")
      return json({ error: "Solo el líder defensor puede responder." }, 403);
    if (decision === "REJECT") {
      await this.env.DB.batch([
        this.env.DB.prepare(
          "UPDATE alliance_wars SET status='REJECTED',ended_at=? WHERE war_id=? AND status='DECLARED'",
        ).bind(Date.now(), warId),
        this.env.DB.prepare("DELETE FROM alliance_war_locks WHERE war_id=?").bind(warId),
      ]);
      return json({ success: true, status: "REJECTED" });
    }
    if (decision !== "ACCEPT") return json({ error: "Respuesta inválida." }, 400);
    const now = Date.now();
    await this.env.DB.prepare(
      "UPDATE alliance_wars SET status='PREPARING' WHERE war_id=? AND status='DECLARED'",
    )
      .bind(warId)
      .run();
    const r: Runtime = {
      warId,
      prepStartedAt: now,
      lastTickAt: now,
      horde: 1,
      hordeStartedAt: 0,
      hordeCleared: { attacker: false, defender: false },
      enemyHp: { attacker: 1000, defender: 1000 },
      participants: [],
      lastAction: {},
      status: "PREPARING",
    };
    await this.save(r);
    await this.ctx.storage.setAlarm(now + PREP_MS);
    return json({ success: true, status: "PREPARING", expires_at: now + PREP_MS });
  }
  private async selectShip(b: RequestBody): Promise<Response> {
    const warId = stringField(b, "warId");
    const actorPilotId = stringField(b, "actorPilotId");
    const shipId = stringField(b, "shipId");
    if (!warId || !actorPilotId || !shipId)
      return json({ error: "Datos de guerra inválidos." }, 400);
    const w = await this.war(warId);
    if (!w || w.status !== "PREPARING")
      return json({ error: "La guerra no está en preparación." }, 409);
    const r = await this.runtime();
    if (!r || hasExpired(Date.now(), r.prepStartedAt, PREP_MS))
      return json({ error: "El periodo de preparación expiró." }, 410);
    const member = await this.env.DB.prepare(
      "SELECT alliance_id FROM alliance_members WHERE pilot_id=? AND alliance_id IN (?,?)",
    )
      .bind(actorPilotId, w.attacker_alliance_id, w.defender_alliance_id)
      .first<{ alliance_id: string }>();
    if (!member) return json({ error: "No perteneces a ninguna alianza de esta guerra." }, 403);
    if (!SHIPS.some((s) => s.id === shipId)) return json({ error: "Nave no válida." }, 400);
    const item = await this.env.DB.prepare(
      "SELECT id FROM pilot_inventory WHERE pilot_id=? AND item_id=? AND item_type='nave' AND is_locked=0 AND quantity>0 AND grant_source IN ('starter','boss','market')",
    )
      .bind(actorPilotId, shipId)
      .first();
    if (!item)
      return json({ error: "La nave debe pertenecer al piloto y estar desbloqueada." }, 409);
    await this.env.DB.prepare(
      "INSERT INTO alliance_war_participants (war_id,pilot_id,alliance_id,ship_id,is_alive,hordes_survived) VALUES (?,?,?,?,1,0) ON CONFLICT(war_id,pilot_id) DO UPDATE SET ship_id=excluded.ship_id,alliance_id=excluded.alliance_id,is_alive=1",
    )
      .bind(warId, actorPilotId, member.alliance_id, shipId)
      .run();
    return json({ success: true, ship_id: shipId });
  }
  private async start(b: RequestBody): Promise<Response> {
    const warId = stringField(b, "warId");
    const actorPilotId = stringField(b, "actorPilotId");
    if (!warId || !actorPilotId) return json({ error: "Datos de guerra inválidos." }, 400);
    const w = await this.war(warId);
    if (!w || w.status !== "PREPARING")
      return json({ error: "La guerra no está en preparación." }, 409);
    const prep = await this.runtime();
    if (!prep || hasExpired(Date.now(), prep.prepStartedAt, PREP_MS)) {
      await this.env.DB.batch([
        this.env.DB.prepare(
          "UPDATE alliance_wars SET status='EXPIRED',ended_at=? WHERE war_id=? AND status='PREPARING'",
        ).bind(Date.now(), warId),
        this.env.DB.prepare("DELETE FROM alliance_war_locks WHERE war_id=?").bind(warId),
      ]);
      return json({ error: "El periodo de preparación expiró." }, 410);
    }
    const leader = await this.env.DB.prepare(
      "SELECT role FROM alliance_members WHERE pilot_id=? AND alliance_id IN (?,?)",
    )
      .bind(actorPilotId, w.attacker_alliance_id, w.defender_alliance_id)
      .first<{ role: string }>();
    if (!leader || leader.role !== "lider")
      return json({ error: "Solo el líder de una de las alianzas puede iniciar el combate." }, 403);
    const rows =
      (
        await this.env.DB.prepare(
          "SELECT pilot_id,alliance_id,ship_id FROM alliance_war_participants WHERE war_id=? ORDER BY pilot_id",
        )
          .bind(warId)
          .all<WarParticipantRow>()
      ).results ?? [];
    const sides = {
      attacker: rows.filter((p) => p.alliance_id === w.attacker_alliance_id),
      defender: rows.filter((p) => p.alliance_id === w.defender_alliance_id),
    };
    if (!canStartWar(sides.attacker.length, sides.defender.length))
      return json({ error: "Cada alianza debe seleccionar al menos 3 naves." }, 409);
    const now = Date.now(),
      participants: Participant[] = rows.map((p) => {
        const ship = shipById(p.ship_id),
          buff = BUFFS[Math.floor(Math.random() * BUFFS.length)]!;
        return {
          pilotId: p.pilot_id,
          allianceId: p.alliance_id,
          side: p.alliance_id === w.attacker_alliance_id ? "attacker" : "defender",
          shipId: p.ship_id,
          hp: ship.hp + ship.shield,
          maxHp: ship.hp + ship.shield,
          alive: true,
          damage: ship.dmg * buff.damage,
          armor: ship.armor + buff.armor,
          regen: ship.regen + buff.regen,
          buff,
        };
      });
    const r: Runtime = {
      warId,
      prepStartedAt: now,
      lastTickAt: now,
      horde: 1,
      hordeStartedAt: now,
      hordeCleared: { attacker: false, defender: false },
      enemyHp: { attacker: 1200, defender: 1200 },
      participants,
      lastAction: {},
      status: "ACTIVE",
    };
    const startStatements: Statement[] = [
      this.env.DB.prepare(
        "UPDATE alliance_wars SET status='ACTIVE',started_at=? WHERE war_id=? AND status='PREPARING'",
      ).bind(now, warId),
      this.env.DB.prepare(
        "INSERT OR IGNORE INTO alliance_war_members (war_id,pilot_id,alliance_id) SELECT ?,pilot_id,alliance_id FROM alliance_members WHERE alliance_id IN (?,?)",
      ).bind(warId, w.attacker_alliance_id, w.defender_alliance_id),
    ];
    for (const p of participants)
      startStatements.push(
        this.env.DB.prepare(
          "UPDATE alliance_war_participants SET passive_upgrades_json=?,is_alive=1,hordes_survived=0 WHERE war_id=? AND pilot_id=?",
        ).bind(JSON.stringify(p.buff), warId, p.pilotId),
      );
    const startResults = await this.env.DB.batch(startStatements);
    if ((startResults[0]?.meta?.changes ?? 0) !== 1)
      return json({ error: "La guerra ya fue iniciada." }, 409);
    await this.save(r);
    await this.ctx.storage.setAlarm(now + 5000);
    return json({
      success: true,
      status: "ACTIVE",
      horde: 1,
      participants: participants.map((p) => ({
        pilot_id: p.pilotId,
        ship_id: p.shipId,
        side: p.side,
        buff: p.buff,
        hp: p.hp,
        max_hp: p.maxHp,
      })),
    });
  }
  private async action(b: RequestBody): Promise<Response> {
    const warId = stringField(b, "warId");
    const actorPilotId = stringField(b, "actorPilotId");
    const action = b.action;
    if (!warId || !actorPilotId) return json({ error: "Datos de guerra inválidos." }, 400);
    const r = await this.runtime();
    if (!r || r.warId !== warId || r.status !== "ACTIVE")
      return json({ error: "No hay combate activo." }, 409);
    await this.advance(r);
    const p = r.participants.find((x) => x.pilotId === actorPilotId);
    if (!p || !p.alive) return json({ error: "No participas o tu nave fue destruida." }, 403);
    if (action !== "fire" && action !== "move") return json({ error: "Acción no válida." }, 400);
    if (action === "fire") {
      const now = Date.now(),
        last = r.lastAction[actorPilotId] ?? 0;
      if (now - last < 350) return json({ error: "Disparo demasiado rápido." }, 429);
      r.lastAction[actorPilotId] = now;
      const damage = Math.max(1, Math.round(p.damage * 35));
      r.enemyHp[p.side] = Math.max(0, r.enemyHp[p.side] - damage);
      if (r.enemyHp[p.side] === 0) r.hordeCleared[p.side] = true;
    }
    await this.save(r);
    return json(this.snapshot(r));
  }
  private async advance(r: Runtime): Promise<void> {
    const now = Date.now(),
      elapsed = Math.min(15, Math.max(0, (now - r.lastTickAt) / 1000));
    r.lastTickAt = now;
    for (const p of r.participants) {
      if (!p.alive) continue;
      const incoming = r.hordeCleared[p.side]
        ? 0
        : Math.max(0, 2.2 + r.horde * 0.35 - p.armor * 0.35 - p.regen);
      p.hp = Math.min(p.maxHp, Math.max(0, p.hp - incoming * elapsed));
      if (p.hp <= 0) {
        p.alive = false;
        await this.env.DB.prepare(
          "UPDATE alliance_war_participants SET is_alive=0 WHERE war_id=? AND pilot_id=?",
        )
          .bind(r.warId, p.pilotId)
          .run();
      }
    }
    for (const side of ["attacker", "defender"] as Side[]) {
      if (!r.participants.some((p) => p.side === side && p.alive)) {
        r.hordeCleared[side] = false;
        continue;
      }
    }
    if (now - r.hordeStartedAt >= HORDE_MS) {
      for (const side of ["attacker", "defender"] as Side[]) {
        if (r.participants.some((p) => p.side === side && p.alive)) {
          const allianceId =
            side === "attacker"
              ? (await this.war(r.warId)).attacker_alliance_id
              : (await this.war(r.warId)).defender_alliance_id;
          await this.env.DB.prepare(
            "UPDATE alliance_war_participants SET hordes_survived=hordes_survived+1 WHERE war_id=? AND alliance_id=? AND is_alive=1",
          )
            .bind(r.warId, allianceId)
            .run();
        }
      }
      r.horde++;
      r.hordeStartedAt = now;
      r.hordeCleared = { attacker: false, defender: false };
      r.enemyHp = { attacker: 1200 + r.horde * 300, defender: 1200 + r.horde * 300 };
      for (const p of r.participants) if (p.alive) p.hp = p.maxHp;
    }
    const a = r.participants.filter((p) => p.side === "attacker" && p.alive).length,
      d = r.participants.filter((p) => p.side === "defender" && p.alive).length;
    if (a === 0 || d === 0 || r.horde > MAX_HORDES) {
      await this.finish(r);
      return;
    }
    await this.save(r);
  }
  private async finish(r: Runtime): Promise<void> {
    if (r.status !== "ACTIVE") return;
    const w = await this.war(r.warId);
    if (!w) return;
    const counts = await this.env.DB.prepare(
      "SELECT alliance_id,SUM(is_alive) AS alive,MAX(hordes_survived) AS survived FROM alliance_war_participants WHERE war_id=? GROUP BY alliance_id",
    )
      .bind(r.warId)
      .all<WarCountRow>();
    const rows = counts.results ?? [],
      a = rows.find((x) => x.alliance_id === w.attacker_alliance_id),
      d = rows.find((x) => x.alliance_id === w.defender_alliance_id);
    const ah = Number(a?.survived ?? 0),
      dh = Number(d?.survived ?? 0),
      aliveA = Number(a?.alive ?? 0),
      aliveD = Number(d?.alive ?? 0);
    const outcome = resolveWarWinner(ah, dh, aliveA, aliveD);
    const winner: string | null =
      outcome === "attacker"
        ? w.attacker_alliance_id
        : outcome === "defender"
          ? w.defender_alliance_id
          : null;
    const now = Date.now(),
      statements: Statement[] = [
        this.env.DB.prepare(
          "UPDATE alliance_wars SET status='COMPLETED',winner_alliance_id=?,ended_at=?,attacker_hordes_survived=?,defender_hordes_survived=? WHERE war_id=? AND status='ACTIVE'",
        ).bind(winner, now, ah, dh, r.warId),
        this.env.DB.prepare("DELETE FROM alliance_war_locks WHERE war_id=?").bind(r.warId),
      ];
    for (const allianceId of [w.attacker_alliance_id, w.defender_alliance_id]) {
      const won = winner === allianceId,
        loss = winner !== null && !won;
      const current = await this.env.DB.prepare(
        "SELECT war_wins FROM alliances WHERE alliance_id=?",
      )
        .bind(allianceId)
        .first<{ war_wins: number }>();
      statements.push(
        this.env.DB.prepare(
          "UPDATE alliances SET war_wins=war_wins+?,war_losses=war_losses+?,level=? WHERE alliance_id=?",
        ).bind(
          won ? 1 : 0,
          loss ? 1 : 0,
          allianceLevelForWins(Number(current?.war_wins ?? 0) + (won ? 1 : 0)),
          allianceId,
        ),
      );
      const reward =
        winner === null ? warReward("DRAW") : won ? warReward("WIN") : warReward("LOSS");
      const members =
        (
          await this.env.DB.prepare(
            "SELECT pilot_id FROM alliance_war_members WHERE war_id=? AND alliance_id=?",
          )
            .bind(r.warId, allianceId)
            .all<{ pilot_id: string }>()
        ).results ?? [];
      for (const m of members) {
        if (reward.obsidian)
          statements.push(
            this.env.DB.prepare(
              "UPDATE pilots SET obsidian=obsidian+?,updated_at=? WHERE pilot_id=?",
            ).bind(reward.obsidian, now, m.pilot_id),
          );
        const old = await this.env.DB.prepare(
          "SELECT progress_json FROM player_progress WHERE pilot_id=?",
        )
          .bind(m.pilot_id)
          .first<{ progress_json: string }>();
        const progress = old ? sanitize(JSON.parse(old.progress_json)) : defaultProgress();
        progress.credits = (Number(progress.credits) || 0) + reward.credits;
        statements.push(
          this.env.DB.prepare(
            "INSERT INTO player_progress (pilot_id,progress_json,updated_at) VALUES (?,?,?) ON CONFLICT(pilot_id) DO UPDATE SET progress_json=excluded.progress_json,updated_at=excluded.updated_at",
          ).bind(m.pilot_id, JSON.stringify(progress), now),
        );
      }
    }
    const results = await this.env.DB.batch(statements);
    if ((results[0]?.meta?.changes ?? 0) !== 1)
      throw new Error("El resultado de la guerra ya fue procesado o cambió de estado.");
    r.status = "COMPLETED";
    await this.save(r);
  }
  private snapshot(r: Runtime) {
    return {
      war_id: r.warId,
      status: r.status,
      horde: r.horde,
      horde_duration_ms: HORDE_MS,
      horde_started_at: r.hordeStartedAt,
      horde_cleared: r.hordeCleared,
      enemy_hp: r.enemyHp,
      participants: r.participants.map((p) => ({
        pilot_id: p.pilotId,
        side: p.side,
        ship_id: p.shipId,
        hp: Math.round(p.hp),
        max_hp: p.maxHp,
        alive: p.alive,
        buff: p.buff,
      })),
    };
  }
  private async status(pilotId: string, warId: string): Promise<Response> {
    const w = await this.war(warId);
    if (!w) return json({ error: "Guerra no encontrada." }, 404);
    const member =
      (await this.member(pilotId, w.attacker_alliance_id)) ||
      (await this.member(pilotId, w.defender_alliance_id));
    if (!member) return json({ error: "No tienes acceso a esta guerra." }, 403);
    const r = await this.runtime();
    if (r?.status === "ACTIVE") {
      await this.advance(r);
      const latest = await this.runtime();
      return json({ war: w, ...this.snapshot(latest ?? r) });
    }
    const participants =
      (
        await this.env.DB.prepare(
          "SELECT p.pilot_id,p.alliance_id,p.ship_id,p.passive_upgrades_json,p.is_alive,p.hordes_survived,COALESCE(profile.display_name,pilot.callsign,'PILOTO') AS callsign FROM alliance_war_participants p JOIN pilots pilot ON pilot.pilot_id=p.pilot_id LEFT JOIN player_profiles profile ON profile.pilot_id=p.pilot_id WHERE p.war_id=?",
        )
          .bind(warId)
          .all<WarStatusParticipantRow>()
      ).results ?? [];
    return json({ war: w, participants });
  }
  async alarm(): Promise<void> {
    const r = await this.runtime();
    if (r?.status === "PREPARING" && hasExpired(Date.now(), r.prepStartedAt, PREP_MS)) {
      await this.env.DB.batch([
        this.env.DB.prepare(
          "UPDATE alliance_wars SET status='EXPIRED',ended_at=? WHERE war_id=? AND status='PREPARING'",
        ).bind(Date.now(), r.warId),
        this.env.DB.prepare("DELETE FROM alliance_war_locks WHERE war_id=?").bind(r.warId),
      ]);
      r.status = "COMPLETED";
      await this.save(r);
      return;
    }
    if (r?.status === "ACTIVE") {
      await this.advance(r);
      if (r.status === "ACTIVE") await this.ctx.storage.setAlarm(Date.now() + 5000);
      return;
    }
    const warId = await this.ctx.storage.get<string>("warId");
    if (warId) {
      const w = await this.war(warId);
      if (w?.status === "DECLARED" && hasExpired(Date.now(), w.created_at, DECLARE_MS))
        await this.env.DB.batch([
          this.env.DB.prepare(
            "UPDATE alliance_wars SET status='EXPIRED',ended_at=? WHERE war_id=? AND status='DECLARED'",
          ).bind(Date.now(), warId),
          this.env.DB.prepare("DELETE FROM alliance_war_locks WHERE war_id=?").bind(warId),
        ]);
    }
  }
}
