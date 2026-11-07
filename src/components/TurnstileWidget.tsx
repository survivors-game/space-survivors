import { useEffect, useRef } from "react";

const TURNSTILE_SITE_KEY = "0x4AAAAAAF3_cGCrnDqEPxfr";

interface TurnstileOptions {
  sitekey: string;
  action: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
}

interface TurnstileApi {
  render(element: HTMLElement, options: TurnstileOptions): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function TurnstileWidget({ onToken }: { onToken: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let active = true;
    let timeout: number | undefined;
    let widgetId: string | undefined;
    let attempts = 0;

    const renderWidget = () => {
      if (!active) return;
      if (!window.turnstile || !containerRef.current) {
        attempts += 1;
        if (attempts < 100) {
          timeout = window.setTimeout(renderWidget, 100);
        } else {
          console.error("El script de Turnstile no estuvo disponible.");
        }
        return;
      }

      widgetId = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        action: "login",
        callback: (token) => onTokenRef.current(token),
        "expired-callback": () => onTokenRef.current(""),
        "error-callback": () => onTokenRef.current(""),
      });
    };

    renderWidget();
    return () => {
      active = false;
      if (timeout !== undefined) window.clearTimeout(timeout);
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
      onTokenRef.current("");
    };
  }, []);

  return (
    <div
      aria-label="Verificación de seguridad"
      className="flex min-h-[66px] justify-center"
      data-sitekey={TURNSTILE_SITE_KEY}
      ref={containerRef}
    />
  );
}
