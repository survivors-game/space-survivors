export type ChatLanguage = "en" | "es";

export type ChatMessageType = "chat" | "boss_kill" | "drop";

export interface ChatMessage {
  id: number;
  type: ChatMessageType;
  language: ChatLanguage;
  pilotId: string;
  callsign: string;
  allianceTag?: string | null;
  text: string;
  timestamp: number;
}
