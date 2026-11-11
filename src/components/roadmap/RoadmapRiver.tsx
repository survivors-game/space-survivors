import { useEffect } from "react";
import {
  CheckCircle2,
  Coins,
  Cpu,
  Flame,
  Lock,
  Shield,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";

export interface RoadmapRiverProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectStage?: (stageId: string) => void;
}

type Tone = "cyan" | "amber" | "violet" | "emerald" | "blue" | "fuchsia" | "rose" | "gold";

interface ToneStyle {
  card: string;
  badge: string;
  node: string;
  text: string;
  button: string;
}

const TONES: Record<Tone, ToneStyle> = {
  cyan: {
    card: "border-cyan-500/40 bg-cyan-950/20",
    badge: "border-cyan-500/50 bg-cyan-500/10 text-cyan-200",
    node: "border-cyan-400 bg-[#070814]",
    text: "text-cyan-300",
    button: "border-cyan-400/60 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20",
  },
  amber: {
    card: "border-amber-500/40 bg-amber-950/20",
    badge: "border-amber-500/50 bg-amber-500/10 text-amber-200",
    node: "border-amber-400 bg-[#070814]",
    text: "text-amber-300",
    button: "border-amber-400/60 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20",
  },
  violet: {
    card: "border-purple-500/40 bg-purple-950/20",
    badge: "border-purple-500/50 bg-purple-500/10 text-purple-200",
    node: "border-purple-400 bg-[#070814]",
    text: "text-purple-300",
    button: "border-purple-400/60 bg-purple-500/10 text-purple-100 hover:bg-purple-500/20",
  },
  emerald: {
    card: "border-emerald-500/40 bg-emerald-950/20",
    badge: "border-emerald-500/50 bg-emerald-500/10 text-emerald-200",
    node: "border-emerald-400 bg-[#070814]",
    text: "text-emerald-300",
    button: "border-emerald-400/60 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20",
  },
  blue: {
    card: "border-blue-500/40 bg-blue-950/20",
    badge: "border-blue-500/50 bg-blue-500/10 text-blue-200",
    node: "border-blue-400 bg-[#070814]",
    text: "text-blue-300",
    button: "border-blue-400/60 bg-blue-500/10 text-blue-100 hover:bg-blue-500/20",
  },
  fuchsia: {
    card: "border-fuchsia-500/40 bg-fuchsia-950/20",
    badge: "border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-200",
    node: "border-fuchsia-400 bg-[#070814]",
    text: "text-fuchsia-300",
    button: "border-fuchsia-400/60 bg-fuchsia-500/10 text-fuchsia-100 hover:bg-fuchsia-500/20",
  },
  rose: {
    card: "border-rose-500/40 bg-rose-950/20",
    badge: "border-rose-500/50 bg-rose-500/10 text-rose-200",
    node: "border-rose-400 bg-[#070814]",
    text: "text-rose-300",
    button: "border-rose-400/60 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20",
  },
  gold: {
    card: "border-yellow-500/50 bg-yellow-950/25",
    badge: "border-yellow-500/60 bg-yellow-500/10 text-yellow-200",
    node: "border-yellow-400 bg-[#070814]",
    text: "text-yellow-300",
    button: "border-yellow-400/60 bg-yellow-500/10 text-yellow-100 hover:bg-yellow-500/20",
  },
};

interface Feature {
  Icon: LucideIcon;
  text: string;
}

interface Phase {
  number: number;
  title: string;
  status: string;
  tone: Tone;
  Icon: LucideIcon;
  sector?: string;
  features: Feature[];
  playSectorId?: string;
}

const PHASES: Phase[] = [
  {
    number: 1,
    title: "GÉNESIS ORBITAL",
    status: "EN VIVO",
    tone: "cyan",
    Icon: CheckCircle2,
    sector: "Sector 01 — ÓRBITA NOVA · único sector desbloqueado",
    playSectorId: "nova",
    features: [
      {
        Icon: Flame,
        text: "Ciclo de 20 minutos con 10 hordas cronometradas (2 minutos por horda) y Jefe Leviatán al final.",
      },
      {
        Icon: Cpu,
        text: "Puente de Mando Táctico 2187, Hangar 1-10 con módulos de especialización.",
      },
      {
        Icon: Shield,
        text: "Mercado P2P, Alianzas, guerras de clanes y auxilio Boss Help.",
      },
      {
        Icon: Sparkles,
        text: "Membresía VIP: +35% de drops, +20% de créditos y chat dorado.",
      },
      {
        Icon: CheckCircle2,
        text: "Misiones diarias y semanales, y Pase de Temporada.",
      },
    ],
  },
  {
    number: 2,
    title: "CINTURÓN DE FUEGO & COLOSO",
    status: "EN DESARROLLO",
    tone: "amber",
    Icon: Cpu,
    sector: "Sector 02 — CINTURÓN DE CENIZA",
    features: [
      {
        Icon: Flame,
        text: "Peligros: lluvia de meteoritos y campo de asteroides destructibles como cobertura.",
      },
      {
        Icon: Shield,
        text: "Jefe Coloso Blindado, con escudos pesados y metralla de fragmentación.",
      },
      {
        Icon: Cpu,
        text: "Consumibles de combate manuales: nanorreparación de emergencia y pulso EMP.",
      },
      {
        Icon: Coins,
        text: "Rachas de despegue diario con multiplicadores de recursos.",
      },
    ],
  },
  {
    number: 3,
    title: "EXPANSIÓN DE FLOTA & COOPERATIVO",
    status: "PLANIFICADO",
    tone: "violet",
    Icon: Lock,
    features: [
      {
        Icon: Shield,
        text: 'Nuevas naves: Caza Interceptor "Viper" y Fragata Blindada "Aegis", desbloqueables por méritos en el Cinturón de Ceniza.',
      },
      {
        Icon: Coins,
        text: "Torneo semanal de guerras de alianzas con pozo de recursos.",
      },
      {
        Icon: Sparkles,
        text: "Radar de alerta acústica y visual en el Hub cuando un aliado pide auxilio.",
      },
    ],
  },
  {
    number: 4,
    title: "EL ABISMO ALIENÍGENA & DRONES",
    status: "PLANIFICADO",
    tone: "emerald",
    Icon: Lock,
    sector: "Sector 03 — SECTOR ABISAL",
    features: [
      {
        Icon: Flame,
        text: "Peligros: nubes de esporas corrosivas que reducen la velocidad y drenan escudos, y arrecifes alienígenas.",
      },
      {
        Icon: Shield,
        text: "Enemigos: naves parasitarias en enjambres y bombarderos de ácido teledirigido.",
      },
      {
        Icon: Cpu,
        text: "Drones de combate que orbitan la nave: recolector magnético, dron médico y dron de cobertura láser.",
      },
      {
        Icon: Sparkles,
        text: "Títulos militares de honor visibles en el chat.",
      },
    ],
  },
  {
    number: 5,
    title: "LA FORJA ESTELAR & CRAFTEO",
    status: "VISIÓN",
    tone: "blue",
    Icon: Sparkles,
    features: [
      {
        Icon: Cpu,
        text: "Taller de desmantelamiento y reciclaje de armas duplicadas.",
      },
      {
        Icon: Flame,
        text: "Crafteo de núcleos elementales: daño criogénico, plasma ardiente y arcos voltaicos.",
      },
      {
        Icon: Coins,
        text: "Subastas especiales P2P con puja de planos exóticos en Obsidiana.",
      },
    ],
  },
  {
    number: 6,
    title: "NÚCLEO OMEGA & JEFE NÉMESIS",
    status: "VISIÓN",
    tone: "fuchsia",
    Icon: Sparkles,
    sector: "Sector 04 — NÚCLEO OMEGA · fortaleza hostil",
    features: [
      {
        Icon: Shield,
        text: "Pilones blindados y barreras láser móviles que barren la arena.",
      },
      {
        Icon: Flame,
        text: "Jefe final Némesis: IA extrema con 3 transformaciones de fase.",
      },
      {
        Icon: Coins,
        text: "Modo Heroico con dificultad extrema y multiplicadores épicos de botín.",
      },
      {
        Icon: Sparkles,
        text: "Condecoraciones de campaña completa.",
      },
    ],
  },
  {
    number: 7,
    title: "MODO INFINITO & PRESTIGIO",
    status: "VISIÓN",
    tone: "rose",
    Icon: Sparkles,
    sector: "Sector Infinito (Endless Void)",
    features: [
      {
        Icon: Flame,
        text: "Sin límite de 20 minutos y dificultad creciente con jefes rotativos.",
      },
      {
        Icon: Sparkles,
        text: "Sistema de Prestigio militar: reinicio del hangar a cambio de auras cosméticas neón exclusivas.",
      },
      {
        Icon: Shield,
        text: "Raids de alianza semanales (World Boss) con daño acumulado conjunto.",
      },
    ],
  },
  {
    number: 8,
    title: "POLÍGONO WEB3 & TOKEN OBSIDIANA",
    status: "TOKEN & WEB3",
    tone: "gold",
    Icon: Sparkles,
    sector: "Meta suprema",
    features: [
      {
        Icon: Coins,
        text: "Contrato inteligente oficial del token OBS desplegado en la red Polygon, con bajas comisiones y alta velocidad.",
      },
      {
        Icon: Shield,
        text: "Conexión de billetera no custodial (MetaMask o WalletConnect) vinculada al perfil del piloto.",
      },
      {
        Icon: Coins,
        text: "Retiro del saldo de Obsidiana a la red Polygon para canjear por USDT o dinero real en DEX y P2P.",
      },
      {
        Icon: Sparkles,
        text: "Staking de OBS: rendimiento pasivo y cosméticos únicos por mantener tokens en staking.",
      },
    ],
  },
];

export function RoadmapRiver({ isOpen, onClose, onSelectStage }: RoadmapRiverProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="roadmap-river-title"
      className="fixed inset-0 z-[90] overflow-y-auto bg-[#070814]/95 backdrop-blur-sm"
    >
      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 text-white sm:space-y-8 sm:p-8">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">Hoja de ruta</p>
            <h2
              id="roadmap-river-title"
              className="text-xl font-bold uppercase tracking-wide sm:text-2xl"
            >
              El Río Cósmico · Stellar Riverway
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-white/65">
              Ocho fases de expansión. Solo la Fase 1 está operativa hoy; el resto puede cambiar
              durante el desarrollo.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar roadmap"
            className="grid size-10 shrink-0 place-items-center border border-white/15 bg-white/[0.03] text-white/80 transition hover:bg-white/10"
          >
            <X className="size-5" />
          </button>
        </header>

        <ol className="relative">
          <span
            aria-hidden="true"
            className="absolute bottom-0 left-5 top-0 w-0 border-l border-dashed border-cyan-400/35 md:left-1/2"
          />
          {PHASES.map((phase, index) => {
            const tone = TONES[phase.tone];
            const isLeft = index % 2 === 0;
            const sectorId = phase.playSectorId;
            return (
              <li key={phase.number} className="relative grid gap-6 pb-10 last:pb-0 md:grid-cols-2">
                <span
                  aria-hidden="true"
                  className={`absolute left-5 top-6 size-4 -translate-x-1/2 rounded-full border-2 md:left-1/2 ${tone.node}`}
                />
                <article
                  className={`ml-12 space-y-5 border p-5 sm:p-6 md:ml-0 ${tone.card} ${
                    isLeft ? "md:col-start-1 md:mr-10" : "md:col-start-2 md:ml-10"
                  }`}
                >
                  <div className="space-y-3">
                    <span
                      className={`inline-flex items-center gap-2 border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${tone.badge}`}
                    >
                      <phase.Icon className="size-3.5" />
                      FASE {phase.number} · {phase.status}
                    </span>
                    <h3 className="text-base font-bold uppercase leading-snug tracking-wide sm:text-xl">
                      {phase.title}
                    </h3>
                    {phase.sector ? (
                      <p className={`text-sm font-semibold ${tone.text}`}>{phase.sector}</p>
                    ) : null}
                  </div>

                  <ul className="space-y-3">
                    {phase.features.map((feature) => (
                      <li
                        key={feature.text}
                        className="flex gap-3 text-sm leading-relaxed text-white/80"
                      >
                        <feature.Icon className={`mt-0.5 size-4 shrink-0 ${tone.text}`} />
                        <span>{feature.text}</span>
                      </li>
                    ))}
                  </ul>

                  {sectorId ? (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectStage?.(sectorId);
                        onClose();
                      }}
                      className={`w-full border px-4 py-3 text-sm font-bold uppercase tracking-wider transition sm:w-auto ${tone.button}`}
                    >
                      [ JUGAR SECTOR 01 ]
                    </button>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ol>

        <footer className="border-t border-white/10 pt-5 text-xs leading-relaxed text-white/45">
          Las fases en visión o planificadas son objetivos de diseño y no tienen fecha de
          lanzamiento confirmada.
        </footer>
      </div>
    </div>
  );
}

export default RoadmapRiver;