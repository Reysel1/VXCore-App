# Contribuir

Gracias por querer mejorar VXCore.

## Preparar el entorno

```bash
npm ci
npm --prefix agent ci
npm --prefix fiveos-nui ci
npm --prefix agent run dev
npm run dev
```

## Antes de abrir un pull request

```bash
npm run lint
npm run typecheck
npm test
npm run i18n:check
npm run build
```

- Un cambio por pull request, con una descripción de qué arregla o añade.
- Si tocas el control de acceso del agente (`agent/src/access.ts`, guardias de `index.ts`), añade una prueba en `agent/src/*.test.ts`.
- No subas ficheros de datos del agente (`discord-config.json`, `tunnel.json`…) ni `.env`.
- Las vulnerabilidades no van por issues: sigue [SECURITY.md](SECURITY.md).

## Estilo

- TypeScript estricto en el panel y en el agente.
- Textos de la interfaz en español, envueltos en `t()`, con su traducción en los cinco idiomas.
- Nombres claros antes que comentarios.
