# Space Survivors

el ZIP es la base sobre la que debes construir SPACE SURVIVORS.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/042beac0-c519-4507-ac61-f57a1fd6427d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Mercado P2P

El mercado usa la sesión nativa del piloto y la base D1 del Worker; no requiere
una wallet. El esquema se crea automáticamente al atender la primera solicitud
del mercado. El inventario vendible se sincroniza desde las naves desbloqueadas
en el progreso local; los consumibles actuales solo existen durante una partida
y no forman parte del inventario permanente.

El endpoint administrativo de acreditación de obsidiana permanece deshabilitado
hasta configurar el secreto del Worker:

```sh
npx wrangler secret put ADMIN_SECRET
```

Un paquete administrativo acredita 10 OBS. No hay integración de pagos real.
