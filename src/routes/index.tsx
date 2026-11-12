import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  AudioLines,
  Award,
  ChevronLeft,
  ChevronRight,
  CirclePause,
  Crosshair,
  Flame,
  Gem,
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
  Wallet,
  Wrench,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HangarSidebar, type HangarTab } from "@/components/hangar/HangarSidebar";
import { MarketSection } from "@/components/hangar/MarketSection";
import { InventorySection } from "@/components/hangar/InventorySection";
import { MissionsSection } from "@/components/hangar/MissionsSection";
import { UpgradesSection } from "@/components/hangar/UpgradesSection";
import { WikiPage } from "@/components/wiki/WikiPage";
import { BoostButton } from "@/components/game/BoostButton";
import { Audio } from "@/game/audio";
import { BOSSES, bossById } from "@/game/data/bosses";
import { WORLD1_ID } from "@/game/timeline";
import { ENEMIES } from "@/game/data/enemies";
import { PASSIVES, passiveById } from "@/game/data/passives";
import { SHIPS, shipById } from "@/game/data/ships";
import { STAGES, stageById } from "@/game/data/stages";
import { RoadmapRiver } from "@/components/roadmap/RoadmapRiver";
import { WEAPONS } from "@/game/data/weapons";
import { Engine, type BossAttempt } from "@/game/engine";
import { createBossCombatProof } from "@/game/meta/boss-combat-proof";
import { Input } from "@/game/input";
import { Settings } from "@/game/settings";
import { spriteUrl } from "@/game/sprites";
import { Hotbar } from "@/components/game/Hotbar";
import { CombatStatsOverlay } from "@/components/game/CombatStatsOverlay";
import { WeaponHotbar } from "@/components/game/WeaponHotbar";
import { GameChat } from "@/components/GameChat";
import { Leaderboard } from "@/components/Leaderboard";
import { TicketBalance } from "@/components/TicketBalance";
import { ReferralProfile } from "@/components/ReferralProfile";
import { AllianceProfile } from "@/components/AllianceProfile";
import { MenuAttractBackdrop } from "@/components/game/MenuAttractBackdrop";
import { MenuHeroShip } from "@/components/game/MenuHeroShip";
import { PilotHub } from "@/components/hub/PilotHub";
import { VipModal } from "@/components/hub/VipModal";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import type {
  P2PHistoryOrder,
  P2PCountry,
  P2PItemType,
  P2PMyAd,
  P2PPayMethod,
  P2PPurchaseOrder,
  P2PPublicListing,
  P2PPilotState,
  P2PPublishInput,
  P2PInventoryItem,
} from "@/game/data/market";
import {
  ProgressStore,
  applyRun as recordRun,
  buyUpgrade,
  chooseUpgradeModule,
  defaultProgress,
  getSeasonClaimableCount,
  sanitize,
  type Progress,
  type RunSummary,
} from "@/game/meta/progress";
import { hangarBonuses as calcHangarBonuses } from "@/game/meta/upgrades";
import type { HudState, PickupKind, RunResult, UpgradeChoice } from "@/game/types";

type Screen =
  "MENU" | "LANDING" | "SELECT" | "HANGAR" | "PLAYING" | "GAMEOVER" | "WIKI" | "ROADMAP";
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
const PROGRESS_ACCOUNT_KEY = "space_survivors_progress_account_v1";

type GooglePlayer = { email: string; playerId: string; isAdmin: boolean };

async function marketRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "No se pudo completar la operación del mercado.";
    throw new Error(error);
  }
  return payload as T;
}

function hotbarInventoryFromPilot(
  inventory: P2PInventoryItem[] | undefined,
): Record<PickupKind, number> {
  const counts: Record<PickupKind, number> = { repair: 0, magnet: 0, emp: 0 };
  for (const item of inventory ?? []) {
    if (item.isLocked || item.itemType !== "objeto") continue;
    if (item.itemId === "repair") counts.repair += item.quantity;
    else if (item.itemId === "iman" || item.itemId === "magnet") counts.magnet += item.quantity;
    else if (item.itemId === "emp") counts.emp += item.quantity;
  }
  return counts;
}

async function submitLeaderboardUpdate(input: {
  pilotId: string;
  callsign: string;
  score: number;
}): Promise<void> {
  const response = await fetch("/api/leaderboard/update", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      pilot_id: input.pilotId,
      callsign: input.callsign,
      score: input.score,
    }),
  });
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? "No se pudo actualizar la clasificación.");
  }
}

async function refreshAccountProgress(): Promise<void> {
  const response = await fetch("/api/auth/progress", {
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as {
    progress?: unknown;
    error?: string;
  } | null;
  if (!response.ok || !payload?.progress) {
    throw new Error(payload?.error ?? "No se pudo actualizar el progreso del piloto.");
  }
  ProgressStore.set(sanitize(payload.progress));
}

/** Fase del roadmap necesaria para desplegar en cada sector. Los sectores no listados están libres. */
const STAGE_PHASE_LOCK: Record<string, number> = { ash: 2, abyss: 4, omega: 6 };

function Index() {
  const [screen, setScreen] = useState<Screen>("MENU");
  const [returnScreen, setReturnScreen] = useState<Screen>("MENU");
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
  const [marketPilot, setMarketPilot] = useState<P2PPilotState | null>(null);
  const persistentInventoryRef = useRef<Record<PickupKind, number>>({
    repair: 0,
    magnet: 0,
    emp: 0,
  });
  const [marketAds, setMarketAds] = useState<P2PMyAd[]>([]);
  const [marketListings, setMarketListings] = useState<P2PPublicListing[]>([]);
  const [marketListingPage, setMarketListingPage] = useState(1);
  const [marketListingPages, setMarketListingPages] = useState(1);
  const [marketHistory, setMarketHistory] = useState<P2PHistoryOrder[]>([]);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState("");
  const [marketRefresh, setMarketRefresh] = useState(0);
  const [googlePlayer, setGooglePlayer] = useState<GooglePlayer | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [googleConnecting, setGoogleConnecting] = useState(false);
  const [googleSessionLoading, setGoogleSessionLoading] = useState(true);
  const [bossCooldowns, setBossCooldowns] = useState<Record<string, number>>({});
  const [allianceId, setAllianceId] = useState<string | null>(null);
  const [bossHelpInvite, setBossHelpInvite] = useState<{
    sessionId: string;
    hostName: string;
    bossName: string;
    world: number;
  } | null>(null);
  const [hostHelpSessionId, setHostHelpSessionId] = useState<string | null>(null);
  const [hostHelpActive, setHostHelpActive] = useState(false);
  const [helperSessionId, setHelperSessionId] = useState<string | null>(null);
  const [sharedBossState, setSharedBossState] = useState<{
    boss: { x: number; y: number; hp: number; maxHp: number; name: string };
    host: { x: number; y: number; hp: number; maxHp: number; shipId?: string };
    enemyShots: { x: number; y: number }[];
  } | null>(null);
  const [helperHp, setHelperHp] = useState(0);
  const [helperOffset, setHelperOffset] = useState({ x: 0, y: 0 });
  const hostHelpSessionRef = useRef<string | null>(null);
  const helperSessionRef = useRef<string | null>(null);
  const bossHelpSocketRef = useRef<WebSocket | null>(null);
  const helpTimeoutRef = useRef<number | null>(null);
  const bossHelpInviteRef = useRef<{
    sessionId: string;
    hostName: string;
    bossName: string;
    world: number;
  } | null>(null);
  const helperOffsetRef = useRef({ x: 0, y: 0 });
  const helperHpRef = useRef(0);
  const helperLastHitRef = useRef(0);
  const [startingMission, setStartingMission] = useState(false);
  const [turnstileOpen, setTurnstileOpen] = useState(false);
  const [turnstileVerifying, setTurnstileVerifying] = useState(false);
  const [turnstileWidgetVersion, setTurnstileWidgetVersion] = useState(0);
  const googleConnectionLockRef = useRef(false);
  const startingMissionRef = useRef(false);
  const progressSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [hangarTab, setHangarTab] = useState<HangarTab>("UPGRADES");
  const [hasVip, setHasVip] = useState(false);
  const [vipUntil, setVipUntil] = useState<number | null>(null);
  const [vipModalOpen, setVipModalOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const shipCarouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    persistentInventoryRef.current = hotbarInventoryFromPilot(marketPilot?.inventory);
  }, [marketPilot]);

  useEffect(() => {
    if (googleSessionLoading) return;
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
  }, [googleSessionLoading]);

  useEffect(() => {
    if (googleSessionLoading || !googlePlayer) {
      setAllianceId(null);
      return;
    }
    let active = true;
    void marketRequest<{ alliance: { alliance_id: string } | null }>("/api/alliance/mine")
      .then((result) => {
        if (active) setAllianceId(result.alliance?.alliance_id ?? null);
      })
      .catch((error: unknown) => {
        console.error("No se pudo consultar la alianza para la ayuda de boss:", error);
        if (active) setAllianceId(null);
      });
    return () => {
      active = false;
    };
  }, [googleSessionLoading, googlePlayer]);

  useEffect(() => {
    if (googleSessionLoading || !googlePlayer) return;
    let active = true;
    const refreshMarketState = async () => {
      try {
        const [pilot, myAds, history] = await Promise.all([
          marketRequest<P2PPilotState>("/api/market/pilot-state"),
          marketRequest<{ ads: P2PMyAd[] }>("/api/market/my-ads"),
          marketRequest<{ orders: P2PHistoryOrder[] }>("/api/market/history"),
        ]);
        if (!active) return;
        setMarketPilot(pilot);
        setMarketAds(myAds.ads);
        setMarketHistory(history.orders);
      } catch (error) {
        console.error("No se pudo actualizar el mercado automáticamente:", error);
      }
    };
    const interval = window.setInterval(() => void refreshMarketState(), 10000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [googleSessionLoading, googlePlayer]);

  useEffect(() => {
    if (googleSessionLoading) return;
    if (!googlePlayer) {
      setMarketPilot(null);
      setMarketAds([]);
      setMarketListings([]);
      setMarketHistory([]);
      setMarketLoading(false);
      setMarketError("");
      return;
    }
    let active = true;
    setMarketLoading(true);
    setMarketError("");
    void (async () => {
      try {
        const [pilot, myAds, history] = await Promise.all([
          marketRequest<P2PPilotState>("/api/market/pilot-state"),
          marketRequest<{ ads: P2PMyAd[] }>("/api/market/my-ads"),
          marketRequest<{ orders: P2PHistoryOrder[] }>("/api/market/history"),
        ]);
        if (active) {
          setMarketPilot(pilot);
          setMarketAds(myAds.ads);
          setMarketHistory(history.orders);
          await progressSaveQueueRef.current.catch(() => undefined);
          if (!active) return;
          void submitLeaderboardUpdate({
            pilotId: googlePlayer.playerId,
            callsign: profileName || pilot.callsign || "PILOTO",
            score: ProgressStore.get().stats.kills,
          }).catch((error: unknown) => {
            if (!active) return;
            console.error(
              "No se pudo actualizar la clasificación después de sincronizar el piloto:",
              error,
            );
            setNotice(
              error instanceof Error ? error.message : "No se pudo actualizar la clasificación.",
            );
          });
        }
      } catch (error) {
        if (active) {
          setMarketError(
            error instanceof Error ? error.message : "No se pudo sincronizar el mercado.",
          );
        }
      } finally {
        if (active) setMarketLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [googleSessionLoading, googlePlayer, marketRefresh, profileName]);

  const loadMarketListings = useCallback(
    async (
      page: number,
      itemType: P2PItemType | "",
      country: P2PCountry | "",
      sort: "newest" | "price_asc" | "price_desc",
    ) => {
      setMarketError("");
      try {
        const params = new URLSearchParams({ page: String(page), sort });
        if (itemType) params.set("item_type", itemType);
        if (country) params.set("country", country);
        const result = await marketRequest<{
          listings: P2PPublicListing[];
          page: number;
          pages: number;
        }>(`/api/market/listings?${params.toString()}`);
        setMarketListings(result.listings);
        setMarketListingPage(result.page);
        setMarketListingPages(result.pages);
      } catch (error) {
        setMarketError(
          error instanceof Error ? error.message : "No se pudieron cargar los anuncios.",
        );
        throw error;
      }
    },
    [],
  );

  useEffect(() => {
    let active = true;
    const errorCode = new URLSearchParams(window.location.search).get("google_error");
    const authErrors: Record<string, string> = {
      cancelled: "INICIO DE SESIÓN CANCELADO",
      invalid_response: "RESPUESTA DE GOOGLE NO VÁLIDA",
      expired: "LA SOLICITUD DE GOOGLE VENCIÓ. INTÉNTALO DE NUEVO",
      verification_failed: "NO SE PUDO VERIFICAR LA CUENTA DE GOOGLE",
      account_conflict: "EL CORREO YA ESTÁ VINCULADO A OTRA CUENTA",
    };
    if (errorCode) {
      setNotice(authErrors[errorCode] ?? "NO SE PUDO INICIAR SESIÓN CON GOOGLE");
      const returnUrl = new URL(window.location.href);
      returnUrl.searchParams.delete("google_error");
      window.history.replaceState(
        null,
        "",
        `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`,
      );
    }

    void (async () => {
      try {
        const response = await fetch("/api/auth/session", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const session = (await response.json()) as {
          authenticated?: boolean;
          email?: string;
          playerId?: string;
          isAdmin?: boolean;
          displayName?: string;
          ownedShips?: string[];
          progress?: unknown;
          error?: string;
        };
        if (!response.ok) throw new Error(session.error ?? "No se pudo recuperar la sesión.");
        if (!active) return;
        if (!session.authenticated) {
          let previousAccount: string | null = null;
          try {
            previousAccount = localStorage.getItem(PROGRESS_ACCOUNT_KEY);
          } catch {
            // El almacenamiento local puede estar deshabilitado.
          }
          if (previousAccount) {
            ProgressStore.set(defaultProgress());
          }
          setMarketPilot(null);
          setMarketAds([]);
          setGoogleSessionLoading(false);
          return;
        }
        if (
          typeof session.email !== "string" ||
          typeof session.playerId !== "string" ||
          typeof session.isAdmin !== "boolean"
        ) {
          throw new Error("La sesión de Google devolvió datos incompletos.");
        }

        const player = {
          email: session.email,
          playerId: session.playerId,
          isAdmin: session.isAdmin,
        };
        setGooglePlayer(player);
        setProfileName(session.displayName?.trim() ?? "");
        setProfileNameDraft(session.displayName?.trim() ?? "");
        let localOwner: string | null = null;
        try {
          localOwner = localStorage.getItem(PROGRESS_ACCOUNT_KEY);
        } catch (error) {
          console.warn("No se pudo leer el propietario local del progreso:", error);
        }
        const hasSavedProgress =
          session.progress !== null &&
          typeof session.progress === "object" &&
          !Array.isArray(session.progress);
        const currentProgress = ProgressStore.get();
        const accountProgress = hasSavedProgress
          ? sanitize(session.progress)
          : localOwner && localOwner !== player.playerId
            ? defaultProgress()
            : currentProgress;
        const ownedShips = Array.isArray(session.ownedShips)
          ? Array.from(
              new Set([
                "falcon",
                ...session.ownedShips.filter(
                  (shipId): shipId is string =>
                    typeof shipId === "string" && SHIPS.some((ship) => ship.id === shipId),
                ),
              ]),
            )
          : ["falcon"];
        accountProgress.ships = ownedShips;
        if (!ownedShips.includes(accountProgress.selectedShip)) {
          accountProgress.selectedShip = "falcon";
        }
        ProgressStore.set(accountProgress);
        try {
          localStorage.setItem(PROGRESS_ACCOUNT_KEY, player.playerId);
        } catch (error) {
          console.warn("No se pudo guardar localmente el propietario del progreso:", error);
        }
        if (!hasSavedProgress) {
          const saveResponse = await fetch("/api/auth/progress", {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ progress: accountProgress }),
          });
          if (!saveResponse.ok) {
            throw new Error("No se pudo guardar el progreso de esta cuenta en el servidor.");
          }
        }
        if (active) setGoogleSessionLoading(false);
      } catch (error) {
        console.error("No se pudo recuperar el perfil de Google:", error);
        if (active) {
          setNotice(error instanceof Error ? error.message : "No se pudo recuperar el perfil.");
          setGoogleSessionLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const saveProgress = useCallback(
    (next: Progress) => {
      ProgressStore.set(next);
      setProgress(next);
      if (!googlePlayer) return;
      progressSaveQueueRef.current = progressSaveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const response = await fetch("/api/auth/progress", {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ progress: next }),
          });
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          if (!response.ok) {
            throw new Error(payload?.error ?? "No se pudo guardar el progreso en el servidor.");
          }
          try {
            await submitLeaderboardUpdate({
              pilotId: googlePlayer.playerId,
              callsign: profileName || marketPilot?.callsign || "PILOTO",
              score: next.stats.kills,
            });
          } catch (error) {
            console.error(
              "No se pudo actualizar la clasificación después de guardar progreso:",
              error,
            );
            setNotice(
              error instanceof Error ? error.message : "No se pudo actualizar la clasificación.",
            );
          }
        });
      void progressSaveQueueRef.current.catch((error: unknown) => {
        setNotice(error instanceof Error ? error.message : "No se pudo guardar el progreso.");
      });
    },
    [googlePlayer, marketPilot, profileName],
  );

  // Mantiene la función de guardado actualizada sin reiniciar el motor de combate.
  const saveProgressRef = useRef(saveProgress);
  saveProgressRef.current = saveProgress;

  const publishMarketAd = async (input: P2PPublishInput) => {
    setMarketError("");
    try {
      await marketRequest<{ success: boolean }>("/api/market/publish", {
        method: "POST",
        body: JSON.stringify(input),
      });
      setMarketRefresh((version) => version + 1);
    } catch (error) {
      setMarketError(error instanceof Error ? error.message : "No se pudo publicar el anuncio.");
      throw error;
    }
  };

  const toggleMarketAd = async (adId: string) => {
    setMarketError("");
    try {
      await marketRequest<{ success: boolean }>("/api/market/toggle-ad", {
        method: "POST",
        body: JSON.stringify({ adId }),
      });
      setMarketRefresh((version) => version + 1);
    } catch (error) {
      setMarketError(error instanceof Error ? error.message : "No se pudo actualizar el anuncio.");
      throw error;
    }
  };

  const cancelMarketAd = async (adId: string) => {
    setMarketError("");
    try {
      await marketRequest<{ success: boolean }>("/api/market/cancel-ad", {
        method: "POST",
        body: JSON.stringify({ adId }),
      });
      setMarketRefresh((version) => version + 1);
    } catch (error) {
      setMarketError(error instanceof Error ? error.message : "No se pudo cancelar el anuncio.");
      throw error;
    }
  };

  const buyMarketListing = async (
    listingId: string,
    method: P2PPayMethod,
    network?: string,
  ): Promise<P2PPurchaseOrder> => {
    setMarketError("");
    try {
      const order = await marketRequest<P2PPurchaseOrder>("/api/market/buy", {
        method: "POST",
        body: JSON.stringify({ listing_id: listingId, payment_method: method, network }),
      });
      setMarketRefresh((version) => version + 1);
      return order;
    } catch (error) {
      setMarketError(error instanceof Error ? error.message : "No se pudo iniciar la compra.");
      throw error;
    }
  };

  const reportMarketPayment = async (orderId: string, reference: string, proofUrl: string) => {
    setMarketError("");
    try {
      await marketRequest<{ success: boolean }>("/api/market/report-payment", {
        method: "POST",
        body: JSON.stringify({ order_id: orderId, payment_reference: reference, payment_proof_url: proofUrl }),
      });
      setMarketRefresh((version) => version + 1);
    } catch (error) {
      setMarketError(error instanceof Error ? error.message : "No se pudo reportar el pago.");
      throw error;
    }
  };

  const releaseMarketOrder = async (orderId: string) => {
    setMarketError("");
    try {
      await marketRequest<{ success: boolean }>("/api/market/release", {
        method: "POST",
        body: JSON.stringify({ order_id: orderId }),
      });
      setMarketRefresh((version) => version + 1);
    } catch (error) {
      setMarketError(error instanceof Error ? error.message : "No se pudo liberar el artículo.");
      throw error;
    }
  };

  const openMarketDispute = async (orderId: string, reason: string, evidenceUrl: string) => {
    setMarketError("");
    try {
      await marketRequest<{ success: boolean }>("/api/market/dispute", {
        method: "POST",
        body: JSON.stringify({ order_id: orderId, reason, evidence_url: evidenceUrl }),
      });
      setMarketRefresh((version) => version + 1);
    } catch (error) {
      setMarketError(error instanceof Error ? error.message : "No se pudo abrir la disputa.");
      throw error;
    }
  };

  const cancelMarketOrder = async (orderId: string) => {
    setMarketError("");
    try {
      await marketRequest<{ success: boolean }>("/api/market/cancel", {
        method: "POST",
        body: JSON.stringify({ order_id: orderId }),
      });
      setMarketRefresh((version) => version + 1);
    } catch (error) {
      setMarketError(error instanceof Error ? error.message : "No se pudo cancelar la orden.");
      throw error;
    }
  };

  const handleGoogleSignOut = async () => {
    if (googleConnectionLockRef.current) return;
    googleConnectionLockRef.current = true;
    setGoogleConnecting(true);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("No se pudo cerrar la sesión de Google.");
      setGooglePlayer(null);
      setProfileName("");
      setProfileNameDraft("");
      setMarketPilot(null);
      setMarketAds([]);
      ProgressStore.set(defaultProgress());
      setProgress(defaultProgress());
      setSelectedShipId("falcon");
      setSelectedStageId("nova");
      setMarketRefresh((version) => version + 1);
      setScreen("MENU");
      setNotice("SESIÓN CERRADA");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo cerrar la sesión.");
    } finally {
      googleConnectionLockRef.current = false;
      setGoogleConnecting(false);
    }
  };

  const handleTurnstileToken = async (token: string) => {
    if (!token || googleConnectionLockRef.current) return;
    googleConnectionLockRef.current = true;
    setTurnstileVerifying(true);
    try {
      const response = await fetch("/api/auth/verify-turnstile", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = (await response.json().catch(() => null)) as {
        authorizationUrl?: string;
        error?: string;
      } | null;
      if (!response.ok || !payload?.authorizationUrl) {
        throw new Error(payload?.error ?? "No se pudo iniciar sesión con Google.");
      }
      const authorizationUrl = new URL(payload.authorizationUrl);
      if (authorizationUrl.origin !== "https://accounts.google.com") {
        throw new Error("El servidor devolvió una URL de autenticación no válida.");
      }
      window.location.assign(authorizationUrl.toString());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo verificar la seguridad.");
      setTurnstileWidgetVersion((version) => version + 1);
    } finally {
      googleConnectionLockRef.current = false;
      setTurnstileVerifying(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (googleConnectionLockRef.current) return;
    if (!googlePlayer) {
      setNotice("");
      setTurnstileWidgetVersion((version) => version + 1);
      setTurnstileOpen(true);
      return;
    }
    googleConnectionLockRef.current = true;
    setGoogleConnecting(true);
    try {
      if (googlePlayer) {
        const response = await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "same-origin",
        });
        if (!response.ok) throw new Error("No se pudo cerrar la sesión de Google.");
        setGooglePlayer(null);
        setMarketPilot(null);
        setMarketAds([]);
        ProgressStore.set(defaultProgress());
        setProgress(defaultProgress());
        setSelectedShipId("falcon");
        setSelectedStageId("nova");
        setMarketRefresh((version) => version + 1);
        setNotice("SESIÓN CERRADA");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo iniciar sesión con Google.");
    } finally {
      googleConnectionLockRef.current = false;
      setGoogleConnecting(false);
      window.setTimeout(() => setNotice(""), 3500);
    }
  };

  const selectedShip = SHIPS.find((ship) => ship.id === selectedShipId) ?? SHIPS[0]!;
  const selectedStage = STAGES.find((stage) => stage.id === selectedStageId) ?? STAGES[0]!;
  const latestRun: RunSummary | undefined = progress.history[0];
  const claimableCount = getSeasonClaimableCount(progress, hasVip);

  useEffect(() => {
    if (!googlePlayer) {
      setHasVip(false);
      return;
    }
    let active = true;
    void marketRequest<{ vip?: boolean; vip_until?: number | null }>("/api/alliance/mine")
      .then((result) => {
        if (active) {
          setHasVip(result.vip === true);
          setVipUntil(typeof result.vip_until === "number" ? result.vip_until : null);
        }
      })
      .catch(() => {
        if (active) {
          setHasVip(false);
          setVipUntil(null);
        }
      });
    return () => {
      active = false;
    };
  }, [googlePlayer]);

  useEffect(() => {
    if (!allianceId || !googlePlayer) return;
    const connect = (sessionId?: string) => {
      const url = new URL("/api/boss/help/ws", window.location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.searchParams.set("alliance_id", allianceId);
      if (sessionId) url.searchParams.set("session_id", sessionId);
      const socket = new WebSocket(url);
      if (sessionId) bossHelpSocketRef.current = socket;
      socket.addEventListener("message", (event) => {
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(String(event.data)) as Record<string, unknown>;
        } catch {
          return;
        }
        if (message["type"] === "boss_help_invite" && typeof message["sessionId"] === "string") {
          const invite = {
            sessionId: message["sessionId"],
            hostName: typeof message["hostName"] === "string" ? message["hostName"] : "PILOTO",
            bossName: typeof message["bossName"] === "string" ? message["bossName"] : "BOSS",
            world: typeof message["world"] === "number" ? message["world"] : 1,
          };
          bossHelpInviteRef.current = invite;
          setBossHelpInvite(invite);
        } else if (
          message["type"] === "joined" &&
          message["hostPilotId"] === googlePlayer.playerId
        ) {
          if (helpTimeoutRef.current !== null) {
            window.clearTimeout(helpTimeoutRef.current);
            helpTimeoutRef.current = null;
          }
          setHostHelpSessionId(
            typeof message["sessionId"] === "string" ? message["sessionId"] : null,
          );
          setHostHelpActive(true);
          engineRef.current?.resume();
        } else if (
          message["type"] === "joined" &&
          typeof message["sessionId"] === "string" &&
          bossHelpInviteRef.current?.sessionId === message["sessionId"]
        ) {
          bossHelpInviteRef.current = null;
          setBossHelpInvite(null);
          setNotice("Ya alguien se unió al combate de boss.");
        } else if (message["type"] === "helper-fire") {
          engineRef.current?.applyHelperShot(
            typeof message["damage"] === "number" ? message["damage"] : 35,
          );
        } else if (message["type"] === "helper-position") {
          const helper = message["helper"];
          if (helper && typeof helper === "object") {
            const data = helper as { x?: number; y?: number; shipId?: string };
            if (typeof data.x === "number" && typeof data.y === "number") {
              engineRef.current?.setHelperPosition(data.x, data.y, data.shipId);
            }
          }
        } else if (message["type"] === "state") {
          const boss = message["boss"];
          const host = message["host"];
          if (boss && typeof boss === "object" && host && typeof host === "object") {
            setSharedBossState({
              boss: boss as { x: number; y: number; hp: number; maxHp: number; name: string },
              host: host as {
                x: number;
                y: number;
                hp: number;
                maxHp: number;
                shipId?: string;
              },
              enemyShots: Array.isArray(message["enemyShots"])
                ? (message["enemyShots"] as { x: number; y: number }[])
                : [],
            });
            if (
              message["sessionId"] === helperSessionId &&
              Array.isArray(message["enemyShots"]) &&
              helperHpRef.current > 0
            ) {
              const hostState = host as { x: number; y: number };
              const helperX = hostState.x + helperOffsetRef.current.x;
              const helperY = hostState.y + helperOffsetRef.current.y;
              const collided = (message["enemyShots"] as { x: number; y: number }[]).some(
                (shot) =>
                  Number.isFinite(shot.x) &&
                  Number.isFinite(shot.y) &&
                  Math.hypot(shot.x - helperX, shot.y - helperY) < 35,
              );
              if (collided && Date.now() - helperLastHitRef.current > 700) {
                helperLastHitRef.current = Date.now();
                helperHpRef.current = Math.max(0, helperHpRef.current - 20);
                setHelperHp(helperHpRef.current);
                if (helperHpRef.current === 0) {
                  helperHpRef.current = -1;
                  setNotice("NAVE AYUDANTE DESTRUIDA. SALISTE DEL COMBATE.");
                  void leaveBossHelp();
                }
              }
            }
          }
        } else if (
          ["expired", "left", "completed"].includes(String(message["type"])) &&
          (message["sessionId"] === hostHelpSessionRef.current ||
            message["sessionId"] === helperSessionId)
        ) {
          const expiredHostSession = message["sessionId"] === hostHelpSessionRef.current;
          if (expiredHostSession) {
            if (helpTimeoutRef.current !== null) {
              window.clearTimeout(helpTimeoutRef.current);
              helpTimeoutRef.current = null;
            }
            const endedSessionId = hostHelpSessionRef.current;
            hostHelpSessionRef.current = null;
            setHostHelpSessionId(null);
            setHostHelpActive(false);
            engineRef.current?.resume();
            if (message["type"] === "expired" && endedSessionId) {
              void marketRequest("/api/boss/help-leave", {
                method: "POST",
                body: JSON.stringify({ session_id: endedSessionId }),
              }).catch((error: unknown) =>
                console.error("No se pudo cerrar la solicitud de ayuda expirada:", error),
              );
            }
          }
          if (message["sessionId"] === helperSessionId) {
            if (message["type"] === "completed") {
              void marketRequest<{ progress: unknown }>("/api/auth/progress")
                .then(({ progress: savedProgress }) => {
                  const next = sanitize(savedProgress);
                  ProgressStore.set(next);
                  setProgress(next);
                  setMarketRefresh((version) => version + 1);
                })
                .catch((error: unknown) =>
                  console.error("No se pudo actualizar la recompensa del ayudante:", error),
                );
            }
            helperSessionRef.current = null;
            setHelperSessionId(null);
            setSharedBossState(null);
          }
        }
      });
      return socket;
    };

    const notificationSocket = connect();
    const participantSession = screen === "PLAYING" ? (hostHelpSessionId ?? helperSessionId) : null;
    const participantSocket = participantSession ? connect(participantSession) : null;
    return () => {
      notificationSocket.close();
      participantSocket?.close();
      if (bossHelpSocketRef.current === participantSocket) bossHelpSocketRef.current = null;
    };
  }, [allianceId, googlePlayer, screen, hostHelpSessionId, helperSessionId]);

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
      hangar: calcHangarBonuses(progress.upgrades, progress.modules),
      durationSec: 1200,
      isEndless: gameMode === "ENDLESS",
      bossCooldowns,
      inventory: persistentInventoryRef.current,
      vipActive: hasVip,
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
            saveProgressRef.current(outcome.progress);
            setRunCredits(outcome.credits);
            setUnlockedSectors(outcome.newStages);
          }
          setRunResult(result);
          setChoices([]);
          setPaused(false);
          setScreen("GAMEOVER");
        },
        onPauseChange: setPaused,
        onBossStarted: async (bossId) => {
          const result = await marketRequest<BossAttempt>("/api/boss/start", {
            method: "POST",
            body: JSON.stringify({ boss_id: bossId }),
          });
          return result;
        },
        onBossDefeated: async (bossId, token, seed, outcome, evidence) => {
          try {
            const proof = await createBossCombatProof(seed, evidence);
            const claim = await marketRequest<{
              success: boolean;
              bossId: string;
              obsidian: number;
              rewards: { itemType: "nave" | "objeto"; itemName: string }[];
              helperReward: { credits: number; obsidian: number } | null;
            }>("/api/boss/claim", {
              method: "POST",
              body: JSON.stringify({
                boss_id: bossId,
                token,
                result: outcome,
                ...evidence,
                proof,
                ...(hostHelpSessionRef.current
                  ? { help_session_id: hostHelpSessionRef.current }
                  : {}),
              }),
            });
            setMarketRefresh((version) => version + 1);
            if (outcome === "victory") {
              const rewardLines = [
                `+${claim.obsidian} OBS`,
                ...claim.rewards.map((reward) => reward.itemName),
                ...(claim.helperReward
                  ? [
                      `+${claim.helperReward.credits} CR · +${claim.helperReward.obsidian} OBS por ayuda`,
                    ]
                  : []),
              ];
              engineRef.current?.banner("JEFE DERROTADO", rewardLines.join(" · "), "good");
              const shipDrop = claim.rewards.find((reward) => reward.itemType === "nave");
              if (shipDrop) {
                void fetch("/api/chat/event", {
                  method: "POST",
                  credentials: "same-origin",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    type: "boss_kill",
                    bossName: BOSSES.find((boss) => boss.id === bossId)?.name ?? bossId,
                    shipName: shipDrop.itemName,
                  }),
                }).catch((error: unknown) => {
                  console.error("No se pudo anunciar la nave obtenida en el chat:", error);
                });
              }
            } else {
              engineRef.current?.banner("COMBATE FINALIZADO", "Sin recompensas.", "info");
            }
          } catch (error: unknown) {
            console.error("No se pudo validar el combate del boss:", error);
            setNotice(
              error instanceof Error ? error.message : "No se pudo validar el combate del boss.",
            );
          }
        },
        onItemCollected: (kind) => {
          void marketRequest<{ success: boolean }>("/api/inventory/collect", {
            method: "POST",
            body: JSON.stringify({ kind }),
          })
            .then(() => setMarketRefresh((version) => version + 1))
            .catch((error: unknown) => {
              const current = engineRef.current;
              if (current) {
                current.inventory[kind] = Math.max(0, current.inventory[kind] - 1);
                setHud(current.getHud());
              }
              setNotice(
                error instanceof Error ? error.message : "No se pudo guardar el objeto recogido.",
              );
            });
        },
        onChatEvent: (chatEvent) => {
          void fetch("/api/chat/event", {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(chatEvent),
          })
            .then(async (response) => {
              if (!response.ok) {
                const payload = (await response.json().catch(() => null)) as {
                  error?: string;
                } | null;
                throw new Error(payload?.error ?? "No se pudo publicar el evento en el chat.");
              }
            })
            .catch((error: unknown) => {
              console.error("No se pudo publicar un evento del juego en el chat:", error);
              setNotice(
                error instanceof Error
                  ? error.message
                  : "No se pudo publicar el evento en el chat.",
              );
            });
        },
      },
    });
    engineRef.current = engine;
    engine.start();
    if (helperSessionRef.current) engine.pause();
    const hudTimer = window.setInterval(() => {
      setHud(engine.getHud());
      const sessionId = hostHelpSessionRef.current;
      const state = engine.getBossHelpState();
      const socket = bossHelpSocketRef.current;
      if (sessionId && state && socket?.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "state",
            sessionId,
            boss: {
              x: state.bossX,
              y: state.bossY,
              hp: state.bossHp,
              maxHp: state.bossMaxHp,
              name: state.bossName,
            },
            host: {
              x: state.hostX,
              y: state.hostY,
              hp: state.hostHp,
              maxHp: state.hostMaxHp,
              shipId: selectedShip.id,
            },
            enemyShots: state.enemyShots,
          }),
        );
      }
    }, 100);

    return () => {
      window.clearInterval(hudTimer);
      engine.stop();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [screen, selectedShip, selectedStage, progress.upgrades, gameMode, bossCooldowns]);

  useEffect(() => {
    if (googleSessionLoading || googlePlayer) return;
    // La Wiki y el Roadmap son páginas públicas; no requieren iniciar sesión.
    if (screen !== "MENU" && screen !== "LANDING" && screen !== "WIKI" && screen !== "ROADMAP") {
      setScreen("MENU");
      setNotice("INICIA SESIÓN CON GOOGLE PARA ACCEDER AL HANGAR Y DESPLEGAR");
    }
  }, [googleSessionLoading, googlePlayer, screen]);

  const requireGoogleSession = () => {
    if (googleSessionLoading) {
      setNotice("VERIFICANDO SESIÓN. ESPERA UN MOMENTO.");
      return false;
    }
    if (!googlePlayer) {
      setNotice("INICIA SESIÓN CON GOOGLE PARA ACCEDER AL HANGAR Y DESPLEGAR");
      return false;
    }
    return true;
  };

  const chooseShip = (id: string) => {
    if (
      !progress.ships.includes(id) ||
      marketLoading ||
      marketAds.some((ad) => ad.itemId === id && ad.status !== "CANCELADO")
    )
      return;
    setSelectedShipId(id);
    saveProgress({ ...progress, selectedShip: id });
  };

  const chooseStage = (id: string) => {
    if (!progress.stages.includes(id) || STAGE_PHASE_LOCK[id] !== undefined) return;
    setSelectedStageId(id);
    saveProgress({ ...progress, selectedStage: id });
  };

  const activateInventoryItem = async (kind: PickupKind) => {
    const engine = engineRef.current;
    if (!engine || engine.inventory[kind] <= 0) return;
    try {
      await marketRequest<{ success: boolean }>("/api/inventory/use", {
        method: "POST",
        body: JSON.stringify({ kind }),
      });
      engine.inventory[kind] = Math.max(0, engine.inventory[kind] - 1);
      if (engine.useItem(kind, true)) setHud(engine.getHud());
      setMarketRefresh((version) => version + 1);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo usar el objeto.");
    }
  };

  const startMission = async () => {
    if (!requireGoogleSession()) return;
    if (startingMissionRef.current) return;
    startingMissionRef.current = true;
    setStartingMission(true);
    try {
      // Confirmar el VIP directamente con el servidor antes de crear el motor.
      // Evita iniciar una partida con el valor inicial/stale de React (false).
      const vipStatus = await marketRequest<{ vip?: boolean; vip_until?: number | null }>(
        "/api/alliance/mine",
      );
      const vipIsActive = vipStatus.vip === true;
      setHasVip(vipIsActive);
      setVipUntil(typeof vipStatus.vip_until === "number" ? vipStatus.vip_until : null);

      const { cooldowns } = await marketRequest<{ cooldowns: Record<string, number> }>(
        "/api/bosses/status",
      );
      setBossCooldowns(cooldowns);
      Audio.init();
      setHud(null);
      setChoices([]);
      setPaused(false);
      setRunResult(null);
      setScreen("PLAYING");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "No se pudo consultar el cooldown de bosses.",
      );
    } finally {
      startingMissionRef.current = false;
      setStartingMission(false);
    }
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

  const chooseModule = (upgradeId: string, moduleId: string) => {
    const outcome = chooseUpgradeModule(progress, upgradeId, moduleId);
    if (!outcome.ok) {
      setNotice(outcome.reason);
      window.setTimeout(() => setNotice(""), 1800);
      return;
    }
    saveProgress(outcome.progress);
    setNotice("MÓDULO INSTALADO");
    window.setTimeout(() => setNotice(""), 1800);
  };

  const flashNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 1800);
  };

  const returnToMenu = () => {
    const helpSessionId = hostHelpSessionRef.current;
    if (helpSessionId) {
      if (helpTimeoutRef.current !== null) {
        window.clearTimeout(helpTimeoutRef.current);
        helpTimeoutRef.current = null;
      }
      void marketRequest("/api/boss/help-leave", {
        method: "POST",
        body: JSON.stringify({ session_id: helpSessionId }),
      }).catch((error: unknown) =>
        console.error("No se pudo cerrar la ayuda al terminar la misión:", error),
      );
      hostHelpSessionRef.current = null;
      setHostHelpSessionId(null);
      setHostHelpActive(false);
    }
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

  const requestBossHelp = async () => {
    const state = engineRef.current?.getBossHelpState();
    const bossWorld = state ? BOSSES.findIndex((entry) => entry.id === state.bossId) + 1 : 0;
    if (!state || bossWorld < 1 || hostHelpSessionRef.current) return;
    engineRef.current?.pause();
    try {
      const result = await marketRequest<{ session_id: string }>("/api/boss/help-request", {
        method: "POST",
        body: JSON.stringify({ boss_id: state.bossId, world: bossWorld }),
      });
      hostHelpSessionRef.current = result.session_id;
      setHostHelpSessionId(result.session_id);
      setHostHelpActive(false);
      helpTimeoutRef.current = window.setTimeout(() => {
        void marketRequest("/api/boss/help-leave", {
          method: "POST",
          body: JSON.stringify({ session_id: result.session_id }),
        })
          .catch((error: unknown) =>
            console.error("No se pudo expirar la solicitud de ayuda:", error),
          )
          .finally(() => {
            hostHelpSessionRef.current = null;
            setHostHelpSessionId(null);
            setHostHelpActive(false);
            engineRef.current?.resume();
          });
      }, 60_000);
      setNotice("SOLICITUD ENVIADA. EL COMBATE SE REANUDARÁ AL UNIRSE UN ALIADO O EXPIRAR.");
    } catch (error) {
      engineRef.current?.resume();
      setNotice(error instanceof Error ? error.message : "No se pudo pedir ayuda.");
    }
  };

  const joinBossHelp = async () => {
    if (!bossHelpInvite) return;
    try {
      const result = await marketRequest<{ session_id: string }>("/api/boss/help-join", {
        method: "POST",
        body: JSON.stringify({ session_id: bossHelpInvite.sessionId }),
      });
      engineRef.current?.pause();
      setHelperOffset({ x: 60, y: 0 });
      helperOffsetRef.current = { x: 60, y: 0 };
      helperHpRef.current = selectedShip.hp;
      helperLastHitRef.current = 0;
      setHelperHp(selectedShip.hp);
      helperSessionRef.current = result.session_id;
      setHelperSessionId(result.session_id);
      bossHelpInviteRef.current = null;
      setBossHelpInvite(null);
      setScreen("PLAYING");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo unir al combate.");
      bossHelpInviteRef.current = null;
      setBossHelpInvite(null);
    }
  };

  const dismissBossHelpInvite = () => {
    bossHelpInviteRef.current = null;
    setBossHelpInvite(null);
  };

  const moveHelper = (dx: number, dy: number) => {
    const next = {
      x: Math.max(-100, Math.min(100, helperOffset.x + dx)),
      y: Math.max(-100, Math.min(100, helperOffset.y + dy)),
    };
    helperOffsetRef.current = next;
    setHelperOffset(next);
    const socket = bossHelpSocketRef.current;
    if (socket?.readyState === WebSocket.OPEN && helperSessionId) {
      socket.send(JSON.stringify({ type: "move", sessionId: helperSessionId, ...next }));
    }
  };

  const fireHelperShot = () => {
    if (bossHelpSocketRef.current?.readyState === WebSocket.OPEN && helperSessionId) {
      bossHelpSocketRef.current.send(JSON.stringify({ type: "fire", sessionId: helperSessionId }));
    }
  };

  const leaveBossHelp = async () => {
    if (!helperSessionId) return;
    try {
      await marketRequest("/api/boss/help-leave", {
        method: "POST",
        body: JSON.stringify({ session_id: helperSessionId }),
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo salir del combate.");
    } finally {
      helperSessionRef.current = null;
      setHelperSessionId(null);
      helperHpRef.current = 0;
      setHelperHp(0);
      setSharedBossState(null);
      engineRef.current?.resume();
    }
  };

  const cancelBossHelpRequest = async () => {
    const sessionId = hostHelpSessionRef.current;
    if (!sessionId) return;
    try {
      await marketRequest("/api/boss/help-leave", {
        method: "POST",
        body: JSON.stringify({ session_id: sessionId }),
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo cancelar la solicitud.");
      return;
    }
    if (helpTimeoutRef.current !== null) {
      window.clearTimeout(helpTimeoutRef.current);
      helpTimeoutRef.current = null;
    }
    hostHelpSessionRef.current = null;
    setHostHelpSessionId(null);
    engineRef.current?.resume();
  };

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
        <Hotbar inventory={hud?.inventory} onUse={(kind) => void activateInventoryItem(kind)} />
        <CombatStatsOverlay stats={hud?.playerStats} />
        <BoostButton ready={hud?.boostReady ?? 1} />
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
              {allianceId && !helperSessionId ? (
                <div className="mt-3 flex justify-center">
                  {hostHelpSessionId ? (
                    hostHelpActive ? (
                      <span className="pointer-events-auto border border-cyan-300/50 bg-cyan-950/70 px-3 py-2 text-[9px] uppercase tracking-widest text-cyan-100">
                        ALIADO EN COMBATE
                      </span>
                    ) : (
                      <Button
                        className="pointer-events-auto border border-amber-300/60 bg-amber-950/80 text-amber-100"
                        onClick={() => void cancelBossHelpRequest()}
                      >
                        ESPERANDO ALIADO · CANCELAR
                      </Button>
                    )
                  ) : (
                    <Button
                      className="pointer-events-auto border border-fuchsia-300/70 bg-fuchsia-950/85 font-arcade text-xs text-fuchsia-100 shadow-[0_0_18px_#ff4df055]"
                      onClick={() => void requestBossHelp()}
                    >
                      AYUDA!
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {bossHelpInvite ? (
          <div className="absolute bottom-24 left-1/2 z-40 w-[min(92%,420px)] -translate-x-1/2 border border-fuchsia-300/60 bg-[#100b20]/95 p-4 shadow-[0_0_30px_#ff4df044]">
            <p className="font-arcade text-[10px] text-fuchsia-100">
              {bossHelpInvite.hostName} PIDE AYUDA
            </p>
            <p className="mt-2 text-xs text-white/75">
              {bossHelpInvite.bossName} · MUNDO {bossHelpInvite.world}
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                className="flex-1 bg-fuchsia-700 text-white"
                onClick={() => void joinBossHelp()}
              >
                UNIRSE
              </Button>
              <Button
                variant="outline"
                className="border-white/20 text-white/70"
                onClick={dismissBossHelpInvite}
              >
                CERRAR
              </Button>
            </div>
          </div>
        ) : null}

        {helperSessionId ? (
          <div className="absolute inset-0 z-30 grid place-items-center bg-[#070814]/95 p-4">
            <section className="w-full max-w-xl border border-fuchsia-300/50 bg-[#100b20]/95 p-5 shadow-[0_0_35px_#ff4df033]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-arcade text-xs text-fuchsia-100">COMBATE DE ALIANZA</p>
                  <p className="mt-2 text-xs uppercase tracking-widest text-white/65">
                    Tú: ayudante · {Math.ceil(helperHp)} PS · Host:{" "}
                    {sharedBossState ? `${Math.ceil(sharedBossState.host.hp)} PS` : "conectando"}
                  </p>
                  <div className="mt-2 max-w-48">
                    <Meter
                      value={(helperHp / Math.max(1, selectedShip.hp)) * 100}
                      color="bg-fuchsia-500"
                    />
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="border-white/25 text-white"
                  onClick={() => void leaveBossHelp()}
                >
                  SALIR
                </Button>
              </div>
              <div className="mt-6 border border-fuchsia-400/20 bg-black/40 p-4">
                <div className="mb-2 flex justify-between text-[10px] uppercase text-fuchsia-100">
                  <span>{sharedBossState?.boss.name ?? bossHelpInvite?.bossName ?? "BOSS"}</span>
                  <span>
                    {sharedBossState
                      ? `${Math.ceil(sharedBossState.boss.hp)} / ${Math.ceil(sharedBossState.boss.maxHp)} PS`
                      : "SINCRONIZANDO"}
                  </span>
                </div>
                <Meter
                  value={
                    sharedBossState
                      ? (sharedBossState.boss.hp / Math.max(1, sharedBossState.boss.maxHp)) * 100
                      : 100
                  }
                  color="bg-[#ff0055]"
                />
                <div className="relative mt-5 h-40 overflow-hidden border border-white/10 bg-[radial-gradient(ellipse_at_center,_#34123a_0%,_#080812_70%)]">
                  <span
                    className="absolute -translate-x-1/2 -translate-y-1/2 text-3xl text-[#ff0055] drop-shadow-[0_0_14px_#ff0055]"
                    style={{
                      left: `${sharedBossState ? Math.max(15, Math.min(85, 30 + (sharedBossState.boss.x - sharedBossState.host.x) / 20)) : 50}%`,
                      top: `${sharedBossState ? Math.max(20, Math.min(75, 35 + (sharedBossState.boss.y - sharedBossState.host.y) / 20)) : 35}%`,
                    }}
                  >
                    ✦
                  </span>
                  {sharedBossState?.enemyShots.map((shot, index) => (
                    <span
                      key={index}
                      className="absolute size-1.5 rounded-full bg-[#ffb84d] shadow-[0_0_8px_#ffb84d]"
                      style={{
                        left: `${Math.max(8, Math.min(92, 30 + (shot.x - sharedBossState.host.x) / 20))}%`,
                        top: `${Math.max(10, Math.min(90, 35 + (shot.y - sharedBossState.host.y) / 20))}%`,
                      }}
                    />
                  ))}
                  <img
                    src={spriteUrl(
                      SHIPS.find((ship) => ship.id === sharedBossState?.host.shipId)?.sprite ??
                        SHIPS[0]!.sprite,
                    )}
                    alt="Nave host"
                    className="absolute left-[30%] top-[70%] h-10 w-10 -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-[0_0_10px_#00f0ff]"
                  />
                  <img
                    src={spriteUrl(selectedShip.sprite)}
                    alt="Nave ayudante"
                    className="absolute h-10 w-10 object-contain drop-shadow-[0_0_10px_#ff4df0]"
                    style={{
                      left: `${50 + helperOffset.x / 4}%`,
                      top: `${70 + helperOffset.y / 4}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] uppercase tracking-widest text-cyan-100">
                    Nave del host ·{" "}
                    {sharedBossState ? `${Math.ceil(sharedBossState.host.hp)} PS` : "—"}
                  </span>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  aria-label="Mover arriba"
                  onClick={() => moveHelper(0, -20)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="outline"
                  aria-label="Mover izquierda"
                  onClick={() => moveHelper(-20, 0)}
                >
                  <ArrowLeft />
                </Button>
                <Button
                  variant="outline"
                  aria-label="Mover abajo"
                  onClick={() => moveHelper(0, 20)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  variant="outline"
                  aria-label="Mover derecha"
                  onClick={() => moveHelper(20, 0)}
                >
                  <ArrowRight />
                </Button>
                <Button className="ml-2 bg-fuchsia-700 text-white" onClick={fireHelperShot}>
                  DISPARAR
                </Button>
              </div>
            </section>
          </div>
        ) : null}

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
            {hostHelpSessionId && !hostHelpActive ? (
              <>
                <p className="mb-7 text-center text-xs uppercase tracking-[0.16em] text-white/55">
                  Esperando a un aliado. La pausa se cancelará automáticamente en 60 segundos.
                </p>
                <Button
                  className="font-arcade h-12 w-full rounded-none bg-amber-700 text-[9px] uppercase tracking-[0.08em] text-white hover:bg-amber-600"
                  onClick={() => void cancelBossHelpRequest()}
                >
                  Cancelar solicitud y continuar
                </Button>
              </>
            ) : (
              <>
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
              </>
            )}
          </Overlay>
        ) : null}
      </main>
    );
  }

  return (
    <main className="relative min-h-dvh overflow-x-clip bg-[#070814] font-pixel text-white selection:bg-[#00f0ff]/30">
      <AnnouncementTicker className="relative z-30" />
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
          {screen !== "GAMEOVER" ? (
            <nav aria-label="Secciones principales" className="flex items-center gap-1.5 sm:gap-2">
              {(["WIKI", "ROADMAP"] as const).map((item) => {
                const active = screen === item;
                return (
                  <button
                    key={item}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    onClick={() => {
                      if (screen !== "WIKI" && screen !== "ROADMAP") setReturnScreen(screen);
                      setScreen(item);
                    }}
                    className={`font-arcade border px-2.5 py-2 text-[8px] uppercase tracking-widest transition sm:px-4 sm:text-[9px] ${
                      active
                        ? "border-cyan-300/70 bg-cyan-300/15 text-cyan-100 shadow-[0_0_14px_#00f0ff33]"
                        : "border-cyan-500/25 bg-[#0b0d1c]/70 text-white/60 hover:text-cyan-100"
                    }`}
                  >
                    {item}
                  </button>
                );
              })}
            </nav>
          ) : null}
          <div className="flex items-center gap-2 sm:gap-5">
            {screen !== "MENU" && screen !== "LANDING" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setAdminOpen(false);
                  setVipModalOpen(false);
                  setScreen("LANDING");
                }}
                title="Volver a la página principal y los rankings"
                className="font-arcade h-9 border-cyan-400/40 bg-cyan-400/10 px-3 text-[8px] uppercase tracking-wider text-cyan-200 hover:bg-cyan-400/20 hover:text-cyan-100"
              >
                <Crosshair className="size-3.5" />
                <span className="hidden sm:inline">PÁGINA PRINCIPAL</span>
                <span className="sm:hidden">INICIO</span>
              </Button>
            ) : null}
            {googlePlayer ? (
              <span className="font-arcade flex flex-wrap items-center gap-1 text-[7px] uppercase tracking-widest text-[#ffe600] sm:gap-2 sm:text-[8px]">
                <span className="size-2 bg-[#ffe600] shadow-[0_0_9px_rgba(255,230,0,0.85)]" />{" "}
                <span className="font-black text-[#ffe600] [text-shadow:0_0_9px_rgba(255,230,0,0.5)]">{progress.credits.toLocaleString()} CR</span>
                <span className="ml-2 inline-flex items-center gap-1 font-black text-[#df4dff] [text-shadow:0_0_9px_rgba(223,77,255,0.5)]">
                  <Gem className="size-3" />
                  {marketPilot ? marketPilot.obsidian.toLocaleString() : "--"} OBS
                </span>
                <TicketBalance />
              </span>
            ) : null}
            {screen === "MENU" &&
            googlePlayer?.isAdmin &&
            googlePlayer.email === "emprendedora.onlinevee@gmail.com" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAdminOpen(true)}
                title="Panel de administración"
                className="font-arcade h-9 border-rose-400/40 bg-rose-400/10 px-3 text-[8px] uppercase tracking-wider text-rose-300 hover:bg-rose-400/20 hover:text-rose-200"
              >
                ADMIN
              </Button>
            ) : null}
            {adminOpen && googlePlayer?.isAdmin ? (
              <AdminPanel onClose={() => setAdminOpen(false)} />
            ) : null}
            {screen === "MENU" || screen === "LANDING" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (googlePlayer && screen === "LANDING") {
                    setScreen("MENU");
                  } else if (googlePlayer) {
                    setHangarTab("PROFILE");
                    setScreen("HANGAR");
                  } else {
                    void handleGoogleSignIn();
                  }
                }}
                disabled={googleConnecting}
                title={googlePlayer ? "Abrir perfil del piloto" : "Iniciar sesión con Google"}
                className="font-arcade h-9 border-amber-400/45 bg-amber-400/10 px-3 text-[8px] uppercase tracking-wider text-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.14)] hover:bg-amber-400/15 hover:text-amber-100 hover:shadow-[0_0_16px_rgba(251,191,36,0.22)]"
              >
                <Wallet className="size-3.5" />
                <span className="flex flex-col items-start leading-tight">
                  <span>
                    {googleConnecting
                      ? "CONECTANDO..."
                      : googlePlayer
                        ? profileName || "COMPLETAR PERFIL"
                        : "INICIAR SESIÓN CON GOOGLE"}
                  </span>
                  {googlePlayer ? (
                    <span className="mt-1 text-[7px] normal-case tracking-normal text-cyan-200/75">
                      PERFIL DEL PILOTO
                    </span>
                  ) : null}
                </span>
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
        {screen === "WIKI" || screen === "ROADMAP" ? (
          <>
            {screen === "WIKI" ? (
              <WikiPage onClose={() => setScreen(returnScreen)} />
            ) : (
              <RoadmapRiver
                isOpen
                onClose={() => setScreen(returnScreen)}
                onSelectStage={(stageId) => chooseStage(stageId)}
              />
            )}
          </>
        ) : null}
        {notice ? (
          <p
            role="status"
            aria-live="polite"
            className="mx-auto w-full max-w-[1500px] px-4 pt-2 text-center text-[10px] uppercase tracking-widest text-cyan-200 sm:px-7"
          >
            {notice}
          </p>
        ) : null}
        {turnstileOpen ? (
          <div
            className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"
            onClick={() => {
              if (!turnstileVerifying) setTurnstileOpen(false);
            }}
          >
            <section
              aria-labelledby="turnstile-dialog-title"
              aria-modal="true"
              className="w-full max-w-sm border border-cyan-400/30 bg-[#0f172a] p-5 shadow-[0_0_50px_#00f0ff20]"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <h2
                className="text-center text-xs font-bold uppercase tracking-[0.16em] text-cyan-100"
                id="turnstile-dialog-title"
              >
                Verificación anti-bot
              </h2>
              <p className="mt-2 text-center text-[10px] text-slate-400">
                Completa la verificación para continuar con Google.
              </p>
              <div className="mt-5">
                {turnstileVerifying ? (
                  <p className="py-5 text-center text-xs text-cyan-200">Verificando…</p>
                ) : (
                  <TurnstileWidget
                    key={turnstileWidgetVersion}
                    onToken={(token) => void handleTurnstileToken(token)}
                  />
                )}
              </div>
              <button
                className="mt-4 w-full border border-white/15 px-3 py-2 text-[10px] uppercase tracking-wider text-slate-300 hover:bg-white/5 disabled:opacity-50"
                disabled={turnstileVerifying}
                onClick={() => setTurnstileOpen(false)}
                type="button"
              >
                Cancelar
              </button>
            </section>
          </div>
        ) : null}

        {googlePlayer ? (
          <VipModal
            open={vipModalOpen}
            onClose={() => setVipModalOpen(false)}
            vipUntil={vipUntil}
          />
        ) : null}

        {screen === "MENU" && googlePlayer ? (
          <section className="min-w-0 flex-1 py-8 sm:py-12">
            <PilotHub
              pilotName={
                profileName || marketPilot?.callsign || googlePlayer.email.split("@")[0] || "PILOTO"
              }
              pilotId={googlePlayer.playerId}
              vipActive={hasVip}
              runs={progress.stats.runs}
              kills={progress.stats.kills}
              season={progress.season}
              shipsCount={progress.ships.length}
              selectedShip={selectedShip}
              selectedStage={selectedStage}
              allianceTag={null}
              onDeploy={() => {
                if (requireGoogleSession()) setScreen("SELECT");
              }}
              onOpenHangar={() => {
                setHangarTab("UPGRADES");
                setScreen("HANGAR");
              }}
              onOpenMissions={() => {
                setHangarTab("MISSIONS");
                setScreen("HANGAR");
              }}
              onOpenAlliance={() => {
                setHangarTab("ALLIANCE");
                setScreen("HANGAR");
              }}
              onOpenMarket={() => {
                setHangarTab("MARKET");
                setScreen("HANGAR");
              }}
              onOpenProfile={() => {
                setHangarTab("PROFILE");
                setScreen("HANGAR");
              }}
              onOpenVip={() => setVipModalOpen(true)}
            />
          </section>
        ) : null}

        {(screen === "MENU" && !googlePlayer) || screen === "LANDING" ? (
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
              <div className="mt-7 flex flex-col gap-3">
                <Button
                  onClick={() => {
                    setReturnScreen("MENU");
                    setScreen("WIKI");
                  }}
                  title="Abrir la wiki"
                  className="font-arcade h-9 w-40 rounded-none border border-cyan-200 bg-[#00f0ff] px-2 text-[9px] uppercase tracking-[0.06em] text-[#070814] shadow-[0_0_20px_#00f0ff40] hover:bg-cyan-200"
                >
                  WIKI
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
                    <MenuHeroShip ship={SHIPS[0]!} />
                  </div>
                  <div className="absolute bottom-4 left-4 text-[9px] uppercase leading-5 tracking-[0.16em] text-cyan-100/55">
                    NAVE DE EXHIBICIÓN
                    <br />
                    <span className="text-white">HALCÓN NOVA</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="w-full lg:col-span-2">
              <Leaderboard />
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
                    const listed = marketAds.some(
                      (ad) => ad.itemId === ship.id && ad.status !== "CANCELADO",
                    );
                    const owned = progress.ships.includes(ship.id) && !listed;
                    const selected = selectedShipId === ship.id;
                    return (
                      <button
                        key={ship.id}
                        type="button"
                        disabled={!owned || marketLoading}
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
                          ) : listed ? (
                            <Badge
                              variant="outline"
                              className="rounded-none border-[#ff0055]/35 text-[9px] text-[#ff8aa9]"
                            >
                              <LockKeyhole className="mr-1 size-3" /> EN MERCADO
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
                    const phaseLock = STAGE_PHASE_LOCK[stage.id];
                    const unlocked = progress.stages.includes(stage.id) && phaseLock === undefined;
                    const active = selectedStageId === stage.id;
                    return (
                      <button
                        key={stage.id}
                        type="button"
                        disabled={!unlocked}
                        onClick={() => chooseStage(stage.id)}
                        className={`flex w-full items-center gap-4 border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${active ? "border-[#ff0055]/60 bg-[#ff0055]/[0.07]" : "border-white/10 bg-white/[0.025] hover:border-white/25"} ${!unlocked ? "cursor-not-allowed opacity-40" : ""}`}
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
                          <span
                            className={`mt-1 block uppercase tracking-wider ${
                              phaseLock !== undefined
                                ? "text-xs font-semibold text-amber-300"
                                : "text-[9px] text-white/40"
                            }`}
                          >
                            {phaseLock !== undefined
                              ? `🔒 DESPLIEGUE EN FASE ${phaseLock}`
                              : stage.hazardName}
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
                  disabled={startingMission}
                  className="font-arcade mt-6 h-12 w-full rounded-none bg-[#00f0ff] text-[9px] uppercase tracking-[0.08em] text-[#070814] shadow-[0_0_25px_#00f0ff25] hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-60"
                >
                  <Play /> {startingMission ? "Consultando bosses..." : "Iniciar misión"}
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
            <div className="mt-7 flex justify-end border-y border-cyan-500/15 py-4 lg:col-start-2">
              <p className="text-right text-[10px] uppercase leading-5 tracking-widest text-white/45">
                <span className="text-cyan-200/75">NAVE ACTIVA</span>
                <br />
                {selectedShip.name}
              </p>
            </div>
            <div className="lg:col-start-2">
              {notice ? (
                <p role="status" className="mt-4 text-xs uppercase tracking-widest text-cyan-200">
                  {notice}
                </p>
              ) : null}
            </div>
            {hangarTab === "UPGRADES" ? (
              <UpgradesSection
                progress={progress}
                onBuy={purchaseUpgrade}
                onChooseModule={chooseModule}
              />
            ) : hangarTab === "MISSIONS" ? (
              <MissionsSection
                progress={progress}
                hasVip={hasVip}
                onCommit={saveProgress}
                onNotice={flashNotice}
                onClaimed={() => Audio.SFX.levelUp?.()}
                onOpenVip={() => setVipModalOpen(true)}
              />
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
                                  className="shrink-0 text-[10px] font-bold text-[#ffd700]"
                                  aria-label={`Amenaza ${enemy.threat} de 5`}
                                >
                                  {enemy.threat}/5 ★
                                </span>
                              </div>
                              <p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.12em] text-white/40">
                                {enemy.family}
                              </p>
                              <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-white/45">
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
                                <p className="text-[10px] uppercase tracking-widest text-white/35">
                                  {label}
                                </p>
                                <p className="mt-0.5 text-xs font-bold tabular-nums text-cyan-100">
                                  {value}
                                </p>
                              </div>
                            ))}
                          </div>
                          <p
                            className={`mt-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.14em] ${kills ? "text-[#ff9ab9]" : "text-white/25"}`}
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
                              <p className="truncate text-[10px] uppercase tracking-[0.16em] text-[#c7a1ff]">
                                {boss.title}
                              </p>
                              <h3
                                className="mt-1 truncate text-sm font-black tracking-[0.1em]"
                                style={{ color: boss.color }}
                              >
                                {boss.name}
                              </h3>
                              <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-white/45">
                                {boss.desc}
                              </p>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 text-[10px] uppercase tracking-widest">
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
                          <p className="mt-1 text-[10px] text-white/35">
                            Umbrales de fase:{" "}
                            {boss.phases.map((phase) => `${Math.round(phase * 100)}%`).join(" · ")}
                          </p>
                          <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#ff9ab9]">
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
            ) : hangarTab === "INVENTORY" ? (
              <div className="mt-6 lg:col-start-2">
                <InventorySection
                  inventory={marketPilot?.inventory ?? []}
                  selectedShipId={progress.selectedShip}
                />
              </div>
            ) : hangarTab === "MARKET" ? (
              <div className="lg:col-start-2">
                <MarketSection
                  actions={{
                    pilotState: marketPilot,
                    ads: marketAds,
                    publicListings: marketListings,
                    listingPage: marketListingPage,
                    listingPages: marketListingPages,
                    history: marketHistory,
                    selectedShipId: progress.selectedShip,
                    isLoading: marketLoading,
                    error: marketError,
                    onPublish: publishMarketAd,
                    onToggleAd: toggleMarketAd,
                    onCancelAd: cancelMarketAd,
                    onLoadListings: loadMarketListings,
                    onBuy: buyMarketListing,
                    onReportPayment: reportMarketPayment,
                    onReleaseOrder: releaseMarketOrder,
                    onOpenDispute: openMarketDispute,
                    onCancelOrder: cancelMarketOrder,
                  }}
                />
              </div>
            ) : hangarTab === "ALLIANCE" ? (
              <AllianceProfile
                obsidian={marketPilot?.obsidian ?? null}
                onObsidianChange={(obsidian) =>
                  setMarketPilot((pilot) => (pilot ? { ...pilot, obsidian } : pilot))
                }
                bossHelpInvite={bossHelpInvite}
                onJoinBossHelp={() => void joinBossHelp()}
                onDismissBossHelp={dismissBossHelpInvite}
              />
            ) : (
              <div className="mt-6 space-y-8 lg:col-start-2">
                <section className="border border-cyan-500/20 bg-[#0b0d1c]/75 p-4 sm:p-6">
                  <h2 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-cyan-200">
                    IDENTIDAD DEL PILOTO
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-white/40">
                        PILOT ID
                      </p>
                      <p className="mt-2 break-all text-xs text-cyan-100">
                        {googlePlayer?.playerId}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-white/40">
                        CORREO PRIVADO DE ACCESO
                      </p>
                      <p className="mt-2 break-all text-xs text-white/60">{googlePlayer?.email}</p>
                    </div>
                  </div>
                  <form
                    className="mt-5 flex flex-col gap-3 sm:flex-row"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      if (!googlePlayer || profileSaving) return;
                      setProfileSaving(true);
                      try {
                        const response = await fetch("/api/auth/profile", {
                          method: "POST",
                          credentials: "same-origin",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({ displayName: profileNameDraft }),
                        });
                        const payload = (await response.json().catch(() => null)) as {
                          displayName?: string;
                          error?: string;
                        } | null;
                        if (!response.ok || !payload?.displayName) {
                          throw new Error(
                            payload?.error ?? "No se pudo guardar el nombre de usuario.",
                          );
                        }
                        setProfileName(payload.displayName);
                        setProfileNameDraft(payload.displayName);
                        setNotice("NOMBRE DE USUARIO GUARDADO");
                      } catch (error) {
                        setNotice(
                          error instanceof Error ? error.message : "No se pudo guardar el perfil.",
                        );
                      } finally {
                        setProfileSaving(false);
                      }
                    }}
                  >
                    <label className="min-w-0 flex-1">
                      <span className="mb-2 block text-[10px] uppercase tracking-widest text-white/45">
                        NOMBRE DE USUARIO (3–20 CARACTERES)
                      </span>
                      <input
                        value={profileNameDraft}
                        onChange={(event) => setProfileNameDraft(event.target.value)}
                        minLength={3}
                        maxLength={20}
                        pattern="[A-Za-zÀ-ÿ0-9_-]{3,20}"
                        autoComplete="nickname"
                        required
                        className="h-11 w-full border border-cyan-400/30 bg-[#070814] px-3 text-xs text-white outline-none focus:border-cyan-300"
                        placeholder="ELIGE TU NOMBRE"
                      />
                    </label>
                    <Button
                      type="submit"
                      disabled={profileSaving}
                      className="mt-auto h-11 rounded-none bg-[#00f0ff] px-5 text-[10px] font-bold uppercase text-[#070814] hover:bg-cyan-200"
                    >
                      {profileSaving ? "GUARDANDO..." : "GUARDAR NOMBRE"}
                    </Button>
                  </form>
                  <p className="mt-2 text-[10px] text-white/35">
                    El nombre será visible en el juego. Tu correo se conserva únicamente para
                    iniciar sesión.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleGoogleSignOut()}
                    disabled={googleConnecting}
                    className="mt-5 h-10 rounded-none border-[#ff6b95]/40 bg-[#ff6b95]/5 px-4 text-[10px] uppercase tracking-widest text-[#ff9ab9] hover:bg-[#ff6b95]/10"
                  >
                    CERRAR SESIÓN
                  </Button>
                </section>
                <ReferralProfile
                  onRedeemed={() => {
                    void Promise.all([
                      refreshAccountProgress(),
                      marketRequest<P2PPilotState>("/api/market/pilot-state"),
                    ])
                      .then(([, pilot]) => setMarketPilot(pilot))
                      .catch((error: unknown) => {
                        console.error("No se pudo actualizar el estado tras el canje:", error);
                        setNotice(
                          error instanceof Error
                            ? error.message
                            : "No se pudo actualizar el progreso del piloto.",
                        );
                      });
                  }}
                />
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
                        <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">
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
                          className="grid gap-3 border border-white/10 bg-[#0b0d1c]/75 p-3 text-[10px] sm:grid-cols-[1fr_1.2fr_auto] sm:items-center"
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
                      <p className="mt-3 text-xs uppercase tracking-[0.18em] text-white/45">
                        Aún no hay misiones registradas.
                      </p>
                      <p className="mt-2 text-[10px] uppercase tracking-wider text-cyan-100/35">
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
                    ? "Completa misiones diarias, semanales y desafíos para subir de nivel en el pase de temporada."
                    : hangarTab === "BESTIARY"
                      ? "Intel de combate recopilada en todos los sectores conocidos."
                      : hangarTab === "ARSENAL"
                        ? "Domina cada arma y su sinergia pasiva para desbloquear su evolución."
                        : hangarTab === "MARKET"
                          ? "Publica naves desbloqueadas y administra tus anuncios con obsidiana del juego."
                          : "Perfil del piloto, estadísticas e historial permanente de despliegues."}
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

        {googlePlayer && (screen === "MENU" || screen === "HANGAR" || screen === "SELECT") && (
          <GameChat />
        )}

        <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-cyan-500/15 pt-4 text-[9px] uppercase tracking-[0.18em] text-white/30">
          <span>
            SPACE SURVIVORS <span className="text-cyan-300/70">//</span> PROTOCOLO DE DEFENSA ACTIVO
          </span>

        </footer>
      </div>
      {bossHelpInvite ? (
        <div className="fixed bottom-5 right-5 z-50 w-[min(92vw,380px)] border border-fuchsia-300/60 bg-[#100b20]/95 p-4 shadow-[0_0_30px_#ff4df044]">
          <p className="font-arcade text-[10px] text-fuchsia-100">
            {bossHelpInvite.hostName} PIDE AYUDA
          </p>
          <p className="mt-2 text-xs text-white/75">
            {bossHelpInvite.bossName} · MUNDO {bossHelpInvite.world}
          </p>
          <div className="mt-4 flex gap-2">
            <Button
              className="flex-1 bg-fuchsia-700 text-white"
              onClick={() => void joinBossHelp()}
            >
              UNIRSE
            </Button>
            <Button
              variant="outline"
              className="border-white/20 text-white/70"
              onClick={dismissBossHelpInvite}
            >
              CERRAR
            </Button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

const TICKER_TYPE_COLOR: Record<string, string> = {
  NOTICIA: "#00f0ff",
  EVENTO: "#ffd700",
  MANTENIMIENTO: "#ff8a3d",
  TEMPORADA: "#c4a1ff",
};

type TickerAnnouncement = {
  id: string;
  title: string;
  type: string;
  message: string;
  color: string | null;
  created_at: number;
  updated_at: number;
};

/**
 * Tira de anuncios persistente: se desplaza de derecha a izquierda en la parte
 * superior y se mantiene mientras la administración no la retire. Usa tamaños en
 * rem (text-base / text-lg) para escalar correctamente con el zoom del navegador.
 */
function AnnouncementTicker({ className = "" }: { className?: string }) {
  const [items, setItems] = useState<TickerAnnouncement[]>([]);

  useEffect(() => {
    let active = true;
    const load = () => {
      fetch("/api/announcements", { credentials: "same-origin" })
        .then(async (response) => {
          if (!response.ok) return;
          const data = (await response.json()) as { announcements?: TickerAnnouncement[] };
          if (active) setItems(data.announcements ?? []);
        })
        .catch(() => undefined);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    load();
    const timer = window.setInterval(load, 10_000);
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (items.length === 0) return null;

  // Velocidad proporcional al contenido, con un mínimo para que sea legible.
  const duration = Math.max(28, items.length * 16);

  const renderSegment = (copy: boolean) => (
    <div className="flex shrink-0 items-center" aria-hidden={copy}>
      {items.map((item) => {
        const color = item.color ?? TICKER_TYPE_COLOR[item.type] ?? "#00f0ff";
        return (
          <span
            key={`${copy ? "copy" : "main"}-${item.id}`}
            className="flex shrink-0 items-center gap-3 whitespace-nowrap px-6"
          >
            <span
              className="px-2 py-0.5 text-xs font-bold uppercase tracking-wider"
              style={{ color, border: `1px solid ${color}88`, background: `${color}14` }}
            >
              {item.type}
            </span>
            <span className="text-base font-bold uppercase tracking-wide" style={{ color }}>
              {item.title}
            </span>
            <span className="text-base text-white/80">{item.message}</span>
            <span className="px-4 text-cyan-300/60" aria-hidden="true">
              ◆
            </span>
          </span>
        );
      })}
    </div>
  );

  return (
    <section
      aria-label="Anuncios importantes"
      className={`group overflow-hidden border-b border-cyan-400/30 bg-[#070814]/95 shadow-[0_2px_16px_rgba(0,240,255,0.08)] ${className}`}
    >
      <div
        className="flex w-max items-center py-2.5 group-hover:[animation-play-state:paused]"
        style={{ animation: `announcement-ticker ${duration}s linear infinite` }}
      >
        {renderSegment(false)}
        {renderSegment(true)}
      </div>
      <style>{`@keyframes announcement-ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
    </section>
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
        className="pointer-events-auto grid size-[70px] touch-none select-none place-items-center rounded-full border-2 border-[#ff0055] bg-[#ff0055]/20 text-[8px] font-black tracking-[0.14em] text-[#ff9ab9] shadow-[0_0_22px_#ff005544] transition active:scale-95 active:bg-[#ff0055]/35"
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
