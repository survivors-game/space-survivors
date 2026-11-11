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
import { spriteUrl } from "@/game/sprites";
import { MenuAttractBackdrop } from "@/components/game/MenuAttractBackdrop";

export interface RoadmapRiverProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectStage?: (stageId: string) => void;
}

type Tone = "cyan" | "amber" | "violet" | "emerald" | "blue" | "fuchsia" | "rose" | "gold";

const TONES: Record<Tone, { card: string; badge: string; node: string; text: string; button: string }> = {
  cyan: {
    card: "border-cyan-500/35 bg-cyan-950/15",
    badge: "border-cyan-500/50 text-cyan-200",
    node: "border-cyan-400",
    text: "text-cyan-300",
    button: "border-cyan-400/60 text-cyan-100 hover:bg-cyan-500/15",
  },
  amber: {
    card: "border-amber-500/35 bg-amber-950/15",
    badge: "border-amber-500/50 text-amber-200",
    node: "border-amber-400",
    text: "text-amber-300",
    button: "border-amber-400/60 text-amber-100 hover:bg-amber-500/15",
  },
  violet: {
    card: "border-purple-500/35 bg-purple-950/15",
    badge: "border-purple-500/50 text-purple-200",
    node: "border-purple-400",
    text: "text-purple-300",
    button: "border-purple-400/60 text-purple-100 hover:bg-purple-500/15",
  },
  emerald: {
    card: "border-emerald-500/35 bg-emerald-950/15",
    badge: "border-emerald-500/50 text-emerald-200",
    node: "border-emerald-400",
    text: "text-emerald-300",
    button: "border-emerald-400/60 text-emerald-100 hover:bg-emerald-500/15",
  },
  blue: {
    card: "border-blue-500/35 bg-blue-950/15",
    badge: "border-blue-500/50 text-blue-200",
    node: "border-blue-400",
    text: "text-blue-300",
    button: "border-blue-400/60 text-blue-100 hover:bg-blue-500/15",
  },
  fuchsia: {
    card: "border-fuchsia-500/35 bg-fuchsia-950/15",
    badge: "border-fuchsia-500/50 text-fuchsia-200",
    node: "border-fuchsia-400",
    text: "text-fuchsia-300",
    button: "border-fuchsia-400/60 text-fuchsia-100 hover:bg-fuchsia-500/15",
  },
  rose: {
    card: "border-rose-500/35 bg-rose-950/15",
    badge: "border-rose-500/50 text-rose-200",
    node: "border-rose-400",
    text: "text-rose-300",
    button: "border-rose-400/60 text-rose-100 hover:bg-rose-500/15",
  },
  gold: {
    card: "border-yellow-500/45 bg-yellow-950/20",
    badge: "border-yellow-500/55 text-yellow-200",
    node: "border-yellow-400",
    text: "text-yellow-300",
    button: "border-yellow-400/60 text-yellow-100 hover:bg-yellow-500/15",
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
  StatusIcon: LucideIcon;
  /** Clave de sprite del juego (naves: ship_*, jefes: boss_*). Sin clave, se usa el icono. */
  spriteKey?: string;
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
    StatusIcon: CheckCircle2,
    spriteKey: "ship_falcon",
    sector: "Sector 01 · Órbita Nova (único sector desbloqueado)",
    playSectorId: "nova",
    features: [
      { Icon: Flame, text: "Ciclo de 20 minutos con 10 hordas (2 minutos por horda) y Jefe Leviatán al final." },
      { Icon: Cpu, text: "Puente de Mando 2187, Hangar 1-10 con módulos de especialización." },
      { Icon: Shield, text: "Mercado P2P, Alianzas, guerras de clanes y auxilio Boss Help." },
      { Icon: Sparkles, text: "Membresía VIP: +35% de drops, +20% de créditos y chat dorado." },
      { Icon: CheckCircle2, text: "Misiones diarias y semanales, y Pase de Temporada." },
    ],
  },
  {
    number: 2,
    title: "CINTURÓN DE FUEGO & COLOSO",
    status: "EN DESARROLLO",
    tone: "amber",
    StatusIcon: Cpu,
    spriteKey: "boss_colossus",
    sector: "Sector 02 · Cinturón de Ceniza",
    features: [
      { Icon: Flame, text: "Lluvia de meteoritos y asteroides destructibles como cobertura." },
      { Icon: Shield, text: "Jefe Coloso Blindado, con escudos pesados y metralla de fragmentación." },
      { Icon: Cpu, text: "Consumibles manuales: nanorreparación de emergencia y pulso EMP." },
      { Icon: Coins, text: "Rachas de despegue diario con multiplicadores de recursos." },
    ],
  },
  {
    number: 3,
    title: "EXPANSIÓN DE FLOTA & COOPERATIVO",
    status: "PLANIFICADO",
    tone: "violet",
    StatusIcon: Lock,
    spriteKey: "ship_bastion",
    features: [
      { Icon: Shield, text: 'Naves nuevas "Viper" y "Aegis", desbloqueables con méritos en el Cinturón de Ceniza.' },
      { Icon: Coins, text: "Torneo semanal de guerras de alianzas con pozo de recursos." },
      { Icon: Sparkles, text: "Radar de alerta en el Hub cuando un aliado pide auxilio." },
    ],
  },
  {
    number: 4,
    title: "EL ABISMO ALIENÍGENA & DRONES",
    status: "PLANIFICADO",
    tone: "emerald",
    StatusIcon: Lock,
    spriteKey: "ship_spectre",
    sector: "Sector 03 · Sector Abisal",
    features: [
      { Icon: Flame, text: "Esporas corrosivas que reducen la velocidad y drenan escudos; arrecifes alienígenas." },
      { Icon: Shield, text: "Naves parasitarias en enjambres y bombarderos de ácido teledirigido." },
      { Icon: Cpu, text: "Drones que orbitan la nave: recolector magnético, dron médico y cobertura láser." },
      { Icon: Sparkles, text: "Títulos militares de honor visibles en el chat." },
    ],
  },
  {
    number: 5,
    title: "LA FORJA ESTELAR & CRAFTEO",
    status: "VISIÓN",
    tone: "blue",
    StatusIcon: Sparkles,
    spriteKey: "ship_chimera",
    features: [
      { Icon: Cpu, text: "Desmantelamiento y reciclaje de armas duplicadas." },
      { Icon: Flame, text: "Núcleos elementales: daño criogénico, plasma ardiente y arcos voltaicos." },
      { Icon: Coins, text: "Subastas P2P con puja de planos exóticos en Obsidiana." },
    ],
  },
  {
    number: 6,
    title: "NÚCLEO OMEGA & JEFE NÉMESIS",
    status: "VISIÓN",
    tone: "fuchsia",
    StatusIcon: Sparkles,
    spriteKey: "boss_nemesis",
    sector: "Sector 04 · Núcleo Omega (fortaleza hostil)",
    features: [
      { Icon: Shield, text: "Pilones blindados y barreras láser móviles que barren la arena." },
      { Icon: Flame, text: "Jefe final Némesis: IA extrema con 3 transformaciones de fase." },
      { Icon: Coins, text: "Modo Heroico con dificultad extrema y botín multiplicado." },
      { Icon: Sparkles, text: "Condecoraciones de campaña completa." },
    ],
  },
  {
    number: 7,
    title: "MODO INFINITO & PRESTIGIO",
    status: "VISIÓN",
    tone: "rose",
    StatusIcon: Sparkles,
    spriteKey: "boss_leviathan",
    sector: "Sector Infinito (Endless Void)",
    features: [
      { Icon: Flame, text: "Sin límite de 20 minutos y dificultad creciente con jefes rotativos." },
      { Icon: Sparkles, text: "Prestigio militar: reinicio del hangar a cambio de auras cosméticas exclusivas." },
      { Icon: Shield, text: "Raids de alianza semanales (World Boss) con daño acumulado conjunto." },
    ],
  },
  {
    number: 8,
    title: "POLÍGONO WEB3 & TOKEN OBSIDIANA",
    status: "TOKEN & WEB3",
    tone: "gold",
    StatusIcon: Sparkles,
    sector: "Meta suprema",
    features: [
      { Icon: Coins, text: "Contrato inteligente del token OBS en la red Polygon, con bajas comisiones." },
      { Icon: Shield, text: "Billetera no custodial (MetaMask o WalletConnect) vinculada al perfil." },
      { Icon: Coins, text: "Retiro de Obsidiana a Polygon para canjear por USDT o dinero real en DEX y P2P." },
      { Icon: Sparkles, text: "Staking de OBS con rendimiento pasivo y cosméticos únicos." },
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
    <>
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[89] overflow-hidden bg-[#070814]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_75%_5%,#8a2be21c,transparent_38%),radial-gradient(ellipse_at_12%_82%,#00f0ff12,transparent_32%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.1] [background-image:linear-gradient(#00f0ff_1px,transparent_1px),linear-gradient(90deg,#00f0ff_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      <MenuAttractBackdrop />
    </div>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="roadmap-river-title"
      className="fixed inset-0 z-[90] overflow-y-auto text-white"
    >
      <style>{`
        @keyframes roadmap-float { 0%, 100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-12px) rotate(2deg); } }
        @keyframes roadmap-sway { 0%, 100% { transform: translateX(0) scale(1); } 50% { transform: translateX(8px) scale(1.04); } }
        @keyframes roadmap-pulse { 0%, 100% { transform: scale(1); opacity: 0.3; } 50% { transform: scale(1.1); opacity: 0.7; } }
        .roadmap-ship { animation: roadmap-float 4s ease-in-out infinite; }
        .roadmap-boss { animation: roadmap-sway 5s ease-in-out infinite; }
        .roadmap-ring { animation: roadmap-pulse 3s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .roadmap-ship, .roadmap-boss, .roadmap-ring { animation: none; }
        }
      `}</style>
      <div className="mx-auto w-full max-w-4xl space-y-6 p-4 font-sans sm:p-6">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-widest text-cyan-300/80">Hoja de ruta</p>
            <h2 id="roadmap-river-title" className="text-lg font-bold uppercase tracking-wide sm:text-xl">
              El Río Cósmico
            </h2>
            <p className="text-sm text-white/60">
              Ocho fases de expansión. Solo la Fase 1 está operativa hoy.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar roadmap"
            className="grid size-9 shrink-0 place-items-center border border-white/15 text-white/80 hover:bg-white/10"
          >
            <X className="size-4" />
          </button>
        </header>

        <ol className="relative">
          <span
            aria-hidden="true"
            className="absolute bottom-0 left-4 top-0 w-0 border-l border-dashed border-white/20 md:left-1/2"
          />
          {PHASES.map((phase, index) => {
            const tone = TONES[phase.tone];
            const isLeft = index % 2 === 0;
            const sectorId = phase.playSectorId;
            const sprite = phase.spriteKey ? spriteUrl(phase.spriteKey, 4) : null;
            const animClass = phase.spriteKey?.startsWith("boss_") ? "roadmap-boss" : "roadmap-ship";
            const delay = `${index * 0.6}s`;
            return (
              <li key={phase.number} className={`relative pb-8 last:pb-0 md:flex md:items-start md:gap-8 ${isLeft ? "" : "md:flex-row-reverse"}`}>
                <span
                  aria-hidden="true"
                  className={`absolute left-4 top-6 size-3 -translate-x-1/2 rounded-full border-2 bg-[#070814] md:left-1/2 ${tone.node}`}
                />
                <article className={`ml-10 space-y-2 border p-4 md:ml-0 md:min-w-0 md:flex-1 ${tone.card}`}>
                  <span
                    className={`inline-flex items-center border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${tone.badge}`}
                  >
                    Fase {phase.number} · {phase.status}
                  </span>
                  <h3 className="text-sm font-bold uppercase leading-snug tracking-wide sm:text-base">
                    {phase.title}
                  </h3>
                  {phase.sector ? (
                    <p className={`text-xs font-semibold ${tone.text}`}>{phase.sector}</p>
                  ) : null}

                  <ul className="space-y-1.5 pt-1">
                    {phase.features.map((feature) => (
                      <li key={feature.text} className="flex gap-2 text-sm leading-relaxed text-white/75">
                        <feature.Icon className={`mt-0.5 size-3.5 shrink-0 ${tone.text}`} />
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
                      className={`mt-2 border px-3 py-2 text-xs font-bold uppercase tracking-wide ${tone.button}`}
                    >
                      Jugar sector 01
                    </button>
                  ) : null}
                </article>

                <div aria-hidden="true" className="hidden md:flex md:flex-1 md:justify-center md:pt-4">
                  <div className="relative grid size-44 place-items-center">
                    <span
                      className={`roadmap-ring absolute inset-0 rounded-full border ${tone.node}`}
                      style={{ animationDelay: delay }}
                    />
                    {sprite ? (
                      <img
                        src={sprite}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        className={`relative size-40 object-contain ${animClass}`}
                        style={{ imageRendering: "pixelated", animationDelay: delay }}
                      />
                    ) : (
                      <phase.StatusIcon
                        className={`roadmap-ring relative size-16 ${tone.text}`}
                        style={{ animationDelay: delay }}
                      />
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <footer className="border-t border-white/10 pt-4 text-xs text-white/45">
          Las fases en visión o planificadas son objetivos de diseño sin fecha confirmada.
        </footer>
      </div>
    </div>
    </>
  );
}

export default RoadmapRiver;