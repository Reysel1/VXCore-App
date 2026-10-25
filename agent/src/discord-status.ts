import WebSocket from 'ws';
import { loadDiscordConfig, saveDiscordConfig, publicBaseUrl } from './discord';
import { tr } from './idioma';

const API = 'https://discord.com/api/v10';

const COLOR_ONLINE = 0x22c55e;
const COLOR_OFFLINE = 0xef4444;

export interface ServerSnapshot {
  name: string;
  online: boolean;
  managed: boolean;
  players: number;
  maxPlayers: number;
  uptime: string | null;
  address?: string;
}

export async function fetchPlayerCount(ip?: string, port?: string | number): Promise<number> {
  const host = (ip || '127.0.0.1').replace(/:\d+$/, '');
  const gamePort = port || (ip && ip.includes(':') ? ip.split(':')[1] : '30120');

  try {
    const res = await fetch(`http://${host}:${gamePort}/players.json`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return 0;
    const players = await res.json();
    return Array.isArray(players) ? players.length : 0;
  } catch {
    return 0;
  }
}

function buildEmbed(snapshot: ServerSnapshot) {
  const fields: { name: string; value: string; inline: boolean }[] = [
    {
      name: tr('Estado'),
      value: snapshot.online ? '🟢 En línea' : '🔴 Desconectado',
      inline: true,
    },
    {
      name: tr('Jugadores'),
      value: snapshot.online ? `${snapshot.players}/${snapshot.maxPlayers}` : '—',
      inline: true,
    },
  ];

  if (snapshot.online && snapshot.uptime) {
    fields.push({ name: 'Activo desde hace', value: snapshot.uptime, inline: true });
  }
  if (snapshot.address) {
    fields.push({ name: 'Conectar', value: `\`connect ${snapshot.address}\``, inline: false });
  }

  const embed: Record<string, unknown> = {
    title: snapshot.name,
    color: snapshot.online ? COLOR_ONLINE : COLOR_OFFLINE,
    fields,
    footer: { text: 'VXCore' },
    timestamp: new Date().toISOString(),
  };

  const banner = publicBannerUrl();
  if (banner) embed.image = { url: banner };

  return embed;
}

function publicBannerUrl(): string | null {
  const base = publicBaseUrl(loadDiscordConfig()).trim().replace(/\/+$/, '');
  if (!base) return null;
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(base)) return null;
  return `${base}/api/branding/banner.png`;
}

export async function publishStatus(snapshot: ServerSnapshot): Promise<void> {
  const config = loadDiscordConfig();
  if (!config.botToken || !config.statusChannelId) return;

  const headers = {
    Authorization: `Bot ${config.botToken}`,
    'Content-Type': 'application/json',
  };
  const body = JSON.stringify({ embeds: [buildEmbed(snapshot)] });

  if (config.statusMessageId) {
    const res = await fetch(
      `${API}/channels/${config.statusChannelId}/messages/${config.statusMessageId}`,
      { method: 'PATCH', headers, body }
    );
    if (res.ok) return;

    if (res.status !== 404) {
      throw new Error(tr('Discord devolvió {status} al editar el mensaje de estado.', { status: res.status }));
    }
  }

  const created = await fetch(`${API}/channels/${config.statusChannelId}/messages`, {
    method: 'POST',
    headers,
    body,
  });

  if (!created.ok) {
    const detail = await created.text().catch(() => '');
    throw new Error(
      created.status === 403
        ? tr('El bot no puede escribir en ese canal. Dale permiso de "Enviar mensajes" e "Insertar enlaces".')
        : tr('Discord devolvió {status} al publicar el estado. {detail}', { status: created.status, detail })
    );
  }

  const message = (await created.json()) as { id: string };
  saveDiscordConfig({ statusMessageId: message.id });
}

interface GatewayPayload {
  op?: number;
  s?: number | null;
  d?: { heartbeat_interval?: number } | null;
}

class PresenceGateway {
  private socket: WebSocket | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private sequence: number | null = null;
  private current: string | null = null;
  private closing = false;
  private retryMs = 5000;

  constructor(private token: string) {}

  connect(): void {
    if (this.socket) return;

    this.closing = false;
    this.socket = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');

    this.socket.on('message', (raw) => {
      let payload: GatewayPayload;
      try {
        payload = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (payload.s !== null && payload.s !== undefined) this.sequence = payload.s;

      if (payload.op === 10) {
        const interval = payload.d?.heartbeat_interval ?? 41250;
        this.heartbeat = setInterval(() => this.send({ op: 1, d: this.sequence }), interval);
        this.send({
          op: 2,
          d: {
            token: this.token,
            intents: 0,
            properties: { os: process.platform, browser: 'VXCore', device: 'VXCore' },
            presence: this.presencePayload(this.current ?? tr('Iniciando...')),
          },
        });
      }
    });

    this.socket.on('close', () => this.scheduleReconnect());
    this.socket.on('error', (err: Error) => {
      console.warn('[Discord] Gateway:', err.message);
    });
  }

  private scheduleReconnect(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.socket = null;
    if (this.closing) return;

    setTimeout(() => this.connect(), this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, 60_000);
  }

  private presencePayload(text: string) {
    return {
      since: null,
      activities: [{ name: text, type: 3 }],
      status: 'online',
      afk: false,
    };
  }

  private send(payload: unknown): void {
    try {
      if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(payload));
    } catch {}
  }

  setActivity(text: string): void {
    if (text === this.current) return;
    this.current = text;
    this.retryMs = 5000;
    this.send({ op: 3, d: this.presencePayload(text) });
  }

  disconnect(): void {
    this.closing = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    try {
      this.socket?.close();
    } catch {}
    this.socket = null;
  }
}

let gateway: PresenceGateway | null = null;

export function updatePresence(snapshot: ServerSnapshot): void {
  const config = loadDiscordConfig();

  if (!config.botToken || !config.presenceEnabled) {
    gateway?.disconnect();
    gateway = null;
    return;
  }

  if (!gateway) {
    gateway = new PresenceGateway(config.botToken);
    gateway.connect();
  }

  gateway.setActivity(
    snapshot.online ? tr('{players}/{maxPlayers} jugadores', { players: snapshot.players, maxPlayers: snapshot.maxPlayers }) : tr('Servidor apagado')
  );
}
