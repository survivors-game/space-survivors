import { useEffect, useState } from "react";
import { spriteUrl } from "@/game/sprites";

/** Sprite del juego dentro de la wiki. Si no existe o aún no carga, muestra un punto de color. */
export function WikiSprite({
  id,
  size = 56,
  color = "#00f0ff",
}: {
  id: string;
  size?: number;
  color?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    try {
      setSrc(spriteUrl(id, 3));
    } catch {
      setSrc(null);
    }
  }, [id]);
  return (
    <span
      className="grid shrink-0 place-items-center border bg-black/50"
      style={{ width: size, height: size, borderColor: `${color}66` }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="max-h-[78%] max-w-[78%] object-contain [image-rendering:pixelated]"
        />
      ) : (
        <span className="size-2" style={{ background: color }} />
      )}
    </span>
  );
}
