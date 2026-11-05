import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Award,
  ChevronLeft,
  ChevronRight,
  CirclePause,
  Crosshair,
  Heart,
  LockKeyhole,
  Pause,
  Play,
  Radio,
  Rocket,
  Shield,
  Skull,
  Sparkles,
  Volume2,
  VolumeX,
  Wrench,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Audio } from "@/game/audio";
import { SHIPS } from "@/game/data/ships";
import { STAGES } from "@/game/data/stages";
import { Engine } from "@/game/engine";
import { Settings } from "@/game/settings";
import {
  ProgressStore,
  applyRun as recordRun,
  buyUpgrade,
  defaultProgress,
  type Progress,
  type RunSummary,
} from "@/game/meta/progress";
import { UPGRADES, hangarBonuses as calcHangarBonuses, upgradeCost } from "@/game/meta/upgrades";
import type { HudState, RunResult, UpgradeChoice } from "@/game/types";

type Screen = "MENU" | "SELECT" | "HANGAR" | "PLAYING" | "GAMEOVER";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SPACE SURVIVORS - Retro Cyberpunk Roguelite" },
      {
        name: "description",
        content:
          "Pilota una nave de combate, sobrevive a oleadas alienígenas y mejora tu flota en SPACE SURVIVORS.",
      },
    ],
  }),
  component: Index,
});

const WEAPON_NAMES: Record<string, string> = {
  laser: "LÁSER DE PULSO",
  missile: "MISILES GUIADOS",
  plasma: "CAÑÓN DE PLASMA",
  field: "CAMPO ELÉCTRICO",
};

function Index() {
  const [screen, setScreen] = useState<Screen>("MENU");
  const [progress, setProgress] = useState<Progress>(() => defaultProgress());
  const [selectedShipId, setSelectedShipId] = useState("falcon");
  const [selectedStageId, setSelectedStageId] = useState("nova");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [hud, setHud] = useState<HudState | null>(null);
  const [choices, setChoices] = useState<UpgradeChoice[]>([]);
  const [rerolls, setRerolls] = useState(0);
  const [paused, setPaused] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [runCredits, setRunCredits] = useState(0);
  const [notice, setNotice] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const shipCarouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncProgress = () => {
      const current = ProgressStore.get();
      setProgress(current);
      setSelectedShipId(current.selectedShip);
      setSelectedStageId(current.selectedStage);
    };
    syncProgress();
    const unsubscribe = ProgressStore.subscribe(syncProgress);
    setAudioEnabled(!Settings.get().muted);
    return unsubscribe;
  }, []);

  const saveProgress = (next: Progress) => {
    ProgressStore.set(next);
    setProgress(next);
  };

  const selectedShip = SHIPS.find((ship) => ship.id === selectedShipId) ?? SHIPS[0]!;
  const selectedStage = STAGES.find((stage) => stage.id === selectedStageId) ?? STAGES[0]!;
  const latestRun: RunSummary | undefined = progress.history[0];

  const scrollShipCarousel = (direction: -1 | 1) => {
    shipCarouselRef.current?.scrollBy({ left: direction * 280, behavior: "smooth" });
  };

  useEffect(() => {
    if (screen !== "PLAYING") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine({
      canvas,
      ship: selectedShip,
      stage: selectedStage,
      hangar: calcHangarBonuses(progress.upgrades),
      durationSec: 900,
      callbacks: {
        onLevelUp: (nextChoices, nextRerolls) => {
          setChoices(nextChoices);
          setRerolls(nextRerolls);
        },
        onEnd: (result) => {
          const outcome = recordRun(ProgressStore.get(), result);
          saveProgress(outcome.progress);
          setRunResult(result);
          setRunCredits(outcome.credits);
          setChoices([]);
          setPaused(false);
          setScreen("GAMEOVER");
        },
        onPauseChange: setPaused,
      },
    });
    engineRef.current = engine;
    engine.start();
    const hudTimer = window.setInterval(() => setHud(engine.getHud()), 100);

    return () => {
      window.clearInterval(hudTimer);
      engine.stop();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [screen, selectedShip, selectedStage, progress.upgrades]);

  const chooseShip = (id: string) => {
    if (!progress.ships.includes(id)) return;
    setSelectedShipId(id);
    saveProgress({ ...progress, selectedShip: id });
  };

  const chooseStage = (id: string) => {
    if (!progress.stages.includes(id)) return;
    setSelectedStageId(id);
    saveProgress({ ...progress, selectedStage: id });
  };

  const startMission = () => {
    Audio.init();
    setHud(null);
    setChoices([]);
    setPaused(false);
    setRunResult(null);
    setScreen("PLAYING");
  };

  const toggleAudio = () => {
    const enabled = !audioEnabled;
    Settings.set("muted", !enabled);
    setAudioEnabled(enabled);
    Audio.init();
  };

  const purchaseUpgrade = (id: string) => {
    const outcome = buyUpgrade(progress, id);
    if (!outcome.ok) {
      setNotice(outcome.reason);
      window.setTimeout(() => setNotice(""), 1800);
      return;
    }
    saveProgress(outcome.progress);
    setNotice("MEJORA INSTALADA");
    window.setTimeout(() => setNotice(""), 1800);
  };

  const returnToMenu = () => {
    engineRef.current?.stop();
    setPaused(false);
    setChoices([]);
    setScreen("MENU");
  };

  const chooseUpgrade = (index: number) => {
    engineRef.current?.applyChoice(index);
    setChoices([]);
  };

  const rerollChoices = () => engineRef.current?.reroll();

  if (screen === "PLAYING") {
    const healthPercent = hud ? Math.max(0, (hud.hp / Math.max(1, hud.maxHp)) * 100) : 100;
    const shieldPercent = hud ? Math.max(0, (hud.shield / Math.max(1, hud.shieldMax)) * 100) : 0;
    const xpPercent = hud ? Math.min(100, (hud.xp / Math.max(1, hud.xpToNext)) * 100) : 0;
    const remaining = hud ? Math.max(0, Math.ceil(hud.duration - hud.time)) : 900;

    return (
      <main className="fixed inset-0 overflow-hidden bg-[#070814] font-mono text-white">
        <canvas ref={canvasRef} className="w-full h-full block" />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-[#070814]/95 via-[#070814]/65 to-transparent px-4 pb-10 pt-4 sm:px-7">
          <div className="mx-auto flex max-w-[1500px] items-start justify-between gap-4">
            <section className="w-full max-w-sm">
              <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.18em]">
                <span className="flex items-center gap-2 text-cyan-100">
                  <Heart className="size-4 text-[#ff0055]" /> INTEGRIDAD
                </span>
                <span>{hud ? `${Math.ceil(hud.hp)} / ${Math.ceil(hud.maxHp)}` : "-- / --"}</span>
              </div>
              <Meter value={healthPercent} color="bg-[#ff0055]" />
              {hud?.shieldMax ? (
                <div className="mt-2">
                  <div className="mb-1 flex justify-between text-[10px] uppercase tracking-widest text-cyan-100/70">
                    <span className="flex items-center gap-1">
                      <Shield className="size-3" /> ESCUDO
                    </span>
                    <span>
                      {Math.ceil(hud.shield)} / {Math.ceil(hud.shieldMax)}
                    </span>
                  </div>
                  <Meter value={shieldPercent} color="bg-[#00f0ff]" />
                </div>
              ) : null}
              <div className="mt-3 flex items-center gap-2 text-xs uppercase tracking-widest text-cyan-100">
                <Zap className="size-4 text-[#ffd700]" /> NIVEL {hud?.level ?? 1}
              </div>
              <div className="mt-1.5">
                <Meter value={xpPercent} color="bg-[#8a2be2]" />
              </div>
            </section>

            <div className="flex shrink-0 items-start gap-3 sm:gap-6">
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-100/65">
                  TIEMPO RESTANTE
                </p>
                <p className="text-2xl font-black tabular-nums text-white drop-shadow-[0_0_12px_#00f0ff99] sm:text-4xl">
                  {formatTime(remaining)}
                </p>
                <p className="mt-1 flex items-center justify-end gap-1 text-[10px] uppercase tracking-widest text-[#ff7fa6]">
                  <Skull className="size-3" /> {hud?.kills ?? 0} BAJAS
                </p>
              </div>
              <Button
                aria-label="Pausar misión"
                title="Pausar misión"
                variant="outline"
                size="icon"
                className="pointer-events-auto border-cyan-300/50 bg-[#070814]/80 text-cyan-100 hover:bg-cyan-400/15 hover:text-white"
                onClick={() => engineRef.current?.pause()}
              >
                <Pause />
              </Button>
            </div>
          </div>
          {hud?.boss ? (
            <div className="mx-auto mt-5 max-w-3xl">
              <div className="mb-1 flex justify-between text-[10px] uppercase tracking-[0.2em] text-[#ff9ab9]">
                <span>OBJETIVO PRIORITARIO · {hud.boss.name}</span>
                <span>{Math.ceil(hud.boss.hp)} PS</span>
              </div>
              <Meter value={(hud.boss.hp / hud.boss.maxHp) * 100} color="bg-[#ff0055]" />
            </div>
          ) : null}
        </div>

        {hud?.banner ? (
          <div className="pointer-events-none absolute left-1/2 top-1/3 z-10 -translate-x-1/2 text-center">
            <p className="text-2xl font-black uppercase tracking-[0.16em] text-white drop-shadow-[0_0_18px_#00f0ff] sm:text-4xl">
              {hud.banner.title}
            </p>
            <p className="mt-2 text-xs uppercase tracking-[0.18em] text-cyan-100">
              {hud.banner.sub}
            </p>
          </div>
        ) : null}

        {choices.length > 0 ? (
          <div className="absolute inset-0 z-20 grid place-items-center overflow-y-auto bg-[#070814]/85 px-4 py-8 backdrop-blur-md">
            <section className="w-full max-w-5xl border border-cyan-400/40 bg-[#0b0d1d]/95 p-5 shadow-[0_0_55px_#00f0ff22] sm:p-8">
              <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-cyan-300">
                    <Sparkles className="size-4" /> SINCRONIZACIÓN COMPLETA
                  </p>
                  <h1 className="text-3xl font-black uppercase tracking-widest text-white sm:text-4xl">
                    Subida de nivel
                  </h1>
                  <p className="mt-2 text-xs uppercase tracking-widest text-white/55">
                    Elige una mejora para tu nave
                  </p>
                </div>
                {rerolls > 0 ? (
                  <Button
                    onClick={rerollChoices}
                    variant="outline"
                    className="border-[#8a2be2]/70 bg-[#8a2be2]/10 font-bold uppercase tracking-widest text-white hover:bg-[#8a2be2]/25"
                  >
                    <AudioLines /> Recalibrar · {rerolls}
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {choices.map((choice, index) => (
                  <button
                    key={`${choice.id}-${choice.kind}-${index}`}
                    type="button"
                    onClick={() => chooseUpgrade(index)}
                    className="group flex min-h-52 flex-col border border-white/10 bg-white/[0.035] p-5 text-left transition hover:border-cyan-300/70 hover:bg-cyan-300/[0.07] hover:shadow-[0_0_28px_#00f0ff1c]"
                  >
                    <div className="mb-5 flex w-full items-center justify-between">
                      <span className="grid size-11 place-items-center border border-cyan-300/30 bg-cyan-300/10 text-cyan-200">
                        <Zap className="size-5" />
                      </span>
                      <Badge
                        variant="outline"
                        className="rounded-none border-white/15 text-[9px] tracking-widest text-white/65"
                      >
                        {choice.tag}
                      </Badge>
                    </div>
                    <span className="text-sm font-bold uppercase tracking-wider text-white">
                      {choice.name}
                    </span>
                    <span className="mt-2 text-xs leading-5 text-white/55">{choice.desc}</span>
                    <span className="mt-auto pt-5 text-[10px] uppercase tracking-[0.2em] text-cyan-300">
                      Seleccionar mejora <ArrowRight className="ml-1 inline size-3" />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {paused ? (
          <Overlay
            title="Misión en pausa"
            eyebrow="CONTROL DE VUELO"
            icon={<CirclePause className="size-5" />}
          >
            <p className="mb-7 text-center text-xs uppercase tracking-[0.16em] text-white/55">
              La flota enemiga espera tu siguiente movimiento.
            </p>
            <Button
              className="h-12 w-full rounded-none bg-[#00f0ff] font-black uppercase tracking-[0.16em] text-[#070814] hover:bg-cyan-200"
              onClick={() => engineRef.current?.resume()}
            >
              <Play /> Reanudar misión
            </Button>
            <Button
              variant="outline"
              className="mt-3 h-12 w-full rounded-none border-white/20 bg-transparent font-bold uppercase tracking-[0.14em] text-white hover:bg-white/10"
              onClick={returnToMenu}
            >
              <ArrowLeft /> Salir al menú
            </Button>
          </Overlay>
        ) : null}
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070814] font-mono text-white selection:bg-[#00f0ff]/30">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_75%_5%,#8a2be21c,transparent_38%),radial-gradient(ellipse_at_12%_82%,#00f0ff12,transparent_32%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.1] [background-image:linear-gradient(#00f0ff_1px,transparent_1px),linear-gradient(90deg,#00f0ff_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-5 pb-8 pt-5 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between border-b border-cyan-500/20 pb-4">
          <button
            type="button"
            className="flex items-center gap-3 text-left"
            onClick={() => setScreen("MENU")}
          >
            <span className="grid size-10 place-items-center border border-cyan-400/40 bg-cyan-300/10 text-cyan-200 shadow-[0_0_20px_#00f0ff18]">
              <Crosshair className="size-5" />
            </span>
            <span>
              <span className="block text-xs font-black tracking-[0.2em] text-white">
                SPACE SURVIVORS
              </span>
              <span className="mt-1 block text-[9px] uppercase tracking-[0.24em] text-cyan-100/45">
                Defensa de frontera · 2187
              </span>
            </span>
          </button>
          <div className="flex items-center gap-2 sm:gap-5">
            <span className="hidden items-center gap-2 text-xs uppercase tracking-widest text-[#ffd700] sm:flex">
              <span className="size-2 bg-[#ffd700] shadow-[0_0_10px_#ffd700]" />{" "}
              {progress.credits.toLocaleString()} CR
            </span>
            <Button
              onClick={toggleAudio}
              variant="outline"
              size="icon"
              title={audioEnabled ? "Desactivar audio" : "Activar audio"}
              aria-label={audioEnabled ? "Desactivar audio" : "Activar audio"}
              className="border-white/15 bg-transparent text-cyan-100 hover:bg-cyan-400/10"
            >
              {audioEnabled ? <Volume2 /> : <VolumeX />}
            </Button>
          </div>
        </header>

        {screen === "MENU" ? (
          <section className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
            <div className="relative">
              <div className="mb-6 flex items-center gap-3 text-[10px] uppercase tracking-[0.32em] text-cyan-300">
                <span className="h-px w-9 bg-cyan-400" /> ALERTA DE SECTOR · NOVA-01
              </div>
              <h1 className="max-w-3xl text-[clamp(3rem,9vw,7.5rem)] font-black uppercase leading-[0.82] tracking-[0.04em] text-white [text-shadow:0_0_34px_#00f0ff45]">
                SPACE
                <br />
                <span className="text-[#00f0ff]">SURVIVORS</span>
              </h1>
              <div className="mt-7 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-[#ff6b95]">
                <span className="h-px w-12 bg-[#ff0055]" /> La última línea de defensa
              </div>
              <p className="mt-5 max-w-lg text-sm leading-7 text-white/55">
                Quince minutos contra una flota que no deja de crecer. Elige tu nave, rompe el cerco
                y vuelve con recursos para el siguiente despliegue.
              </p>
              <div className="mt-9 flex max-w-md flex-col gap-3 sm:flex-row">
                <Button
                  onClick={() => setScreen("SELECT")}
                  className="h-12 flex-1 rounded-none border border-cyan-200 bg-[#00f0ff] text-sm font-black uppercase tracking-[0.18em] text-[#070814] shadow-[0_0_28px_#00f0ff45] hover:bg-cyan-200"
                >
                  <Rocket /> Desplegar
                </Button>
                <Button
                  onClick={() => setScreen("HANGAR")}
                  variant="outline"
                  className="h-12 flex-1 rounded-none border-[#8a2be2]/60 bg-[#8a2be2]/10 text-sm font-bold uppercase tracking-[0.18em] text-white hover:bg-[#8a2be2]/25"
                >
                  <Wrench /> Hangar
                </Button>
              </div>
              <button
                onClick={toggleAudio}
                type="button"
                className="mt-5 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/45 transition hover:text-cyan-200"
              >
                {audioEnabled ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
                Audio {audioEnabled ? "ON" : "OFF"}
              </button>
            </div>

            <div className="relative mx-auto w-full max-w-xl">
              <div className="absolute -inset-8 bg-[radial-gradient(ellipse_at_center,#00f0ff13,transparent_68%)]" />
              <div className="relative overflow-hidden border border-cyan-500/25 bg-[#0a0c1a]/85 shadow-[0_0_60px_#00f0ff0d]">
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-3 text-[9px] uppercase tracking-[0.2em] text-white/45">
                  <span className="flex items-center gap-2">
                    <Radio className="size-3 text-[#ff0055]" /> ENLACE DE COMBATE
                  </span>
                  <span>CANAL 07</span>
                </div>
                <div className="relative grid min-h-[260px] place-items-center overflow-hidden sm:min-h-[330px]">
                  <div className="absolute inset-0 opacity-60 [background-image:radial-gradient(#9befff_0.7px,transparent_0.7px)] [background-size:24px_24px]" />
                  <div className="absolute left-[18%] top-[20%] size-2 rounded-full bg-white shadow-[0_0_12px_4px_#00f0ff]" />
                  <div className="absolute right-[20%] top-[32%] size-1.5 rounded-full bg-[#ff0055] shadow-[0_0_12px_4px_#ff0055]" />
                  <div className="absolute bottom-[18%] left-[34%] size-1 rounded-full bg-white shadow-[0_0_10px_3px_#8a2be2]" />
                  <div className="absolute left-1/2 top-1/2 size-48 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-400/15 sm:size-64" />
                  <div className="absolute left-1/2 top-1/2 size-36 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-400/20 sm:size-48" />
                  <div className="absolute left-1/2 top-1/2 size-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,#00f0ff35,transparent_70%)] sm:size-36" />
                  <div className="relative grid size-24 place-items-center border border-cyan-300/50 bg-[#080b18]/80 text-cyan-200 shadow-[0_0_45px_#00f0ff35] sm:size-32">
                    <Rocket className="size-12 sm:size-16" />
                  </div>
                  <div className="absolute bottom-4 left-4 text-[9px] uppercase leading-5 tracking-[0.16em] text-cyan-100/55">
                    NAVE ACTIVA
                    <br />
                    <span className="text-white">{selectedShip.name}</span>
                  </div>
                  <div className="absolute bottom-4 right-4 text-right text-[9px] uppercase leading-5 tracking-[0.16em] text-cyan-100/55">
                    SECTOR
                    <br />
                    <span className="text-white">{selectedStage.name}</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 border-t border-white/10">
                  <MenuStat
                    label="Misiones"
                    value={progress.stats.runs.toString().padStart(2, "0")}
                  />
                  <MenuStat label="Bajas" value={progress.stats.kills.toLocaleString()} />
                  <MenuStat
                    label="Naves"
                    value={progress.ships.length.toString().padStart(2, "0")}
                  />
                </div>
              </div>
              {latestRun ? (
                <p className="mt-3 text-right text-[9px] uppercase tracking-[0.15em] text-white/35">
                  Última misión: {latestRun.victory ? "Victoria" : "Retirada"} · {latestRun.kills}{" "}
                  bajas
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        {screen === "SELECT" ? (
          <section className="flex-1 py-8 sm:py-12">
            <SectionHeading
              eyebrow="PREPARACIÓN DE COMBATE"
              title="Configura el despliegue"
              onBack={() => setScreen("MENU")}
            />
            <div className="mt-9 grid gap-10 xl:grid-cols-[1.1fr_0.9fr]">
              <div>
                <div className="mb-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">
                      01 / HANGAR DE VUELO
                    </p>
                    <h2 className="mt-2 text-lg font-bold uppercase tracking-widest">
                      Selecciona tu nave
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="hidden text-[10px] uppercase tracking-widest text-white/35 sm:block">
                      {progress.ships.length} / {SHIPS.length}
                    </span>
                    <Button
                      type="button"
                      onClick={() => scrollShipCarousel(-1)}
                      variant="outline"
                      size="icon"
                      aria-label="Naves anteriores"
                      className="size-8 rounded-none border-white/15 bg-transparent text-cyan-100 hover:bg-cyan-400/10"
                    >
                      <ChevronLeft />
                    </Button>
                    <Button
                      type="button"
                      onClick={() => scrollShipCarousel(1)}
                      variant="outline"
                      size="icon"
                      aria-label="Naves siguientes"
                      className="size-8 rounded-none border-white/15 bg-transparent text-cyan-100 hover:bg-cyan-400/10"
                    >
                      <ChevronRight />
                    </Button>
                  </div>
                </div>
                <div
                  ref={shipCarouselRef}
                  className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2"
                >
                  {SHIPS.map((ship) => {
                    const owned = progress.ships.includes(ship.id);
                    const selected = selectedShipId === ship.id;
                    return (
                      <button
                        key={ship.id}
                        type="button"
                        disabled={!owned}
                        onClick={() => chooseShip(ship.id)}
                        className={`relative min-h-56 min-w-[min(100%,270px)] snap-start border p-4 text-left transition sm:min-w-[280px] ${selected ? "border-cyan-300/70 bg-cyan-300/[0.075] shadow-[0_0_28px_#00f0ff14]" : "border-white/10 bg-white/[0.025] hover:border-white/25"} ${!owned ? "cursor-not-allowed opacity-45" : ""}`}
                      >
                        <div className="flex items-start justify-between">
                          <span
                            className={`grid size-11 place-items-center border ${selected ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-200" : "border-white/10 bg-white/5 text-white/55"}`}
                          >
                            <Rocket className="size-5" />
                          </span>
                          {owned ? (
                            <Badge
                              variant="outline"
                              className={`rounded-none text-[9px] tracking-widest ${selected ? "border-cyan-300/50 text-cyan-200" : "border-white/15 text-white/45"}`}
                            >
                              {selected ? "ACTIVA" : ship.role}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="rounded-none border-[#ff0055]/35 text-[9px] text-[#ff8aa9]"
                            >
                              <LockKeyhole className="mr-1 size-3" /> {ship.cost} CR
                            </Badge>
                          )}
                        </div>
                        <h3 className="mt-4 text-sm font-black uppercase tracking-[0.16em]">
                          {ship.name}
                        </h3>
                        <p className="mt-1 text-[10px] uppercase tracking-wider text-white/45">
                          {ship.role}
                        </p>
                        <div className="mt-4 grid grid-cols-3 gap-2 border-y border-white/10 py-3 text-[9px] uppercase tracking-wider text-white/45">
                          <span>
                            HP <b className="ml-1 text-white">{ship.hp}</b>
                          </span>
                          <span>
                            VEL <b className="ml-1 text-white">{ship.speed}</b>
                          </span>
                          <span>
                            CRIT <b className="ml-1 text-white">{Math.round(ship.crit * 100)}%</b>
                          </span>
                        </div>
                        <p className="mt-3 text-[9px] uppercase tracking-wider text-cyan-200/75">
                          {WEAPON_NAMES[ship.startWeapon] ?? ship.startWeapon}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-4">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-[#ff6b95]">
                    02 / CARTOGRAFÍA
                  </p>
                  <h2 className="mt-2 text-lg font-bold uppercase tracking-widest">
                    Elige un sector
                  </h2>
                </div>
                <div className="space-y-2">
                  {STAGES.map((stage, index) => {
                    const unlocked = progress.stages.includes(stage.id);
                    const active = selectedStageId === stage.id;
                    return (
                      <button
                        key={stage.id}
                        type="button"
                        disabled={!unlocked}
                        onClick={() => chooseStage(stage.id)}
                        className={`flex w-full items-center gap-4 border p-4 text-left transition ${active ? "border-[#ff0055]/60 bg-[#ff0055]/[0.07]" : "border-white/10 bg-white/[0.025] hover:border-white/25"} ${!unlocked ? "cursor-not-allowed opacity-40" : ""}`}
                      >
                        <span
                          className={`grid size-10 shrink-0 place-items-center border text-xs font-bold ${active ? "border-[#ff0055]/40 bg-[#ff0055]/10 text-[#ff789b]" : "border-white/10 text-white/45"}`}
                        >
                          {unlocked ? `0${index + 1}` : <LockKeyhole className="size-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-bold uppercase tracking-wider">
                            {stage.name}
                          </span>
                          <span className="mt-1 block text-[9px] uppercase tracking-wider text-white/40">
                            {stage.hazardName}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-[9px] uppercase tracking-wider text-white/40">
                            DIFICULTAD
                          </span>
                          <span className="mt-1 block text-xs font-bold text-[#ffd700]">
                            {difficultyLabel(stage.difficulty)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 border-l-2 border-cyan-400/50 bg-cyan-300/[0.04] px-4 py-3 text-xs leading-5 text-white/50">
                  {selectedStage.desc}
                  <span className="mt-2 block uppercase tracking-wider text-cyan-200/75">
                    Recompensa de sector ×{selectedStage.rewardMult.toFixed(2)}
                  </span>
                </div>
                <Button
                  onClick={startMission}
                  className="mt-6 h-12 w-full rounded-none bg-[#00f0ff] text-sm font-black uppercase tracking-[0.2em] text-[#070814] shadow-[0_0_25px_#00f0ff25] hover:bg-cyan-200"
                >
                  <Play /> Iniciar misión
                </Button>
                <p className="mt-3 text-center text-[9px] uppercase tracking-[0.18em] text-white/35">
                  15 MIN · PILOTAJE AUTOMÁTICO DE ARMAS
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {screen === "HANGAR" ? (
          <section className="flex-1 py-8 sm:py-12">
            <SectionHeading
              eyebrow="MANTENIMIENTO DE FLOTA"
              title="Hangar de mejoras"
              onBack={() => setScreen("MENU")}
            />
            <div className="mt-7 flex flex-wrap items-end justify-between gap-4 border-y border-cyan-500/20 py-5">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">
                  CRÉDITOS DISPONIBLES
                </p>
                <p className="mt-1 text-3xl font-black tabular-nums text-[#ffd700] drop-shadow-[0_0_12px_#ffd70030]">
                  {progress.credits.toLocaleString()}{" "}
                  <span className="text-sm tracking-widest">CR</span>
                </p>
              </div>
              <div className="text-right text-[10px] uppercase leading-5 tracking-widest text-white/45">
                <span className="text-cyan-200">NAVE ACTIVA</span>
                <br />
                {selectedShip.name}
              </div>
            </div>
            {notice ? (
              <p role="status" className="mt-4 text-xs uppercase tracking-widest text-cyan-200">
                {notice}
              </p>
            ) : null}
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {UPGRADES.map((upgrade, index) => {
                const level = progress.upgrades[upgrade.id] ?? 0;
                const maxed = level >= upgrade.max;
                const cost = upgradeCost(upgrade.id, level);
                const affordable = progress.credits >= cost;
                const Icon =
                  [Shield, Zap, Crosshair, AudioLines, Radio, Heart, Award, Sparkles][index] ??
                  Wrench;
                return (
                  <article
                    key={upgrade.id}
                    className="flex min-h-56 flex-col border border-cyan-500/20 bg-[#0b0d1c]/85 p-4 transition hover:border-cyan-400/45"
                  >
                    <div className="flex items-start justify-between">
                      <span className="grid size-10 place-items-center border border-cyan-400/25 bg-cyan-400/[0.07] text-cyan-200">
                        <Icon className="size-5" />
                      </span>
                      <span className="text-[9px] uppercase tracking-widest text-white/40">
                        NIVEL {level} / {upgrade.max}
                      </span>
                    </div>
                    <h3 className="mt-4 text-xs font-black uppercase tracking-[0.13em]">
                      {upgrade.name}
                    </h3>
                    <p className="mt-2 min-h-8 text-[10px] leading-4 text-white/45">
                      {upgrade.desc}
                    </p>
                    <div
                      className="mt-4 flex gap-1"
                      aria-label={`Nivel ${level} de ${upgrade.max}`}
                    >
                      {Array.from({ length: upgrade.max }, (_, step) => (
                        <span
                          key={step}
                          className={`h-1.5 flex-1 ${step < level ? "bg-[#00f0ff] shadow-[0_0_8px_#00f0ff55]" : "bg-white/10"}`}
                        />
                      ))}
                    </div>
                    <Button
                      disabled={maxed || !affordable}
                      onClick={() => purchaseUpgrade(upgrade.id)}
                      variant="outline"
                      className={`mt-auto h-10 w-full rounded-none text-[10px] font-bold uppercase tracking-widest ${maxed ? "border-white/10 text-white/35" : affordable ? "border-cyan-400/40 text-cyan-100 hover:bg-cyan-300/10" : "border-white/10 text-white/30"}`}
                    >
                      {maxed ? (
                        "Nivel máximo"
                      ) : (
                        <>
                          <span className="text-[#ffd700]">{cost} CR</span>
                          <span className="text-white/35">·</span> Instalar
                        </>
                      )}
                    </Button>
                  </article>
                );
              })}
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5">
              <p className="text-[10px] uppercase tracking-[0.15em] text-white/40">
                Las mejoras son permanentes y se aplican al próximo despliegue.
              </p>
              <Button
                onClick={() => setScreen("SELECT")}
                className="rounded-none bg-[#00f0ff] font-bold uppercase tracking-widest text-[#070814] hover:bg-cyan-200"
              >
                <Rocket /> Preparar nave
              </Button>
            </div>
          </section>
        ) : null}

        {screen === "GAMEOVER" && runResult ? (
          <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center py-10">
            <div className="text-center">
              <p className="mb-4 flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.3em] text-cyan-300">
                <Award className="size-4" /> INFORME DE COMBATE
              </p>
              <h1
                className={`text-4xl font-black uppercase tracking-[0.08em] sm:text-6xl ${runResult.victory ? "text-[#00f0ff] drop-shadow-[0_0_24px_#00f0ff55]" : "text-[#ff6b95] drop-shadow-[0_0_24px_#ff005533]"}`}
              >
                {runResult.victory ? "Sector asegurado" : "Nave perdida"}
              </h1>
              <p className="mt-3 text-xs uppercase tracking-[0.2em] text-white/45">
                {selectedStage.name} · {selectedShip.name}
              </p>
            </div>
            <div className="mt-9 grid grid-cols-2 border-y border-white/10 sm:grid-cols-4">
              <ResultStat icon={<Skull />} label="Bajas" value={runResult.kills.toLocaleString()} />
              <ResultStat icon={<Zap />} label="Nivel" value={runResult.level.toString()} />
              <ResultStat
                icon={<AudioLines />}
                label="Supervivencia"
                value={formatTime(runResult.time)}
              />
              <ResultStat
                icon={<Sparkles />}
                label="Evoluciones"
                value={runResult.evolutions.toString()}
              />
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border border-[#ffd700]/25 bg-[#ffd700]/[0.04] px-5 py-4">
              <span className="text-xs uppercase tracking-[0.18em] text-white/65">
                Créditos recuperados
              </span>
              <span className="text-2xl font-black tabular-nums text-[#ffd700]">
                +{runCredits.toLocaleString()} CR
              </span>
            </div>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Button
                onClick={() => setScreen("HANGAR")}
                className="h-12 rounded-none bg-[#00f0ff] px-8 font-black uppercase tracking-[0.15em] text-[#070814] hover:bg-cyan-200"
              >
                <Wrench /> Volver al hangar
              </Button>
              <Button
                variant="outline"
                onClick={() => setScreen("SELECT")}
                className="h-12 rounded-none border-white/20 bg-transparent px-8 font-bold uppercase tracking-[0.15em] text-white hover:bg-white/10"
              >
                <Rocket /> Nuevo despliegue
              </Button>
            </div>
          </section>
        ) : null}

        <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-cyan-500/15 pt-4 text-[9px] uppercase tracking-[0.18em] text-white/30">
          <span>
            SPACE SURVIVORS <span className="text-cyan-300/70">//</span> PROTOCOLO DE DEFENSA ACTIVO
          </span>
          <span>
            CRÉDITOS{" "}
            <span className="text-[#ffd700]/80">{progress.credits.toLocaleString()} CR</span>
          </span>
        </footer>
      </div>
    </main>
  );
}

function Meter({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-2 overflow-hidden border border-white/10 bg-[#151727]">
      <div
        className={`h-full ${color} transition-[width] duration-200`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function MenuStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-white/10 px-4 py-3 last:border-r-0">
      <p className="text-[8px] uppercase tracking-[0.2em] text-white/35">{label}</p>
      <p className="mt-1 text-sm font-bold tabular-nums text-cyan-100">{value}</p>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  onBack,
}: {
  eyebrow: string;
  title: string;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-[10px] uppercase tracking-[0.26em] text-cyan-300">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-black uppercase tracking-[0.06em] sm:text-4xl">
          {title}
        </h1>
      </div>
      <Button
        onClick={onBack}
        variant="outline"
        className="rounded-none border-white/15 bg-transparent text-[10px] font-bold uppercase tracking-widest text-white/65 hover:bg-white/10"
      >
        <ArrowLeft /> Volver
      </Button>
    </div>
  );
}

function ResultStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="border-r border-white/10 px-4 py-5 text-center last:border-r-0">
      <span className="mx-auto grid size-8 place-items-center text-cyan-300">{icon}</span>
      <p className="mt-2 text-[9px] uppercase tracking-[0.18em] text-white/40">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

function Overlay({
  title,
  eyebrow,
  icon,
  children,
}: {
  title: string;
  eyebrow: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-[#070814]/75 p-4 backdrop-blur-sm">
      <section className="w-full max-w-sm border border-cyan-400/35 bg-[#0b0d1d] p-6 shadow-[0_0_50px_#00f0ff20] sm:p-8">
        <p className="mb-4 flex items-center justify-center gap-2 text-[9px] uppercase tracking-[0.25em] text-cyan-300">
          {icon}
          {eyebrow}
        </p>
        <h2 className="mb-4 text-center text-2xl font-black uppercase tracking-[0.08em]">
          {title}
        </h2>
        {children}
      </section>
    </div>
  );
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const remainder = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function difficultyLabel(difficulty: number) {
  return `${"◆".repeat(Math.min(5, Math.max(1, Math.round(difficulty * 2))))}${"◇".repeat(Math.max(0, 5 - Math.round(difficulty * 2)))}`;
}
