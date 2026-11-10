import { useEffect, useRef, useState } from "react";
import { MessageCircle, Minus, Plus, Send, ZoomIn, ZoomOut } from "lucide-react";
import type { ChatMessage } from "@/chat/types";

const MAX_MESSAGE_LENGTH = 500;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 18;
const CHAT_FONT_SIZE_KEY = "space-survivors-chat-font-size";

type ChatAllianceInvite = {
  invite_id: string;
  alliance_name: string;
  tag: string;
  inviter_name: string;
};

export function GameChat() {
  const [language, setLanguage] = useState<"en" | "es">("es");
  const [fontSize, setFontSize] = useState(() => {
    if (typeof window === "undefined") return 9;
    try {
      const savedSize = Number(window.localStorage.getItem(CHAT_FONT_SIZE_KEY));
      return Number.isInteger(savedSize) && savedSize >= MIN_FONT_SIZE && savedSize <= MAX_FONT_SIZE
        ? savedSize
        : 9;
    } catch (error) {
      console.warn("No se pudo recuperar el tamaño de letra del chat:", error);
      return 9;
    }
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [connected, setConnected] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<{
    messageId: number;
    pilotId: string;
    callsign: string;
  } | null>(null);
  const [myPilotId, setMyPilotId] = useState("");
  const [canInvite, setCanInvite] = useState(false);
  const [chatNotice, setChatNotice] = useState("");
  const [allianceInvites, setAllianceInvites] = useState<ChatAllianceInvite[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const retryDelayRef = useRef(1000);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const refreshAlliance = async () => {
      try {
        const response = await fetch("/api/alliance/mine", { cache: "no-store" });
        const payload = (await response.json()) as {
          pilot_id?: string;
          alliance?: { role?: string } | null;
          invites?: ChatAllianceInvite[];
        };
        if (!response.ok) throw new Error("No se pudo consultar la alianza para el chat.");
        if (!active) return;
        setMyPilotId(payload.pilot_id ?? "");
        setCanInvite(payload.alliance?.role === "lider" || payload.alliance?.role === "teniente");
        setAllianceInvites(payload.invites ?? []);
      } catch (error) {
        if (active) console.error("No se pudo consultar el permiso de invitación del chat:", error);
      }
    };
    void refreshAlliance();
    const timer = window.setInterval(() => void refreshAlliance(), 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const respondToInvite = async (inviteId: string, action: "accept" | "reject") => {
    try {
      const response = await fetch(`/api/alliance/${action}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invite_id: inviteId }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "No se pudo responder la invitación.");
      setAllianceInvites((current) => current.filter((invite) => invite.invite_id !== inviteId));
      setChatNotice(action === "accept" ? "INVITACIÓN ACEPTADA" : "INVITACIÓN RECHAZADA");
    } catch (error) {
      setChatNotice(error instanceof Error ? error.message : "No se pudo responder la invitación.");
    }
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAT_FONT_SIZE_KEY, String(fontSize));
    } catch (error) {
      console.warn("No se pudo guardar el tamaño de letra del chat:", error);
    }
  }, [fontSize]);

  useEffect(() => {
    let active = true;
    let socket: WebSocket | null = null;
    setMessages([]);
    setConnected(false);

    const connect = () => {
      if (!active) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const currentSocket = new WebSocket(
        `${protocol}//${window.location.host}/api/chat/ws?language=${language}`,
      );
      socket = currentSocket;
      socketRef.current = currentSocket;

      currentSocket.addEventListener("open", () => {
        if (!active) return;
        retryDelayRef.current = 1000;
        setConnected(true);
      });
      currentSocket.addEventListener("message", (event) => {
        if (!active) return;
        try {
          const payload = JSON.parse(event.data) as {
            type?: string;
            messageId?: number;
          } & Partial<ChatMessage>;
          if (payload.type === "deleted" && typeof payload.messageId === "number") {
            setMessages((current) => current.filter((item) => item.id !== payload.messageId));
            return;
          }
          const message = payload as ChatMessage;
          if (
            typeof message.id !== "number" ||
            typeof message.pilotId !== "string" ||
            typeof message.callsign !== "string" ||
            typeof message.text !== "string" ||
            message.language !== language ||
            !["chat", "boss_kill"].includes(message.type)
          ) {
            return;
          }
          setMessages((current) => {
            if (current.some((item) => item.id === message.id)) return current;
            return [...current, message].slice(-200);
          });
        } catch (error) {
          console.error("No se pudo leer un mensaje del chat:", error);
        }
      });
      currentSocket.addEventListener("close", () => {
        if (!active) return;
        setConnected(false);
        if (socketRef.current === currentSocket) socketRef.current = null;
        reconnectTimerRef.current = window.setTimeout(connect, retryDelayRef.current);
        retryDelayRef.current = Math.min(retryDelayRef.current * 2, 30000);
      });
      currentSocket.addEventListener("error", () => currentSocket.close());
    };

    connect();
    return () => {
      active = false;
      if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
      socket?.close();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [language]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, minimized]);

  const participants = [...new Set(messages.map((message) => message.callsign))];
  const mentionStart = draft.lastIndexOf("@");
  const mentionQuery =
    mentionStart >= 0 && !/\s/.test(draft.slice(mentionStart + 1))
      ? draft.slice(mentionStart + 1).toLowerCase()
      : null;
  const mentionMatches =
    mentionQuery === null
      ? []
      : participants.filter((name) => name.toLowerCase().includes(mentionQuery)).slice(0, 5);

  const send = () => {
    const text = draft.trim();
    const socket = socketRef.current;
    if (!text || text.length > MAX_MESSAGE_LENGTH || socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "chat", language, text }));
    setDraft("");
  };

  const addMention = (callsign: string) => {
    if (mentionStart < 0) {
      setDraft(
        (current) => `${current}${current && !current.endsWith(" ") ? " " : ""}@${callsign} `,
      );
      return;
    }
    setDraft(`${draft.slice(0, mentionStart)}@${callsign} `);
  };

  return (
    <section
      aria-label="Chat multijugador"
      className="fixed bottom-4 left-4 z-[60] flex w-[340px] max-w-[calc(100vw-32px)] flex-col overflow-hidden border border-slate-600/70 bg-[#0f172a] font-sans text-slate-100 shadow-2xl"
      style={{ height: minimized ? "auto" : "400px" }}
    >
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-slate-700 px-3">
        <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider">
          <MessageCircle className="size-4 text-cyan-300" />
          {language === "en" ? "Global chat" : "Chat global"}
          <span
            className={`size-2 rounded-full ${connected ? "bg-emerald-400" : "bg-amber-400"}`}
          />
        </div>
        <div className="flex items-center gap-1">
          <button
            aria-label="Reducir tamaño de letra"
            className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white disabled:opacity-40"
            disabled={fontSize <= MIN_FONT_SIZE}
            onClick={() => setFontSize((size) => Math.max(MIN_FONT_SIZE, size - 1))}
            title="Reducir tamaño de letra"
            type="button"
          >
            <ZoomOut className="size-3.5" />
          </button>
          <button
            aria-label="Aumentar tamaño de letra"
            className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white disabled:opacity-40"
            disabled={fontSize >= MAX_FONT_SIZE}
            onClick={() => setFontSize((size) => Math.min(MAX_FONT_SIZE, size + 1))}
            title="Aumentar tamaño de letra"
            type="button"
          >
            <ZoomIn className="size-3.5" />
          </button>
          <button
            aria-label={minimized ? "Expandir chat" : "Minimizar chat"}
            className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
            onClick={() => setMinimized((value) => !value)}
            type="button"
          >
            {minimized ? <Plus className="size-4" /> : <Minus className="size-4" />}
          </button>
        </div>
      </header>
      {!minimized && (
        <>
          <nav aria-label="Idioma del chat" className="flex shrink-0 border-b border-slate-700">
            {(
              [
                ["en", "ENGLISH"],
                ["es", "ESPAÑOL"],
              ] as const
            ).map(([code, label]) => (
              <button
                aria-pressed={language === code}
                className={`flex-1 py-1.5 text-[9px] font-bold tracking-wider transition ${
                  language === code
                    ? "bg-cyan-900/50 text-cyan-200"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
                key={code}
                onClick={() => setLanguage(code)}
                type="button"
              >
                {label}
              </button>
            ))}
          </nav>
          {allianceInvites.map((invite) => (
            <div
              className="shrink-0 border-b border-fuchsia-400/30 bg-fuchsia-400/[0.06] px-3 py-2"
              key={invite.invite_id}
            >
              <p className="text-[10px]">
                Invitación: <b>{invite.alliance_name}</b>{" "}
                <span className="font-bold text-fuchsia-300">[{invite.tag}]</span> ·{" "}
                {invite.inviter_name}
              </p>
              <div className="mt-1 flex gap-2">
                <button
                  className="px-2 py-1 text-[9px] font-bold uppercase text-emerald-300 hover:bg-slate-800"
                  onClick={() => void respondToInvite(invite.invite_id, "accept")}
                  type="button"
                >
                  Aceptar
                </button>
                <button
                  className="px-2 py-1 text-[9px] font-bold uppercase text-rose-300 hover:bg-slate-800"
                  onClick={() => void respondToInvite(invite.invite_id, "reject")}
                  type="button"
                >
                  Rechazar
                </button>
              </div>
            </div>
          ))}
          <div
            aria-live="polite"
            className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2"
            ref={listRef}
            style={{ fontSize: `${fontSize}px`, lineHeight: `${Math.ceil(fontSize * 1.45)}px` }}
          >
            {messages.map((message) => (
              <p className="text-white" key={`${message.id}-${message.type}`}>
                <span className="relative mr-1 inline-block">
                  <button
                    className={
                      message.vip
                        ? "font-bold text-[#ffd700] hover:text-amber-300 drop-shadow-[0_0_8px_rgba(255,215,0,0.5)]"
                        : "font-semibold text-blue-400 hover:text-blue-300 hover:underline"
                    }
                    onClick={() =>
                      setSelectedPlayer((current) =>
                        current?.messageId === message.id
                          ? null
                          : {
                              messageId: message.id,
                              pilotId: message.pilotId,
                              callsign: message.callsign,
                            },
                      )
                    }
                    title={`Opciones de ${message.callsign}`}
                    type="button"
                  >
                    {message.callsign}
                  </button>
                  {message.vip ? (
                    <span className="ml-1 rounded border border-[#ffd700]/50 bg-[#ffd700]/15 px-1 py-px text-[8px] font-black uppercase text-[#ffd700] shadow-[0_0_6px_rgba(255,215,0,0.3)]">
                      VIP
                    </span>
                  ) : null}
                  {message.allianceTag ? (
                    <span className="ml-1 font-bold text-fuchsia-300">[{message.allianceTag}]</span>
                  ) : null}
                  {selectedPlayer?.messageId === message.id ? (
                    <span className="absolute left-0 top-full z-20 mt-1 flex min-w-36 flex-col border border-slate-600 bg-slate-800 p-1 shadow-xl">
                      {canInvite && message.pilotId !== myPilotId ? (
                        <button
                          className="px-2 py-1 text-left text-[10px] hover:bg-slate-700"
                          onClick={async () => {
                            try {
                              const response = await fetch("/api/alliance/invite", {
                                method: "POST",
                                credentials: "same-origin",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({ pilot_id: message.pilotId }),
                              });
                              const payload = (await response.json().catch(() => null)) as {
                                error?: string;
                              } | null;
                              if (!response.ok) {
                                throw new Error(
                                  payload?.error ?? "No se pudo enviar la invitación.",
                                );
                              }
                              setChatNotice(`INVITACIÓN ENVIADA A ${message.callsign}`);
                            } catch (error) {
                              setChatNotice(
                                error instanceof Error ? error.message : "No se pudo invitar.",
                              );
                            } finally {
                              setSelectedPlayer(null);
                            }
                          }}
                          type="button"
                        >
                          Invitar a alianza
                        </button>
                      ) : null}
                      <button
                        className="px-2 py-1 text-left text-[10px] hover:bg-slate-700"
                        onClick={() => {
                          addMention(message.callsign);
                          setSelectedPlayer(null);
                        }}
                        type="button"
                      >
                        Etiquetar (@usuario)
                      </button>
                      {message.type === "chat" && message.pilotId !== myPilotId ? (
                        <button
                          className="px-2 py-1 text-left text-[10px] text-rose-300 hover:bg-slate-700"
                          onClick={async () => {
                            const reason = window.prompt(
                              "¿Por qué quieres denunciar este mensaje?",
                            );
                            if (!reason?.trim()) return;
                            try {
                              const response = await fetch("/api/chat/report", {
                                method: "POST",
                                credentials: "same-origin",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({
                                  messageId: message.id,
                                  pilotId: message.pilotId,
                                  language: message.language,
                                  reason: reason.trim(),
                                }),
                              });
                              const payload = (await response.json().catch(() => null)) as {
                                error?: string;
                              } | null;
                              if (!response.ok)
                                throw new Error(payload?.error ?? "No se pudo enviar la denuncia.");
                              setChatNotice("DENUNCIA ENVIADA A MODERACIÓN");
                            } catch (error) {
                              setChatNotice(
                                error instanceof Error
                                  ? error.message
                                  : "No se pudo enviar la denuncia.",
                              );
                            } finally {
                              setSelectedPlayer(null);
                            }
                          }}
                          type="button"
                        >
                          Denunciar mensaje
                        </button>
                      ) : null}
                    </span>
                  ) : null}
                </span>
                <MessageText
                  text={
                    message.type !== "chat" && message.text.startsWith(`${message.callsign} `)
                      ? message.text.slice(message.callsign.length + 1)
                      : message.text
                  }
                />
              </p>
            ))}
          </div>
          {chatNotice ? (
            <p
              role="status"
              className="shrink-0 border-t border-slate-700 px-3 py-1 text-[9px] text-cyan-200"
            >
              {chatNotice}
            </p>
          ) : null}
          <form
            className="relative flex shrink-0 gap-2 border-t border-slate-700 p-2"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            {mentionMatches.length > 0 && (
              <div className="absolute bottom-full left-2 mb-1 flex max-h-28 flex-col overflow-y-auto border border-slate-600 bg-slate-800 p-1 shadow-xl">
                {mentionMatches.map((name) => (
                  <button
                    className="px-2 py-1 text-left text-[10px] hover:bg-slate-700"
                    key={name}
                    onClick={() => addMention(name)}
                    type="button"
                  >
                    @{name}
                  </button>
                ))}
              </div>
            )}
            <input
              aria-label="Escribe un mensaje"
              className="min-w-0 flex-1 bg-slate-900 px-2 py-1.5 outline-none placeholder:text-slate-500 focus:ring-1 focus:ring-cyan-500"
              maxLength={MAX_MESSAGE_LENGTH}
              onChange={(event) => setDraft(event.target.value)}
              style={{ fontSize: `${fontSize}px` }}
              placeholder={
                connected
                  ? language === "en"
                    ? "Write a message or @..."
                    : "Escribe un mensaje o @..."
                  : language === "en"
                    ? "Reconnecting..."
                    : "Reconectando..."
              }
              value={draft}
            />
            <button
              aria-label="Enviar mensaje"
              className="rounded bg-cyan-700 px-2 text-white hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!connected || !draft.trim()}
              type="submit"
            >
              <Send className="size-4" />
            </button>
          </form>
        </>
      )}
    </section>
  );
}

function MessageText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(@[\p{L}\p{N}_-]+)/u).map((part, index) =>
        part.startsWith("@") ? (
          <span className="font-semibold text-cyan-300" key={`${index}-${part}`}>
            {part}
          </span>
        ) : (
          <span key={`${index}-${part}`}>{part}</span>
        ),
      )}
    </>
  );
}
