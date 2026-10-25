export interface GameTelemetry {
  players: number;
  maxClients: number;
  resources: number;
  lastHeartbeat: string | null;
}

export interface LivePlayer {
  id: string | number;
  name?: string;
  ping?: number;
  identifiers?: string[];
  license?: string;
  discord?: string;
  ip?: string;
  isOnline?: boolean;
  job?: string;
  jobGrade?: string;
  gang?: string;
  cash?: number;
  bank?: number;
  health?: number;
  armor?: number;
  citizenid?: string;
  coords?: { x: number; y: number; z: number };
  [key: string]: unknown;
}

export interface ConnectingPlayer {
  name: string;
  since: string;
}

const CONNECTING_STALE_MS = 90_000;

export class GameState {
  telemetry: GameTelemetry = { players: 0, maxClients: 64, resources: 0, lastHeartbeat: null };

  players: LivePlayer[] = [];

  readonly connecting = new Map<string, ConnectingPlayer>();

  heartbeatAgeMs(): number | null {
    if (!this.telemetry.lastHeartbeat) return null;
    return Date.now() - new Date(this.telemetry.lastHeartbeat).getTime();
  }

  connectingList(): (ConnectingPlayer & { key: string; seconds: number })[] {
    this.sweepConnecting();
    const now = Date.now();
    return [...this.connecting.entries()].map(([key, entry]) => ({
      key,
      name: entry.name,
      since: entry.since,
      seconds: Math.floor((now - new Date(entry.since).getTime()) / 1000),
    }));
  }

  private sweepConnecting(): void {
    const now = Date.now();
    for (const [key, entry] of this.connecting) {
      if (now - new Date(entry.since).getTime() > CONNECTING_STALE_MS) this.connecting.delete(key);
    }
  }
}
