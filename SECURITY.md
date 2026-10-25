# Security policy

## Supported versions

Only the latest published version receives security patches. The desktop app updates itself.

| Version | Supported |
| ------- | ------- |
| Latest release | Yes |
| Older | No |

## Reporting a vulnerability

Don't open a public issue. Use GitHub's private advisory: the **Security → Report a vulnerability** tab of this repository.

If you can, include:

- Which part is affected: panel, agent, desktop app or in-game resource.
- Steps to reproduce it and what access is required (no session, moderator, admin…).
- Whether it requires remote access to be enabled or also works locally.

You'll get a reply within 7 days. If it's confirmed, the fix ships in a release and you're credited in the notes, unless you prefer otherwise.

## Scope

The agent launches processes, reads and writes files, and stores MySQL, Discord and AI provider credentials. Top priority is given to any flaw that allows someone who isn't the panel owner to:

- run programs or commands on the agent's machine,
- read or write files outside the registered servers,
- obtain a session with a higher level than the one granted,
- read the console or server data through remote access without a session.

## Trust model

- **Owner**: the Discord account that linked the panel from the machine itself. Full control.
- **Admin**: can edit and start server resources. A FiveM resource can run code on the machine, so only give this level to people you fully trust.
- **Moderator**: players, sanctions and read-only access.

By default the agent only listens on `127.0.0.1`. If you expose it with `HOST=0.0.0.0`, do it behind HTTPS and with Discord login required.

## Automated measures

- [CodeQL](.github/workflows/codeql.yml) analyzes every push and pull request.
- [Dependabot](.github/dependabot.yml) checks dependencies and actions every week.
- [OpenSSF Scorecard](.github/workflows/scorecard.yml) evaluates the repository's practices.
- Releases include SHA-256 checksums and a provenance attestation (`gh attestation verify`).
