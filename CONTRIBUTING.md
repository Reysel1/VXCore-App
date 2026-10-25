# Contributing

Thanks for wanting to improve VXCore.

## Setting up the environment

```bash
npm ci
npm --prefix agent ci
npm --prefix fiveos-nui ci
npm --prefix agent run dev
npm run dev
```

## Before opening a pull request

```bash
npm run lint
npm run typecheck
npm test
npm run i18n:check
npm run build
```

- One change per pull request, with a description of what it fixes or adds.
- If you touch the agent's access control (`agent/src/access.ts`, guards in `index.ts`), add a test in `agent/src/*.test.ts`.
- Don't commit agent data files (`discord-config.json`, `tunnel.json`…) or `.env`.
- Vulnerabilities don't go through issues: follow [SECURITY.md](SECURITY.md).

## Style

- Strict TypeScript in the panel and the agent.
- Interface strings are written in Spanish, wrapped in `t()`, with their translation in all five languages.
- Clear names over comments.
