<div align="center">

<img width="1500" height="500" alt="1500x500" src="https://github.com/user-attachments/assets/6bac3d75-5233-416b-9fb7-852dee559344" />
# VXCore

Open source control panel for FiveM, RedM and Open77 servers.

[![CI](https://github.com/Reysel1/VXCore-App/actions/workflows/ci.yml/badge.svg)](https://github.com/Reysel1/VXCore-App/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Reysel1/VXCore-App/actions/workflows/codeql.yml/badge.svg)](https://github.com/Reysel1/VXCore-App/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Reysel1/VXCore-App/badge)](https://scorecard.dev/viewer/?uri=github.com/Reysel1/VXCore-App)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

## What it does

- Starts, stops and restarts the server with a live console, logs and diagnostics.
- Creates a server from scratch or imports an existing one from its `server.cfg`.
- Connected players, history, identifiers, screen view and sanctions (ban, kick, warn) that are also enforced when players join.
- Resources: start, stop, install from GitHub and edit files with a built-in editor.
- The server's MySQL/MariaDB database: tables, queries and player profiles.
- Discord login, roles and invite links for staff, with per-section permissions.
- Automations, a task board, a GitHub-connected changelog and in-game announcements.
- AI assistant (Anthropic, Ollama or any OpenAI-compatible API) that reads your resources and proposes changes.
- In-game staff menu (F5) written in React, with the same permissions as the panel.
- Interface in Spanish, English, Portuguese, French and German.
- Windows desktop app with automatic updates.

## Architecture

| Component | Folder | Technology |
| --- | --- | --- |
| Panel | `src/` | Next.js 16, React 19, Tailwind |
| Agent | `agent/` | Node.js, Express 5, Socket.IO |
| Desktop | `desktop/` | Electron |
| In-game resource | `vxcore/` | Lua |
| In-game menu | `fiveos-nui/` | React + Vite, built into `vxcore/source/nui/assets` |

The panel never touches the disk or processes directly: everything goes through the agent, which runs on the same machine as the game server and only listens on `127.0.0.1` unless configured otherwise.

## Installation

### Windows

Download `VXCore-Setup-<version>.exe` from [Releases](https://github.com/Reysel1/VXCore-App/releases) and run it. The installer includes the panel, the agent, the in-game resource and `cloudflared`; you don't need Node installed.

Every release publishes its SHA-256 checksums and a GitHub provenance attestation, so you can verify that the installer was built from this repository:

```bash
gh attestation verify VXCore-Setup-<version>.exe --repo Reysel1/VXCore-App
```

### From source

Requirements: Node.js 22 or later.

```bash
git clone https://github.com/Reysel1/VXCore-App.git
cd VXCore-App
npm ci
npm --prefix agent ci
npm --prefix fiveos-nui ci
cp agent/.env.example agent/.env

npm --prefix agent run dev   # agent at http://localhost:4000
npm run dev                  # panel at http://localhost:3000
```

### In-game resource

The panel installs it from *Settings → Agent & In-Game*. To do it manually, copy `vxcore` into your server's `resources` folder and add this to `server.cfg`:

```cfg
ensure vxcore
set vxcore_agent_url "http://localhost:4000"
```

The `vxcore.menu` permission is granted to `group.admin` when the resource starts. If you change the menu, rebuild it with `npm run nui:build`.

## Configuration

Everything can be configured from the panel. Anything you set in `agent/.env` takes precedence and is locked in the interface.

| Variable | Purpose |
| --- | --- |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Discord OAuth2 application |
| `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` | Discord bot and server for roles and status |
| `FIVEOS_PUBLIC_URL` | Public address of the agent (Discord redirect URI) |
| `FIVEOS_ALLOWED_ORIGINS` | Extra origins allowed to use the agent |
| `HOST`, `PORT` | Agent address and port (`127.0.0.1:4000`) |
| `FIVEOS_GAME_KEY` | Key for game servers running on another machine |
| `FIVEOS_TUNNEL_HOSTNAME`, `FIVEOS_TUNNEL_CREDENTIALS` | Your own Cloudflare tunnel |
| `FXSERVER_BIN` | Path to `FXServer.exe` if it isn't detected automatically |

If the game server runs on another machine, set `FIVEOS_GAME_KEY` on the agent and the same key in `server.cfg` with `set vxcore_agent_key "..."`. Use `set`, not `setr`, so it isn't sent to clients.

## Remote access

VXCore can expose the panel through a Cloudflare tunnel, without opening any ports. You need a free Cloudflare account with a domain:

```bash
cloudflared tunnel login
cloudflared tunnel create vxcore
cloudflared tunnel route dns vxcore panel.yourdomain.com
```

Then, in *Settings → Remote access*, paste the domain and the contents of the `.json` file that `cloudflared` created. The tunnel won't start until a Discord account is linked and login is required.

## Security

- Sessions signed with HMAC-SHA256 and constant-time comparison, including on the live channel.
- Access control by level (owner, admin, moderator) and by section on every route, on the live channel and in the in-game menu.
- `Origin` and `Host` checks against CSRF and DNS rebinding.
- File paths restricted to registered servers, with no escaping through `..` or symbolic links.
- Moderators never receive the `server.cfg` or the database credentials.
- Login attempt rate limiting.
- Electron with `contextIsolation`, without `nodeIntegration` and with a minimal IPC surface.
- CodeQL, Dependabot and `npm audit` on every change.

To report a vulnerability, read [SECURITY.md](SECURITY.md).

## Development

| Command | What it does |
| --- | --- |
| `npm run dev` | Panel in development mode |
| `npm --prefix agent run dev` | Agent in development mode |
| `npm run lint` | ESLint |
| `npm run typecheck` | Panel type checking |
| `npm test` | Agent tests |
| `npm run i18n:check` | Checks that all translations are complete |
| `npm run build` | Builds the panel |
| `npm run nui:build` | Builds the in-game menu into `vxcore/source/nui/assets` |
| `npm run desktop:build` | Generates the Windows installer in `dist-desktop/` |

To publish a release, bump the version in `package.json` and create a tag:

```bash
git tag v0.10.41
git push origin v0.10.41
```

The `release` workflow builds the in-game menu and the installer, generates the provenance attestation and publishes everything to Releases along with `latest.yml`, which is what the app's updater reads.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

[MIT](LICENSE)
