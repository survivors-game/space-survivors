import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Award,
  ChevronLeft,
  ChevronRight,
  Check,
  CirclePause,
  Crosshair,
  Flame,
  Heart,
  LockKeyhole,
  Pause,
  Play,
  Radio,
  Rocket,
  Shield,
  Skull,
  Sparkles,
  Target,
  Volume2,
  VolumeX,
  Wallet,
  Wrench,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HangarSidebar, type HangarTab } from "@/components/hangar/HangarSidebar";
import { MarketSection } from "@/components/hangar/MarketSection";
import { Audio } from "@/game/audio";
import { BOSSES, bossById } from "@/game/data/bosses";
import { WORLD1_ID } from "@/game/timeline";
import { ENEMIES } from "@/game/data/enemies";
import { PASSIVES, passiveById } from "@/game/data/passives";
import { SHIPS, shipById } from "@/game/data/ships";
import { STAGES, stageById } from "@/game/data/stages";
import { WEAPONS } from "@/game/data/weapons";
import { Engine } from "@/game/engine";
import { Input } from "@/game/input";
import { Settings } from "@/game/settings";
import { spriteUrl } from "@/game/sprites";
import { Hotbar } from "@/components/game/Hotbar";
import { CombatStatsOverlay } from "@/components/game/CombatStatsOverlay";
import { WeaponHotbar } from "@/components/game/WeaponHotbar";
import { MenuAttractBackdrop } from "@/components/game/MenuAttractBackdrop";
import { MenuHeroShip } from "@/components/game/MenuHeroShip";
import { MISSIONS } from "@/game/meta/missions";
import { connectAndVerifyMetaMaskSolana, disconnectMetaMaskSolana, getAuthenticatedSolanaWallet } from "@/lib/solana-wallet";
import {
  ProgressStore,
  applyRun as recordRun,
  buyUpgrade,
  claimMission,
  defaultProgress,
  missionValue,
  type Progress,
  type RunSummary,
} from "@/game/meta/progress";
import { UPGRADES, hangarBonuses as calcHangarBonuses, upgradeCost } from "@/game/meta/upgrades";
import type { HudState, RunResult, UpgradeChoice } from "@/game/types";

type Screen = "MENU" | "SELECT" | "HANGAR" | "PLAYING" | "GAMEOVER";
type GameMode = "CAMPAIGN" | "ENDLESS";

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
  const [gameMode, setGameMode] = useState<GameMode>("CAMPAIGN");
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
  const [unlockedSectors, setUnlockedSectors] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletConnecting, setWalletConnecting] = useState(false);
  const [hangarTab, setHangarTab] = useState<HangarTab>("UPGRADES");
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

  useEffect(() => {
    let active = true;
    getAuthenticatedSolanaWallet()
      .then((wallet) => {
        if (active && wallet) setWalletAddress(wallet.address);
      })
      .catch((error) => {
        console.error("No se pudo recuperar la sesión de wallet:", error);
      });
    return () => {
      active = false;
    };
  }, []);

  const saveProgress = (next: Progress) => {
    ProgressStore.set(next);
    setProgress(next);
  };

  const handleWalletConnection = async () => {
    if (walletConnecting) return;
    setWalletConnecting(true);
    try {
      if (walletAddress) {
        await disconnectMetaMaskSolana();
        setWalletAddress(null);
        setNotice("WALLET DESCONECTADA");
      } else {
        const connected = await connectAndVerifyMetaMaskSolana();
        setWalletAddress(connected.address);
        setNotice("WALLET SOLANA VERIFICADA");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo conectar la wallet.";
      setNotice(message);
    } finally {
      setWalletConnecting(false);
      window.setTimeout(() => setNotice(""), 3500);
    }
  };

  const selectedShip = SHIPS.find((ship) => ship.id === selectedShipId) ?? SHIPS[0]!;
  const selectedStage = STAGES.find((stage) => stage.id === selectedStageId) ?? STAGES[0]!;
  const latestRun: RunSummary | undefined = progress.history[0];
  const claimableCount = MISSIONS.filter(
    (mission) =>
      !progress.claimed.includes(mission.id) && missionValue(progress, mission.id) >= mission.goal,
  ).length;

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
      durationSec: 1200,
      isEndless: gameMode === "ENDLESS",
      callbacks: {
        onLevelUp: (nextChoices, nextRerolls) => {
          setChoices(nextChoices);
          setRerolls(nextRerolls);
        },
        onEnd: (result) => {
          if (gameMode === "ENDLESS") {
            setRunCredits(0);
          } else {
            const outcome = recordRun(ProgressStore.get(), result);
            saveProgress(outcome.progress);
            setRunCredits(outcome.credits);
            setUnlockedSectors(outcome.newStages);
          }
          setRunResult(result);
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
  }, [screen, selectedShip, selectedStage, progress.upgrades, gameMode]);

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

  const handleClaimMission = (missionId: string) => {
    const res = claimMission(progress, missionId);
    if (res.ok && res.progress) {
      ProgressStore.set(res.progress);
      Audio.SFX.levelUp?.();
      setNotice("¡Recompensa de misión reclamada!");
      window.setTimeout(() => setNotice(""), 1800);
    }
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
    const remaining =
      gameMode === "ENDLESS"
        ? (hud?.time ?? 0)
        : hud
          ? Math.max(0, Math.ceil(hud.duration - hud.time))
          : 1200;

    return (
      <main className="fixed inset-0 overflow-hidden bg-[#070814] font-pixel text-white">
        <canvas ref={canvasRef} className="w-full h-full block" />
        <TouchControls />
        <Hotbar inventory={hud?.inventory} onUse={(kind) => engineRef.current?.useItem(kind)} />
        <CombatStatsOverlay stats={hud?.playerStats} />
        <WeaponHotbar weapons={hud?.weapons} />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-[#070814]/95 via-[#070814]/65 to-transparent px-4 pb-10 pt-4 sm:px-7">
          <div className="mx-auto flex max-w-[1500px] items-start justify-between gap-4">
            <section className="w-full max-w-sm">
              <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.18em]">
                <span className="flex items-center gap-2 text-cyan-100">
                  <Heart className="size-4 text-[#ff0055]" /> INTEGRIDAD
                </span>
                <span className="font-arcade text-[8px]">
                  {hud ? `${Math.ceil(hud.hp)} / ${Math.ceil(hud.maxHp)}` : "-- / --"}
                </span>
              </div>
              <Meter value={healthPercent} color="bg-[#ff0055]" />
              {hud?.shieldMax ? (
                <div className="mt-2">
                  <div className="mb-1 flex justify-between text-[10px] uppercase tracking-widest text-cyan-100/70">
                    <span className="flex items-center gap-1">
                      <Shield className="size-3" /> ESCUDO
                    </span>
                    <span className="font-arcade text-[8px]">
                      {Math.ceil(hud.shield)} / {Math.ceil(hud.shieldMax)}
                    </span>
                  </div>
                  <Meter value={shieldPercent} color="bg-[#00f0ff]" />
                </div>
              ) : null}
              <div className="mt-3 flex items-center gap-2 text-xs uppercase tracking-widest text-cyan-100">
                <Zap className="size-4 text-[#ffd700]" />
                <span className="font-arcade text-[8px]">NIVEL {hud?.level ?? 1}</span>
              </div>
              <div className="mt-1.5">
                <Meter value={xpPercent} color="bg-[#8a2be2]" />
              </div>
            </section>

            <div className="flex shrink-0 items-start gap-3 sm:gap-6">
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-100/65">
                  {gameMode === "ENDLESS" ? "TIEMPO TRANSCURRIDO" : "TIEMPO RESTANTE"}
                </p>
                <p className="font-arcade text-sm tabular-nums text-white drop-shadow-[0_0_12px_#00f0ff99] sm:text-xl">
                  {formatTime(remaining)}
                </p>
                {gameMode === "ENDLESS" ? (
                  <span className="mt-2 inline-flex border border-[#ff0055]/50 bg-[#ff0055]/10 px-2 py-1 text-[8px] uppercase tracking-widest text-[#ff9ab9] shadow-[0_0_12px_#ff005522]">
                    MODO INFINITO
                  </span>
                ) : null}
                <p className="mt-1 flex items-center justify-end gap-1 text-[10px] uppercase tracking-widest text-[#ff7fa6]">
                  <Skull className="size-3" />
                  <span className="font-arcade text-[8px]">{hud?.kills ?? 0} BAJAS</span>
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
                <span className="font-arcade text-[8px]">{Math.ceil(hud.boss.hp)} PS</span>
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

        {hud?.hordeNotice ? (
          <div className="pointer-events-none absolute left-1/2 top-[14%] z-10 w-[min(92%,640px)] -translate-x-1/2 text-center">
            <h2 className="font-arcade text-base uppercase leading-relaxed tracking-wider text-white drop-shadow-[0_0_18px_#00f0ff] sm:text-xl">
              HORDA {hud.hordeNotice.horde} SUPERADA
            </h2>
            <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[#ff9ab9] drop-shadow-[0_0_6px_#000]">
              ENEMIGOS MÁS PODEROSOS EN CAMINO
            </p>
            <p className="mt-2 font-arcade text-2xl text-[#ffd700] drop-shadow-[0_0_12px_#ffd70099]">
              {hud.hordeNotice.remaining}
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
                  <h1 className="font-arcade text-sm uppercase leading-relaxed tracking-wider text-white sm:text-base">
                    Subir de nivel
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
                    onClick={(event) => {
                      chooseUpgrade(index);
                      event.currentTarget.blur();
                    }}
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
            title="Pausa táctica"
            eyebrow="CONTROL DE VUELO"
            icon={<CirclePause className="size-5" />}
          >
            <p className="mb-7 text-center text-xs uppercase tracking-[0.16em] text-white/55">
              La flota enemiga espera tu siguiente movimiento.
            </p>
            <Button
              className="font-arcade h-12 w-full rounded-none bg-[#00f0ff] text-[9px] uppercase tracking-[0.08em] text-[#070814] hover:bg-cyan-200"
              onClick={() => engineRef.current?.resume()}
            >
              <Play /> Continuar
            </Button>
            <Button
              variant="outline"
              className="font-arcade mt-3 h-12 w-full rounded-none border-white/20 bg-transparent text-[8px] uppercase tracking-[0.08em] text-white hover:bg-white/10"
              onClick={returnToMenu}
            >
              <ArrowLeft /> Volver al menú
            </Button>
          </Overlay>
        ) : null}
      </main>
    );
  }

  return (
    <main className="relative min-h-dvh overflow-x-clip bg-[#070814] font-pixel text-white selection:bg-[#00f0ff]/30">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_75%_5%,#8a2be21c,transparent_38%),radial-gradient(ellipse_at_12%_82%,#00f0ff12,transparent_32%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.1] [background-image:linear-gradient(#00f0ff_1px,transparent_1px),linear-gradient(90deg,#00f0ff_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      {screen === "MENU" ? <MenuAttractBackdrop /> : null}
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[1440px] min-w-0 flex-col px-5 pb-8 pt-5 sm:px-8 lg:px-12">
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
              <span className="font-arcade block text-[8px] tracking-[0.06em] text-white">
                SPACE SURVIVORS
              </span>
              <span className="mt-1 block text-[9px] uppercase tracking-[0.24em] text-cyan-100/45">
                Defensa de frontera · 2187
              </span>
            </span>
          </button>
          <div className="flex items-center gap-2 sm:gap-5">
            <span className="font-arcade hidden items-center gap-2 text-[8px] uppercase tracking-widest text-[#ffd700] sm:flex">
              <span className="size-2 bg-[#ffd700] shadow-[0_0_10px_#ffd700]" />{" "}
              {progress.credits.toLocaleString()} CR
            </span>
            {screen === "MENU" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleWalletConnection}
                disabled={walletConnecting}
                className="font-arcade h-9 border-amber-400/40 bg-amber-400/10 px-3 text-[8px] uppercase tracking-wider text-amber-300 shadow-[0_0_15px_#f59e0b25] hover:bg-amber-400/20 hover:text-amber-200"
              >
                <Wallet className="size-3.5" />
                <span>{walletConnecting ? "CONECTANDO..." : walletAddress ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}` : "CONECTAR METAMASK"}</span>
              </Button>
            ) : null}
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
        {notice ? (
          <p role="status" aria-live="polite" className="mx-auto w-full max-w-[1500px] px-4 pt-2 text-center text-[10px] uppercase tracking-widest text-cyan-200 sm:px-7">
            {notice}
          </p>
        ) : null}

        {screen === "MENU" ? (
          <section className="grid min-w-0 flex-1 items-center gap-10 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
            <div className="relative">
              <div className="mb-6 flex items-center gap-3 text-[10px] uppercase tracking-[0.32em] text-cyan-300">
                <span className="h-px w-9 bg-cyan-400" /> ALERTA DE SECTOR · NOVA-01
              </div>
              <h1 className="font-arcade max-w-3xl text-[clamp(1.8rem,5vw,4.2rem)] uppercase leading-[1.65] tracking-[0.04em] text-white [text-shadow:0_0_34px_#00f0ff45]">
                SPACE
                <br />
                <span className="text-[#00f0ff]">SURVIVORS</span>
              </h1>
              <div className="mt-7 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-[#ff6b95]">
                <span className="h-px w-12 bg-[#ff0055]" /> La última línea de defensa
              </div>
              <p className="mt-5 max-w-lg text-sm leading-7 text-white/55">
                Veinte minutos de combate intenso contra una flota que no deja de crecer. Supera las
                hordas enemigas, recolecta recursos, mejora tu arsenal y sobrevive hasta derrotar al
                jefe del sector.
              </p>
              <div className="mt-9 flex max-w-md flex-col gap-3 sm:flex-row">
                <Button
                  onClick={() => setScreen("SELECT")}
                  className="font-arcade h-12 flex-1 rounded-none border border-cyan-200 bg-[#00f0ff] px-2 text-[8px] uppercase tracking-[0.04em] text-[#070814] shadow-[0_0_28px_#00f0ff45] hover:bg-cyan-200"
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
                <div className="relative grid place-items-center overflow-hidden px-4 pb-14 pt-8 sm:pt-10">
                  <div className="absolute inset-0 opacity-60 [background-image:radial-gradient(#9befff_0.7px,transparent_0.7px)] [background-size:24px_24px]" />
                  <div className="absolute left-[18%] top-[20%] size-2 rounded-full bg-white shadow-[0_0_12px_4px_#00f0ff]" />
                  <div className="absolute right-[20%] top-[32%] size-1.5 rounded-full bg-[#ff0055] shadow-[0_0_12px_4px_#ff0055]" />
                  <div className="absolute bottom-[18%] left-[34%] size-1 rounded-full bg-white shadow-[0_0_10px_3px_#8a2be2]" />
                  <div className="absolute inset-x-0 bottom-8 h-48 bg-[radial-gradient(ellipse_at_center,#8a2be21f,transparent_70%)]" />
                  <div className="relative z-10 w-full">
                    <MenuHeroShip ship={selectedShip} />
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
          <section className="min-w-0 flex-1 py-8 sm:py-12">
            <SectionHeading
              eyebrow="PREPARACIÓN DE COMBATE"
              title="Configura el despliegue"
              onBack={() => setScreen("MENU")}
            />
            <div className="mt-9 grid min-w-0 gap-10 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="min-w-0">
                <div className="mb-4 flex items-end justify-between gap-3">
                  <div className="min-w-0">
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

              <div className="min-w-0">
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
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    aria-pressed={gameMode === "CAMPAIGN"}
                    onClick={() => setGameMode("CAMPAIGN")}
                    className={`border p-3 text-left transition ${gameMode === "CAMPAIGN" ? "border-cyan-300/70 bg-cyan-300/10 shadow-[0_0_18px_#00f0ff16]" : "border-white/10 bg-white/[0.025] hover:border-cyan-300/35"}`}
                  >
                    <span
                      className={`font-arcade block text-[8px] uppercase leading-relaxed ${gameMode === "CAMPAIGN" ? "text-cyan-100" : "text-white/55"}`}
                    >
                      CAMPAÑA (20 MIN)
                    </span>
                    <span className="mt-2 block text-[9px] leading-4 text-white/45">
                      Sobrevive hasta derrotar al jefe supremo. Otorga créditos y progreso de
                      misiones.
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={gameMode === "ENDLESS"}
                    onClick={() => setGameMode("ENDLESS")}
                    className={`border p-3 text-left transition ${gameMode === "ENDLESS" ? "border-[#ff0055]/70 bg-[#ff0055]/10 shadow-[0_0_18px_#ff005518]" : "border-white/10 bg-white/[0.025] hover:border-[#ff0055]/35"}`}
                  >
                    <span
                      className={`font-arcade block text-[8px] uppercase leading-relaxed ${gameMode === "ENDLESS" ? "text-[#ff9ab9]" : "text-white/55"}`}
                    >
                      MODO INFINITO
                    </span>
                    <span className="mt-2 block text-[9px] leading-4 text-white/45">
                      Supervivencia extrema sin límite. Práctica pura: no otorga créditos ni
                      progreso.
                    </span>
                  </button>
                </div>
                <Button
                  onClick={startMission}
                  className="font-arcade mt-6 h-12 w-full rounded-none bg-[#00f0ff] text-[9px] uppercase tracking-[0.08em] text-[#070814] shadow-[0_0_25px_#00f0ff25] hover:bg-cyan-200"
                >
                  <Play /> Iniciar misión
                </Button>
                <p className="mt-3 text-center text-[9px] uppercase tracking-[0.18em] text-white/35">
                  {gameMode === "ENDLESS"
                    ? "PRÁCTICA · OLEADAS Y DIFICULTAD SIN LÍMITE"
                    : "20 MIN · PILOTAJE AUTOMÁTICO DE ARMAS"}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {screen === "HANGAR" ? (
          <section className="min-w-0 flex-1 py-8 sm:py-12 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-x-8">
            <div className="lg:col-span-2">
              <SectionHeading
                eyebrow="MANTENIMIENTO DE FLOTA"
                title="Centro de mando / hangar"
                onBack={() => setScreen("MENU")}
              />
            </div>
            <HangarSidebar
              activeTab={hangarTab}
              claimableCount={claimableCount}
              onTabChange={setHangarTab}
            />
            <div className="mt-7 flex flex-wrap items-end justify-between gap-4 border-y border-cyan-500/20 py-5 lg:col-start-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">
                  CRÉDITOS DISPONIBLES
                </p>
                <p className="font-arcade mt-1 text-base tabular-nums text-[#ffd700] drop-shadow-[0_0_12px_#ffd70030] sm:text-xl">
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
            <div className="lg:col-start-2">
              {notice ? (
                <p role="status" className="mt-4 text-xs uppercase tracking-widest text-cyan-200">
                  {notice}
                </p>
              ) : null}
            </div>
            {hangarTab === "UPGRADES" ? (
              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 lg:col-start-2">
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
            ) : hangarTab === "MISSIONS" ? (
              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 lg:col-start-2">
                {MISSIONS.map((mission) => {
                  const current = missionValue(progress, mission.id);
                  const percentage = Math.min(100, Math.round((current / mission.goal) * 100));
                  const isClaimed = progress.claimed.includes(mission.id);
                  const canClaim = !isClaimed && current >= mission.goal;
                  const MissionIcon =
                    mission.icon === "ic_damage"
                      ? Flame
                      : mission.icon === "ic_speed"
                        ? Zap
                        : Target;
                  return (
                    <article
                      key={mission.id}
                      className="flex min-h-60 flex-col border border-cyan-500/20 bg-[#0b0d1c]/85 p-4 transition hover:border-cyan-400/45"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="grid size-10 shrink-0 place-items-center border border-cyan-400/25 bg-cyan-400/[0.07] text-cyan-200">
                          <MissionIcon className="size-5" />
                        </span>
                        <span className="flex items-center gap-1 text-[10px] font-black tracking-widest text-[#ffd700]">
                          <Award className="size-3.5" /> +{mission.reward.toLocaleString()} CR
                        </span>
                      </div>
                      <h3 className="mt-4 text-xs font-black uppercase tracking-[0.13em]">
                        {mission.name}
                      </h3>
                      <p className="mt-2 min-h-8 text-[10px] leading-4 text-white/45">
                        {mission.desc}
                      </p>
                      <div className="mt-4">
                        <div className="mb-1.5 flex justify-between text-[9px] uppercase tracking-widest text-cyan-100/55">
                          <span>PROGRESO</span>
                          <span>
                            {current.toLocaleString()} / {mission.goal.toLocaleString()}
                          </span>
                        </div>
                        <div
                          className="h-2 overflow-hidden border border-cyan-400/20 bg-[#151727]"
                          role="progressbar"
                          aria-label={`Progreso: ${mission.name}`}
                          aria-valuenow={percentage}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <div
                            className={`h-full transition-[width] duration-300 ${isClaimed ? "bg-cyan-300/50" : canClaim ? "bg-[#ffd700] shadow-[0_0_10px_#ffd70099]" : "bg-[#00f0ff] shadow-[0_0_8px_#00f0ff55]"}`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                      <Button
                        disabled={!canClaim}
                        onClick={() => handleClaimMission(mission.id)}
                        variant="outline"
                        className={`font-arcade mt-auto h-10 w-full rounded-none px-1 text-[7px] uppercase tracking-normal ${isClaimed ? "border-white/10 text-cyan-100/35" : canClaim ? "border-[#ffd700]/70 bg-[#ffd700]/10 text-[#ffd700] shadow-[0_0_16px_#ffd70022] hover:bg-[#ffd700]/20" : "border-cyan-400/20 text-cyan-100/45"}`}
                      >
                        {isClaimed ? (
                          <>
                            <Check /> RECLAMADA
                          </>
                        ) : canClaim ? (
                          "¡RECLAMAR RECOMPENSA!"
                        ) : (
                          `EN PROGRESO (${current.toLocaleString()}/${mission.goal.toLocaleString()})`
                        )}
                      </Button>
                    </article>
                  );
                })}
              </div>
            ) : hangarTab === "BESTIARY" ? (
              <div className="mt-7 space-y-10 lg:col-start-2">
                <section>
                  <div className="mb-4 flex items-center gap-3">
                    <span className="h-px flex-1 bg-cyan-400/20" />
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">
                      ENEMIGOS COMUNES
                    </h2>
                    <span className="h-px flex-1 bg-cyan-400/20" />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {ENEMIES.filter((enemy) => enemy.hidden !== true).map((enemy) => {
                      const kills = progress.bestiary[enemy.id] || 0;
                      return (
                        <article
                          key={enemy.id}
                          className="border border-cyan-500/20 bg-[#0b0d1c]/85 p-2.5 shadow-[inset_0_0_18px_#00f0ff06]"
                        >
                          <div className="flex items-center gap-2.5">
                            <BestiarySprite spriteId={enemy.sprite} name={enemy.name} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <h3
                                  className="truncate text-xs font-black tracking-[0.1em]"
                                  style={{ color: enemy.color }}
                                >
                                  {enemy.name}
                                </h3>
                                <span
                                  className="shrink-0 text-[8px] font-bold text-[#ffd700]"
                                  aria-label={`Amenaza ${enemy.threat} de 5`}
                                >
                                  {enemy.threat}/5 ★
                                </span>
                              </div>
                              <p className="mt-0.5 truncate text-[8px] uppercase tracking-[0.12em] text-white/40">
                                {enemy.family}
                              </p>
                              <p className="mt-1 line-clamp-2 text-[9px] leading-4 text-white/45">
                                {enemy.desc}
                              </p>
                            </div>
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-1 border-y border-white/10 py-1.5 text-center">
                            {[
                              ["VIDA", enemy.hp],
                              ["DAÑO", enemy.dmg],
                              ["VEL.", enemy.speed],
                            ].map(([label, value]) => (
                              <div key={label}>
                                <p className="text-[7px] uppercase tracking-widest text-white/35">
                                  {label}
                                </p>
                                <p className="mt-0.5 text-[10px] font-bold tabular-nums text-cyan-100">
                                  {value}
                                </p>
                              </div>
                            ))}
                          </div>
                          <p
                            className={`mt-1.5 flex items-center justify-between text-[8px] font-bold uppercase tracking-[0.14em] ${kills ? "text-[#ff9ab9]" : "text-white/25"}`}
                          >
                            <span>{kills ? "ELIMINACIONES" : "NO AVISTADO"}</span>
                            <span>{kills ? kills.toLocaleString() : ""}</span>
                          </p>
                        </article>
                      );
                    })}
                  </div>
                </section>
                <section>
                  <div className="mb-4 flex items-center gap-3">
                    <span className="h-px flex-1 bg-[#ff0055]/25" />
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-[#ff9ab9]">
                      JEFES SUPREMOS
                    </h2>
                    <span className="h-px flex-1 bg-[#ff0055]/25" />
                  </div>
                  <div className="grid gap-2 lg:grid-cols-3">
                    {BOSSES.map((boss) => {
                      const victories = progress.stats.bossKills[boss.id] || 0;
                      return (
                        <article
                          key={boss.id}
                          className="border border-[#8a2be2]/30 bg-[#0b0d1c]/85 p-3 shadow-[inset_0_0_18px_#8a2be206]"
                        >
                          <div className="flex items-center gap-3">
                            <BestiarySprite
                              spriteId={boss.sprite}
                              name={boss.name}
                              className="size-14"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-[8px] uppercase tracking-[0.16em] text-[#c7a1ff]">
                                {boss.title}
                              </p>
                              <h3
                                className="mt-1 truncate text-sm font-black tracking-[0.1em]"
                                style={{ color: boss.color }}
                              >
                                {boss.name}
                              </h3>
                              <p className="mt-1 line-clamp-2 text-[9px] leading-4 text-white/45">
                                {boss.desc}
                              </p>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 text-[8px] uppercase tracking-widest">
                            <span className="text-white/50">
                              VIDA BASE{" "}
                              <strong className="ml-1 text-cyan-100">
                                {boss.hp.toLocaleString()}
                              </strong>
                            </span>
                            <span className="text-[#ffd700]">
                              {boss.phases.length + 1} FASES DE COMBATE
                            </span>
                          </div>
                          <p className="mt-1 text-[8px] text-white/35">
                            Umbrales de fase:{" "}
                            {boss.phases.map((phase) => `${Math.round(phase * 100)}%`).join(" · ")}
                          </p>
                          <p className="mt-1.5 text-[8px] font-bold uppercase tracking-[0.16em] text-[#ff9ab9]">
                            VICTORIAS: {victories.toLocaleString()}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                </section>
              </div>
            ) : hangarTab === "ARSENAL" ? (
              <div className="mt-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 lg:col-start-2">
                {WEAPONS.map((weapon) => {
                  const passive =
                    PASSIVES.find((candidate) => candidate.id === weapon.evo.passive) ??
                    passiveById(weapon.evo.passive);
                  return (
                    <ArsenalCard
                      key={weapon.id}
                      weapon={weapon}
                      passiveName={passive?.name ?? "pasiva desconocida"}
                    />
                  );
                })}
              </div>
            ) : hangarTab === "MARKET" ? (
              <div className="lg:col-start-2">
                <MarketSection />
              </div>
            ) : (
              <div className="mt-6 space-y-8 lg:col-start-2">
                <section>
                  <h2 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-cyan-200">
                    ESTADÍSTICAS HISTÓRICAS
                  </h2>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      ["PARTIDAS JUGADAS", progress.stats.runs.toLocaleString(), "text-cyan-200"],
                      ["VICTORIAS", progress.stats.wins.toLocaleString(), "text-[#7dff4f]"],
                      ["BAJAS TOTALES", progress.stats.kills.toLocaleString(), "text-[#ff9ab9]"],
                      [
                        "RÉCORD DE BAJAS",
                        progress.stats.bestKills.toLocaleString(),
                        "text-[#ffd700]",
                      ],
                      ["DAÑO TOTAL", progress.stats.damageDealt.toLocaleString(), "text-[#ff9ab9]"],
                      ["NIVEL MÁXIMO", progress.stats.maxLevel.toLocaleString(), "text-[#c7a1ff]"],
                      ["EVOLUCIONES", progress.stats.evolutions.toLocaleString(), "text-[#c7a1ff]"],
                      [
                        "TIEMPO DE VUELO",
                        `${Math.floor(progress.stats.timePlayed / 60)} min ${Math.floor(progress.stats.timePlayed % 60)} s`,
                        "text-cyan-200",
                      ],
                    ].map(([label, value, color]) => (
                      <article
                        key={label}
                        className="border border-cyan-500/20 bg-[#0b0d1c]/85 p-4"
                      >
                        <p className="text-[8px] uppercase tracking-[0.16em] text-white/40">
                          {label}
                        </p>
                        <p className={`mt-2 text-lg font-black tabular-nums ${color}`}>{value}</p>
                      </article>
                    ))}
                  </div>
                </section>
                <section>
                  <h2 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-[#ff9ab9]">
                    ÚLTIMAS MISIONES
                  </h2>
                  {progress.history.length ? (
                    <div className="space-y-2">
                      {progress.history.slice(0, 10).map((run, index) => (
                        <article
                          key={`${run.date}-${run.stageId}-${index}`}
                          className="grid gap-3 border border-white/10 bg-[#0b0d1c]/75 p-3 text-[9px] sm:grid-cols-[1fr_1.2fr_auto] sm:items-center"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-black tracking-widest ${run.victory ? "text-[#7dff4f]" : "text-[#ff6b95]"}`}
                            >
                              {run.victory ? "VICTORIA" : "CAÍDO"}
                            </span>
                            <span className="text-white/35">{formatTime(run.time)}</span>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 uppercase tracking-wider text-white/55">
                            <span>{shipById(run.shipId)?.name}</span>
                            <span className="text-cyan-200/70">{stageById(run.stageId)?.name}</span>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 uppercase tracking-wider text-white/45 sm:justify-end">
                            <span>{run.kills.toLocaleString()} BAJAS</span>
                            <span>NIVEL {run.level}</span>
                            <span className="text-[#ffd700]">
                              +{run.credits.toLocaleString()} CR
                            </span>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="border border-dashed border-cyan-400/20 bg-[#0b0d1c]/50 px-5 py-10 text-center">
                      <Rocket className="mx-auto size-7 text-cyan-200/50" />
                      <p className="mt-3 text-[10px] uppercase tracking-[0.18em] text-white/45">
                        Aún no hay misiones registradas.
                      </p>
                      <p className="mt-2 text-[9px] uppercase tracking-wider text-cyan-100/35">
                        Realiza tu primer despliegue para iniciar el registro de vuelo.
                      </p>
                    </div>
                  )}
                </section>
              </div>
            )}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5 lg:col-start-2">
              <p className="text-[10px] uppercase tracking-[0.15em] text-white/40">
                {hangarTab === "UPGRADES"
                  ? "Las mejoras son permanentes y se aplican al próximo despliegue."
                  : hangarTab === "MISSIONS"
                    ? "Completa objetivos y reclama créditos para financiar tu próxima misión."
                    : hangarTab === "BESTIARY"
                      ? "Intel de combate recopilada en todos los sectores conocidos."
                      : hangarTab === "ARSENAL"
                        ? "Domina cada arma y su sinergia pasiva para desbloquear su evolución."
                        : hangarTab === "MARKET"
                          ? "Explora objetos mock del mercado; compras y listados no están disponibles todavía."
                          : "Historial permanente de despliegues y rendimiento de la flota."}
              </p>
              <Button
                onClick={() => setScreen("SELECT")}
                className="font-arcade rounded-none bg-[#00f0ff] px-3 text-[8px] uppercase tracking-[0.06em] text-[#070814] hover:bg-cyan-200"
              >
                <Rocket /> Preparar nave
              </Button>
            </div>
          </section>
        ) : null}

        {screen === "GAMEOVER" &&
        runResult &&
        runResult.victory &&
        gameMode !== "ENDLESS" &&
        runResult.stageId === WORLD1_ID ? (
          <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center py-10">
            <div className="text-center">
              <p className="mb-4 flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.3em] text-[#ffd700]">
                <Award className="size-4" /> SECTOR LIBERADO
              </p>
              <h1 className="font-arcade text-[clamp(1.1rem,3.4vw,2.4rem)] uppercase leading-relaxed tracking-[0.04em] text-[#00f0ff] drop-shadow-[0_0_28px_#00f0ff66]">
                Mundo 1 completado
              </h1>
              <p className="mt-3 text-xs uppercase tracking-[0.2em] text-white/55">
                {selectedStage.name} · {selectedShip.name}
              </p>
            </div>
            <div className="mt-9 grid grid-cols-2 border-y border-white/10 sm:grid-cols-4">
              <ResultStat
                icon={<AudioLines />}
                label="Tiempo de supervivencia"
                value={formatTime(runResult.time)}
              />
              <ResultStat
                icon={<Skull />}
                label="Enemigos eliminados"
                value={runResult.kills.toLocaleString()}
              />
              <ResultStat
                icon={<Zap />}
                label="Nivel alcanzado"
                value={runResult.level.toString()}
              />
              <ResultStat
                icon={<Sparkles />}
                label="Jefe derrotado"
                value={runResult.bossesDefeated.map((id) => bossById(id).name).join(" · ") || "—"}
              />
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border border-[#ffd700]/25 bg-[#ffd700]/[0.04] px-5 py-4">
              <span className="text-xs uppercase tracking-[0.18em] text-white/65">
                Créditos recuperados
              </span>
              <span className="font-arcade text-xs tabular-nums text-[#ffd700] sm:text-sm">
                +{runCredits.toLocaleString()} CR
              </span>
            </div>
            {unlockedSectors.length > 0 ? (
              <p className="mt-4 border border-[#00f0ff]/35 bg-[#00f0ff]/[0.06] px-4 py-3 text-center text-[9px] uppercase leading-5 tracking-wider text-cyan-100">
                Nuevo sector desbloqueado:{" "}
                {unlockedSectors.map((id) => stageById(id).name).join(" · ")}
              </p>
            ) : null}
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Button
                onClick={() => setScreen("SELECT")}
                className="font-arcade h-12 rounded-none bg-[#00f0ff] px-6 text-[8px] uppercase tracking-[0.04em] text-[#070814] hover:bg-cyan-200"
              >
                <Rocket /> Continuar
              </Button>
              <Button
                variant="outline"
                onClick={() => setScreen("HANGAR")}
                className="font-arcade h-12 rounded-none border-white/20 bg-transparent px-4 text-[8px] uppercase tracking-[0.04em] text-white hover:bg-white/10"
              >
                <Wrench /> Volver al hangar
              </Button>
            </div>
          </section>
        ) : screen === "GAMEOVER" && runResult ? (
          <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center py-10">
            <div className="text-center">
              <p className="mb-4 flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.3em] text-cyan-300">
                <Award className="size-4" /> INFORME DE COMBATE
              </p>
              <h1
                className={`font-arcade text-[clamp(1rem,3vw,2rem)] uppercase leading-relaxed tracking-[0.04em] ${gameMode === "ENDLESS" || runResult.victory ? "text-[#00f0ff] drop-shadow-[0_0_24px_#00f0ff55]" : "text-[#ff6b95] drop-shadow-[0_0_24px_#ff005533]"}`}
              >
                {gameMode === "ENDLESS"
                  ? "Simulación finalizada"
                  : runResult.victory
                    ? "Misión cumplida"
                    : "Misión fallida"}
              </h1>
              <p className="mt-3 text-xs uppercase tracking-[0.2em] text-white/45">
                {gameMode === "ENDLESS"
                  ? "MODO INFINITO (PRÁCTICA)"
                  : `${selectedStage.name} · ${selectedShip.name}`}
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
                {gameMode === "ENDLESS" ? "Créditos obtenidos" : "Créditos recuperados"}
              </span>
              <span className="font-arcade text-xs tabular-nums text-[#ffd700] sm:text-sm">
                {gameMode === "ENDLESS" ? "0 CR" : `+${runCredits.toLocaleString()} CR`}
              </span>
            </div>
            {gameMode === "ENDLESS" ? (
              <p className="mt-4 border border-[#ff0055]/35 bg-[#ff0055]/[0.06] px-4 py-3 text-center text-[9px] uppercase leading-5 tracking-wider text-[#ffb0c5]">
                MODO PRÁCTICA: Esta sesión no alteró tus créditos ni el progreso de misiones.
              </p>
            ) : null}
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Button
                onClick={() => setScreen("HANGAR")}
                className="font-arcade h-12 rounded-none bg-[#00f0ff] px-4 text-[8px] uppercase tracking-[0.04em] text-[#070814] hover:bg-cyan-200"
              >
                <Wrench /> Volver al hangar
              </Button>
              <Button
                variant="outline"
                onClick={() => setScreen("SELECT")}
                className="font-arcade h-12 rounded-none border-white/20 bg-transparent px-4 text-[8px] uppercase tracking-[0.04em] text-white hover:bg-white/10"
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
            <span className="font-arcade text-[8px] text-[#ffd700]/80">
              {progress.credits.toLocaleString()} CR
            </span>
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

function TouchControls() {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pointer = useRef<{ id: number; startX: number; startY: number } | null>(null);

  if (!Input.isTouchDevice()) return null;

  const moveJoystick = (event: ReactPointerEvent<HTMLDivElement>) => {
    const activePointer = pointer.current;
    if (!activePointer || activePointer.id !== event.pointerId) return;
    const dx = event.clientX - activePointer.startX;
    const dy = event.clientY - activePointer.startY;
    const distance = Math.hypot(dx, dy);
    const scale = distance > 45 ? 45 / distance : 1;
    const x = dx * scale;
    const y = dy * scale;
    setKnob({ x, y });
    Input.setTouch(x / 45, y / 45, true);
  };

  const releaseJoystick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointer.current?.id !== event.pointerId) return;
    pointer.current = null;
    setKnob({ x: 0, y: 0 });
    Input.setTouch(0, 0, false);
  };

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex items-end justify-between px-5 sm:px-8"
      style={{ touchAction: "none", userSelect: "none" }}
    >
      <div
        aria-label="Joystick de movimiento"
        className="pointer-events-auto relative size-[130px] touch-none select-none rounded-full border border-cyan-400/40 bg-cyan-950/40 shadow-[inset_0_0_24px_#00f0ff12,0_0_18px_#00f0ff12]"
        onPointerDown={(event) => {
          event.preventDefault();
          if (pointer.current) return;
          pointer.current = {
            id: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={moveJoystick}
        onPointerUp={releaseJoystick}
        onPointerCancel={releaseJoystick}
        onLostPointerCapture={releaseJoystick}
      >
        <span
          className="pointer-events-none absolute left-1/2 top-1/2 size-12 rounded-full border border-cyan-200/60 bg-cyan-400/20 shadow-[0_0_16px_#00f0ff55] transition-transform duration-75"
          style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
        />
      </div>
      <button
        type="button"
        aria-label="Turbo"
        className="pointer-events-auto grid size-[70px] touch-none select-none place-items-center rounded-full border-2 border-[#ff0055] bg-[#ff0055]/20 text-[10px] font-black tracking-[0.14em] text-[#ff9ab9] shadow-[0_0_22px_#ff005544] transition active:scale-95 active:bg-[#ff0055]/35"
        onPointerDown={(event) => {
          event.preventDefault();
          Input.queueBoost();
        }}
      >
        <span className="flex flex-col items-center gap-1">
          <Flame className="size-5" />
          TURBO
        </span>
      </button>
    </div>
  );
}

function ArsenalCard({
  weapon,
  passiveName,
}: {
  weapon: (typeof WEAPONS)[number];
  passiveName: string;
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [shipSprite, setShipSprite] = useState<string>();

  useEffect(() => {
    setShipSprite(spriteUrl("ship_falcon"));
  }, []);

  const playAnimation = () => {
    const effects = previewRef.current?.querySelectorAll<HTMLElement | SVGElement>(
      "[data-weapon-effect]",
    );
    if (!effects?.length) return;

    effects.forEach((effect, index) => {
      effect.getAnimations().forEach((animation) => animation.cancel());
      let frames: Keyframe[];
      let duration = 650;
      let delay = 0;

      switch (weapon.id) {
        case "laser":
          frames = [
            { height: "0px", opacity: 1 },
            { height: "56px", opacity: 0 },
          ];
          duration = 430;
          break;
        case "spread": {
          const spread = index - 2;
          frames = [
            { left: "50%", top: "60%", opacity: 1 },
            { left: `${50 + spread * 10}%`, top: `${28 + Math.abs(spread) * 5}%`, opacity: 0 },
          ];
          duration = 500;
          break;
        }
        case "missile":
          frames = [
            {
              left: index === 0 ? "43%" : "57%",
              top: "58%",
              transform: "rotate(0deg)",
              opacity: 1,
            },
            {
              left: index === 0 ? "66%" : "34%",
              top: "25%",
              transform: index === 0 ? "rotate(40deg)" : "rotate(-40deg)",
              opacity: 0,
            },
          ];
          duration = 720;
          break;
        case "drones":
          frames = [
            { transform: "translate(0, 0) scale(1)", opacity: 0.6 },
            {
              transform:
                index === 0
                  ? "translate(-18px, -20px) scale(1.2)"
                  : "translate(18px, 20px) scale(1.2)",
              opacity: 1,
            },
            { transform: "translate(0, 0) scale(1)", opacity: 0.6 },
          ];
          duration = 850;
          break;
        case "plasma":
          frames = [
            { left: "50%", top: "55%", transform: "scale(0.7)", opacity: 1 },
            { left: "78%", top: "25%", transform: "scale(1.2)", opacity: 0.9 },
          ];
          duration = 680;
          if (effect.getAttribute("data-weapon-effect") === "plasma-burst") {
            frames = [
              { transform: "translate(-50%, -50%) scale(0.2)", opacity: 0 },
              { transform: "translate(-50%, -50%) scale(2.4)", opacity: 0 },
            ];
            duration = 300;
            delay = 520;
          }
          break;
        case "field":
          frames = [
            { transform: "translate(-50%, -50%) scale(0.35)", opacity: 0.1 },
            { transform: "translate(-50%, -50%) scale(2.2)", opacity: 0.9 },
            { transform: "translate(-50%, -50%) scale(2.6)", opacity: 0 },
          ];
          duration = 720;
          break;
        case "shield":
          frames = [
            { transform: "translate(-50%, -50%) scale(0.8)", opacity: 0.25 },
            { transform: "translate(-50%, -50%) scale(1.25)", opacity: 0.9 },
            { transform: "translate(-50%, -50%) scale(0.8)", opacity: 0.25 },
          ];
          duration = 850;
          break;
        case "nova":
          frames = [
            { transform: "translate(-50%, -50%) scale(0.2)", opacity: 0.9 },
            { transform: "translate(-50%, -50%) scale(2.8)", opacity: 0 },
          ];
          duration = 700;
          delay = index * 120;
          break;
        case "arc":
          frames = [
            { strokeDashoffset: "100", opacity: 0.2 },
            { strokeDashoffset: "0", opacity: 1 },
            { strokeDashoffset: "-100", opacity: 0 },
          ];
          duration = 600;
          break;
        default:
          frames = [{ opacity: 0.4 }, { opacity: 1 }, { opacity: 0.4 }];
      }

      effect.animate(frames, {
        duration,
        delay,
        easing: "ease-out",
        fill: "none",
      });
    });
  };

  return (
    <article className="flex min-w-0 flex-col border border-cyan-500/20 bg-[#0b0d1c]/85 p-2">
      <header className="flex items-start justify-between gap-2">
        <h3
          className="font-arcade min-w-0 text-[8px] uppercase leading-5 tracking-wide"
          style={{ color: weapon.color }}
        >
          {weapon.name}
        </h3>
        <span
          className="shrink-0 border px-1.5 py-1 text-[7px] font-bold tracking-widest"
          style={{ borderColor: `${weapon.color}66`, color: weapon.color }}
        >
          {weapon.kind}
        </span>
      </header>
      <p className="mt-0.5 line-clamp-2 text-[8px] leading-3.5 text-white/50">{weapon.desc}</p>
      <div
        ref={previewRef}
        className="relative mt-1.5 grid h-24 shrink-0 place-items-center overflow-hidden border border-cyan-500/15 bg-[#070814]/75"
        aria-label={`Vista previa de ${weapon.name}`}
      >
        {weapon.id === "laser" ? (
          <span
            data-weapon-effect
            className="absolute bottom-[52%] z-10 block w-[3px] shadow-[0_0_8px_currentColor]"
            style={{
              left: "50%",
              height: 0,
              transform: "translateX(-50%)",
              backgroundColor: weapon.color,
              color: weapon.color,
            }}
          />
        ) : null}
        {weapon.id === "spread"
          ? Array.from({ length: 5 }, (_, index) => (
              <span
                key={index}
                data-weapon-effect
                className="absolute z-10 size-1 rounded-full"
                style={{
                  left: "50%",
                  top: "60%",
                  backgroundColor: weapon.color,
                  boxShadow: `0 0 7px ${weapon.color}`,
                }}
              />
            ))
          : null}
        {weapon.id === "missile"
          ? [0, 1].map((index) => (
              <span
                key={index}
                data-weapon-effect
                className="absolute z-10 h-3 w-1.5 rounded-t-full"
                style={{
                  left: index === 0 ? "43%" : "57%",
                  top: "58%",
                  backgroundColor: weapon.color,
                  boxShadow: `0 0 8px ${weapon.color}`,
                }}
              />
            ))
          : null}
        {weapon.id === "drones"
          ? [0, 1].map((index) => (
              <span
                key={index}
                data-weapon-effect
                className="absolute z-10 size-2 rounded-sm border border-cyan-100"
                style={{
                  left: index === 0 ? "38%" : "62%",
                  top: "48%",
                  backgroundColor: weapon.color,
                  boxShadow: `0 0 8px ${weapon.color}`,
                }}
              />
            ))
          : null}
        {weapon.id === "plasma" ? (
          <>
            <span
              data-weapon-effect="plasma-orb"
              className="absolute z-10 size-3 rounded-full"
              style={{
                left: "50%",
                top: "55%",
                backgroundColor: weapon.color,
                boxShadow: `0 0 12px ${weapon.color}`,
              }}
            />
            <span
              data-weapon-effect="plasma-burst"
              className="absolute left-[78%] top-[25%] z-10 size-5 rounded-full border-2"
              style={{ borderColor: weapon.color, boxShadow: `0 0 12px ${weapon.color}` }}
            />
          </>
        ) : null}
        {weapon.id === "field" || weapon.id === "shield" ? (
          <span
            data-weapon-effect
            className={`absolute left-1/2 top-1/2 z-10 rounded-full border-2 ${weapon.id === "shield" ? "h-20 w-16" : "size-12"}`}
            style={{ borderColor: weapon.color, boxShadow: `0 0 12px ${weapon.color}` }}
          />
        ) : null}
        {weapon.id === "nova"
          ? [0, 1].map((index) => (
              <span
                key={index}
                data-weapon-effect
                className="absolute left-1/2 top-1/2 z-10 size-8 rounded-full border-2"
                style={{ borderColor: weapon.color, boxShadow: `0 0 10px ${weapon.color}` }}
              />
            ))
          : null}
        {weapon.id === "arc" ? (
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-10 size-full"
            viewBox="0 0 100 80"
          >
            <path
              data-weapon-effect
              d="M50 52 L43 42 L54 35 L46 25 L58 17"
              fill="none"
              stroke={weapon.color}
              strokeDasharray="100"
              strokeDashoffset="100"
              strokeWidth="2"
              style={{ filter: `drop-shadow(0 0 4px ${weapon.color})` }}
            />
          </svg>
        ) : null}
        {shipSprite ? (
          <img
            src={shipSprite}
            alt=""
            className="relative z-0 h-16 w-16 object-contain [image-rendering:pixelated]"
          />
        ) : null}
      </div>
      <button
        type="button"
        onClick={playAnimation}
        className="font-arcade mt-1.5 flex h-8 w-full items-center justify-center gap-2 border border-cyan-400/30 text-[7px] uppercase tracking-widest text-cyan-100 transition hover:bg-cyan-300/10"
        aria-label={`Ver animación: ${weapon.name}`}
      >
        <Play className="size-3" /> VER ANIMACIÓN
      </button>
      <div className="mt-1.5 border-t border-[#8a2be2]/30 pt-1.5">
        <p className="text-[7px] font-black uppercase tracking-[0.16em] text-[#c7a1ff]">
          EVOLUCIÓN SUPREMA
        </p>
        <h4 className="mt-1 truncate text-[9px] font-black uppercase tracking-wide text-white">
          {weapon.evo.name}
        </h4>
        <p className="mt-0.5 line-clamp-2 min-h-6 text-[8px] leading-3 text-white/45">
          {weapon.evo.desc}
        </p>
        <p className="mt-1 border-t border-white/10 pt-1 text-[7px] uppercase leading-3 text-[#ff9ab9]">
          Nivel 5 + {passiveName}
        </p>
      </div>
    </article>
  );
}

function BestiarySprite({
  spriteId,
  name,
  className = "size-14",
}: {
  spriteId: string;
  name: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string>();

  useEffect(() => {
    setSrc(spriteUrl(spriteId));
  }, [spriteId]);

  return (
    <span
      className={`grid shrink-0 place-items-center border border-cyan-400/25 bg-[#070814]/75 p-1 ${className}`}
    >
      {src ? (
        <img
          src={src}
          alt={`${name} sprite`}
          className="max-h-full max-w-full object-contain [image-rendering:pixelated]"
        />
      ) : null}
    </span>
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
        <h1 className="font-arcade mt-2 text-[10px] uppercase leading-relaxed tracking-[0.04em] sm:text-xs">
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
      <p className="font-arcade mt-1 text-[9px] tabular-nums">{value}</p>
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
        <h2 className="font-arcade mb-4 text-center text-[10px] uppercase leading-relaxed tracking-[0.04em] sm:text-xs">
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
