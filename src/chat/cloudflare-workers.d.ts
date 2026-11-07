declare module "cloudflare:workers" {
  export interface SqlStorageCursor<T> {
    toArray(): T[];
  }

  export interface DurableObjectState {
    storage: {
      sql: {
        exec<T = Record<string, unknown>>(
          query: string,
          ...bindings: (string | number | null)[]
        ): SqlStorageCursor<T>;
      };
    };
    acceptWebSocket(socket: WebSocket): void;
    getWebSockets(): WebSocket[];
    setWebSocketAutoResponse(pair: WebSocketRequestResponsePair): void;
  }

  export class WebSocketRequestResponsePair {
    constructor(request: string, response: string);
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
