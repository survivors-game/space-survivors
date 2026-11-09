 import type { ReactNode } from "react";
import {
  BookOpen,
  Bug,
  Coins,
  Crosshair,
  Gamepad2,
  HelpCircle,
  Layers,
  ListChecks,
  Map as MapIcon,
  Rocket,
  Skull,
  Sparkles,
  Store,
  Target,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { SHIPS } from "@/game/data/ships";
import { WEAPONS } from "@/game/data/weapons";
import { PASSIVES } from "@/game/data/passives";
import { ENEMIES } from "@/game/data/enemies";
import { BOSSES } from "@/game/data/bosses";
import { BOSS_REWARDS } from "@/game/data/boss-rewards";
import { STAGES } from "@/game/data/stages";
import { CONFIG } from "@/game/config";
import { WORLD1_PICKUP_CHANCE, xpForLevel } from "@/game/timeline";
import {
  DAILY_CHEST,
  DAILY_MISSION_TEMPLATES,
  type MissionIcon,
  DAILY_PER_TIER,
  SEASON_CHALLENGES,
  SEASON_LENGTH_MS,
  SEASON_LEVELS,
  SEASON_MAX_LEVEL,
  WEEKLY_MISSION_TEMPLATES,
  WEEKLY_PICK_COUNT,
  getSeasonName,
} from "@/game/meta/missions";
import {
  ELITE_EFFICIENCY,
  MERIT_REQUIREMENTS,
  MODULES,
  UPGRADES,
  upgradeCost,
} from "@/game/meta/upgrades";
import { WikiSprite } from "./WikiSprite";

export interface WikiSection {
  id: string;
  label: string;
  icon: LucideIcon;
  content: ReactNode;
}

const MISSION_SPRITE: Record<MissionIcon, string> = {
  target: "ic_crit",
  zap: "ic_speed",
  skull: "ic_damage",
  shield: "ic_shield",
  flame: "ic_plasma",
  clock: "ic_rate",
  wrench: "ic_evo",
  crown: "ic_nova",
  radar: "ic_arc",
  cpu: "ic_engine",
  crosshair: "ic_lock",
};

const fmt = (n: number) => n.toLocaleString();
const pct = (n: number) => `${Math.round(n * 100)}%`;
const shipName = (id: string) => SHIPS.find((s) => s.id === id)?.name ?? id;
const stageName = (id: string) => STAGES.find((s) => s.id === id)?.name ?? id;
const weaponName = (id: string) => WEAPONS.find((w) => w.id === id)?.name ?? id;
const passiveName = (id: string) => PASSIVES.find((p) => p.id === id)?.name ?? id;

/* ---------- bloques reutilizables ---------- */

function H({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 mt-8 border-b border-cyan-500/20 pb-2 font-arcade text-xs uppercase tracking-wider text-cyan-200 first:mt-0">
      {children}
    </h2>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-sm leading-6 text-white/75">{children}</p>;
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 border-l-2 border-[#ffd700] bg-[#ffd700]/5 px-4 py-3 text-sm leading-6 text-white/80">
      {children}
    </div>
  );
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mb-4 space-y-2 text-sm leading-6 text-white/75">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-2 size-1.5 shrink-0 bg-cyan-300" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/5 py-1.5 text-xs">
      <span className="uppercase tracking-widest text-white/50">{label}</span>
      <span className="text-right font-bold text-white">{value}</span>
    </div>
  );
}

function Card({
  sprite,
  color = "#00f0ff",
  title,
  subtitle,
  children,
}: {
  sprite?: string;
  color?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <article className="flex flex-col gap-3 border border-cyan-500/20 bg-[#0b0d1c]/85 p-4">
      <div className="flex items-start gap-3">
        {sprite ? <WikiSprite id={sprite} color={color} size={56} /> : null}
        <div className="min-w-0">
          <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-white">{title}</h3>
          {subtitle ? <p className="mt-1 text-xs text-white/55">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </article>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="mb-4 grid gap-3 sm:grid-cols-2">{children}</div>;
}

function Steps({ items }: { items: { title: string; text: string }[] }) {
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((s, i) => (
        <div key={s.title} className="border border-cyan-500/20 bg-[#0b0d1c]/85 p-4">
          <p className="font-arcade text-[10px] text-[#ffd700]">PASO {i + 1}</p>
          <p className="mt-2 text-sm font-bold uppercase tracking-wider text-white">{s.title}</p>
          <p className="mt-2 text-xs leading-5 text-white/60">{s.text}</p>
        </div>
      ))}
    </div>
  );
}

/* ---------- secciones ---------- */

const inicio: WikiSection = {
  id: "inicio",
  label: "Bienvenida",
  icon: BookOpen,
  content: (
    <>
      <H>Bienvenida, piloto</H>
      <P>
        SPACE SURVIVORS es un juego arcade de supervivencia. Pilotas una nave en un campo de
        batalla donde las oleadas enemigas no se detienen. Durante la partida mejoras tu arsenal,
        y entre partidas mejoras tu cuenta en el hangar para llegar más lejos.
      </P>
      <Steps
        items={[
          { title: "Elige nave y sector", text: "Selecciona una nave del carrusel y el sector donde combatirás." },
          { title: "Sobrevive", text: "Destruye enemigos, sube de nivel y elige mejoras para tu arsenal." },
          { title: "Mejora en el hangar", text: "Usa los créditos ganados en MEJORAS para hacer más fuerte a tu flota." },
          { title: "Completa objetivos", text: "Misiones diarias, semanales y el pase de temporada te dan recompensas extra." },
        ]}
      />
      <H>Primeros consejos</H>
      <Bullets
        items={[
          "Empieza con HALCÓN NOVA: es equilibrada y te enseña a moverte.",
          "Mueve la nave constantemente. Quedarte quieto es la forma más rápida de perder.",
          "Usa el impulso para escapar de grupos. Tiene recarga, así que espera a que esté listo.",
          "Cuando subas de nivel, prioriza armas que puedas evolucionar con una pasiva compatible.",
          "No gastes todos tus créditos de golpe en el hangar: las mejoras de élite requieren mérito, no solo dinero.",
        ]}
      />
    </>
  ),
};

const controles: WikiSection = {
  id: "controles",
  label: "Controles",
  icon: Gamepad2,
  content: (
    <>
      <H>Teclado</H>
      <Stat label="Mover la nave" value="W A S D o flechas" />
      <Stat label="Impulso" value="Espacio o Shift" />
      <Stat label="Pausa" value="Esc o P" />
      <div className="h-4" />
      <P>
        El impulso multiplica tu velocidad por {CONFIG.boost.mult} durante{" "}
        {CONFIG.boost.duration} segundos. Después se recarga durante {CONFIG.boost.cooldown}{" "}
        segundos. Úsalo para atravesar enjambres o escapar de un jefe.
      </P>
      <H>Mando</H>
      <P>
        La palanca izquierda mueve la nave. El botón Start pausa la partida. El impulso se activa
        con el botón A o con el gatillo derecho.
      </P>
      <H>Pantalla táctil</H>
      <P>
        En móvil aparece un joystick en pantalla para moverte. Basta con arrastrar el dedo desde
        el centro hacia la dirección que quieras.
      </P>
    </>
  ),
};

const partida: WikiSection = {
  id: "partida",
  label: "La partida",
  icon: Crosshair,
  content: (
    <>
      <H>Modos de juego</H>
      <Grid>
        <Card title="CAMPAÑA" subtitle="Misión con límite de tiempo">
          <P>
            Una misión dura 20 minutos. Verás el tiempo restante en pantalla. Al final aparece el
            LEVIATÁN, el jefe final de la misión.
          </P>
        </Card>
        <Card title="INFINITO" subtitle="Sin límite de tiempo">
          <P>
            Sobrevive todo lo que puedas. Los jefes aparecen en orden: LEVIATÁN, NÉMESIS y
            COLOSO. El objetivo es llegar lo más lejos posible.
          </P>
        </Card>
      </Grid>
      <H>La dificultad sube</H>
      <P>
        Mientras avanza la misión, los enemigos ganan vida (+{pct(CONFIG.difficulty.hpScalePerMin)}{" "}
        por minuto) y causan más daño (+{pct(CONFIG.difficulty.dmgScalePerMin)} por minuto). Por
        eso una partida larga es más peligrosa que una corta, aunque te dé más recompensa.
      </P>
      <H>Experiencia y niveles</H>
      <P>
        Los enemigos sueltan experiencia. Cuando llenas la barra, subes de nivel y eliges una
        mejora. Cada nivel cuesta más que el anterior: el nivel 2 pide {fmt(xpForLevel(2))} de
        experiencia, el 5 pide {fmt(xpForLevel(5))} y el 10 pide {fmt(xpForLevel(10))}.
      </P>
      <H>Objetos</H>
      <P>
        Al eliminar enemigos, a veces aparecen objetos (aproximadamente un{" "}
        {pct(WORLD1_PICKUP_CHANCE)} de probabilidad por enemigo) que mejoran tu nave durante la
        misión.
      </P>
      <H>Resultado</H>
      <P>
        Al terminar una partida, ganes o pierdas, recibes créditos según tu tiempo de
        supervivencia, tu nivel y el sector. Ganar la misión multiplica esa recompensa por 1,5.
      </P>
    </>
  ),
};

const sectores: WikiSection = {
  id: "sectores",
  label: "Sectores",
  icon: MapIcon,
  content: (
    <>
      <H>Mapa de sectores</H>
      <P>
        Hay cuatro sectores. Cada uno es más difícil que el anterior, pero también paga más
        créditos por partida.
      </P>
      <Grid>
        {STAGES.map((s) => (
          <Card key={s.id} title={s.name} subtitle={s.subtitle}>
            <P>{s.desc}</P>
            <Stat label="Dificultad" value={`×${s.difficulty.toFixed(2)}`} />
            <Stat label="Recompensa de créditos" value={`×${s.rewardMult.toFixed(2)}`} />
            <Stat
              label="Desbloqueo"
              value={
                s.unlockAfter
                  ? `Gana ${stageName(s.unlockAfter)} o derrota al LEVIATÁN`
                  : "Disponible desde el inicio"
              }
            />
          </Card>
        ))}
      </Grid>
      <Tip>
        Un sector nuevo se desbloquea al ganar el anterior o al derrotar al LEVIATÁN. Así no
        necesitas vencer todo para seguir avanzando.
      </Tip>
    </>
  ),
};

const enemigos: WikiSection = {
  id: "enemigos",
  label: "Enemigos",
  icon: Bug,
  content: (
    <>
      <H>Tipos de enemigos</H>
      <P>
        Cada enemigo tiene su propia forma de atacar. Aprende a reconocerlos para decidir si
        conviene enfrentarlos o esquivarlos.
      </P>
      <Grid>
        {ENEMIES.map((e) => (
          <Card key={e.id} sprite={e.sprite} color={e.color} title={e.name}>
            <P>{e.desc}</P>
            <Stat label="Vida" value={fmt(e.hp)} />
            <Stat label="Velocidad" value={fmt(e.speed)} />
            <Stat label="Experiencia" value={`+${e.xp}`} />
          </Card>
        ))}
      </Grid>
    </>
  ),
};

const jefes: WikiSection = {
  id: "jefes",
  label: "Jefes",
  icon: Skull,
  content: (
    <>
      <H>Jefes</H>
      <P>
        Los jefes son los enemigos más peligrosos del juego. Derrotarlos da obsidiana, créditos y
        una posibilidad de conseguir naves u objetos.
      </P>
      <Grid>
        {BOSSES.map((b) => {
          const reward = BOSS_REWARDS.find((r) => r.bossId === b.id);
          return (
            <Card key={b.id} sprite={b.sprite} color={b.color} title={b.name} subtitle={b.title}>
              <P>{b.desc}</P>
              {reward ? (
                <>
                  <Stat label="Obsidiana" value={`${reward.obsidian} OBS`} />
                  <Stat label="Probabilidad de nave" value={pct(reward.shipChance)} />
                  <Stat label="Probabilidad de objeto" value={pct(reward.itemChance)} />
                </>
              ) : null}
              <Stat label="Créditos" value={`${fmt(b.credits)} CR`} />
            </Card>
          );
        })}
      </Grid>
      <H>Enfriamiento</H>
      <P>
        Después de derrotar a un jefe, queda bloqueado durante 1 hora. Si su turno llega mientras
        está bloqueado, aparece un aviso y se salta esa aparición. Mientras tanto, el resto de
        jefes sigue disponible.
      </P>
      <Tip>
        Un jefe bloqueado no pierde nada: simplemente vuelve a estar disponible cuando termina su
        enfriamiento.
      </Tip>
    </>
  ),
};

const naves: WikiSection = {
  id: "naves",
  label: "Naves",
  icon: Rocket,
  content: (
    <>
      <H>Flota</H>
      <P>
        Cada nave tiene una identidad distinta: más blindaje, más velocidad o un arma inicial
        diferente. Las mejoras del hangar se aplican a la nave que tengas seleccionada.
      </P>
      <Grid>
        {SHIPS.map((s) => (
          <Card key={s.id} sprite={s.sprite} title={s.name} subtitle={s.role}>
            <P>{s.desc}</P>
            <Stat label="Integridad" value={fmt(s.hp)} />
            <Stat label="Velocidad" value={fmt(s.speed)} />
            <Stat label="Arma inicial" value={weaponName(s.startWeapon)} />
            <Stat label="Precio" value={s.cost === 0 ? "Gratis" : `${fmt(s.cost)} CR`} />
          </Card>
        ))}
      </Grid>
    </>
  ),
};

const armas: WikiSection = {
  id: "armas",
  label: "Armas",
  icon: Zap,
  content: (
    <>
      <H>Arsenal</H>
      <P>
        Puedes llevar hasta {CONFIG.player.maxWeapons} armas al mismo tiempo. Cada arma sube de
        nivel al elegirla de nuevo en el momento de subir de nivel.
      </P>
      <Grid>
        {WEAPONS.map((w) => (
          <Card key={w.id} sprite={w.icon} color={w.color} title={w.name}>
            <P>{w.desc}</P>
            <Stat label="Niveles" value={`Hasta ${w.levels.length}`} />
            <Stat label="Evolución" value={`${w.evo.name} (requiere ${passiveName(w.evo.passive)})`} />
          </Card>
        ))}
      </Grid>
      <H>Evolución</H>
      <P>
        Un arma evoluciona cuando alcanza su nivel máximo y tienes la pasiva compatible. La
        evolución aparece como opción con mucha probabilidad al subir de nivel, y es la forma más
        potente de hacer crecer tu arsenal.
      </P>
    </>
  ),
};

const pasivas: WikiSection = {
  id: "pasivas",
  label: "Pasivas",
  icon: Sparkles,
  content: (
    <>
      <H>Pasivas</H>
      <P>
        Las pasivas mejoran tu nave de forma continua durante la partida, como más daño,
        velocidad o blindaje. Puedes tener hasta {CONFIG.player.maxPassives} pasivas distintas.
      </P>
      <Grid>
        {PASSIVES.map((p) => (
          <Card key={p.id} sprite={p.icon} color={p.color} title={p.name}>
            <P>{p.desc}</P>
            <Stat label="Acumulable" value={`Hasta ${p.maxStacks} veces`} />
          </Card>
        ))}
      </Grid>
    </>
  ),
};

const combate: WikiSection = {
  id: "combate",
  label: "Subida de nivel",
  icon: Layers,
  content: (
    <>
      <H>Qué ofrece cada nivel</H>
      <P>Al subir de nivel te ofrecen tres opciones. Las opciones posibles son:</P>
      <Bullets
        items={[
          <>
            <strong>Arma nueva:</strong> si tienes menos de {CONFIG.player.maxWeapons} armas.
          </>,
          <>
            <strong>Mejorar arma:</strong> sube un arma a su siguiente nivel.
          </>,
          <>
            <strong>Pasiva:</strong> añade una pasiva o acumula una que ya tienes.
          </>,
          <>
            <strong>Evolución:</strong> aparece cuando un arma está en su nivel máximo y tienes su
            pasiva compatible.
          </>,
        ]}
      />
      <H>Recalibrar</H>
      <P>
        Si no te gustan las opciones, puedes recalibrarlas. El número de recalibraciones depende
        de tu mejora RECALIBRADOR en el hangar: cada nivel suma una recalibración por partida.
      </P>
      <Tip>
        Un build sólido combina pocas armas bien evolucionadas con pasivas que las potencien. Es
        mejor tener cuatro armas fuertes que seis a medias.
      </Tip>
    </>
  ),
};

const mejoras: WikiSection = {
  id: "mejoras",
  label: "Mejoras del hangar",
  icon: Wrench,
  content: (
    <>
      <H>Mejoras permanentes</H>
      <P>
        Las mejoras son de tu cuenta: una mejora comprada se aplica a la nave que tengas
        seleccionada en ese momento. Los niveles 1 al 5 solo cuestan créditos. Los niveles 6 al 10
        además exigen mérito, es decir, logros dentro del juego.
      </P>
      <Grid>
        {UPGRADES.map((u) => {
          const first = MERIT_REQUIREMENTS[u.id]?.[0];
          return (
            <Card key={u.id} sprite={u.icon} title={u.name} subtitle={u.desc}>
              <Stat label="Nivel 1" value={`${fmt(upgradeCost(u.id, 0))} CR`} />
              <Stat label="Nivel 5" value={`${fmt(upgradeCost(u.id, 4))} CR`} />
              <Stat label={`Nivel ${u.max}`} value={`${fmt(upgradeCost(u.id, u.max - 1))} CR`} />
              {first ? <Stat label="Primer requisito de élite" value={first.label} /> : null}
            </Card>
          );
        })}
      </Grid>
      <H>Etapa de élite (niveles 6 al 10)</H>
      <P>
        Cada nivel de élite pide un requisito de mérito, como partidas completadas, jefes
        derrotados o sectores superados. Los requisitos son distintos para cada mejora, así que
        conviene elegir cuáles subir primero según cómo juegas.
      </P>
      <P>
        Además, cada nivel de élite aporta el {pct(ELITE_EFFICIENCY)} de lo que aporta un nivel
        básico. Es decir, la élite es más cara y menos eficiente por nivel, pero sigue siendo muy
        útil.
      </P>
      <H>Requisitos de mérito por mejora</H>
      <Grid>
        {UPGRADES.filter((u) => MERIT_REQUIREMENTS[u.id]).map((u) => (
          <Card key={u.id} sprite={u.icon} title={u.name}>
            <Bullets
              items={(MERIT_REQUIREMENTS[u.id] ?? []).map((r, i) => (
                <>
                  <strong>Nivel {u.eliteFrom + i}:</strong> {r.label}
                </>
              ))}
            />
          </Card>
        ))}
      </Grid>
      <H>Módulos de especialización</H>
      <P>
        Al llegar al nivel 10 de una mejora, eliges uno de dos módulos. El primero es gratis;
        cambiarlo después cuesta créditos. Cada módulo cambia el resultado final de la mejora.
      </P>
      <Grid>
        {UPGRADES.filter((u) => MODULES[u.id]).map((u) => (
          <Card key={u.id} sprite={u.icon} title={u.name}>
            <Bullets
              items={(MODULES[u.id] ?? []).map((m) => (
                <>
                  <strong>{m.name}:</strong> {m.desc}
                </>
              ))}
            />
          </Card>
        ))}
      </Grid>
    </>
  ),
};

const misiones: WikiSection = {
  id: "misiones",
  label: "Misiones y temporada",
  icon: Target,
  content: (
    <>
      <H>Misiones diarias</H>
      <P>
        Cada día se eligen {DAILY_PER_TIER} misiones de cada grupo: básico, piloto y élite, con
        un total de {DAILY_PER_TIER * 3}. Se reinician a medianoche UTC.
      </P>
      <Grid>
        {DAILY_MISSION_TEMPLATES.map((m) => (
          <Card key={m.id} sprite={MISSION_SPRITE[m.icon]} title={m.title}>
            <P>{m.desc}</P>
            <Stat label="Recompensa" value={`${fmt(m.reward)} CR · ${fmt(m.pt)} PT`} />
          </Card>
        ))}
      </Grid>
      <Tip>
        Completar {DAILY_CHEST.threshold} de las 6 misiones diarias desbloquea el cofre diario:{" "}
        {fmt(DAILY_CHEST.reward)} CR y {DAILY_CHEST.pt} PT extra.
      </Tip>
      <H>Misiones semanales</H>
      <P>
        Cada semana se eligen {WEEKLY_PICK_COUNT} misiones de un grupo de{" "}
        {WEEKLY_MISSION_TEMPLATES.length}. Son más largas y dan más recompensa. Se reinician los
        lunes a medianoche UTC.
      </P>
      <Grid>
        {WEEKLY_MISSION_TEMPLATES.map((m) => (
          <Card key={m.id} title={m.title}>
            <P>{m.desc}</P>
            <Stat label="Recompensa" value={`${fmt(m.reward)} CR · ${fmt(m.pt)} PT`} />
          </Card>
        ))}
      </Grid>
      <H>Desafíos de temporada</H>
      <P>
        Los desafíos cuentan lo que haces dentro de la temporada actual. Cada uno se reclama una
        sola vez por temporada.
      </P>
      <Grid>
        {SEASON_CHALLENGES.map((c) => (
          <Card key={c.id} sprite={MISSION_SPRITE[c.icon]} title={c.title}>
            <P>{c.desc}</P>
            <Stat label="Recompensa" value={`${fmt(c.reward)} CR · ${fmt(c.pt)} PT`} />
          </Card>
        ))}
      </Grid>
      <H>Pase de temporada</H>
      <P>
        Cada temporada dura {Math.round(SEASON_LENGTH_MS / 86_400_000)} días. Los PT que ganas con
        misiones y desafíos suben tu nivel del pase, de 1 a {SEASON_MAX_LEVEL}. Actualmente estás en{" "}
        <strong>{getSeasonName()}</strong>.
      </P>
      <Bullets
        items={[
          <>
            <strong>Carril gratuito:</strong> lo puede reclamar cualquier piloto al alcanzar el nivel.
          </>,
          <>
            <strong>Carril VIP:</strong> necesita VIP activo para reclamar. Sin VIP puedes ver sus
            recompensas, pero no reclamarlas.
          </>,
        ]}
      />
      <Grid>
        {SEASON_LEVELS.filter((n) => n.level === 1 || n.level === 10 || n.level === SEASON_MAX_LEVEL).map((n) => (
          <Card key={n.level} title={`Nivel ${n.level}`} subtitle={`${fmt(n.requiredPt)} PT`}>
            <Stat label="Gratuito" value={n.freeReward.label} />
            <Stat label="VIP" value={n.vipReward.label} />
          </Card>
        ))}
      </Grid>
      <Tip>
        Al terminar una temporada, el pase y los desafíos se reinician. Tus créditos, naves y
        mejoras se conservan.
      </Tip>
    </>
  ),
};

const economia: WikiSection = {
  id: "economia",
  label: "Créditos y obsidiana",
  icon: Coins,
  content: (
    <>
      <H>Créditos (CR)</H>
      <P>Los créditos son la moneda principal. Se ganan de estas formas:</P>
      <Bullets
        items={[
          "Al terminar cada partida, según tiempo, nivel alcanzado y sector.",
          "Al completar misiones diarias, semanales y desafíos de temporada.",
          "Al derrotar jefes (cada jefe da una cantidad fija, indicada en su ficha).",
          "Al reclamar niveles del pase de temporada.",
        ]}
      />
      <P>Se gastan en:</P>
      <Bullets
        items={[
          "Naves del hangar.",
          "Mejoras permanentes (niveles 1 al 10).",
          "Cambios de módulo de especialización.",
        ]}
      />
      <H>Obsidiana (OBS)</H>
      <P>
        La obsidiana es una moneda especial que se obtiene al derrotar jefes. Se usa para
        actividades del mercado, como publicar anuncios de naves y objetos.
      </P>
      <Grid>
        {BOSSES.map((b) => {
          const r = BOSS_REWARDS.find((x) => x.bossId === b.id);
          return (
            <Card key={b.id} sprite={b.sprite} color={b.color} title={b.name}>
              <Stat label="Obsidiana por derrota" value={r ? `${r.obsidian} OBS` : "--"} />
            </Card>
          );
        })}
      </Grid>
    </>
  ),
};

const mercado: WikiSection = {
  id: "mercado",
  label: "Mercado",
  icon: Store,
  content: (
    <>
      <H>Comprar y vender</H>
      <P>
        En la pestaña MERCADO puedes comprar y vender naves y objetos con otros pilotos. Solo
        puedes publicar naves que ya tienes desbloqueadas.
      </P>
      <Bullets
        items={[
          "Revisa los anuncios activos antes de comprar: cada uno muestra el precio y el método de pago.",
          "Tus anuncios pueden estar activos, pausados o cancelados.",
          "En el historial puedes revisar tus operaciones anteriores.",
        ]}
      />
      <Tip>
        Antes de publicar, revisa bien el precio y el método de pago que indicas en el anuncio.
      </Tip>
    </>
  ),
};

const alianza: WikiSection = {
  id: "alianza",
  label: "Alianzas y ayuda",
  icon: Users,
  content: (
    <>
      <H>Alianzas</H>
      <P>
        Desde la pestaña ALIANZA puedes crear una alianza o unirte a una existente. Las alianzas
        agrupan pilotos que juegan juntos y pueden participar en guerras de alianzas.
      </P>
      <Bullets
        items={[
          "Cada alianza tiene un líder y miembros.",
          "Desde la pestaña ALIANZA ves a tus compañeros y el estado de tu alianza.",
        ]}
      />
      <H>Ayuda contra jefes</H>
      <P>
        Un jefe puede ser demasiado duro para un solo piloto. Puedes invitar a otro piloto a
        ayudarte en el combate. Quien ayuda también recibe una recompensa por su participación.
      </P>
    </>
  ),
};

const faq: WikiSection = {
  id: "faq",
  label: "Preguntas frecuentes",
  icon: HelpCircle,
  content: (
    <>
      <H>Preguntas frecuentes</H>
      <Grid>
        {[
          {
            q: "¿Pierdo créditos si muero?",
            a: "No. Cada partida da créditos según lo que sobrevivas, muerras o ganes. Ganar da más.",
          },
          {
            q: "¿Las mejoras son de cada nave?",
            a: "No. Las mejoras son de tu cuenta y se aplican a la nave que tengas seleccionada.",
          },
          {
            q: "¿Por qué un jefe aparece bloqueado?",
            a: "Lo derrotaste hace menos de 1 hora. Vuelve a estar disponible cuando termine su enfriamiento.",
          },
          {
            q: "¿Qué es el mérito?",
            a: "Son los logros del juego (partidas, jefes, sectores, niveles) que piden los niveles 6 al 10 de las mejoras.",
          },
          {
            q: "¿Cuánto dura una temporada?",
            a: `${Math.round(SEASON_LENGTH_MS / 86_400_000)} días. Al terminar, el pase y los desafíos se reinician.`,
          },
          {
            q: "¿Qué pasa con mi progreso de temporada si termina?",
            a: "El pase de temporada se reinicia. Tus créditos, naves y mejoras se conservan.",
          },
        ].map((item) => (
          <div key={item.q} className="border border-cyan-500/20 bg-[#0b0d1c]/85 p-4">
            <p className="text-sm font-bold text-cyan-100">{item.q}</p>
            <p className="mt-2 text-sm leading-6 text-white/65">{item.a}</p>
          </div>
        ))}
      </Grid>
    </>
  ),
};

const glosario: WikiSection = {
  id: "glosario",
  label: "Glosario",
  icon: ListChecks,
  content: (
    <>
      <H>Glosario</H>
      <Grid>
        {[
          ["CR", "Créditos. Moneda principal del juego."],
          ["OBS", "Obsidiana. Moneda especial que se obtiene al derrotar jefes."],
          ["PT", "Puntos de temporada. Suben tu nivel del pase."],
          ["XP", "Experiencia. Se gana con enemigos y sube tu nivel durante la partida."],
          ["Integridad", "Vida de tu nave. Si llega a cero, la partida termina."],
          ["Velocidad", "Qué tan rápido te mueves."],
          ["Recarga", "Tiempo entre disparos de tus armas. Menos recarga significa disparar más seguido."],
          ["Reparación", "Vida que recuperas por segundo."],
          ["Evolución", "Versión potenciada de un arma, al combinar nivel máximo con su pasiva."],
          ["Enfriamiento", "Tiempo de espera después de derrotar a un jefe."],
          ["Mérito", "Logros del juego que desbloquean los niveles de élite de las mejoras."],
          ["Módulo", "Especialización elegida al llegar al nivel 10 de una mejora."],
        ].map(([term, def]) => (
          <div key={term} className="border border-cyan-500/20 bg-[#0b0d1c]/85 p-3">
            <p className="font-arcade text-[10px] uppercase tracking-wider text-[#ffd700]">{term}</p>
            <p className="mt-2 text-xs leading-5 text-white/65">{def}</p>
          </div>
        ))}
      </Grid>
    </>
  ),
};

export const WIKI_SECTIONS: WikiSection[] = [
  inicio,
  controles,
  partida,
  sectores,
  enemigos,
  jefes,
  naves,
  armas,
  pasivas,
  combate,
  mejoras,
  misiones,
  economia,
  mercado,
  alianza,
  faq,
  glosario,
];