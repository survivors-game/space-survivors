import { useEffect, useRef, useState } from "react";
import { MessageCircle, Minus, Plus, Send } from "lucide-react";
import type { ChatMessage } from "@/chat/chat-room";

const MAX_MESSAGE_LENGTH = 500;

export function GameChat() {
  const [language, setLanguage] = useState<"en" | "es">("es");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [connected, setConnected] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const retryDelayRef = useRef(1000);
  const listRef = useRef<HTMLDivElement>(null);

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
          const message = JSON.parse(event.data) as ChatMessage;
          if (
            typeof message.id !== "number" ||
            typeof message.callsign !== "string" ||
            typeof message.text !== "string" ||
            message.language !== language ||
            !["chat", "boss_kill", "drop"].includes(message.type)
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
        <button
          aria-label={minimized ? "Expandir chat" : "Minimizar chat"}
          className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
          onClick={() => setMinimized((value) => !value)}
          type="button"
        >
          {minimized ? <Plus className="size-4" /> : <Minus className="size-4" />}
        </button>
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
          <div
            aria-live="polite"
            className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2 text-[9px] leading-4"
            ref={listRef}
          >
            {messages.map((message) => (
              <p className="text-white" key={`${message.id}-${message.type}`}>
                <button
                  className="mr-1 text-[9px] font-semibold text-blue-400 hover:text-blue-300 hover:underline"
                  onClick={() => addMention(message.callsign)}
                  title={`Mencionar a ${message.callsign}`}
                  type="button"
                >
                  {message.callsign}
                </button>
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
              className="min-w-0 flex-1 bg-slate-900 px-2 py-1.5 text-[9px] outline-none placeholder:text-slate-500 focus:ring-1 focus:ring-cyan-500"
              maxLength={MAX_MESSAGE_LENGTH}
              onChange={(event) => setDraft(event.target.value)}
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
