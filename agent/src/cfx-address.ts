const NUCLEUS_RE = /\b([a-z0-9][a-z0-9-]*\.users\.cfx\.re)\b/i;

const JOIN_RE = /\bcfx\.re\/join\/([a-z0-9]+)\b/i;

const PRIVATE_HOST_RE =
  /^(127\.|0\.0\.0\.0$|localhost$|::1$|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i;

export class CfxAddress {
  private nucleus: string | null = null;
  private joinCode: string | null = null;

  observe(line: string): void {
    if (!this.nucleus) {
      const match = line.match(NUCLEUS_RE);
      if (match) {
        this.nucleus = match[1];
        console.log(`[FiveOS Agent] Dirección pública del servidor: ${match[1]}`);
      }
    }
    if (!this.joinCode) {
      const match = line.match(JOIN_RE);
      if (match) {
        this.joinCode = match[1];
        console.log(`[FiveOS Agent] Enlace de conexión: cfx.re/join/${match[1]}`);
      }
    }
  }

  reset(): void {
    this.nucleus = null;
    this.joinCode = null;
  }

  shareable(fallbackIp?: string | null): string | null {
    if (this.joinCode) return `cfx.re/join/${this.joinCode}`;
    if (this.nucleus) return this.nucleus;

    const raw = String(fallbackIp || '').trim();
    if (!raw) return null;
    const host = raw.split(':')[0];
    return PRIVATE_HOST_RE.test(host) ? null : raw;
  }
}
