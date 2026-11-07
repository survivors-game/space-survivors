export class DurableObject {
  constructor(_ctx: unknown, _env: unknown) {}
}

export class WebSocketRequestResponsePair {
  constructor(
    readonly request: string,
    readonly response: string,
  ) {}
}
