declare module "cloudflare:workers" {
  export interface SqlStorageCursor<T> {
    toArray(): T[];
  }

  export interface DurableObjectState {
    storage: {
      get<T = unknown>(key: string): Promise<T | undefined>;
      put<T>(key: string, value: T): Promise<void>;
      setAlarm(scheduledTime: number | Date): Promise<void>;
      sql: {
        exec<T = Record<string, unknown>>(
          query: string,
          ...bindings: (string | number | null)[]
        ): SqlStorageCursor<T>;
      };
    };
    acceptWebSocket(socket: WebSocket): void;
    getWebSockets(): WebSocket[];
  }

  export class DurableObject<Env = unknown> {
    protected ctx: DurableObjectState;
    protected env: Env;
    constructor(ctx: DurableObjectState, env: Env);
  }
}

interface WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}

declare const WebSocketPair: {
  new (): WebSocketPair;
};

interface ResponseInit {
  webSocket?: WebSocket;
}
